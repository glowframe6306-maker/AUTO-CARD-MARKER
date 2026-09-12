import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";
import { runOcr, extractOcrFields, assessConfidence } from "../utils/ocr";
import { PaymentStatus } from "@prisma/client";

const router = Router();
const uploadBase = process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads/secure");
fs.mkdirSync(uploadBase, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadBase),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const accepted = ["image/jpeg", "image/png", "image/webp"];
    if (!accepted.includes(file.mimetype)) return cb(new Error("Invalid file type."));
    cb(null, true);
  },
});

router.use(authenticate);

// Member submits a payment request with card upload (multipart)
router.post("/", upload.single("card"), async (req: AuthorizedRequest, res) => {
  try {
    const { month, amount, note } = req.body;
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!month || !amount) return res.status(400).json({ error: "Missing required fields." });

    const member = await prisma.memberProfile.findUnique({ where: { userId: req.user.id } });
    if (!member) return res.status(404).json({ error: "Member profile not found." });

    const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
    if (!year) return res.status(400).json({ error: "No current academic year configured." });

    const requestedMonth = Number(month);
    const amountNum = Number(amount);

    // Check existing payment for month
    const existingPayment = await prisma.payment.findFirst({ where: { memberId: member.id, academicYearId: year.id, month: requestedMonth } });
    if (existingPayment) return res.status(409).json({ error: "This month is already paid." });

    // Prevent duplicate pending requests for same month
    const existingRequest = await prisma.paymentRequest.findFirst({ where: { memberId: member.id, academicYearId: year.id, requestedMonth, status: { in: ["PENDING_REVIEW", "AWAITING_MANUAL_SELECTION"] } } });
    if (existingRequest) return res.status(409).json({ error: "A payment request for this month is already pending review." });

    let cardUploadRecord: any = null;
    let ocrRecord: any = null;
    if (req.file) {
      cardUploadRecord = await prisma.cardUpload.create({ data: { uploaderId: req.user.id, memberId: member.id, originalName: req.file.originalname, filePath: req.file.path, status: "PENDING_REVIEW" } });
      const rawText = await runOcr(req.file.path);
      const fields = extractOcrFields(rawText);
      const confidence = assessConfidence(fields);
      ocrRecord = await prisma.ocrResult.create({ data: { cardUploadId: cardUploadRecord.id, detectedName: fields.detectedName, detectedMonth: fields.detectedMonth ? convertMonth(fields.detectedMonth) : null, detectedAmount: fields.detectedAmount, detectedDate: fields.detectedDate ? new Date(fields.detectedDate) : null, confidence, rawText, status: confidence >= 0.9 ? "AUTO_APPROVED" : "REVIEW" } });
    }

    const request = await prisma.paymentRequest.create({
      data: {
        memberId: member.id,
        academicYearId: year.id,
        requestedMonth,
        amount: amountNum,
        fullName: member.fullName,
        grade: member.grade,
        note: note || null,
        cardUploadId: cardUploadRecord ? cardUploadRecord.id : undefined,
        ocrResultId: ocrRecord ? ocrRecord.id : undefined,
        status: "PENDING_REVIEW",
      },
    });

    await prisma.notification.create({
      data: {
        recipientId: req.user.id,
        type: "PAYMENT_PENDING",
        title: "Payment Pending",
        message: `Your payment request for ${monthName(requestedMonth)} month is pending review.`,
        metadata: { requestId: request.id },
      },
    });

    return res.status(201).json({ request, cardUpload: cardUploadRecord, ocr: ocrRecord });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

function convertMonth(value: string) {
  const map: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return map[value.trim().toLowerCase()] || null;
}

// Owner: list pending requests for review
router.get("/review", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req: AuthorizedRequest, res) => {
  const rows = await prisma.paymentRequest.findMany({
    where: { status: "PENDING_REVIEW" },
    include: {
      cardUpload: true,
      ocrResult: true,
      member: {
        include: {
          user: {
            select: {
              accountId: true,
              fullName: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });
  return res.json(rows);
});

// Owner: deny request
router.post("/:id/deny", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req: AuthorizedRequest, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const reqRec = await prisma.paymentRequest.findUnique({ where: { id: Number(id) }, include: { member: true } });
  if (!reqRec) return res.status(404).json({ error: "Request not found." });
  await prisma.paymentRequest.update({ where: { id: reqRec.id }, data: { status: "DENIED", reviewedById: req.user!.id, reviewedAt: new Date(), reviewerNotes: reason || null } });
  await prisma.notification.create({ data: { recipientId: reqRec.member!.userId, type: "PAYMENT_CANCELLED", title: "Payment Cancelled", message: `Your payment request for ${monthName(reqRec.requestedMonth)} month was cancelled.`, metadata: { requestId: reqRec.id } } });
  return res.json({ success: true });
});

// Owner: allow request (moves to awaiting manual selection)
router.post("/:id/allow", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req: AuthorizedRequest, res) => {
  const { id } = req.params;
  const reqRec = await prisma.paymentRequest.findUnique({ where: { id: Number(id) } });
  if (!reqRec) return res.status(404).json({ error: "Request not found." });
  await prisma.paymentRequest.update({ where: { id: reqRec.id }, data: { status: "AWAITING_MANUAL_SELECTION", reviewedById: req.user!.id, reviewedAt: new Date() } });
  return res.json({ success: true });
});

// Owner: mark selected month as paid (final manual action)
router.post("/:id/mark-paid", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req: AuthorizedRequest, res) => {
  try {
    const { id } = req.params;
    const { month } = req.body;
    if (!month) return res.status(400).json({ error: "Month is required." });
    const reqRec = await prisma.paymentRequest.findUnique({ where: { id: Number(id) }, include: { member: true, cardUpload: true } });
    if (!reqRec) return res.status(404).json({ error: "Request not found." });
    if (reqRec.status !== "AWAITING_MANUAL_SELECTION") return res.status(400).json({ error: "Request not awaiting manual selection." });

    const year = await prisma.academicYear.findUnique({ where: { id: reqRec.academicYearId } });
    if (!year) return res.status(400).json({ error: "Academic year not found." });

    const monthNum = Number(month);
    const existingPayment = await prisma.payment.findFirst({ where: { memberId: reqRec.memberId, academicYearId: year.id, month: monthNum } });
    if (existingPayment) return res.status(409).json({ error: "Selected month is already paid." });

    // create payment similar to existing payments route
    const amount = Number(reqRec.amount);
    const week1 = amount >= 50;
    const week2 = amount >= 100;
    const week3 = amount >= 150;
    const week4 = amount >= 200;
    const totalWeeks = [week1, week2, week3, week4].filter(Boolean).length;

    const payment = await prisma.payment.create({
      data: {
        memberId: reqRec.memberId,
        academicYearId: year.id,
        month: monthNum,
        paymentAmount: amount,
        paymentDate: new Date(),
        week1,
        week2,
        week3,
        week4,
        totalWeeks,
        recordedById: req.user!.id,
        status: PaymentStatus.COMPLETED,
        notes: reqRec.note || undefined,
      },
    });

    const receiptNumber = `RC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}-${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`;
    const receipt = await prisma.receipt.create({ data: { paymentId: payment.id, memberId: reqRec.memberId, issuedById: req.user!.id, amount: amount, weeksPaid: totalWeeks, month: monthNum, receiptNumber } });

    // link card upload to payment if present
    if (reqRec.cardUploadId) {
      await prisma.cardUpload.update({ where: { id: reqRec.cardUploadId }, data: { paymentId: payment.id } });
    }

    await prisma.auditLog.create({ data: { actorId: req.user!.id, actorRole: req.user!.roles.join(","), action: "MANUAL_MARK_PAYMENT", targetType: "PAYMENT", targetId: `${payment.id}`, status: "SUCCESS", newValue: { requestId: reqRec.id, paymentId: payment.id } } });

    await prisma.paymentRequest.update({ where: { id: reqRec.id }, data: { status: "COMPLETED", processedById: req.user!.id, processedAt: new Date(), processedMonth: monthNum } });

    // notify member
    await prisma.notification.create({ data: { recipientId: reqRec.member!.userId, type: "PAYMENT_SUCCESS", title: "Payment Success", message: `Payment successfully for ${monthName(monthNum)} month.`, metadata: { requestId: reqRec.id, paymentId: payment.id } } });

    return res.json({ payment, receipt });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

function monthName(m: number) {
  const names = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return names[m] || `Month ${m}`;
}

export default router;


