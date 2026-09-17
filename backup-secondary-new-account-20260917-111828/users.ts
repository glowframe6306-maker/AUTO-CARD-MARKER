import { Router } from "express";
import prisma from "../prisma";
import {
  authenticate,
  requireAnyRole,
  AuthorizedRequest,
} from "../middleware/authMiddleware";
import { hashPassword } from "../utils/auth";

const router = Router();

router.use(authenticate);

/*
 * GET USERS
 *
 * Owner/Admin management users.
 */
router.get(
  "/",
  requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR"]),
  async (req: AuthorizedRequest, res) => {
    try {
      const users = await prisma.user.findMany({
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          memberProfile: true,
        },
        orderBy: {
          id: "asc",
        },
      });

      return res.json(users);
    } catch (error) {
      console.error("Failed to load users:", error);

      return res.status(500).json({
        error: "Failed to load users.",
      });
    }
  }
);

/*
 * CREATE USER
 */
router.post(
  "/",
  requireAnyRole(["OWNER", "SUPER_ADMIN"]),
  async (req: AuthorizedRequest, res) => {
    try {
      const {
        accountId,
        fullName,
        email,
        password,
        roleName,
      } = req.body;

      if (!accountId || !fullName || !password || !roleName) {
        return res.status(400).json({
          error:
            "Required fields: accountId, fullName, password, roleName.",
        });
      }

      const role = await prisma.role.findUnique({
        where: {
          name: roleName,
        },
      });

      if (!role) {
        return res.status(400).json({
          error: "Role not found.",
        });
      }

      const passwordHash = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          accountId,
          fullName,
          email,
          passwordHash,
          status: "ACTIVE",
          forcePasswordReset: true,
          roles: {
            create: [
              {
                roleId: role.id,
              },
            ],
          },
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
    } catch (error) {
      console.error("Failed to create user:", error);

      return res.status(500).json({
        error: "Failed to create user.",
      });
    }
  }
);

/*
 * UPDATE USER ROLE
 *
 * REAL OWNER ONLY.
 *
 * This endpoint intentionally does NOT allow an ordinary
 * ADMINISTRATOR/SUPER_ADMIN account to change roles.
 *
 * Allowed assignment roles:
 *   MEMBER
 *   ADMIN
 */
router.patch(
  "/:id/role",
  async (req: AuthorizedRequest, res) => {
    try {
      if (!req.user?.isOwner) {
        return res.status(403).json({
          error: "Forbidden. Only the Owner can assign user roles.",
        });
      }

      const userId = Number(req.params.id);

      if (!Number.isInteger(userId)) {
        return res.status(400).json({
          error: "Invalid user ID.",
        });
      }

      const { roleName } = req.body;

      if (!["MEMBER", "ADMIN"].includes(roleName)) {
        return res.status(400).json({
          error: "Role must be MEMBER or ADMIN.",
        });
      }

      const targetUser = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!targetUser) {
        return res.status(404).json({
          error: "User not found.",
        });
      }

      /*
       * Never change the real Owner account through this UI.
       */
      if (targetUser.isOwner) {
        return res.status(403).json({
          error: "The Owner account cannot be reassigned.",
        });
      }

      const role = await prisma.role.findUnique({
        where: {
          name: roleName,
        },
      });

      if (!role) {
        return res.status(400).json({
          error: `Role '${roleName}' was not found.`,
        });
      }

      /*
       * Replace the user's existing role assignments
       * with the selected role.
       */
      await prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({
          where: {
            userId,
          },
        });

        await tx.userRole.create({
          data: {
            userId,
            roleId: role.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user!.id,
            actorRole: req.user!.roles.join(","),
            action: "UPDATE_USER_ROLE",
            targetType: "USER",
            targetId: targetUser.accountId,
            status: "SUCCESS",
          },
        });
      });

      const updatedUser = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          memberProfile: true,
        },
      });

      return res.json({
        success: true,
        message: `User role updated to ${roleName}.`,
        user: updatedUser,
      });
    } catch (error) {
      console.error("Failed to update user role:", error);

      return res.status(500).json({
        error: "Failed to update user role.",
      });
    }
  }
);

export default router;


