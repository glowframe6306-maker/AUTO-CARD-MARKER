import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/system`)
      .then(setUsers)
      .catch((err) => setError(err.message));
  }, []);

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    try {
      const response = await authFetch(`${getApiUrl()}/api/system`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, fullName, email, password, roleName: role }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to create user.");
      }
      setAccountId("");
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("");
      const newUser = await response.json();
      setUsers((current) => [...current, newUser]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "User creation failed.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Users & Roles</h1>
        <p className="mt-2 text-sm text-slate-600">Manage staff accounts and role assignments for access control.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Roles</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-sm text-slate-800">{user.accountId}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{user.fullName}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{user.email}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{user.roles?.map((r: any) => r.role?.name).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <form className="space-y-4" onSubmit={createUser}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Account ID</label>
              <input value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Role</label>
              <input value={role} onChange={(e) => setRole(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3" placeholder="OWNER, SUPER_ADMIN, ADMINISTRATOR, ADMIN" />
            </div>
            <button type="submit" className="button">Create User</button>
          </form>
        </div>
      </div>
    </div>
  );
}
