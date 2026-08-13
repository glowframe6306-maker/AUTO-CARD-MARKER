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
  const users = await prisma.user.findMany({ include: { memberProfile: true, roles: { include: { role: true } } } });
  const members = await prisma.memberProfile.findMany();
  fs.writeFileSync(filePath, JSON.stringify({ users, members }, null, 2));
  const backup = await prisma.backup.create({ data: { initiatedById: req.user!.id, filePath, status: "COMPLETED", completedAt: new Date() } });
  return res.json(backup);
});

router.post("/restore", requireAnyRole(["OWNER"]), async (req: AuthorizedRequest, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: "Backup file name is required." });
  const backupPath = process.env.BACKUP_STORAGE_PATH || path.join(__dirname, "../../uploads/backups");
  const filePath = path.join(backupPath, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Backup file not found." });
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed.users || !parsed.members) return res.status(400).json({ error: "Invalid backup content." });

  for (const userData of parsed.users) {
    await prisma.user.upsert({
      where: { accountId: userData.accountId },
      update: {
        fullName: userData.fullName,
        email: userData.email,
        status: userData.status,
        isOwner: userData.isOwner,
        failedLoginAttempts: userData.failedLoginAttempts,
        lockedUntil: userData.lockedUntil ? new Date(userData.lockedUntil) : null,
      },
      create: {
        accountId: userData.accountId,
        email: userData.email,
        fullName: userData.fullName,
        passwordHash: userData.passwordHash,
        status: userData.status,
        isOwner: userData.isOwner,
        forcePasswordReset: userData.forcePasswordReset,
        failedLoginAttempts: userData.failedLoginAttempts,
        lockedUntil: userData.lockedUntil ? new Date(userData.lockedUntil) : null,
      },
    });
  }

  for (const memberData of parsed.members) {
    await prisma.memberProfile.upsert({
      where: { memberId: memberData.memberId },
      update: {
        fullName: memberData.fullName,
        grade: memberData.grade,
        position: memberData.position,
        status: memberData.status,
        photoUrl: memberData.photoUrl,
        customFields: memberData.customFields,
      },
      create: {
        memberId: memberData.memberId,
        fullName: memberData.fullName,
        grade: memberData.grade,
        position: memberData.position,
        status: memberData.status,
        photoUrl: memberData.photoUrl,
        customFields: memberData.customFields,
        user: {
          connect: { id: memberData.userId },
        },
      },
    });
  }

  const backup = await prisma.backup.create({ data: { initiatedById: req.user!.id, filePath, status: "RESTORED", completedAt: new Date() } });
  return res.json({ message: "Backup restored.", backup });
});

export default router;
