import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireAnyRole, AuthorizedRequest } from "../middleware/authMiddleware";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthorizedRequest, res) => {
  const publishedOnly = req.user?.roles.includes("MEMBER") && !req.user?.isOwner;
  const where = publishedOnly ? { isPublished: true } : undefined;
  const announcements = await prisma.announcement.findMany({ where, orderBy: { createdAt: "desc" } });
  return res.json(announcements);
});

router.post("/", requireAnyRole(["OWNER", "SUPER_ADMIN", "ADMINISTRATOR", "ADMIN"]), async (req: AuthorizedRequest, res) => {
  const { title, content, scheduledAt, isPublished } = req.body;
  if (!title || !content) return res.status(400).json({ error: "Title and content are required." });
  const announcement = await prisma.announcement.create({ data: { title, content, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, publishedAt: isPublished ? new Date() : null, isPublished: Boolean(isPublished) } });
  return res.status(201).json(announcement);
});

export default router;
