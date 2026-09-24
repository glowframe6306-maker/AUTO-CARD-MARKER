import { useEffect, useMemo, useState } from "react";
import { Bell, CreditCard, User, X } from "lucide-react";
import { fetcher, getApiUrl } from "../lib/api";
import { useAuth } from "../lib/useAuth";

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const PAYMENT_AMOUNT = 200;

export default function MemberDashboard() {
  const { user, isLoading } = useAuth();

  const [member, setMember] = useState<any>(null);
  const [paymentsSummary, setPaymentsSummary] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [paymentCardFile, setPaymentCardFile] = useState<File | null>(null);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    if (isLoading || !user) return;

    let mounted = true;

    const loadLiveMemberData = async () => {
      try {
        const memberData = await fetcher(
          `${getApiUrl()}/api/members/me`
        );

        if (mounted) {
          setMember(memberData);
        }
      } catch {
        // Keep existing member data visible.
      }

      try {
        const notificationData = await fetcher(
          `${getApiUrl()}/api/notifications`
        );

        if (mounted) {
          setNotifications(notificationData);
        }
      } catch {
        // Keep existing notification data visible.
      }

      try {
        const activityData = await fetcher(
          `${getApiUrl()}/api/members/me/activity`
        );

        if (mounted) {
          setRecentActivity(activityData);
        }
      } catch {
        // Keep existing activity data visible.
      }

      try {
        const announcementData = await fetcher(
          `${getApiUrl()}/api/announcements`
        );

        if (mounted) {
          setAnnouncements(announcementData);
        }
      } catch {
        // Keep existing announcement data visible.
      }
    };

    void loadLiveMemberData();

    const interval = window.setInterval(() => {
      void loadLiveMemberData();
    }, 3000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [user, isLoading]);

  useEffect(() => {
    if (!member?.memberId) return;

    let mounted = true;

    const loadLivePaymentData = async () => {
      try {
        const [summaryData, receiptData] = await Promise.all([
          fetcher(
            `${getApiUrl()}/api/payments/member/${member.memberId}/summary`
          ),
          fetcher(
            `${getApiUrl()}/api/payments/member/${member.memberId}/receipts`
          ),
        ]);

        if (!mounted) return;

        setPaymentsSummary(summaryData);
        setReceipts(receiptData);
      } catch {
        // Keep the last successful dashboard data visible.
      }
    };

    void loadLivePaymentData();

    const interval = window.setInterval(() => {
      void loadLivePaymentData();
    }, 3000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [member?.memberId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isLoading || !user) return;

    if (user.isOwner === true) {
      window.location.href = "/dashboard";
    }
  }, [user, isLoading]);

  const paidMonths = useMemo(
    () =>
      new Set(
        (paymentsSummary?.payments ?? [])
          .map((payment: any) => Number(payment.month))
          .filter((month: number) => !Number.isNaN(month))
      ),
    [paymentsSummary]
  );

  const availableMonths = useMemo(
    () => Array.from({ length: 12 }, (_, index) => index + 1),
    []
  );

  useEffect(() => {
    if (showPaymentPopup) {
      const firstAvailableMonth = availableMonths.find(
        (month) => !paidMonths.has(month)
      );

      setSelectedMonth(firstAvailableMonth ? String(firstAvailableMonth) : "");
    }
  }, [showPaymentPopup, availableMonths, paidMonths]);

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Checking authentication...</p>
      </main>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }

    return null;
  }

  if (user.isOwner === true) {
    return null;
  }

  const memberId = member?.memberId ?? user.memberProfile?.memberId ?? "--";

  const normalizeFullName = (value: unknown): string | null => {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();

    if (!trimmed) return null;
    if (/^WELCOME\b/i.test(trimmed)) return null;

    return trimmed;
  };

  const fullName =
    normalizeFullName(member?.fullName) ??
    normalizeFullName(user?.memberProfile?.fullName) ??
    normalizeFullName(user?.fullName) ??
    "--";
  const accountId = user.accountId ?? "--";

  const getProfilePhotoUrl = (photoUrl: string | null) => {
    if (!photoUrl) return null;

    const normalizedPhotoUrl = /^https?:\/\//.test(photoUrl)
      ? photoUrl
      : `${getApiUrl()}${photoUrl}`;

    const versionMatch = normalizedPhotoUrl.match(/profile-(\d+)/i);
    const version = versionMatch?.[1] ?? Date.now();
    const separator = normalizedPhotoUrl.includes("?") ? "&" : "?";

    return `${normalizedPhotoUrl}${separator}v=${version}`;
  };

  const profilePhotoUrl = getProfilePhotoUrl(member?.photoUrl ?? null);
  const accountStatus = user.status === "ACTIVE" ? "ACTIVE" : "BLOCKED";
  const balanceMonths = Math.max(
    0,
    Math.trunc(Number(paymentsSummary?.balanceMonths ?? 0))
  );
  const balanceAmount = balanceMonths * PAYMENT_AMOUNT;

  const unreadNotifications = notifications.filter(
    (notification: any) => notification.read !== true
  ).length;

  const latestAnnouncements = announcements.slice(0, 3);

  const latestLogin = recentActivity.find(
    (item: any) => item.action === "LOGIN"
  );

  const latestLogout = recentActivity.find(
    (item: any) => item.action === "LOGOUT"
  );

  const reminderMessage =
    balanceMonths > 0
      ? `You have ${balanceMonths} unpaid month${balanceMonths === 1 ? "" : "s"}. Please complete your pending payment.`
      : "All currently available months are paid.";

  function closePaymentPopup() {
    setShowPaymentPopup(false);
    setPaymentCardFile(null);
    setPaymentNotes("");
    setSelectedMonth("");
  }

  async function handlePaymentSubmit() {
    if (!selectedMonth) {
      alert("Please select a valid month.");
      return;
    }

    if (!paymentCardFile) {
      alert("Please upload your card/proof before submitting.");
      return;
    }

    if (!member?.memberId) {
      alert("Member profile is not loaded yet.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("month", selectedMonth);
      formData.append("amount", String(PAYMENT_AMOUNT));
      formData.append("note", paymentNotes.trim());
      formData.append("card", paymentCardFile);

      await fetcher(`${getApiUrl()}/api/payments/requests`, {
        method: "POST",
        body: formData,
      });

      alert(
        "Payment request submitted successfully. It is now waiting for administrator review."
      );

      closePaymentPopup();
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Unable to submit payment request."
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl">
          <p className="text-4xl md:text-6xl font-extrabold uppercase tracking-tight text-brand-600">
            WELCOME RESPECTED MEMBER
          </p>

          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            READERS CIRCLE OF T.B.JAYAH ZAHIRA COLLEGE, COLOMBO 02
          </h1>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                Date
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {currentDateTime.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                Time
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {currentDateTime.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-700">
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User size={24} />
                )}
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                MEMBER INFORMATION
              </h2>
            </div>

            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
              {accountStatus}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                FULL NAME
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">{fullName}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                RC NUMBER
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">{memberId}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                ACCOUNT ID
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">{accountId}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                ACCOUNT STATUS
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {accountStatus}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              BALANCE MONTHS
            </p>
            <p className="mt-4 text-3xl font-bold text-slate-900">
  {balanceMonths}
</p>
            <p className="mt-2 text-sm text-slate-600">Pending/unpaid months</p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              BALANCE AMOUNT
            </p>
            <p className="mt-4 text-3xl font-bold text-slate-900">
              <span>LKR</span>&nbsp;{Number(balanceAmount || 0).toFixed(2)}
            </p>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  ANNOUNCEMENTS
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  Latest Announcements
                </h2>
              </div>

              {latestAnnouncements.length > 0 && (
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                  {latestAnnouncements.length}
                </span>
              )}
            </div>

            <div className="mt-5 space-y-3">
              {latestAnnouncements.length > 0 ? (
                latestAnnouncements.map((announcement: any) => (
                  <div
                    key={announcement.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {announcement.title}
                    </p>

                    <p className="mt-2 text-sm text-slate-600">
                      {announcement.content}
                    </p>

                    <p className="mt-2 text-xs text-slate-400">
                      {announcement.createdAt
                        ? new Date(announcement.createdAt).toLocaleString()
                        : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">
                  No announcements at this time.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              NOTIFICATION STATUS
            </p>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Unread Notifications
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Notifications waiting to be read
                </p>
              </div>

              <span className="rounded-full bg-brand-100 px-4 py-2 text-lg font-bold text-brand-700">
                {unreadNotifications}
              </span>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Payment Reminder
              </p>

              <p className="mt-1 text-sm text-slate-600">
                {reminderMessage}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                RECEIPTS
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Payment Receipts
              </h2>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {receipts.length}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {receipts.length > 0 ? (
              receipts.slice(0, 5).map((receipt: any) => (
                <div
                  key={receipt.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {receipt.receiptNumber}
                    </p>

                    <p className="mt-1 text-sm text-slate-600">
                      {MONTH_NAMES[Number(receipt.month)] || "Month"}{" "}
                      • LKR {Number(receipt.amount || 0).toLocaleString()}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      window.open(
                        `${getApiUrl()}/api/receipts/${encodeURIComponent(
                          receipt.receiptNumber
                        )}/pdf`,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Download Receipt
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">
                No payment receipts available.
              </p>
            )}
          </div>
        </section>

        {/*
         * Existing PAY FOR A MONTH section remains unchanged.
         */}
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              RECENT ACTIVITY
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              Recent Activity
            </h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                LAST LOGIN
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {latestLogin?.createdAt
                  ? new Date(latestLogin.createdAt).toLocaleString()
                  : "No login activity"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                LAST LOGOUT
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {latestLogout?.createdAt
                  ? new Date(latestLogout.createdAt).toLocaleString()
                  : "No logout activity"}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                MEMBER OPTIONS
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                PAY FOR A MONTH
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setShowPaymentPopup(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90"
            >
              <CreditCard size={18} />
              PAY FOR A MONTH
            </button>
          </div>
        </section>
      </div>

      {showPaymentPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closePaymentPopup}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Member Payment
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  PAY FOR A MONTH
                </h2>
              </div>

              <button
                type="button"
                onClick={closePaymentPopup}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close payment popup"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  FULL NAME
                </label>
                <input
                  type="text"
                  value={fullName}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  RC ID NUMBER
                </label>
                <input
                  type="text"
                  value={memberId}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  MONTH
                </label>
                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                >
                  <option value="">Select a month</option>
                  {availableMonths.map((month) => (
                    <option
                      key={month}
                      value={month}
                      disabled={paidMonths.has(month)}
                    >
                      {MONTH_NAMES[month]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  UPLOAD YOUR CARD
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setPaymentCardFile(event.target.files?.[0] ?? null)
                  }
                  className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
                />

                {paymentCardFile && (
                  <p className="mt-2 text-xs text-emerald-600">
                    Selected: {paymentCardFile.name}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  NOTES
                </label>
                <textarea
                  value={paymentNotes}
                  onChange={(event) => setPaymentNotes(event.target.value)}
                  rows={4}
                  placeholder="Optional notes for the payment request"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closePaymentPopup}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={handlePaymentSubmit}
                className="flex-1 rounded-2xl bg-brand-600 px-5 py-3 font-bold text-white shadow-lg transition hover:opacity-90"
              >
                SUBMIT
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

















































