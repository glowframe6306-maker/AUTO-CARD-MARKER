"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.get("/", async (req, res) => {
    const publishedOnly = req.user?.roles.includes("MEMBER") && !req.user?.isOwner;
    const where = publishedOnly ? { isPublished: true } : undefined;
    const announcements = await prisma_1.default.announcement.findMany({ where, orderBy: { createdAt: "desc" } });
    return res.json(announcements);
});
router.post("/", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req, res) => {
    const { title, content, scheduledAt, isPublished } = req.body;
    if (!title || !content)
        return res.status(400).json({ error: "Title and content are required." });
    const announcement = await prisma_1.default.announcement.create({ data: { title, content, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, publishedAt: isPublished ? new Date() : null, isPublished: Boolean(isPublished) } });
    return res.status(201).json(announcement);
});
exports.default = router;
