import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function Settings() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/system/health`)
      .then((data) => setStatus("API reachable"))
      .catch((err) => setError(err.message));
  }, []);

  async function createBackup() {
    try {
      const response = await authFetch(`${getApiUrl()}/api/backup/create`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Backup failed.");
      }
      setStatus("Backup created successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create backup.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Settings</h1>
        <p className="mt-2 text-sm text-slate-600">System settings, backup creation and configuration for the backend.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">API Status</p>
          <p className="mt-4 text-lg font-semibold text-slate-950">{status || "Checking..."}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <button onClick={createBackup} className="button">Create Backup</button>
          <p className="mt-3 text-sm text-slate-600">Use the backup endpoint to store a snapshot of users and members.</p>
        </div>
      </div>
    </div>
  );
}
