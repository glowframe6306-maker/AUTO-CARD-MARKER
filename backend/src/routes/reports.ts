import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const router = Router();

router.use(authenticate);

/*
 * OWNER DASHBOARD
 *
 * Only the permanent Owner account can access this dashboard.
 * All other authenticated users must use /member-dashboard.
 */
router.get("/dashboard", authenticate, async (req: AuthorizedRequest, res) => {
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
    const totalMembers = await prisma.memberProfile.count();

    const activeMembers = await prisma.memberProfile.count({
      where: { status: "ACTIVE" },
    });

    const inactiveMembers = await prisma.memberProfile.count({
      where: { status: "INACTIVE" },
    });

    /*
     * ------------------------------------------------------------
     * CURRENT MONTH
     * ------------------------------------------------------------
     */
    const now = new Date();

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0
    );

    const nextMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );

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
    const paymentRule = await prisma.paymentRule.findFirst({
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
    const monthlyPayments = await prisma.payment.findMany({
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
    const monthlyCollection = monthlyPayments.reduce(
      (total, payment) => total + Number(payment.paymentAmount || 0),
      0
    );

    /*
     * Unique members who made at least one completed payment
     * during the current month.
     */
    const paidMemberIds = new Set(
      monthlyPayments.map((payment) => payment.memberId)
    );

    const paidMembersThisMonth = paidMemberIds.size;

    /*
     * Members who have NOT made a completed payment this month.
     */
    const unpaidMembersThisMonth = Math.max(
      totalMembers - paidMembersThisMonth,
      0
    );

    /*
     * Expected collection if every registered member pays
     * the full monthly amount.
     */
    const expectedMonthlyCollection = totalMembers * monthlyAmount;

    /*
     * Remaining collection expected from unpaid members.
     */
    const remainingMonthlyCollection =
      unpaidMembersThisMonth * monthlyAmount;

    /*
     * ------------------------------------------------------------
     * RECENT PAYMENTS
     * ------------------------------------------------------------
     */
    const payments = await prisma.payment.findMany({
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
    const unpaid = await prisma.payment.count({
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
    const pendingRequestsCount = await prisma.approvalRequest.count({
      where: {
        status: "PENDING",
      },
    });

    /*
     * ------------------------------------------------------------
     * LOGIN / LOGOUT ACTIVITY
     * ------------------------------------------------------------
     */
    const recentLoginLogout = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ["LOGIN", "LOGOUT"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      include: {
        actor: {
          select: {
            id: true,
            accountId: true,
            fullName: true,
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

    const activity = recentLoginLogout.map((event) => ({
      id: event.id,
      type: event.action,
      action: event.action,
      event: event.action,
      userId: event.actorId,
      userName: event.actor.fullName,
      accountId: event.actor.accountId,
      timestamp: event.createdAt,
      status: event.status,
      reason: event.reason,
    }));

    return res.json({
      /*
       * MEMBERS
       */
      totalMembers,
      activeMembers,
      inactiveMembers,

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

      /*
       * Dashboard month information.
       */
      dashboardMonth: now.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      }),
    });
  } catch (error) {
    console.error("Dashboard report error:", error);

    return res.status(500).json({
      error: "Unable to load dashboard.",
    });
  }
});


router.get(
  "/payments/export/csv",
  requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]),
  async (req: AuthorizedRequest, res) => {
    const payments = await prisma.payment.findMany({
      include: {
        member: true,
        recordedBy: true,
        receipt: true,
      },
    });

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
      .map((row) =>
        row
          .map((item) => `"${String(item).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=payment-report.csv"
    );

    return res.send(csv);
  }
);


router.get(
  "/payments/export/excel",
  requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]),
  async (req: AuthorizedRequest, res) => {
    const payments = await prisma.payment.findMany({
      include: {
        member: true,
        recordedBy: true,
        receipt: true,
      },
    });

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

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=payment-report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  }
);


router.get(
  "/payments/export/pdf",
  requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]),
  async (req: AuthorizedRequest, res) => {
    const payments = await prisma.payment.findMany({
      include: {
        member: true,
        recordedBy: true,
        receipt: true,
      },
    });

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

    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
    });

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=payment-report.pdf"
    );

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
  }
);

export default router;
