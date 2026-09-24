import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth";
import { authFetch, clearAuthToken, getApiUrl } from "../lib/api";

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentDateTime, setCurrentDateTime] = useState<string>(
    "Loading time and date..."
  );

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

    const loadDashboard = async () => {
      try {
        const response = await authFetch(
          `${getApiUrl()}/api/reports/dashboard`
        );

        if (!response.ok) {
          throw new Error("Unable to load dashboard.");
        }

        const json = await response.json();

        const source = json?.data ?? json;

        setData({
          totalMembers: Number(source?.totalMembers ?? 0),
          totalMonths: Number(
            source?.totalMonths ?? source?.totalOpenMonths ?? 0
          ),
          totalOpenMonths: Number(
            source?.totalOpenMonths ?? source?.totalMonths ?? 0
          ),
          totalAmount: Number(source?.totalAmount ?? 0),
          pendingAmount: Number(source?.pendingAmount ?? 0),
          pendingApprovals: Number(source?.pendingApprovals ?? 0),
          pendingPaymentReview: Number(
            source?.pendingPaymentReview ??
            source?.pendingPaymentReviews ??
            0
          ),
        });

        setError(null);
      } catch (err) {
        console.error("Owner dashboard refresh failed:", err);
      }
    };

    void loadDashboard();

    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [user, isLoading]);

  useEffect(() => {
    const updateDateTime = () => {
      setCurrentDateTime(new Date().toLocaleString());
    };

    updateDateTime();

    const timer = window.setInterval(updateDateTime, 1000);

    return () => window.clearInterval(timer);
  }, []);

  function logout() {
    clearAuthToken();
    window.location.href = "/";
  }

  const getDisplayNumber = (value: unknown) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue)
      ? numberValue.toLocaleString()
      : "0";
  };

  const getDisplayMoney = (value: unknown) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue)
      ? `Rs. ${numberValue.toLocaleString()}`
      : "Rs. 0";
  };

  const totalMembersValue = getDisplayNumber(data?.totalMembers);
  const totalMonthsValue = getDisplayNumber(data?.totalOpenMonths ?? data?.totalMonths);
  const totalAmountValue = getDisplayMoney(data?.totalAmount);
  const pendingAmountValue = getDisplayMoney(data?.pendingAmount);
  const pendingApprovalsValue = getDisplayNumber(
    data?.pendingApprovals ?? data?.pendingRequestsCount
  );
  const pendingPaymentReviewValue = getDisplayNumber(
    data?.pendingPaymentReview ?? data?.pendingPaymentReviews
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-8">

        <header className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
              WELCOME RESPECTED OWNER M.I.MUHAMMADH
            </h1>

            <p className="mt-4 text-xl font-semibold text-brand-600 sm:text-2xl">
              READERS CIRCLE OF T.B.JAYAH ZAHIRA COLLEGE
            </p>

            <p
              id="owner-dashboard-datetime"
              className="mt-5 text-base font-semibold text-slate-600 sm:text-lg"
            >
              {currentDateTime}
            </p>
          </div>
        </header>

        <section className="grid gap-6">

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                TOTAL MEMBERS
              </p>

              <p className="mt-3 text-3xl font-extrabold text-slate-950">
                {totalMembersValue}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                TOTAL MONTHS
              </p>

              <p className="mt-3 text-3xl font-extrabold text-slate-950">
                {totalMonthsValue}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                TOTAL AMOUNT
              </p>

              <p className="mt-3 text-2xl font-extrabold text-brand-700">
                {totalAmountValue}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                PENDING AMOUNT
              </p>

              <p className="mt-3 text-2xl font-extrabold text-orange-700">
                {pendingAmountValue}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                PENDING APPROVALS
              </p>

              <p className="mt-3 text-3xl font-extrabold text-slate-950">
                {pendingApprovalsValue}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                PENDING PAYMENT REVIEW
              </p>

              <p className="mt-3 text-3xl font-extrabold text-slate-950">
                {pendingPaymentReviewValue}
              </p>
            </div>
          </div>

          {/* SYSTEM ACTIVITY */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
              SYSTEM ACTIVITY
            </p>

            <div className="mt-6 overflow-x-auto">
              {(data?.systemActivity?.length ? data.systemActivity : (data?.recentActivity?.length ? data.recentActivity : data?.recentLoginLogout))?.length ? (
                <div className="min-w-[1200px] overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[100px_190px_110px_110px_260px_150px_110px_1fr] bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                    <div>RC NO</div>
                    <div>DEVICE</div>
                    <div>DATE</div>
                    <div>TIME</div>
                    <div>EMAIL</div>
                    <div>ACTION</div>
                    <div>STATUS</div>
                    <div>OTHER DETAILS</div>
                  </div>

                  <div className="divide-y divide-slate-200">
                    {(data?.systemActivity?.length ? data.systemActivity : (data?.recentActivity?.length ? data.recentActivity : data?.recentLoginLogout) || []).map((event: any) => {
                      const eventDate = event.timestamp
                        ? new Date(event.timestamp)
                        : null;

                      const dateText = eventDate
                        ? eventDate.toLocaleDateString()
                        : "--";

                      const timeText = eventDate
                        ? eventDate.toLocaleTimeString()
                        : "--";

                      const deviceText = event.device
                        ? [
                            event.device.name,
                            event.device.platform,
                            event.device.browser,
                          ]
                            .filter(Boolean)
                            .join(" • ")
                        : "--";

                      const actionText = event.action || event.type || event.event || "--";
                      const statusText = event.status || "--";

                      const detailsText = [
                        event.fullName || event.userName,
                        event.accountId,
                        event.role,
                        event.device?.ipAddress
                          ? `IP: ${event.device.ipAddress}`
                          : null,
                        event.targetType
                          ? `Target: ${event.targetType}`
                          : null,
                        event.targetId
                          ? `ID: ${event.targetId}`
                          : null,
                        event.reason,
                      ]
                        .filter(Boolean)
                        .join(" • ");

                      return (
                        <div
                          key={event.id}
                          className="grid grid-cols-[100px_190px_110px_110px_260px_150px_110px_1fr] items-center px-4 py-4 text-sm"
                        >
                          <div className="font-semibold text-slate-900">
                            {event.rcNo || "--"}
                          </div>

                          <div className="text-slate-700">
                            {deviceText}
                          </div>

                          <div className="text-slate-600">
                            {dateText}
                          </div>

                          <div className="text-slate-600">
                            {timeText}
                          </div>

                          <div className="break-all text-slate-700">
                            {event.email || "--"}
                          </div>

                          <div
                            className={`font-bold ${
                              actionText === "LOGIN"
                                ? "text-emerald-700"
                                : actionText === "LOGOUT"
                                ? "text-red-700"
                                : "text-brand-700"
                            }`}
                          >
                            {actionText}
                          </div>

                          <div className="font-semibold text-slate-700">
                            {statusText}
                          </div>

                          <div className="text-slate-600">
                            {detailsText || "--"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  No system activity available.
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
