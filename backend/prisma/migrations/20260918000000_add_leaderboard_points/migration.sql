-- CreateEnum
CREATE TYPE "LeaderboardCategory" AS ENUM ('MONTHLY_PAYMENT', 'DAILY_APP_VISIT', 'DISCIPLINE', 'MEETING_ATTENDANCE', 'VOLUNTEER_ACTIVITY', 'ASSIGNED_TASK', 'HELPING_OTHER_MEMBERS', 'CREATIVE_IDEA_SUBMISSION', 'APPROVED_PROJECT_PROPOSAL', 'EXCELLENT_TEAMWORK');

-- CreateEnum
CREATE TYPE "PointActionType" AS ENUM ('AWARD', 'REDUCTION', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "PointDirection" AS ENUM ('POSITIVE', 'NEGATIVE');

-- CreateTable
CREATE TABLE "PointTransaction" (
	"id" SERIAL NOT NULL,
	"userId" INTEGER NOT NULL,
	"category" "LeaderboardCategory" NOT NULL,
	"points" INTEGER NOT NULL,
	"direction" "PointDirection" NOT NULL,
	"actionType" "PointActionType" NOT NULL,
	"awardedById" INTEGER,
	"eventKey" TEXT,
	"description" TEXT,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PointTransaction_eventKey_key" ON "PointTransaction"("eventKey");

-- CreateIndex
CREATE INDEX "PointTransaction_userId_idx" ON "PointTransaction"("userId");

-- CreateIndex
CREATE INDEX "PointTransaction_category_idx" ON "PointTransaction"("category");

-- CreateIndex
CREATE INDEX "PointTransaction_createdAt_idx" ON "PointTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
