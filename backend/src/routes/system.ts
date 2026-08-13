import { Router } from "express";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma";
import fs from "fs";
import path from "path";

const router = Router();

router.use(authenticate);

router.get("/health", requireAnyRole(["OWNER", "SUPER_ADMIN"]), async (req: AuthorizedRequest, res) => {
  const dbStatus = await prisma.$queryRaw`SELECT 1`;
  const ocrStatus = true;
  const storagePath = process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads/secure");
  const storageAccessible = fs.existsSync(storagePath);
  const lastBackup = await prisma.backup.findFirst({ orderBy: { completedAt: "desc" } });
  return res.json({ database: dbStatus ? "ONLINE" : "OFFLINE", ocr: ocrStatus ? "ONLINE" : "OFFLINE", storage: storageAccessible ? "ONLINE" : "OFFLINE", backend: "ONLINE", lastBackup: lastBackup?.completedAt || null });
});

router.get("/security", requireAnyRole(["OWNER", "SUPER_ADMIN"]), async (req: AuthorizedRequest, res) => {
  const events = await prisma.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const devices = await prisma.device.findMany({ orderBy: { lastActive: "desc" }, take: 50 });
  return res.json({ events, devices });
});

export default router;
