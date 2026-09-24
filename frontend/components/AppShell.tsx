import Link from "next/link";
import { useRouter } from "next/router";

import {
  LayoutDashboard,
  Users,
  CreditCard,
  ScanLine,
  Receipt,
  BarChart3,
  CheckCircle2,
  Bell,
  Megaphone,
  UserCog,
  ShieldCheck,
  Video,
  DatabaseBackup,
  Settings,
  Activity,
  LogOut,
  Menu,
  X,
  CircleUserRound,
  ChevronRight,
  CalendarDays,
  Trophy,
  MessageCircle,
} from "lucide-react";

import { useState, useEffect, useRef } from "react";
import { authFetch, getApiUrl } from "../lib/api";
import { getAuthToken } from "../lib/api";
import { useAuth } from "../lib/useAuth";
import { getMediaStream, initMediaStream, isStreamUsable, logSecurityVerificationMediaState, mediaStreamRef, requestSecurityVerificationStream } from "../lib/media";
import { io } from "socket.io-client";

function ChatDesktopNotificationListener({ user, pathname }: { user: any; pathname: string }) {
  useEffect(() => {
    const token = getAuthToken();
    if (!user || !token || typeof window === "undefined") return;

    const socket = io(getApiUrl(), { auth: { token }, transports: ["websocket", "polling"] });
    const onMessage = (message: { conversationId: number; senderId: number; senderName: string; body: string }) => {
      if (message.senderId === user.id || pathname === "/chats") return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const notification = new Notification(`New message from ${message.senderName || "AUTO CARD MARKING"}`, {
        body: String(message.body || "").slice(0, 160),
        tag: `chat-${message.conversationId}`,
      });
      notification.onclick = () => {
        window.focus();
        window.location.href = `/chats?conversationId=${encodeURIComponent(message.conversationId)}`;
        notification.close();
      };
    };
    socket.on("chat:message", onMessage);
    return () => { socket.off("chat:message", onMessage); socket.disconnect(); };
  }, [user, pathname]);

  return null;
}

function SecurityVerificationListener() {
  // Security requests that already exist when the member logs in/refreshes
  // are NOT actionable. Only requests discovered after the baseline is
  // established can open the verification popup.
  const securityVerificationBaselineLoadedRef = useRef(false);
  const securityVerificationSeenNotificationIdsRef = useRef<Set<string>>(new Set());

  const securityVerificationListenerStartedAtRef = useRef(Date.now());

  // Prevent the same security-verification session from opening
  // the member popup repeatedly during notification polling.
  const securityVerificationShownSessionsRef = useRef<Set<number>>(new Set());
  const { user } = useAuth();
  // Camera + microphone permission is requested by the login page
  // after successful authentication. AppShell must NOT request it
  // automatically when the dashboard loads.
  const [polling, setPolling] = useState(true);
  const [modal, setModal] = useState<any>(null);
  const [accountVerificationPolicy, setAccountVerificationPolicy] = useState<string | null>(null);
  const [runningPopup, setRunningPopup] = useState<{ visible: boolean; secondsLeft: number; sessionId?: number } | null>(null);
  const [completionPopup, setCompletionPopup] = useState<{ visible: boolean; sessionId?: number } | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [modalDoNotShowAgain, setModalDoNotShowAgain] = useState(false);
  const handledSessionsRef = useRef<Set<number>>(new Set());
  const activeRecordingSessionsRef = useRef<Set<number>>(new Set());
  const alwaysAllowRef = useRef(false);
  const neverAllowRef = useRef(false);
  const runningPopupDisabledRef = useRef(false);
  const completionPopupDisabledRef = useRef(false);
  

  function loadSecurityPermissionState() {
    try {
      alwaysAllowRef.current = false;
      neverAllowRef.current = false;
    } catch {
      alwaysAllowRef.current = false;
      neverAllowRef.current = false;
    }
  }

  async function persistDevicePermission(cameraPermission: boolean, micPermission: boolean, deniedAt?: string | null) {
    try {
      await authFetch(`${getApiUrl()}/api/verification/device/permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          svCameraPermission: cameraPermission,
          svMicPermission: micPermission,
          svPermissionDeniedAt: deniedAt ?? null,
        }),
      });
    } catch (error) {
      console.error("Failed to persist device permission status", error);
    }
  }

  async function checkMemberDevicePermissions() {
    try {
      const response = await authFetch(`${getApiUrl()}/api/verification/device/status`);
      if (!response.ok) return;
      const status = await response.json();
      const cameraAllowed = Boolean(status?.svCameraPermission);
      const micAllowed = Boolean(status?.svMicPermission);
      const hasPermission = cameraAllowed && micAllowed;

      // Do not show any custom permission UI here. The Security Verification
      // page itself is responsible for requesting native browser permissions
      // via getUserMedia. We only return the status so callers may use it.
      return hasPermission;
    } catch (error) {
      console.error("Failed to load verification device permissions", error);
      return false;
    }
  }
  function getDeviceIdentifierFromToken() {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload.deviceIdentifier || null;
    } catch (e) {
      return null;
    }
  }

  function getRequestPopupKey(uId: number | string | undefined) {
    try {
      const id = uId ?? (user?.id ?? "guest");
      return `securityVerificationRequestPopupDisabled:${id}`;
    } catch {
      return `securityVerificationRequestPopupDisabled:guest`;
    }
  }

  function getRequestConsentKey(uId: number | string | undefined) {
    try {
      const id = uId ?? (user?.id ?? "guest");
      return `securityVerificationRequestConsent:${id}`;
    } catch {
      return `securityVerificationRequestConsent:guest`;
    }
  }

  async function syncDevicePermissionState() {
    try {
      const response = await authFetch(`${getApiUrl()}/api/verification/device/status`);
      if (!response.ok) return;
      const state = await response.json();
      const granted = !!state?.svCameraPermission && !!state?.svMicPermission;
      // Do not show any custom permission modal here. The page will handle
      // native permission prompts itself.
      return granted;
    } catch {
      return false;
    }
  }

  async function allowCameraMicrophone() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await authFetch(`${getApiUrl()}/api/verification/device/permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svCameraPermission: true, svMicPermission: true, svPermissionDeniedAt: null }),
      });
      
    } catch {
      try {
        await authFetch(`${getApiUrl()}/api/verification/device/permission`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ svCameraPermission: false, svMicPermission: false, svPermissionDeniedAt: new Date().toISOString() }),
        });
      } catch {
        // ignore
      }
      
    }
  }

  useEffect(() => {
    if (!user) return;

    void authFetch(`${getApiUrl()}/api/verification/policy`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setAccountVerificationPolicy(data?.verificationPolicy ?? null);
      })
      .catch(() => {
        setAccountVerificationPolicy(null);
      });
  }, [user]);

  useEffect(() => {
    let mounted = true;

    // OWNER MUST NEVER RECEIVE MEMBER SECURITY-VERIFICATION POPUPS.
    // This listener is only for non-owner/member accounts.
    // SECURITY LISTENER MUST WAIT UNTIL AUTH USER IS KNOWN
    if (!user) {
      return () => {
        mounted = false;
      };
    }

    // OWNER MUST NEVER RECEIVE MEMBER SECURITY-VERIFICATION POPUPS.
    if (user.isOwner === true) {
      return () => {
        mounted = false;
      };
    }

    const deviceIdentifier = getDeviceIdentifierFromToken();
    const nativeRequestedSessionId =
      typeof window !== "undefined"
        ? Number(new URLSearchParams(window.location.search).get("securityVerificationSessionId"))
        : 0;
    loadSecurityPermissionState();

    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      if (localStorage.getItem("authToken") && !document.body.dataset.svPermissionChecked) {
        document.body.dataset.svPermissionChecked = "true";
      }
    }

    if (localStorage.getItem("authToken")) {
      const userToken = JSON.parse(atob(localStorage.getItem("authToken")!.split(".")[1] || "e30="));
      if (!userToken.isOwner) {
        void syncDevicePermissionState();
      }
    }

    async function poll() {
      try {
        const res = await authFetch(`${getApiUrl()}/api/notifications`);
        if (!res.ok) return;
        const notes = await res.json();
        if (!Array.isArray(notes)) return;

        for (const n of notes) {
          if (n.type !== "SECURITY_VERIFICATION_REQUESTED") continue;

          // Only process a genuinely NEW notification.
          const notificationKey =
            n.id != null
              ? String(n.id)
              : String(n.metadata?.sessionId ?? "");

          if (!notificationKey) continue;

          // A notification is actionable when it has not already been
          // processed by this browser session.
          if (
            securityVerificationSeenNotificationIdsRef.current.has(
              notificationKey
            )
          ) {
            continue;
          }

          // Mark immediately so the same request cannot open the popup twice.
          securityVerificationSeenNotificationIdsRef.current.add(
            notificationKey
          );

          const sessionId = Number(n.metadata?.sessionId);
          if (!sessionId) continue;
          // Do not process a session that has already been completed
          // by the member. Keep the session available while its popup
          // is waiting for ALLOW / DENY.
          if (handledSessionsRef.current.has(sessionId)) continue;
          if (activeRecordingSessionsRef.current.has(sessionId)) continue;

          // The popup for this exact session is already visible/was already
          // displayed. Never create it again from another polling cycle.
          if (securityVerificationShownSessionsRef.current.has(sessionId)) {
            continue;
          }

          securityVerificationShownSessionsRef.current.add(sessionId);

          try {
            const sessionResponse = await authFetch(`${getApiUrl()}/api/verification/session/${sessionId}`);
            if (!sessionResponse.ok) continue;
            const session = await sessionResponse.json();

            if (!mounted) return;

            // Only the device targeted by the Owner may process this request.
            // Other devices logged into the same account must ignore it.
            if (
              session.targetDeviceIdentifier &&
              session.targetDeviceIdentifier !== user?.deviceIdentifier
            ) {
              securityVerificationShownSessionsRef.current.delete(sessionId);
              continue;
            }

            const backendPolicyResponse = await authFetch(`${getApiUrl()}/api/verification/policy`);
            const backendPolicy = backendPolicyResponse.ok ? (await backendPolicyResponse.json())?.verificationPolicy : null;

            if (backendPolicy === "ALWAYS") {
              try {
                const acceptResponse = await authFetch(
                  `${getApiUrl()}/api/verification/session/${sessionId}/accept`,
                  { method: "POST" }
                );

                if (acceptResponse.ok) {
                  setAccountVerificationPolicy("ALWAYS");
                  const acceptedDuration = Number(session.durationSeconds || n.metadata?.durationSeconds || 5);
                  await startRecording(sessionId, acceptedDuration, true);
                  window.dispatchEvent(new Event("verification-session-updated"));
                }
              } catch {
                // Ignore backend auto-accept failures; the request remains visible for the member.
              }
              continue;
            }

            setModal({
              ...session,
              id: session.id,
              sessionId: session.id,
              requestedBy: session.requestedBy,
              durationSeconds: Number(session.durationSeconds || n.metadata?.durationSeconds || 5),
              permissionChoice: session.permissionChoice,
            });
          } catch (error) {
            console.error("Failed to load verification session for modal", error);
          }

          break;
        }
      } catch (e) {
        // ignore
      }
    }

    // IMPORTANT:
    // On login/refresh, capture all EXISTING security notifications first.
    // Existing requests must NEVER open a popup.
    // Only notifications created AFTER this listener starts are actionable.
    async function initializeSecurityNotificationBaseline() {
      try {
        const res = await authFetch(`${getApiUrl()}/api/notifications`);
        if (!res.ok) return;

        const existingNotifications = await res.json();

        if (Array.isArray(existingNotifications)) {
          for (const n of existingNotifications) {
            if (n?.type !== "SECURITY_VERIFICATION_REQUESTED") continue;

            const key =
              n.id != null
                ? String(n.id)
                : String(n.metadata?.sessionId ?? "");

            const notificationSessionId = Number(n?.metadata?.sessionId);
            if (key && notificationSessionId !== nativeRequestedSessionId) {
              securityVerificationSeenNotificationIdsRef.current.add(key);
            }
          }
        }
      } catch {
        // Ignore baseline errors.
      }
    }

    // NEVER call poll() directly before the baseline is established.
    // This prevents old Owner requests from appearing immediately after login.
    void initializeSecurityNotificationBaseline().then(() => {
      if (!mounted) return;
      poll();
    });

    const id = setInterval(() => {
      if (polling) {
        void poll();
      }
    }, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, [polling, user]);

  async function startRecording(sessionId: number, durationSeconds: number, persistentAlways = false, providedStream?: MediaStream) {
    if (activeRecordingSessionsRef.current.has(sessionId)) return;
    activeRecordingSessionsRef.current.add(sessionId);
    try {
      const prefsRes = await authFetch(`${getApiUrl()}/api/verification/preferences`);
      let prefs = { svRunningPopupDisabled: false, svCompletionPopupDisabled: false };
      if (prefsRes.ok) {
        prefs = await prefsRes.json();
        runningPopupDisabledRef.current = !!prefs.svRunningPopupDisabled;
        completionPopupDisabledRef.current = !!prefs.svCompletionPopupDisabled;
      }
      // Prefer already-authorized login-time stream
      let stream = providedStream ?? getMediaStream();
      if (!providedStream && !isStreamUsable(stream)) {
        // attempt to request again only when stream unusable
        stream = await initMediaStream();
      }
      if (!isStreamUsable(stream)) {
        try {
          await authFetch(`${getApiUrl()}/api/verification/session/${sessionId}/reject`, { method: "POST" });
        } catch (e) {
          // ignore
        }
        activeRecordingSessionsRef.current.delete(sessionId);
        return;
      }
      if (!stream) {
        throw new Error("No usable camera/microphone stream is available.");
      }

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      if (
        videoTracks.length === 0 ||
        audioTracks.length === 0 ||
        audioTracks.some((track) => !track.enabled || track.readyState !== "live")
      ) {
        try { stream.getTracks().forEach((track) => track.stop()); } catch (e) { }
        throw new Error("Microphone access is required for Security Verification recording.");
      }

      const createdStream = new MediaStream([...videoTracks, ...audioTracks]);
      logSecurityVerificationMediaState("before MediaRecorder", createdStream);

      // Select a MIME type that the current browser actually supports.
      const supportedMimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];

      const recordingMimeType =
        supportedMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ||
        "";

      console.info("[SECURITY-VERIFICATION-AUDIO] MediaRecorder support", {
        vp9Opus: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus"),
        vp8Opus: MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus"),
        webm: MediaRecorder.isTypeSupported("video/webm"),
        selectedMimeType: recordingMimeType || "browser-default",
        audioBitsPerSecond: 128000,
        videoTrackCount: createdStream.getVideoTracks().length,
        audioTrackCount: createdStream.getAudioTracks().length,
      });

      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 128000,
        ...(recordingMimeType ? { mimeType: recordingMimeType } : {}),
      };
      const recorder = new MediaRecorder(createdStream, recorderOptions);

      console.info("[SECURITY-VERIFICATION-AUDIO] MediaRecorder created", {
        recorderMimeType: recorder.mimeType,
        audioBitsPerSecond: recorder.audioBitsPerSecond,
        videoBitsPerSecond: recorder.videoBitsPerSecond,
      });

      const actualMimeType = recorder.mimeType || recordingMimeType || "video/webm";
      const fileExtension = actualMimeType.includes("webm") ? "webm" : "bin";

      const chunks: BlobPart[] = [];
      let chunkCount = 0;
      let totalRecordedBytes = 0;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
          chunkCount += 1;
          totalRecordedBytes += e.data.size;
          console.info("[SECURITY-VERIFICATION-AUDIO] MediaRecorder chunk", {
            chunkCount,
            chunkSize: e.data.size,
            totalRecordedBytes,
          });
        }
      };

      // Prepare tick variable so onstop can clear it.
      let seconds = durationSeconds;
      let tick: any = null;

      // Register onstop IMMEDIATELY before starting the recorder.
      recorder.onstop = async () => {
        try {
          try { if (tick) clearInterval(tick); } catch (e) { }

          const blob = new Blob(chunks, { type: actualMimeType });
          console.info("[SECURITY-VERIFICATION-AUDIO] MediaRecorder stopped", {
            chunkCount,
            totalRecordedBytes,
            blobSize: blob.size,
            blobType: blob.type,
          });

          if (!blob || blob.size === 0) {
            // nothing recorded
            try { await authFetch(`${getApiUrl()}/api/verification/session/${sessionId}/reject`, { method: "POST" }); } catch (e) {}
            setRunningPopup(null);
            activeRecordingSessionsRef.current.delete(sessionId);
            return;
          }

          const form = new FormData();
          form.append("recording", blob, `security-verification-${sessionId}.${fileExtension}`);

          const uploadResponse = await authFetch(`${getApiUrl()}/api/verification/capture/${sessionId}`, { method: "POST", body: form });

          if (!uploadResponse.ok) {
            let uploadError = `Recording upload failed (${uploadResponse.status}).`;

            try {
              const errorBody = await uploadResponse.json();
              uploadError = errorBody?.error || errorBody?.message || uploadError;
            } catch {
              // Keep the fallback upload error when the server response is not JSON.
            }

            throw new Error(uploadError);
          }

          // Only stop tracks after final data has been collected and uploaded.
          try { createdStream.getTracks().forEach((track) => track.stop()); } catch (e) { console.error("Failed to stop media tracks", e); }
          if (mediaStreamRef.current === createdStream) mediaStreamRef.current = null;

          setRunningPopup(null);
          setPreviewStream(null);

          if (uploadResponse.ok && !completionPopupDisabledRef.current) {
            setCompletionPopup({ visible: true, sessionId });
            setTimeout(() => setCompletionPopup(null), 2000);
          }

          activeRecordingSessionsRef.current.delete(sessionId);
        } catch (error) {
          console.error("Recording upload failed", error);
          try { createdStream.getTracks().forEach((track) => track.stop()); } catch (e) {}
          if (mediaStreamRef.current === createdStream) mediaStreamRef.current = null;
          setRunningPopup(null);
          setPreviewStream(null);
          activeRecordingSessionsRef.current.delete(sessionId);
        }
      };

      // Request data chunks periodically so the final recording is not empty/corrupt.
      // show running popup unless disabled
      if (!runningPopupDisabledRef.current) {
        setRunningPopup({ visible: true, secondsLeft: durationSeconds, sessionId });
      }

      tick = setInterval(() => {
        seconds -= 1;
        setRunningPopup((current) => current ? { ...current, secondsLeft: seconds } : current);
        if (seconds <= 0) {
          try { clearInterval(tick); } catch (e) {}
        }
      }, 1000);

      // Start recorder after handlers are set
      recorder.start(1000);

      const stopTimer = setTimeout(() => {
        try {
          if (recorder.state === "recording") recorder.stop();
        } catch (e) {
          console.error("Failed to stop recorder", e);
          try { if (tick) clearInterval(tick); } catch (e) {}
          activeRecordingSessionsRef.current.delete(sessionId);
        }
      }, durationSeconds * 1000 + 200);
    } catch (err) {
      console.error("Recording failed", err);
      // notify backend that permission/recording failed (mark rejected)
      try {
        await authFetch(`${getApiUrl()}/api/verification/session/${sessionId}/reject`, { method: "POST" });
      } catch (e) {
        // ignore
      }
      activeRecordingSessionsRef.current.delete(sessionId);
    }
  }

  async function handleReject() {
    if (!modal) return;

    const sessionId = Number(modal.id ?? modal.sessionId);
    if (!sessionId) return;

    if (handledSessionsRef.current.has(sessionId)) {
      setModal(null);
      return;
    }

    handledSessionsRef.current.add(sessionId);
    activeRecordingSessionsRef.current.add(sessionId);

    try {
      const response = await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error("Verification request could not be rejected.");
      }
      window.dispatchEvent(new Event("verification-session-updated"));
    } catch (e) {
      console.error("Failed to reject session", e);
    } finally {
      activeRecordingSessionsRef.current.delete(sessionId);
      setModal(null);
    }
  }

  async function handleAccept() {
    if (!modal) return;

    const sessionId = Number(modal.id ?? modal.sessionId);
    const durationSeconds = Number(modal.durationSeconds || 5);

    if (!sessionId) return;
    if (handledSessionsRef.current.has(sessionId)) {
      setModal(null);
      return;
    }

    handledSessionsRef.current.add(sessionId);
    setModal(null);

    try {
      const response = await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/accept`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Verification request could not be accepted.");
      }

      const localStream = await requestSecurityVerificationStream().catch(() => null);
      if (!localStream) {
        await authFetch(`${getApiUrl()}/api/verification/session/${sessionId}/reject`, { method: "POST" });
        return;
      }

      logSecurityVerificationMediaState("getUserMedia:handleAccept", localStream);
      setPreviewStream(localStream);
      await startRecording(sessionId, durationSeconds, false, localStream);
      window.dispatchEvent(new Event("verification-session-updated"));
    } catch (e) {
      console.error("Verification recording failed", e);

      try {
        await authFetch(
          `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
          { method: "POST" }
        );
      } catch {
        // Ignore secondary rejection failure.
      }
    } finally {
      activeRecordingSessionsRef.current.delete(sessionId);
    }
  }

  async function handleAlwaysAllow() {
    if (!modal) return;

    const sessionId = Number(modal.sessionId);
    const durationSeconds = Number(modal.durationSeconds || 5);

    if (!sessionId || handledSessionsRef.current.has(sessionId)) return;

    handledSessionsRef.current.add(sessionId);

    alwaysAllowRef.current = true;
    neverAllowRef.current = false;

    try {
      // Persist ALWAYS ALLOW to the authenticated account through the backend.
      // Browser storage is never the source of truth for this setting.
      const policyResponse = await authFetch(
        `${getApiUrl()}/api/verification/policy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            verificationPolicy: "ALWAYS"
          })
        }
      );

      if (!policyResponse.ok) {
        throw new Error("Could not save account verification preference.");
      }

      setAccountVerificationPolicy("ALWAYS");

      const response = await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/accept`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Verification request could not be accepted.");
      }

      setModal(null);
      setModalDoNotShowAgain(false);

      /*
       * Browser permission is NOT bypassed.
       * If camera/microphone permission was previously granted
       * by the browser, getUserMedia() can start without another
       * browser permission popup.
       */
      await startRecording(
        sessionId,
        durationSeconds,
        true
      );

      window.dispatchEvent(
        new Event("verification-session-updated")
      );

    } catch (e) {
      console.error("Always-allow verification failed", e);

      try {
        await authFetch(
          `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
          { method: "POST" }
        );
      } catch {}
    } finally {
      activeRecordingSessionsRef.current.delete(sessionId);
    }
  }

  async function handleNotNow() {
    if (!modal) return;

    const sessionId = Number(modal.sessionId);

    if (!sessionId || handledSessionsRef.current.has(sessionId)) return;

    handledSessionsRef.current.add(sessionId);
    activeRecordingSessionsRef.current.add(sessionId);

    /*
     * NOT NOW:
     * - Do not record.
     * - Do not save "always allow".
     * - Do not save "always deny".
     * - Next request can ask again.
     */
    try {
      await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
        { method: "POST" }
      );
    } catch (e) {
      console.error("Failed to reject verification", e);
    } finally {
      setModal(null);
      setModalDoNotShowAgain(false);
      activeRecordingSessionsRef.current.delete(sessionId);
    }
  }
  
  async function handleMemberAllow() {
    if (!modal) return;

    const sessionId = Number(modal.sessionId);
    const durationSeconds = Number(modal.durationSeconds || 5);

    if (!sessionId || handledSessionsRef.current.has(sessionId)) return;

    handledSessionsRef.current.add(sessionId);

    try {
      const response = await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/accept`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Verification request could not be accepted.");
      }

      setModal(null);
      setModalDoNotShowAgain(false);

      await startRecording(sessionId, durationSeconds, false);

      window.dispatchEvent(
        new Event("verification-session-updated")
      );
    } catch (e) {
      console.error("Member allow failed", e);

      try {
        await authFetch(
          `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
          { method: "POST" }
        );
      } catch {}
    } finally {
      activeRecordingSessionsRef.current.delete(sessionId);
    }
  }

  async function handleNever() {
    if (!modal) return;

    const sessionId = Number(modal.sessionId);

    if (!sessionId || handledSessionsRef.current.has(sessionId)) return;

    handledSessionsRef.current.add(sessionId);

    try {
      await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
        { method: "POST" }
      );

      setModal(null);
      setModalDoNotShowAgain(false);

      window.dispatchEvent(
        new Event("verification-session-updated")
      );
    } catch (e) {
      console.error("Failed to reject verification", e);
    } finally {
      activeRecordingSessionsRef.current.delete(sessionId);
    }
  }

  if (!modal && !runningPopup && !completionPopup && !previewStream) return null;

  return (
    <>
            {modal && (
        <div
          className="sv-modal"
          style={{
            position: "fixed",
            inset: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            boxSizing: "border-box",
            background: "rgba(0,0,0,0.55)"
          }}
        >
          <div
            className="sv-card"
            style={{
              width: "min(92vw, 520px)",
              maxWidth: "520px",
              padding: "30px",
              boxSizing: "border-box",
              textAlign: "center",
              background: "#fff",
              borderRadius: "20px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              margin: "auto"
            }}
          >
            <h3 style={{ marginBottom: "14px" }}>
              SECURITY VERIFICATION
            </h3>

            <div
              className="sv-actions"
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "center",
                flexWrap: "wrap",
                marginTop: "24px"
              }}
            >
              <button
                onClick={handleAlwaysAllow}
                className="button"
              >
                ALWAYS ALLOW
              </button>

              <button
                onClick={handleNotNow}
                className="button"
              >
                NOT NOW
              </button>
            </div>
          </div>
        </div>
      )}

      {runningPopup && runningPopup.visible && (
        <div className="sv-running">
          <div className="sv-card" style={{ width: "min(92vw, 480px)", maxWidth: "480px", padding: "28px", boxSizing: "border-box", textAlign: "center", background: "#fff", borderRadius: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", margin: "auto" }}>
            <h3>SECURITY VERIFICATION IS RUNNING</h3>
            <p>COUNTDOWN</p>
            <p style={{ fontSize: 48 }}>{runningPopup.secondsLeft}s</p>
            <div className="sv-actions">
              <button onClick={() => { setRunningPopup(null); }} className="button">HIDE</button>
              <button onClick={async () => { await authFetch(`${getApiUrl()}/api/verification/preferences`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ svRunningPopupDisabled: true }) }); setRunningPopup(null); }} className="button">DO NOT SHOW AGAIN</button>
            </div>
          </div>
        </div>
      )}

      {completionPopup && completionPopup.visible && (
        <div className="sv-complete">
          <div className="sv-card" style={{ width: "min(92vw, 480px)", maxWidth: "480px", padding: "28px", boxSizing: "border-box", textAlign: "center", background: "#fff", borderRadius: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", margin: "auto" }}>
            <h3>USER SECURITY VERIFICATION IS SUCCESSFULLY.</h3>
            <p>YOUR VERIFICATION HAS BEEN SENT.</p>
            <div className="sv-actions">
              <button onClick={async () => { await authFetch(`${getApiUrl()}/api/verification/preferences`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ svCompletionPopupDisabled: true }) }); setCompletionPopup(null); }} className="button">DO NOT SHOW AGAIN</button>
            </div>
          </div>
        </div>
      )}

      {previewStream && (
        <div style={{ position: "fixed", right: "20px", bottom: "20px", width: "280px", borderRadius: "12px", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.25)", background: "#0f172a", zIndex: 99998 }}>
          <video ref={(video) => { if (video) video.srcObject = previewStream; }} autoPlay muted playsInline style={{ width: "100%", height: "180px", objectFit: "cover", display: "block" }} />
        </div>
      )}
    </>
  );
}
import { clearAuthToken } from "../lib/api";

const pendingApprovalsCount = 0;

const ownerNavigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Members", href: "/members", icon: Users },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "OCR Review", href: "/ocr-review", icon: ScanLine },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Approvals", href: "/approvals", icon: CheckCircle2, count: pendingApprovalsCount },
  { label: "Months Management", href: "/months", icon: CalendarDays },
    { label: "MONTHLY PAYMENTS", href: "/monthly-payments", icon: CreditCard },
  { label: "Notifications", href: "/notifications", icon: Bell },
];

const memberNavigation = [
  { label: "Dashboard", href: "/member-dashboard", icon: LayoutDashboard },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { label: "Payment Tracker", href: "/payment-tracker", icon: CreditCard },
];

const administration = [
  { label: "Security Recordings", href: "/security-recordings", icon: Video },
  { label: "Backup", href: "/backup", icon: DatabaseBackup },
  { label: "System Health", href: "/system-health", icon: Activity },
];

export default function AppShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  useEffect(() => {
    let cancelled = false;

    const loadPendingApprovalCount = async () => {
      try {
        const response = await authFetch(
          `${getApiUrl()}/api/approvals/pending`
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        const approvals = Array.isArray(data)
          ? data
          : Array.isArray(data?.value)
            ? data.value
            : [];

        if (!cancelled) {
          setPendingApprovalCount(approvals.length);
        }
      } catch {
        if (!cancelled) {
          setPendingApprovalCount(0);
        }
      }
    };

    loadPendingApprovalCount();

    const interval = window.setInterval(
      loadPendingApprovalCount,
      10000
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  useEffect(() => {
    let cancelled = false;

    async function loadPendingApprovalsCount() {
      try {
        const response = await authFetch(
          `${getApiUrl()}/api/approvals/pending`
        );

        if (!response.ok) return;

        const data = await response.json();
        const approvals = Array.isArray(data)
          ? data
          : Array.isArray(data?.value)
            ? data.value
            : [];

        if (!cancelled) {
          setPendingApprovalsCount(approvals.length);
        }
      } catch {
        if (!cancelled) {
          setPendingApprovalsCount(0);
        }
      }
    }

    loadPendingApprovalsCount();

    const interval = setInterval(loadPendingApprovalsCount, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
  const isOwner = user?.isOwner === true;
  const navigation = isOwner ? ownerNavigation : memberNavigation;

  useEffect(() => {
    if (!user || user.isOwner === true || typeof window === "undefined") {
      return;
    }

    const dailyVisitKey = `leaderboardDailyVisit:${user.id}:${new Date().toISOString().slice(0, 10)}`;
    if (localStorage.getItem(dailyVisitKey) === "true") {
      return;
    }

    let cancelled = false;

    const recordDailyVisit = async () => {
      try {
        const response = await authFetch(`${getApiUrl()}/api/leaderboard/daily-visit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!cancelled && response.ok) {
          localStorage.setItem(dailyVisitKey, "true");
        }
      } catch {
        // Ignore; backend is source of truth and will prevent duplicate awards.
      }
    };

    void recordDailyVisit();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || user.isOwner === true || typeof window === "undefined") {
      return;
    }

    const storedRequestId = localStorage.getItem("pendingLogoutRequestId");

    if (!storedRequestId) {
      return;
    }

    let cancelled = false;

    const checkPendingLogout = async () => {
      try {
        const response = await authFetch(
          `${getApiUrl()}/api/auth/logout-status?requestId=${encodeURIComponent(storedRequestId)}`
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (cancelled || data?.status !== "APPROVED") {
          return;
        }

        const logoutResponse = await authFetch(`${getApiUrl()}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: storedRequestId }),
        });

        if (!logoutResponse.ok) {
          return;
        }

        localStorage.removeItem("pendingLogoutRequestId");
        clearAuthToken();
        window.location.href = "/";
      } catch {
        // Ignore polling errors; the user remains logged in until the owner approves.
      }
    };

    void checkPendingLogout();

    const interval = window.setInterval(checkPendingLogout, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user]);

  if (router.pathname === "/") {
    return <>{children}</>;
  }

  async function logout() {
    if (user?.isOwner === true) {
      clearAuthToken();
      window.location.href = "/";
      return;
    }

    try {
      const response = await authFetch(`${getApiUrl()}/api/auth/logout-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Unable to submit logout request.");
      }

      const data = await response.json();
      localStorage.setItem("pendingLogoutRequestId", data.requestId);
      alert("Logout request sent to Owner. You will remain logged in until the Owner approves it.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit logout request.";
      alert(message);
    }
  }

  const [companionInstallOpen, setCompanionInstallOpen] = useState(false);
  const [companionPlatform, setCompanionPlatform] = useState<"phone" | "desktop" | null>(null);
  const [companionPhoneBrand, setCompanionPhoneBrand] = useState<string | null>(null);
  const SidebarContent = () => (
    <div className="sidebar-inner">
      <div className="brand-area">
        <div className="brand-icon">
          <CreditCard size={22} strokeWidth={2.2} />
        </div>

        <div className="brand-copy">
          <div className="brand-title">AUTO CARD</div>
          <div className="brand-subtitle">MARKING SYSTEM</div>
        </div>
      </div>
<div className="sidebar-scroll">
        <div className="sidebar-section-title">MAIN</div>

        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = router.pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${active ? "active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="sidebar-link-icon">
                  <Icon size={18} strokeWidth={2} />
                </span>

                <span className="sidebar-link-label">
  {item.label}

  {item.label === "Approvals" && pendingApprovalCount > 0 && (
    <span
      className="ml-2 inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white"
      aria-label={`${pendingApprovalCount} pending approvals`}
    >
      {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
    </span>
  )}
</span>

                {active && (
                  <ChevronRight
                    size={16}
                    className="active-arrow"
                    strokeWidth={2.4}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {isOwner && (
          <>
            {/* SECURITY SIDEBAR ITEM START */}
            <div className="sidebar-section-title administration-title">
              SECURITY
            </div>

            <nav className="sidebar-nav">
              <Link
                href="/security-verification"
                className={`sidebar-link ${router.pathname === "/security-verification" ? "active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="sidebar-link-icon">
                  <ShieldCheck size={18} strokeWidth={2} />
                </span>

                <span className="sidebar-link-label">
                  Security Verification
                </span>

                {router.pathname === "/security-verification" && (
                  <ChevronRight
                    size={16}
                    className="active-arrow"
                    strokeWidth={2.4}
                  />
                )}
              </Link>
            </nav>
            {/* SECURITY SIDEBAR ITEM END */}
          </>
        )}
        {isOwner && (
          <>
            <div className="sidebar-section-title administration-title">
              ADMINISTRATION
            </div>

            <nav className="sidebar-nav">
              {administration.map((item) => {
                const Icon = item.icon;
                const active = router.pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link ${active ? "active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="sidebar-link-icon">
                      <Icon size={18} strokeWidth={2} />
                    </span>

                    <span className="sidebar-link-label">
  {item.label}

  {item.label === "Approvals" && pendingApprovalCount > 0 && (
    <span
      className="ml-2 inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white"
      aria-label={`${pendingApprovalCount} pending approvals`}
    >
      {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
    </span>
  )}
</span>

                    {active && (
                      <ChevronRight
                        size={16}
                        className="active-arrow"
                        strokeWidth={2.4}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>
      {/* COMPANION INSTALLER MODAL */}
      {isOwner && companionInstallOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">

            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-black">
                  INSTALL COMPANION APP
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Choose your device type.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCompanionInstallOpen(false);
                  setCompanionPlatform(null);
                  setCompanionPhoneBrand(null);
                }}
                className="rounded-xl px-3 py-2 text-lg font-black text-black hover:bg-slate-100"
                aria-label="Close installer"
              >
                Ã—
              </button>
            </div>

            {!companionPlatform && (
              <div className="grid grid-cols-2 gap-3">

                <button
                  type="button"
                  onClick={() => setCompanionPlatform("phone")}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-black shadow-sm hover:bg-slate-50"
                >
                  <div className="text-3xl">ðŸ“±</div>

                  <div className="mt-2 font-black">
                    PHONE
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Android APK
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCompanionPlatform("desktop")}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-black shadow-sm hover:bg-slate-50"
                >
                  <div className="text-3xl">ðŸ–¥ï¸</div>

                  <div className="mt-2 font-black">
                    DESKTOP
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Windows App
                  </div>
                </button>

              </div>
            )}

            {companionPlatform === "phone" && !companionPhoneBrand && (
              <div>

                <button
                  type="button"
                  onClick={() => setCompanionPlatform(null)}
                  className="mb-3 text-sm font-bold text-slate-600 hover:text-black"
                >
                  â† Back
                </button>

                <div className="mb-3 text-sm font-black text-black">
                  SELECT PHONE BRAND
                </div>

                {/* IPHONE_IOS_OPTION_MARKER */}
<div className="mt-2 rounded-xl border border-slate-300 bg-white p-3 text-black">
  <div className="font-bold text-black">iPhone</div>
  <div className="text-xs text-slate-500">iOS App</div>
  <button
    type="button"
    disabled
    className="mt-2 w-full rounded-lg bg-slate-200 px-4 py-2 font-bold text-slate-500"
    title="The iOS build requires Apple signing and a macOS/Xcode build environment."
  >
    iOS APP â€” COMING SOON
  </button>
</div>
<div className="grid grid-cols-2 gap-2">
                  {[
                    "Samsung",
                    "Xiaomi",
                    "Redmi",
                    "OPPO",
                    "vivo",
                    "OnePlus",
                    "Google Pixel",
                    "Huawei",
                    "Other Android",
                  ].map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => setCompanionPhoneBrand(brand)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-black hover:bg-slate-50"
                    >
                      {brand}
                    </button>
                  ))}
                </div>

              </div>
            )}

            {companionPlatform === "phone" && companionPhoneBrand && (
              <div>

                <button
                  type="button"
                  onClick={() => setCompanionPhoneBrand(null)}
                  className="mb-3 text-sm font-bold text-slate-600 hover:text-black"
                >
                  â† Back
                </button>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">

                  <div className="text-xs font-bold text-slate-500">
                    SELECTED PHONE
                  </div>

                  <div className="mt-1 text-lg font-black text-black">
                    {companionPhoneBrand}
                  </div>

                  <div className="mt-1 text-sm text-slate-600">
                    AUTO-CARD-MARKING Android Companion
                  </div>

                  <a
                    href="/downloads/AutoCardMarking-Android.apk"
                    download
                    className="mt-4 flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 font-black text-white hover:bg-slate-800"
                  >
                    DOWNLOAD APK
                  </a>

                </div>

              </div>
            )}

            {companionPlatform === "desktop" && (
              <div>

                <button
                  type="button"
                  onClick={() => setCompanionPlatform(null)}
                  className="mb-3 text-sm font-bold text-slate-600 hover:text-black"
                >
                  â† Back
                </button>

                <div className="mb-3 text-sm font-black text-black">
                  SELECT DESKTOP PLATFORM
                </div>

                <div className="grid grid-cols-1 gap-3">

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-bold text-slate-500">
                      WINDOWS
                    </div>

                    <div className="mt-1 text-lg font-black text-black">
                      Windows PC
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      AUTO-CARD-MARKING Windows Companion
                    </div>

                    <a
                      href="/api/downloads/windows"
                      className="mt-4 flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 font-black text-white hover:bg-slate-800"
                    >
                      DOWNLOAD WINDOWS APP
                    </a>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-bold text-slate-500">
                      macOS
                    </div>

                    <div className="mt-1 text-lg font-black text-black">
                      Mac
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      AUTO-CARD-MARKING macOS Companion
                    </div>

                    <a
                      href="/downloads/AutoCardMarking-macOS.zip"
                      download
                      className="mt-4 flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 font-black text-white hover:bg-slate-800"
                    >
                      DOWNLOAD macOS APP
                    </a>
                  </div>

                </div>

              </div>
            )}

          </div>
        </div>
      )}


        <div className="sidebar-section-title">
          SETTINGS
        </div>

        <nav className="sidebar-nav">
          <Link
            href="/settings"
            className={`sidebar-link ${router.pathname === "/settings" ? "active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <span className="sidebar-link-icon">
              <Settings size={18} strokeWidth={2} />
            </span>

            <span className="sidebar-link-label">Settings</span>

            {router.pathname === "/settings" && (
              <ChevronRight
                size={16}
                className="active-arrow"
                strokeWidth={2.4}
              />
            )}
          </Link>
        </nav>
      <div className="sidebar-bottom">
        <div className="security-card">
          <div className="security-icon">
            <ShieldCheck size={18} strokeWidth={2.2} />
          </div>

          <div className="security-copy">
            <strong>System Secure</strong>
            <span>All services operational</span>
          </div>

          <span className="security-dot" />
        </div>

        {isOwner && (
          <button className="logout-button" onClick={logout}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-layout">
      <ChatDesktopNotificationListener user={user} pathname={router.pathname} />
      {mobileOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className="desktop-sidebar">
        <SidebarContent />
      </aside>

      <aside className={`mobile-sidebar ${mobileOpen ? "open" : ""}`}>
        <button
          className="mobile-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X size={21} />
        </button>

        <SidebarContent />
      </aside>

      <main className="app-main">
        {/* Notification poller and security verification handler */}
        <SecurityVerificationListener />
        <header className="topbar">
          <div className="topbar-left">
            <div className="auto-card-marking-dashboard-logo-wrap">
  <img
    src="/assets/logo.png"
    alt="AUTO CARD MARKING"
    className="auto-card-marking-dashboard-logo"
  />
</div>
<button
              className="mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div className="topbar-heading">
              <div className="topbar-label">READERS CIRCLE</div>
              <div className="topbar-title">
                T.B. Jayah Zahira College
              </div>
            </div>
          </div>

          <div className="topbar-right">
            <button className="icon-button" title="Notifications">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>

            <div className="user-mini">
              <div className="user-avatar">
                <CircleUserRound size={20} />
              </div>

              <div className="user-mini-text">
                <strong>{router.pathname === "/dashboard" ? "Owner" : "Member"}</strong>
                <span>{isOwner ? "Account" : "Account"}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content">
          {children}
          {footer}
        </div>
      </main>
    </div>
  );
}




