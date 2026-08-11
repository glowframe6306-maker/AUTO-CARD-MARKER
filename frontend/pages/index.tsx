import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type UploadResponse = {
  file_name: string;
  members: number;
  name_column: string;
  month_columns: string[];
};

type CardResult = {
  card: string;
  detected_name: string | null;
  detected_month: string | null;
  matched_name?: string;
  confidence: number;
  status: string;
  already_marked?: boolean;
  message?: string;
  raw_text?: string;
  possible_matches?: { matched_name: string; confidence: number }[];
};

type StatusResponse = {
  sheet_loaded: boolean;
  statistics: Record<string, number>;
  results: CardResult[];
};

const formatStatus = (status: string) => status.replace(/ /g, " ");

export default function Home() {
  const [token, setToken] = useState<string>("");
  const [password, setPassword] = useState("");
  const [sheetInfo, setSheetInfo] = useState<UploadResponse | null>(null);
  const [sheetFileName, setSheetFileName] = useState("");
  const [selectedSheet, setSelectedSheet] = useState<File | null>(null);
  const [selectedCards, setSelectedCards] = useState<File[]>([]);
  const [cards, setCards] = useState<{ filename: string; path: string }[]>([]);
  const [results, setResults] = useState<CardResult[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [reviewCard, setReviewCard] = useState<CardResult | null>(null);
  const [confirmMatchName, setConfirmMatchName] = useState("");
  const [confirmMonth, setConfirmMonth] = useState("");

  const months = useMemo(
    () => [
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
    ],
    []
  );

  useEffect(() => {
    if (!token) return;
    fetchStatus();
  }, [token]);

  async function login() {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("password", password);
      const response = await fetch(`${BACKEND_URL}/login`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error("Login failed");
      const data = await response.json();
      setToken(data.token);
      setNotification("Administrator login succeeded.");
    } catch (error) {
      setNotification("Login failed. Check your password.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStatus() {
    try {
      const response = await fetch(`${BACKEND_URL}/status?auth_token=${encodeURIComponent(token)}`);
      if (!response.ok) return;
      const data = await response.json();
      setStatus(data);
      if (data.results) {
        setResults(data.results);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function uploadSheet() {
    if (!selectedSheet) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("token", token);
      form.append("file", selectedSheet);
      const response = await fetch(`${BACKEND_URL}/upload-sheet`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail || "Upload failed");
      }
      const data = await response.json();
      setSheetInfo(data);
      setSheetFileName(selectedSheet.name);
      setNotification("Member sheet uploaded successfully.");
    } catch (error) {
      setNotification((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadCards() {
    if (!selectedCards.length) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("token", token);
      selectedCards.forEach((file) => form.append("files", file));
      const response = await fetch(`${BACKEND_URL}/upload-cards`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail || "Card upload failed");
      }
      const data = await response.json();
      setCards(selectedCards.map((file) => ({ filename: file.name, path: "" })));
      setNotification(`Uploaded ${data.uploaded.length} card(s).`);
      await fetchStatus();
    } catch (error) {
      setNotification((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function processCards() {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/process-cards`, {
        method: "POST",
        body: new URLSearchParams({ token }),
      });
      if (!response.ok) throw new Error("Processing failed");
      const data = await response.json();
      setResults(data.results);
      setStatus(data);
      setNotification("Card processing completed.");
    } catch (error) {
      setNotification((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!reviewCard) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("token", token);
      form.append("match_name", confirmMatchName);
      form.append("month", confirmMonth);
      form.append("card", reviewCard.card);
      const response = await fetch(`${BACKEND_URL}/confirm`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail || "Confirmation failed");
      }
      const result = await response.json();
      setNotification("Manual review submitted.");
      setReviewCard(null);
      await processCards();
    } catch (error) {
      setNotification((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadUpdatedSheet() {
    try {
      const response = await fetch(`${BACKEND_URL}/download?auth_token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "updated-sheet.xlsx";
      anchor.click();
      URL.revokeObjectURL(href);
      setNotification("Updated spreadsheet downloaded.");
    } catch (error) {
      setNotification((error as Error).message);
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>Administrator Auto Card Marking</h1>
        <p>Automatically detect member names and months from uploaded cards.</p>
      </div>

      {!token ? (
        <div className="card section">
          <h2>Admin Login</h2>
          <div className="field-group">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Administrator password"
              type="password"
            />
            <button className="button" onClick={login} disabled={loading || !password}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card section">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <h2>Dashboard</h2>
                <p>Upload the member sheet and card images to begin automated marking.</p>
              </div>
              <button className="button secondary" onClick={downloadUpdatedSheet} disabled={!sheetInfo}>
                Download Updated Spreadsheet
              </button>
            </div>

            <div className="field-group" style={{ marginTop: "18px" }}>
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
