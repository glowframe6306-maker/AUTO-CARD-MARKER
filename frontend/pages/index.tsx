import { useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, password }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Login failed.");
      }
      const data = await response.json();
      localStorage.setItem("authToken", data.token);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 lg:flex-row lg:items-center lg:justify-between">
        <section className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Readers Circle Management</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            READERS CIRCLE OF T.B. JAYAH ZAHIRA COLLEGE, COLOMBO 02
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-700">
            AUTO MONTHLY CARD PAYMENT MARKING SYSTEM designed for secure member payments, OCR card processing, role-based administration, and reliable audit workflows.
          </p>
        </section>

        <section className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-10 shadow-xl">
          <div className="mb-8 space-y-3">
            <p className="text-sm uppercase tracking-[0.24em] text-brand-600">Secure Sign In</p>
            <h2 className="text-2xl font-semibold text-slate-950">Account ID and password</h2>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              Account ID
              <input
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                placeholder="Enter your account ID"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
            </label>
            {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={!accountId || !password || loading}
              className="w-full rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-8 rounded-3xl bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Secure access for all roles</p>
            <p className="mt-2">Owner, Super Admin, Administrator, Admin and Member roles use the same central backend with strong authentication.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
              <div>
                <strong>Total Cards</strong>
                <div>{status?.statistics.total_cards ?? 0}</div>
              </div>
              <div>
                <strong>Processed</strong>
                <div>{status?.statistics.processed ?? 0}</div>
              </div>
              <div>
                <strong>Marked</strong>
                <div>{status?.statistics.marked ?? 0}</div>
              </div>
              <div>
                <strong>Already Marked</strong>
                <div>{status?.statistics.already_marked ?? 0}</div>
              </div>
              <div>
                <strong>Needs Review</strong>
                <div>{status?.statistics.needs_review ?? 0}</div>
              </div>
              <div>
                <strong>Failed</strong>
                <div>{status?.statistics.failed ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="card section">
            <h2>Upload Member Sheet</h2>
            <div className="input-file" onClick={() => document.getElementById("sheet-upload")?.click()}>
              <input
                type="file"
                id="sheet-upload"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => setSelectedSheet(event.target.files?.[0] ?? null)}
              />
              {selectedSheet ? selectedSheet.name : "Click here to select a .csv, .xlsx, or .xls file"}
            </div>
            <button className="button" onClick={uploadSheet} disabled={!selectedSheet || loading}>
              Upload Sheet
            </button>
            {sheetInfo && (
              <div className="notification">
                <p><strong>File:</strong> {sheetFileName}</p>
                <p><strong>Members:</strong> {sheetInfo.members}</p>
                <p><strong>Name Column:</strong> {sheetInfo.name_column}</p>
                <p><strong>Month Columns:</strong> {sheetInfo.month_columns.join(", ")}</p>
              </div>
            )}
          </div>

          <div className="card section">
            <h2>Upload Card Images</h2>
            <div className="input-file" onClick={() => document.getElementById("cards-upload")?.click()}>
              <input
                type="file"
                id="cards-upload"
                accept=".jpg,.jpeg,.png,.webp"
                multiple
                onChange={(event) => setSelectedCards(Array.from(event.target.files ?? []))}
              />
              {selectedCards.length > 0
                ? selectedCards.map((file) => file.name).join(", ")
                : "Drag and drop or click to select card images"}
            </div>
            <button className="button" onClick={uploadCards} disabled={!selectedCards.length || loading || !sheetInfo}>
              Upload Cards
            </button>
            <div className="notification">
              {cards.length > 0 ? (
                <>
                  <strong>Queued cards:</strong> {cards.map((card) => card.filename).join(", ")}
                </>
              ) : (
                "No cards uploaded yet."
              )}
            </div>
          </div>

          <div className="card section">
            <h2>Process Cards</h2>
            <button className="button" onClick={processCards} disabled={loading || !cards.length}>
              {loading ? "Processing..." : "Start OCR Processing"}
            </button>
          </div>

          <div className="card section">
            <h2>Processing Table</h2>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Card</th>
                    <th>Detected Name</th>
                    <th>Detected Month</th>
                    <th>Matched Name</th>
                    <th>Confidence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={`${result.card}-${result.status}`}>
                      <td>{result.card}</td>
                      <td>{result.detected_name ?? "—"}</td>
                      <td>{result.detected_month ?? "—"}</td>
                      <td>{result.matched_name ?? "—"}</td>
                      <td>{Math.round(result.confidence * 100)}%</td>
                      <td>
                        <span className={`status-chip status-${result.status.replace(/ /g, "\\ ")}`}>
                          {result.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {results.some((item) => item.status === "Needs Review") && (
            <div className="card section">
              <h2>Review Required</h2>
              {results.filter((item) => item.status === "Needs Review").map((result) => (
                <div key={result.card} className="review-card">
                  <div>
                    <strong>{result.card}</strong> — {result.message}
                  </div>
                  <p><strong>OCR Text:</strong></p>
                  <pre>{result.raw_text}</pre>
                  <div className="tag-list">
                    <div className="card-chip">Detected Name: {result.detected_name ?? "Unknown"}</div>
                    <div className="card-chip">Detected Month: {result.detected_month ?? "Unknown"}</div>
                  </div>
                  <div>
                    <strong>Possible matches:</strong>
                    <div className="tag-list">
                      {result.possible_matches?.map((match) => (
                        <button
                          key={match.matched_name}
                          className={`card-chip ${confirmMatchName === match.matched_name ? "selected" : ""}`}
                          type="button"
                          onClick={() => {
                            setReviewCard(result);
                            setConfirmMatchName(match.matched_name);
                            setConfirmMonth(result.detected_month || "");
                          }}
                        >
                          {match.matched_name} — {Math.round(match.confidence * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field-group">
                    <input
                      value={confirmMatchName}
                      onChange={(event) => setConfirmMatchName(event.target.value)}
                      placeholder="Confirm member name"
                    />
                    <select value={confirmMonth} onChange={(event) => setConfirmMonth(event.target.value)}>
                      <option value="">Select month</option>
                      {months.map((month) => (
                        <option key={month} value={month}>{month}</option>
                      ))}
                    </select>
                  </div>
                  <button className="button" onClick={handleConfirm} disabled={!confirmMatchName || !confirmMonth || loading}>
                    Confirm Review
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {notification && <div className="notification">{notification}</div>}
    </div>
  );
}
