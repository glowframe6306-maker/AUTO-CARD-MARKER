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
router.get("/dashboard", authMiddleware_1.authenticate, async (req, res) => {
    const adminRoles = ["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"];
    const hasAdminAccess = req.user?.isOwner || req.user?.roles.some((role) => adminRoles.includes(role));
    if (hasAdminAccess) {
        const totalMembers = await prisma_1.default.memberProfile.count();
        const activeMembers = await prisma_1.default.memberProfile.count({ where: { status: "ACTIVE" } });
        const inactiveMembers = await prisma_1.default.memberProfile.count({ where: { status: "INACTIVE" } });
        const payments = await prisma_1.default.payment.findMany({ orderBy: { paymentDate: "desc" }, take: 10 });
        const totalCollection = await prisma_1.default.payment.aggregate({ _sum: { paymentAmount: true } });
        const unpaid = await prisma_1.default.payment.count({ where: { totalWeeks: { lt: 4 } } });
        return res.json({ totalMembers, activeMembers, inactiveMembers, totalCollection: totalCollection._sum.paymentAmount || 0, unpaidPayments: unpaid, recentPayments: payments });
    }
    if (req.user?.roles.includes("MEMBER")) {
        const currentUser = req.user;
        const user = await prisma_1.default.user.findUnique({ where: { id: currentUser.id }, include: { memberProfile: true } });
        if (!user?.memberProfile) {
            return res.status(404).json({ error: "Member profile not found." });
        }
        const member = user.memberProfile;
        const payments = await prisma_1.default.payment.findMany({ where: { memberId: member.id }, orderBy: { paymentDate: "desc" }, take: 10 });
        const typedPayments = payments;
        const totalPaid = typedPayments.reduce((sum, payment) => sum + payment.paymentAmount, 0);
        const unpaid = await prisma_1.default.payment.count({ where: { memberId: member.id, totalWeeks: { lt: 4 } } });
        return res.json({ totalMembers: 1, activeMembers: member.status === "ACTIVE" ? 1 : 0, inactiveMembers: member.status === "INACTIVE" ? 1 : 0, totalCollection: totalPaid, unpaidPayments: unpaid, recentPayments: payments });
    }
    return res.status(403).json({ error: "Forbidden" });
});
router.get("/payments/export/csv", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req, res) => {
    const payments = await prisma_1.default.payment.findMany({ include: { member: true, recordedBy: true, receipt: true } });
    const typedPayments = payments;
    const rows = [
        ["Receipt", "Member ID", "Member Name", "Amount", "Weeks Paid", "Month", "Payment Date", "Recorded By", "Status"],
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
    const csv = rows.map((row) => row.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=payment-report.csv");
    return res.send(csv);
});
router.get("/payments/export/excel", (0, authMiddleware_1.requireAnyRole)(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req, res) => {
    const payments = await prisma_1.default.payment.findMany({ include: { member: true, recordedBy: true, receipt: true } });
    const typedPayments = payments;
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet("Payments");
    sheet.addRow(["Receipt", "Member ID", "Member Name", "Amount", "Weeks Paid", "Month", "Payment Date", "Recorded By", "Status"]);
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
    const payments = await prisma_1.default.payment.findMany({ include: { member: true, recordedBy: true, receipt: true } });
    const typedPayments = payments;
    const doc = new pdfkit_1.default({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=payment-report.pdf");
    doc.pipe(res);
    doc.fontSize(18).text("Payment Report", { underline: true });
    doc.moveDown();
    typedPayments.forEach((payment) => {
        doc.fontSize(10).text(`Receipt: ${payment.receipt?.receiptNumber || "N/A"}`);
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
