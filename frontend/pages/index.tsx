import { FormEvent, useState } from "react";
import { authFetch, getApiUrl, setAuthToken } from "../lib/api";
import { initMediaStream } from "../lib/media";

export default function Home() {
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestCameraAndMicrophonePermission() {
    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });

      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.warn("Camera/microphone permission was not granted.", error);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const authUrl = `${getApiUrl()}/api/auth/login`;
      const response = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, password }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Login failed.");
      }
      const data = await response.json();
      setAuthToken(data.token);

      const meResponse = await authFetch(`${getApiUrl()}/api/auth/me`);
      if (meResponse.ok) {
        // request camera/microphone permission once at login
        try {
          await initMediaStream();
        } catch (e) {
          // ignore failures; do not block login
        }
      }

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

