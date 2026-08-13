import { useEffect, useMemo, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

const verificationOptions = [
  { value: "ALWAYS", label: "Always require camera/microphone verification" },
  { value: "AT_THIS_TIME", label: "Request verification at login time only" },
  { value: "NO", label: "Do not request camera/microphone verification" },
];

export default function SecurityVerification() {
  const [user, setUser] = useState<any>(null);
  const [policy, setPolicy] = useState("AT_THIS_TIME");
  const [sessions, setSessions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const [permissionChoice, setPermissionChoice] = useState("AT_THIS_TIME");
  const [notes, setNotes] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<number>(5);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recordingSessionId, setRecordingSessionId] = useState<number | null>(null);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "ready">("idle");
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/auth/me`)
      .then((data) => setUser(data))
      .catch((err) => setError(err.message));

    fetcher(`${getApiUrl()}/api/verification/policy`)
      .then((data) => setPolicy(data.verificationPolicy))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!user) return;

    const sessionPath = user.isOwner ? "/api/verification/sessions" : "/api/verification/my-sessions";
    fetcher(`${getApiUrl()}${sessionPath}`)
      .then((items) => setSessions(items))
      .catch((err) => setError(err.message));

    if (user.isOwner) {
      fetcher(`${getApiUrl()}/api/users`)
        .then((items) => setUsers(items))
        .catch((err) => setError(err.message));
    }
  }, [user]);

  const pendingSession = useMemo(
    () => sessions.find((item) => item.status === "REQUESTED" && item.userId === user?.id),
    [sessions, user]
  );

  async function savePolicy() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const response = await authFetch(`${getApiUrl()}/api/verification/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationPolicy: policy }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to save policy.");
      }
      const data = await response.json();
      setPolicy(data.verificationPolicy);
      setMessage("Verification preference saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save policy.");
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!selectedUserId) {
      setError("Please choose a user to request verification for.");
      return;
    }
    setLoading(true);
    try {
      const response = await authFetch(`${getApiUrl()}/api/verification/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, durationSeconds: selectedDuration }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to create verification request.");
      }
      const session = await response.json();
      setSessions((current) => [session, ...current]);
      setSelectedUserId("");
      setNotes("");
      setMessage("Security verification request created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create verification request.");
    } finally {
      setLoading(false);
    }
  }

  async function startCapture(sessionId: number) {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("Camera and microphone access is not supported in this browser.");
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      setMediaStream(stream);
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        setRecordingBlob(blob);
        setRecordingState("ready");
        stream.getTracks().forEach((track) => track.stop());
        setMediaStream(null);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecordingSessionId(sessionId);
      setRecordingState("recording");
      setMessage("Recording in progress. Stop when finished.");
      // auto-stop based on session duration
      const session = sessions.find((s) => s.id === sessionId);
      const duration = session?.durationSeconds || 5;
      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, duration * 1000 + 200);
    } catch (err) {
      setError("Unable to start camera/microphone capture.");
    }
  }

  function stopCapture() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      setMediaRecorder(null);
    }
  }

  async function uploadCapture() {
    if (!recordingBlob || recordingSessionId == null) {
      setError("No recording available to upload.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("recording", recordingBlob, `security-verification-${recordingSessionId}.webm`);
      const response = await authFetch(`${getApiUrl()}/api/verification/capture/${recordingSessionId}`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Upload failed.");
      }
      const data = await response.json();
      setSessions((current) => current.map((item) => (item.id === recordingSessionId ? { ...item, status: "COMPLETED", mediaPath: data.session?.mediaPath ?? item.mediaPath, completedAt: new Date().toISOString() } : item)));
      setRecordingBlob(null);
      setRecordingSessionId(null);
      setRecordingState("idle");
      setMessage("Verification recording uploaded successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload recording.");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(value: string | null | undefined) {
    return value ? new Date(value).toLocaleString() : "-";
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Security Verification</h1>
        <p className="mt-2 text-sm text-slate-600">Control verification policy and manage secure verification sessions for your account or team.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700">{message}</div>}

      <section className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {!user?.isOwner && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Verification Preference</h2>
              <p className="mt-2 text-sm text-slate-600">Set how this account handles camera and microphone verification.</p>

              <div className="mt-6 space-y-4">
                {verificationOptions.map((option) => (
                  <label key={option.value} className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="radio"
                      name="verificationPolicy"
                      value={option.value}
                      checked={policy === option.value}
                      onChange={() => setPolicy(option.value)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-slate-700">{option.label}</span>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={savePolicy}
                  disabled={loading}
                  className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  Save verification preference
                </button>
              </div>
            </div>
          )}

          {user?.isOwner && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Request Verification</h2>
              <p className="mt-2 text-sm text-slate-600">Create a secure verification request for another account.</p>

              <form className="mt-6 space-y-4" onSubmit={submitRequest}>
                <div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-950">Security Verification</h2>
                    <p className="mt-2 text-sm text-slate-600">Request a verification from a user's active device.</p>

                    <form className="mt-6 space-y-4" onSubmit={submitRequest}>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">User</label>
                        <select
                          value={selectedUserId}
                          onChange={(event) => setSelectedUserId(Number(event.target.value) || "")}
                          className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3"
                        >
                          <option value="">Select a user</option>
                          {users.map((userItem) => (
                            <option key={userItem.id} value={userItem.id}>
                              {userItem.fullName} ({userItem.accountId})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700">Seconds</label>
                        <select value={selectedDuration} onChange={(e) => setSelectedDuration(Number(e.target.value))} className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3">
                          {[5,10,15,20].map((d)=> <option key={d} value={d}>{d} seconds</option>)}
                        </select>
                      </div>

                      <button type="submit" disabled={loading} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
                        CHECK USER
                      </button>
                    </form>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
                  Create verification request
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Verification sessions</h2>
          <p className="mt-2 text-sm text-slate-600">Review current session status and upload your recording when requested.</p>

          <div className="mt-6 space-y-4">
            {sessions.length ? (
              sessions.map((session) => (
                <div key={session.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Session #{session.id}</p>
                  <p className="mt-2 text-sm text-slate-600">Status: {session.status}</p>
                  <p className="mt-1 text-sm text-slate-600">Requested by: {session.requestedBy?.fullName || session.requestedBy?.accountId}</p>
                  <p className="mt-1 text-sm text-slate-600">Requested at: {formatDate(session.requestedAt)}</p>
                  <p className="mt-1 text-sm text-slate-600">Permission policy: {session.permissionChoice}</p>
                  {session.notes && <p className="mt-1 text-sm text-slate-600">Notes: {session.notes}</p>}
                  {user?.id === session.userId && session.status === "REQUESTED" && (
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      {recordingState === "idle" && (
                        <button
                          onClick={() => startCapture(session.id)}
                          className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
                        >
                          Start recording
                        </button>
                      )}
                      {recordingState === "recording" && (
                        <button
                          onClick={stopCapture}
                          className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700"
                        >
                          Stop recording
                        </button>
                      )}
                      {recordingState === "ready" && (
                        <button
                          onClick={uploadCapture}
                          disabled={loading}
                          className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Upload recording
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No verification sessions found.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
