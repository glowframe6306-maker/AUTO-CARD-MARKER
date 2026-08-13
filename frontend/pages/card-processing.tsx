import { useState } from "react";
import { authFetch, getApiUrl } from "../lib/api";

export default function CardProcessing() {
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!cardFile) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("card", cardFile);

    try {
      const response = await authFetch(`${getApiUrl()}/api/cards/upload`, { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Upload failed.");
      }
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload card.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Card Processing</h1>
        <p className="mt-2 text-sm text-slate-600">Upload OCR cards to process payments and detect monthly dues automatically.</p>
      </header>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Select card image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setCardFile(event.target.files?.[0] ?? null)}
              className="mt-3 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3"
            />
          </label>
          <button
            onClick={handleUpload}
            disabled={!cardFile || loading}
            className="button"
          >
            {loading ? "Uploading..." : "Upload and process card"}
          </button>
          {error && <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          {result && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-900">
              <p><strong>OCR Result</strong></p>
              <p>Name: {result.ocr?.detectedName || "N/A"}</p>
              <p>Month: {result.ocr?.detectedMonth || "N/A"}</p>
              <p>Amount: {result.ocr?.detectedAmount ?? "N/A"}</p>
              <p>Status: {result.ocr?.status || "N/A"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
