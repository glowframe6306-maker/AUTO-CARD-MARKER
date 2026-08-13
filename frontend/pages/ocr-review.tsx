import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

export default function OcrReview() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetcher(`${getApiUrl()}/api/cards/review`)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function reviewItem(id: number, approved: boolean) {
    setError(null);
    try {
      const response = await authFetch(`${getApiUrl()}/api/cards/review/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, comments: approved ? "Approved." : "Rejected.", correctedName: approved ? undefined : undefined }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to review item.");
      }
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error reviewing item.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">OCR Review</h1>
        <p className="mt-2 text-sm text-slate-600">Review pending OCR card matches and approve or reject entries.</p>
      </header>

      {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">Loading review queue...</div>
      ) : items.length ? (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-base font-semibold text-slate-950">Upload: {item.cardUpload.originalName}</p>
              <p className="mt-2 text-sm text-slate-600">Detected name: {item.detectedName || "Unknown"}</p>
              <p className="text-sm text-slate-600">Detected month: {item.detectedMonth || "Unknown"}</p>
              <p className="text-sm text-slate-600">Confidence: {Math.round((item.confidence || 0) * 100)}%</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => reviewItem(item.id, true)} className="button">Approve</button>
                <button onClick={() => reviewItem(item.id, false)} className="button secondary">Reject</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">No pending OCR review items found.</div>
      )}
    </div>
  );
}
