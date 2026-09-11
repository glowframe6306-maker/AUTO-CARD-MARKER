import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";

export default function Members() {
  const [members, setMembers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/members`)
      .then((res) => {
        setMembers(res.data || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Members</h1>
        <p className="mt-2 text-sm text-slate-600">Review member records, status, and member profile access.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-600">Loading members...</p>
        ) : members.length ? (
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-3 px-4">Member ID</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Grade</th>
                <th className="py-3 px-4">Position</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.memberId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-sm text-slate-800">{member.memberId}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{member.fullName}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{member.grade}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{member.position}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{member.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-600">No members were found.</p>
        )}
      </div>
    </div>
  );
}
