import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";
import { useAuth } from "../lib/useAuth";

export default function Receipts() {
  const { user, isLoading } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !user) return;
    fetcher(`${getApiUrl()}/api/receipts`)
      .then((result) => {
        if (Array.isArray(result)) {
          setItems(result);
        } else if (result?.data) {
          setItems(result.data);
        } else {
          setItems([]);
        }
      })
      .catch((err) => setError(err.message));
  }, [user, isLoading]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Receipts</h1>
        <p className="mt-2 text-sm text-slate-600">View your receipt history or system receipts depending on your role.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {items.length ? (
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-3 px-4">Receipt</th>
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item.receiptNumber} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-sm text-slate-800">{item.receiptNumber ?? item.id}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{item.member?.memberId ?? item.memberId ?? "—"}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">Rs. {item.amount ?? item.paymentAmount ?? "—"}</td>
                  <td className="py-3 px-4 text-sm text-slate-800">{item.issuedAt ? new Date(item.issuedAt).toLocaleDateString() : item.paymentDate ? new Date(item.paymentDate).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-600">No receipts available for your account.</p>
        )}
      </div>
    </div>
  );
}
