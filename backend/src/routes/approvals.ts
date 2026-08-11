import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

router.post("/request", requireAnyRole(["SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
  const { actionType, targetType, targetId, oldValue, newValue, reason } = req.body;
  if (!actionType || !targetType || !targetId || !reason) {
    return res.status(400).json({ error: "Missing required approval request fields." });
  }
  const requestId = `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const approval = await prisma.approvalRequest.create({
    data: {
      requestId,
      requesterId: req.user!.id,
      requesterRole: req.user!.roles.join(","),
      actionType,
      targetType,
      targetId,
      oldValue: oldValue || {},
      newValue: newValue || {},
      reason,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(","),
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

router.get("/pending", requireAnyRole(["OWNER"]), async (req, res) => {
  const approvals = await prisma.approvalRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } });
  return res.json(approvals);
});

router.post("/review/:requestId", requireAnyRole(["OWNER"]), async (req: AuthorizedRequest, res) => {
  const { approved, reviewReason } = req.body;
  const approval = await prisma.approvalRequest.findUnique({ where: { requestId: req.params.requestId } });
  if (!approval) return res.status(404).json({ error: "Approval request not found." });
  if (approval.status !== "PENDING") return res.status(400).json({ error: "Approval request already reviewed." });

  const updateData: any = {
    status: approved ? "APPROVED" : "REJECTED",
    reviewerId: req.user!.id,
    reviewReason,
    reviewedAt: new Date(),
  };
  await prisma.approvalRequest.update({ where: { requestId: req.params.requestId }, data: updateData });
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(","),
      action: approved ? "APPROVE_REQUEST" : "REJECT_REQUEST",
      targetType: approval.targetType,
      targetId: approval.targetId,
      status: approved ? "APPROVED" : "REJECTED",
      reason: reviewReason,
    },
  });
  return res.json({ message: `Request ${approved ? "approved" : "rejected"}.` });
});

export default router;
