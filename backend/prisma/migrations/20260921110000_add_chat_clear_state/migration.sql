-- CreateTable
CREATE TABLE "ChatClearState" (
    "id" INTEGER NOT NULL,
    "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedById" INTEGER NOT NULL,

    CONSTRAINT "ChatClearState_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChatClearState" ADD CONSTRAINT "ChatClearState_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;