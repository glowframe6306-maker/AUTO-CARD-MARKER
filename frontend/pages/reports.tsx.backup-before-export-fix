import { useEffect, useState } from "react";
import { fetcher, getApiUrl } from "../lib/api";

export default function Reports() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/reports/dashboard`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Reports</h1>
        <p className="mt-2 text-sm text-slate-600">Generate and export payment reports, CSV, Excel, and PDF records.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Members</p>
          <p className="mt-4 text-3xl font-semibold text-slate-950">{data?.totalMembers ?? "--"}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Collection</p>
          <p className="mt-4 text-3xl font-semibold text-brand-700">Rs. {data?.totalCollection ?? "--"}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Unpaid Payments</p>
          <p className="mt-4 text-3xl font-semibold text-slate-950">{data?.unpaidPayments ?? "--"}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <a href={`${getApiUrl()}/api/reports/payments/export/csv`} className="button">Download CSV</a>
          <a href={`${getApiUrl()}/api/reports/payments/export/excel`} className="button">Download Excel</a>
          <a href={`${getApiUrl()}/api/reports/payments/export/pdf`} className="button">Download PDF</a>
        </div>
      </div>
    </div>
  );
}
