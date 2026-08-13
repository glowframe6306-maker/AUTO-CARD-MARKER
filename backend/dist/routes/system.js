"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const prisma_1 = __importDefault(require("../prisma"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.get("/health", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN"]), async (req, res) => {
    const dbStatus = await prisma_1.default.$queryRaw `SELECT 1`;
    const ocrStatus = true;
    const storagePath = process.env.UPLOAD_BASE_PATH || path_1.default.join(__dirname, "../../uploads/secure");
    const storageAccessible = fs_1.default.existsSync(storagePath);
    const lastBackup = await prisma_1.default.backup.findFirst({ orderBy: { completedAt: "desc" } });
    return res.json({ database: dbStatus ? "ONLINE" : "OFFLINE", ocr: ocrStatus ? "ONLINE" : "OFFLINE", storage: storageAccessible ? "ONLINE" : "OFFLINE", backend: "ONLINE", lastBackup: lastBackup?.completedAt || null });
});
router.get("/security", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN"]), async (req, res) => {
    const events = await prisma_1.default.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    const devices = await prisma_1.default.device.findMany({ orderBy: { lastActive: "desc" }, take: 50 });
    return res.json({ events, devices });
});
exports.default = router;
