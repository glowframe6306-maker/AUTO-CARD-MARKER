import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();
router.use(authenticate);

router.get("/", authenticate, async (req: AuthorizedRequest, res) => {
  const adminRoles = ["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"];
  const hasAdminAccess = req.user?.isOwner || req.user?.roles.some((role) => adminRoles.includes(role));

  if (hasAdminAccess) {
    const receipts = await prisma.receipt.findMany({ include: { member: true, issuedBy: true }, orderBy: { issuedAt: "desc" } });
    return res.json(receipts);
  }

  if (req.user?.roles.includes("MEMBER")) {
    const receipts = await prisma.receipt.findMany({
      where: { member: { userId: req.user.id } },
      include: { member: true, issuedBy: true },
      orderBy: { issuedAt: "desc" },
    });
    return res.json(receipts);
  }

  return res.status(403).json({ error: "Forbidden" });
});

router.get("/:receiptNumber", authenticate, async (req: AuthorizedRequest, res) => {
  const receipt = await prisma.receipt.findUnique({ where: { receiptNumber: req.params.receiptNumber }, include: { member: true, issuedBy: true } });
  if (!receipt) return res.status(404).json({ error: "Receipt not found." });
  const adminRoles = ["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"];
  const hasAdminAccess = req.user?.isOwner || req.user?.roles.some((role) => adminRoles.includes(role));
  if (!hasAdminAccess && receipt.member.userId !== req.user?.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return res.json(receipt);
});

export default router;
