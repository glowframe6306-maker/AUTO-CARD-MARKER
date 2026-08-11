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
  return res.json({ database: dbStatus ? "ONLINE" : "OFFLINE", ocr: ocrStatus ? "ONLINE" : "OFFLINE", storage: storageAccessible ? "ONLINE" : "OFFLINE", backend: "ONLINE", lastBackup: null });
});

export default router;
