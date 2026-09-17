import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function SecurityRecordings() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadSessions() {
    try {
      const items = await fetcher(`${getApiUrl()}/api/verification/sessions`);
      setSessions(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load recordings.");
    }
  }

  useEffect(() => {
    void loadSessions();
    const onSessionUpdate = () => { void loadSessions(); };
    window.addEventListener("verification-session-updated", onSessionUpdate);
    return () => window.removeEventListener("verification-session-updated", onSessionUpdate);
  }, []);

  async function playRecording(sessionId: number) {
    try {
      setError(null);
      setMessage(null);
      const response = await authFetch(`${getApiUrl()}/api/verification/download/${sessionId}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Download failed.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setSelectedVideoUrl(url);
      setSelectedSessionId(sessionId);
      setMessage("Recording is ready to play.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load recording.");
    }
  }

  function formatDate(value: string | null | undefined) {
    return value ? new Date(value).toLocaleString() : "-";
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">SECURITY RECORDINGS</h1>
        <p className="mt-2 text-sm text-slate-600">Review completed verification recordings and play secure footage for audit.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700">{message}</div>}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {selectedVideoUrl && (
          <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Session #{selectedSessionId}</p>
            <video controls className="w-full rounded-2xl border border-slate-200 bg-black" src={selectedVideoUrl} />
          </div>
        )}

        {sessions.length ? (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Member: {session.user?.fullName || session.user?.accountId || "Unknown"}</p>
                    <p className="mt-1 text-sm text-slate-600">Account ID: {session.user?.accountId || "-"}</p>
                    <p className="mt-1 text-sm text-slate-600">Session: #{session.id}</p>
                    <p className="mt-1 text-sm text-slate-600">Duration: {session.durationSeconds ?? 5} seconds</p>
                    <p className="mt-1 text-sm text-slate-600">Status: {session.status}</p>
                    <p className="mt-1 text-sm text-slate-600">Recording date/time: {formatDate(session.completedAt)}</p>
                  </div>
                  {session.mediaPath ? (
                    <button
                      onClick={() => playRecording(session.id)}
                      className="mt-3 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 sm:mt-0"
                    >
                      ▶ PLAY RECORDING
                    </button>
                  ) : (
                    <div className="mt-3 rounded-2xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 sm:mt-0">No recording yet</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">No security recordings available yet.</div>
        )}
      </div>
    </div>
  );
}
