import { useEffect, useMemo, useState } from "react";
import { fetcher, getApiUrl, authFetch } from "../lib/api";
import { useAuth } from "../lib/useAuth";

type Receipt = {
  id: number;
  receiptNumber: string;
  amount: number;
  weeksPaid: number;
  month: number;
  issuedAt: string;
  member?: {
    memberId?: string;
    fullName?: string;
  };
};

const MONTHS = [
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

export default function Receipts() {
  const { user, isLoading } = useAuth();

  const [items, setItems] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !user) return;

    if (user.isOwner !== true) {
      setError("Receipts are available to the Owner only.");
      return;
    }

    fetcher(`${getApiUrl()}/api/receipts`)
      .then((result) => {
        if (Array.isArray(result)) {
          setItems(result);
        } else if (Array.isArray(result?.data)) {
          setItems(result.data);
        } else {
          setItems([]);
        }
      })
      .catch((err) => {
        setError(err?.message || "Failed to load receipts.");
      });
  }, [user, isLoading]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return items;

    return items.filter((item) => {
      const receiptNumber = item.receiptNumber?.toLowerCase() || "";
      const memberId = item.member?.memberId?.toLowerCase() || "";
      const fullName = item.member?.fullName?.toLowerCase() || "";

      return (
        receiptNumber.includes(query) ||
        memberId.includes(query) ||
        fullName.includes(query)
      );
    });
  }, [items, search]);

  async function downloadPdf(receiptNumber: string) {
    try {
      setDownloading(receiptNumber);

      const response = await authFetch(
        `${getApiUrl()}/api/receipts/${encodeURIComponent(
          receiptNumber
        )}/pdf`
      );

      if (!response.ok) {
        let message = "Failed to download receipt PDF.";

        try {
          const data = await response.json();
          message = data?.error || message;
        } catch {
          // Keep default message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${receiptNumber}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to download receipt PDF."
      );
    } finally {
      setDownloading(null);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-600">Loading receipts...</p>
      </div>
    );
  }

  if (!user?.isOwner) {
    return (
      <div className="space-y-6">
        <header className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-red-900">
            Access Restricted
          </h1>

          <p className="mt-2 text-sm text-red-700">
            Receipts are available to the Owner only.
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-950">
                Receipts
              </h1>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Owner Only
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-600">
              View payment receipts and download official PDF receipts.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
            <div className="text-xs text-slate-500">
              Total Receipts
            </div>

            <div className="text-xl font-semibold text-slate-950">
              {items.length}
            </div>
          </div>

        </div>
      </header>

      {/* ERROR */}
      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SEARCH */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Search Receipts
        </label>

        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by receipt number, member ID or name..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
          />
        </div>
      </section>

      {/* RECEIPTS TABLE */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Payment Receipts
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {filteredItems.length} receipt
                {filteredItems.length === 1 ? "" : "s"} found
              </p>
            </div>
          </div>
        </div>

        {filteredItems.length ? (
          <div className="overflow-x-auto">

            <table className="min-w-full text-left">

              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">

                  <th className="px-5 py-4">
                    Receipt No
                  </th>

                  <th className="px-5 py-4">
                    Member
                  </th>

                  <th className="px-5 py-4">
                    Member ID
                  </th>

                  <th className="px-5 py-4">
                    Month
                  </th>

                  <th className="px-5 py-4">
                    Amount
                  </th>

                  <th className="px-5 py-4">
                    Date
                  </th>

                  <th className="px-5 py-4">
                    Time
                  </th>

                  <th className="px-5 py-4 text-right">
                    PDF
                  </th>

                </tr>
              </thead>

              <tbody>

                {filteredItems.map((item) => {

                  const issuedDate = new Date(item.issuedAt);

                  const dateText = issuedDate.toLocaleDateString(
                    "en-GB"
                  );

                  const timeText = issuedDate.toLocaleTimeString(
                    "en-GB",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }
                  );

                  const monthText =
                    item.month >= 1 && item.month <= 12
                      ? MONTHS[item.month - 1]
                      : String(item.month);

                  return (
                    <tr
                      key={item.id || item.receiptNumber}
                      className="border-b border-slate-100 transition hover:bg-slate-50"
                    >

                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {item.receiptNumber}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {item.member?.fullName || "—"}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                        {item.member?.memberId || "—"}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                        {monthText}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="font-semibold text-slate-900">
                          Rs. {Number(item.amount || 0).toLocaleString()}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                        {dateText}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                        {timeText}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right">

                        <button
                          type="button"
                          onClick={() =>
                            downloadPdf(item.receiptNumber)
                          }
                          disabled={
                            downloading === item.receiptNumber
                          }
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >

                          {downloading === item.receiptNumber ? (
                            <>
                              <span className="animate-spin">
                                ⟳
                              </span>
                              Generating...
                            </>
                          ) : (
                            <>
                              ↓
                              Download PDF
                            </>
                          )}

                        </button>

                      </td>

                    </tr>
                  );
                })}

              </tbody>

            </table>

          </div>
        ) : (
          <div className="px-6 py-16 text-center">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
              🧾
            </div>

            <h3 className="mt-4 text-base font-semibold text-slate-900">
              No receipts found
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              {search
                ? "Try a different search."
                : "Receipts will appear here after payments are recorded."}
            </p>

          </div>
        )}

      </section>

    </div>
  );
}
