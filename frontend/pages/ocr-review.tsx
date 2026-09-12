import { useEffect, useState } from "react";
import { authFetch, fetcher, getApiUrl } from "../lib/api";

function getCardPreviewUrl(filePath: string | null | undefined) {
  if (!filePath) return null;

  const fileName = filePath.split(/[\\/]/).pop();
  if (!fileName) return null;

  return `${getApiUrl()}/uploads/${encodeURIComponent(fileName)}`;
}

export default function OcrReview() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadItems() {
      setLoading(true);
      setError(null);

      try {
        const [cardsReview, paymentRequestsReview] = await Promise.all([
          fetcher(`${getApiUrl()}/api/cards/review`),
          fetcher(`${getApiUrl()}/api/payments/requests/review`),
        ]);

        const merged = [
          ...cardsReview.map((item: any) => ({ ...item, itemType: "ocr" })),
          ...paymentRequestsReview.map((item: any) => ({ ...item, itemType: "paymentRequest" })),
        ].sort((a, b) => {
          const aTime = new Date(a.submittedAt ?? a.createdAt ?? 0).getTime();
          const bTime = new Date(b.submittedAt ?? b.createdAt ?? 0).getTime();
          return bTime - aTime;
        });

        if (active) {
          setItems(merged);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load review queue."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadItems();

    return () => {
      active = false;
    };
  }, []);

  async function reviewItem(id: number, approved: boolean) {
    setError(null);
    try {
      const response = await authFetch(`${getApiUrl()}/api/cards/review/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved,
          comments: approved ? "Approved." : "Rejected.",
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to review item.");
      }

      setItems((current) =>
        current.filter((item) => !(item.itemType === "ocr" && item.id === id))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error reviewing item.");
    }
  }

  async function reviewPaymentRequest(id: number, approved: boolean) {
    setError(null);
    try {
      const response = await authFetch(
        `${getApiUrl()}/api/payments/requests/${id}/${approved ? "allow" : "deny"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: approved ? "Approved by OCR review." : "Rejected by OCR review.",
          }),
        }
      );

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to review payment request.");
      }

      setItems((current) =>
        current.filter(
          (item) => !(item.itemType === "paymentRequest" && item.id === id)
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error reviewing payment request."
      );
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">OCR Review</h1>
        <p className="mt-2 text-sm text-slate-600">
          Review pending OCR card matches, payment requests, and approve or reject entries.
        </p>
      </header>

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">
          Loading review queue...
        </div>
      ) : items.length ? (
        <div className="space-y-4">
          {items.map((item) => {
            const previewUrl = getCardPreviewUrl(item.cardUpload?.filePath);

            return (
              <div
                key={`${item.itemType}-${item.id}`}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-base font-semibold text-slate-950">
                    {item.itemType === "paymentRequest"
                      ? `Payment Request: ${item.fullName || "Member"}`
                      : `Upload: ${item.cardUpload?.originalName || "Card Upload"}`}
                  </p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-600">
                    {item.itemType === "paymentRequest" ? "Payment Request" : "OCR Review"}
                  </span>
                </div>

                {item.itemType === "paymentRequest" ? (
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <p><span className="font-semibold text-slate-800">Member Full Name:</span> {item.fullName || "Unknown"}</p>
                    <p><span className="font-semibold text-slate-800">RC Number:</span> {item.member?.memberId || "Unknown"}</p>
                    <p><span className="font-semibold text-slate-800">Account ID:</span> {item.member?.user?.accountId || "Unknown"}</p>
                    <p><span className="font-semibold text-slate-800">Selected Month:</span> {item.requestedMonth ? `Month ${item.requestedMonth}` : "Unknown"}</p>
                    <p><span className="font-semibold text-slate-800">Amount:</span> LKR {Number(item.amount || 0).toLocaleString()}</p>
                    <p><span className="font-semibold text-slate-800">Status:</span> {item.status}</p>
                    <p><span className="font-semibold text-slate-800">Submitted:</span> {new Date(item.submittedAt || item.createdAt).toLocaleString()}</p>
                    <p><span className="font-semibold text-slate-800">Request ID:</span> {item.id}</p>
                    <p className="md:col-span-2"><span className="font-semibold text-slate-800">Notes:</span> {item.note || "No notes provided."}</p>
                    <p className="md:col-span-2"><span className="font-semibold text-slate-800">Uploaded Card/Proof:</span> {item.cardUpload?.originalName || "No file uploaded"}</p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <p><span className="font-semibold text-slate-800">Detected name:</span> {item.detectedName || "Unknown"}</p>
                    <p><span className="font-semibold text-slate-800">Detected month:</span> {item.detectedMonth || "Unknown"}</p>
                    <p><span className="font-semibold text-slate-800">Detected amount:</span> {item.detectedAmount ?? "Unknown"}</p>
                    <p><span className="font-semibold text-slate-800">Confidence:</span> {Math.round((item.confidence || 0) * 100)}%</p>
                  </div>
                )}

                {previewUrl && (
                  <div className="mt-4">
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-600 underline"
                    >
                      Open uploaded card/proof
                    </a>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  {item.itemType === "paymentRequest" ? (
                    <>
                      <button onClick={() => reviewPaymentRequest(item.id, true)} className="button">
                        Approve
                      </button>
                      <button onClick={() => reviewPaymentRequest(item.id, false)} className="button secondary">
                        Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => reviewItem(item.id, true)} className="button">
                        Approve
                      </button>
                      <button onClick={() => reviewItem(item.id, false)} className="button secondary">
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-600">
          No pending OCR review items found.
        </div>
      )}
    </div>
  );
}
