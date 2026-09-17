import { Router } from "express";
import prisma from "../prisma";
import { authenticate, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthorizedRequest, res) => {
  const notifications = await prisma.notification.findMany({
    where: { recipientId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });

  return res.json(notifications);
});

router.post("/read/:id", async (req: AuthorizedRequest, res) => {
  const notification = await prisma.notification.findUnique({
    where: { id: Number(req.params.id) },
  });

  if (!notification) {
    return res.status(404).json({ error: "Notification not found." });
  }

  if (notification.recipientId !== req.user!.id) {
    return res.status(403).json({ error: "Forbidden." });
  }

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { read: true },
  });

  return res.json(updated);
});

export default router;
