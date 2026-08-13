import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";
import { useAuth } from "../lib/useAuth";

export default function Payments() {
  const { user, isLoading } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || isLoading) return;
    if (user.memberProfile?.memberId) {
      fetcher(`${getApiUrl()}/api/payments/member/${user.memberProfile.memberId}`)
        .then(setPayments)
        .catch((err) => setError(err.message));
    }
  }, [user, isLoading]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Payments</h1>
        <p className="mt-2 text-sm text-slate-600">View member payment histories and balance details.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      {user?.memberProfile ? (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {payments.length ? (
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-4">Month</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Weeks Paid</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-800">{payment.month}</td>
                    <td className="py-3 px-4 text-sm text-slate-800">Rs. {payment.paymentAmount}</td>
                    <td className="py-3 px-4 text-sm text-slate-800">{payment.totalWeeks}</td>
                    <td className="py-3 px-4 text-sm text-slate-800">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-sm text-slate-800">{payment.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-600">No payments found for your member record yet.</p>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">This page is designed to show member payments. Admin users can manage payments through the backend API if needed.</p>
        </div>
      )}
    </div>
  );
}
