import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/notifications`)
      .then(setNotifications)
      .catch((err) => setError(err.message));
  }, []);

  async function markRead(id: number) {
    try {
      await authFetch(`${getApiUrl()}/api/notifications/read/${id}`, { method: "POST" });
      setNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark notification read.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Notifications</h1>
        <p className="mt-2 text-sm text-slate-600">Recent system alerts and member notifications.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="space-y-4">
        {notifications.length ? (
          notifications.map((notification) => (
            <div key={notification.id} className={`rounded-3xl border p-6 shadow-sm ${notification.read ? "border-slate-200 bg-slate-50" : "border-brand-200 bg-brand-50"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{notification.title || "Notification"}</p>
                  <p className="mt-2 text-sm text-slate-600">{notification.message || notification.content || "No content available."}</p>
                </div>
                {!notification.read && (
                  <button
                    onClick={() => markRead(notification.id)}
                    className="button"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">No notifications at this time.</div>
        )}
      </div>
    </div>
  );
}
