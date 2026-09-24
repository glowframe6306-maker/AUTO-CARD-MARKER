import { Server, Socket } from "socket.io";
import { ChatConversationType } from "@prisma/client";
import prisma from "./prisma";
import { getUserFromToken } from "./middleware/authMiddleware";
import { conversationRoom, normalizeMessageBody } from "./chatRealtime";
import { ALLOWED_REACTIONS, chatMessageInclude, ensureOfficialAnnouncementGroup, getAuthorizedConversation, MAX_MESSAGE_LENGTH, serializeMessage } from "./chatHelpers";

type ChatSocketUser = NonNullable<ReturnType<typeof getUserFromToken>>;
type ChatSocket = Socket & { data: { user: ChatSocketUser } };

const activeSockets = new Map<number, number>();

async function emitToActiveConversationUsers(io: Server, conversationId: number, event: string, payload: unknown) {
  const participants = await prisma.chatParticipant.findMany({
    where: { conversationId, user: { status: "ACTIVE" } },
    select: { userId: true },
  });
  const allowedUserIds = new Set(participants.map((participant) => participant.userId));
  for (const connectedSocket of io.sockets.sockets.values()) {
    const chatSocket = connectedSocket as ChatSocket;
    if (allowedUserIds.has(chatSocket.data.user.id)) connectedSocket.emit(event, payload);
  }
}

export function attachChatSocket(io: Server) {
  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
      if (!token) return next(new Error("Unauthorized"));
      const user = getUserFromToken(token);
      if (!user) return next(new Error("Unauthorized"));
      const activeUser = await prisma.user.findFirst({ where: { id: user.id, status: "ACTIVE" }, select: { id: true } });
      if (!activeUser) return next(new Error("Account is not active."));
      (socket as ChatSocket).data.user = user;
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (rawSocket) => {
    const socket = rawSocket as ChatSocket;
    const userId = socket.data.user.id;
    activeSockets.set(userId, (activeSockets.get(userId) ?? 0) + 1);
    await ensureOfficialAnnouncementGroup();
    io.emit("chat:presence", { userId, online: true });

    socket.on("chat:join", async (conversationId: unknown, callback?: (result: unknown) => void) => {
      const id = Number(conversationId);
      if (!Number.isInteger(id) || !(await getAuthorizedConversation(id, userId))) {
        callback?.({ ok: false, error: "Conversation access denied." });
        return;
      }
      await socket.join(conversationRoom(id));
      callback?.({ ok: true });
    });

    socket.on("chat:leave", async (conversationId: unknown) => {
      const id = Number(conversationId);
      if (Number.isInteger(id)) await socket.leave(conversationRoom(id));
    });

    socket.on("chat:send", async (payload: { conversationId?: unknown; body?: unknown; replyToId?: unknown; attachments?: Array<{ fileName?: string; storagePath?: string; mimeType?: string; fileSize?: number }> }, callback?: (result: unknown) => void) => {
      try {
        const conversationId = Number(payload?.conversationId);
        const body = normalizeMessageBody(payload?.body, MAX_MESSAGE_LENGTH);
        const conversation = Number.isInteger(conversationId) ? await getAuthorizedConversation(conversationId, userId) : null;
        if (!conversation || (!body && !(Array.isArray(payload?.attachments) && payload.attachments.length > 0))) {
          callback?.({ ok: false, error: "Message or conversation is invalid." });
          return;
        }
        const replyToId = Number(payload?.replyToId);
        if (Number.isInteger(replyToId)) {
          const reply = await prisma.chatMessage.findFirst({ where: { id: replyToId, conversationId } });
          if (!reply) return callback?.({ ok: false, error: "Reply target is invalid." });
        }
        const message = await prisma.chatMessage.create({ data: { conversationId, senderId: userId, body: body || "", replyToId: Number.isInteger(replyToId) ? replyToId : null }, include: chatMessageInclude });
        const attachments = Array.isArray(payload?.attachments) ? payload.attachments.filter((item) => typeof item?.storagePath === "string" && typeof item?.fileName === "string") : [];
        if (attachments.length > 0) {
          await prisma.chatMessageAttachment.createMany({ data: attachments.map((item) => ({ messageId: message.id, fileName: item.fileName!, storagePath: item.storagePath!, mimeType: typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream", fileSize: Number(item.fileSize) || 0 })) });
          const refreshed = await prisma.chatMessage.findUnique({ where: { id: message.id }, include: chatMessageInclude });
          if (refreshed) Object.assign(message, refreshed);
        }
        await prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        const recipients = await prisma.chatParticipant.findMany({ where: { conversationId, userId: { not: userId }, user: { status: "ACTIVE" } }, select: { userId: true } });
        await prisma.chatMessageDelivery.createMany({ data: recipients.map((recipient) => ({ messageId: message.id, userId: recipient.userId })) });
        await prisma.chatNotification.createMany({ data: recipients.map((recipient) => ({ userId: recipient.userId, conversationId, messageId: message.id, kind: "MESSAGE", title: `New message from ${socket.data.user.accountId}`, body: body || attachments[0]?.fileName || "Attachment" })) });
        const serialized = serializeMessage({ ...message, viewerUserId: userId });
        await emitToActiveConversationUsers(io, conversationId, "chat:message", serialized);
        callback?.({ ok: true, message: serialized });
      } catch {
        callback?.({ ok: false, error: "Unable to send message." });
      }
    });

    socket.on("chat:typing", async (payload: { conversationId?: unknown; typing?: boolean }) => {
      const conversationId = Number(payload?.conversationId);
      if (!Number.isInteger(conversationId) || !(await getAuthorizedConversation(conversationId, userId))) return;
      socket.to(conversationRoom(conversationId)).emit("chat:typing", { conversationId, userId, name: socket.data.user.accountId, typing: Boolean(payload.typing) });
    });

    socket.on("chat:reaction", async (payload: { messageId?: unknown; reaction?: unknown }, callback?: (result: unknown) => void) => {
      const messageId = Number(payload?.messageId);
      const reaction = typeof payload?.reaction === "string" ? payload.reaction : "";
      if (!Number.isInteger(messageId) || !ALLOWED_REACTIONS.includes(reaction as typeof ALLOWED_REACTIONS[number])) return callback?.({ ok: false, error: "Invalid reaction." });
      const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
      if (!message || !(await getAuthorizedConversation(message.conversationId, userId))) return callback?.({ ok: false, error: "Reaction denied." });
      const existing = await prisma.chatMessageReaction.findUnique({ where: { messageId_userId_reaction: { messageId, userId, reaction } } });
      if (existing) await prisma.chatMessageReaction.delete({ where: { id: existing.id } }); else await prisma.chatMessageReaction.create({ data: { messageId, userId, reaction } });
      io.to(conversationRoom(message.conversationId)).emit("chat:reaction", { messageId, userId, reaction, active: !existing });
      callback?.({ ok: true, active: !existing });
    });

    socket.on("chat:star", async (payload: { messageId?: unknown }, callback?: (result: unknown) => void) => {
      const messageId = Number(payload?.messageId);
      const message = Number.isInteger(messageId) ? await prisma.chatMessage.findUnique({ where: { id: messageId } }) : null;
      if (!message || !(await getAuthorizedConversation(message.conversationId, userId))) return callback?.({ ok: false, error: "Star denied." });
      const existing = await prisma.chatMessageStar.findUnique({ where: { messageId_userId: { messageId, userId } } });
      if (existing) await prisma.chatMessageStar.delete({ where: { id: existing.id } }); else await prisma.chatMessageStar.create({ data: { messageId, userId } });
      socket.emit("chat:star", { messageId, userId, starred: !existing });
      callback?.({ ok: true, starred: !existing });
    });

    socket.on("chat:pin", async (payload: { messageId?: unknown }, callback?: (result: unknown) => void) => {
      const messageId = Number(payload?.messageId);
      const message = Number.isInteger(messageId) ? await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: true } }) : null;
      if (!message || !(await getAuthorizedConversation(message.conversationId, userId))) return callback?.({ ok: false, error: "Pin denied." });
      if (message.conversation.type === ChatConversationType.OFFICIAL_ANNOUNCEMENT && !socket.data.user.isOwner) return callback?.({ ok: false, error: "Only the Owner can pin official announcements." });
      const existing = await prisma.chatMessagePin.findUnique({ where: { messageId } });
      if (existing) await prisma.chatMessagePin.delete({ where: { id: existing.id } }); else await prisma.chatMessagePin.create({ data: { messageId, pinnedById: userId } });
      io.to(conversationRoom(message.conversationId)).emit("chat:pin", { messageId, pinned: !existing });
      callback?.({ ok: true, pinned: !existing });
    });

    socket.on("chat:delivered", async (payload: { messageId?: unknown }, callback?: (result: unknown) => void) => {
      const messageId = Number(payload?.messageId);
      if (!Number.isInteger(messageId)) return callback?.({ ok: false, error: "Message is invalid." });
      const delivery = await prisma.chatMessageDelivery.findUnique({ where: { messageId_userId: { messageId, userId } } });
      if (!delivery) return callback?.({ ok: false, error: "Delivery update denied." });
      const readUpdate = await prisma.chatMessageDelivery.update({
        where: { id: delivery.id },
        data: { deliveredAt: delivery.deliveredAt ?? new Date() },
      });
      const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
      if (message) io.to(conversationRoom(message.conversationId)).emit("chat:delivered", { messageId, userId, deliveredAt: readUpdate.deliveredAt });
      callback?.({ ok: true, deliveredAt: readUpdate.deliveredAt });
    });

    socket.on("chat:read", async (conversationId: unknown) => {
      const id = Number(conversationId);
      if (!Number.isInteger(id) || !(await getAuthorizedConversation(id, userId))) return;
      const readAt = new Date();
      await prisma.chatParticipant.update({ where: { conversationId_userId: { conversationId: id, userId } }, data: { lastReadAt: readAt } });
      await prisma.chatMessageDelivery.updateMany({ where: { message: { conversationId: id }, userId, readAt: null }, data: { deliveredAt: readAt, readAt } });
      socket.to(conversationRoom(id)).emit("chat:read", { conversationId: id, userId, readAt });
    });

    socket.on("chat:edit", async (payload: { messageId?: unknown; body?: unknown }, callback?: (result: unknown) => void) => {
      const messageId = Number(payload?.messageId);
      const body = normalizeMessageBody(payload?.body, MAX_MESSAGE_LENGTH);
      if (!Number.isInteger(messageId) || !body) return callback?.({ ok: false, error: "Message is invalid." });
      const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { sender: { select: { fullName: true } } } });
      if (!message || message.senderId !== userId || !(await getAuthorizedConversation(message.conversationId, userId))) return callback?.({ ok: false, error: "Message edit denied." });
      const updated = await prisma.chatMessage.update({ where: { id: messageId }, data: { body }, include: { sender: { select: { fullName: true } } } });
      io.to(conversationRoom(message.conversationId)).emit("chat:edit", serializeMessage(updated));
      callback?.({ ok: true, message: serializeMessage(updated) });
    });

    socket.on("chat:delete", async (payload: { messageId?: unknown }, callback?: (result: unknown) => void) => {
      const messageId = Number(payload?.messageId);
      if (!Number.isInteger(messageId)) return callback?.({ ok: false, error: "Message is invalid." });
      const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: true, sender: { select: { fullName: true } } } });
      const allowed = message && (message.senderId === userId || (message.conversation.type === ChatConversationType.OFFICIAL_ANNOUNCEMENT && socket.data.user.isOwner));
      if (!allowed || !(await getAuthorizedConversation(message.conversationId, userId))) return callback?.({ ok: false, error: "Message deletion denied." });
      const deleted = await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() }, include: { sender: { select: { fullName: true } } } });
      const serialized = serializeMessage(deleted);
      io.to(conversationRoom(message.conversationId)).emit("chat:delete", serialized);
      callback?.({ ok: true, message: serialized });
    });

    socket.on("disconnect", () => {
      const count = activeSockets.get(userId) ?? 1;
      if (count <= 1) {
        activeSockets.delete(userId);
        io.emit("chat:presence", { userId, online: false });
      } else {
        activeSockets.set(userId, count - 1);
      }
    });
  });
}
