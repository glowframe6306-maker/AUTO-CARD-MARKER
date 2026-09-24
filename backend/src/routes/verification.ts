import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireRole, AuthorizedRequest } from "../middleware/authMiddleware";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();
router.use(authenticate);

const fcmServerKey = process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY;
const uploadPath = process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads/secure/verifications");
fs.mkdirSync(uploadPath, { recursive: true });

async function sendFcmNotification(pushToken: string, title: string, body: string, data: Record<string, string>) {
  if (!fcmServerKey || !pushToken) {
    return false;
  }

  try {
    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: `key=${fcmServerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: pushToken,
        notification: {
          title,
          body,
          sound: "default",
        },
        data,
        priority: "high",
      }),
    });

    if (!response.ok) {
      console.warn("FCM push delivery failed", response.status);
      return false;
    }

    return true;
  } catch {
    console.warn("FCM push delivery error");
    return false;
  }
}

async function sendTargetedDeviceNotification(targetUserId: number, session: { id: number; durationSeconds?: number | null }, sourceAccountId?: string) {
  const latestDevice = await getLatestActiveDeviceForUser(targetUserId);
  if (!latestDevice || !latestDevice.pushToken) {
    return false;
  }

  const platform = (latestDevice.platform || "WEB").toUpperCase();
  if (!platform.includes("ANDROID")) {
    return false;
  }

  const sessionData = {
    sessionId: String(session.id),
    kind: "SECURITY_VERIFICATION_REQUEST",
    accountId: sourceAccountId || "owner",
    durationSeconds: String(session.durationSeconds ?? 60),
  };

  return sendFcmNotification(
    latestDevice.pushToken,
    "Security Verification Request",
    "A recording request requires your approval.",
    sessionData
  );
}

const upload = multer({ dest: uploadPath, limits: { fileSize: 40 * 1024 * 1024 } });

async function getLatestActiveDeviceForUser(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { latestDeviceIdentifier: true },
  });

  if (user?.latestDeviceIdentifier) {
    const latest = await prisma.device.findFirst({
      where: {
        userId,
        deviceIdentifier: user.latestDeviceIdentifier,
        isLatest: true,
      },
    });

    if (latest) {
      return latest;
    }
  }

  return prisma.device.findFirst({
    where: { userId, isLatest: true },
    orderBy: { lastLoginAt: "desc" },
  });
}

async function getAuthorizedOpenSession(sessionId: number, userId: number, deviceIdentifier?: string) {
  const session = await prisma.cameraVerificationSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) return { error: "Verification session not found." } as const;
  if (session.status !== "REQUESTED") return { error: "Verification session is no longer awaiting approval." } as const;
  if (session.expiresAt && session.expiresAt <= new Date()) return { error: "Verification request has expired." } as const;

  const latestDevice = await getLatestActiveDeviceForUser(userId);
  if (!latestDevice?.deviceIdentifier || latestDevice.deviceIdentifier !== session.targetDeviceIdentifier) {
    return { error: "This verification request is assigned to another device." } as const;
  }
  if (!deviceIdentifier || deviceIdentifier !== latestDevice.deviceIdentifier) {
    return { error: "This device is not the current verification target." } as const;
  }

  return { session, latestDevice } as const;
}

router.get("/policy", async (req: AuthorizedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found." });
  const effectivePolicy =
    user.verificationPolicy === "ALWAYS" || user.alwaysAllowSecurityVerification
      ? "ALWAYS"
      : user.verificationPolicy;

  return res.json({
    verificationPolicy: effectivePolicy,
    alwaysAllowSecurityVerification: user.alwaysAllowSecurityVerification || effectivePolicy === "ALWAYS",
  });
});

router.post("/policy", async (req: AuthorizedRequest, res) => {
  const { verificationPolicy } = req.body;
  if (!verificationPolicy) {
    return res.status(400).json({ error: "Verification policy choice is required." });
  }

  const normalizedPolicy = verificationPolicy === "ALWAYS" ? "ALWAYS" : verificationPolicy;
  const alwaysAllow = normalizedPolicy === "ALWAYS";

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      verificationPolicy: normalizedPolicy,
      alwaysAllowSecurityVerification: alwaysAllow,
    },
  });

  return res.json({
    verificationPolicy: user.verificationPolicy,
    alwaysAllowSecurityVerification: user.alwaysAllowSecurityVerification || user.verificationPolicy === "ALWAYS",
  });
});

router.get("/my-sessions", async (req: AuthorizedRequest, res) => {
  const sessions = await prisma.cameraVerificationSession.findMany({
    where: { userId: req.user!.id },
    orderBy: { requestedAt: "desc" },
    include: { requestedBy: true, user: true },
  });
  return res.json(sessions);
});

router.get("/sessions", requireRole("OWNER"), async (req: AuthorizedRequest, res) => {
  const sessions = await prisma.cameraVerificationSession.findMany({
    orderBy: { requestedAt: "desc" },
    include: { user: true, requestedBy: true },
  });
  return res.json(sessions);
});

router.get("/session/:sessionId", async (req: AuthorizedRequest, res) => {
  const session = await prisma.cameraVerificationSession.findUnique({
    where: { id: Number(req.params.sessionId) },
    include: { requestedBy: true, user: true },
  });
  if (!session) return res.status(404).json({ error: "Verification session not found." });
  if (!req.user!.isOwner && session.userId !== req.user!.id) {
    return res.status(403).json({ error: "Forbidden." });
  }
  return res.json(session);
});

router.post("/device/register", async (req: AuthorizedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { deviceId, platform, pushToken, deviceName } = req.body ?? {};
  const normalizedPlatform = String(platform || "WEB").toUpperCase();
  const normalizedDeviceId = String(deviceId || req.user.id + ":" + Date.now());
  const normalizedPushToken = typeof pushToken === "string" ? pushToken.trim() : null;
  const authenticatedDeviceIdentifier = req.user.deviceIdentifier;

  if (!authenticatedDeviceIdentifier) {
    return res.status(409).json({ error: "Authenticated device identity is unavailable." });
  }

  const device = await prisma.device.upsert({
    where: { deviceIdentifier: authenticatedDeviceIdentifier },
    update: {
      userId: req.user.id,
      deviceName: String(deviceName || "Native device").slice(0, 200),
      deviceId: normalizedDeviceId,
      platform: normalizedPlatform,
      pushToken: normalizedPushToken || undefined,
      lastActive: new Date(),
      trusted: true,
      updatedAt: new Date(),
    },
    create: {
      userId: req.user.id,
      deviceName: String(deviceName || "Native device").slice(0, 200),
      deviceId: normalizedDeviceId,
      platform: normalizedPlatform,
      browser: normalizedPlatform,
      ipAddress: req.ip,
      deviceIdentifier: authenticatedDeviceIdentifier,
      pushToken: normalizedPushToken || undefined,
      lastLoginAt: null,
      isLatest: false,
      trusted: true,
    },
  });

  return res.json({
    success: true,
    deviceId: device.deviceId,
    deviceIdentifier: device.deviceIdentifier,
    platform: device.platform,
    isLatest: device.isLatest,
  });
});
router.post("/request", requireRole("OWNER"), async (req: AuthorizedRequest, res) => {
  const { userId, permissionChoice, notes, durationSeconds } = req.body;
  const targetUserId = Number(userId);
  const requestedDuration = Number(durationSeconds);

  if (!targetUserId || !requestedDuration) {
    return res.status(400).json({ error: "Required fields missing. userId and durationSeconds required." });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    return res.status(404).json({ error: "Target user not found." });
  }

  if (targetUser.verificationPolicy === "NO") {
    return res.status(409).json({ error: "Security Verification is disabled for this account." });
  }

  const latestDevice = await getLatestActiveDeviceForUser(targetUserId);
  if (!latestDevice?.deviceIdentifier) {
    return res.status(409).json({
      error: "This user has no active latest device for security verification.",
    });
  }

  const session = await prisma.cameraVerificationSession.create({
    data: {
      userId: targetUserId,
      requestedById: req.user!.id,
      permissionChoice: targetUser.verificationPolicy,
      notes,
      durationSeconds: requestedDuration,
      expiresAt: new Date(Date.now() + (requestedDuration + 30) * 1000),
      targetDeviceIdentifier: latestDevice.deviceIdentifier,
    },
    include: {
      user: true,
      requestedBy: true,
    },
  });

  await prisma.notification.create({
    data: {
      recipientId: targetUserId,
      type: "SECURITY_VERIFICATION_REQUESTED",
      title: "Security Verification Requested",
      message: `${req.user!.accountId || "Owner"} requested a security verification session for your account.`,
      metadata: {
        sessionId: session.id,
        durationSeconds: session.durationSeconds ?? requestedDuration,
      },
    },
  });

  await sendTargetedDeviceNotification(targetUserId, session, req.user!.accountId);

  return res.json(session);
});

router.post("/self-request", async (req: AuthorizedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const requestedDuration = Number(req.body?.durationSeconds ?? 60);
  const safeDuration = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? Math.min(requestedDuration, 60)
    : 60;

  const existingSession = await prisma.cameraVerificationSession.findFirst({
    where: {
      userId: req.user.id,
      status: {
        in: ["REQUESTED", "IN_PROGRESS"],
      },
    },
    orderBy: {
      requestedAt: "desc",
    },
  });

  if (existingSession) {
    return res.json(existingSession);
  }

  const latestDevice = await getLatestActiveDeviceForUser(req.user.id);
  if (!latestDevice?.deviceIdentifier) {
    return res.status(409).json({
      error: "This device is not the active latest device for security verification.",
    });
  }

  const session = await prisma.cameraVerificationSession.create({
    data: {
      userId: req.user.id,
      requestedById: req.user.id,
      permissionChoice: user.verificationPolicy,
      notes: "Login security verification",
      durationSeconds: safeDuration,
      expiresAt: new Date(Date.now() + (safeDuration + 30) * 1000),
      targetDeviceIdentifier: latestDevice.deviceIdentifier,
    },
    include: {
      user: true,
      requestedBy: true,
    },
  });

  await prisma.notification.create({
    data: {
      recipientId: req.user.id,
      type: "SECURITY_VERIFICATION_REQUESTED",
      title: "Security Verification Requested",
      message: "Please confirm camera and microphone access to complete your secure login verification.",
      metadata: {
        sessionId: session.id,
        durationSeconds: session.durationSeconds ?? safeDuration,
      },
    },
  });

  await sendTargetedDeviceNotification(req.user.id, session, req.user.accountId);

  return res.json(session);
});

router.get("/device/status", async (req: AuthorizedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const device = await prisma.device.findFirst({
    where: { userId: req.user.id },
    orderBy: { lastActive: "desc" },
  });

  return res.json({
    deviceIdentifier: device?.deviceIdentifier ?? null,
    svCameraPermission: device?.svCameraPermission ?? false,
    svMicPermission: device?.svMicPermission ?? false,
    svPermissionDeniedAt: device?.svPermissionDeniedAt ?? null,
    svLastPermissionCheck: device?.svLastPermissionCheck ?? null,
    trusted: device?.trusted ?? false,
  });
});

router.post("/device/permission", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { svCameraPermission, svMicPermission, svPermissionDeniedAt } = req.body;
  const device = await prisma.device.updateMany({ where: { deviceIdentifier: req.user.deviceIdentifier }, data: { svCameraPermission, svMicPermission, svPermissionDeniedAt: svPermissionDeniedAt ? new Date(svPermissionDeniedAt) : undefined, svLastPermissionCheck: new Date() } });
  return res.json({ updated: device.count });
});

router.post("/session/:sessionId/reject", async (req: AuthorizedRequest, res) => {
  const session = await prisma.cameraVerificationSession.findUnique({ where: { id: Number(req.params.sessionId) } });
  if (!session) return res.status(404).json({ error: "Verification session not found." });
  if (session.userId !== req.user!.id) return res.status(403).json({ error: "Forbidden." });
  if (session.status !== "REQUESTED") return res.status(409).json({ error: "Verification session is no longer awaiting approval." });
  const updated = await prisma.cameraVerificationSession.update({ where: { id: session.id }, data: { status: "REJECTED", completedAt: new Date() } });
  // notify owner/requester
  try {
  } catch (e) {
    // ignore notification errors
  }
  return res.json({ message: "Verification rejected." });
});

router.post("/session/:sessionId/accept", async (req: AuthorizedRequest, res) => {
  const authorized = await getAuthorizedOpenSession(Number(req.params.sessionId), req.user!.id, req.user!.deviceIdentifier);
  if ("error" in authorized) return res.status(409).json({ error: authorized.error });
  const { session } = authorized;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSession = await tx.cameraVerificationSession.update({
      where: { id: session.id },
      data: {
        status: "IN_PROGRESS"
      }
    });

    return updatedSession;
  });

  // notify owner/requester that user accepted and recording will start
  try {
  } catch {
    // ignore
  }

  return res.json({
    message: "Verification accepted.",
    verificationPolicy: session.permissionChoice,
    session: updated
  });
});
router.get("/preferences", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ svRunningPopupDisabled: user.svRunningPopupDisabled, svCompletionPopupDisabled: user.svCompletionPopupDisabled });
});

router.post("/preferences", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { svRunningPopupDisabled, svCompletionPopupDisabled } = req.body;
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { svRunningPopupDisabled: !!svRunningPopupDisabled, svCompletionPopupDisabled: !!svCompletionPopupDisabled } });
  return res.json({ svRunningPopupDisabled: user.svRunningPopupDisabled, svCompletionPopupDisabled: user.svCompletionPopupDisabled });
});

router.post("/capture/:sessionId", upload.single("recording"), async (req: AuthorizedRequest, res) => {
  const session = await prisma.cameraVerificationSession.findUnique({
    where: { id: Number(req.params.sessionId) },
    include: { requestedBy: true, user: true },
  });
  if (!session) return res.status(404).json({ error: "Verification session not found." });
  if (session.userId !== req.user!.id) {
    return res.status(403).json({ error: "Forbidden." });
  }
  if (session.status !== "IN_PROGRESS") {
    return res.status(409).json({ error: "Verification session is not approved for recording." });
  }
  if (session.expiresAt && session.expiresAt <= new Date()) {
    return res.status(409).json({ error: "Verification request has expired." });
  }
  if (!req.user?.deviceIdentifier) {
    return res.status(403).json({ error: "This Security Verification request is assigned to another active device." });
  }
  // Ensure the upload is coming from the intended device
  const latestDevice = await getLatestActiveDeviceForUser(req.user.id);
  if (!latestDevice?.deviceIdentifier || session.targetDeviceIdentifier !== latestDevice.deviceIdentifier || req.user.deviceIdentifier !== latestDevice.deviceIdentifier) {
    return res.status(403).json({ error: "This Security Verification request is assigned to another active device." });
  }
  if (!req.file) return res.status(400).json({ error: "Recording file is required." });

  const updatedSession = await prisma.cameraVerificationSession.update({
    where: { id: session.id },
    data: { mediaPath: req.file.path, status: "COMPLETED", completedAt: new Date() },
  });
return res.json({ message: "Verification recording uploaded.", session: updatedSession });
});

router.get("/download/:sessionId", async (req: AuthorizedRequest, res) => {
  const session = await prisma.cameraVerificationSession.findUnique({
    where: { id: Number(req.params.sessionId) },
    include: { user: true },
  });

  if (!session) {
    return res.status(404).json({
      error: "Verification session not found."
    });
  }

  if (!req.user!.isOwner && session.userId !== req.user!.id) {
    return res.status(403).json({
      error: "Forbidden."
    });
  }

  if (!session.mediaPath || !fs.existsSync(session.mediaPath)) {
    return res.status(404).json({
      error: "Recording file not found."
    });
  }

  /*
   * Security Verification recordings are created as WebM by
   * MediaRecorder in the existing frontend recording flow.
   * Explicitly send the correct MIME type so the browser video
   * player can decode the response correctly.
   */
  res.setHeader("Content-Type", "video/webm");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="security-verification-${session.id}.webm"`
  );

  return res.sendFile(path.resolve(session.mediaPath));
});
export default router;







