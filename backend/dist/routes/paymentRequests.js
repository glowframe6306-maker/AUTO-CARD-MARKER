"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const ocr_1 = require("../utils/ocr");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const uploadBase = process.env.UPLOAD_BASE_PATH || path_1.default.join(__dirname, "../../uploads/secure");
fs_1.default.mkdirSync(uploadBase, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => cb(null, uploadBase),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`),
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const accepted = ["image/jpeg", "image/png", "image/webp"];
        if (!accepted.includes(file.mimetype))
            return cb(new Error("Invalid file type."));
        cb(null, true);
    },
});
router.use(authMiddleware_1.authenticate);
// Member submits a payment request with card upload (multipart)
router.post("/", upload.single("card"), async (req, res) => {
    try {
        const { month, amount, note } = req.body;
        if (!req.user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!month || !amount)
            return res.status(400).json({ error: "Missing required fields." });
        const member = await prisma_1.default.memberProfile.findUnique({ where: { userId: req.user.id } });
        if (!member)
            return res.status(404).json({ error: "Member profile not found." });
        const year = await prisma_1.default.academicYear.findFirst({ where: { isCurrent: true } });
        if (!year)
            return res.status(400).json({ error: "No current academic year configured." });
        const requestedMonth = Number(month);
        const amountNum = Number(amount);
        // Check existing payment for month
        const existingPayment = await prisma_1.default.payment.findFirst({ where: { memberId: member.id, academicYearId: year.id, month: requestedMonth } });
        if (existingPayment)
            return res.status(409).json({ error: "This month is already paid." });
        // Prevent duplicate pending requests for same month
        const existingRequest = await prisma_1.default.paymentRequest.findFirst({ where: { memberId: member.id, academicYearId: year.id, requestedMonth, status: { in: ["PENDING_REVIEW", "AWAITING_MANUAL_SELECTION"] } } });
        if (existingRequest)
            return res.status(409).json({ error: "A payment request for this month is already pending review." });
        let cardUploadRecord = null;
        let ocrRecord = null;
        if (req.file) {
            cardUploadRecord = await prisma_1.default.cardUpload.create({ data: { uploaderId: req.user.id, memberId: member.id, originalName: req.file.originalname, filePath: req.file.path, status: "PENDING_REVIEW" } });
            const rawText = await (0, ocr_1.runOcr)(req.file.path);
            const fields = (0, ocr_1.extractOcrFields)(rawText);
            const confidence = (0, ocr_1.assessConfidence)(fields);
            ocrRecord = await prisma_1.default.ocrResult.create({ data: { cardUploadId: cardUploadRecord.id, detectedName: fields.detectedName, detectedMonth: fields.detectedMonth ? convertMonth(fields.detectedMonth) : null, detectedAmount: fields.detectedAmount, detectedDate: fields.detectedDate ? new Date(fields.detectedDate) : null, confidence, rawText, status: confidence >= 0.9 ? "AUTO_APPROVED" : "REVIEW" } });
        }
        const request = await prisma_1.default.paymentRequest.create({
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
        return res.status(201).json({ request, cardUpload: cardUploadRecord, ocr: ocrRecord });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message || "Server error" });
    }
});
function convertMonth(value) {
    const map = {
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
router.get("/review", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req, res) => {
    const rows = await prisma_1.default.paymentRequest.findMany({
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
router.post("/:id/deny", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const reqRec = await prisma_1.default.paymentRequest.findUnique({ where: { id: Number(id) }, include: { member: true } });
    if (!reqRec)
        return res.status(404).json({ error: "Request not found." });
    await prisma_1.default.paymentRequest.update({ where: { id: reqRec.id }, data: { status: "DENIED", reviewedById: req.user.id, reviewedAt: new Date(), reviewerNotes: reason || null } });
    await prisma_1.default.notification.create({ data: { recipientId: reqRec.member.userId, type: "PAYMENT_FAILED", title: "Payment Failed", message: `Sorry, your payment failed for ${monthName(reqRec.requestedMonth)} month.`, metadata: { requestId: reqRec.id } } });
    return res.json({ success: true });
});
// Owner: allow request (moves to awaiting manual selection)
router.post("/:id/allow", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req, res) => {
    const { id } = req.params;
    const reqRec = await prisma_1.default.paymentRequest.findUnique({ where: { id: Number(id) } });
    if (!reqRec)
        return res.status(404).json({ error: "Request not found." });
    await prisma_1.default.paymentRequest.update({ where: { id: reqRec.id }, data: { status: "AWAITING_MANUAL_SELECTION", reviewedById: req.user.id, reviewedAt: new Date() } });
    return res.json({ success: true });
});
// Owner: mark selected month as paid (final manual action)
router.post("/:id/mark-paid", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req, res) => {
    try {
        const { id } = req.params;
        const { month } = req.body;
        if (!month)
            return res.status(400).json({ error: "Month is required." });
        const reqRec = await prisma_1.default.paymentRequest.findUnique({ where: { id: Number(id) }, include: { member: true, cardUpload: true } });
        if (!reqRec)
            return res.status(404).json({ error: "Request not found." });
        if (reqRec.status !== "AWAITING_MANUAL_SELECTION")
            return res.status(400).json({ error: "Request not awaiting manual selection." });
        const year = await prisma_1.default.academicYear.findUnique({ where: { id: reqRec.academicYearId } });
        if (!year)
            return res.status(400).json({ error: "Academic year not found." });
        const monthNum = Number(month);
        const existingPayment = await prisma_1.default.payment.findFirst({ where: { memberId: reqRec.memberId, academicYearId: year.id, month: monthNum } });
        if (existingPayment)
            return res.status(409).json({ error: "Selected month is already paid." });
        // create payment similar to existing payments route
        const amount = Number(reqRec.amount);
        const week1 = amount >= 50;
        const week2 = amount >= 100;
        const week3 = amount >= 150;
        const week4 = amount >= 200;
        const totalWeeks = [week1, week2, week3, week4].filter(Boolean).length;
        const payment = await prisma_1.default.payment.create({
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
                recordedById: req.user.id,
                status: client_1.PaymentStatus.COMPLETED,
                notes: reqRec.note || undefined,
            },
        });
        const receiptNumber = `RC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}-${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`;
        const receipt = await prisma_1.default.receipt.create({ data: { paymentId: payment.id, memberId: reqRec.memberId, issuedById: req.user.id, amount: amount, weeksPaid: totalWeeks, month: monthNum, receiptNumber } });
        // link card upload to payment if present
        if (reqRec.cardUploadId) {
            await prisma_1.default.cardUpload.update({ where: { id: reqRec.cardUploadId }, data: { paymentId: payment.id } });
        }
        await prisma_1.default.auditLog.create({ data: { actorId: req.user.id, actorRole: req.user.roles.join(","), action: "MANUAL_MARK_PAYMENT", targetType: "PAYMENT", targetId: `${payment.id}`, status: "SUCCESS", newValue: { requestId: reqRec.id, paymentId: payment.id } } });
        await prisma_1.default.paymentRequest.update({ where: { id: reqRec.id }, data: { status: "COMPLETED", processedById: req.user.id, processedAt: new Date(), processedMonth: monthNum } });
        // notify member
        await prisma_1.default.notification.create({ data: { recipientId: reqRec.member.userId, type: "PAYMENT_SUCCESS", title: "Payment Success", message: `Payment successfully for ${monthName(monthNum)} month.`, metadata: { requestId: reqRec.id, paymentId: payment.id } } });
        return res.json({ payment, receipt });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message || "Server error" });
    }
});
function monthName(m) {
    const names = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return names[m] || `Month ${m}`;
}
exports.default = router;
