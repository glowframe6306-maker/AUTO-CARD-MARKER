import { Router } from "express";
import prisma from "../prisma";
import { authenticate, requireRole, AuthorizedRequest } from "../middleware/authMiddleware";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();
router.use(authenticate);

const uploadPath = process.env.UPLOAD_BASE_PATH || path.join(__dirname, "../../uploads/secure/verifications");
fs.mkdirSync(uploadPath, { recursive: true });

const upload = multer({ dest: uploadPath, limits: { fileSize: 40 * 1024 * 1024 } });

router.get("/policy", async (req: AuthorizedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ verificationPolicy: user.verificationPolicy });
});

router.post("/policy", async (req: AuthorizedRequest, res) => {
  const { verificationPolicy } = req.body;
  if (!verificationPolicy) {
    return res.status(400).json({ error: "Verification policy choice is required." });
  }
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { verificationPolicy },
  });
  return res.json({ verificationPolicy: user.verificationPolicy });
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

router.post("/request", requireRole("OWNER"), async (req: AuthorizedRequest, res) => {
  const { userId, permissionChoice, notes, durationSeconds } = req.body;
  if (!userId || !durationSeconds) {
    return res.status(400).json({ error: "Required fields missing. userId and durationSeconds required." });
  }
  const effectivePermissionChoice = permissionChoice || "AT_THIS_TIME";

  const targetUser = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!targetUser) {
    return res.status(404).json({ error: "Target user not found." });
  }

  // Find the most recently active device for this user
  const device = await prisma.device.findFirst({ where: { userId: Number(userId) }, orderBy: { lastActive: "desc" } });
  if (!device) {
    return res.status(400).json({ error: "Target user has no active device session." });
  }

  const session = await prisma.cameraVerificationSession.create({
    data: {
      userId: Number(userId),
      requestedById: req.user!.id,
      permissionChoice: effectivePermissionChoice,
      notes,
      durationSeconds: Number(durationSeconds),
      targetDeviceIdentifier: device.deviceIdentifier || undefined,
    },
  });

  await prisma.notification.create({
    data: {
      recipientId: targetUser.id,
      type: "SECURITY_VERIFICATION_REQUESTED",
      title: "NEEDS SECURITY VERIFICATION",
      message: "NEEDS SECURITY VERIFICATION",
      metadata: { sessionId: session.id, durationSeconds: session.durationSeconds, targetDeviceIdentifier: device.deviceIdentifier },
    },
  });

  return res.status(201).json(session);
});

// Device permission status endpoints
router.get("/device/status", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const device = await prisma.device.findFirst({ where: { deviceIdentifier: req.user.deviceIdentifier } });
  if (!device) return res.status(404).json({ error: "Device not found." });
  return res.json({ svCameraPermission: device.svCameraPermission, svMicPermission: device.svMicPermission, svPermissionDeniedAt: device.svPermissionDeniedAt });
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
  const updated = await prisma.cameraVerificationSession.update({ where: { id: session.id }, data: { status: "REJECTED", completedAt: new Date() } });
  // notify owner/requester
  try {
    await prisma.notification.create({ data: { recipientId: updated.requestedById, type: "SECURITY_VERIFICATION_DENIED", title: "Verification denied", message: `Verification request #${updated.id} was denied by user.`, metadata: { sessionId: updated.id } } });
  } catch (e) {
    // ignore notification errors
  }
  return res.json({ message: "Verification rejected." });
});

router.post("/session/:sessionId/accept", async (req: AuthorizedRequest, res) => {
  const session = await prisma.cameraVerificationSession.findUnique({ where: { id: Number(req.params.sessionId) } });
  if (!session) return res.status(404).json({ error: "Verification session not found." });
  if (session.userId !== req.user!.id) return res.status(403).json({ error: "Forbidden." });
  const updated = await prisma.cameraVerificationSession.update({ where: { id: session.id }, data: { status: "IN_PROGRESS" } });
  // notify owner/requester that user accepted and recording will start
  try {
    await prisma.notification.create({ data: { recipientId: updated.requestedById, type: "SECURITY_VERIFICATION_ACCEPTED", title: "Verification accepted", message: `User accepted verification request #${updated.id}. Recording will start.`, metadata: { sessionId: updated.id } } });
  } catch (e) {
    // ignore
  }
  return res.json({ message: "Verification accepted." });
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
  // Ensure the upload is coming from the intended device
  if (session.targetDeviceIdentifier && req.user!.deviceIdentifier !== session.targetDeviceIdentifier) {
    return res.status(403).json({ error: "This upload is not allowed from this device." });
  }
  if (!req.file) return res.status(400).json({ error: "Recording file is required." });

  const updatedSession = await prisma.cameraVerificationSession.update({
    where: { id: session.id },
    data: { mediaPath: req.file.path, status: "COMPLETED", completedAt: new Date() },
  });

  await prisma.notification.create({
    data: {
      recipientId: session.requestedById,
      type: "SECURITY_VERIFICATION_COMPLETED",
      title: "Security verification completed",
      message: `Verification recording from ${session.user.fullName} is ready for review.`,
      metadata: { sessionId: session.id },
    },
  });

  return res.json({ message: "Verification recording uploaded.", session: updatedSession });
});

router.get("/download/:sessionId", async (req: AuthorizedRequest, res) => {
  const session = await prisma.cameraVerificationSession.findUnique({
    where: { id: Number(req.params.sessionId) },
    include: { user: true },
  });
  if (!session) return res.status(404).json({ error: "Verification session not found." });
  if (!req.user!.isOwner && session.userId !== req.user!.id) {
    return res.status(403).json({ error: "Forbidden." });
  }
  if (!session.mediaPath || !fs.existsSync(session.mediaPath)) {
    return res.status(404).json({ error: "Recording file not found." });
  }
  return res.download(session.mediaPath, `security-verification-${session.id}${path.extname(session.mediaPath)}`);
});

export default router;

