import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Router } from "express";
import multer from "multer";
import { ChatConversationType } from "@prisma/client";
import prisma from "../prisma";
import { authenticate, AuthorizedRequest } from "../middleware/authMiddleware";
import { ALLOWED_REACTIONS, chatMessageInclude, chatUserSelect, ensureOfficialAnnouncementGroup, getAuthorizedConversation, getConversationList, MAX_MESSAGE_LENGTH, serializeMessage } from "../chatHelpers";

const router = Router();
router.use(authenticate);

const CHAT_UPLOAD_BASE = path.resolve(__dirname, "../../uploads/chat-private");
fs.mkdirSync(CHAT_UPLOAD_BASE, { recursive: true });

const blockedExtensions = new Set([".exe", ".bat", ".cmd", ".ps1", ".scr", ".com", ".dll", ".js", ".jar", ".vbs", ".wsf", ".hta", ".msi", ".app", ".apk"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "application/zip", "application/x-zip-compressed"]);
const allowedExtensionsByType = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".zip"]);

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function canModerateGroup(req: AuthorizedRequest) {
  return req.user?.isOwner === true;
}

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHAT_UPLOAD_BASE),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "file.bin").toLowerCase();
      const safeBase = (file.originalname || "upload").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 80) || "upload";
      cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}-${safeBase || "upload"}${ext ? ext.toLowerCase() : ""}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = file.mimetype || "";
    if (blockedExtensions.has(ext)) return cb(new Error("This file type is not allowed."));
    if (!allowedExtensionsByType.has(ext) && !allowedMimeTypes.has(mime)) return cb(new Error("Unsupported attachment type."));
    cb(null, true);
  },
});

router.get("/bootstrap", async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const official = await ensureOfficialAnnouncementGroup();
    const conversations = await getConversationList(req.user.id);
    const activeUsers = await prisma.user.findMany({
      where: { status: "ACTIVE", id: { not: req.user.id } },
      select: chatUserSelect,
      orderBy: { fullName: "asc" },
    });
    return res.json({ currentUserId: req.user.id, officialConversationId: official?.id ?? null, conversations, activeUsers });
  } catch (error) {
    console.error("GET /api/chats/bootstrap failed:", error);
    return res.status(500).json({ error: "Unable to load chats." });
  }
});

router.post("/clear-all", async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (req.user.isOwner !== true) return res.status(403).json({ error: "Only the Owner can clear all chats." });

    const result = await prisma.$transaction(async (tx) => {
      const conversations = await tx.chatConversation.findMany({ select: { id: true } });
      const conversationIds = conversations.map((conversation) => conversation.id);

      await tx.chatNotification.deleteMany({});
      await tx.chatMessageReaction.deleteMany({});
      await tx.chatMessageStar.deleteMany({});
      await tx.chatMessagePin.deleteMany({});
      await tx.chatMessageAttachment.deleteMany({});
      await tx.chatMessageDelivery.deleteMany({});
      await tx.chatMessage.deleteMany({});
      await tx.chatParticipant.deleteMany({});
      await tx.chatConversation.deleteMany({});
      await tx.chatClearState.upsert({
        where: { id: 1 },
        create: { id: 1, clearedById: req.user!.id },
        update: { clearedAt: new Date(), clearedById: req.user!.id },
      });

      return { conversations: conversationIds.length };
    });

    return res.json({ success: true, clearedConversations: result.conversations });
  } catch (error) {
    console.error("POST /api/chats/clear-all failed:", error);
    return res.status(500).json({ error: "Unable to clear all chats. No changes were made." });
  }
});

router.get("/:conversationId/messages", async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const conversationId = parseId(req.params.conversationId);
    if (!conversationId) return res.status(400).json({ error: "Invalid conversation." });
    const conversation = await getAuthorizedConversation(conversationId, req.user.id);
    if (!conversation) return res.status(403).json({ error: "You are not a participant in this conversation." });
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take,
      include: chatMessageInclude,
    });
    return res.json(messages.reverse().map((message) => serializeMessage({ ...message, viewerUserId: req.user!.id })));
  } catch (error) {
    console.error("GET /api/chats/:conversationId/messages failed:", error);
    return res.status(500).json({ error: "Unable to load messages." });
  }
});

router.get("/notifications", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const notifications = await prisma.chatNotification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return res.json(notifications);
});

router.patch("/notifications/read", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  await prisma.chatNotification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  return res.json({ success: true });
});

router.post("/upload", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const upload = chatUpload.single("file");
  upload(req, res, async (error) => {
    if (error) return res.status(400).json({ error: error.message || "Invalid file upload." });
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file uploaded." });

    const storedPath = path.posix.join("chat-private", path.basename(file.filename));
    return res.status(201).json({
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: storedPath,
    });
  });
});

router.get("/files/:attachmentId", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const attachmentId = parseId(req.params.attachmentId);
  if (!attachmentId) return res.status(400).json({ error: "Invalid attachment." });

  const attachment = await prisma.chatMessageAttachment.findUnique({
    where: { id: attachmentId },
    include: { message: { select: { conversationId: true } } },
  });
  if (!attachment) return res.status(404).json({ error: "Attachment not found." });
  if (!(await getAuthorizedConversation(attachment.message.conversationId, req.user.id))) return res.status(403).json({ error: "Attachment access denied." });

  const uploadsRoot = path.resolve(__dirname, "../../uploads");
  const requestedPath = path.resolve(uploadsRoot, attachment.storagePath.replace(/^\/+/, ""));
  if (!requestedPath.startsWith(uploadsRoot)) return res.status(403).json({ error: "Unsafe attachment path." });
  if (!fs.existsSync(requestedPath)) return res.status(404).json({ error: "Attachment file is missing." });

  return res.download(requestedPath, attachment.fileName);
});

router.post("/messages/:messageId/reaction", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const messageId = parseId(req.params.messageId);
  const reaction = typeof req.body?.reaction === "string" ? req.body.reaction : "";
  if (!messageId || !ALLOWED_REACTIONS.includes(reaction as typeof ALLOWED_REACTIONS[number])) return res.status(400).json({ error: "Invalid reaction." });
  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message || !(await getAuthorizedConversation(message.conversationId, req.user.id))) return res.status(403).json({ error: "Message access denied." });
  const existing = await prisma.chatMessageReaction.findUnique({ where: { messageId_userId_reaction: { messageId, userId: req.user.id, reaction } } });
  if (existing) await prisma.chatMessageReaction.delete({ where: { id: existing.id } });
  else await prisma.chatMessageReaction.create({ data: { messageId, userId: req.user.id, reaction } });
  return res.json({ messageId, reaction, active: !existing });
});

router.post("/messages/:messageId/star", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const messageId = parseId(req.params.messageId);
  if (!messageId) return res.status(400).json({ error: "Invalid message." });
  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message || !(await getAuthorizedConversation(message.conversationId, req.user.id))) return res.status(403).json({ error: "Message access denied." });
  const existing = await prisma.chatMessageStar.findUnique({ where: { messageId_userId: { messageId, userId: req.user.id } } });
  if (existing) await prisma.chatMessageStar.delete({ where: { id: existing.id } });
  else await prisma.chatMessageStar.create({ data: { messageId, userId: req.user.id } });
  return res.json({ messageId, starred: !existing });
});

router.post("/messages/:messageId/pin", async (req: AuthorizedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const messageId = parseId(req.params.messageId);
  if (!messageId) return res.status(400).json({ error: "Invalid message." });
  const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!message || !(await getAuthorizedConversation(message.conversationId, req.user.id))) return res.status(403).json({ error: "Message access denied." });
  if (message.conversation.type === ChatConversationType.OFFICIAL_ANNOUNCEMENT && !req.user.isOwner) return res.status(403).json({ error: "Only the Owner can pin official announcements." });
  const existing = await prisma.chatMessagePin.findUnique({ where: { messageId } });
  if (existing) await prisma.chatMessagePin.delete({ where: { id: existing.id } });
  else await prisma.chatMessagePin.create({ data: { messageId, pinnedById: req.user.id } });
  return res.json({ messageId, pinned: !existing });
});

router.post("/direct", async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const targetUserId = Number(req.body?.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0 || targetUserId === req.user.id) {
      return res.status(400).json({ error: "A valid chat member is required." });
    }
    const target = await prisma.user.findFirst({ where: { id: targetUserId, status: "ACTIVE" }, select: { id: true } });
    if (!target) return res.status(404).json({ error: "That user is not active." });
    const directKey = [req.user.id, targetUserId].sort((a, b) => a - b).join(":");
    const conversation = await prisma.chatConversation.upsert({
      where: { directKey },
      update: {},
      create: { type: ChatConversationType.DIRECT, directKey, participants: { create: [{ userId: req.user.id }, { userId: targetUserId }] } },
    });
    await prisma.chatParticipant.createMany({ data: [{ conversationId: conversation.id, userId: req.user.id }, { conversationId: conversation.id, userId: targetUserId }], skipDuplicates: true });
    return res.status(201).json({ conversationId: conversation.id });
  } catch (error) {
    console.error("POST /api/chats/direct failed:", error);
    return res.status(500).json({ error: "Unable to open direct chat." });
  }
});

router.patch("/:conversationId/read", async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const conversationId = parseId(req.params.conversationId);
    if (!conversationId || !(await getAuthorizedConversation(conversationId, req.user.id))) return res.status(403).json({ error: "Conversation access denied." });
    await prisma.chatParticipant.update({ where: { conversationId_userId: { conversationId, userId: req.user.id } }, data: { lastReadAt: new Date() } });
    return res.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/chats/:conversationId/read failed:", error);
    return res.status(500).json({ error: "Unable to mark chat as read." });
  }
});

router.patch("/messages/:messageId", async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const messageId = parseId(req.params.messageId);
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!messageId || !body || body.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: "Message text is invalid." });
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
    if (!message) return res.status(404).json({ error: "Message not found." });
    const participant = await getAuthorizedConversation(message.conversationId, req.user.id);
    if (!participant || (message.senderId !== req.user.id && !canModerateGroup(req))) return res.status(403).json({ error: "Message edit denied." });
    const updated = await prisma.chatMessage.update({ where: { id: messageId }, data: { body }, include: { sender: { select: { fullName: true } } } });
    return res.json(serializeMessage({ ...updated, viewerUserId: req.user.id }));
  } catch (error) {
    console.error("PATCH /api/chats/messages/:messageId failed:", error);
    return res.status(500).json({ error: "Unable to edit message." });
  }
});

router.delete("/messages/:messageId", async (req: AuthorizedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const messageId = parseId(req.params.messageId);
    if (!messageId) return res.status(400).json({ error: "Invalid message." });
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
    if (!message) return res.status(404).json({ error: "Message not found." });
    const participant = await getAuthorizedConversation(message.conversationId, req.user.id);
    if (!participant || (message.senderId !== req.user.id && !canModerateGroup(req))) return res.status(403).json({ error: "Message deletion denied." });
    const deleted = await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() }, include: { sender: { select: { fullName: true } } } });
    return res.json(serializeMessage({ ...deleted, viewerUserId: req.user.id }));
  } catch (error) {
    console.error("DELETE /api/chats/messages/:messageId failed:", error);
    return res.status(500).json({ error: "Unable to delete message." });
  }
});

export default router;
