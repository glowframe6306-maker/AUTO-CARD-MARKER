ALTER TABLE "CameraVerificationSession"
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "CameraVerificationSession_expiresAt_idx"
ON "CameraVerificationSession"("expiresAt");