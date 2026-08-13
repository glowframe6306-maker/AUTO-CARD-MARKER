import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";
import { runOcr, extractOcrFields, assessConfidence, isDuplicatePayment } from "../utils/ocr";
import { calculateWeeksFromAmount } from "../utils/payments";

const router = Router();
const uploadBase = process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads/secure");
fs.mkdirSync(uploadBase, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadBase);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const accepted = ["image/jpeg", "image/png", "image/webp"];
    if (!accepted.includes(file.mimetype)) {
      return cb(new Error("Invalid file type."));
    }
    cb(null, true);
  },
});

router.use(authenticate);

router.post("/upload", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), upload.single("card"), async (req: AuthorizedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "Card image is required." });
  const upload = await prisma.cardUpload.create({
    data: {
      uploaderId: req.user!.id,
      originalName: req.file.originalname,
      filePath: req.file.path,
      status: "PENDING_REVIEW",
    },
  });
  const rawText = await runOcr(req.file.path);
  const fields = extractOcrFields(rawText);
  const confidence = assessConfidence(fields);
  const cardOcr = await prisma.ocrResult.create({
    data: {
      cardUploadId: upload.id,
      detectedName: fields.detectedName,
      detectedMonth: fields.detectedMonth ? convertMonth(fields.detectedMonth) : null,
      detectedAmount: fields.detectedAmount,
      detectedDate: fields.detectedDate ? new Date(fields.detectedDate) : null,
      confidence,
      rawText,
      status: confidence >= 0.9 ? "AUTO_APPROVED" : "REVIEW",
    },
  });
  const memberMatch = fields.detectedName ? await findMemberByName(fields.detectedName) : null;
  if (memberMatch && fields.detectedMonth && fields.detectedAmount && memberMatch.member) {
    const monthNumber = convertMonth(fields.detectedMonth);
    if (monthNumber) {
      const duplicate = await isDuplicatePayment(memberMatch.member.id, memberMatch.yearId, monthNumber);
      if (duplicate) {
        await prisma.cardUpload.update({ where: { id: upload.id }, data: { duplicateWarning: true } });
      }
    }
  }
  return res.status(201).json({ upload, ocr: cardOcr, memberMatch });
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

async function findMemberByName(name: string) {
  const normalized = name.trim().toLowerCase();
  const member = await prisma.memberProfile.findFirst({ where: { fullName: { contains: normalized, mode: "insensitive" } } });
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  return { member, yearId: year?.id || 0 };
}

router.get("/review", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req, res) => {
  const reviews = await prisma.ocrResult.findMany({ include: { cardUpload: true }, where: { status: "REVIEW" }, orderBy: { createdAt: "desc" } });
  return res.json(reviews);
});

router.post("/review/:id", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req: AuthorizedRequest, res) => {
  const { approved, comments, correctedName, correctedMonth, correctedAmount } = req.body;
  const { id } = req.params;
  const ocrResult = await prisma.ocrResult.findUnique({ where: { id: Number(id) }, include: { cardUpload: true } });
  if (!ocrResult) return res.status(404).json({ error: "OCR result not found." });

  const review = await prisma.ocrReview.create({
    data: {
      ocrResultId: ocrResult.id,
      reviewerId: req.user!.id,
      approved,
      comments,
      correctedName: correctedName || ocrResult.detectedName,
      correctedMonth: correctedMonth || ocrResult.detectedMonth,
      correctedAmount: correctedAmount || ocrResult.detectedAmount,
    },
  });
  await prisma.ocrResult.update({ where: { id: ocrResult.id }, data: { status: approved ? "APPROVED" : "REJECTED", updatedAt: new Date() } });
  return res.json({ review });
});

export default router;
