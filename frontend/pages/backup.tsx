import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function Backup() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateBackup() {
    try {
      const response = await authFetch(`${getApiUrl()}/api/backup/create`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to create backup.");
      }
      const data = await response.json();
      setMessage(`Backup saved: ${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup request failed.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Backup</h1>
        <p className="mt-2 text-sm text-slate-600">Create or restore backup snapshots of the system data.</p>
      </header>

      {message && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700">{message}</div>}
      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <button onClick={handleCreateBackup} className="button">Create System Backup</button>
        <p className="mt-3 text-sm text-slate-600">Owner-only backup storage is invoked through the backend endpoint.</p>
      </div>
    </div>
  );
}
