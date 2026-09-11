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
/*
 * REAL OWNER ONLY
 *
 * Announcement management must never be based only on role names.
 * Only the actual Owner account may create, edit, delete or pin.
 */
function requireOwner(req, res, next) {
    if (!req.user?.isOwner) {
        return res.status(403).json({
            error: "Forbidden. Announcement management is available to the Owner only.",
        });
    }
    return next();
}
/*
 * GET ANNOUNCEMENTS
 *
 * Owner:
 *   - sees all announcements
 *
 * Member:
 *   - sees only published announcements
 *   - scheduled announcements are hidden until scheduled time
 *   - expired announcements are hidden
 *   - grade/member targeted announcements are filtered
 */
router.get("/", async (req, res) => {
    try {
        const now = new Date();
        if (req.user?.isOwner) {
            const announcements = await prisma_1.default.announcement.findMany({
                orderBy: [
                    { isPinned: "desc" },
                    { createdAt: "desc" },
                ],
            });
            return res.json(announcements);
        }
        const member = await prisma_1.default.memberProfile.findUnique({
            where: {
                userId: req.user.id,
            },
            select: {
                memberId: true,
                grade: true,
            },
        });
        const announcements = await prisma_1.default.announcement.findMany({
            where: {
                isPublished: true,
                OR: [
                    { scheduledAt: null },
                    { scheduledAt: { lte: now } },
                ],
                AND: [
                    {
                        OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: now } },
                        ],
                    },
                    {
                        OR: [
                            { targetType: "ALL" },
                            {
                                targetType: "GRADE",
                                targetGrade: member?.grade ?? "",
                            },
                            {
                                targetType: "MEMBER",
                                targetMemberId: member?.memberId ?? "",
                            },
                        ],
                    },
                ],
            },
            orderBy: [
                { isPinned: "desc" },
                { createdAt: "desc" },
            ],
        });
        return res.json(announcements);
    }
    catch (error) {
        console.error("Failed to load announcements:", error);
        return res.status(500).json({
            error: "Failed to load announcements.",
        });
    }
});
/*
 * GET SINGLE ANNOUNCEMENT
 */
router.get("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({
                error: "Invalid announcement ID.",
            });
        }
        const announcement = await prisma_1.default.announcement.findUnique({
            where: { id },
        });
        if (!announcement) {
            return res.status(404).json({
                error: "Announcement not found.",
            });
        }
        if (req.user?.isOwner) {
            return res.json(announcement);
        }
        const now = new Date();
        if (!announcement.isPublished) {
            return res.status(404).json({
                error: "Announcement not found.",
            });
        }
        if (announcement.scheduledAt && announcement.scheduledAt > now) {
            return res.status(404).json({
                error: "Announcement not found.",
            });
        }
        if (announcement.expiresAt && announcement.expiresAt <= now) {
            return res.status(404).json({
                error: "Announcement not found.",
            });
        }
        const member = await prisma_1.default.memberProfile.findUnique({
            where: {
                userId: req.user.id,
            },
            select: {
                memberId: true,
                grade: true,
            },
        });
        const allowed = announcement.targetType === "ALL" ||
            (announcement.targetType === "GRADE" &&
                announcement.targetGrade === member?.grade) ||
            (announcement.targetType === "MEMBER" &&
                announcement.targetMemberId === member?.memberId);
        if (!allowed) {
            return res.status(403).json({
                error: "Forbidden",
            });
        }
        return res.json(announcement);
    }
    catch (error) {
        console.error("Failed to load announcement:", error);
        return res.status(500).json({
            error: "Failed to load announcement.",
        });
    }
});
/*
 * CREATE ANNOUNCEMENT
 * OWNER ONLY
 */
router.post("/", requireOwner, async (req, res) => {
    try {
        const { title, content, scheduledAt, expiresAt, isPublished, isPinned, targetType, targetGrade, targetMemberId, } = req.body;
        if (!title || !content) {
            return res.status(400).json({
                error: "Title and content are required.",
            });
        }
        const allowedTargetTypes = ["ALL", "GRADE", "MEMBER"];
        const finalTargetType = targetType || "ALL";
        if (!allowedTargetTypes.includes(finalTargetType)) {
            return res.status(400).json({
                error: "Invalid target type.",
            });
        }
        if (finalTargetType === "GRADE" && !targetGrade) {
            return res.status(400).json({
                error: "Target grade is required.",
            });
        }
        if (finalTargetType === "MEMBER" && !targetMemberId) {
            return res.status(400).json({
                error: "Target member ID is required.",
            });
        }
        const publishNow = Boolean(isPublished);
        const announcement = await prisma_1.default.announcement.create({
            data: {
                title: String(title).trim(),
                content: String(content).trim(),
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                publishedAt: publishNow ? new Date() : null,
                isPublished: publishNow,
                isPinned: Boolean(isPinned),
                targetType: finalTargetType,
                targetGrade: finalTargetType === "GRADE" ? String(targetGrade).trim() : null,
                targetMemberId: finalTargetType === "MEMBER"
                    ? String(targetMemberId).trim()
                    : null,
            },
        });
        return res.status(201).json(announcement);
    }
    catch (error) {
        console.error("Failed to create announcement:", error);
        return res.status(500).json({
            error: "Failed to create announcement.",
        });
    }
});
/*
 * EDIT ANNOUNCEMENT
 * OWNER ONLY
 */
router.put("/:id", requireOwner, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({
                error: "Invalid announcement ID.",
            });
        }
        const existing = await prisma_1.default.announcement.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({
                error: "Announcement not found.",
            });
        }
        const { title, content, scheduledAt, expiresAt, isPublished, isPinned, targetType, targetGrade, targetMemberId, } = req.body;
        const nextTargetType = targetType ?? existing.targetType;
        if (!["ALL", "GRADE", "MEMBER"].includes(nextTargetType)) {
            return res.status(400).json({
                error: "Invalid target type.",
            });
        }
        if (nextTargetType === "GRADE" && !(targetGrade ?? existing.targetGrade)) {
            return res.status(400).json({
                error: "Target grade is required.",
            });
        }
        if (nextTargetType === "MEMBER" &&
            !(targetMemberId ?? existing.targetMemberId)) {
            return res.status(400).json({
                error: "Target member ID is required.",
            });
        }
        const nextPublished = isPublished ?? existing.isPublished;
        const announcement = await prisma_1.default.announcement.update({
            where: { id },
            data: {
                title: title !== undefined ? String(title).trim() : existing.title,
                content: content !== undefined
                    ? String(content).trim()
                    : existing.content,
                scheduledAt: scheduledAt !== undefined
                    ? scheduledAt
                        ? new Date(scheduledAt)
                        : null
                    : existing.scheduledAt,
                expiresAt: expiresAt !== undefined
                    ? expiresAt
                        ? new Date(expiresAt)
                        : null
                    : existing.expiresAt,
                isPublished: Boolean(nextPublished),
                publishedAt: nextPublished && !existing.publishedAt
                    ? new Date()
                    : existing.publishedAt,
                isPinned: isPinned !== undefined
                    ? Boolean(isPinned)
                    : existing.isPinned,
                targetType: nextTargetType,
                targetGrade: nextTargetType === "GRADE"
                    ? String(targetGrade ?? existing.targetGrade).trim()
                    : null,
                targetMemberId: nextTargetType === "MEMBER"
                    ? String(targetMemberId ?? existing.targetMemberId).trim()
                    : null,
            },
        });
        return res.json(announcement);
    }
    catch (error) {
        console.error("Failed to update announcement:", error);
        return res.status(500).json({
            error: "Failed to update announcement.",
        });
    }
});
/*
 * PIN / UNPIN
 * OWNER ONLY
 */
router.patch("/:id/pin", requireOwner, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({
                error: "Invalid announcement ID.",
            });
        }
        const existing = await prisma_1.default.announcement.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({
                error: "Announcement not found.",
            });
        }
        const announcement = await prisma_1.default.announcement.update({
            where: { id },
            data: {
                isPinned: !existing.isPinned,
            },
        });
        return res.json(announcement);
    }
    catch (error) {
        console.error("Failed to pin announcement:", error);
        return res.status(500).json({
            error: "Failed to update announcement pin status.",
        });
    }
});
/*
 * DELETE ANNOUNCEMENT
 * OWNER ONLY
 */
router.delete("/:id", requireOwner, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({
                error: "Invalid announcement ID.",
            });
        }
        const existing = await prisma_1.default.announcement.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({
                error: "Announcement not found.",
            });
        }
        await prisma_1.default.announcement.delete({
            where: { id },
        });
        return res.json({
            success: true,
            message: "Announcement deleted successfully.",
        });
    }
    catch (error) {
        console.error("Failed to delete announcement:", error);
        return res.status(500).json({
            error: "Failed to delete announcement.",
        });
    }
});
exports.default = router;
