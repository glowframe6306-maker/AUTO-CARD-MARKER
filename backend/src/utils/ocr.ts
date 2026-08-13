import fs from "fs";
import path from "path";
import sharp from "sharp";
import nodeTesseract from "node-tesseract-ocr";
import prisma from "../prisma";

const OCR_OPTIONS = {
  lang: "eng",
  oem: 1,
  psm: 3,
};

export async function prepareImageForOcr(sourcePath: string): Promise<string> {
  const tempPath = path.join(path.dirname(sourcePath), `ocr_${path.basename(sourcePath)}`);
  const image = sharp(sourcePath).rotate().resize({ width: 1600, height: 1600, fit: "inside" }).grayscale().linear(1.2, -10).sharpen();
  await image.toFile(tempPath);
  return tempPath;
}

export async function runOcr(sourcePath: string) {
  const processedPath = await prepareImageForOcr(sourcePath);
  try {
    const rawText = await nodeTesseract.recognize(processedPath, OCR_OPTIONS);
    return rawText;
  } finally {
    try {
      fs.unlinkSync(processedPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export function extractOcrFields(rawText: string) {
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

export function assessConfidence(fields: ReturnType<typeof extractOcrFields>) {
  let score = 0;
  if (fields.detectedName) score += 0.35;
  if (fields.detectedMonth) score += 0.25;
  if (fields.detectedAmount) score += 0.25;
  if (fields.detectedDate) score += 0.15;
  return Math.min(1, score);
}

export async function isDuplicatePayment(memberId: number, academicYearId: number, month: number) {
  const existing = await prisma.payment.findFirst({ where: { memberId, academicYearId, month } });
  return Boolean(existing);
}
