import { Router } from "express";
import prisma from "../prisma";
import { PaymentStatus, PaymentRequestStatus } from "@prisma/client";
import { authenticate, requireAnyRole, requirePermission, AuthorizedRequest } from "../middleware/authMiddleware";
import { calculateWeeksFromAmount, calculateBalanceWeeks, calculateBalanceMonths, calculateBalanceRupees } from "../utils/payments";

const router = Router();

function buildPaymentStatistics(
  payments: Array<{
    status: PaymentStatus;
    paymentAmount: number;
    memberId: number;
    academicYearId: number;
    month: number;
  }>,
  paymentRequests: Array<{
    status: PaymentRequestStatus;
    amount: number;
    memberId: number;
  }>
) {
  const completed = payments.filter(
    (payment) => payment.status === PaymentStatus.COMPLETED
  );

  const failed = payments.filter(
    (payment) => payment.status === PaymentStatus.FAILED
  );

  const pendingRequests = paymentRequests.filter(
    (request) =>
      request.status === PaymentRequestStatus.PENDING_REVIEW ||
      request.status === PaymentRequestStatus.AWAITING_MANUAL_SELECTION
  );

  const deniedRequests = paymentRequests.filter(
    (request) => request.status === PaymentRequestStatus.DENIED
  );

  const paidMonthKeys = new Set(
    completed.map(
      (payment) => `${payment.academicYearId}-${Number(payment.month)}`
    )
  );

  const paidMonths = paidMonthKeys.size;

  const paidAmount = completed.reduce(
    (sum, payment) => sum + Number(payment.paymentAmount || 0),
    0
  );

  const pendingMonths = pendingRequests.length;

  return {
    pendingMonths,
    pendingAmount: pendingMonths * 200,
    paidMonths,
    paidAmount,
    failedPayments: failed.length + deniedRequests.length,
  };
}
router.get(
  "/admin/history",
  requirePermission("manage_payments"),
  async (req: AuthorizedRequest, res) => {
    try {
      const members = await prisma.memberProfile.findMany({
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

        const totalPaid = payments.reduce(
          (sum, payment) => sum + Number(payment.paymentAmount || 0),
          0
        );

        const completedPayments = payments.filter(
          (payment) => payment.status === PaymentStatus.COMPLETED
        );

        const pendingPayments = payments.filter(
          (payment) => payment.status === PaymentStatus.PENDING
        );

        const latestPayment =
          payments.length > 0 ? payments[0] : null;

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
                academicYear:
                  latestPayment.academicYear?.year ?? null,
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
    } catch (error) {
      console.error("GET /api/payments/admin/history failed:", error);

      return res.status(500).json({
        error: "Unable to load user-wise payment history.",
      });
    }
  }
);
router.get("/admin/all", authenticate, async (req: AuthorizedRequest, res) => {
  try {
    const isOwner = req.user?.isOwner === true;
    if (!isOwner) return res.status(403).json({ error: "Forbidden" });
    const payments = await prisma.payment.findMany({
      include: {
        member: { select: { id: true, memberId: true, fullName: true } },
        academicYear: { select: { year: true, name: true } }
      },
      orderBy: { paymentDate: "desc" }
    });
    return res.json(payments);
  } catch (error) {
    console.error("GET /payments/admin/all error:", error);
    return res.status(500).json({ error: "Unable to load all payment records." });
  }
});
router.get("/statistics", authenticate, async (req: AuthorizedRequest, res) => {
  try {
    const isOwner = req.user?.isOwner === true;

    let payments;
    let paymentRequests;

    if (isOwner) {
      [payments, paymentRequests] = await Promise.all([
        prisma.payment.findMany({
          orderBy: {
            paymentDate: "desc",
          },
        }),
        prisma.paymentRequest.findMany({
          orderBy: {
            submittedAt: "desc",
          },
        }),
      ]);
    } else {
      const member = await prisma.memberProfile.findUnique({
        where: { userId: req.user!.id },
      });

      if (!member) {
        return res.status(404).json({ error: "Member profile not found." });
      }

      [payments, paymentRequests] = await Promise.all([
        prisma.payment.findMany({
          where: {
            memberId: member.id,
          },
          orderBy: {
            paymentDate: "desc",
          },
        }),
        prisma.paymentRequest.findMany({
          where: {
            memberId: member.id,
          },
          orderBy: {
            submittedAt: "desc",
          },
        }),
      ]);
    }

    const statistics = buildPaymentStatistics(
      payments.map((payment) => ({
        status: payment.status,
        paymentAmount: Number(payment.paymentAmount || 0),
        memberId: payment.memberId,
        academicYearId: payment.academicYearId,
        month: Number(payment.month),
      })),
      paymentRequests.map((request) => ({
        status: request.status,
        amount: Number(request.amount || 0),
        memberId: request.memberId,
      }))
    );

    console.log("PAYMENT STATISTICS:", {
      userId: req.user?.id,
      isOwner,
      payments: payments.length,
      completed: payments.filter(
        (p) => p.status === PaymentStatus.COMPLETED
      ).length,
      pendingRequests: paymentRequests.filter(
        (r) =>
          r.status === PaymentRequestStatus.PENDING_REVIEW ||
          r.status === PaymentRequestStatus.AWAITING_MANUAL_SELECTION
      ).length,
      deniedRequests: paymentRequests.filter(
        (r) => r.status === PaymentRequestStatus.DENIED
      ).length,
      failedPayments: payments.filter(
        (p) => p.status === PaymentStatus.FAILED
      ).length,
      statistics,
    });

    return res.json(statistics);
  } catch (error) {
    console.error("GET /api/payments/statistics failed:", error);

    return res.status(500).json({
      error: "Unable to load payment statistics.",
    });
  }
});

router.get("/member/:memberId", authenticate, async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;
  const member = await prisma.memberProfile.findUnique({ where: { memberId } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  const isOwner = req.user?.isOwner === true;
  if (!isOwner && member.userId !== req.user?.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const payments = await prisma.payment.findMany({ where: { memberId: member.id }, orderBy: { paymentDate: "desc" } });
  return res.json(payments);
});

router.get("/member/:memberId/summary", authenticate, async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;

  const member = await prisma.memberProfile.findUnique({
    where: { memberId }
  });

  if (!member) {
    return res.status(404).json({ error: "Member not found." });
  }

  const isOwner = req.user?.isOwner === true;

  if (!isOwner && member.userId !== req.user?.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const currentAcademicYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true }
  });

  const payments = await prisma.payment.findMany({
    where: { memberId: member.id },
    orderBy: { paymentDate: "desc" }
  });

  const completedPayments = payments.filter(
    (payment) => payment.status === PaymentStatus.COMPLETED
  );

  const totalPaid = completedPayments.reduce(
    (sum, payment) => sum + Number(payment.paymentAmount || 0),
    0
  );

  const paidWeeks = completedPayments.reduce(
    (sum, payment) => sum + Number(payment.totalWeeks || 0),
    0
  );

  let balanceMonths = 0;

  if (currentAcademicYear) {
    const openMonths = await prisma.monthlyRecord.findMany({
      where: {
        academicYearId: currentAcademicYear.id,
        isClosed: false
      },
      orderBy: {
        month: "asc"
      }
    });

    const paidOpenMonths = new Set(
      completedPayments
        .filter(
          (payment) =>
            payment.academicYearId === currentAcademicYear.id
        )
        .map((payment) => Number(payment.month))
    );

    balanceMonths = openMonths.filter(
      (record) => !paidOpenMonths.has(Number(record.month))
    ).length;
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

router.get("/member/:memberId/receipts", authenticate, async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;
  const member = await prisma.memberProfile.findUnique({ where: { memberId } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  const isOwner = req.user?.isOwner === true;
  if (!isOwner && member.userId !== req.user?.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const receipts = await prisma.receipt.findMany({ where: { memberId: member.id }, include: { issuedBy: true }, orderBy: { issuedAt: "desc" } });
  return res.json(receipts);
});

export default router;










