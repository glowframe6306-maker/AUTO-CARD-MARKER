export const conversationRoom = (conversationId: number) => `chat:conversation:${conversationId}`;

export function normalizeMessageBody(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const body = value.trim();
  if (!body || body.length > maxLength) return null;
  return body;
}
