import { Router } from "express";
import prisma from "../prisma";
import { verifyPassword, generateToken, hashPassword } from "../utils/auth";
import { AuditLog } from "@prisma/client";

const router = Router();

router.post("/login", async (req, res) => {
  const { accountId, password } = req.body;
  if (!accountId || !password) {
    return res.status(400).json({ error: "Account ID and password are required." });
  }

  const user = await prisma.user.findUnique({
    where: { accountId },
    include: { roles: { include: { role: true } } },
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return res.status(403).json({ error: "Account temporarily locked." });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: user.failedLoginAttempts + 1, lastFailedLoginAt: new Date() },
    });
    if (user.failedLoginAttempts + 1 >= 3) {
      const unlockAt = new Date(Date.now() + 15 * 60 * 1000);
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: unlockAt } });
      await prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: "ACCOUNT_LOCKED",
          details: { reason: "Too many failed logins" },
        },
      });
      return res.status(403).json({ error: "Account locked due to failed login attempts." });
    }
    return res.status(401).json({ error: "Invalid credentials." });
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });

  const roles = user.roles.map((userRole) => userRole.role.name);
  const token = generateToken({ id: user.id, accountId: user.accountId, roles, isOwner: user.isOwner });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: roles.join(","),
      action: "LOGIN",
      targetType: "USER",
      targetId: user.accountId,
      status: "SUCCESS",
      reason: "User login successful",
    },
  });

  return res.json({ token, forcePasswordReset: user.forcePasswordReset });
});

router.post("/reset-password", async (req, res) => {
  const { accountId, newPassword } = req.body;
  if (!accountId || !newPassword) {
    return res.status(400).json({ error: "Account ID and new password are required." });
  }

  const user = await prisma.user.findUnique({ where: { accountId } });
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, forcePasswordReset: false } });
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.isOwner ? "OWNER" : "USER",
      action: "PASSWORD_RESET",
      targetType: "USER",
      targetId: user.accountId,
      status: "SUCCESS",
      reason: "Password reset requested",
    },
  });

  return res.json({ message: "Password has been reset." });
});

export default router;
