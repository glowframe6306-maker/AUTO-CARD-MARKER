ALTER TABLE "User"
ADD COLUMN "alwaysAllowSecurityVerification" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Device"
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "isLatest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pushToken" TEXT;

CREATE UNIQUE INDEX "Device_deviceId_key"
ON "Device"("deviceId");

CREATE INDEX "Device_userId_isLatest_idx"
ON "Device"("userId", "isLatest");

CREATE INDEX "Device_userId_lastLoginAt_idx"
ON "Device"("userId", "lastLoginAt");
