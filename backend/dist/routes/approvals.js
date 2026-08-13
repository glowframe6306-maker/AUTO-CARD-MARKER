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
router.post("/request", (0, authMiddleware_1.requireAnyRole)(["SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req, res) => {
    const { actionType, targetType, targetId, oldValue, newValue, reason } = req.body;
    if (!actionType || !targetType || !targetId || !reason) {
        return res.status(400).json({ error: "Missing required approval request fields." });
    }
    const requestId = `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const approval = await prisma_1.default.approvalRequest.create({
        data: {
            requestId,
            requesterId: req.user.id,
            requesterRole: req.user.roles.join(","),
            actionType,
            targetType,
            targetId,
            oldValue: oldValue || {},
            newValue: newValue || {},
            reason,
        },
    });
    await prisma_1.default.auditLog.create({
        data: {
            actorId: req.user.id,
            actorRole: req.user.roles.join(","),
            action: "REQUEST_APPROVAL",
            targetType,
            targetId,
            newValue: newValue || {},
            status: "PENDING",
            reason,
        },
    });
    return res.status(201).json(approval);
});
router.get("/pending", (0, authMiddleware_1.requireAnyRole)(["OWNER"]), async (req, res) => {
    const approvals = await prisma_1.default.approvalRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } });
    return res.json(approvals);
});
async function applyApproval(approval) {
    const { targetType, targetId, newValue } = approval;
    if (!approval || approval.status !== "PENDING")
        return;
    switch (targetType) {
        case "MEMBER":
            await prisma_1.default.memberProfile.update({ where: { memberId: targetId }, data: newValue });
            if (newValue.fullName || newValue.email) {
                const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId: targetId } });
                if (member) {
                    await prisma_1.default.user.update({ where: { id: member.userId }, data: { fullName: newValue.fullName || undefined, email: newValue.email || undefined } });
                }
            }
            break;
        case "USER":
            await prisma_1.default.user.update({ where: { accountId: targetId }, data: newValue });
            break;
        case "ANNOUNCEMENT":
            await prisma_1.default.announcement.update({ where: { id: Number(targetId) }, data: newValue });
            break;
        default:
            break;
    }
}
router.post("/review/:requestId", (0, authMiddleware_1.requireAnyRole)(["OWNER"]), async (req, res) => {
    const { approved, reviewReason } = req.body;
    const approval = await prisma_1.default.approvalRequest.findUnique({ where: { requestId: req.params.requestId } });
    if (!approval)
        return res.status(404).json({ error: "Approval request not found." });
    if (approval.status !== "PENDING")
        return res.status(400).json({ error: "Approval request already reviewed." });
    const updateData = {
        status: approved ? "APPROVED" : "REJECTED",
        reviewerId: req.user.id,
        reviewReason,
        reviewedAt: new Date(),
    };
    await prisma_1.default.approvalRequest.update({ where: { requestId: req.params.requestId }, data: updateData });
    if (approved) {
        await applyApproval(approval);
    }
    await prisma_1.default.auditLog.create({
        data: {
            actorId: req.user.id,
            actorRole: req.user.roles.join(","),
            action: approved ? "APPROVE_REQUEST" : "REJECT_REQUEST",
            targetType: approval.targetType,
            targetId: approval.targetId,
            status: approved ? "APPROVED" : "REJECTED",
            reason: reviewReason,
            oldValue: approval.oldValue,
            newValue: approved ? approval.newValue : undefined,
        },
    });
    return res.json({ message: `Request ${approved ? "approved" : "rejected"}.` });
});
exports.default = router;
