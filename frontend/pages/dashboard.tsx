import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import { authFetch, getApiUrl } from "../lib/api";

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      window.location.href = "/";
      return;
    }

    if (user.isOwner !== true) {
      window.location.href = "/member-dashboard";
      return;
    }

    (async () => {
      try {
        const response = await authFetch(
          `${getApiUrl()}/api/reports/dashboard`
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || "Unable to load dashboard.");
        }

        const json = await response.json();
        setData(json);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [user, isLoading]);

  function logout() {
    localStorage.removeItem("authToken");
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">

        <header className="flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-brand-600">
              Readers Circle Management
            </p>

            <h1 className="mt-3 text-3xl font-semibold text-slate-950">
              AUTO MONTHLY CARD PAYMENT MARKING SYSTEM
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Owner dashboard with payment collection and member information.
            </p>
          </div>

          <button
            onClick={logout}
            className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Sign out
          </button>
        </header>

        <section className="grid gap-6">

          {/* TOP SUMMARY */}
          <div className="grid gap-6 md:grid-cols-2">

            {/* TOTAL REGISTERED MEMBERS */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                Total Registered Members
              </p>

              <p className="mt-4 text-5xl font-extrabold text-slate-950">
                {data?.totalMembers ?? "--"}
              </p>

              <p className="mt-2 text-sm text-slate-600">
                All registered members
              </p>
            </div>

            {/* TOTAL COLLECTION */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                Total Collection
              </p>

              <p className="mt-4 text-5xl font-extrabold text-brand-700">
                Rs.{" "}
                {typeof data?.totalCollection === "number"
                  ? data.totalCollection.toLocaleString()
                  : "--"}
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Completed payments
              </p>
            </div>
          </div>

          {/* BALANCE SUMMARY */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">

            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
              Members & Payment Status
            </p>

            <div className="mt-6 grid gap-6 md:grid-cols-2">

              {/* ACTIVE MEMBERS */}
              <div className="rounded-3xl bg-brand-50 p-6">
                <p className="text-sm font-medium text-brand-700">
                  Active Members
                </p>

                <p className="mt-3 text-4xl font-extrabold text-slate-950">
                  {data?.activeMembers ?? "--"}
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  Currently active members
                </p>
              </div>

              {/* UNPAID */}
              <div className="rounded-3xl bg-orange-50 p-6">
                <p className="text-sm font-medium text-orange-700">
                  Unpaid / Incomplete Payments
                </p>

                <p className="mt-3 text-4xl font-extrabold text-slate-950">
                  {data?.unpaidPayments ?? "--"}
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  Payments with fewer than 4 weeks
                </p>
              </div>

            </div>
          </div>

          {/* RECENT PAYMENTS */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">

            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
              Recent Payments
            </p>

            <div className="mt-6 space-y-4">

              {data?.recentPayments?.length ? (

                data.recentPayments.map((payment: any) => (

                  <div
                    key={payment.id}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                  >

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Member ID: {payment.memberId}
                        </p>

                        <p className="mt-1 text-sm text-slate-600">
                          {payment.memberName}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">

                        <p className="text-lg font-bold text-brand-700">
                          Rs.{" "}
                          {Number(payment.paymentAmount || 0).toLocaleString()}
                        </p>

                        <p className="text-xs text-slate-500">
                          {payment.paymentDate
                            ? new Date(
                                payment.paymentDate
                              ).toLocaleDateString()
                            : "--"}
                        </p>

                      </div>

                    </div>

                  </div>

                ))

              ) : (

                <p className="text-sm text-slate-600">
                  No recent payments available.
                </p>

              )}

            </div>
          </div>

        </section>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        )}

      </div>
    </main>
  );
}
