"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const client_1 = require("@prisma/client");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
function buildPaymentStatistics(payments, paymentRequests) {
    const completed = payments.filter((payment) => payment.status === client_1.PaymentStatus.COMPLETED);
    const failed = payments.filter((payment) => payment.status === client_1.PaymentStatus.FAILED);
    const pendingRequests = paymentRequests.filter((request) => request.status === client_1.PaymentRequestStatus.PENDING_REVIEW ||
        request.status === client_1.PaymentRequestStatus.AWAITING_MANUAL_SELECTION);
    const deniedRequests = paymentRequests.filter((request) => request.status === client_1.PaymentRequestStatus.DENIED);
    const paidMonthKeys = new Set(completed.map((payment) => `${payment.academicYearId}-${Number(payment.month)}`));
    const paidMonths = paidMonthKeys.size;
    const paidAmount = completed.reduce((sum, payment) => sum + Number(payment.paymentAmount || 0), 0);
    const pendingMonths = pendingRequests.length;
    return {
        pendingMonths,
        pendingAmount: pendingMonths * 200,
        paidMonths,
        paidAmount,
        failedPayments: failed.length + deniedRequests.length,
    };
}
router.get("/admin/history", (0, authMiddleware_1.requirePermission)("manage_payments"), async (req, res) => {
    try {
        const members = await prisma_1.default.memberProfile.findMany({
            orderBy: {
                id: "desc",
            },
            include: {
                payments: {
                    orderBy: {
                        paymentDate: "desc",
                    },
                    include: {
                        academicYear: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        accountId: true,
                        email: true,
                        fullName: true,
                        status: true,
                        isOwner: true,
                    },
                },
            },
        });
        const result = members.map((member) => {
            const payments = member.payments;
            const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.paymentAmount || 0), 0);
            const completedPayments = payments.filter((payment) => payment.status === client_1.PaymentStatus.COMPLETED);
            const pendingPayments = payments.filter((payment) => payment.status === client_1.PaymentStatus.PENDING);
            const latestPayment = payments.length > 0 ? payments[0] : null;
            return {
                id: member.id,
                memberId: member.memberId,
                userId: member.userId,
                fullName: member.fullName,
                grade: member.grade,
                position: member.position,
                status: member.status,
                user: member.user,
                paymentCount: payments.length,
                totalPaid,
                completedCount: completedPayments.length,
                pendingCount: pendingPayments.length,
                latestPayment: latestPayment
                    ? {
                        id: latestPayment.id,
                        month: latestPayment.month,
                        academicYear: latestPayment.academicYear?.year ?? null,
                        amount: latestPayment.paymentAmount,
                        paymentDate: latestPayment.paymentDate,
                        status: latestPayment.status,
                        totalWeeks: latestPayment.totalWeeks,
                    }
                    : null,
                payments,
            };
        });
        return res.json({
            members: result,
            totalMembers: result.length,
        });
    }
    catch (error) {
        console.error("GET /api/payments/admin/history failed:", error);
        return res.status(500).json({
            error: "Unable to load user-wise payment history.",
        });
    }
});
router.get("/admin/all", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const isOwner = req.user?.isOwner === true;
        if (!isOwner)
            return res.status(403).json({ error: "Forbidden" });
        const payments = await prisma_1.default.payment.findMany({
            include: {
                member: { select: { id: true, memberId: true, fullName: true } },
                academicYear: { select: { year: true, name: true } }
            },
            orderBy: { paymentDate: "desc" }
        });
        return res.json(payments);
    }
    catch (error) {
        console.error("GET /payments/admin/all error:", error);
        return res.status(500).json({ error: "Unable to load all payment records." });
    }
});
router.get("/statistics", authMiddleware_1.authenticate, async (req, res) => {
    try {
        const isOwner = req.user?.isOwner === true;
        let payments;
        let paymentRequests;
        if (isOwner) {
            [payments, paymentRequests] = await Promise.all([
                prisma_1.default.payment.findMany({
                    orderBy: {
                        paymentDate: "desc",
                    },
                }),
                prisma_1.default.paymentRequest.findMany({
                    orderBy: {
                        submittedAt: "desc",
                    },
                }),
            ]);
        }
        else {
            const member = await prisma_1.default.memberProfile.findUnique({
                where: { userId: req.user.id },
            });
            if (!member) {
                return res.status(404).json({ error: "Member profile not found." });
            }
            [payments, paymentRequests] = await Promise.all([
                prisma_1.default.payment.findMany({
                    where: {
                        memberId: member.id,
                    },
                    orderBy: {
                        paymentDate: "desc",
                    },
                }),
                prisma_1.default.paymentRequest.findMany({
                    where: {
                        memberId: member.id,
                    },
                    orderBy: {
                        submittedAt: "desc",
                    },
                }),
            ]);
        }
        const statistics = buildPaymentStatistics(payments.map((payment) => ({
            status: payment.status,
            paymentAmount: Number(payment.paymentAmount || 0),
            memberId: payment.memberId,
            academicYearId: payment.academicYearId,
            month: Number(payment.month),
        })), paymentRequests.map((request) => ({
            status: request.status,
            amount: Number(request.amount || 0),
            memberId: request.memberId,
        })));
        console.log("PAYMENT STATISTICS:", {
            userId: req.user?.id,
            isOwner,
            payments: payments.length,
            completed: payments.filter((p) => p.status === client_1.PaymentStatus.COMPLETED).length,
            pendingRequests: paymentRequests.filter((r) => r.status === client_1.PaymentRequestStatus.PENDING_REVIEW ||
                r.status === client_1.PaymentRequestStatus.AWAITING_MANUAL_SELECTION).length,
            deniedRequests: paymentRequests.filter((r) => r.status === client_1.PaymentRequestStatus.DENIED).length,
            failedPayments: payments.filter((p) => p.status === client_1.PaymentStatus.FAILED).length,
            statistics,
        });
        return res.json(statistics);
    }
    catch (error) {
        console.error("GET /api/payments/statistics failed:", error);
        return res.status(500).json({
            error: "Unable to load payment statistics.",
        });
    }
});
router.get("/member/:memberId", authMiddleware_1.authenticate, async (req, res) => {
    const { memberId } = req.params;
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId } });
    if (!member)
        return res.status(404).json({ error: "Member not found." });
    const isOwner = req.user?.isOwner === true;
    if (!isOwner && member.userId !== req.user?.id) {
        return res.status(403).json({ error: "Forbidden" });
    }
    const payments = await prisma_1.default.payment.findMany({ where: { memberId: member.id }, orderBy: { paymentDate: "desc" } });
    return res.json(payments);
});
router.get("/member/:memberId/summary", authMiddleware_1.authenticate, async (req, res) => {
    const { memberId } = req.params;
    const member = await prisma_1.default.memberProfile.findUnique({
        where: { memberId }
    });
    if (!member) {
        return res.status(404).json({ error: "Member not found." });
    }
    const isOwner = req.user?.isOwner === true;
    if (!isOwner && member.userId !== req.user?.id) {
        return res.status(403).json({ error: "Forbidden" });
    }
    const currentAcademicYear = await prisma_1.default.academicYear.findFirst({
        where: { isCurrent: true }
    });
    const payments = await prisma_1.default.payment.findMany({
        where: { memberId: member.id },
        orderBy: { paymentDate: "desc" }
    });
    const completedPayments = payments.filter((payment) => payment.status === client_1.PaymentStatus.COMPLETED);
    const totalPaid = completedPayments.reduce((sum, payment) => sum + Number(payment.paymentAmount || 0), 0);
    const paidWeeks = completedPayments.reduce((sum, payment) => sum + Number(payment.totalWeeks || 0), 0);
    let balanceMonths = 0;
    if (currentAcademicYear) {
        const openMonths = await prisma_1.default.monthlyRecord.findMany({
            where: {
                academicYearId: currentAcademicYear.id,
                isClosed: false
            },
            orderBy: {
                month: "asc"
            }
        });
        const paidOpenMonths = new Set(completedPayments
            .filter((payment) => payment.academicYearId === currentAcademicYear.id)
            .map((payment) => Number(payment.month)));
        balanceMonths = openMonths.filter((record) => !paidOpenMonths.has(Number(record.month))).length;
    }
    const balanceWeeks = balanceMonths * 4;
    const balanceRupees = balanceMonths * 200;
    return res.json({
        totalPaid,
        paidWeeks,
        balanceWeeks,
        balanceMonths: Number(balanceMonths),
        balanceRupees,
        payments
    });
});
router.get("/member/:memberId/receipts", authMiddleware_1.authenticate, async (req, res) => {
    const { memberId } = req.params;
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId } });
    if (!member)
        return res.status(404).json({ error: "Member not found." });
    const isOwner = req.user?.isOwner === true;
    if (!isOwner && member.userId !== req.user?.id) {
        return res.status(403).json({ error: "Forbidden" });
    }
    const receipts = await prisma_1.default.receipt.findMany({ where: { memberId: member.id }, include: { issuedBy: true }, orderBy: { issuedAt: "desc" } });
    return res.json(receipts);
});
exports.default = router;
