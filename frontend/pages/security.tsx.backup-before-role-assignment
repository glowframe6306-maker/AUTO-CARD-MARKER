import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";

export default function Security() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/system/security`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Security Center</h1>
        <p className="mt-2 text-sm text-slate-600">Recent security events, devices and account protections.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      {data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Events</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {data.events.map((event: any) => (
                <li key={event.id}>{event.eventType} — {new Date(event.createdAt).toLocaleString()}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Devices</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {data.devices.map((device: any) => (
                <li key={device.id}>{device.deviceName || "Unknown device"} — Last active {new Date(device.lastActive).toLocaleString()}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">Loading security data...</div>
      )}
    </div>
  );
}
