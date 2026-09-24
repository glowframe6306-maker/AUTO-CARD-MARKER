import { ChatConversationType, Prisma } from "@prisma/client";
import prisma from "./prisma";

export const OFFICIAL_TITLE = "OFFICIAL ANNOUNCEMENT GROUP";
export const MAX_MESSAGE_LENGTH = 4000;
export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🙏"] as const;

const chatUserSelect = {
  id: true,
  accountId: true,
  fullName: true,
  isOwner: true,
  status: true,
  memberProfile: { select: { memberId: true, position: true, photoUrl: true, customFields: true } },
} satisfies Prisma.UserSelect;

export async function ensureOfficialAnnouncementGroup() {
  const cleared = await prisma.chatClearState.findUnique({ where: { id: 1 } });
  if (cleared) return null;

  const conversation = await prisma.chatConversation.upsert({
    where: { directKey: "OFFICIAL_ANNOUNCEMENT_GROUP" },
    update: { title: OFFICIAL_TITLE },
    create: { type: ChatConversationType.OFFICIAL_ANNOUNCEMENT, title: OFFICIAL_TITLE, directKey: "OFFICIAL_ANNOUNCEMENT_GROUP" },
  });

  const activeUsers = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  if (activeUsers.length) {
    await prisma.chatParticipant.createMany({
      data: activeUsers.map((user) => ({ conversationId: conversation.id, userId: user.id })),
      skipDuplicates: true,
    });
  }

  return conversation;
}

export async function getAuthorizedConversation(conversationId: number, userId: number) {
  return prisma.chatConversation.findFirst({
    where: { id: conversationId, participants: { some: { userId } } },
    include: { participants: { select: { userId: true } } },
  });
}

export function serializeMessage(message: any) {
  const reactionCounts = (message.reactions ?? []).reduce((result: Record<string, number>, item: any) => {
    result[item.reaction] = (result[item.reaction] ?? 0) + 1;
    return result;
  }, {});
  const viewerUserId = message.viewerUserId ?? null;
  const delivery = message.delivery ?? (message.deliveries ?? []).find((item: any) => item.userId === viewerUserId) ?? (message.deliveries ?? [])[0] ?? null;
  const status = delivery ? (delivery.readAt ? "read" : delivery.deliveredAt ? "delivered" : "sent") : message.senderId === viewerUserId ? "sent" : "pending";
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.sender?.fullName ?? "",
    body: message.deletedAt ? "This message was deleted" : message.body,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    deletedAt: message.deletedAt,
    edited: message.updatedAt?.getTime?.() !== message.createdAt?.getTime?.(),
    replyTo: message.replyTo ? { id: message.replyTo.id, senderName: message.replyTo.sender?.fullName ?? "", body: message.replyTo.deletedAt ? "This message was deleted" : message.replyTo.body } : null,
    reactions: reactionCounts,
    reactedByMe: message.reactions?.some((item: any) => item.userId === viewerUserId) ?? false,
    starred: message.stars?.some((item: any) => item.userId === viewerUserId) ?? false,
    pinned: Boolean(message.pins?.length),
    attachments: (message.attachments ?? []).map((attachment: any) => ({
      id: attachment.id,
      messageId: attachment.messageId,
      fileName: attachment.fileName,
      storagePath: attachment.storagePath,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      createdAt: attachment.createdAt,
      url: attachment.storagePath ? `/uploads${attachment.storagePath.startsWith("/") ? attachment.storagePath : `/${attachment.storagePath}`}` : null,
    })),
    delivery,
    deliveryStatus: status,
  };
}

export const chatMessageInclude = {
  sender: { select: { fullName: true } },
  replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { fullName: true } } } },
  reactions: { select: { userId: true, reaction: true } },
  stars: { select: { userId: true } },
  pins: { select: { id: true } },
  attachments: true,
  deliveries: { select: { userId: true, deliveredAt: true, readAt: true } },
} as const;

export async function getConversationList(userId: number) {
  await ensureOfficialAnnouncementGroup();
  const conversations = await prisma.chatConversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: { include: { user: { select: chatUserSelect } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { fullName: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = await Promise.all(conversations.map(async (conversation) => {
    const participant = conversation.participants.find((item) => item.userId === userId);
    const other = conversation.participants.find((item) => item.userId !== userId && item.user.status === "ACTIVE");
    const unreadCount = participant?.lastReadAt
      ? await prisma.chatMessage.count({ where: { conversationId: conversation.id, createdAt: { gt: participant.lastReadAt }, senderId: { not: userId }, deletedAt: null } })
      : await prisma.chatMessage.count({ where: { conversationId: conversation.id, senderId: { not: userId }, deletedAt: null } });

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.type === ChatConversationType.OFFICIAL_ANNOUNCEMENT ? OFFICIAL_TITLE : other?.user.fullName ?? "Conversation",
      otherUser: conversation.type === ChatConversationType.DIRECT ? other?.user ?? null : null,
      latestMessage: conversation.messages[0] ? serializeMessage(conversation.messages[0]) : null,
      unreadCount,
      updatedAt: conversation.updatedAt,
    };
  }));

  return result.sort((a, b) => {
    if (a.type === ChatConversationType.OFFICIAL_ANNOUNCEMENT) return -1;
    if (b.type === ChatConversationType.OFFICIAL_ANNOUNCEMENT) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export { chatUserSelect };
