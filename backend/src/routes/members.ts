import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate, requireAnyRole, requirePermission, AuthorizedRequest } from "../middleware/authMiddleware";
import prisma from "../prisma";
const router = Router();

const profileUploadBase =
  process.env.UPLOAD_BASE_PATH || path.resolve(__dirname, "../../../uploads/secure");

fs.mkdirSync(profileUploadBase, { recursive: true });

const profilePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, profileUploadBase);
    },
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `profile-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const accepted = ["image/jpeg", "image/png", "image/webp"];
    if (!accepted.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, and WEBP images are allowed."));
    }
    cb(null, true);
  },
});

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
    include: {
      user: {
        select: {
          id: true,
          accountId: true,
          email: true,
          fullName: true,
          status: true,
          isOwner: true,
          roles: {
            include: {
              role: {
                select: { name: true }
              }
            }
          }
        }
      }
    },
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
  const { getSecondaryPasswordHash } = await import("../utils/secondaryPassword");
  const user = await prisma.user.create({
    data: {
      accountId: memberId,
      email,
      fullName,
      passwordHash: await hashPassword("ChangeMe123!"),
      secondaryPasswordHash: await getSecondaryPasswordHash(),
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

/*
 * MEMBER SELF PROFILE
 * Members can edit ONLY:
 * - Full name
 * - Age
 * - Profile photo
 *
 * Email, RC number, position, and status remain read-only.
 */

router.get("/me/profile", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const member = await prisma.memberProfile.findFirst({
    where: { userId: req.user.id },
    include: {
      user: {
        select: {
          email: true,
          status: true,
        },
      },
    },
  });

  if (!member) {
    return res.status(404).json({ error: "Member profile not found." });
  }

  const customFields =
    member.customFields &&
    typeof member.customFields === "object" &&
    !Array.isArray(member.customFields)
      ? member.customFields as Record<string, unknown>
      : {};

  return res.json({
    memberId: member.memberId,
    fullName: member.fullName,
    age: customFields.age ?? "",
    email: member.user.email ?? "",
    position: member.position,
    status: member.user.status === "BLOCKED" ? "BLOCKED" : "ACTIVE",
    photoUrl: member.photoUrl,
  });
});

router.put("/me/profile", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const member = await prisma.memberProfile.findFirst({
    where: { userId: req.user.id },
  });

  if (!member) {
    return res.status(404).json({ error: "Member profile not found." });
  }

  const { fullName, age } = req.body;

  const updateData: any = {};

  if (typeof fullName === "string" && fullName.trim()) {
    updateData.fullName = fullName.trim();
  }

  const existingCustomFields =
    member.customFields &&
    typeof member.customFields === "object" &&
    !Array.isArray(member.customFields)
      ? member.customFields as Record<string, unknown>
      : {};

  if (age !== undefined) {
    const ageNumber = Number(age);

    if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
      return res.status(400).json({ error: "Please enter a valid age." });
    }

    updateData.customFields = {
      ...existingCustomFields,
      age: ageNumber,
    };
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No editable profile information was provided." });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.memberProfile.update({
      where: { id: member.id },
      data: updateData,
    });

    if (typeof updateData.fullName === "string") {
      await tx.user.update({
        where: { id: member.userId },
        data: { fullName: updateData.fullName },
      });
    }

    return result;
  });

  return res.json({
    message: "Profile updated successfully.",
    member: updated,
  });
});

router.post(
  "/me/profile/photo",
  profilePhotoUpload.single("photo"),
  async (req: AuthorizedRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    if (!req.file) {
      return res.status(400).json({ error: "Please select a profile photo." });
    }

    const member = await prisma.memberProfile.findFirst({
      where: { userId: req.user.id },
    });

    if (!member) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Member profile not found." });
    }

    const photoUrl = `/uploads/secure/${req.file.filename}`;

    const updated = await prisma.memberProfile.update({
      where: { id: member.id },
      data: { photoUrl },
    });

    return res.json({
      message: "Profile photo updated successfully.",
      photoUrl: updated.photoUrl,
    });
  }
);
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
  const isOwner = req.user?.isOwner === true;
  if (!isOwner && member.userId !== req.user?.id) {
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

  router.get("/me/activity", authenticate, async (req: AuthorizedRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const activity = await prisma.auditLog.findMany({
        where: {
          actorId: req.user.id,
          action: {
            in: ["LOGIN", "LOGOUT"],
          },
          status: "SUCCESS",
        },
        select: {
          id: true,
          action: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      });

      return res.json(activity);
    } catch (error) {
      console.error("Failed to load member activity:", error);
      return res.status(500).json({
        error: "Unable to load recent activity.",
      });
    }
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
  if (currentUser.isOwner !== true && member.userId !== currentUser.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return res.json(member);
});

/*
 * OWNER MEMBER MANAGEMENT
 * Block / Unblock / Activate / Deactivate / Delete
 */

router.post("/:memberId/block", requirePermission("manage_members"), async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;

  if (!req.user?.isOwner) {
    return res.status(403).json({ error: "Only the Owner can block members." });
  }

  const member = await prisma.memberProfile.findUnique({
    where: { memberId },
    include: { user: true },
  });

  if (!member) {
    return res.status(404).json({ error: "Member not found." });
  }

  if (member.user.isOwner) {
    return res.status(403).json({ error: "The Owner account cannot be blocked." });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: member.userId },
      data: { status: "BLOCKED" },
    }),
    prisma.memberProfile.update({
      where: { memberId },
      data: { status: "SUSPENDED" },
    }),
    prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorRole: req.user.roles.join(","),
        action: "BLOCK_MEMBER",
        targetType: "MEMBER",
        targetId: memberId,
        status: "SUCCESS",
        oldValue: {
          userStatus: member.user.status,
          memberStatus: member.status,
        },
        newValue: {
          userStatus: "BLOCKED",
          memberStatus: "SUSPENDED",
        },
      },
    }),
  ]);

  return res.json({
    message: "Member blocked successfully.",
  });
});


router.post("/:memberId/unblock", requirePermission("manage_members"), async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;

  if (!req.user?.isOwner) {
    return res.status(403).json({ error: "Only the Owner can unblock members." });
  }

  const member = await prisma.memberProfile.findUnique({
    where: { memberId },
    include: { user: true },
  });

  if (!member) {
    return res.status(404).json({ error: "Member not found." });
  }

  if (member.user.isOwner) {
    return res.status(403).json({ error: "The Owner account cannot be modified." });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: member.userId },
      data: { status: "ACTIVE" },
    }),
    prisma.memberProfile.update({
      where: { memberId },
      data: { status: "ACTIVE" },
    }),
    prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorRole: req.user.roles.join(","),
        action: "UNBLOCK_MEMBER",
        targetType: "MEMBER",
        targetId: memberId,
        status: "SUCCESS",
        oldValue: {
          userStatus: member.user.status,
          memberStatus: member.status,
        },
        newValue: {
          userStatus: "ACTIVE",
          memberStatus: "ACTIVE",
        },
      },
    }),
  ]);

  return res.json({
    message: "Member unblocked successfully.",
  });
});


router.post("/:memberId/activate", requirePermission("manage_members"), async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;

  if (!req.user?.isOwner) {
    return res.status(403).json({ error: "Only the Owner can activate members." });
  }

  const member = await prisma.memberProfile.findUnique({
    where: { memberId },
    include: { user: true },
  });

  if (!member) {
    return res.status(404).json({ error: "Member not found." });
  }

  if (member.user.isOwner) {
    return res.status(403).json({ error: "The Owner account cannot be modified." });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: member.userId },
      data: { status: "ACTIVE" },
    }),
    prisma.memberProfile.update({
      where: { memberId },
      data: { status: "ACTIVE" },
    }),
  ]);

  return res.json({
    message: "Member activated successfully.",
  });
});


router.post("/:memberId/deactivate", requirePermission("manage_members"), async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;

  if (!req.user?.isOwner) {
    return res.status(403).json({ error: "Only the Owner can deactivate members." });
  }

  const member = await prisma.memberProfile.findUnique({
    where: { memberId },
    include: { user: true },
  });

  if (!member) {
    return res.status(404).json({ error: "Member not found." });
  }

  if (member.user.isOwner) {
    return res.status(403).json({ error: "The Owner account cannot be modified." });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: member.userId },
      data: { status: "INACTIVE" },
    }),
    prisma.memberProfile.update({
      where: { memberId },
      data: { status: "INACTIVE" },
    }),
  ]);

  return res.json({
    message: "Member deactivated successfully.",
  });
});


router.delete("/:memberId", requirePermission("manage_members"), async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;

  if (!req.user?.isOwner) {
    return res.status(403).json({
      error: "Only the Owner can delete members."
    });
  }

  const member = await prisma.memberProfile.findUnique({
    where: { memberId },
    include: { user: true },
  });

  if (!member) {
    return res.status(404).json({
      error: "Member not found."
    });
  }

  if (member.user.isOwner) {
    return res.status(403).json({
      error: "The Owner account cannot be deleted."
    });
  }

  const userId = member.userId;
  const ownerId = req.user.id;

  try {
    await prisma.$transaction(async (tx) => {

      /*
       * Delete role assignments first.
       * This directly resolves UserRole_userId_fkey.
       */
      await tx.userRole.deleteMany({
        where: { userId }
      });

      /*
       * Remove member payment requests.
       */
      await tx.paymentRequest.deleteMany({
        where: {
          memberId: member.id
        }
      });

      /*
       * Remove receipts and payments belonging to this member.
       */
      const payments = await tx.payment.findMany({
        where: {
          memberId: member.id
        },
        select: {
          id: true
        }
      });

      const paymentIds = payments.map((item) => item.id);

      if (paymentIds.length > 0) {
        await tx.cardUpload.updateMany({
          where: {
            paymentId: {
              in: paymentIds
            }
          },
          data: {
            paymentId: null
          }
        });

        await tx.receipt.deleteMany({
          where: {
            paymentId: {
              in: paymentIds
            }
          }
        });

        await tx.auditLog.deleteMany({
          where: {
            paymentId: {
              in: paymentIds
            }
          }
        });

        await tx.payment.deleteMany({
          where: {
            id: {
              in: paymentIds
            }
          }
        });
      }

      await tx.receipt.deleteMany({
        where: {
          memberId: member.id
        }
      });

      /*
       * Remove member card uploads and OCR records.
       */
      const uploads = await tx.cardUpload.findMany({
        where: {
          memberId: member.id
        },
        select: {
          id: true
        }
      });

      const uploadIds = uploads.map((item) => item.id);

      if (uploadIds.length > 0) {
        const ocrResults = await tx.ocrResult.findMany({
          where: {
            cardUploadId: {
              in: uploadIds
            }
          },
          select: {
            id: true
          }
        });

        const ocrIds = ocrResults.map((item) => item.id);

        if (ocrIds.length > 0) {
          await tx.ocrReview.deleteMany({
            where: {
              ocrResultId: {
                in: ocrIds
              }
            }
          });
        }

        await tx.ocrResult.deleteMany({
          where: {
            cardUploadId: {
              in: uploadIds
            }
          }
        });

        await tx.cardUpload.deleteMany({
          where: {
            id: {
              in: uploadIds
            }
          }
        });
      }

      /*
       * Remove the user's security verification/device records.
       */
      await tx.cameraVerificationSession.deleteMany({
        where: {
          OR: [
            { userId },
            { requestedById: userId }
          ]
        }
      });

      await tx.securityEvent.deleteMany({
        where: {
          userId
        }
      });

      await tx.device.deleteMany({
        where: {
          userId
        }
      });

      await tx.notification.deleteMany({
        where: {
          recipientId: userId
        }
      });

      /*
       * Preserve historical records that require a valid user.
       */
      await tx.payment.updateMany({
        where: {
          recordedById: userId
        },
        data: {
          recordedById: ownerId
        }
      });

      await tx.receipt.updateMany({
        where: {
          issuedById: userId
        },
        data: {
          issuedById: ownerId
        }
      });

      await tx.ocrReview.updateMany({
        where: {
          reviewerId: userId
        },
        data: {
          reviewerId: ownerId
        }
      });

      /*
       * Nullable references.
       */
      await tx.approvalRequest.updateMany({
        where: {
          requesterId: userId
        },
        data: {
          requesterId: null
        }
      });

      await tx.approvalRequest.updateMany({
        where: {
          reviewerId: userId
        },
        data: {
          reviewerId: null
        }
      });

      await tx.paymentRequest.updateMany({
        where: {
          reviewedById: userId
        },
        data: {
          reviewedById: null
        }
      });

      await tx.paymentRequest.updateMany({
        where: {
          processedById: userId
        },
        data: {
          processedById: null
        }
      });

      await tx.monthlyRecord.updateMany({
        where: {
          closedById: userId
        },
        data: {
          closedById: null
        }
      });

      /*
       * Keep old audit history valid by assigning it to Owner.
       */
      await tx.auditLog.updateMany({
        where: {
          actorId: userId
        },
        data: {
          actorId: ownerId
        }
      });

      /*
       * User-owned records.
       */
      await tx.backup.deleteMany({
        where: {
          initiatedById: userId
        }
      });

      await tx.collectionSession.deleteMany({
        where: {
          ownerId: userId
        }
      });

      /*
       * Delete MemberProfile.
       */
      await tx.memberProfile.delete({
        where: {
          memberId
        }
      });

      /*
       * Final permanent User delete.
       * UserRole rows were already removed above.
       */
      await tx.user.delete({
        where: {
          id: userId
        }
      });

      /*
       * Save successful deletion audit under Owner.
       */
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          actorRole: req.user!.roles.join(","),
          action: "DELETE_MEMBER",
          targetType: "MEMBER",
          targetId: memberId,
          status: "SUCCESS",
          oldValue: {
            accountId: member.user.accountId,
            fullName: member.user.fullName,
            email: member.user.email,
          },
        },
      });
    });

    return res.json({
      message: "Member account deleted permanently."
    });

  } catch (error: any) {
    console.error("Permanent member deletion failed:", error);

    return res.status(500).json({
      error: "Member deletion failed.",
      details:
        process.env.NODE_ENV === "production"
          ? undefined
          : error?.message || "Unknown database error."
    });
  }
});
export default router;


















