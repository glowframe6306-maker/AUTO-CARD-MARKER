import { useEffect, useMemo, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";
import { useAuth } from "../lib/useAuth";

type Payment = {
id: number;
memberId: number;
month: number;
paymentAmount: number;
paymentDate: string;
totalWeeks: number;
status: string;
notes?: string | null;
};

const statusClass = (status: string) => {
switch (status) {
case "COMPLETED":
return "bg-emerald-100 text-emerald-700";
case "PENDING":
return "bg-amber-100 text-amber-700";
case "FAILED":
return "bg-red-100 text-red-700";
case "REFUNDED":
return "bg-purple-100 text-purple-700";
case "REVIEW":
return "bg-blue-100 text-blue-700";
case "CORRECTED":
return "bg-slate-100 text-slate-700";
default:
return "bg-slate-100 text-slate-700";
}
};

export default function Payments() {
const { user, isLoading } = useAuth();

const [payments, setPayments] = useState<Payment[]>([]);
const [allPayments, setAllPayments] = useState<Payment[]>([]);
const [error, setError] = useState<string | null>(null);

const [search, setSearch] = useState("");
const [statusFilter, setStatusFilter] = useState("ALL");
const [monthFilter, setMonthFilter] = useState("ALL");

useEffect(() => {
if (!user || isLoading) return;

const loadPayments = async () => {
  try {
    setError(null);

    if (user.memberProfile?.memberId) {
      const data = await fetcher(
        `${getApiUrl()}/api/payments/member/${user.memberProfile.memberId}`
      );

      setPayments(data);
      setAllPayments(data);
      return;
    }

    /*
     * Owner/Admin users:
     * Load payment history for ALL registered members.
     */
    const adminData = await fetcher(
      `${getApiUrl()}/api/payments/admin/all`
    );

    const flattenedPayments = Array.isArray(adminData)
      ? adminData.map((payment: any) => ({
          ...payment,
          memberCode: payment.member?.memberId || "",
          memberName: payment.member?.fullName || "",
        }))
      : [];

    setPayments(flattenedPayments);
    setAllPayments(flattenedPayments);
  } catch (err: any) {
    setError(err?.message || "Unable to load payments.");
  }
};

loadPayments();

}, [user, isLoading]);

const filteredPayments = useMemo(() => {
return allPayments.filter((payment) => {
const matchesSearch =
search.trim() === "" ||
String(payment.id).includes(search.trim()) ||
String(payment.memberId).includes(search.trim());

  const matchesStatus =
    statusFilter === "ALL" || payment.status === statusFilter;

  const matchesMonth =
    monthFilter === "ALL" ||
    String(payment.month) === monthFilter;

  return matchesSearch && matchesStatus && matchesMonth;
});

}, [allPayments, search, statusFilter, monthFilter]);

const stats = useMemo(() => {
const completed = allPayments.filter(
(p) => p.status === "COMPLETED"
);

const pending = allPayments.filter(
  (p) => p.status === "PENDING"
);

const refunded = allPayments.filter(
  (p) => p.status === "REFUNDED"
);

const failed = allPayments.filter(
  (p) => p.status === "FAILED"
);

const totalIncome = completed.reduce(
  (sum, p) => sum + Number(p.paymentAmount || 0),
  0
);

const months = new Set(
  completed.map((p) => p.month)
);

return {
  totalIncome,
  totalMonths: months.size,
  totalPending: pending.reduce(
    (sum, p) => sum + Number(p.paymentAmount || 0),
    0
  ),
  pendingMembers: new Set(pending.map((p) => p.memberId)).size,
  refunds: refunded.reduce(
    (sum, p) => sum + Number(p.paymentAmount || 0),
    0
  ),
  failedPayments: failed.length,
};

}, [allPayments]);

const recentPayments = [...filteredPayments]
.sort(
(a, b) =>
new Date(b.paymentDate).getTime() -
new Date(a.paymentDate).getTime()
)
.slice(0, 10);

const exportCSV = () => {
if (!filteredPayments.length) return;

const header = [
  "Payment ID",
  "Member ID",
  "Month",
  "Amount",
  "Weeks",
  "Date",
  "Status",
];

const rows = filteredPayments.map((p) => [
  p.id,
  p.memberId,
  p.month,
  p.paymentAmount,
  p.totalWeeks,
  new Date(p.paymentDate).toLocaleDateString(),
  p.status,
]);

const csv = [header, ...rows]
  .map((row) =>
    row
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  )
  .join("\n");

const blob = new Blob([csv], {
  type: "text/csv;charset=utf-8;",
});

const url = URL.createObjectURL(blob);
const link = document.createElement("a");

link.href = url;
link.download = "payment-history.csv";
link.click();

URL.revokeObjectURL(url);

};

const statCards = [
{
title: "Total Income",
value: `Rs. ${stats.totalIncome.toLocaleString()}`,
description: "Completed payments",
},
{
title: "Total Months",
value: stats.totalMonths,
description: "Paid months",
},
{
title: "Total Pending",
value: `Rs. ${stats.totalPending.toLocaleString()}`,
description: "Pending payment value",
},
{
title: "Pending Members",
value: stats.pendingMembers,
description: "Members with pending payments",
},
{
title: "Refunds",
value: `Rs. ${stats.refunds.toLocaleString()}`,
description: "Refunded payment value",
},
{
title: "Failed Payments",
value: stats.failedPayments,
description: "Failed transactions",
},
];

return ( <div className="space-y-6">

  <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">
          Payments
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Payment overview, history, pending balances and transaction status.
        </p>
      </div>

      <button
        onClick={exportCSV}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Export CSV
      </button>
    </div>
  </header>

  {error && (
    <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {error}
    </div>
  )}

  <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
    {statCards.map((card) => (
      <div
        key={card.title}
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {card.title}
        </p>

        <p className="mt-3 text-2xl font-bold text-slate-950">
          {card.value}
        </p>

        <p className="mt-2 text-xs text-slate-500">
          {card.description}
        </p>
      </div>
    ))}
  </section>

  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-5">
      <p className="mt-1 text-sm text-slate-500">
        Search and filter payment records.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search Payment ID or Member ID"
        className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400"
      />

      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
      >
        <option value="ALL">All Statuses</option>
        <option value="COMPLETED">Completed</option>
        <option value="PENDING">Pending</option>
        <option value="REVIEW">Review</option>
        <option value="CORRECTED">Corrected</option>
        <option value="FAILED">Failed</option>
        <option value="REFUNDED">Refunded</option>
      </select>

      <select
        value={monthFilter}
        onChange={(e) => setMonthFilter(e.target.value)}
        className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
      >
        <option value="ALL">All Months</option>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => (
          <option key={month} value={month}>
            Month {month}
          </option>
        ))}
      </select>
    </div>
  </section>

  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-5 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">
          Recent Payments
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Latest payment activity.
        </p>
      </div>

      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
        {filteredPayments.length} records
      </span>
    </div>

    {recentPayments.length ? (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Weeks</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {recentPayments.map((payment) => (
              <tr
                key={payment.id}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-4 text-sm font-medium text-slate-900">
                  #{payment.id}
                </td>

                <td className="px-4 py-4 text-sm text-slate-700">
                  #{payment.memberId}
                </td>

                <td className="px-4 py-4 text-sm text-slate-700">
                  {payment.month}
                </td>

                <td className="px-4 py-4 text-sm font-medium text-slate-900">
                  Rs. {Number(payment.paymentAmount).toLocaleString()}
                </td>

                <td className="px-4 py-4 text-sm text-slate-700">
                  {payment.totalWeeks}
                </td>

                <td className="px-4 py-4 text-sm text-slate-700">
                  {new Date(payment.paymentDate).toLocaleDateString()}
                </td>

                <td className="px-4 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                      payment.status
                    )}`}
                  >
                    {payment.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="rounded-2xl bg-slate-50 p-8 text-center">
        <p className="text-sm text-slate-500">
          No payment records found.
        </p>
      </div>
    )}
  </section>

  <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-lg font-semibold text-slate-950">
      User-wise Payment History
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Payment records grouped by member.
    </p>

    <div className="mt-5 overflow-x-auto">
      {allPayments.length ? (
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Member ID</th>
              <th className="px-4 py-3">Payments</th>
              <th className="px-4 py-3">Total Paid</th>
              <th className="px-4 py-3">Last Payment</th>
            </tr>
          </thead>

          <tbody>
            {Array.from(
              new Map(
                allPayments.map((payment) => [
                  payment.memberId,
                  payment,
                ])
              ).keys()
            ).map((memberId) => {
              const memberPayments = allPayments.filter(
                (payment) => payment.memberId === memberId
              );

              const total = memberPayments.reduce(
                (sum, payment) =>
                  sum + Number(payment.paymentAmount || 0),
                0
              );

              const latest = [...memberPayments].sort(
                (a, b) =>
                  new Date(b.paymentDate).getTime() -
                  new Date(a.paymentDate).getTime()
              )[0];

              return (
                <tr
                  key={memberId}
                  className="border-b border-slate-100"
                >
                  <td className="px-4 py-4 text-sm font-medium text-slate-900">
                    #{memberId}
                  </td>

                  <td className="px-4 py-4 text-sm text-slate-700">
                    {memberPayments.length}
                  </td>

                  <td className="px-4 py-4 text-sm font-medium text-slate-900">
                    Rs. {total.toLocaleString()}
                  </td>

                  <td className="px-4 py-4 text-sm text-slate-700">
                    {latest
                      ? new Date(
                          latest.paymentDate
                        ).toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          No member payment history available.
        </p>
      )}
    </div>
  </section>
</div>

);
}





