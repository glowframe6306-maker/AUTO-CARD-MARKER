"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const exceljs_1 = __importDefault(require("exceljs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
/*
 * OWNER DASHBOARD
 *
 * Only the permanent Owner account can access this dashboard.
 * All other authenticated users must use /member-dashboard.
 */
router.get("/dashboard", authMiddleware_1.authenticate, async (req, res) => {
    if (!req.user?.isOwner) {
        return res.status(403).json({
            error: "Owner Dashboard is restricted to the Owner account.",
        });
    }
    try {
        /*
         * ------------------------------------------------------------
         * MEMBERS
         * ------------------------------------------------------------
         *
         * Total Members = ALL registered MemberProfile records.
         */
        const totalMembers = await prisma_1.default.memberProfile.count();
        const activeMembers = await prisma_1.default.memberProfile.count({
            where: { status: "ACTIVE" },
        });
        const inactiveMembers = await prisma_1.default.memberProfile.count({
            where: { status: "INACTIVE" },
        });
        const totalOpenMonths = await prisma_1.default.monthlyRecord.count({
            where: {
                isClosed: false,
            },
        });
        const completedPayments = await prisma_1.default.payment.findMany({
            where: {
                status: "COMPLETED",
            },
            select: {
                paymentAmount: true,
            },
        });
        const totalAmount = completedPayments.reduce((sum, payment) => sum + Number(payment.paymentAmount || 0), 0);
        const pendingApprovals = await prisma_1.default.approvalRequest.count({
            where: {
                status: "PENDING",
            },
        });
        const pendingPaymentReview = await prisma_1.default.ocrResult.count({
            where: {
                status: "REVIEW",
            },
        });
        /*
         * ------------------------------------------------------------
         * CURRENT MONTH
         * ------------------------------------------------------------
         */
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
        /*
         * ------------------------------------------------------------
         * MONTHLY PAYMENT RULE
         * ------------------------------------------------------------
         *
         * Current system rule:
         * Rs. 200 per week
         * 4 weeks per month
         * = Rs. 800 per member per month
         *
         * PaymentRule is used if available.
         */
        const paymentRule = await prisma_1.default.paymentRule.findFirst({
            where: {
                active: true,
            },
            orderBy: {
                id: "desc",
            },
        });
        const weeklyAmount = paymentRule?.weeklyAmount ?? 200;
        const weeksPerMonth = paymentRule?.weeksPerMonth ?? 4;
        const monthlyAmount = weeklyAmount * weeksPerMonth;
        /*
         * ------------------------------------------------------------
         * THIS MONTH'S COMPLETED PAYMENTS
         * ------------------------------------------------------------
         */
        const monthlyPayments = await prisma_1.default.payment.findMany({
            where: {
                status: "COMPLETED",
                paymentDate: {
                    gte: monthStart,
                    lt: nextMonthStart,
                },
            },
            orderBy: {
                paymentDate: "desc",
            },
            include: {
                member: true,
            },
        });
        /*
         * Actual money received this month.
         */
        const monthlyCollection = monthlyPayments.reduce((total, payment) => total + Number(payment.paymentAmount || 0), 0);
        /*
         * Unique members who made at least one completed payment
         * during the current month.
         */
        const paidMemberIds = new Set(monthlyPayments.map((payment) => payment.memberId));
        const paidMembersThisMonth = paidMemberIds.size;
        /*
         * Members who have NOT made a completed payment this month.
         */
        const unpaidMembersThisMonth = Math.max(totalMembers - paidMembersThisMonth, 0);
        /*
         * Expected collection if every registered member pays
         * the full monthly amount.
         */
        const expectedMonthlyCollection = totalMembers * monthlyAmount;
        /*
         * Remaining collection expected from unpaid members.
         */
        const remainingMonthlyCollection = unpaidMembersThisMonth * monthlyAmount;
        /*
         * ------------------------------------------------------------
         * RECENT PAYMENTS
         * ------------------------------------------------------------
         */
        const payments = await prisma_1.default.payment.findMany({
            orderBy: {
                paymentDate: "desc",
            },
            take: 10,
            include: {
                member: true,
            },
        });
        /*
         * ------------------------------------------------------------
         * UNPAID / INCOMPLETE PAYMENTS
         * ------------------------------------------------------------
         */
        const unpaid = await prisma_1.default.payment.count({
            where: {
                totalWeeks: {
                    lt: 4,
                },
            },
        });
        /*
         * ------------------------------------------------------------
         * PENDING REQUESTS
         * ------------------------------------------------------------
         */
        const pendingRequestsCount = await prisma_1.default.approvalRequest.count({
            where: {
                status: "PENDING",
            },
        });
        const pendingAmount = Math.max(totalOpenMonths * totalMembers * monthlyAmount - totalAmount, 0);
        /*
         * ------------------------------------------------------------
         * LOGIN / LOGOUT ACTIVITY
         * ------------------------------------------------------------
         */
        const recentLoginLogout = await prisma_1.default.auditLog.findMany({
            orderBy: {
                createdAt: "desc",
            },
            take: 50,
            include: {
                actor: {
                    select: {
                        id: true,
                        accountId: true,
                        fullName: true,
                        email: true,
                        isOwner: true,
                        roles: {
                            include: {
                                role: true,
                            },
                        },
                        memberProfile: {
                            select: {
                                memberId: true,
                            },
                        },
                        devices: {
                            orderBy: {
                                lastActive: "desc",
                            },
                            take: 1,
                            select: {
                                deviceName: true,
                                platform: true,
                                browser: true,
                                ipAddress: true,
                                deviceIdentifier: true,
                            },
                        },
                    },
                },
            },
        });
        const recentPayments = payments.map((payment) => ({
            id: payment.id,
            memberId: payment.member.memberId,
            memberName: payment.member.fullName,
            paymentAmount: payment.paymentAmount,
            paymentDate: payment.paymentDate,
            status: payment.status,
            account: payment.member.memberId,
        }));
        const activity = recentLoginLogout.map((event) => {
            const device = event.actor.devices?.[0] ?? null;
            const roleNames = event.actor.roles
                ?.map((item) => item.role?.name)
                .filter(Boolean);
            return {
                id: event.id,
                type: event.action,
                action: event.action,
                event: event.action,
                userId: event.actorId,
                userName: event.actor.fullName,
                accountId: event.actor.accountId,
                email: event.actor.email,
                rcNo: event.actor.memberProfile?.memberId ?? event.actor.accountId,
                device: device
                    ? {
                        name: device.deviceName,
                        platform: device.platform,
                        browser: device.browser,
                        ipAddress: device.ipAddress,
                        deviceIdentifier: device.deviceIdentifier,
                    }
                    : null,
                role: event.actor.isOwner
                    ? "OWNER"
                    : (roleNames?.join(", ") || "MEMBER"),
                timestamp: event.createdAt,
                date: event.createdAt,
                time: event.createdAt,
                status: event.status,
                reason: event.reason,
                details: {
                    targetType: event.targetType,
                    targetId: event.targetId,
                    oldValue: event.oldValue,
                    newValue: event.newValue,
                },
            };
        });
        console.log("OWNER DASHBOARD LIVE DATA:", {
            totalMembers,
            totalOpenMonths,
            totalAmount,
            pendingAmount,
            pendingApprovals,
            pendingPaymentReview,
        });
        console.log("OWNER_DASHBOARD_VALUES", {
            totalMembers,
            totalOpenMonths,
            totalAmount,
            pendingAmount,
            pendingApprovals,
            pendingPaymentReview,
        });
        return res.json({
            /*
             * MEMBERS
             */
            totalMembers,
            activeMembers,
            inactiveMembers,
            totalMonths: totalOpenMonths,
            totalOpenMonths,
            totalAmount,
            pendingAmount,
            pendingApprovals,
            pendingPaymentReview,
            pendingPaymentReviews: pendingPaymentReview,
            /*
             * CURRENT MONTH PAYMENT SUMMARY
             */
            paidMembersThisMonth,
            unpaidMembersThisMonth,
            weeklyAmount,
            weeksPerMonth,
            monthlyAmount,
            monthlyCollection,
            expectedMonthlyCollection,
            remainingMonthlyCollection,
            /*
             * Backward-compatible field.
             */
            totalCollection: monthlyCollection,
            unpaidPayments: unpaid,
            pendingRequestsCount,
            /*
             * RECENT DATA
             */
            recentPayments,
            recentLoginLogout: activity,
            recentActivity: activity,
            systemActivity: activity,
            /*
             * Dashboard month information.
             */
            dashboardMonth: now.toLocaleString("en-US", {
                month: "long",
                year: "numeric",
            }),
        });
    }
    catch (error) {
        console.error("Dashboard report error:", error);
        return res.status(500).json({
            error: "Unable to load dashboard.",
        });
    }
});
router.get("/payments/export/csv", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req, res) => {
    const payments = await prisma_1.default.payment.findMany({
        include: {
            member: true,
            recordedBy: true,
            receipt: true,
        },
    });
    const typedPayments = payments;
    const rows = [
        [
            "Receipt",
            "Member ID",
            "Member Name",
            "Amount",
            "Weeks Paid",
            "Month",
            "Payment Date",
            "Recorded By",
            "Status",
        ],
        ...typedPayments.map((payment) => [
            payment.receipt?.receiptNumber || "",
            payment.member.memberId,
            payment.member.fullName,
            payment.paymentAmount,
            payment.totalWeeks,
            payment.month,
            payment.paymentDate.toISOString(),
            payment.recordedBy.fullName,
            payment.status,
        ]),
    ];
    const csv = rows
        .map((row) => row
        .map((item) => `"${String(item).replace(/"/g, '""')}"`)
        .join(","))
        .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=payment-report.csv");
    return res.send(csv);
});
router.get("/payments/export/excel", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req, res) => {
    const payments = await prisma_1.default.payment.findMany({
        include: {
            member: true,
            recordedBy: true,
            receipt: true,
        },
    });
    const typedPayments = payments;
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet("Payments");
    sheet.addRow([
        "Receipt",
        "Member ID",
        "Member Name",
        "Amount",
        "Weeks Paid",
        "Month",
        "Payment Date",
        "Recorded By",
        "Status",
    ]);
    typedPayments.forEach((payment) => {
        sheet.addRow([
            payment.receipt?.receiptNumber || "",
            payment.member.memberId,
            payment.member.fullName,
            payment.paymentAmount,
            payment.totalWeeks,
            payment.month,
            payment.paymentDate.toISOString(),
            payment.recordedBy.fullName,
            payment.status,
        ]);
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=payment-report.xlsx");
    await workbook.xlsx.write(res);
    res.end();
});
router.get("/payments/export/pdf", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req, res) => {
    const payments = await prisma_1.default.payment.findMany({
        include: {
            member: true,
            recordedBy: true,
            receipt: true,
        },
    });
    const typedPayments = payments;
    const doc = new pdfkit_1.default({
        margin: 40,
        size: "A4",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=payment-report.pdf");
    doc.pipe(res);
    doc.fontSize(18).text("Payment Report", {
        underline: true,
    });
    doc.moveDown();
    typedPayments.forEach((payment) => {
        doc
            .fontSize(10)
            .text(`Receipt: ${payment.receipt?.receiptNumber || "N/A"}`);
        doc.text(`Member ID: ${payment.member.memberId}`);
        doc.text(`Member Name: ${payment.member.fullName}`);
        doc.text(`Amount: Rs. ${payment.paymentAmount}`);
        doc.text(`Weeks Paid: ${payment.totalWeeks}`);
        doc.text(`Month: ${payment.month}`);
        doc.text(`Payment Date: ${payment.paymentDate.toISOString()}`);
        doc.text(`Recorded By: ${payment.recordedBy.fullName}`);
        doc.text(`Status: ${payment.status}`);
        doc.moveDown();
    });
    doc.end();
});
exports.default = router;
