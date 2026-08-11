import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";
import { calculateWeeksFromAmount } from "../utils/payments";

const router = Router();

router.use(authenticate);

router.post("/", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
  const { memberId, academicYear, month, paymentAmount, paymentDate, notes } = req.body;
  if (!memberId || !academicYear || month == null || paymentAmount == null || !paymentDate) {
    return res.status(400).json({ error: "Missing required payment data." });
  }

  const member = await prisma.memberProfile.findUnique({ where: { memberId } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  const year = await prisma.academicYear.findUnique({ where: { year: Number(academicYear) } });
  if (!year) return res.status(404).json({ error: "Academic year not found." });

  const existing = await prisma.payment.findFirst({ where: { memberId: member.id, academicYearId: year.id, month } });
  if (existing) {
    return res.status(409).json({ error: "Payment for this member, month and year already exists." });
  }

  const weeks = calculateWeeksFromAmount(paymentAmount);
  const data = {
    memberId: member.id,
    academicYearId: year.id,
    month,
    paymentAmount,
    paymentDate: new Date(paymentDate),
    week1: weeks >= 1,
    week2: weeks >= 2,
    week3: weeks >= 3,
    week4: weeks >= 4,
    totalWeeks: weeks,
    recordedById: req.user!.id,
    status: "COMPLETED",
    notes,
  };

  const payment = await prisma.payment.create({ data });
  await prisma.receipt.create({
    data: {
      paymentId: payment.id,
      memberId: member.id,
      issuedById: req.user!.id,
      amount: paymentAmount,
      weeksPaid: weeks,
      month,
      receiptNumber: `RC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(","),
      action: "CREATE_PAYMENT",
      targetType: "PAYMENT",
      targetId: `${payment.id}`,
      status: "SUCCESS",
      newValue: data,
    },
  });

  return res.status(201).json(payment);
});

router.get("/member/:memberId", authenticate, async (req: AuthorizedRequest, res) => {
  const { memberId } = req.params;
  const member = await prisma.memberProfile.findUnique({ where: { memberId } });
  if (!member) return res.status(404).json({ error: "Member not found." });
  if (!req.user?.isOwner && !req.user.roles.includes("OWNER") && !req.user.roles.includes("SUPER_ADMIN") && !req.user.roles.includes("ADMINISTRATOR") && !req.user.roles.includes("ADMIN") && member.userId !== req.user?.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const payments = await prisma.payment.findMany({ where: { memberId: member.id }, orderBy: { paymentDate: "desc" } });
  return res.json(payments);
});

export default router;
