"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.get("/", (0, authMiddleware_1.requirePermission)("manage_members"), async (req, res) => {
    const { page = "1", pageSize = "20", status, grade, position, search } = req.query;
    const where = {};
    if (status)
        where.status = status;
    if (grade)
        where.grade = grade;
    if (position)
        where.position = position;
    if (search) {
        where.OR = [
            { memberId: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
            { grade: { contains: search, mode: "insensitive" } },
            { position: { contains: search, mode: "insensitive" } },
        ];
    }
    const members = await prisma_1.default.memberProfile.findMany({
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
    const count = await prisma_1.default.memberProfile.count({ where });
    return res.json({ data: members, count });
});
router.post("/", (0, authMiddleware_1.requirePermission)("manage_members"), async (req, res) => {
    const { memberId, fullName, grade, position, status = "ACTIVE", email, customFields } = req.body;
    if (!memberId || !fullName || !grade || !position) {
        return res.status(400).json({ error: "Member ID, full name, grade, and position are required." });
    }
    const existing = await prisma_1.default.memberProfile.findUnique({ where: { memberId } });
    if (existing) {
        return res.status(409).json({ error: "Member ID already exists." });
    }
    const memberRole = await prisma_1.default.role.findUnique({ where: { name: "MEMBER" } });
    if (!memberRole)
        return res.status(500).json({ error: "Member role is not configured." });
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
        const approval = await prisma_1.default.approvalRequest.create({
            data: {
                requestId,
                requesterId: req.user.id,
                requesterRole: req.user.roles.join(","),
                actionType: "CREATE",
                targetType: "MEMBER",
                targetId: memberId,
                oldValue: {},
                newValue: newMemberData,
                reason: req.body.reason || "Member creation requested.",
            },
        });
        await prisma_1.default.auditLog.create({
            data: {
                actorId: req.user.id,
                actorRole: req.user.roles.join(","),
                action: "REQUEST_MEMBER_CREATE",
                targetType: "MEMBER",
                targetId: memberId,
                status: "PENDING",
                newValue: newMemberData,
            },
        });
        return res.status(202).json({ message: "Member creation request submitted for owner approval.", approval });
    }
    const { hashPassword } = await Promise.resolve().then(() => __importStar(require("../utils/auth")));
    const user = await prisma_1.default.user.create({
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
    await prisma_1.default.auditLog.create({
        data: {
            actorId: req.user.id,
            actorRole: req.user.roles.join(","),
            action: "CREATE_MEMBER",
            targetType: "MEMBER",
            targetId: memberId,
            status: "SUCCESS",
            newValue: newMemberData,
        },
    });
    return res.status(201).json({ message: "Member created.", userId: user.id });
});
router.put("/:memberId", (0, authMiddleware_1.requirePermission)("manage_members"), async (req, res) => {
    const { memberId } = req.params;
    const { fullName, grade, position, status, email, customFields } = req.body;
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId } });
    if (!member) {
        return res.status(404).json({ error: "Member not found." });
    }
    const updateData = {};
    if (fullName)
        updateData.fullName = fullName;
    if (grade)
        updateData.grade = grade;
    if (position)
        updateData.position = position;
    if (status)
        updateData.status = status;
    if (customFields)
        updateData.customFields = customFields;
    if (!req.user?.isOwner) {
        const requestId = `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const approval = await prisma_1.default.approvalRequest.create({
            data: {
                requestId,
                requesterId: req.user.id,
                requesterRole: req.user.roles.join(","),
                actionType: "UPDATE",
                targetType: "MEMBER",
                targetId: memberId,
                oldValue: member,
                newValue: updateData,
                reason: req.body.reason || "Member update requested.",
            },
        });
        await prisma_1.default.auditLog.create({
            data: {
                actorId: req.user.id,
                actorRole: req.user.roles.join(","),
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
    const updated = await prisma_1.default.memberProfile.update({ where: { memberId }, data: updateData });
    await prisma_1.default.auditLog.create({
        data: {
            actorId: req.user.id,
            actorRole: req.user.roles.join(","),
            action: "UPDATE_MEMBER",
            targetType: "MEMBER",
            targetId: memberId,
            status: "SUCCESS",
            oldValue: member,
            newValue: updateData,
        },
    });
    if (email || fullName) {
        await prisma_1.default.user.update({ where: { id: member.userId }, data: { email: email || undefined, fullName: fullName || undefined } });
    }
    return res.json({ message: "Member updated.", member: updated });
});
router.get("/:memberId/details", authMiddleware_1.authenticate, async (req, res) => {
    const { memberId } = req.params;
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId }, include: { user: true } });
    if (!member)
        return res.status(404).json({ error: "Member not found." });
    const isOwner = req.user?.isOwner === true;
    if (!isOwner && member.userId !== req.user?.id) {
        return res.status(403).json({ error: "Forbidden" });
    }
    const payments = await prisma_1.default.payment.findMany({ where: { memberId: member.id }, orderBy: { paymentDate: "desc" } });
    const receipts = await prisma_1.default.receipt.findMany({ where: { memberId: member.id }, orderBy: { issuedAt: "desc" } });
    const activities = await prisma_1.default.auditLog.findMany({ where: { targetType: "MEMBER", targetId: memberId }, orderBy: { createdAt: "desc" }, take: 20 });
    const typedPayments = payments;
    const totalPaid = typedPayments.reduce((sum, payment) => sum + payment.paymentAmount, 0);
    const paidWeeks = typedPayments.reduce((sum, payment) => sum + payment.totalWeeks, 0);
    const balanceWeeks = 4 - Math.min(4, paidWeeks % 4);
    const balanceMonths = Number((balanceWeeks / 4).toFixed(2));
    const balanceRupees = balanceWeeks * 50;
    return res.json({ member, payments, receipts, activities, summary: { totalPaid, paidWeeks, balanceWeeks, balanceMonths, balanceRupees } });
});
router.get("/me", authMiddleware_1.authenticate, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: "Unauthorized" });
    const member = await prisma_1.default.memberProfile.findFirst({ where: { userId: req.user.id } });
    if (!member)
        return res.status(404).json({ error: "Member profile not found." });
    return res.json(member);
});
router.get("/:memberId", authMiddleware_1.authenticate, async (req, res) => {
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId: req.params.memberId } });
    if (!member)
        return res.status(404).json({ error: "Member not found." });
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
router.post("/:memberId/block", (0, authMiddleware_1.requirePermission)("manage_members"), async (req, res) => {
    const { memberId } = req.params;
    if (!req.user?.isOwner) {
        return res.status(403).json({ error: "Only the Owner can block members." });
    }
    const member = await prisma_1.default.memberProfile.findUnique({
        where: { memberId },
        include: { user: true },
    });
    if (!member) {
        return res.status(404).json({ error: "Member not found." });
    }
    if (member.user.isOwner) {
        return res.status(403).json({ error: "The Owner account cannot be blocked." });
    }
    await prisma_1.default.$transaction([
        prisma_1.default.user.update({
            where: { id: member.userId },
            data: { status: "BLOCKED" },
        }),
        prisma_1.default.memberProfile.update({
            where: { memberId },
            data: { status: "SUSPENDED" },
        }),
        prisma_1.default.auditLog.create({
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
router.post("/:memberId/unblock", (0, authMiddleware_1.requirePermission)("manage_members"), async (req, res) => {
    const { memberId } = req.params;
    if (!req.user?.isOwner) {
        return res.status(403).json({ error: "Only the Owner can unblock members." });
    }
    const member = await prisma_1.default.memberProfile.findUnique({
        where: { memberId },
        include: { user: true },
    });
    if (!member) {
        return res.status(404).json({ error: "Member not found." });
    }
    if (member.user.isOwner) {
        return res.status(403).json({ error: "The Owner account cannot be modified." });
    }
    await prisma_1.default.$transaction([
        prisma_1.default.user.update({
            where: { id: member.userId },
            data: { status: "ACTIVE" },
        }),
        prisma_1.default.memberProfile.update({
            where: { memberId },
            data: { status: "ACTIVE" },
        }),
        prisma_1.default.auditLog.create({
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
router.post("/:memberId/activate", (0, authMiddleware_1.requirePermission)("manage_members"), async (req, res) => {
    const { memberId } = req.params;
    if (!req.user?.isOwner) {
        return res.status(403).json({ error: "Only the Owner can activate members." });
    }
    const member = await prisma_1.default.memberProfile.findUnique({
        where: { memberId },
        include: { user: true },
    });
    if (!member) {
        return res.status(404).json({ error: "Member not found." });
    }
    if (member.user.isOwner) {
        return res.status(403).json({ error: "The Owner account cannot be modified." });
    }
    await prisma_1.default.$transaction([
        prisma_1.default.user.update({
            where: { id: member.userId },
            data: { status: "ACTIVE" },
        }),
        prisma_1.default.memberProfile.update({
            where: { memberId },
            data: { status: "ACTIVE" },
        }),
    ]);
    return res.json({
        message: "Member activated successfully.",
    });
});
router.post("/:memberId/deactivate", (0, authMiddleware_1.requirePermission)("manage_members"), async (req, res) => {
    const { memberId } = req.params;
    if (!req.user?.isOwner) {
        return res.status(403).json({ error: "Only the Owner can deactivate members." });
    }
    const member = await prisma_1.default.memberProfile.findUnique({
        where: { memberId },
        include: { user: true },
    });
    if (!member) {
        return res.status(404).json({ error: "Member not found." });
    }
    if (member.user.isOwner) {
        return res.status(403).json({ error: "The Owner account cannot be modified." });
    }
    await prisma_1.default.$transaction([
        prisma_1.default.user.update({
            where: { id: member.userId },
            data: { status: "INACTIVE" },
        }),
        prisma_1.default.memberProfile.update({
            where: { memberId },
            data: { status: "INACTIVE" },
        }),
    ]);
    return res.json({
        message: "Member deactivated successfully.",
    });
});
router.delete("/:memberId", (0, authMiddleware_1.requirePermission)("manage_members"), async (req, res) => {
    const { memberId } = req.params;
    if (!req.user?.isOwner) {
        return res.status(403).json({ error: "Only the Owner can delete members." });
    }
    const member = await prisma_1.default.memberProfile.findUnique({
        where: { memberId },
        include: { user: true },
    });
    if (!member) {
        return res.status(404).json({ error: "Member not found." });
    }
    if (member.user.isOwner) {
        return res.status(403).json({ error: "The Owner account cannot be deleted." });
    }
    /*
     * Safety check:
     * Never allow the permanent Owner account to be deleted.
     */
    await prisma_1.default.$transaction(async (tx) => {
        await tx.memberProfile.delete({
            where: { memberId },
        });
        await tx.user.delete({
            where: { id: member.userId },
        });
        await tx.auditLog.create({
            data: {
                actorId: req.user.id,
                actorRole: req.user.roles.join(","),
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
        message: "Member deleted successfully.",
    });
});
exports.default = router;
