import { Router } from "express";
import prisma from "../prisma";
import { Prisma } from "@prisma/client";
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

router.get("/pending", requireAnyRole(["OWNER"]), async (_req, res) => {
  const approvals = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  return res.json(approvals);
});

async function applyApproval(approval: any) {
  const { targetType, targetId, newValue } = approval;

  if (!approval || approval.status !== "PENDING") {
    return;
  }

  switch (targetType) {
    case "MEMBER":
      await prisma.memberProfile.update({
        where: { memberId: targetId },
        data: newValue,
      });

      if (newValue.fullName || newValue.email) {
        const member = await prisma.memberProfile.findUnique({
          where: { memberId: targetId },
        });

        if (member) {
          await prisma.user.update({
            where: { id: member.userId },
            data: {
              fullName: newValue.fullName || undefined,
              email: newValue.email || undefined,
            },
          });
        }
      }
      break;

    case "USER":
      await prisma.user.update({
        where: { accountId: targetId },
        data: newValue,
      });
      break;

    case "ANNOUNCEMENT":
      await prisma.announcement.update({
        where: { id: Number(targetId) },
        data: newValue,
      });
      break;

    case "REGISTRATION": {
      const pendingId = Number(targetId);

      if (!Number.isInteger(pendingId) || pendingId <= 0) {
        throw new Error("Invalid registration ID.");
      }

      const pending = await prisma.pendingRegistration.findUnique({
        where: { id: pendingId },
      });

      if (!pending) {
        throw new Error("Registration not found.");
      }

      if (pending.status !== "PENDING") {
        throw new Error("Registration has already been processed.");
      }

      const memberRole = await prisma.role.findUnique({
        where: { name: "MEMBER" },
      });

      if (!memberRole) {
        throw new Error("The MEMBER role does not exist. Unable to approve registration.");
      }

      const existingAccount = await prisma.user.findUnique({
        where: { accountId: pending.rcStudentId },
        include: { memberProfile: true },
      });

      const existingEmail = await prisma.user.findUnique({
        where: { email: pending.email },
        include: { memberProfile: true },
      });

      const existingMemberProfile = await prisma.memberProfile.findUnique({
        where: { memberId: pending.rcStudentId },
        include: { user: true },
      });

      const exactMatchExists =
        (existingAccount &&
          existingAccount.email === pending.email &&
          existingAccount.memberProfile?.memberId === pending.rcStudentId &&
          existingAccount.memberProfile?.fullName === pending.name &&
          existingAccount.status === "ACTIVE" &&
          existingAccount.isOwner === false) ||
        (existingMemberProfile &&
          existingMemberProfile.user.accountId === pending.rcStudentId &&
          existingMemberProfile.user.email === pending.email &&
          existingMemberProfile.fullName === pending.name &&
          existingMemberProfile.status === "ACTIVE");

      if (exactMatchExists) {
        await prisma.pendingRegistration.update({
          where: { id: pendingId },
          data: {
            status: "APPROVED",
            approvedById: approval.reviewerId ?? undefined,
            approvedAt: new Date(),
          },
        });

        console.log(`Registration ${pendingId} already matched an active member account; marking as approved without duplication.`);
        break;
      }

      if (existingAccount || existingEmail || existingMemberProfile) {
        throw new Error("A conflicting User or MemberProfile already exists for this registration. Duplicate data detected.");
      }

      const result = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            accountId: pending.rcStudentId,
            email: pending.email,
            fullName: pending.name,
            passwordHash: pending.passwordHash,
            status: "ACTIVE",
            isOwner: false,
            forcePasswordReset: true,
            roles: {
              create: [{ roleId: memberRole.id }],
            },
            memberProfile: {
              create: {
                memberId: pending.rcStudentId,
                fullName: pending.name,
                grade: "",
                position: "MEMBER",
                status: "ACTIVE",
                photoUrl: null,
                customFields: {
                  dob: pending.dob.toISOString(),
                },
              },
            },
          },
          include: {
            memberProfile: true,
            roles: true,
          },
        });

        await tx.pendingRegistration.update({
          where: { id: pendingId },
          data: {
            status: "APPROVED",
            approvedById: approval.reviewerId ?? undefined,
            approvedAt: new Date(),
          },
        });

        return createdUser;
      });

      console.log(
        `Registration ${pendingId} approved. User ${result.id} and MemberProfile ${result.memberProfile?.id} created.`
      );

      break;
    }

    default:
      break;
  }
}

router.post("/review/:requestId", requireAnyRole(["OWNER"]), async (req: AuthorizedRequest, res) => {
  const { approved, reviewReason } = req.body;

  const approval = await prisma.approvalRequest.findUnique({
    where: { requestId: req.params.requestId },
  });

  if (!approval) {
    return res.status(404).json({ error: "Approval request not found." });
  }

  if (approval.status !== "PENDING") {
    return res.status(400).json({
      error: "Approval request already reviewed.",
    });
  }

  const updateData: any = {
    status: approved ? "APPROVED" : "REJECTED",
    reviewerId: req.user!.id,
    reviewReason,
    reviewedAt: new Date(),
  };

  if (approved) {
    await applyApproval({
      ...approval,
      reviewerId: req.user!.id,
    });
  }

  await prisma.approvalRequest.update({
    where: { requestId: req.params.requestId },
    data: updateData,
  });

  if (!approved && approval.targetType === "REGISTRATION") {
    const pendingId = Number(approval.targetId);

    if (Number.isInteger(pendingId) && pendingId > 0) {
      await prisma.pendingRegistration.updateMany({
        where: {
          id: pendingId,
          status: "PENDING",
        },
        data: {
          status: "DECLINED",
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(","),
      action: approved ? "APPROVE_REQUEST" : "REJECT_REQUEST",
      targetType: approval.targetType,
      targetId: approval.targetId,
      status: approved ? "APPROVED" : "REJECTED",
      reason: reviewReason,
      oldValue: approval.oldValue as Prisma.InputJsonValue,
      newValue: approved
        ? (approval.newValue as Prisma.InputJsonValue)
        : undefined,
    },
  });

  const targetIsRegistration = approval.targetType === "REGISTRATION";

  return res.json({
    success: true,
    message: approved
      ? (targetIsRegistration ? "Registration approved successfully." : "Request approved successfully.")
      : (targetIsRegistration ? "Registration declined successfully." : "Request rejected successfully."),
  });
});

export default router;