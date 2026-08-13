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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { authFetch, getApiUrl } from "../lib/api";
import { getMediaStream, initMediaStream, isStreamUsable, mediaStreamRef } from "../lib/media";

function SecurityVerificationListener() {
  const [polling, setPolling] = useState(true);
  const [modal, setModal] = useState<any>(null);
  const [runningPopup, setRunningPopup] = useState<{ visible: boolean; secondsLeft: number; sessionId?: number } | null>(null);
  const [completionPopup, setCompletionPopup] = useState<{ visible: boolean; sessionId?: number } | null>(null);
  const handledSessionsRef = useRef<Set<number>>(new Set());
  const activeRecordingSessionsRef = useRef<Set<number>>(new Set());
  const alwaysAllowRef = useRef(false);
  const neverAllowRef = useRef(false);
  const runningPopupDisabledRef = useRef(false);
  const completionPopupDisabledRef = useRef(false);
  

  function loadSecurityPermissionState() {
    try {
      alwaysAllowRef.current = localStorage.getItem("securityVerificationAlwaysAllow") === "true";
      neverAllowRef.current = localStorage.getItem("securityVerificationNeverAllow") === "true";
    } catch {
      alwaysAllowRef.current = false;
      neverAllowRef.current = false;
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

  useEffect(() => {
    let mounted = true;
    const deviceIdentifier = getDeviceIdentifierFromToken();
    loadSecurityPermissionState();

    async function poll() {
      try {
        const res = await authFetch(`${getApiUrl()}/api/notifications`);
        if (!res.ok) return;
        const notes = await res.json();
        if (!Array.isArray(notes)) return;
        for (const n of notes) {
          if (
            n.type === "SECURITY_VERIFICATION_REQUESTED" &&
            n.metadata?.targetDeviceIdentifier &&
            n.metadata.targetDeviceIdentifier === deviceIdentifier
          ) {
            const sessionId = Number(n.metadata.sessionId);

            if (!sessionId) continue;

            // The same verification request must NEVER be shown twice.
            if (handledSessionsRef.current.has(sessionId)) {
              continue;
            }

            // Do not open another modal while this request is being processed.
            if (activeRecordingSessionsRef.current.has(sessionId)) {
              continue;
            }

            if (mounted) {
              const alwaysAllow =
                localStorage.getItem("securityVerificationAlwaysAllow") === "true";

              const neverAllow =
                localStorage.getItem("securityVerificationNeverAllow") === "true";

              const durationSeconds = Number(n.metadata.durationSeconds || 5);

              // ALWAYS ALLOW:
              // Never show the choice popup again.
              // Accept and start recording directly.
              if (alwaysAllow) {
                if (!handledSessionsRef.current.has(sessionId) &&
                    !activeRecordingSessionsRef.current.has(sessionId)) {

                  handledSessionsRef.current.add(sessionId);

                  void (async () => {
                    try {
                      const response = await authFetch(
                        `${getApiUrl()}/api/verification/session/${sessionId}/accept`,
                        { method: "POST" }
                      );

                      if (!response.ok) {
                        throw new Error("Automatic verification acceptance failed.");
                      }

                      await startRecording(sessionId, durationSeconds, true);
                    } catch (e) {
                      console.error("Automatic verification failed", e);
                      try {
                        await authFetch(
                          `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
                          { method: "POST" }
                        );
                      } catch {}
                    } finally {
                      activeRecordingSessionsRef.current.delete(sessionId);
                    }
                  })();
                }

                break;
              }

              // NEVER is intentionally NOT permanent.
              // The next new Owner request will ask again.
              // Therefore we must NOT silently reject future requests here.

              setModal((current: any) => {
                if (current?.sessionId === sessionId) {
                  return current;
                }

                return {
                  sessionId,
                  durationSeconds,
                };
              });
            }

            break;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    poll();
    const id = setInterval(() => { if (polling) poll(); }, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, [polling]);

  async function startRecording(sessionId: number, durationSeconds: number, persistentAlways = false) {
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
      let stream = getMediaStream();
      if (!isStreamUsable(stream)) {
        // attempt to request again only when stream unusable
        stream = await initMediaStream();
      }
      if (!isStreamUsable(stream)) {
        // cannot obtain stream -> reject session and notify owner
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

      const createdStream: MediaStream = stream;

      // Select a MIME type that the current browser actually supports.
      const supportedMimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];

      const recordingMimeType =
        supportedMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ||
        "";

      const recorder = recordingMimeType
        ? new MediaRecorder(createdStream, { mimeType: recordingMimeType })
        : new MediaRecorder(createdStream);

      const actualMimeType = recorder.mimeType || recordingMimeType || "video/webm";
      const fileExtension = actualMimeType.includes("webm") ? "webm" : "bin";

      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
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

          // Only stop tracks after final data has been collected and uploaded.
          try { createdStream.getTracks().forEach((track) => track.stop()); } catch (e) { console.error("Failed to stop media tracks", e); }
          if (mediaStreamRef.current === createdStream) mediaStreamRef.current = null;

          setRunningPopup(null);

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

  async function handleDeny() {
    if (!modal) return;

    const sessionId = Number(modal.sessionId);

    // This request has already been handled.
    if (handledSessionsRef.current.has(sessionId)) {
      setModal(null);
      return;
    }

    handledSessionsRef.current.add(sessionId);
    activeRecordingSessionsRef.current.add(sessionId);

    try {
      await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
        { method: "POST" }
      );
    } catch (e) {
      console.error("Failed to reject session", e);
    } finally {
      activeRecordingSessionsRef.current.delete(sessionId);
      setModal(null);
    }
  }

  async function handleAllow() {
    if (!modal) return;

    const sessionId = Number(modal.sessionId);
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

      await startRecording(sessionId, durationSeconds, false);
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
      localStorage.setItem("securityVerificationAlwaysAllow", "true");
      localStorage.removeItem("securityVerificationNeverAllow");

      const response = await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/accept`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Verification request could not be accepted.");
      }

      setModal(null);
      await startRecording(sessionId, durationSeconds, true);
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

  async function handleThisTimeAllow() {
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
      await startRecording(sessionId, durationSeconds, false);
    } catch (e) {
      console.error("This-time verification failed", e);
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
    activeRecordingSessionsRef.current.add(sessionId);
    neverAllowRef.current = true;
    alwaysAllowRef.current = false;

    try {
      localStorage.setItem("securityVerificationNeverAllow", "true");
      localStorage.removeItem("securityVerificationAlwaysAllow");

      await authFetch(
        `${getApiUrl()}/api/verification/session/${sessionId}/reject`,
        { method: "POST" }
      );
    } catch (e) {
      console.error("Failed to reject verification", e);
    } finally {
      activeRecordingSessionsRef.current.delete(sessionId);
      setModal(null);
    }
  }
  if (!modal && !runningPopup && !completionPopup) return null;

  return (
    <>
      {modal && (
        <div className="sv-modal" style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box", background: "rgba(0,0,0,0.45)" }}>
          <div className="sv-card" style={{ width: "min(92vw, 480px)", maxWidth: "480px", padding: "28px", boxSizing: "border-box", textAlign: "center", background: "#fff", borderRadius: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", margin: "auto" }}>
            <h3>SECURITY VERIFICATION REQUEST</h3>
            <p>System Owner is requesting security verification from this device.</p>
            <p>Requested recording duration: <strong>{modal.durationSeconds}s</strong></p>
            <div
              className="sv-actions"
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "center",
                flexWrap: "wrap",
                marginTop: "20px"
              }}
            >
              <button
                onClick={handleAlwaysAllow}
                className="button"
              >
                ALWAYS ALLOW
              </button>

              <button
                onClick={handleThisTimeAllow}
                className="button"
              >
                ALLOW THIS TIME
              </button>

              <button
                onClick={handleNever}
                className="button"
              >
                NEVER
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
    </>
  );
}
import { clearAuthToken } from "../lib/api";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Members", href: "/members", icon: Users },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Card Processing", href: "/card-processing", icon: ScanLine },
  { label: "OCR Review", href: "/ocr-review", icon: ScanLine },
  { label: "Receipts", href: "/receipts", icon: Receipt },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Approvals", href: "/approvals", icon: CheckCircle2 },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Announcements", href: "/announcements", icon: Megaphone },
];

const administration = [
  { label: "Users", href: "/users", icon: UserCog },
  { label: "Security", href: "/security", icon: ShieldCheck },
  { label: "Security Verification", href: "/security-verification", icon: ShieldCheck },
  { label: "Security Recordings", href: "/security-recordings", icon: Video },
  { label: "Backup", href: "/backup", icon: DatabaseBackup },
  { label: "System Health", href: "/system-health", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (router.pathname === "/") {
    return <>{children}</>;
  }

  function logout() {
    clearAuthToken();
    window.location.href = "/";
  }

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

                <span className="sidebar-link-label">{item.label}</span>

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

                <span className="sidebar-link-label">{item.label}</span>

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
      </div>

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

        <button className="logout-button" onClick={logout}>
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-layout">
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
                <strong>Administrator</strong>
                <span>Management</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}








