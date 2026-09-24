CREATE TABLE "ChatMessageReaction" (
  "id" SERIAL NOT NULL,
  "messageId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "reaction" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatMessageReaction_messageId_userId_reaction_key" ON "ChatMessageReaction"("messageId", "userId", "reaction");
CREATE INDEX "ChatMessageReaction_messageId_idx" ON "ChatMessageReaction"("messageId");
CREATE TABLE "ChatMessageStar" (
  "id" SERIAL NOT NULL,
  "messageId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageStar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatMessageStar_messageId_userId_key" ON "ChatMessageStar"("messageId", "userId");
CREATE INDEX "ChatMessageStar_userId_createdAt_idx" ON "ChatMessageStar"("userId", "createdAt");
CREATE TABLE "ChatMessagePin" (
  "id" SERIAL NOT NULL,
  "messageId" INTEGER NOT NULL,
  "pinnedById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessagePin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatMessagePin_messageId_key" ON "ChatMessagePin"("messageId");
CREATE TABLE "ChatMessageAttachment" (
  "id" SERIAL NOT NULL,
  "messageId" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChatMessageAttachment_messageId_idx" ON "ChatMessageAttachment"("messageId");
CREATE TABLE "ChatMessageDelivery" (
  "id" SERIAL NOT NULL,
  "messageId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  CONSTRAINT "ChatMessageDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatMessageDelivery_messageId_userId_key" ON "ChatMessageDelivery"("messageId", "userId");
CREATE INDEX "ChatMessageDelivery_userId_readAt_idx" ON "ChatMessageDelivery"("userId", "readAt");
CREATE TABLE "ChatNotification" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "conversationId" INTEGER NOT NULL,
  "messageId" INTEGER,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChatNotification_userId_readAt_createdAt_idx" ON "ChatNotification"("userId", "readAt", "createdAt");
ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" INTEGER;
CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");
ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageStar" ADD CONSTRAINT "ChatMessageStar_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageStar" ADD CONSTRAINT "ChatMessageStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessagePin" ADD CONSTRAINT "ChatMessagePin_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessagePin" ADD CONSTRAINT "ChatMessagePin_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageAttachment" ADD CONSTRAINT "ChatMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageDelivery" ADD CONSTRAINT "ChatMessageDelivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageDelivery" ADD CONSTRAINT "ChatMessageDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatNotification" ADD CONSTRAINT "ChatNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
