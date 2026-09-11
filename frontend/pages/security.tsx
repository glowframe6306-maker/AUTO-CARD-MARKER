import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function Security() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [roleSelections, setRoleSelections] = useState<Record<number, string>>({});
  const [roleUpdatingId, setRoleUpdatingId] = useState<number | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userMessage, setUserMessage] = useState<string | null>(null);

  async function loadUsers() {
    setUserLoading(true);
    try {
      const items = await fetcher(`${getApiUrl()}/api/users`);
      setUsers(items);

      const initialRoles: Record<number, string> = {};
      items.forEach((item: any) => {
        const currentRole = item.roles?.[0]?.role?.name;
        initialRoles[item.id] =
          currentRole === "ADMIN" ? "ADMIN" : "MEMBER";
      });
      setRoleSelections(initialRoles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users.");
    } finally {
      setUserLoading(false);
    }
  }

  async function approveUserRole(userId: number) {
    const roleName = roleSelections[userId];

    if (!roleName) {
      setError("Please select a role.");
      return;
    }

    setRoleUpdatingId(userId);
    setError(null);
    setUserMessage(null);

    try {
      const response = await authFetch(
        `${getApiUrl()}/api/users/${userId}/role`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleName }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Unable to update user role.");
      }

      setUsers((current) =>
        current.map((item) =>
          item.id === userId ? result.user : item
        )
      );

      setUserMessage(
        `${result.user?.fullName || "User"} role updated to ${roleName}.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update user role."
      );
    } finally {
      setRoleUpdatingId(null);
    }
  }

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/system/security`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Security Center</h1>
        <p className="mt-2 text-sm text-slate-600">Recent security events, devices and account protections.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              User Role Assignment
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Assign MEMBER or ADMIN access to registered users.
            </p>
          </div>

          <button
            type="button"
            onClick={loadUsers}
            disabled={userLoading}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {userLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {userMessage && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {userMessage}
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">RC ID</th>
                <th className="px-4 py-3">USER</th>
                <th className="px-4 py-3">ROLL</th>
                <th className="px-4 py-3 text-right">ACTION</th>
              </tr>
            </thead>

            <tbody>
              {users.length ? (
                users.map((userItem: any) => (
                  <tr key={userItem.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-4">
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {userItem.accountId}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {userItem.fullName}
                      </p>
                      {userItem.email && (
                        <p className="mt-1 text-xs text-slate-500">
                          {userItem.email}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {userItem.isOwner ? (
                        <span className="inline-flex rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                          OWNER
                        </span>
                      ) : (
                        <select
                          value={roleSelections[userItem.id] || "MEMBER"}
                          onChange={(event) =>
                            setRoleSelections((current) => ({
                              ...current,
                              [userItem.id]: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800"
                        >
                          <option value="MEMBER">MEMBER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      )}
                    </td>

                    <td className="px-4 py-4 text-right">
                      {userItem.isOwner ? (
                        <span className="text-xs font-medium text-slate-400">
                          Protected
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => approveUserRole(userItem.id)}
                          disabled={roleUpdatingId === userItem.id}
                          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {roleUpdatingId === userItem.id ? "Saving..." : "APPROVE"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    {userLoading ? "Loading users..." : "No users available."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Events</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {data.events.map((event: any) => (
                <li key={event.id}>{event.eventType} â€” {new Date(event.createdAt).toLocaleString()}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Devices</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {data.devices.map((device: any) => (
                <li key={device.id}>{device.deviceName || "Unknown device"} â€” Last active {new Date(device.lastActive).toLocaleString()}</li>
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



