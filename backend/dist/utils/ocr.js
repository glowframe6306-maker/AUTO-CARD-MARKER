"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareImageForOcr = prepareImageForOcr;
exports.runOcr = runOcr;
exports.extractOcrFields = extractOcrFields;
exports.assessConfidence = assessConfidence;
exports.isDuplicatePayment = isDuplicatePayment;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const node_tesseract_ocr_1 = __importDefault(require("node-tesseract-ocr"));
const prisma_1 = __importDefault(require("../prisma"));
const OCR_OPTIONS = {
    lang: "eng",
    oem: 1,
    psm: 3,
};
async function prepareImageForOcr(sourcePath) {
    const tempPath = path_1.default.join(path_1.default.dirname(sourcePath), `ocr_${path_1.default.basename(sourcePath)}`);
    const image = (0, sharp_1.default)(sourcePath).rotate().resize({ width: 1600, height: 1600, fit: "inside" }).grayscale().linear(1.2, -10).sharpen();
    await image.toFile(tempPath);
    return tempPath;
}
async function runOcr(sourcePath) {
    const processedPath = await prepareImageForOcr(sourcePath);
    try {
        const rawText = await node_tesseract_ocr_1.default.recognize(processedPath, OCR_OPTIONS);
        return rawText;
    }
    finally {
        try {
            fs_1.default.unlinkSync(processedPath);
        }
        catch {
            // ignore cleanup errors
        }
    }
}
function extractOcrFields(rawText) {
    const normalized = rawText.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const amountMatch = normalized.match(/(?:Rs|LKR|Rupees?)\s*[:.-]?\s*(\d+)/i);
    const monthMatch = normalized.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)/i);
    const dateMatch = normalized.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    const nameMatch = normalized.match(/(?:Name|Member Name|Name of Member|Student Name)[:\-\s]+([A-Za-z0-9 .,'`]+)/i) || normalized.match(/([A-Za-z ]{3,50})\s+Grade\s+\d+/i);
    return {
        rawText,
        detectedName: nameMatch?.[1]?.trim() || null,
        detectedMonth: monthMatch?.[0] || null,
        detectedAmount: amountMatch ? Number(amountMatch[1]) : null,
        detectedDate: dateMatch ? dateMatch[1] : null,
    };
}
function assessConfidence(fields) {
    let score = 0;
    if (fields.detectedName)
        score += 0.35;
    if (fields.detectedMonth)
        score += 0.25;
    if (fields.detectedAmount)
        score += 0.25;
    if (fields.detectedDate)
        score += 0.15;
    return Math.min(1, score);
}
async function isDuplicatePayment(memberId, academicYearId, month) {
    const existing = await prisma_1.default.payment.findFirst({ where: { memberId, academicYearId, month } });
    return Boolean(existing);
}
