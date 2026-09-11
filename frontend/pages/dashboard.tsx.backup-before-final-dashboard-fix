import { useEffect, useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      window.location.href = "/";
      return;
    }
    fetch(`${BACKEND_URL}/api/reports/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || "Unable to load dashboard.");
        }
        return response.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  function logout() {
    localStorage.removeItem("authToken");
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-brand-600">Readers Circle Management</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">AUTO MONTHLY CARD PAYMENT MARKING SYSTEM</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Owner, admin and member dashboards with secure role-based access, OCR card processing, and audit reporting.</p>
          </div>
          <button onClick={logout} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">Sign out</button>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Members</p>
                <p className="mt-4 text-4xl font-semibold text-slate-950">{data?.totalMembers ?? "--"}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Collection</p>
                <p className="mt-4 text-4xl font-semibold text-brand-700">Rs. {data?.totalCollection ?? "--"}</p>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Recent Payments</p>
              <div className="mt-6 space-y-4">
                {data?.recentPayments?.length ? (
                  data.recentPayments.map((payment: any) => (
                    <div key={payment.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-900">Member ID {payment.memberId}</p>
                      <p className="mt-1 text-sm text-slate-600">Paid Rs. {payment.paymentAmount} on {new Date(payment.paymentDate).toLocaleDateString()}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No recent payments available.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Balance summary</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-brand-50 p-4">
                  <p className="text-sm text-brand-700">Active Members</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{data?.activeMembers ?? "--"}</p>
                </div>
                <div className="rounded-3xl bg-orange-50 p-4">
                  <p className="text-sm text-orange-700">Unpaid weeks</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{data?.unpaidPayments ?? "--"}</p>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Audit & security</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">Owner access is required to review approval requests, audit logs, and system health metrics.</p>
            </div>
          </div>
        </section>
        {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}
      </div>
    </main>
  );
}
