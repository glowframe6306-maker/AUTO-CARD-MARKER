import { Router } from "express";
import prisma from "../prisma";
import { authenticate, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

/*
 * OWNER ONLY
 */
function requireOwner(req: AuthorizedRequest, res: any, next: any) {
  if (req.user?.isOwner !== true) {
    return res.status(403).json({
      error: "Months Management is restricted to the Owner account.",
    });
  }

  next();
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/*
 * GET ALL MONTHS
 */
router.get("/", async (req: AuthorizedRequest, res) => {
  try {
    const academicYearId = req.query.academicYearId
      ? Number(req.query.academicYearId)
      : undefined;

    const months = await prisma.monthlyRecord.findMany({
      where: academicYearId ? { academicYearId } : undefined,
      orderBy: [
        { academicYearId: "desc" },
        { month: "asc" },
      ],
      include: {
        academicYear: true,
      },
    });

    const result = await Promise.all(
      months.map(async (month) => {
        const payments = await prisma.payment.findMany({
          where: {
            academicYearId: month.academicYearId,
            month: month.month,
            status: "COMPLETED",
          },
        });

        const totalCollected = payments.reduce(
          (sum, payment) => sum + Number(payment.paymentAmount || 0),
          0
        );

        const paidMembers = new Set(
          payments.map((payment) => payment.memberId)
        );

        const totalMembers = await prisma.memberProfile.count({
          where: {
            status: "ACTIVE",
          },
        });

        const paidMembersCount = paidMembers.size;
        const pendingMembers = Math.max(
          totalMembers - paidMembersCount,
          0
        );

        const totalExpected =
          totalMembers * Number(month.paymentAmount || 0);

        const totalPending = Math.max(
          totalExpected - totalCollected,
          0
        );

        return {
          ...month,
          totalMembers,
          paidMembers: paidMembersCount,
          pendingMembers,
          totalExpected,
          totalCollected,
          totalPending,
        };
      })
    );

    return res.json(result);
  } catch (error) {
    console.error("Months GET error:", error);

    return res.status(500).json({
      error: "Unable to load months.",
    });
  }
});

/*
 * ADD NEW MONTH
 */
router.post("/", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const {
      academicYearId,
      month,
      name,
      paymentAmount,
    } = req.body;

    if (!academicYearId || month == null) {
      return res.status(400).json({
        error: "Academic year and month are required.",
      });
    }

    const monthNumber = Number(month);
    const amount = Number(paymentAmount ?? 800);

    if (monthNumber < 1 || monthNumber > 12) {
      return res.status(400).json({
        error: "Month must be between 1 and 12.",
      });
    }

    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({
        error: "Invalid payment amount.",
      });
    }

    const year = await prisma.academicYear.findUnique({
      where: {
        id: Number(academicYearId),
      },
    });

    if (!year) {
      return res.status(404).json({
        error: "Academic year not found.",
      });
    }

    const existing = await prisma.monthlyRecord.findUnique({
      where: {
        academicYearId_month: {
          academicYearId: Number(academicYearId),
          month: monthNumber,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        error: "This month already exists.",
      });
    }

    const monthName =
      String(name || "").trim() ||
      `${monthNames[monthNumber - 1]} ${year.year}`;

    const record = await prisma.monthlyRecord.create({
      data: {
        academicYearId: Number(academicYearId),
        month: monthNumber,
        name: monthName,
        paymentAmount: amount,
      },
      include: {
        academicYear: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: req.user!.roles.join(","),
        action: "CREATE_MONTH",
        targetType: "MONTHLY_RECORD",
        targetId: String(record.id),
        status: "SUCCESS",
        newValue: {
          name: record.name,
          month: record.month,
          academicYearId: record.academicYearId,
          paymentAmount: record.paymentAmount,
        },
      },
    });

    return res.status(201).json(record);
  } catch (error) {
    console.error("Create month error:", error);

    return res.status(500).json({
      error: "Unable to create month.",
    });
  }
});

/*
 * RENAME / CHANGE PAYMENT
 */
router.patch("/:id", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.monthlyRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        error: "Month not found.",
      });
    }

    const data: {
      name?: string;
      paymentAmount?: number;
    } = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();

      if (!name) {
        return res.status(400).json({
          error: "Month name cannot be empty.",
        });
      }

      data.name = name;
    }

    if (req.body.paymentAmount !== undefined) {
      const amount = Number(req.body.paymentAmount);

      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({
          error: "Invalid payment amount.",
        });
      }

      data.paymentAmount = amount;
    }

    const updated = await prisma.monthlyRecord.update({
      where: { id },
      data,
      include: {
        academicYear: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: req.user!.roles.join(","),
        action: "UPDATE_MONTH",
        targetType: "MONTHLY_RECORD",
        targetId: String(id),
        status: "SUCCESS",
        oldValue: {
          name: existing.name,
          paymentAmount: existing.paymentAmount,
        },
        newValue: data,
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error("Update month error:", error);

    return res.status(500).json({
      error: "Unable to update month.",
    });
  }
});

/*
 * CLOSE / MARK MONTH PAID
 */
router.post("/:id/close", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.monthlyRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        error: "Month not found.",
      });
    }

    const updated = await prisma.monthlyRecord.update({
      where: { id },
      data: {
        isClosed: true,
        closedAt: new Date(),
        closedById: req.user!.id,
      },
      include: {
        academicYear: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: req.user!.roles.join(","),
        action: "CLOSE_MONTH",
        targetType: "MONTHLY_RECORD",
        targetId: String(id),
        status: "SUCCESS",
        oldValue: {
          isClosed: existing.isClosed,
        },
        newValue: {
          isClosed: true,
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error("Close month error:", error);

    return res.status(500).json({
      error: "Unable to close month.",
    });
  }
});

/*
 * REOPEN MONTH
 */
router.post("/:id/reopen", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.monthlyRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        error: "Month not found.",
      });
    }

    const updated = await prisma.monthlyRecord.update({
      where: { id },
      data: {
        isClosed: false,
        closedAt: null,
        closedById: null,
      },
      include: {
        academicYear: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: req.user!.roles.join(","),
        action: "REOPEN_MONTH",
        targetType: "MONTHLY_RECORD",
        targetId: String(id),
        status: "SUCCESS",
        oldValue: {
          isClosed: existing.isClosed,
        },
        newValue: {
          isClosed: false,
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error("Reopen month error:", error);

    return res.status(500).json({
      error: "Unable to reopen month.",
    });
  }
});

/*
 * VIEW MEMBERS
 */
router.get("/:id/members", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const id = Number(req.params.id);

    const month = await prisma.monthlyRecord.findUnique({
      where: { id },
    });

    if (!month) {
      return res.status(404).json({
        error: "Month not found.",
      });
    }

    const members = await prisma.memberProfile.findMany({
      where: {
        status: "ACTIVE",
      },
      orderBy: {
        fullName: "asc",
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    const payments = await prisma.payment.findMany({
      where: {
        academicYearId: month.academicYearId,
        month: month.month,
        status: "COMPLETED",
      },
    });

    const paymentMap = new Map(
      payments.map((payment) => [
        payment.memberId,
        payment,
      ])
    );

    const result = members.map((member) => {
      const payment = paymentMap.get(member.id);

      return {
        id: member.id,
        memberId: member.memberId,
        fullName: member.fullName,
        email: member.user?.email ?? null,
        status: payment ? "PAID" : "PENDING",
        paymentAmount: payment?.paymentAmount ?? 0,
        paymentDate: payment?.paymentDate ?? null,
        paymentId: payment?.id ?? null,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("Month members error:", error);

    return res.status(500).json({
      error: "Unable to load month members.",
    });
  }
});


/*
 * TOGGLE MEMBER MONTHLY PAYMENT STATUS
 *
 * PENDING -> PAID
 * PAID -> PENDING
 */
router.patch("/:id/members/:memberId/status", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const monthId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const requestedStatus = String(req.body?.status || "").toUpperCase();

    if (!Number.isInteger(monthId) || !Number.isInteger(memberId)) {
      return res.status(400).json({
        error: "Invalid month or member.",
      });
    }

    if (requestedStatus !== "PAID" && requestedStatus !== "PENDING") {
      return res.status(400).json({
        error: "Status must be PAID or PENDING.",
      });
    }

    const month = await prisma.monthlyRecord.findUnique({
      where: { id: monthId },
    });

    if (!month) {
      return res.status(404).json({
        error: "Month not found.",
      });
    }

    const member = await prisma.memberProfile.findUnique({
      where: { id: memberId },
    });

    if (!member || member.status !== "ACTIVE") {
      return res.status(404).json({
        error: "Active member not found.",
      });
    }

    const existingPayment = await prisma.payment.findFirst({
      where: {
        memberId,
        academicYearId: month.academicYearId,
        month: month.month,
        status: "COMPLETED",
      },
    });

    if (requestedStatus === "PAID") {
      if (!existingPayment) {
        const payment = await prisma.payment.create({
          data: {
            memberId,
            academicYearId: month.academicYearId,
            month: month.month,
            paymentAmount: Number(month.paymentAmount || 0),
            paymentDate: new Date(),
            week1: true,
            week2: true,
            week3: true,
            week4: true,
            totalWeeks: 4,
            recordedById: req.user!.id,
            status: "COMPLETED",
            notes: "Marked PAID by Owner from Monthly Payments.",
          },
        });

        await prisma.auditLog.create({
          data: {
            actorId: req.user!.id,
            actorRole: req.user!.roles.join(","),
            action: "MARK_MONTHLY_PAYMENT_PAID",
            targetType: "PAYMENT",
            targetId: String(payment.id),
            status: "SUCCESS",
            newValue: {
              memberId,
              monthId,
              academicYearId: month.academicYearId,
              month: month.month,
              status: "PAID",
            },
          },
        });
      }
    } else {
      if (existingPayment) {
        await prisma.payment.delete({
          where: {
            id: existingPayment.id,
          },
        });

        await prisma.auditLog.create({
          data: {
            actorId: req.user!.id,
            actorRole: req.user!.roles.join(","),
            action: "MARK_MONTHLY_PAYMENT_PENDING",
            targetType: "PAYMENT",
            targetId: String(existingPayment.id),
            status: "SUCCESS",
            oldValue: {
              memberId,
              monthId,
              academicYearId: month.academicYearId,
              month: month.month,
              status: "PAID",
            },
            newValue: {
              status: "PENDING",
            },
          },
        });
      }
    }

    return res.json({
      success: true,
      memberId,
      status: requestedStatus,
    });
  } catch (error) {
    console.error("Toggle monthly payment status error:", error);

    return res.status(500).json({
      error: "Unable to update monthly payment status.",
    });
  }
});

/*
 * DELETE MONTH
 *
 * Only deletes the MonthlyRecord itself.
 * Existing Payment records are NOT automatically deleted.
 */
router.delete("/:id", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const id = Number(req.params.id);

    const existing = await prisma.monthlyRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        error: "Month not found.",
      });
    }

    const payments = await prisma.payment.count({
      where: {
        academicYearId: existing.academicYearId,
        month: existing.month,
      },
    });

    if (payments > 0) {
      return res.status(409).json({
        error:
          "This month has payment records. Reopen or manage those payments before deleting the month.",
      });
    }

    await prisma.monthlyRecord.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: req.user!.roles.join(","),
        action: "DELETE_MONTH",
        targetType: "MONTHLY_RECORD",
        targetId: String(id),
        status: "SUCCESS",
        oldValue: {
          name: existing.name,
          month: existing.month,
          academicYearId: existing.academicYearId,
          paymentAmount: existing.paymentAmount,
        },
      },
    });

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error("Delete month error:", error);

    return res.status(500).json({
      error: "Unable to delete month.",
    });
  }
});

/*
 * MONTHLY PAYMENT STATUS UPDATE
 */
router.patch("/:id/members/:memberId/status", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const monthId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const status = String(req.body?.status || "").toUpperCase();

    if (!Number.isInteger(monthId) || !Number.isInteger(memberId)) {
      return res.status(400).json({
        error: "Invalid month or member.",
      });
    }

    if (status !== "PAID" && status !== "PENDING") {
      return res.status(400).json({
        error: "Status must be PAID or PENDING.",
      });
    }

    const month = await prisma.monthlyRecord.findUnique({
      where: { id: monthId },
    });

    if (!month) {
      return res.status(404).json({
        error: "Month not found.",
      });
    }

    const member = await prisma.memberProfile.findUnique({
      where: { id: memberId },
      include: {
        user: true,
      },
    });

    if (!member) {
      return res.status(404).json({
        error: "Member not found.",
      });
    }

    const existingPayment = await prisma.payment.findFirst({
      where: {
        memberId,
        academicYearId: month.academicYearId,
        month: month.month,
      },
      orderBy: {
        id: "desc",
      },
    });

    if (status === "PAID") {
      let payment;

      if (existingPayment) {
        payment = await prisma.payment.update({
          where: {
            id: existingPayment.id,
          },
          data: {
            status: "COMPLETED",
            paymentAmount: Number(month.paymentAmount || 0),
            paymentDate: existingPayment.paymentDate || new Date(),
            recordedById: req.user!.id,
          },
        });
      } else {
        payment = await prisma.payment.create({
          data: {
            memberId,
            academicYearId: month.academicYearId,
            month: month.month,
            paymentAmount: Number(month.paymentAmount || 0),
            paymentDate: new Date(),
            week1: true,
            week2: true,
            week3: true,
            week4: true,
            totalWeeks: 4,
            recordedById: req.user!.id,
            status: "COMPLETED",
            notes: "Owner marked as PAID from Monthly Payments.",
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          actorRole: req.user!.roles.join(","),
          action: "MARK_MONTHLY_PAYMENT_PAID",
          targetType: "PAYMENT",
          targetId: String(payment.id),
          status: "SUCCESS",
          newValue: {
            memberId,
            monthId,
            academicYearId: month.academicYearId,
            month: month.month,
            status: "PAID",
          },
        },
      });

      return res.json({
        success: true,
        status: "PAID",
        paymentId: payment.id,
      });
    }

    if (existingPayment) {
      const payment = await prisma.payment.update({
        where: {
          id: existingPayment.id,
        },
        data: {
          status: "PENDING",
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          actorRole: req.user!.roles.join(","),
          action: "MARK_MONTHLY_PAYMENT_PENDING",
          targetType: "PAYMENT",
          targetId: String(payment.id),
          status: "SUCCESS",
          newValue: {
            memberId,
            monthId,
            academicYearId: month.academicYearId,
            month: month.month,
            status: "PENDING",
          },
        },
      });
    }

    return res.json({
      success: true,
      status: "PENDING",
    });
  } catch (error) {
    console.error("Monthly payment status update error:", error);

    return res.status(500).json({
      error: "Unable to update monthly payment status.",
    });
  }
});

export default router;






