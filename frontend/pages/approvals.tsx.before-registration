import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function Approvals() {
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/approvals/pending`)
      .then(setRequests)
      .catch((err) => setError(err.message));
  }, []);

  async function review(requestId: string, approved: boolean) {
    try {
      const response = await authFetch(`${getApiUrl()}/api/approvals/review/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, reviewReason: approved ? "Approved via dashboard" : "Rejected via dashboard" }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to review request.");
      }
      setRequests((current) => current.filter((item) => item.requestId !== requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Approvals</h1>
        <p className="mt-2 text-sm text-slate-600">Owner approval queue for pending member and system changes.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      {requests.length ? (
        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request.requestId} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-base font-semibold text-slate-950">{request.targetType} - {request.targetId}</p>
              <p className="mt-2 text-sm text-slate-600">Action: {request.actionType}</p>
              <p className="mt-1 text-sm text-slate-600">Reason: {request.reason}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => review(request.requestId, true)} className="button">Approve</button>
                <button onClick={() => review(request.requestId, false)} className="button secondary">Reject</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">No pending approvals at this time.</div>
      )}
    </div>
  );
}
