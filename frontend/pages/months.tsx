import { useEffect, useState } from "react";
import { authFetch, getApiUrl } from "../lib/api";
import { useAuth } from "../lib/useAuth";

const monthNames = [
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

export default function MonthsManagement() {
  const { user, isLoading } = useAuth();

  const [months, setMonths] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);

  const [form, setForm] = useState({
    academicYearId: "",
    month: "1",
    name: "",
    paymentAmount: "800",
  });

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const [monthsResponse, yearsResponse] = await Promise.all([
        authFetch(`${getApiUrl()}/api/months`),
        authFetch(`${getApiUrl()}/api/system/academic-years`),
      ]);

      if (!monthsResponse.ok) {
        const body = await monthsResponse.json().catch(() => ({}));
        throw new Error(body?.error || "Unable to load months.");
      }

      const monthData = await monthsResponse.json();
      setMonths(monthData);

      if (yearsResponse.ok) {
        const yearData = await yearsResponse.json();
        setYears(Array.isArray(yearData) ? yearData : yearData?.value || []);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load months.");
    } finally {
      setLoading(false);
    }
  }

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

    load();
  }, [user, isLoading]);

  async function addMonth() {
    try {
      setError(null);

      if (!form.academicYearId) {
        throw new Error("Select an academic year.");
      }

      const response = await authFetch(`${getApiUrl()}/api/months`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          academicYearId: Number(form.academicYearId),
          month: Number(form.month),
          name:
            form.name.trim() ||
            `${monthNames[Number(form.month) - 1]} Month`,
          paymentAmount: Number(form.paymentAmount),
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Unable to add month.");
      }

      setShowAdd(false);

      setForm({
        academicYearId: "",
        month: "1",
        name: "",
        paymentAmount: "800",
      });

      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to add month.");
    }
  }

  async function renameMonth(month: any) {
    const name = window.prompt(
      "Enter new month name:",
      month.name
    );

    if (!name) return;

    await updateMonth(month.id, {
      name,
    });
  }

  async function changePayment(month: any) {
    const amount = window.prompt(
      "Enter new payment amount:",
      String(month.paymentAmount)
    );

    if (amount === null) return;

    await updateMonth(month.id, {
      paymentAmount: Number(amount),
    });
  }

  async function updateMonth(id: number, data: any) {
    try {
      setError(null);

      const response = await authFetch(
        `${getApiUrl()}/api/months/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        }
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Unable to update month.");
      }

      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to update month.");
    }
  }

  async function closeMonth(month: any) {
    if (
      !window.confirm(
        `Mark "${month.name}" as paid/closed?`
      )
    ) {
      return;
    }

    try {
      const response = await authFetch(
        `${getApiUrl()}/api/months/${month.id}/close`,
        {
          method: "POST",
        }
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Unable to close month.");
      }

      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to close month.");
    }
  }

  async function reopenMonth(month: any) {
    if (
      !window.confirm(
        `Reopen "${month.name}"?`
      )
    ) {
      return;
    }

    try {
      const response = await authFetch(
        `${getApiUrl()}/api/months/${month.id}/reopen`,
        {
          method: "POST",
        }
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Unable to reopen month.");
      }

      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to reopen month.");
    }
  }

  async function deleteMonth(month: any) {
    if (
      !window.confirm(
        `Delete "${month.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await authFetch(
        `${getApiUrl()}/api/months/${month.id}`,
        {
          method: "DELETE",
        }
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body?.error || "Unable to delete month.");
      }

      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to delete month.");
    }
  }

  async function viewMembers(month: any) {
    try {
      setSelectedMonth(month);

      const response = await authFetch(
        `${getApiUrl()}/api/months/${month.id}/members`
      );

      const body = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(
          body?.error || "Unable to load members."
        );
      }

      setMembers(body);
    } catch (err: any) {
      setError(err?.message || "Unable to load members.");
    }
  }

  if (isLoading || loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <p className="text-sm text-slate-600">
          Loading Months Management...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-brand-600">
              Owner Only
            </p>

            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              Months Management
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Create, manage and monitor monthly payment records.
            </p>
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Add New Month
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      )}

      {showAdd && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">
            Add New Month
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">

            <select
              value={form.academicYearId}
              onChange={(e) =>
                setForm({
                  ...form,
                  academicYearId: e.target.value,
                })
              }
              className="rounded-2xl border border-slate-300 px-4 py-3"
            >
              <option value="">
                Select Academic Year
              </option>

              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name || year.year}
                </option>
              ))}
            </select>

            <select
              value={form.month}
              onChange={(e) =>
                setForm({
                  ...form,
                  month: e.target.value,
                })
              }
              className="rounded-2xl border border-slate-300 px-4 py-3"
            >
              {monthNames.map((name, index) => (
                <option
                  key={name}
                  value={index + 1}
                >
                  {name}
                </option>
              ))}
            </select>

            <input
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
              placeholder="Month name"
              className="rounded-2xl border border-slate-300 px-4 py-3"
            />

            <input
              type="number"
              min="0"
              value={form.paymentAmount}
              onChange={(e) =>
                setForm({
                  ...form,
                  paymentAmount: e.target.value,
                })
              }
              placeholder="Payment amount"
              className="rounded-2xl border border-slate-300 px-4 py-3"
            />
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={addMonth}
              className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Create Month
            </button>

            <button
              onClick={() => setShowAdd(false)}
              className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {months.map((month) => (
          <div
            key={month.id}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">

              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  {month.name}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {month.academicYear?.name ||
                    month.academicYear?.year ||
                    "Academic Year"}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  month.isClosed
                    ? "bg-green-100 text-green-700"
                    : "bg-orange-100 text-orange-700"
                }`}
              >
                {month.isClosed ? "PAID / CLOSED" : "PENDING"}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">
                  Payment
                </p>
                <p className="mt-1 text-lg font-bold">
                  Rs. {Number(month.paymentAmount || 0).toLocaleString()}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">
                  Members
                </p>
                <p className="mt-1 text-lg font-bold">
                  {month.totalMembers ?? 0}
                </p>
              </div>

              <div className="rounded-2xl bg-green-50 p-4">
                <p className="text-xs text-green-700">
                  Paid
                </p>
                <p className="mt-1 text-lg font-bold text-green-800">
                  {month.paidMembers ?? 0}
                </p>
              </div>

              <div className="rounded-2xl bg-orange-50 p-4">
                <p className="text-xs text-orange-700">
                  Pending
                </p>
                <p className="mt-1 text-lg font-bold text-orange-800">
                  {month.pendingMembers ?? 0}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Expected
                </span>
                <strong>
                  Rs. {Number(month.totalExpected || 0).toLocaleString()}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">
                  Collected
                </span>
                <strong className="text-green-700">
                  Rs. {Number(month.totalCollected || 0).toLocaleString()}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">
                  Pending
                </span>
                <strong className="text-orange-700">
                  Rs. {Number(month.totalPending || 0).toLocaleString()}
                </strong>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">

              <button
                onClick={() => viewMembers(month)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
              >
                View Members
              </button>

              <button
                onClick={() => renameMonth(month)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
              >
                Rename
              </button>

              <button
                onClick={() => changePayment(month)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
              >
                Change Payment
              </button>

              {!month.isClosed ? (
                <button
                  onClick={() => closeMonth(month)}
                  className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                >
                  Mark Paid
                </button>
              ) : (
                <button
                  onClick={() => reopenMonth(month)}
                  className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"
                >
                  Reopen
                </button>
              )}

              <button
                onClick={() => deleteMonth(month)}
                className="col-span-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Delete Month
              </button>

            </div>
          </div>
        ))}

        {!months.length && (
          <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-semibold text-slate-900">
              No months created yet.
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Click "+ Add New Month" to create the first month.
            </p>
          </div>
        )}
      </div>

      {selectedMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  {selectedMonth.name}
                </h2>

                <p className="text-sm text-slate-500">
                  Members payment status
                </p>
              </div>

              <button
                onClick={() => setSelectedMonth(null)}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">
                      {member.fullName}
                    </p>

                    <p className="text-sm text-slate-500">
                      {member.memberId}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    {member.status === "PAID" && (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        PAID
                      </span>
                    )}

                    {member.status === "PENDING" && (
                      <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                        PENDING
                      </span>
                    )}

                    {member.paymentAmount > 0 && (
                      <span className="text-sm font-semibold">
                        Rs. {Number(member.paymentAmount).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {!members.length && (
                <p className="py-8 text-center text-sm text-slate-500">
                  No active members found.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

