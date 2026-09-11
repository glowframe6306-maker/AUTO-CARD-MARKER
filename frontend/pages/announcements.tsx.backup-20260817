import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/announcements`)
      .then(setAnnouncements)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Announcements</h1>
        <p className="mt-2 text-sm text-slate-600">Published notices for members and staff.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="space-y-4">
        {announcements.length ? (
          announcements.map((announcement) => (
            <div key={announcement.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-base font-semibold text-slate-950">{announcement.title}</p>
              <p className="mt-2 text-sm text-slate-600">{announcement.content}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                {announcement.publishedAt ? new Date(announcement.publishedAt).toLocaleString() : "Draft"}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">No announcements available.</div>
        )}
      </div>
    </div>
  );
}
