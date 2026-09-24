import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { io, Socket } from "socket.io-client";
import { ArrowLeft, Bell, Check, MessageCircle, MoreHorizontal, Paperclip, Pencil, Search, Send, ShieldAlert, Trash2, Wifi, WifiOff } from "lucide-react";
import { authFetch, getApiUrl, getAuthToken } from "../lib/api";
import { useAuth } from "../lib/useAuth";

type UserSummary = {
  id: number;
  accountId: string;
  fullName: string;
  isOwner: boolean;
  status: string;
  memberProfile?: {
    memberId?: string;
    position?: string;
    photoUrl?: string | null;
    customFields?: Record<string, unknown> | null;
  } | null;
};

type MessageAttachment = {
  id: number;
  messageId?: number;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  storagePath?: string;
  url?: string | null;
  createdAt?: string;
};

type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  edited?: boolean;
  replyTo?: { id: number; senderName: string; body: string } | null;
  reactions?: Record<string, number>;
  starred?: boolean;
  pinned?: boolean;
  deliveryStatus?: string;
  attachments?: MessageAttachment[];
};

type ChatNotification = {
  id: number;
  userId: number;
  conversationId: number;
  messageId?: number | null;
  kind: string;
  title: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
};

type Conversation = {
  id: number;
  type: "DIRECT" | "OFFICIAL_ANNOUNCEMENT";
  title: string;
  otherUser?: UserSummary | null;
  latestMessage?: Message | null;
  unreadCount: number;
  updatedAt: string;
};

type ChatSocket = Socket;

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function timeLabel(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

function parseDobValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
    return trimmed;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = record.dob ?? record.dateOfBirth ?? record.birthDate ?? record.date_of_birth ?? record.DOB;
    return parseDobValue(candidate);
  }
  return String(value);
}

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

export default function ChatsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeUsers, setActiveUsers] = useState<UserSummary[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [typingName, setTypingName] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connecting");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [newMessages, setNewMessages] = useState(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [isClearingChats, setIsClearingChats] = useState(false);
  const [clearChatsMessage, setClearChatsMessage] = useState<string | null>(null);
  const [draftAttachments, setDraftAttachments] = useState<Array<{ id: string; fileName: string; mimeType: string; fileSize: number; storagePath?: string; file?: File; previewUrl?: string; uploading: boolean; error?: string }>>([]);
  const [lightboxAttachment, setLightboxAttachment] = useState<MessageAttachment | null>(null);
  const [messageMenuOpenId, setMessageMenuOpenId] = useState<number | null>(null);
  const [messageMenuPosition, setMessageMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const socketRef = useRef<ChatSocket | null>(null);
  const activeConversationIdRef = useRef<number | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messageScrollerRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const notificationPermissionRequestedRef = useRef(false);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, []);

  useEffect(() => {
    if (isLoading || !user || notificationPermissionRequestedRef.current) return;
    notificationPermissionRequestedRef.current = true;

    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }

    const permission = Notification.permission;
    setNotificationPermission(permission);
    if (permission !== "default") return;

    void Notification.requestPermission().then(setNotificationPermission).catch(() => {
      setNotificationPermission(Notification.permission);
    });
  }, [isLoading, user]);

  useEffect(() => {
    if (messageMenuOpenId === null) return;

    const closeMenu = () => {
      setMessageMenuOpenId(null);
      setMessageMenuPosition(null);
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-message-menu-trigger]") || target.closest("[data-message-menu]")) return;
      closeMenu();
    };

    const handleScroll = () => closeMenu();

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [messageMenuOpenId]);

  const loadNotifications = async () => {
    const response = await authFetch(`${getApiUrl()}/api/chats/notifications`);
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data)) setNotifications(data);
  };

  const loadBootstrap = async () => {
    try {
      const response = await authFetch(`${getApiUrl()}/api/chats/bootstrap`);
      let data: any = {};

      if (response.status !== 204) {
        try {
          data = await response.json();
        } catch {
          data = {};
        }
      }

      if (!response.ok) {
        throw new Error(data?.error || "Unable to load chats.");
      }

      setCurrentUserId(typeof data.currentUserId === "number" ? data.currentUserId : null);
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
      setActiveUsers(Array.isArray(data.activeUsers) ? data.activeUsers : []);
      setError(null);
    } catch (err: any) {
      setCurrentUserId(null);
      setConversations([]);
      setActiveUsers([]);
      setError(err?.message || "Unable to load chats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading || !user) {
      if (!user && !isLoading) {
        window.location.href = "/";
      }
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    void loadBootstrap().finally(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [user, isLoading]);

  useEffect(() => {
    const token = getAuthToken();
    if (!user || !token) return;
    const socket = io(getApiUrl(), { auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    setConnectionState("connecting");
    socket.on("connect", () => { setConnectionState("connected"); setError(null); });
    socket.on("reconnect_attempt", () => setConnectionState("reconnecting"));
    socket.on("disconnect", () => setConnectionState("offline"));
    socket.on("connect_error", () => { setConnectionState("reconnecting"); setError("Chat connection unavailable. You can still view saved messages."); });
    socket.on("chat:presence", (payload: { userId: number; online: boolean }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        if (payload.online) next.add(Number(payload.userId)); else next.delete(Number(payload.userId));
        return next;
      });
    });
    socket.on("chat:typing", (payload: { conversationId: number; name: string; typing: boolean }) => {
      if (payload.conversationId !== activeConversationId) return;
      setTypingName(payload.typing ? payload.name : null);
      if (payload.typing) window.setTimeout(() => setTypingName(null), 2500);
    });
    socket.on("chat:message", (message: Message) => {
      const isActive = message.conversationId === activeConversationIdRef.current && document.visibilityState === "visible";
      setConversations((current) => current.map((conversation) => conversation.id === message.conversationId ? { ...conversation, latestMessage: message, updatedAt: message.createdAt, unreadCount: isActive ? 0 : conversation.unreadCount + 1 } : conversation));
      if (message.conversationId === activeConversationIdRef.current) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        if (!nearBottomRef.current) setNewMessages((count) => count + 1);
        if (isActive) void authFetch(`${getApiUrl()}/api/chats/${message.conversationId}/read`, { method: "PATCH" });
      }
      if (message.senderId !== user.id && message.conversationId !== activeConversationIdRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const notification = new Notification(`New message from ${message.senderName || "AUTO CARD MARKING"}`, { body: (message.body || message.attachments?.[0]?.fileName || "New attachment").slice(0, 160), tag: `chat-${message.conversationId}` });
        notification.onclick = () => { window.focus(); void router.push(`/chats?conversationId=${message.conversationId}`); notification.close(); };
      }
    });
    socket.on("chat:edit", (message: Message) => setMessages((current) => current.map((item) => item.id === message.id ? message : item)));
    socket.on("chat:delete", (message: Message) => setMessages((current) => current.map((item) => item.id === message.id ? message : item)));
    socket.on("chat:reaction", (payload: { messageId: number; reaction: string; active: boolean }) => setMessages((current) => current.map((item) => item.id === payload.messageId ? { ...item, reactions: { ...(item.reactions ?? {}), [payload.reaction]: Math.max(0, (item.reactions?.[payload.reaction] ?? 0) + (payload.active ? 1 : -1)) } } : item)));
    socket.on("chat:star", (payload: { messageId: number; userId: number; starred: boolean }) => { if (payload.userId === user.id) setMessages((current) => current.map((item) => item.id === payload.messageId ? { ...item, starred: payload.starred } : item)); });
    socket.on("chat:pin", (payload: { messageId: number; pinned: boolean }) => setMessages((current) => current.map((item) => item.id === payload.messageId ? { ...item, pinned: payload.pinned } : item)));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [user, router]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const activeConversationName = activeConversation?.type === "DIRECT"
    ? activeConversation.otherUser?.fullName || activeConversation.title
    : activeConversation?.title || "";
  const activeMemberDetails = useMemo(() => {
    if (!activeConversation || activeConversation.type !== "DIRECT" || !activeConversation.otherUser) return null;

    const customFields = activeConversation.otherUser.memberProfile?.customFields ?? null;
    const rawDob = customFields && typeof customFields === "object"
      ? customFields.dob ?? customFields.dateOfBirth ?? customFields.birthDate ?? customFields.date_of_birth ?? customFields.DOB ?? null
      : null;

    return {
      name: activeConversation.otherUser.fullName || activeConversation.title || "Member",
      rcNumber: activeConversation.otherUser.memberProfile?.memberId || activeConversation.otherUser.accountId || "--",
      dob: parseDobValue(rawDob),
    };
  }, [activeConversation]);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeUsers.filter((item) => !query || [item.fullName, item.accountId, item.memberProfile?.memberId, item.memberProfile?.position].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [activeUsers, search]);
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((item) => !query || item.title.toLowerCase().includes(query) || item.otherUser?.accountId.toLowerCase().includes(query) || item.otherUser?.memberProfile?.memberId?.toLowerCase().includes(query));
  }, [conversations, search]);

  useEffect(() => {
    if (!activeConversationId) return;
    let mounted = true;
    setLoadingMessages(true);
    void authFetch(`${getApiUrl()}/api/chats/${activeConversationId}/messages`).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load message history.");
      const data = await response.json();
      if (mounted) setMessages(Array.isArray(data) ? data : []);
    }).catch((err: any) => mounted && setError(err?.message || "Unable to load messages.")).finally(() => mounted && setLoadingMessages(false));
    socketRef.current?.emit("chat:join", activeConversationId);
    void authFetch(`${getApiUrl()}/api/chats/${activeConversationId}/read`, { method: "PATCH" });
    setConversations((current) => current.map((conversation) => conversation.id === activeConversationId ? { ...conversation, unreadCount: 0 } : conversation));
    return () => { mounted = false; socketRef.current?.emit("chat:leave", activeConversationId); };
  }, [activeConversationId]);

  useEffect(() => {
    const conversationId = Number(router.query.conversationId);
    if (Number.isInteger(conversationId) && conversationId > 0 && conversations.some((conversation) => conversation.id === conversationId)) {
      openConversation(conversationId);
    }
  }, [router.query.conversationId, conversations]);

  useEffect(() => {
    if (nearBottomRef.current) messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingName]);

  function handleScroll() {
    const element = messageScrollerRef.current;
    if (!element) return;
    nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    if (nearBottomRef.current) setNewMessages(0);
  }

  function openConversation(conversationId: number) {
    setActiveConversationId(conversationId);
    setMobileListOpen(false);
    setNewMessages(0);
  }

  async function clearAllChats() {
    if (!user?.isOwner) return;
    if (!window.confirm("CLEAR ALL CHATS?\n\nThis will permanently clear all existing chats and messages for all members.")) return;

    try {
      setIsClearingChats(true);
      setClearChatsMessage(null);
      const response = await authFetch(`${getApiUrl()}/api/chats/clear-all`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to clear all chats.");

      setConversations([]);
      setMessages([]);
      setNotifications([]);
      setActiveConversationId(null);
      setReplyTo(null);
      setDraft("");
      setDraftAttachments([]);
      setNewMessages(0);
      setMobileListOpen(true);
      setClearChatsMessage("All chats and messages were cleared.");
    } catch (err: any) {
      setClearChatsMessage(err?.message || "Unable to clear all chats.");
    } finally {
      setIsClearingChats(false);
    }
  }

  async function openDirectChat(target: UserSummary) {
    try {
      const response = await authFetch(`${getApiUrl()}/api/chats/direct`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: target.id }) });
      if (!response.ok) throw new Error("Unable to open direct chat.");
      const data = await response.json();
      await loadBootstrap();
      openConversation(Number(data.conversationId));
    } catch (err: any) {
      setError(err?.message || "Unable to open direct chat.");
    }
  }

  async function uploadDraftAttachment(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await authFetch(`${getApiUrl()}/api/chats/upload`, { method: "POST", body: formData });
    if (!response.ok) throw new Error("Unable to upload file.");
    return (await response.json()) as { fileName: string; mimeType: string; fileSize: number; storagePath: string };
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!activeConversationId || !socketRef.current?.connected) return;
    const body = draft.trim();
    const pendingUploads = draftAttachments.filter((item) => !item.storagePath && !item.error);
    if (!body && !pendingUploads.length && draftAttachments.length === 0) return;

    try {
      const uploaded = await Promise.all(pendingUploads.map(async (item) => {
        const file = item.file;
        if (!file) return null;
        const metadata = await uploadDraftAttachment(file);
        return metadata;
      }));

      const uploadedAttachments = uploaded.filter(Boolean) as Array<{ fileName: string; mimeType: string; fileSize: number; storagePath: string }>;
      const needsBody = body.length > 0 || uploadedAttachments.length > 0;
      if (!needsBody) return;
      const attachments = uploadedAttachments.length > 0 ? uploadedAttachments.map((item) => ({ fileName: item.fileName, mimeType: item.mimeType, fileSize: item.fileSize, storagePath: item.storagePath })) : undefined;
      socketRef.current.emit("chat:send", { conversationId: activeConversationId, body: body || "", replyToId: replyTo?.id, attachments }, (result: { ok: boolean; error?: string }) => {
        if (!result.ok) setError(result.error || "Unable to send message.");
        else {
          setDraft("");
          setReplyTo(null);
          setDraftAttachments([]);
          if (attachmentInputRef.current) attachmentInputRef.current.value = "";
        }
      });
    } catch (err: any) {
      setError(err?.message || "Unable to upload attachment.");
    }
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); }
    if (activeConversationId) socketRef.current?.emit("chat:typing", { conversationId: activeConversationId, typing: event.currentTarget.value.length > 0 });
  }

  function openMessageMenu(messageId: number, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (messageMenuOpenId === messageId) {
      setMessageMenuOpenId(null);
      setMessageMenuPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 250;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12);
    const top = Math.min(Math.max(12, rect.bottom + 10), window.innerHeight - menuHeight - 12);

    setMessageMenuOpenId(messageId);
    setMessageMenuPosition({ left, top });
  }

  function closeMessageMenu() {
    setMessageMenuOpenId(null);
    setMessageMenuPosition(null);
  }

  function handleMessageAction(message: Message, action: "reply" | "react" | "copy" | "star" | "pin" | "edit" | "delete") {
    closeMessageMenu();

    switch (action) {
      case "reply":
        setReplyTo(message);
        break;
      case "react":
        toggleReaction(message, "👍");
        break;
      case "copy":
        if (message.body) void navigator.clipboard.writeText(message.body);
        break;
      case "star":
        toggleStar(message);
        break;
      case "pin":
        togglePin(message);
        break;
      case "edit":
        editMessage(message);
        break;
      case "delete":
        deleteMessage(message);
        break;
      default:
        break;
    }
  }

  function editMessage(message: Message) {
    const next = window.prompt("Edit message", message.body);
    if (!next?.trim() || !socketRef.current) return;
    socketRef.current.emit("chat:edit", { messageId: message.id, body: next });
  }

  function deleteMessage(message: Message) {
    if (!window.confirm("Delete this message?")) return;
    socketRef.current?.emit("chat:delete", { messageId: message.id });
  }

  function toggleReaction(message: Message, reaction = "👍") {
    socketRef.current?.emit("chat:reaction", { messageId: message.id, reaction });
  }

  function handleAttachmentSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const nextItems = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}`,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      uploading: false,
    }));
    setDraftAttachments((current) => [...current, ...nextItems]);
    event.target.value = "";
  }

  function removeDraftAttachment(id: string) {
    setDraftAttachments((current) => current.filter((item) => item.id !== id));
  }

  function markNotificationsRead() {
    void authFetch(`${getApiUrl()}/api/chats/notifications/read`, { method: "PATCH" }).then(() => setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))));
  }

  function toggleStar(message: Message) {
    socketRef.current?.emit("chat:star", { messageId: message.id });
  }

  function togglePin(message: Message) {
    socketRef.current?.emit("chat:pin", { messageId: message.id });
  }

  const notificationStatusText = notificationPermission === "unsupported"
    ? "Browser notifications are not supported."
    : notificationPermission === "granted"
      ? "Notifications Enabled"
      : notificationPermission === "denied"
        ? "Notifications are blocked. Allow notifications for this site in your browser settings."
        : "Requesting notification permission...";

  if (isLoading || loading) return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-7xl rounded-3xl bg-white p-8 text-slate-600 shadow-sm">Loading chats...</div></main>;
  if (!user) return null;

  return (
    <main className="h-[calc(100dvh-76px)] max-h-[calc(100dvh-76px)] overflow-hidden bg-white p-3 text-slate-900 sm:p-6">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(30,64,175,0.12)]">
        <aside className={`${mobileListOpen ? "flex" : "hidden"} min-h-0 w-full flex-col border-r border-slate-200 bg-white md:flex md:w-[360px]`}>
          <div className="border-b border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Messages</p><h1 className="mt-1 text-3xl font-black">Chats</h1></div><div className="flex items-center gap-2"><MessageCircle className="text-blue-600" size={30} />{user.isOwner && <button type="button" onClick={() => void clearAllChats()} disabled={isClearingChats} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">{isClearingChats ? "Clearing..." : "CLEAR CHATS"}</button>}</div></div>
            {clearChatsMessage && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600" role="status" aria-live="polite">{clearChatsMessage}</div>}
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"><Search size={17} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats..." className="w-full bg-transparent text-sm outline-none" /></div>
            <div className="mt-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className={`h-2 w-2 rounded-full ${connectionState === "connected" ? "bg-emerald-500" : "bg-amber-400"}`} />{connectionState === "connected" ? "Connected" : connectionState === "offline" ? "Offline" : "Reconnecting..."}</span><div className="flex items-center gap-2"><button type="button" onClick={() => { setNotificationCenterOpen((open) => !open); void markNotificationsRead(); }} className="relative flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50"><Bell size={13} />{notifications.some((item) => !item.readAt) && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[9px] text-white">{notifications.filter((item) => !item.readAt).length}</span>}</button>{notificationPermission === "granted" && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{notificationStatusText}</span>}{notificationPermission === "denied" && <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">{notificationStatusText}</span>}{notificationPermission === "unsupported" && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{notificationStatusText}</span>}{notificationPermission === "default" && <span className="text-xs font-semibold text-slate-400">{notificationStatusText}</span>}</div></div>
            {notificationCenterOpen && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Notification center</p><button type="button" onClick={() => void authFetch(`${getApiUrl()}/api/chats/notifications/read`, { method: "PATCH" })} className="text-[10px] font-bold text-blue-600">Mark all read</button></div>{notifications.length ? <div className="space-y-2">{notifications.slice(0, 8).map((item) => <button key={item.id} type="button" onClick={() => { setNotificationCenterOpen(false); openConversation(item.conversationId); }} className={`block w-full rounded-xl border px-2 py-2 text-left ${item.readAt ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50"}`}><div className="text-xs font-bold text-slate-700">{item.title}</div><div className="mt-1 text-[11px] text-slate-600">{item.body}</div><div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">{new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div></button>)} </div> : <p className="text-xs text-slate-500">No notifications yet.</p>}</div>}
          </div>
          {error && <div className="m-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
          <div className="flex-1 overflow-y-auto p-3">
            <p className="px-3 pb-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Official</p>
            {filteredConversations.filter((item) => item.type === "OFFICIAL_ANNOUNCEMENT").map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeConversationId} onClick={() => openConversation(conversation.id)} official />)}
            <p className="mt-5 px-3 pb-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Members</p>
            {filteredConversations.filter((item) => item.type === "DIRECT").map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeConversationId} onClick={() => openConversation(conversation.id)} online={conversation.otherUser ? onlineUsers.has(conversation.otherUser.id) : false} />)}
            {filteredUsers.map((item) => !conversations.some((conversation) => conversation.otherUser?.id === item.id) && <button key={item.id} onClick={() => void openDirectChat(item)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white"><Avatar name={item.fullName} online={onlineUsers.has(item.id)} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.fullName}</span><span className="block text-xs text-slate-500">{item.memberProfile?.memberId || item.accountId}</span></span></button>)}
            {!filteredUsers.length && !filteredConversations.length && <div className="p-5 text-center text-sm text-slate-500">No active members available.</div>}
          </div>
        </aside>

        <section className={`${mobileListOpen ? "hidden" : "flex"} min-h-0 min-w-0 flex-1 flex-col bg-white md:flex`}>
          {activeConversation ? <>
            <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6"><div className="flex items-center gap-3"><button onClick={() => setMobileListOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-blue-50 md:hidden" aria-label="Back to chats"><ArrowLeft size={20} /></button><Avatar name={activeConversationName} online={activeConversation.otherUser ? onlineUsers.has(activeConversation.otherUser.id) : undefined} official={activeConversation.type === "OFFICIAL_ANNOUNCEMENT"} /><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-black">CHATS</h2><p className="text-xs text-slate-500">{activeConversation.type === "OFFICIAL_ANNOUNCEMENT" ? "Official announcements from AUTO CARD MARKING" : activeConversation.otherUser?.memberProfile?.position || (activeConversation.otherUser && (onlineUsers.has(activeConversation.otherUser.id) ? "Online" : "Offline"))}</p></div><span className="flex items-center gap-2 text-xs font-semibold text-slate-400"><span className={`h-2 w-2 rounded-full ${connectionState === "connected" ? "bg-emerald-500" : "bg-amber-400"}`} />{connectionState === "connected" ? "Connected" : "Reconnecting"}</span><MoreHorizontal className="text-slate-400" /></div>{activeMemberDetails && <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Name</p><p className="mt-1 truncate text-sm font-bold text-slate-900">{activeMemberDetails.name}</p></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">RC Number</p><p className="mt-1 text-sm font-bold text-slate-900">{activeMemberDetails.rcNumber}</p></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Date of Birth</p><p className="mt-1 text-sm font-bold text-slate-900">{activeMemberDetails.dob || "--"}</p></div></div>}</header>
            <div ref={messageScrollerRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto bg-white p-4 sm:p-7">{newMessages > 0 && <button type="button" onClick={() => { nearBottomRef.current = true; setNewMessages(0); messageEndRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="sticky top-2 z-10 mx-auto block rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg">{newMessages} new message{newMessages === 1 ? "" : "s"}</button>}{loadingMessages ? <p className="text-center text-sm text-slate-500">Loading messages...</p> : messages.length ? messages.map((message, index) => <div key={message.id}>{(index === 0 || dateLabel(messages[index - 1].createdAt) !== dateLabel(message.createdAt)) && <div className="my-5 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400"><span className="rounded-full bg-slate-100 px-3 py-1">{dateLabel(message.createdAt)}</span></div>}<MessageBubble message={message} own={message.senderId === currentUserId} official={activeConversation.type === "OFFICIAL_ANNOUNCEMENT"} owner={Boolean(user.isOwner)} menuOpen={messageMenuOpenId === message.id} menuPosition={messageMenuPosition} onToggleMenu={openMessageMenu} onCloseMenu={closeMessageMenu} onAction={handleMessageAction} /></div>) : <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">{activeConversation.type === "OFFICIAL_ANNOUNCEMENT" ? "No announcements yet." : "No messages yet. Say hello."}</div>}{typingName && <p className="mt-3 text-xs font-semibold text-slate-500">{typingName} is typing...</p>}<div ref={messageEndRef} /></div>
            <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-3 sm:p-4">{replyTo && <div className="mb-3 flex items-center justify-between rounded-xl border-l-4 border-blue-600 bg-blue-50 px-3 py-2 text-xs"><span><b>Replying to {replyTo.senderName}</b><br />{replyTo.body.slice(0, 100)}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">x</button></div>}{draftAttachments.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{draftAttachments.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600"><span className="max-w-[180px] truncate">{item.fileName}</span><button type="button" onClick={() => removeDraftAttachment(item.id)} className="text-slate-400 hover:text-red-600">×</button></div>)}</div>}<div className="flex items-end gap-2"><input ref={attachmentInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/zip" className="hidden" onChange={handleAttachmentSelection} multiple /><button type="button" onClick={() => attachmentInputRef.current?.click()} className="rounded-xl p-2 text-slate-400 hover:bg-blue-50" aria-label="Attach file"><Paperclip size={19} /></button><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKey} rows={1} placeholder="Type a message..." className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><button type="submit" disabled={(!draft.trim() && draftAttachments.length === 0) || !socketRef.current?.connected} className="rounded-2xl bg-blue-600 p-3 text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send size={18} /></button></div></form>
          </> : <div className="flex flex-1 flex-col items-center justify-center bg-[#f5f8fb] p-8 text-center"><div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-cyan-100 text-cyan-600"><MessageCircle size={38} /></div><h2 className="mt-5 text-2xl font-black">Choose a conversation</h2><p className="mt-2 max-w-sm text-sm text-slate-500">Select the official group or an active member to start chatting.</p></div>}
        </section>
      </div>
    </main>
  );
}

function Avatar({ name, online, official }: { name: string; online?: boolean; official?: boolean }) {
  return <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white ${official ? "bg-blue-700" : "bg-gradient-to-br from-blue-500 to-blue-700"}`}>{official ? <ShieldAlert size={20} /> : initials(name)}{online !== undefined && <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${online ? "bg-emerald-400" : "bg-slate-300"}`} />}</div>;
}

function ConversationRow({ conversation, active, onClick, official, online }: { conversation: Conversation; active: boolean; onClick: () => void; official?: boolean; online?: boolean }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${active ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"}`}><Avatar name={conversation.title} online={online} official={official} /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-black">{conversation.title}</span>{conversation.unreadCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">{conversation.unreadCount}</span>}</span><span className="block truncate text-xs text-slate-500">{conversation.latestMessage?.body || (official ? "Official announcements" : "Start a conversation")}</span></span><span className="text-[10px] text-slate-400">{timeLabel(conversation.latestMessage?.createdAt)}</span></button>;
}

function MessageBubble({ message, own, official, owner, menuOpen, menuPosition, onToggleMenu, onCloseMenu, onAction }: { message: Message; own: boolean; official: boolean; owner: boolean; menuOpen: boolean; menuPosition: { left: number; top: number } | null; onToggleMenu: (messageId: number, event: React.MouseEvent<HTMLButtonElement>) => void; onCloseMenu: () => void; onAction: (message: Message, action: "reply" | "react" | "copy" | "star" | "pin" | "edit" | "delete") => void; }) {
  const canEdit = !message.deletedAt && own;
  const canDelete = !message.deletedAt && (own || (official && owner));
  const canPin = !message.deletedAt && (official ? owner : true);
  const actions: Array<{ label: string; action: "reply" | "react" | "copy" | "star" | "pin" | "edit" | "delete"; hidden?: boolean }> = [
    { label: "Reply", action: "reply" },
    { label: "React", action: "react" },
    { label: "Copy", action: "copy" },
    { label: message.starred ? "Unstar" : "Star", action: "star" },
    ...(canPin ? [{ label: message.pinned ? "Unpin" : "Pin", action: "pin" as const }] : []),
    ...(canEdit ? [{ label: "Edit", action: "edit" as const }] : []),
    ...(canDelete ? [{ label: "Delete", action: "delete" as const }] : [])
  ];

  return <div className={`group relative mb-3 flex ${own ? "justify-end" : "justify-start"}`}><div className={`max-w-[min(80%,520px)] rounded-2xl px-4 py-3 shadow-sm ${own ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-800"}`}>
    {official && !own && <p className="mb-1 text-xs font-black text-violet-600">{message.senderName}</p>}
    {message.replyTo && <div className="mb-2 rounded-lg border-l-2 border-blue-300 bg-black/5 px-2 py-1 text-xs opacity-80"><b>{message.replyTo.senderName}</b><br />{message.replyTo.body}</div>}
    {message.attachments && message.attachments.length > 0 && <div className="mb-2 grid gap-2">{message.attachments.map((attachment) => attachment.mimeType?.startsWith("image/") || attachment.url?.match(/\.(jpe?g|png|webp|gif)$/i) ? <button key={attachment.id} type="button" onClick={() => window.open(attachment.url || "", "_blank", "noopener,noreferrer")} className="overflow-hidden rounded-xl border border-white/40 bg-slate-100"><img src={attachment.url || ""} alt={attachment.fileName} className="max-h-64 w-full object-cover" /></button> : <a key={attachment.id} href={attachment.url || "#"} target="_blank" rel="noreferrer" className={`flex items-center gap-2 rounded-xl border border-current/10 bg-white/10 px-2 py-2 text-xs ${own ? "text-white" : "text-slate-700"}`}><Paperclip size={12} /><span className="truncate">{attachment.fileName}</span></a>)}</div>}
    {message.body && <p className={`whitespace-pre-wrap break-words text-sm ${message.deletedAt ? "italic opacity-70" : ""}`}>{message.body}</p>}
    {message.reactions && Object.entries(message.reactions).filter(([, count]) => count > 0).length > 0 && <div className="mt-2 flex flex-wrap gap-1">{Object.entries(message.reactions).filter(([, count]) => count > 0).map(([reaction, count]) => <span key={reaction} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 shadow">{reaction} {count}</span>)}</div>}
    <div className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${own ? "text-cyan-100" : "text-slate-400"}`}><span>{message.edited && !message.deletedAt ? "edited · " : ""}{timeLabel(message.createdAt)}</span>{own && <span className="font-bold">{message.deliveryStatus || "sent"}</span>} {own && <Check size={13} />}</div>
    {!message.deletedAt && <div className="mt-2 flex justify-end"><button type="button" data-message-menu-trigger aria-label="Open message actions" onClick={(event) => onToggleMenu(message.id, event)} className={`flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none ${own ? "bg-white/10 text-white hover:bg-white/20" : "bg-slate-200 text-slate-600 hover:bg-slate-300"}`}>
      ⋮
    </button></div>}
    {menuOpen && menuPosition && <div data-message-menu style={{ position: "fixed", left: menuPosition.left, top: menuPosition.top, zIndex: 60 }} className="w-[220px] rounded-2xl border border-slate-200 bg-white p-1 shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5"><span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Actions</span><button type="button" onClick={onCloseMenu} className="text-slate-400 hover:text-slate-700">×</button></div>{actions.map((item) => <button key={item.label} type="button" onClick={() => onAction(message, item.action)} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><span>{item.label}</span>{item.action === "star" && <span>{message.starred ? "★" : "☆"}</span>}{item.action === "pin" && <span>{message.pinned ? "📌" : "📍"}</span>}</button>)}</div>}
  </div></div>;
}
