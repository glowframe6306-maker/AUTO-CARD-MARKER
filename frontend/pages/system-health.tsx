import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";

export default function SystemHealth() {
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/system/health`)
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">System Health</h1>
        <p className="mt-2 text-sm text-slate-600">Backend connectivity, OCR, storage, and backup status.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {health ? (
          Object.entries(health).map(([key, value]) => (
            <div key={key} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">{key}</p>
              <p className="mt-4 text-3xl font-semibold text-slate-950">{String(value)}</p>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">Loading health status...</div>
        )}
      </div>
    </div>
  );
}
