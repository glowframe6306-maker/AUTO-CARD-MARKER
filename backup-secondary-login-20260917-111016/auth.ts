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
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
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
      data: {
        failedLoginAttempts: user.failedLoginAttempts + 1,
        lastFailedLoginAt: new Date(),
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.isOwner ? "OWNER" : "MEMBER",
          action: "LOGIN_FAILED",
          targetType: "USER",
          targetId: user.accountId,
          oldValue: {
            failedLoginAttempts: user.failedLoginAttempts,
          },
          newValue: {
            failedLoginAttempts: user.failedLoginAttempts + 1,
          },
          status: "FAILED",
          reason: "Invalid login credentials",
        },
      });
    } catch (auditError) {
      console.error("Failed login audit log error:", auditError);
    }

    if (user.failedLoginAttempts + 1 >= 3) {
      const unlockAt = new Date(Date.now() + 15 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: unlockAt },
      });

      await prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: "ACCOUNT_LOCKED",
          details: { reason: "Too many failed logins" },
        },
      });

      return res.status(403).json({
        error: "Account locked due to failed login attempts.",
      });
    }

    return res.status(401).json({ error: "Invalid credentials." });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  const roleAssignments = user.roles as Array<{
    role: {
      name: string;
      permissions?: Array<{
        permission: { name: string };
      }>;
    };
  }>;

  const roles = roleAssignments.map((assignment) => assignment.role.name);

  const permissions = Array.from(
    new Set(
      roleAssignments.flatMap(
        (assignment) =>
          assignment.role.permissions?.map(
            (permission) => permission.permission.name
          ) || []
      )
    )
  );

  const deviceIdentifier = uuidv4();

  try {
    const userAgent =
      (req.headers["user-agent"] as string) || "Unknown";

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { latestDeviceIdentifier: deviceIdentifier },
      });

      await tx.device.create({
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
    });
  } catch (err) {
    console.warn("Device record creation failed", err);
  }

  const token = generateToken({
    id: user.id,
    accountId: user.accountId,
    roles,
    permissions,
    isOwner: user.isOwner,
    deviceIdentifier,
  });

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

  return res.json({
    token,
    forcePasswordReset: user.forcePasswordReset,
    roles,
    permissions,
    isOwner: user.isOwner,
  });
});


/*
 * LOGOUT
 * Records the logout event before the client removes its token.
 */
router.post("/logout", authenticate, async (req: AuthorizedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorRole: req.user.isOwner
          ? "OWNER"
          : req.user.roles.join(","),
        action: "LOGOUT",
        targetType: "USER",
        targetId: req.user.accountId,
        status: "SUCCESS",
        reason: "User logout successful",
      },
    });
  } catch (err) {
    console.error("Logout audit log failed:", err);
  }

  return res.json({
    success: true,
    message: "Logged out successfully.",
  });
});


router.get("/me", authenticate, async (req: AuthorizedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
      memberProfile: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const roleAssignments = user.roles as Array<{
    role: {
      name: string;
      permissions?: Array<{
        permission: { name: string };
      }>;
    };
  }>;

  const roles = roleAssignments.map((assignment) => assignment.role.name);

  const permissions = Array.from(
    new Set(
      roleAssignments.flatMap(
        (assignment) =>
          assignment.role.permissions?.map(
            (permission) => permission.permission.name
          ) || []
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



router.patch("/me", authenticate, async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const { fullName, email } = req.body;

    const data: { fullName?: string; email?: string | null } = {};

    if (typeof fullName === "string") {
      const cleanedFullName = fullName.trim();

      if (!cleanedFullName) {
        return res.status(400).json({
          error: "Full name cannot be empty.",
        });
      }

      data.fullName = cleanedFullName;
    }

    if (email !== undefined) {
      if (email === null || email === "") {
        data.email = null;
      } else if (typeof email === "string") {
        data.email = email.trim().toLowerCase();
      } else {
        return res.status(400).json({
          error: "Invalid email address.",
        });
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        error: "No profile changes were provided.",
      });
    }

    if (data.email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          email: data.email,
          NOT: {
            id: req.user.id,
          },
        },
      });

      if (existingEmail) {
        return res.status(409).json({
          error: "That email address is already in use.",
        });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data,
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        memberProfile: true,
      },
    });

    const roleAssignments = updatedUser.roles as Array<{
      role: {
        name: string;
        permissions?: Array<{
          permission: { name: string };
        }>;
      };
    }>;

    const roles = roleAssignments.map((assignment) => assignment.role.name);

    const permissions = Array.from(
      new Set(
        roleAssignments.flatMap(
          (assignment) =>
            assignment.role.permissions?.map(
              (permission) => permission.permission.name
            ) || []
        )
      )
    );

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      accountId: updatedUser.accountId,
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      status: updatedUser.status,
      isOwner: updatedUser.isOwner,
      roles,
      permissions,
      verificationPolicy: updatedUser.verificationPolicy,
      deviceIdentifier: req.user.deviceIdentifier,
      memberProfile: updatedUser.memberProfile,
    });
  } catch (err: any) {
    console.error("Profile update failed:", err);

    if (err?.code === "P2002") {
      return res.status(409).json({
        error: "That email address is already in use.",
      });
    }

    return res.status(500).json({
      error: "Unable to update profile.",
    });
  }
});
router.post("/change-password", authenticate, async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { currentPassword, newPassword } = req.body ?? {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Current password and new password are required.",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({
        error: "New password must contain at least 8 characters.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    const passwordValid = await verifyPassword(
      currentPassword,
      user.passwordHash
    );

    if (!passwordValid) {
      return res.status(401).json({
        error: "Current password is incorrect.",
      });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        forcePasswordReset: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorRole: req.user.isOwner
          ? "OWNER"
          : req.user.roles.join(","),
        action: "PASSWORD_CHANGE",
        targetType: "USER",
        targetId: user.accountId,
        status: "SUCCESS",
        reason: "Password changed successfully",
      },
    });

    return res.json({
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);

    return res.status(500).json({
      error: "Unable to change password.",
    });
  }
});
router.post("/reset-password", authenticate, async (req: AuthorizedRequest, res) => {
  const { accountId, newPassword } = req.body;

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const currentUser = req.user;

  if (!accountId || !newPassword) {
    return res.status(400).json({
      error: "Account ID and new password are required.",
    });
  }

  if (currentUser.accountId !== accountId && !currentUser.isOwner) {
    return res.status(403).json({ error: "Forbidden." });
  }

  const user = await prisma.user.findUnique({
    where: { accountId },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      forcePasswordReset: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: currentUser.id,
      actorRole: currentUser.isOwner
        ? "OWNER"
        : currentUser.roles.join(","),
      action: "PASSWORD_RESET",
      targetType: "USER",
      targetId: user.accountId,
      status: "SUCCESS",
      reason: "Password reset completed",
    },
  });

  return res.json({
    message: "Password has been reset.",
  });
});


router.post(
  "/unblock/:accountId",
  authenticate,
  requireAnyRole(["OWNER", "SUPER_ADMIN"]),
  async (req: AuthorizedRequest, res) => {
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { accountId } = req.params;

    const user = await prisma.user.findUnique({
      where: { accountId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lockedUntil: null,
        failedLoginAttempts: 0,
      },
    });

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
        actorRole: currentUser.isOwner
          ? "OWNER"
          : currentUser.roles.join(","),
        action: "UNBLOCK_ACCOUNT",
        targetType: "USER",
        targetId: user.accountId,
        status: "SUCCESS",
        reason: "Account unlocked by authorized staff",
      },
    });

    return res.json({
      message: "Account has been unblocked.",
    });
  }
);

export default router;



