"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../prisma"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
const uploadPath = process.env.UPLOAD_BASE_PATH || path_1.default.join(__dirname, "../../uploads/secure/verifications");
fs_1.default.mkdirSync(uploadPath, { recursive: true });
const upload = (0, multer_1.default)({ dest: uploadPath, limits: { fileSize: 40 * 1024 * 1024 } });
async function getLatestActiveDeviceForUser(userId) {
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { latestDeviceIdentifier: true },
    });
    if (!user?.latestDeviceIdentifier) {
        return null;
    }
    return prisma_1.default.device.findFirst({
        where: {
            userId,
            deviceIdentifier: user.latestDeviceIdentifier,
        },
    });
}
router.get("/policy", async (req, res) => {
    const user = await prisma_1.default.user.findUnique({ where: { id: req.user.id } });
    if (!user)
        return res.status(404).json({ error: "User not found." });
    return res.json({ verificationPolicy: user.verificationPolicy });
});
router.post("/policy", async (req, res) => {
    const { verificationPolicy } = req.body;
    if (!verificationPolicy) {
        return res.status(400).json({ error: "Verification policy choice is required." });
    }
    const user = await prisma_1.default.user.update({
        where: { id: req.user.id },
        data: { verificationPolicy },
    });
    return res.json({ verificationPolicy: user.verificationPolicy });
});
router.get("/my-sessions", async (req, res) => {
    const sessions = await prisma_1.default.cameraVerificationSession.findMany({
        where: { userId: req.user.id },
        orderBy: { requestedAt: "desc" },
        include: { requestedBy: true, user: true },
    });
    return res.json(sessions);
});
router.get("/sessions", (0, authMiddleware_1.requireRole)("OWNER"), async (req, res) => {
    const sessions = await prisma_1.default.cameraVerificationSession.findMany({
        orderBy: { requestedAt: "desc" },
        include: { user: true, requestedBy: true },
    });
    return res.json(sessions);
});
router.get("/session/:sessionId", async (req, res) => {
    const session = await prisma_1.default.cameraVerificationSession.findUnique({
        where: { id: Number(req.params.sessionId) },
        include: { requestedBy: true, user: true },
    });
    if (!session)
        return res.status(404).json({ error: "Verification session not found." });
    if (!req.user.isOwner && session.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden." });
    }
    return res.json(session);
});
router.post("/request", (0, authMiddleware_1.requireRole)("OWNER"), async (req, res) => {
    const { userId, permissionChoice, notes, durationSeconds } = req.body;
    const targetUserId = Number(userId);
    const requestedDuration = Number(durationSeconds);
    if (!targetUserId || !requestedDuration) {
        return res.status(400).json({ error: "Required fields missing. userId and durationSeconds required." });
    }
    const effectivePermissionChoice = permissionChoice || "AT_THIS_TIME";
    const targetUser = await prisma_1.default.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
        return res.status(404).json({ error: "Target user not found." });
    }
    const latestDevice = await getLatestActiveDeviceForUser(targetUserId);
    if (!latestDevice?.deviceIdentifier) {
        return res.status(409).json({
            error: "This user has no active latest device for security verification.",
        });
    }
    const session = await prisma_1.default.cameraVerificationSession.create({
        data: {
            userId: targetUserId,
            requestedById: req.user.id,
            permissionChoice: effectivePermissionChoice,
            notes,
            durationSeconds: requestedDuration,
            targetDeviceIdentifier: latestDevice.deviceIdentifier,
        },
        include: {
            user: true,
            requestedBy: true,
        },
    });
    await prisma_1.default.notification.create({
        data: {
            recipientId: targetUserId,
            type: "SECURITY_VERIFICATION_REQUESTED",
            title: "Security Verification Requested",
            message: `${req.user.accountId || "Owner"} requested a security verification session for your account.`,
            metadata: {
                sessionId: session.id,
                durationSeconds: session.durationSeconds ?? requestedDuration,
            },
        },
    });
    return res.json(session);
});
router.post("/self-request", async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Unauthorized." });
    }
    const user = await prisma_1.default.user.findUnique({
        where: { id: req.user.id },
    });
    if (!user) {
        return res.status(404).json({ error: "User not found." });
    }
    const requestedDuration = Number(req.body?.durationSeconds ?? 60);
    const safeDuration = Number.isFinite(requestedDuration) && requestedDuration > 0
        ? Math.min(requestedDuration, 60)
        : 60;
    const existingSession = await prisma_1.default.cameraVerificationSession.findFirst({
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
    const session = await prisma_1.default.cameraVerificationSession.create({
        data: {
            userId: req.user.id,
            requestedById: req.user.id,
            permissionChoice: user.verificationPolicy,
            notes: "Login security verification",
            durationSeconds: safeDuration,
            targetDeviceIdentifier: latestDevice.deviceIdentifier,
        },
        include: {
            user: true,
            requestedBy: true,
        },
    });
    await prisma_1.default.notification.create({
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
    return res.json(session);
});
router.get("/device/status", async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Unauthorized." });
    }
    const device = await prisma_1.default.device.findFirst({
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
router.post("/device/permission", async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: "Unauthorized" });
    const { svCameraPermission, svMicPermission, svPermissionDeniedAt } = req.body;
    const device = await prisma_1.default.device.updateMany({ where: { deviceIdentifier: req.user.deviceIdentifier }, data: { svCameraPermission, svMicPermission, svPermissionDeniedAt: svPermissionDeniedAt ? new Date(svPermissionDeniedAt) : undefined, svLastPermissionCheck: new Date() } });
    return res.json({ updated: device.count });
});
router.post("/session/:sessionId/reject", async (req, res) => {
    const session = await prisma_1.default.cameraVerificationSession.findUnique({ where: { id: Number(req.params.sessionId) } });
    if (!session)
        return res.status(404).json({ error: "Verification session not found." });
    if (session.userId !== req.user.id)
        return res.status(403).json({ error: "Forbidden." });
    const updated = await prisma_1.default.cameraVerificationSession.update({ where: { id: session.id }, data: { status: "REJECTED", completedAt: new Date() } });
    // notify owner/requester
    try {
    }
    catch (e) {
        // ignore notification errors
    }
    return res.json({ message: "Verification rejected." });
});
router.post("/session/:sessionId/accept", async (req, res) => {
    const session = await prisma_1.default.cameraVerificationSession.findUnique({
        where: { id: Number(req.params.sessionId) }
    });
    if (!session) {
        return res.status(404).json({
            error: "Verification session not found."
        });
    }
    if (session.userId !== req.user.id) {
        return res.status(403).json({
            error: "Forbidden."
        });
    }
    if (session.targetDeviceIdentifier && req.user.deviceIdentifier !== session.targetDeviceIdentifier) {
        return res.status(403).json({
            error: "This Security Verification request is assigned to another active device."
        });
    }
    const rememberAlways = req.body?.rememberAlways === true;
    const updated = await prisma_1.default.$transaction(async (tx) => {
        const updatedSession = await tx.cameraVerificationSession.update({
            where: { id: session.id },
            data: {
                status: "IN_PROGRESS"
            }
        });
        /*
         * ALWAYS ALLOW is stored on the TARGET USER account.
         * session.userId is the member who received the request.
         */
        if (rememberAlways) {
            await tx.user.update({
                where: { id: session.userId },
                data: {
                    verificationPolicy: "ALWAYS"
                }
            });
        }
        return updatedSession;
    });
    // notify owner/requester that user accepted and recording will start
    try {
    }
    catch {
        // ignore
    }
    return res.json({
        message: "Verification accepted.",
        verificationPolicy: rememberAlways ? "ALWAYS" : session.permissionChoice,
        session: updated
    });
});
router.get("/preferences", async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: "Unauthorized" });
    const user = await prisma_1.default.user.findUnique({ where: { id: req.user.id } });
    if (!user)
        return res.status(404).json({ error: "User not found." });
    return res.json({ svRunningPopupDisabled: user.svRunningPopupDisabled, svCompletionPopupDisabled: user.svCompletionPopupDisabled });
});
router.post("/preferences", async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: "Unauthorized" });
    const { svRunningPopupDisabled, svCompletionPopupDisabled } = req.body;
    const user = await prisma_1.default.user.update({ where: { id: req.user.id }, data: { svRunningPopupDisabled: !!svRunningPopupDisabled, svCompletionPopupDisabled: !!svCompletionPopupDisabled } });
    return res.json({ svRunningPopupDisabled: user.svRunningPopupDisabled, svCompletionPopupDisabled: user.svCompletionPopupDisabled });
});
router.post("/capture/:sessionId", upload.single("recording"), async (req, res) => {
    const session = await prisma_1.default.cameraVerificationSession.findUnique({
        where: { id: Number(req.params.sessionId) },
        include: { requestedBy: true, user: true },
    });
    if (!session)
        return res.status(404).json({ error: "Verification session not found." });
    if (session.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden." });
    }
    if (!req.user?.deviceIdentifier) {
        return res.status(403).json({ error: "This Security Verification request is assigned to another active device." });
    }
    // Ensure the upload is coming from the intended device
    if (session.targetDeviceIdentifier && req.user.deviceIdentifier !== session.targetDeviceIdentifier) {
        return res.status(403).json({ error: "This Security Verification request is assigned to another active device." });
    }
    if (!req.file)
        return res.status(400).json({ error: "Recording file is required." });
    const updatedSession = await prisma_1.default.cameraVerificationSession.update({
        where: { id: session.id },
        data: { mediaPath: req.file.path, status: "COMPLETED", completedAt: new Date() },
    });
    return res.json({ message: "Verification recording uploaded.", session: updatedSession });
});
router.get("/download/:sessionId", async (req, res) => {
    const session = await prisma_1.default.cameraVerificationSession.findUnique({
        where: { id: Number(req.params.sessionId) },
        include: { user: true },
    });
    if (!session) {
        return res.status(404).json({
            error: "Verification session not found."
        });
    }
    if (!req.user.isOwner && session.userId !== req.user.id) {
        return res.status(403).json({
            error: "Forbidden."
        });
    }
    if (!session.mediaPath || !fs_1.default.existsSync(session.mediaPath)) {
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
    res.setHeader("Content-Disposition", `inline; filename="security-verification-${session.id}.webm"`);
    return res.sendFile(path_1.default.resolve(session.mediaPath));
});
exports.default = router;
