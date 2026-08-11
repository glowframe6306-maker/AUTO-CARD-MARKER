import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticate);

router.get("/dashboard", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
  const totalMembers = await prisma.memberProfile.count();
  const activeMembers = await prisma.memberProfile.count({ where: { status: "ACTIVE" } });
  const inactiveMembers = await prisma.memberProfile.count({ where: { status: "INACTIVE" } });
  const payments = await prisma.payment.findMany({ orderBy: { paymentDate: "desc" }, take: 10 });
  const totalCollection = await prisma.payment.aggregate({ _sum: { paymentAmount: true } });
  const unpaid = await prisma.payment.count({ where: { totalWeeks: { lt: 4 } } });
  return res.json({ totalMembers, activeMembers, inactiveMembers, totalCollection: totalCollection._sum.paymentAmount || 0, unpaidPayments: unpaid, recentPayments: payments });
});

export default router;
