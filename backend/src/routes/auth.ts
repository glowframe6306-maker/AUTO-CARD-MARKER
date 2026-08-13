import { Router } from "express";
import prisma from "../prisma";
import { v4 as uuidv4 } from "uuid";
import { verifyPassword, generateToken, hashPassword } from "../utils/auth";
import { authenticate, AuthorizedRequest, requireAnyRole } from "../middleware/authMiddleware";

const router = Router();

router.post("/login", async (req, res) => {
  const { accountId, password } = req.body;
  if (!accountId || !password) {
    return res.status(400).json({ error: "Account ID and password are required." });
  }

  const user = await prisma.user.findUnique({
    where: { accountId },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  if (user.status !== "ACTIVE") {
    return res.status(403).json({ error: "Account is not active." });
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

  const roleAssignments = user.roles as Array<{ role: { name: string; permissions?: Array<{ permission: { name: string } }> } }>;
  const roles = roleAssignments.map((assignment) => assignment.role.name);
  const permissions = Array.from(
    new Set(
      roleAssignments.flatMap((assignment) =>
        assignment.role.permissions?.map((permission) => permission.permission.name) || []
      )
    )
  );

  const deviceIdentifier = uuidv4();

  const token = generateToken({ id: user.id, accountId: user.accountId, roles, permissions, isOwner: user.isOwner, deviceIdentifier });

  // Record or update a device record for this login
  try {
    const userAgent = (req.headers["user-agent"] as string) || "Unknown";
    await prisma.device.create({
      data: {
        userId: user.id,
        deviceName: userAgent.slice(0, 200),
        platform: userAgent.slice(0, 200),
        browser: userAgent.slice(0, 200),
        ipAddress: req.ip,
        trusted: false,
        lastActive: new Date(),
        deviceIdentifier,
      },
    });
  } catch (err) {
    // ignore device write errors, don't block login
    console.warn("Device record creation failed", err);
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.isOwner ? "OWNER" : roles.join(","),
      action: "LOGIN",
      targetType: "USER",
      targetId: user.accountId,
      status: "SUCCESS",
      reason: "User login successful",
    },
  });

  return res.json({ token, forcePasswordReset: user.forcePasswordReset, roles, permissions, isOwner: user.isOwner });
});

router.get("/me", authenticate, async (req: AuthorizedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, memberProfile: true },
  });
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const roleAssignments = user.roles as Array<{ role: { name: string; permissions?: Array<{ permission: { name: string } }> } }>;
  const roles = roleAssignments.map((assignment) => assignment.role.name);
  const permissions = Array.from(
    new Set(
      roleAssignments.flatMap((assignment) =>
        assignment.role.permissions?.map((permission) => permission.permission.name) || []
      )
    )
  );
  return res.json({
    accountId: user.accountId,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    isOwner: user.isOwner,
    roles,
    permissions,
    verificationPolicy: user.verificationPolicy,
    deviceIdentifier: req.user?.deviceIdentifier,
    memberProfile: user.memberProfile,
  });
});

router.post("/reset-password", authenticate, async (req: AuthorizedRequest, res) => {
  const { accountId, newPassword } = req.body;
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const currentUser = req.user;
  if (!accountId || !newPassword) {
    return res.status(400).json({ error: "Account ID and new password are required." });
  }
  if (currentUser.accountId !== accountId && !currentUser.isOwner) {
    return res.status(403).json({ error: "Forbidden." });
  }
  const user = await prisma.user.findUnique({ where: { accountId } });
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, forcePasswordReset: false } });
  await prisma.auditLog.create({
    data: {
      actorId: currentUser.id,
      actorRole: currentUser.isOwner ? "OWNER" : currentUser.roles.join(","),
      action: "PASSWORD_RESET",
      targetType: "USER",
      targetId: user.accountId,
      status: "SUCCESS",
      reason: "Password reset completed",
    },
  });
  return res.json({ message: "Password has been reset." });
});

router.post("/unblock/:accountId", authenticate, requireAnyRole(["OWNER", "SUPER_ADMIN"]), async (req: AuthorizedRequest, res) => {
  const currentUser = req.user;
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { accountId } = req.params;
  const user = await prisma.user.findUnique({ where: { accountId } });
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: null, failedLoginAttempts: 0 } });
  await prisma.securityEvent.create({
    data: {
      userId: user.id,
      eventType: "ACCOUNT_UNLOCKED",
      details: { unblockedBy: currentUser.id },
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: currentUser.id,
      actorRole: currentUser.isOwner ? "OWNER" : currentUser.roles.join(","),
      action: "UNBLOCK_ACCOUNT",
      targetType: "USER",
      targetId: user.accountId,
      status: "SUCCESS",
      reason: "Account unlocked by authorized staff",
    },
  });
  return res.json({ message: "Account has been unblocked." });
});

export default router;
