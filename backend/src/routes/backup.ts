import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";
import path from "path";
import fs from "fs";

const router = Router();
router.use(authenticate);

router.post("/create", requireAnyRole(["OWNER"]), async (req: AuthorizedRequest, res) => {
  const backupPath = process.env.BACKUP_STORAGE_PATH || path.join(__dirname, "../../uploads/backups");
  fs.mkdirSync(backupPath, { recursive: true });
  const fileName = `backup-${Date.now()}.json`;
  const filePath = path.join(backupPath, fileName);
  const users = await prisma.user.findMany();
  const members = await prisma.memberProfile.findMany();
  fs.writeFileSync(filePath, JSON.stringify({ users, members }, null, 2));
  const backup = await prisma.backup.create({ data: { initiatedById: req.user!.id, filePath, status: "COMPLETED", completedAt: new Date() } });
  return res.json(backup);
});

export default router;
