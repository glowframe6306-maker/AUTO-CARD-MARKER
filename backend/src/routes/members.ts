import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

router.get("/", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
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

router.post("/", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
  const { memberId, fullName, grade, position, status = "ACTIVE", email, customFields } = req.body;
  if (!memberId || !fullName || !grade || !position) {
    return res.status(400).json({ error: "Member ID, full name, grade, and position are required." });
  }
  const existing = await prisma.memberProfile.findUnique({ where: { memberId } });
  if (existing) {
    return res.status(409).json({ error: "Member ID already exists." });
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
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: (await prisma.role.findUnique({ where: { name: "MEMBER" } }))!.id } });
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(","),
      action: "CREATE_MEMBER",
      targetType: "MEMBER",
      targetId: memberId,
      status: "SUCCESS",
    },
  });
  return res.status(201).json({ message: "Member created." });
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
  if (!req.user?.isOwner && !req.user.roles.includes("OWNER") && !req.user.roles.includes("SUPER_ADMIN") && !req.user.roles.includes("ADMINISTRATOR") && !req.user.roles.includes("ADMIN") && member.userId !== req.user?.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return res.json(member);
});

export default router;
