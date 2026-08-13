"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const client_1 = require("@prisma/client");
const authMiddleware_1 = require("../middleware/authMiddleware");
const payments_1 = require("../utils/payments");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.post("/", (0, authMiddleware_1.requirePermission)("manage_payments"), async (req, res) => {
    const { memberId, academicYear, month, paymentAmount, paymentDate, notes } = req.body;
    if (!memberId || !academicYear || month == null || paymentAmount == null || !paymentDate) {
        return res.status(400).json({ error: "Missing required payment data." });
    }
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId } });
    if (!member)
        return res.status(404).json({ error: "Member not found." });
    const year = await prisma_1.default.academicYear.findUnique({ where: { year: Number(academicYear) } });
    if (!year)
        return res.status(404).json({ error: "Academic year not found." });
    const paymentMonth = Number(month);
    const amount = Number(paymentAmount);
    const validAmounts = [50, 100, 150, 200];
    if (!validAmounts.includes(amount)) {
        return res.status(400).json({ error: "Payment amount must be one of Rs.50, Rs.100, Rs.150, Rs.200." });
    }
    const existingPayment = await prisma_1.default.payment.findFirst({ where: { memberId: member.id, academicYearId: year.id, month: paymentMonth } });
    if (existingPayment) {
        return res.status(409).json({ error: "A payment for this member, month and year already exists." });
    }
    const week1 = amount >= 50;
    const week2 = amount >= 100;
    const week3 = amount >= 150;
    const week4 = amount >= 200;
    const totalWeeks = [week1, week2, week3, week4].filter(Boolean).length;
    const balanceWeeks = (0, payments_1.calculateBalanceWeeks)(week1, week2, week3, week4);
    const balanceMonths = (0, payments_1.calculateBalanceMonths)(balanceWeeks);
    const balanceRupees = (0, payments_1.calculateBalanceRupees)(balanceWeeks);
    const paymentData = {
        memberId: member.id,
        academicYearId: year.id,
        month: paymentMonth,
        paymentAmount: amount,
        paymentDate: new Date(paymentDate),
        week1,
        week2,
        week3,
        week4,
        totalWeeks,
        recordedById: req.user.id,
        status: client_1.PaymentStatus.COMPLETED,
        notes,
    };
    const payment = await prisma_1.default.payment.create({ data: paymentData });
    const receiptNumber = `RC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}-${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`;
    const receipt = await prisma_1.default.receipt.create({
        data: {
            paymentId: payment.id,
            memberId: member.id,
            issuedById: req.user.id,
            amount: amount,
            weeksPaid: totalWeeks,
            month: paymentMonth,
            receiptNumber,
        },
    });
    await prisma_1.default.auditLog.create({
        data: {
            actorId: req.user.id,
            actorRole: req.user.roles.join(","),
            action: "CREATE_PAYMENT",
            targetType: "PAYMENT",
            targetId: `${payment.id}`,
            status: "SUCCESS",
            newValue: { paymentData, receiptNumber, balanceWeeks, balanceMonths, balanceRupees },
        },
    });
    return res.status(201).json({ payment, receipt, balance: { balanceWeeks, balanceMonths, balanceRupees } });
});
router.get("/member/:memberId", authMiddleware_1.authenticate, async (req, res) => {
    const { memberId } = req.params;
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId } });
    if (!member)
        return res.status(404).json({ error: "Member not found." });
    const isAdmin = req.user?.isOwner || req.user?.roles.some((role) => ["SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"].includes(role));
    if (!isAdmin && member.userId !== req.user?.id) {
        return res.status(403).json({ error: "Forbidden" });
    }
    const payments = await prisma_1.default.payment.findMany({ where: { memberId: member.id }, orderBy: { paymentDate: "desc" } });
    return res.json(payments);
});
router.get("/member/:memberId/summary", authMiddleware_1.authenticate, async (req, res) => {
    const { memberId } = req.params;
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId } });
    if (!member)
        return res.status(404).json({ error: "Member not found." });
    const isAdmin = req.user?.isOwner || req.user?.roles.some((role) => ["SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"].includes(role));
    if (!isAdmin && member.userId !== req.user?.id) {
        return res.status(403).json({ error: "Forbidden" });
    }
    const payments = await prisma_1.default.payment.findMany({ where: { memberId: member.id } });
    const typedPayments = payments;
    const totalPaid = typedPayments.reduce((sum, payment) => sum + payment.paymentAmount, 0);
    const paidWeeks = typedPayments.reduce((sum, payment) => sum + payment.totalWeeks, 0);
    const balanceWeeks = 4 - Math.min(4, paidWeeks % 4);
    const balanceMonths = (0, payments_1.calculateBalanceMonths)(balanceWeeks);
    const balanceRupees = (0, payments_1.calculateBalanceRupees)(balanceWeeks);
    return res.json({ totalPaid, paidWeeks, balanceWeeks, balanceMonths, balanceRupees, payments });
});
router.get("/member/:memberId/receipts", authMiddleware_1.authenticate, async (req, res) => {
    const { memberId } = req.params;
    const member = await prisma_1.default.memberProfile.findUnique({ where: { memberId } });
    if (!member)
        return res.status(404).json({ error: "Member not found." });
    const isAdmin = req.user?.isOwner || req.user?.roles.some((role) => ["SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"].includes(role));
    if (!isAdmin && member.userId !== req.user?.id) {
        return res.status(403).json({ error: "Forbidden" });
    }
    const receipts = await prisma_1.default.receipt.findMany({ where: { memberId: member.id }, include: { issuedBy: true }, orderBy: { issuedAt: "desc" } });
    return res.json(receipts);
});
exports.default = router;
