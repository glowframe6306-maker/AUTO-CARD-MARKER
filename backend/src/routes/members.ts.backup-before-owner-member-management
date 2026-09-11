import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, requirePermission, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("manage_members"), async (req: AuthorizedRequest, res) => {
  const { page = "1", pageSize = "20", status, grade, position, search } = req.query as Record<string, string>;
  const where: any = {};
  if (status) where.status = status;
  if (grade) where.grade = grade;
  if (position) where.position = position;
  if (search) {
    where.OR = [
      { memberId: { contains: search, mode: "insensitive" } },
      { fullName: { contains: search, mode: "insensitive" } },
      { grade: { contains: search, mode: "insensitive" } },
      { position: { contains: search, mode: "insensitive" } },
    ];
  }

  const members = await prisma.memberProfile.findMany({
    where,
    skip: (Number(page) - 1) * Number(pageSize),
    take: Number(pageSize),
    orderBy: { createdAt: "desc" },
  });
  const count = await prisma.memberProfile.count({ where });
  return res.json({ data: members, count });
});

router.post("/", requirePermission("manage_members"), async (req: AuthorizedRequest, res) => {
  const { memberId, fullName, grade, position, status = "ACTIVE", email, customFields } = req.body;
  if (!memberId || !fullName || !grade || !position) {
    return res.status(400).json({ error: "Member ID, full name, grade, and position are required." });
  }
  const existing = await prisma.memberProfile.findUnique({ where: { memberId } });
  if (existing) {
    return res.status(409).json({ error: "Member ID already exists." });
  }

  const memberRole = await prisma.role.findUnique({ where: { name: "MEMBER" } });
  if (!memberRole) return res.status(500).json({ error: "Member role is not configured." });

  const newMemberData = {
    memberId,
    fullName,
    grade,
    position,
    status,
    email,
    customFields: customFields || {},
  };

  if (!req.user?.isOwner) {
    const requestId = `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const approval = await prisma.approvalRequest.create({
      data: {
        requestId,
        requesterId: req.user!.id,
        requesterRole: req.user!.roles.join(","),
        actionType: "CREATE",
        targetType: "MEMBER",
        targetId: memberId,
        oldValue: {},
        newValue: newMemberData,
        reason: req.body.reason || "Member creation requested.",
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: req.user!.roles.join(","),
        action: "REQUEST_MEMBER_CREATE",
        targetType: "MEMBER",
        targetId: memberId,
        status: "PENDING",
        newValue: newMemberData,
      },
    });
    return res.status(202).json({ message: "Member creation request submitted for owner approval.", approval });
  }

  const { hashPassword } = await import("../utils/auth");
  const user = await prisma.user.create({
    data: {
      accountId: memberId,
      email,
      fullName,
      passwordHash: await hashPassword("ChangeMe123!"),
      status: "ACTIVE",
      forcePasswordReset: true,
      memberProfile: {
        create: { memberId, fullName, grade, position, status, photoUrl: null, customFields: customFields || {} },
      },
      roles: { create: [{ roleId: memberRole.id }] },
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(","),
      action: "CREATE_MEMBER",
      targetType: "MEMBER",
      targetId: memberId,
      status: "SUCCESS",
      newValue: newMemberData,
    },
  });
  return res.status(201).json({ message: "Member created.", userId: user.id });
});

router.put("/:memberId", requirePermission("manage_members"), async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;
  const { fullName, grade, position, status, email, customFields } = req.body;
  const member = await prisma.memberProfile.findUnique({ where: { memberId } });
  if (!member) {
    return res.status(404).json({ error: "Member not found." });
  }

  const updateData: any = {};
  if (fullName) updateData.fullName = fullName;
  if (grade) updateData.grade = grade;
  if (position) updateData.position = position;
  if (status) updateData.status = status;
  if (customFields) updateData.customFields = customFields;

  if (!req.user?.isOwner) {
    const requestId = `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const approval = await prisma.approvalRequest.create({
      data: {
        requestId,
        requesterId: req.user!.id,
        requesterRole: req.user!.roles.join(","),
        actionType: "UPDATE",
        targetType: "MEMBER",
        targetId: memberId,
        oldValue: member,
        newValue: updateData,
        reason: req.body.reason || "Member update requested.",
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: req.user!.roles.join(","),
        action: "REQUEST_MEMBER_UPDATE",
        targetType: "MEMBER",
        targetId: memberId,
        status: "PENDING",
        oldValue: member,
        newValue: updateData,
      },
    });
    return res.status(202).json({ message: "Member update request submitted for owner approval.", approval });
  }

  const updated = await prisma.memberProfile.update({ where: { memberId }, data: updateData });
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(","),
      action: "UPDATE_MEMBER",
      targetType: "MEMBER",
      targetId: memberId,
      status: "SUCCESS",
      oldValue: member,
      newValue: updateData,
    },
  });
  if (email || fullName) {
    await prisma.user.update({ where: { id: member.userId }, data: { email: email || undefined, fullName: fullName || undefined } });
  }
  return res.json({ message: "Member updated.", member: updated });
});

router.get("/:memberId/details", authenticate, async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;
  const member = await prisma.memberProfile.findUnique({ where: { memberId }, include: { user: true } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  const isAdmin = req.user?.isOwner || req.user?.roles.some((role) => ["SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"].includes(role));
  if (!isAdmin && member.userId !== req.user?.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const payments = await prisma.payment.findMany({ where: { memberId: member.id }, orderBy: { paymentDate: "desc" } });
  const receipts = await prisma.receipt.findMany({ where: { memberId: member.id }, orderBy: { issuedAt: "desc" } });
  const activities = await prisma.auditLog.findMany({ where: { targetType: "MEMBER", targetId: memberId }, orderBy: { createdAt: "desc" }, take: 20 });
  const typedPayments = payments as Array<{ paymentAmount: number; totalWeeks: number }>;
  const totalPaid = typedPayments.reduce((sum, payment) => sum + payment.paymentAmount, 0);
  const paidWeeks = typedPayments.reduce((sum, payment) => sum + payment.totalWeeks, 0);
  const balanceWeeks = 4 - Math.min(4, paidWeeks % 4);
  const balanceMonths = Number((balanceWeeks / 4).toFixed(2));
  const balanceRupees = balanceWeeks * 50;

  return res.json({ member, payments, receipts, activities, summary: { totalPaid, paidWeeks, balanceWeeks, balanceMonths, balanceRupees } });
});

router.get("/me", authenticate, async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const member = await prisma.memberProfile.findFirst({ where: { userId: req.user.id } });
  if (!member) return res.status(404).json({ error: "Member profile not found." });
  return res.json(member);
});

router.get("/:memberId", authenticate, async (req: AuthorizedRequest, res) => {
  const member = await prisma.memberProfile.findUnique({ where: { memberId: req.params.memberId } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  const currentUser = req.user;
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!currentUser.isOwner && !currentUser.roles.includes("OWNER") && !currentUser.roles.includes("SUPER_ADMIN") && !currentUser.roles.includes("ADMINISTRATOR") && !currentUser.roles.includes("ADMIN") && member.userId !== currentUser.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return res.json(member);
});

export default router;
