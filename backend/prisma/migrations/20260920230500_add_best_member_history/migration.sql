-- CreateTable
CREATE TABLE "BestMemberHistory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "rcNumber" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BestMemberHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BestMemberHistory_rcNumber_idx" ON "BestMemberHistory"("rcNumber");

-- CreateIndex
CREATE INDEX "BestMemberHistory_year_month_idx" ON "BestMemberHistory"("year", "month");

-- CreateIndex
CREATE INDEX "BestMemberHistory_createdAt_idx" ON "BestMemberHistory"("createdAt");
