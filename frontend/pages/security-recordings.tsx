import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function SecurityRecordings() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/verification/sessions`)
      .then(setSessions)
      .catch((err) => setError(err.message));
  }, []);

  async function downloadRecording(sessionId: number) {
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
      const link = document.createElement("a");
      link.href = url;
      link.download = `security-verification-${sessionId}.webm`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Recording download started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download recording.");
    }
  }

  function formatDate(value: string | null | undefined) {
    return value ? new Date(value).toLocaleString() : "-";
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Security Recordings</h1>
        <p className="mt-2 text-sm text-slate-600">Review completed verification recordings and download secure footage for audit.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700">{message}</div>}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {sessions.length ? (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Session #{session.id}</p>
                    <p className="mt-1 text-sm text-slate-600">User: {session.user?.fullName || session.user?.accountId}</p>
                    <p className="mt-1 text-sm text-slate-600">Requested by: {session.requestedBy?.fullName || session.requestedBy?.accountId}</p>
                    <p className="mt-1 text-sm text-slate-600">Status: {session.status}</p>
                    <p className="mt-1 text-sm text-slate-600">Completed at: {formatDate(session.completedAt)}</p>
                  </div>
                  {session.mediaPath ? (
                    <button
                      onClick={() => downloadRecording(session.id)}
                      className="mt-3 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 sm:mt-0"
                    >
                      Download recording
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
