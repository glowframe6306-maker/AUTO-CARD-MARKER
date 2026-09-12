import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";
import { useAuth } from "../lib/useAuth";

export default function Profile() {
  const { user, isLoading } = useAuth();
  const [member, setMember] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || isLoading) return;
    if (user.memberProfile?.memberId) {
      fetcher(`${getApiUrl()}/api/members/me`)
        .then(setMember)
        .catch((err) => setError(err.message));
    }
  }, [user, isLoading]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">My Profile</h1>
        <p className="mt-2 text-sm text-slate-600">Your active member details and membership status.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      {member ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Member ID</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{member.memberId}</p>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Grade</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{member.grade}</p>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Position</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{member.position}</p>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Status</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{member.status}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">Profile information is not available for this account.</div>
      )}
    </div>
  );
}
