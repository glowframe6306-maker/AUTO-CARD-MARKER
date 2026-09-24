import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole } from "../middleware/authMiddleware";

const router = Router();
router.use(authenticate);

router.get("/", requireAnyRole(["OWNER", "SUPER_ADMIN"]), async (req, res) => {
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } }, users: true } });
  return res.json(roles);
});

router.post("/assign", requireAnyRole(["OWNER"]), async (req, res) => {
  const { accountId, roleName } = req.body;
  if (!accountId || !roleName) {
    return res.status(400).json({ error: "accountId and roleName are required." });
  }
  const user = await prisma.user.findUnique({ where: { accountId } });
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!user || !role) return res.status(404).json({ error: "User or role not found." });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return res.json({ message: "Role assigned." });
});

export default router;
