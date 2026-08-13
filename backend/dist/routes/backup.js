"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.post("/create", (0, authMiddleware_1.requireAnyRole)(["OWNER"]), async (req, res) => {
    const backupPath = process.env.BACKUP_STORAGE_PATH || path_1.default.join(__dirname, "../../uploads/backups");
    fs_1.default.mkdirSync(backupPath, { recursive: true });
    const fileName = `backup-${Date.now()}.json`;
    const filePath = path_1.default.join(backupPath, fileName);
    const users = await prisma_1.default.user.findMany({ include: { memberProfile: true, roles: { include: { role: true } } } });
    const members = await prisma_1.default.memberProfile.findMany();
    fs_1.default.writeFileSync(filePath, JSON.stringify({ users, members }, null, 2));
    const backup = await prisma_1.default.backup.create({ data: { initiatedById: req.user.id, filePath, status: "COMPLETED", completedAt: new Date() } });
    return res.json(backup);
});
router.post("/restore", (0, authMiddleware_1.requireAnyRole)(["OWNER"]), async (req, res) => {
    const { fileName } = req.body;
    if (!fileName)
        return res.status(400).json({ error: "Backup file name is required." });
    const backupPath = process.env.BACKUP_STORAGE_PATH || path_1.default.join(__dirname, "../../uploads/backups");
    const filePath = path_1.default.join(backupPath, fileName);
    if (!fs_1.default.existsSync(filePath))
        return res.status(404).json({ error: "Backup file not found." });
    const raw = fs_1.default.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.users || !parsed.members)
        return res.status(400).json({ error: "Invalid backup content." });
    for (const userData of parsed.users) {
        await prisma_1.default.user.upsert({
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
        await prisma_1.default.memberProfile.upsert({
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
    const backup = await prisma_1.default.backup.create({ data: { initiatedById: req.user.id, filePath, status: "RESTORED", completedAt: new Date() } });
    return res.json({ message: "Backup restored.", backup });
});
exports.default = router;
