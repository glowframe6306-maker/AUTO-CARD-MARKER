import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

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
          <button
            type="button"
            className="button"
            onClick={async () => {
              const response = await authFetch(
                `${getApiUrl()}/api/reports/payments/export/csv`
              );

              if (!response.ok) {
                throw new Error("CSV download failed.");
              }

              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement("a");

              link.href = url;
              link.download = "payments-report.csv";
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.URL.revokeObjectURL(url);
            }}
          >
            Download CSV
          </button>

          <button
            type="button"
            className="button"
            onClick={async () => {
              const response = await authFetch(
                `${getApiUrl()}/api/reports/payments/export/excel`
              );

              if (!response.ok) {
                throw new Error("Excel download failed.");
              }

              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement("a");

              link.href = url;
              link.download = "payments-report.xlsx";
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.URL.revokeObjectURL(url);
            }}
          >
            Download Excel
          </button>

          <button
            type="button"
            className="button"
            onClick={async () => {
              const response = await authFetch(
                `${getApiUrl()}/api/reports/payments/export/pdf`
              );

              if (!response.ok) {
                throw new Error("PDF download failed.");
              }

              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement("a");

              link.href = url;
              link.download = "payments-report.pdf";
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.URL.revokeObjectURL(url);
            }}
          >
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}


