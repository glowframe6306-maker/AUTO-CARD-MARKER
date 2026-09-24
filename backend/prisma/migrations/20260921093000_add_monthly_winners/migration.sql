-- CreateTable
CREATE TABLE "MonthlyWinner" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "rcNumber" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyWinner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyWinner_year_month_idx" ON "MonthlyWinner"("year", "month");

-- CreateIndex
CREATE INDEX "MonthlyWinner_createdAt_idx" ON "MonthlyWinner"("createdAt");