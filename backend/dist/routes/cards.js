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
const router = (0, express_1.Router)();
const uploadBase = process.env.UPLOAD_BASE_PATH || path_1.default.join(__dirname, "../../uploads/secure");
fs_1.default.mkdirSync(uploadBase, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadBase);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`);
    },
});
const upload = (0, multer_1.default)({
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
router.use(authMiddleware_1.authenticate);
router.post("/upload", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), upload.single("card"), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: "Card image is required." });
    const upload = await prisma_1.default.cardUpload.create({
        data: {
            uploaderId: req.user.id,
            originalName: req.file.originalname,
            filePath: req.file.path,
            status: "PENDING_REVIEW",
        },
    });
    const rawText = await (0, ocr_1.runOcr)(req.file.path);
    const fields = (0, ocr_1.extractOcrFields)(rawText);
    const confidence = (0, ocr_1.assessConfidence)(fields);
    const cardOcr = await prisma_1.default.ocrResult.create({
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
            const duplicate = await (0, ocr_1.isDuplicatePayment)(memberMatch.member.id, memberMatch.yearId, monthNumber);
            if (duplicate) {
                await prisma_1.default.cardUpload.update({ where: { id: upload.id }, data: { duplicateWarning: true } });
            }
        }
    }
    return res.status(201).json({ upload, ocr: cardOcr, memberMatch });
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
async function findMemberByName(name) {
    const normalized = name.trim().toLowerCase();
    const member = await prisma_1.default.memberProfile.findFirst({ where: { fullName: { contains: normalized, mode: "insensitive" } } });
    const year = await prisma_1.default.academicYear.findFirst({ where: { isCurrent: true } });
    return { member, yearId: year?.id || 0 };
}
router.get("/review", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req, res) => {
    const reviews = await prisma_1.default.ocrResult.findMany({ include: { cardUpload: true }, where: { status: "REVIEW" }, orderBy: { createdAt: "desc" } });
    return res.json(reviews);
});
router.post("/review/:id", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req, res) => {
    const { approved, comments, correctedName, correctedMonth, correctedAmount } = req.body;
    const { id } = req.params;
    const ocrResult = await prisma_1.default.ocrResult.findUnique({ where: { id: Number(id) }, include: { cardUpload: true } });
    if (!ocrResult)
        return res.status(404).json({ error: "OCR result not found." });
    const review = await prisma_1.default.ocrReview.create({
        data: {
            ocrResultId: ocrResult.id,
            reviewerId: req.user.id,
            approved,
            comments,
            correctedName: correctedName || ocrResult.detectedName,
            correctedMonth: correctedMonth || ocrResult.detectedMonth,
            correctedAmount: correctedAmount || ocrResult.detectedAmount,
        },
    });
    await prisma_1.default.ocrResult.update({ where: { id: ocrResult.id }, data: { status: approved ? "APPROVED" : "REJECTED", updatedAt: new Date() } });
    return res.json({ review });
});
exports.default = router;
