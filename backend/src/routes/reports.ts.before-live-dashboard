import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const router = Router();

router.use(authenticate);

router.get("/dashboard", authenticate, async (req: AuthorizedRequest, res) => {
  const adminRoles = ["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"];
  const hasAdminAccess = req.user?.isOwner || req.user?.roles.some((role) => adminRoles.includes(role));

  if (hasAdminAccess) {
    const totalMembers = await prisma.memberProfile.count();
    const activeMembers = await prisma.memberProfile.count({ where: { status: "ACTIVE" } });
    const inactiveMembers = await prisma.memberProfile.count({ where: { status: "INACTIVE" } });
    const payments = await prisma.payment.findMany({ orderBy: { paymentDate: "desc" }, take: 10 });
    const totalCollection = await prisma.payment.aggregate({ _sum: { paymentAmount: true } });
    const unpaid = await prisma.payment.count({ where: { totalWeeks: { lt: 4 } } });
    return res.json({ totalMembers, activeMembers, inactiveMembers, totalCollection: totalCollection._sum.paymentAmount || 0, unpaidPayments: unpaid, recentPayments: payments });
  }

  if (req.user?.roles.includes("MEMBER")) {
    const currentUser = req.user;
    const user = await prisma.user.findUnique({ where: { id: currentUser.id }, include: { memberProfile: true } });
    if (!user?.memberProfile) {
      return res.status(404).json({ error: "Member profile not found." });
    }
    const member = user.memberProfile;
    const payments = await prisma.payment.findMany({ where: { memberId: member.id }, orderBy: { paymentDate: "desc" }, take: 10 });
    const typedPayments = payments as Array<{ paymentAmount: number }>;
    const totalPaid = typedPayments.reduce((sum, payment) => sum + payment.paymentAmount, 0);
    const unpaid = await prisma.payment.count({ where: { memberId: member.id, totalWeeks: { lt: 4 } } });
    return res.json({ totalMembers: 1, activeMembers: member.status === "ACTIVE" ? 1 : 0, inactiveMembers: member.status === "INACTIVE" ? 1 : 0, totalCollection: totalPaid, unpaidPayments: unpaid, recentPayments: payments });
  }

  return res.status(403).json({ error: "Forbidden" });
});

router.get("/payments/export/csv", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
  const payments = await prisma.payment.findMany({ include: { member: true, recordedBy: true, receipt: true } });
  const typedPayments = payments as Array<{
    receipt?: { receiptNumber: string } | null;
    member: { memberId: string; fullName: string };
    paymentAmount: number;
    totalWeeks: number;
    month: number;
    paymentDate: Date;
    recordedBy: { fullName: string };
    status: string;
  }>;
  const rows: Array<Array<string | number>> = [
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
  const csv = rows.map((row) => row.map((item: string | number) => `"${String(item).replace(/"/g, '""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=payment-report.csv");
  return res.send(csv);
});

router.get("/payments/export/excel", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
  const payments = await prisma.payment.findMany({ include: { member: true, recordedBy: true, receipt: true } });
  const typedPayments = payments as Array<{
    receipt?: { receiptNumber: string } | null;
    member: { memberId: string; fullName: string };
    paymentAmount: number;
    totalWeeks: number;
    month: number;
    paymentDate: Date;
    recordedBy: { fullName: string };
    status: string;
  }>;
  const workbook = new ExcelJS.Workbook();
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

router.get("/payments/export/pdf", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
  const payments = await prisma.payment.findMany({ include: { member: true, recordedBy: true, receipt: true } });
  const typedPayments = payments as Array<{
    receipt?: { receiptNumber: string } | null;
    member: { memberId: string; fullName: string };
    paymentAmount: number;
    totalWeeks: number;
    month: number;
    paymentDate: Date;
    recordedBy: { fullName: string };
    status: string;
  }>;
  const doc = new PDFDocument({ margin: 40, size: "A4" });
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

export default router;
