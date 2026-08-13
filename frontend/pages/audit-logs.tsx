import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";

export default function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/audit-logs`)
      .then((result) => setLogs(result.data || result))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Audit Logs</h1>
        <p className="mt-2 text-sm text-slate-600">Track administrative actions and system events.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-3 px-4">Time</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Target</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4 text-sm text-slate-800">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="py-3 px-4 text-sm text-slate-800">{log.action}</td>
                <td className="py-3 px-4 text-sm text-slate-800">{log.targetType} / {log.targetId}</td>
                <td className="py-3 px-4 text-sm text-slate-800">{log.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
