-- CreateTable
CREATE TABLE "LeaderboardReset" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "LeaderboardReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaderboardReset_createdAt_idx" ON "LeaderboardReset"("createdAt");

-- AddForeignKey
ALTER TABLE "LeaderboardReset" ADD CONSTRAINT "LeaderboardReset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
