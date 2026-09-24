import { Router } from "express";
import prisma from "../prisma";
import { authenticate, AuthorizedRequest } from "../middleware/authMiddleware";
import { LeaderboardCategory, PointActionType, PointDirection } from "@prisma/client";
import { OWNER_POINT_CATEGORIES, getCategoryMeta, getLeaderboardMemberSummary, getLeaderboardCategories, getMemberLeaderboardForUser } from "../utils/leaderboard";

const router = Router();
router.use(authenticate);

const OWNER_ONLY_MESSAGE = "Leaderboard management is restricted to the Owner account.";

function requireOwner(req: AuthorizedRequest, res: any, next: any) {
  if (req.user?.isOwner !== true) {
    return res.status(403).json({ error: OWNER_ONLY_MESSAGE });
  }
  return next();
}

function normalizeCategory(categoryValue: unknown): LeaderboardCategory | null {
  if (typeof categoryValue !== "string") return null;
  const value = categoryValue.trim();
  const category = Object.values(LeaderboardCategory ?? {}).find((v) => v === value);
  if (category) {
    return category as LeaderboardCategory;
  }

  const match = {
    "Monthly Payment": "MONTHLY_PAYMENT",
    "Daily App Visit": "DAILY_APP_VISIT",
    "Discipline": "DISCIPLINE",
    "Meeting Attendance": "MEETING_ATTENDANCE",
    "Volunteer Activity": "VOLUNTEER_ACTIVITY",
    "Successfully Completing an Assigned Task": "ASSIGNED_TASK",
    "Helping Other Members": "HELPING_OTHER_MEMBERS",
    "Creative Idea Submission": "CREATIVE_IDEA_SUBMISSION",
    "Approved Project Proposal": "APPROVED_PROJECT_PROPOSAL",
    "Excellent Teamwork": "EXCELLENT_TEAMWORK",
  }[value];

  return (match as LeaderboardCategory) ?? null;
}

router.get("/", async (req: AuthorizedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const rows = await getLeaderboardMemberSummary();
    const roleBasedRows = rows.filter((row) => row.accountId !== "OWNER");

    if (user.isOwner === true) {
      const members = await prisma.memberProfile.findMany({
        include: { user: { select: { id: true, accountId: true, fullName: true, isOwner: true } } },
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
      });

      return res.json({
        totalMembers: members.filter((member) => member.user.isOwner !== true).length,
        leaderboard: roleBasedRows,
        categories: await getLeaderboardCategories(),
      });
    }

    const member = await prisma.memberProfile.findUnique({
      where: { userId: user.id },
      include: { user: { select: { accountId: true, isOwner: true } } },
    });
    if (!member) {
      return res.status(404).json({ error: "Member profile not found." });
    }

    const memberSummary = roleBasedRows.find((row) => row.userId === user.id) ?? {
      id: member.id,
      memberId: member.memberId,
      userId: member.userId,
      fullName: member.fullName,
      accountId: member.user?.accountId ?? "",
      totalPoints: 0,
      categoryTotals: Object.fromEntries((await getLeaderboardCategories()).map((category) => [category.value, 0])),
      rank: null,
    };

    const rank = Math.max(
      1,
      roleBasedRows.findIndex((row) => row.userId === user.id) + 1
    );

    return res.json({
      member: { ...memberSummary, rank },
      rank,
      leaderboard: roleBasedRows,
      categories: await getLeaderboardCategories(),
      topThree: roleBasedRows.slice(0, 3),
    });
  } catch (error) {
    console.error("GET /api/leaderboard failed:", error);
    return res.status(500).json({ error: "Unable to load leaderboard." });
  }
});

router.get("/me", async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const member = await prisma.memberProfile.findUnique({ where: { userId: req.user.id } });
    if (!member && req.user.isOwner !== true) {
      return res.status(404).json({ error: "Member profile not found." });
    }

    const rows = await getLeaderboardMemberSummary();
    const ranked = rows.filter((row) => row.userId !== undefined);
    const memberRow = ranked.find((row) => row.userId === req.user!.id) ?? null;

    return res.json({
      member: memberRow,
      topThree: ranked.slice(0, 3),
      leaderboard: ranked,
      totalMembers: ranked.length,
      categories: await getLeaderboardCategories(),
      rank: memberRow ? memberRow.rank : null,
    });
  } catch (error) {
    console.error("GET /api/leaderboard/me failed:", error);
    return res.status(500).json({ error: "Unable to load your leaderboard summary." });
  }
});

router.get("/members", authenticate, async (req: AuthorizedRequest, res) => {
  try {
    if (req.user?.isOwner !== true) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const members = await prisma.memberProfile.findMany({
      include: { user: { select: { id: true, accountId: true, fullName: true, isOwner: true } } },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
    });

    return res.json(members.filter((member) => member.user.isOwner !== true).map((member) => ({
      id: member.id,
      memberId: member.memberId,
      userId: member.userId,
      fullName: member.fullName,
      rcNumber: member.memberId,
      accountId: member.user?.accountId ?? "",
    })));
  } catch (error) {
    console.error("GET /api/leaderboard/members failed:", error);
    return res.status(500).json({ error: "Unable to load leaderboard members." });
  }
});

router.get("/categories", authenticate, async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const categories = await getLeaderboardCategories();
    return res.json(categories);
  } catch (error) {
    console.error("GET /api/leaderboard/categories failed:", error);
    return res.status(500).json({ error: "Unable to load leaderboard categories." });
  }
});

router.get("/monthly-winners", async (_req: AuthorizedRequest, res) => {
  try {
    const records = await prisma.monthlyWinner.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    });
    return res.json(records);
  } catch (error) {
    console.error("GET /api/leaderboard/monthly-winners failed:", error);
    return res.status(500).json({ error: "Unable to load monthly winners." });
  }
});

router.post("/monthly-winners", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const rcNumber = typeof req.body?.rcNumber === "string" ? req.body.rcNumber.trim() : "";
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);

    if (!name || !rcNumber || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1 || year > 9999) {
      return res.status(400).json({ error: "Name, RC number, month, and year are required." });
    }

    const record = await prisma.monthlyWinner.create({
      data: { name, rcNumber, month, year },
    });
    return res.status(201).json(record);
  } catch (error) {
    console.error("POST /api/leaderboard/monthly-winners failed:", error);
    return res.status(500).json({ error: "Unable to publish monthly winner." });
  }
});

router.delete("/monthly-winners/:id", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "A valid monthly winner is required." });
    }

    const existing = await prisma.monthlyWinner.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Monthly winner not found." });
    }

    await prisma.monthlyWinner.delete({ where: { id } });
    return res.json({ success: true, id });
  } catch (error) {
    console.error("DELETE /api/leaderboard/monthly-winners/:id failed:", error);
    return res.status(500).json({ error: "Unable to delete monthly winner." });
  }
});

router.post("/daily-visit", authenticate, async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (req.user.isOwner === true) {
      return res.status(403).json({ error: "Owner accounts do not receive member leaderboard points." });
    }

    const member = await prisma.memberProfile.findUnique({ where: { userId: req.user.id } });
    if (!member) {
      return res.status(404).json({ error: "Member profile not found." });
    }

    const today = new Date();
    const dateKey = today.toISOString().slice(0, 10);
    const eventKey = `DAILY_VISIT:${req.user.id}:${dateKey}`;

    const transaction = await prisma.$transaction(async (tx) => {
      const existing = await tx.pointTransaction.findUnique({ where: { eventKey } });
      if (existing) {
        return { created: false, transaction: existing };
      }
      const created = await tx.pointTransaction.create({
        data: {
          userId: req.user!.id,
          category: "DAILY_APP_VISIT",
          points: 5,
          direction: "POSITIVE",
          actionType: "AUTOMATIC",
          eventKey,
          description: `Daily app visit on ${dateKey}`,
        },
      });
      return { created: true, transaction: created };
    });

    return res.status(transaction.created ? 201 : 200).json({
      success: true,
      awarded: transaction.created,
      points: 5,
      category: "DAILY_APP_VISIT",
      eventKey,
      transaction: transaction.transaction,
    });
  } catch (error) {
    console.error("POST /api/leaderboard/daily-visit failed:", error);
    return res.status(500).json({ error: "Unable to record the daily app visit." });
  }
});

router.post("/points", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const { memberId, category, amount, description } = req.body;
    const memberUserId = Number(memberId);
    const points = Number(amount);
    const resolvedCategory = normalizeCategory(category);

    if (!Number.isInteger(memberUserId)) return res.status(400).json({ error: "A valid member is required." });
    if (!resolvedCategory) return res.status(400).json({ error: "A valid category is required." });
    if (!Number.isInteger(points) || points <= 0) return res.status(400).json({ error: "Points must be a positive integer." });

    const member = await prisma.memberProfile.findUnique({ where: { id: memberUserId }, include: { user: true } });
    if (!member) return res.status(404).json({ error: "Member not found." });
    if (member.user.isOwner) return res.status(403).json({ error: "Owner accounts cannot receive member leaderboard points." });

    const categoryMeta = getCategoryMeta(resolvedCategory);
    if (!categoryMeta) return res.status(400).json({ error: "Unsupported category." });
    if (!OWNER_POINT_CATEGORIES.some((category) => category.value === resolvedCategory)) {
      return res.status(400).json({ error: "This category is awarded automatically." });
    }

    const eventKey = `OWNER_AWARD:${member.userId}:${resolvedCategory}:${Date.now()}`;
    const transaction = await prisma.$transaction(async (tx) => {
      const existing = await tx.pointTransaction.findFirst({ where: { userId: member.userId, category: resolvedCategory, actionType: "AWARD", description: description ?? undefined }, orderBy: { createdAt: "desc" } });
      if (existing && !description) {
        return existing;
      }
      const created = await tx.pointTransaction.create({
        data: {
          userId: member.userId,
          category: resolvedCategory,
          points: Math.abs(points),
          direction: "POSITIVE",
          actionType: "AWARD",
          awardedById: req.user!.id,
          eventKey,
          description: description || `${categoryMeta.label} award by Owner`,
        },
      });
      return created;
    });

    return res.status(201).json({
      success: true,
      transaction,
      awarded: true,
      member,
      category: resolvedCategory,
      points: Math.abs(points),
    });
  } catch (error) {
    console.error("POST /api/leaderboard/points failed:", error);
    return res.status(500).json({ error: "Unable to award points." });
  }
});

router.post("/reduction", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const { memberId, category, amount, description } = req.body;
    const memberProfileId = Number(memberId);
    const reduction = Number(amount);
    const resolvedCategory = normalizeCategory(category);

    if (!Number.isInteger(memberProfileId)) return res.status(400).json({ error: "A valid member is required." });
    if (!resolvedCategory) return res.status(400).json({ error: "A valid category is required." });
    if (!Number.isInteger(reduction) || reduction <= 0) return res.status(400).json({ error: "Reduction amount must be a positive integer." });
    if (!OWNER_POINT_CATEGORIES.some((category) => category.value === resolvedCategory)) {
      return res.status(400).json({ error: "This category is awarded automatically." });
    }

    const member = await prisma.memberProfile.findUnique({ where: { id: memberProfileId }, include: { user: true } });
    if (!member) return res.status(404).json({ error: "Member not found." });
    if (member.user.isOwner) return res.status(403).json({ error: "Owner accounts cannot receive member leaderboard points." });

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.pointTransaction.create({
        data: {
          userId: member.userId,
          category: resolvedCategory,
          points: Math.abs(reduction),
          direction: "NEGATIVE",
          actionType: "REDUCTION",
          awardedById: req.user!.id,
          eventKey: `OWNER_REDUCTION:${member.userId}:${resolvedCategory}:${Date.now()}`,
          description: description || `Reduction for ${resolvedCategory}`,
        },
      });
      return created;
    });

    return res.status(201).json({ success: true, transaction, reduced: true, points: Math.abs(reduction), category: resolvedCategory });
  } catch (error) {
    console.error("POST /api/leaderboard/reduction failed:", error);
    return res.status(500).json({ error: "Unable to reduce points." });
  }
});

router.post("/reset", requireOwner, async (req: AuthorizedRequest, res) => {
  try {
    const authenticatedOwner = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { isOwner: true } });
    if (authenticatedOwner?.isOwner !== true) {
      return res.status(403).json({ error: OWNER_ONLY_MESSAGE });
    }

    const reset = await prisma.$transaction(async (tx) => {
      const createdReset = await tx.leaderboardReset.create({
        data: { createdById: req.user!.id },
      });
      const memberCount = await tx.memberProfile.count({ where: { user: { isOwner: false } } });
      return { createdReset, memberCount };
    });

    return res.json({ success: true, resetCount: reset.memberCount, resetAt: reset.createdReset.createdAt });
  } catch (error) {
    console.error("POST /api/leaderboard/reset failed:", error);
    return res.status(500).json({ error: "Unable to reset leaderboard points. No changes were made." });
  }
});

router.get("/summary", authenticate, async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const rows = await getLeaderboardMemberSummary();
    return res.json({ leaderboard: rows, totalMembers: rows.length, categories: await getLeaderboardCategories() });
  } catch (error) {
    console.error("GET /api/leaderboard/summary failed:", error);
    return res.status(500).json({ error: "Unable to load leaderboard summary." });
  }
});

export default router;
