import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requirePermission, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("view_audit_logs"), async (req: AuthorizedRequest, res) => {
  const { page = "1", pageSize = "20", search } = req.query as Record<string, string>;
  const where: any = {};
  if (search) {
    where.OR = [
      { actorRole: { contains: search, mode: "insensitive" } },
      { action: { contains: search, mode: "insensitive" } },
      { targetType: { contains: search, mode: "insensitive" } },
      { targetId: { contains: search, mode: "insensitive" } },
      { reason: { contains: search, mode: "insensitive" } },
    ];
  }
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (Number(page) - 1) * Number(pageSize), take: Number(pageSize) });
  const count = await prisma.auditLog.count({ where });
  return res.json({ data: logs, count });
});

export default router;
