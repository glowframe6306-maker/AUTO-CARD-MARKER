import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";
import { hashPassword } from "../utils/auth";

const router = Router();
router.use(authenticate);

router.get("/", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]), async (req: AuthorizedRequest, res) => {
  const users = await prisma.user.findMany({ include: { roles: { include: { role: true } }, memberProfile: true } });
  return res.json(users);
});

router.post("/", requireAnyRole(["OWNER", "SUPER_ADMIN"]), async (req: AuthorizedRequest, res) => {
  const { accountId, fullName, email, password, roleName } = req.body;
  if (!accountId || !fullName || !password || !roleName) {
    return res.status(400).json({ error: "Required fields: accountId, fullName, password, roleName." });
  }
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) return res.status(400).json({ error: "Role not found." });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      accountId,
      fullName,
      email,
      passwordHash,
      status: "ACTIVE",
      forcePasswordReset: true,
      roles: { create: [{ roleId: role.id }] },
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(","),
      action: "CREATE_USER",
      targetType: "USER",
      targetId: accountId,
      status: "SUCCESS",
    },
  });
  return res.status(201).json(user);
});

export default router;
