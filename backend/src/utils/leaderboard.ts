import prisma from "../prisma";
import { LeaderboardCategory, PointActionType, PointDirection, Prisma } from "@prisma/client";

export const LEADERBOARD_CATEGORY_META = [
  { value: "MONTHLY_PAYMENT", label: "Monthly Payment", points: 10 },
  { value: "DAILY_APP_VISIT", label: "Daily App Visit", points: 5 },
  { value: "DISCIPLINE", label: "Discipline", points: 10 },
  { value: "MEETING_ATTENDANCE", label: "Meeting Attendance", points: 10 },
  { value: "VOLUNTEER_ACTIVITY", label: "Volunteer Activity", points: 20 },
  { value: "ASSIGNED_TASK", label: "Successfully Completing an Assigned Task", points: 30 },
  { value: "HELPING_OTHER_MEMBERS", label: "Helping Other Members", points: 20 },
  { value: "CREATIVE_IDEA_SUBMISSION", label: "Creative Idea Submission", points: 10 },
  { value: "APPROVED_PROJECT_PROPOSAL", label: "Approved Project Proposal", points: 30 },
  { value: "EXCELLENT_TEAMWORK", label: "Excellent Teamwork", points: 50 },
  { value: "RESPECT_OTHERS", label: "Respect Others", points: 10 },
  { value: "TALKING_IN_ENGLISH", label: "Talking in English", points: 10 },
] as const;

export const OWNER_POINT_CATEGORIES = LEADERBOARD_CATEGORY_META.filter(
  (category) => category.value !== "MONTHLY_PAYMENT" && category.value !== "DAILY_APP_VISIT"
);

export function getCategoryMeta(category: LeaderboardCategory) {
  return LEADERBOARD_CATEGORY_META.find((meta) => meta.value === category) ?? null;
}

export function getPositiveDirectionValue(direction: PointDirection) {
  return direction === "NEGATIVE" ? -1 : 1;
}

export async function createLeaderboardPointTransaction({
  userId,
  category,
  points,
  direction,
  actionType,
  awardedById,
  eventKey,
  description,
}: {
  userId: number;
  category: LeaderboardCategory;
  points: number;
  direction: PointDirection;
  actionType: PointActionType;
  awardedById?: number | null;
  eventKey?: string | null;
  description?: string | null;
}) {
  const amount = Number(points);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Points must be a positive integer.");
  }

  const safeDirection = direction === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const safeActionType = actionType === "REDUCTION" ? "REDUCTION" : actionType === "AUTOMATIC" ? "AUTOMATIC" : "AWARD";

  return prisma.$transaction(async (tx) => {
    if (eventKey) {
      const existing = await tx.pointTransaction.findUnique({
        where: { eventKey },
      });

      if (existing) {
        return existing;
      }
    }

    return tx.pointTransaction.create({
      data: {
        userId,
        category,
        points: amount,
        direction: safeDirection,
        actionType: safeActionType,
        awardedById: awardedById ?? null,
        eventKey: eventKey ?? null,
        description: description ?? null,
      },
    });
  });
}

export async function getLeaderboardMemberSummary(userId?: number | null) {
  const members = await prisma.memberProfile.findMany({
    where: userId ? { userId } : undefined,
    include: {
      user: {
        select: {
          id: true,
          accountId: true,
          fullName: true,
          isOwner: true,
          email: true,
        },
      },
    },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
  });

  const latestReset = await prisma.leaderboardReset.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const transactions = await prisma.pointTransaction.findMany({
    where: latestReset ? { createdAt: { gt: latestReset.createdAt } } : undefined,
    select: {
      userId: true,
      category: true,
      points: true,
      direction: true,
    },
  });

  const totalByUser = new Map<number, number>();
  const categoryTotalsByUser = new Map<number, Record<string, number>>();

  for (const transaction of transactions) {
    const userTotal = totalByUser.get(transaction.userId) ?? 0;
    const delta = transaction.direction === "NEGATIVE" ? -Number(transaction.points) : Number(transaction.points);
    totalByUser.set(transaction.userId, userTotal + delta);

    const categoryMap = categoryTotalsByUser.get(transaction.userId) ?? {} as Record<string, number>;
    categoryMap[transaction.category] = (categoryMap[transaction.category] ?? 0) + delta;
    categoryTotalsByUser.set(transaction.userId, categoryMap);
  }

  const rows = members
    .filter((member) => member.user?.isOwner !== true)
    .map((member) => {
      const totalPoints = totalByUser.get(member.userId) ?? 0;
      const categoryTotals = categoryTotalsByUser.get(member.userId) ?? {} as Record<string, number>;
      const normalizedCategoryTotals = Object.fromEntries(
        LEADERBOARD_CATEGORY_META.map((meta) => [meta.value, Number(categoryTotals[meta.value] ?? 0)])
      );

      return {
        id: member.id,
        memberId: member.memberId,
        userId: member.userId,
        fullName: member.fullName,
        position: member.position,
        accountId: member.user?.accountId ?? "",
        email: member.user?.email ?? null,
        totalPoints,
        categoryTotals: normalizedCategoryTotals,
      };
    })
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return String(a.fullName).localeCompare(String(b.fullName)) || String(a.memberId).localeCompare(String(b.memberId));
    });

  const ranked = rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));

  return ranked;
}

export function getTotalMemberCount() {
  return prisma.memberProfile.count({
    where: { user: { isOwner: false } },
  });
}

export async function awardMonthlyPaymentPointsForCompletedPayment({
  memberId,
  paymentId,
  paymentMonth,
  academicYearId,
  userId,
}: {
  memberId: number;
  paymentId: number;
  paymentMonth: number;
  academicYearId: number;
  userId: number;
}) {
  const member = await prisma.memberProfile.findUnique({
    where: { id: memberId },
    include: { user: true },
  });

  if (!member || member.user.isOwner) {
    return null;
  }

  const eventKey = `MONTHLY_PAYMENT:${member.userId}:${academicYearId}:${paymentMonth}:${paymentId}`;
  return createLeaderboardPointTransaction({
    userId: member.userId,
    category: "MONTHLY_PAYMENT",
    points: 10,
    direction: "POSITIVE",
    actionType: "AUTOMATIC",
    awardedById: null,
    eventKey,
    description: `Monthly payment completed for month ${paymentMonth} (payment #${paymentId}).`,
  });
}

export async function getLeaderboardCategories() {
  return LEADERBOARD_CATEGORY_META.map((meta) => ({
    value: meta.value,
    label: meta.label,
    points: meta.points,
  }));
}

export async function getMemberLeaderboardForUser(memberUserId: number) {
  const rows = await getLeaderboardMemberSummary();
  const memberRow = rows.find((row) => row.userId === memberUserId) ?? null;
  const rank = memberRow ? memberRow.rank : null;

  return {
    member: memberRow,
    rank,
    leaderboard: rows,
    topThree: rows.slice(0, 3),
  };
}

