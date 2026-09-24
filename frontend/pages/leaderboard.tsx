import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Crown, Sparkles, TrendingUp, ShieldAlert } from "lucide-react";
import { authFetch, getApiUrl } from "../lib/api";
import { useAuth } from "../lib/useAuth";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const categoryColors: Record<string, string> = {
  MONTHLY_PAYMENT: "from-emerald-500 to-teal-500",
  DAILY_APP_VISIT: "from-sky-500 to-cyan-500",
  DISCIPLINE: "from-violet-500 to-purple-500",
  MEETING_ATTENDANCE: "from-amber-500 to-orange-500",
  VOLUNTEER_ACTIVITY: "from-pink-500 to-rose-500",
  ASSIGNED_TASK: "from-blue-500 to-indigo-500",
  HELPING_OTHER_MEMBERS: "from-fuchsia-500 to-violet-500",
  CREATIVE_IDEA_SUBMISSION: "from-cyan-500 to-blue-500",
  APPROVED_PROJECT_PROPOSAL: "from-yellow-500 to-amber-500",
  EXCELLENT_TEAMWORK: "from-rose-500 to-pink-500",
};

function formatCategoryLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getEarnedCategoryPoints(member: any, categoryValue: string) {
  const points = Number(member?.categoryTotals?.[categoryValue]);
  return Number.isFinite(points) ? points : 0;
}

function rankLabel(rank: number) {
  return rank === 1 ? "1ST" : rank === 2 ? "2ND" : "3RD";
}

function rankMedal(rank: number) {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
}

function rankPresentation(rank: number) {
  return `${rankMedal(rank)} ${rankLabel(rank)} PLACE`;
}

export default function LeaderboardPage() {
  const { user, isLoading } = useAuth();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [member, setMember] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualPoints, setManualPoints] = useState({ memberId: "", category: "DISCIPLINE", amount: "10", description: "" });
  const [reduction, setReduction] = useState({ memberId: "", category: "DISCIPLINE", amount: "5", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [monthlyWinners, setMonthlyWinners] = useState<any[]>([]);
  const [isMonthlyWinnersEditing, setIsMonthlyWinnersEditing] = useState(false);
  const [showMonthlyWinnerForm, setShowMonthlyWinnerForm] = useState(false);
  const [monthlyWinnerForm, setMonthlyWinnerForm] = useState({
    name: "",
    rcNumber: "",
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
  });
  const [monthlyWinnerMessage, setMonthlyWinnerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isMonthlyWinnerSubmitting, setIsMonthlyWinnerSubmitting] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [leaderboardLoaded, setLeaderboardLoaded] = useState(false);
  const [celebration, setCelebration] = useState<{ name: string; rankKey: number; rankDisplay: string } | null>(null);
  const [celebrationClosing, setCelebrationClosing] = useState(false);
  const [celebrationRunning, setCelebrationRunning] = useState(false);
  const celebrationCheckedRef = useRef(false);

  const loadData = async () => {
    if (!user) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      setLoading(true);
      const response = await authFetch(`${getApiUrl()}/api/leaderboard`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error("Unable to load leaderboard data.");
      }
      const monthlyWinnersResponse = await authFetch(`${getApiUrl()}/api/leaderboard/monthly-winners`, { signal: controller.signal });
      if (!monthlyWinnersResponse.ok) {
        throw new Error("Unable to load monthly winners.");
      }
      const data = await response.json();
      const monthlyWinnersData = await monthlyWinnersResponse.json();
      setSummary(data);
      setLeaderboard(Array.isArray(data?.leaderboard) ? data.leaderboard : []);
      setCategories(Array.isArray(data?.categories) ? data.categories : []);
      setMember(data?.member ?? null);
      setMonthlyWinners(Array.isArray(monthlyWinnersData) ? monthlyWinnersData : []);
      setIsOwner(Boolean(user?.isOwner));
      setLeaderboardLoaded(true);

      setError(null);
    } catch (err: any) {
      setError(err?.name === "AbortError" ? "Leaderboard request timed out. Please try again." : err?.message || "Unable to load leaderboard.");
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      window.location.href = "/";
      return;
    }
    if (user.isOwner === true) {
      setIsOwner(true);
    }
    void loadData();

    const refreshTimer = window.setInterval(() => {
      void loadData();
    }, 15000);

    return () => window.clearInterval(refreshTimer);
  }, [user, isLoading]);

  useEffect(() => {
    if (!leaderboardLoaded || !user || celebrationCheckedRef.current) return;
    celebrationCheckedRef.current = true;

    const rankedMember = leaderboard.find((entry) =>
      String(entry.userId ?? entry.id) === String(user.id)
      || (user.accountId && String(entry.accountId) === String(user.accountId))
    );
    const rank = Number(member?.rank ?? (rankedMember ? leaderboard.indexOf(rankedMember) + 1 : 0));
    const name = String(member?.fullName || rankedMember?.fullName || user.fullName || "").trim();
    if (rank >= 1 && rank <= 3 && name) {
      setCelebration({ name, rankKey: rank, rankDisplay: rankPresentation(rank) });
    }
  }, [leaderboardLoaded, leaderboard, member, user]);

  function continueCelebration() {
    setCelebrationClosing(true);
    setCelebrationRunning(true);
    window.setTimeout(() => {
      setCelebration(null);
      setCelebrationClosing(false);
    }, 280);
    window.setTimeout(() => setCelebrationRunning(false), 5200);
  }

  const topThree = useMemo(() => leaderboard.slice(0, 3), [leaderboard]);
  const ownerCategories = useMemo(
    () => categories.filter((category) => !["MONTHLY_PAYMENT", "DAILY_APP_VISIT"].includes(category.value)),
    [categories]
  );

  const handleAward = async () => {
    if (!user?.isOwner) return;
    if (!manualPoints.memberId) {
      alert("Choose a member first.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await authFetch(`${getApiUrl()}/api/leaderboard/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: Number(manualPoints.memberId),
          category: manualPoints.category,
          amount: Number(manualPoints.amount),
          description: manualPoints.description || undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to award points.");
      }

      alert(`Awarded ${manualPoints.amount} points successfully.`);
      setManualPoints((current) => ({ ...current, amount: "10", description: "" }));
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Unable to award points.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReduction = async () => {
    if (!user?.isOwner) return;
    if (!reduction.memberId) {
      alert("Choose a member first.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await authFetch(`${getApiUrl()}/api/leaderboard/reduction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: Number(reduction.memberId),
          category: reduction.category,
          amount: Number(reduction.amount),
          description: reduction.description || undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to reduce points.");
      }

      alert(`Reduced ${reduction.amount} points successfully.`);
      setReduction((current) => ({ ...current, amount: "5", description: "" }));
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Unable to reduce points.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!user?.isOwner) return;
    const confirmed = window.confirm("WARNING: This will reset all existing members' current leaderboard points to 0. Members, accounts, payments, roles, profiles, categories, and point values will not be changed. Continue?");
    if (!confirmed) return;

    try {
      setIsResetting(true);
      setResetMessage(null);
      const response = await authFetch(`${getApiUrl()}/api/leaderboard/reset`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to reset leaderboard points.");
      }

      await loadData();
      setResetMessage({ type: "success", text: "Leaderboard reset successfully. All members now have 0 points." });
    } catch (err: any) {
      setResetMessage({ type: "error", text: err?.message || "Unable to reset leaderboard points. No changes were made." });
    } finally {
      setIsResetting(false);
    }
  };

  const handlePublishMonthlyWinner = async () => {
    if (!user?.isOwner) return;

    const name = monthlyWinnerForm.name.trim();
    const rcNumber = monthlyWinnerForm.rcNumber.trim();
    const month = Number(monthlyWinnerForm.month);
    const year = Number(monthlyWinnerForm.year);
    if (!name || !rcNumber || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1 || year > 9999) {
      setMonthlyWinnerMessage({ type: "error", text: "Enter a name, RC number, month, and year." });
      return;
    }

    try {
      setIsMonthlyWinnerSubmitting(true);
      setMonthlyWinnerMessage(null);
      const response = await authFetch(`${getApiUrl()}/api/leaderboard/monthly-winners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rcNumber, month, year }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to publish monthly winner.");

      setMonthlyWinners((current) => [payload, ...current]);
      setMonthlyWinnerForm({ name: "", rcNumber: "", month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
      setShowMonthlyWinnerForm(false);
      setMonthlyWinnerMessage({ type: "success", text: "Monthly winner published successfully." });
    } catch (err: any) {
      setMonthlyWinnerMessage({ type: "error", text: err?.message || "Unable to publish monthly winner." });
    } finally {
      setIsMonthlyWinnerSubmitting(false);
    }
  };

  const handleDeleteMonthlyWinner = async (id: number) => {
    if (!user?.isOwner || !window.confirm("Delete this monthly winner record?")) return;

    try {
      setMonthlyWinnerMessage(null);
      const response = await authFetch(`${getApiUrl()}/api/leaderboard/monthly-winners/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to delete monthly winner.");

      setMonthlyWinners((current) => current.filter((record) => record.id !== id));
      setMonthlyWinnerMessage({ type: "success", text: "Monthly winner deleted successfully." });
    } catch (err: any) {
      setMonthlyWinnerMessage({ type: "error", text: err?.message || "Unable to delete monthly winner." });
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-lg font-semibold text-slate-600">Checking authentication...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-7xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-lg font-semibold text-red-700">Unable to authenticate. Please sign in again.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-lg font-semibold text-slate-600">Loading leaderboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      {celebration && (
        <div className={`celebration-backdrop ${celebrationClosing ? "celebration-backdrop-closing" : ""} fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm`} role="dialog" aria-modal="true" aria-label="Leaderboard achievement">
          <div className={`celebration-dialog ${celebrationClosing ? "celebration-dialog-closing" : ""} relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overflow-x-hidden rounded-[32px] border border-white/20 bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-950 p-8 text-center text-white shadow-2xl sm:p-10`}>
            <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-12 h-52 w-52 rounded-full bg-fuchsia-500/25 blur-3xl" />
            <Sparkles className="celebration-item celebration-item-1 relative mx-auto text-yellow-300" size={38} />
            <p className="celebration-item celebration-item-2 relative mt-5 text-xs font-black uppercase tracking-[0.35em] text-cyan-200">CONGRATULATIONS!</p>
            <h2 className="celebration-item celebration-item-3 relative mt-4 truncate text-3xl font-black sm:text-4xl">{celebration.name}</h2>
            <p className="celebration-item celebration-item-5 relative mt-6 text-sm font-black uppercase tracking-[0.3em] text-indigo-200">YOU&apos;VE ACHIEVED</p>
            <div className={`celebration-rank celebration-rank-${celebration.rankKey} celebration-item-6 relative mt-3`}>
              <p className="celebration-rank-label mt-1 text-4xl font-black text-yellow-300 sm:text-5xl">{celebration.rankDisplay}</p>
            </div>
            <p className="celebration-item celebration-item-7 relative mt-4 text-lg font-black text-indigo-100">A Remarkable Achievement! <span aria-hidden="true">✨</span></p>
            <p className="celebration-item celebration-item-8 relative mt-4 text-sm font-bold leading-6 text-indigo-100">You&apos;ve earned a well-deserved place among the<br /><strong>Top 3 members of the AUTO CARD MARKING Leaderboard.</strong></p>
            <p className="celebration-item celebration-item-9 relative mt-5 text-sm font-semibold leading-6 text-indigo-100">Your dedication and consistency have made this achievement possible. <span aria-hidden="true">🌟</span></p>
            <button type="button" onClick={continueCelebration} className="celebration-item celebration-item-10 relative mt-8 w-full rounded-2xl bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.25em] text-indigo-950 shadow-lg transition hover:scale-[1.02] hover:bg-cyan-50">CONTINUE</button>
            <style jsx global>{`
              .celebration-backdrop { animation: celebrationBackdropIn .45s ease-out both; }
              .celebration-backdrop-closing { animation: celebrationBackdropOut .28s ease-in both; }
              .celebration-dialog { animation: celebrationDialogIn .7s cubic-bezier(.18,.8,.26,1.15) .08s both; }
              .celebration-dialog-closing { animation: celebrationDialogOut .28s ease-in both; }
              .celebration-item { opacity: 0; animation: celebrationItemIn .55s ease-out both; }
              .celebration-item-1 { animation-delay: .16s; }
              .celebration-item-2 { animation-delay: .24s; }
              .celebration-item-3 { animation-delay: .34s; }
              .celebration-item-4 { animation-delay: .44s; }
              .celebration-item-5 { animation-delay: .54s; }
              .celebration-item-6 { animation-delay: .62s; }
              .celebration-item-7 { animation-delay: .94s; }
              .celebration-item-8 { animation-delay: 1.04s; }
              .celebration-item-9 { animation-delay: 1.14s; }
              .celebration-item-10 { animation-delay: 1.28s; }
              .celebration-rank-label { display: inline-block; border-radius: 2rem; padding: .8rem 1.2rem; border: 2px solid rgba(255,255,255,.8); line-height: 1.1; background: rgba(255,255,255,.12); box-shadow: 0 0 0 8px rgba(255,255,255,.05), 0 18px 45px rgba(0,0,0,.3); }
              .celebration-rank-1 .celebration-rank-label { background: linear-gradient(145deg, #fff2a8, #eab308 55%, #a16207); box-shadow: 0 0 0 8px rgba(250,204,21,.15), 0 0 42px rgba(250,204,21,.75); animation: rankGoldPop 1.25s cubic-bezier(.16,1.2,.3,1) .72s both; }
              .celebration-rank-2 .celebration-rank-label { background: linear-gradient(145deg, #f8fafc, #cbd5e1 55%, #64748b); box-shadow: 0 0 0 8px rgba(226,232,240,.12), 0 0 34px rgba(226,232,240,.65); animation: rankSilverBounce 1.15s cubic-bezier(.2,.85,.35,1.2) .72s both; }
              .celebration-rank-3 .celebration-rank-label { background: linear-gradient(145deg, #fed7aa, #c2410c 55%, #7c2d12); box-shadow: 0 0 0 8px rgba(251,146,60,.12), 0 0 32px rgba(251,146,60,.62); animation: rankBronzeReveal 1.15s cubic-bezier(.2,.85,.35,1.2) .72s both; }
              @keyframes celebrationBackdropIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes celebrationBackdropOut { from { opacity: 1; } to { opacity: 0; } }
              @keyframes celebrationDialogIn { from { opacity: 0; transform: scale(.82) translateY(18px); } to { opacity: 1; transform: scale(1) translateY(0); } }
              @keyframes celebrationDialogOut { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(.94) translateY(8px); } }
              @keyframes celebrationItemIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
              @keyframes rankGoldPop { 0% { opacity: 0; transform: scale(.45) rotate(-12deg); } 60% { opacity: 1; transform: scale(1.16) rotate(4deg); } 100% { transform: scale(1) rotate(0); } }
              @keyframes rankSilverBounce { 0% { opacity: 0; transform: translateY(-28px) scale(.7); } 55% { opacity: 1; transform: translateY(8px) scale(1.08); } 100% { transform: translateY(0) scale(1); } }
              @keyframes rankBronzeReveal { 0% { opacity: 0; transform: translateY(22px) scale(.72); } 55% { opacity: 1; transform: translateY(-5px) scale(1.06); } 100% { transform: translateY(0) scale(1); } }
              @media (prefers-reduced-motion: reduce) { .celebration-backdrop, .celebration-dialog, .celebration-item, .celebration-rank-label { animation-duration: .01ms !important; animation-delay: 0s !important; } }
            `}</style>
          </div>
        </div>
      )}
      {celebrationRunning && <CelebrationEffect />}
      {showMonthlyWinnerForm && isOwner && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Add monthly winner">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-slate-900">ADD NEW RECORD</h2>
              <button
                type="button"
                onClick={() => setShowMonthlyWinnerForm(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-600 hover:bg-slate-200"
                aria-label="Close add monthly winner form"
              >
                ×
              </button>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-600">
                NAME
                <input
                  type="text"
                  value={monthlyWinnerForm.name}
                  onChange={(event) => setMonthlyWinnerForm((current) => ({ ...current, name: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                />
              </label>
              <label className="grid gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-600">
                RC NUMBER
                <input
                  type="text"
                  value={monthlyWinnerForm.rcNumber}
                  onChange={(event) => setMonthlyWinnerForm((current) => ({ ...current, rcNumber: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                />
              </label>
              <label className="grid gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-600">
                MONTH
                <select
                  value={monthlyWinnerForm.month}
                  onChange={(event) => setMonthlyWinnerForm((current) => ({ ...current, month: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                >
                  {monthNames.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-600">
                YEAR
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={monthlyWinnerForm.year}
                  onChange={(event) => setMonthlyWinnerForm((current) => ({ ...current, year: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                />
              </label>
              <button
                type="button"
                onClick={() => void handlePublishMonthlyWinner()}
                disabled={isMonthlyWinnerSubmitting}
                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isMonthlyWinnerSubmitting ? "Publishing..." : "PUBLISH"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[28px] border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-8 text-white shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">
                <Trophy size={14} /> Leaderboard
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Readers Circle Points</h1>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-300">Your total</div>
              <div className="mt-2 text-3xl font-black text-white">{member?.totalPoints ?? 0}</div>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <section className="relative isolate overflow-hidden rounded-[32px] border border-fuchsia-300/30 bg-[#160b3d] p-4 shadow-2xl sm:p-8">
          <div className="pointer-events-none absolute -left-12 top-16 h-48 w-28 rotate-[28deg] bg-fuchsia-500/20 [clip-path:polygon(0_0,100%_45%,0_100%,25%_50%)]" />
          <div className="pointer-events-none absolute -right-12 top-10 h-56 w-32 rotate-[-28deg] bg-cyan-400/20 [clip-path:polygon(0_45%,100%_0,75%_50%,100%_100%)]" />
          <div className="pointer-events-none absolute left-1/2 top-24 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-full bg-gradient-to-t from-black/20 to-transparent" />

          <div className="relative z-10 mb-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/40 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.3em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
              <Trophy size={15} /> Top performers
            </div>
            <h2 className="mt-4 text-3xl font-black uppercase tracking-tight text-white drop-shadow-[0_4px_0_rgba(236,72,153,0.35)] sm:text-5xl">Weekly leaderboard</h2>
            <div className="mx-auto mt-3 inline-flex skew-x-[-8deg] items-center bg-fuchsia-500 px-5 py-1 text-sm font-black uppercase tracking-[0.3em] text-white shadow-[5px_5px_0_#7e22ce]">
              <span className="skew-x-[8deg]">Top 3</span>
            </div>
            <p className="mt-4 text-sm font-semibold text-indigo-100">The three members leading the circle this season</p>
          </div>

          <div className="relative z-10 mx-auto grid max-w-5xl items-end gap-5 sm:grid-cols-3 sm:gap-6">
            {[topThree[1], topThree[0], topThree[2]].map((entry, podiumIndex) => {
              if (!entry) return <div key={`empty-podium-${podiumIndex}`} className="hidden sm:block" />;

              const isFirst = podiumIndex === 1;
              const rank = isFirst ? 1 : podiumIndex === 0 ? 2 : 3;
              const rankLabel = `${rank}${rank === 1 ? "st" : rank === 2 ? "nd" : "rd"}`;
              const rankStyles = isFirst
                ? { card: "border-yellow-200 bg-[#f4b400]", badge: "bg-[#5b3700] text-white", podium: "bg-[#f4b400]", text: "text-black", ring: "ring-4 ring-yellow-200/40 shadow-[0_0_36px_rgba(250,204,21,0.5)]" }
                : rank === 2
                  ? { card: "border-slate-100 bg-[#c0c0c0]", badge: "bg-[#3f4650] text-white", podium: "bg-[#c0c0c0]", text: "text-black", ring: "shadow-[0_0_26px_rgba(203,213,225,0.25)]" }
                  : { card: "border-orange-200 bg-[#cd7f32]", badge: "bg-[#542b12] text-white", podium: "bg-[#cd7f32]", text: "text-black", ring: "shadow-[0_0_26px_rgba(251,146,60,0.3)]" };

              return (
                <div key={entry.userId ?? entry.id} className={`relative flex flex-col items-center ${isFirst ? "sm:-translate-y-5" : ""}`}>
                  <div className={`pointer-events-none absolute z-0 ${isFirst ? "-left-14 -right-14 top-12 h-44" : rank === 2 ? "-left-8 -right-8 top-20 h-32" : "-left-6 -right-6 top-24 h-24"}`}>
                    <div className={`absolute left-1/2 top-0 h-full w-1 origin-bottom -translate-x-1/2 rotate-[-22deg] rounded-full bg-gradient-to-b from-[#fff1a8] via-[#d9a92e] to-[#795018] shadow-[0_0_12px_rgba(250,204,21,0.6)] ${isFirst ? "h-44" : rank === 2 ? "h-32" : "h-24"}`} />
                    <div className={`absolute right-1/2 top-0 h-full w-1 origin-bottom translate-x-1/2 rotate-[22deg] rounded-full bg-gradient-to-b from-[#fff1a8] via-[#d9a92e] to-[#795018] shadow-[0_0_12px_rgba(250,204,21,0.6)] ${isFirst ? "h-44" : rank === 2 ? "h-32" : "h-24"}`} />
                    {["left-[30%] top-[12%] rotate-[-34deg]", "left-[23%] top-[30%] rotate-[-42deg]", "left-[25%] top-[49%] rotate-[-48deg]", "left-[39%] top-[66%] rotate-[-25deg]", "right-[30%] top-[12%] rotate-[34deg]", "right-[23%] top-[30%] rotate-[42deg]", "right-[25%] top-[49%] rotate-[48deg]", "right-[39%] top-[66%] rotate-[25deg]"].map((position, grainIndex) => (
                      <span key={grainIndex} className={`absolute rounded-full border border-yellow-200/60 bg-gradient-to-br from-[#fff6b0] to-[#d49b21] shadow-[0_2px_4px_rgba(91,55,0,0.35)] ${position} ${isFirst ? "h-4 w-10" : rank === 2 ? "h-3 w-8" : "h-2.5 w-7"}`} />
                    ))}
                  </div>
                  <div className={`relative z-10 flex w-full flex-col items-center overflow-visible rounded-[28px] border-2 p-5 shadow-lg ${isFirst ? "max-w-[340px] p-7" : "max-w-[250px]"} ${rankStyles.card} ${rankStyles.ring}`}>
                    <div className="pointer-events-none absolute inset-1 rounded-[24px] border border-white/35" />
                    <div className="pointer-events-none absolute right-3 top-3 h-12 w-12 rotate-45 border-r-2 border-t-2 border-white/50" />
                    <div className={`absolute flex items-center justify-center border-2 border-white/80 font-black shadow-[0_8px_18px_rgba(0,0,0,0.35)] ${rank === 1 ? "-top-11 h-20 w-20 rounded-[28px] bg-[#5b3700] text-yellow-200 ring-4 ring-yellow-300/40" : "-top-5 h-12 w-12 rounded-2xl text-xl"} ${rankStyles.badge}`}>
                      {rank === 1 ? <Crown size={44} strokeWidth={2.2} /> : rank}
                    </div>
                    {isFirst && <Sparkles className="absolute right-5 top-5 text-white/80" size={20} />}
                    <div className={`mt-5 w-full space-y-3 rounded-2xl border border-black/15 bg-black/10 p-4 text-left shadow-inner ${isFirst ? "sm:p-5" : ""}`}>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-black">Name</div>
                        <div className="mt-1 truncate text-base font-black text-black">{entry.fullName}</div>
                      </div>
                      <div className="border-t border-slate-200/80 pt-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-black">RC No</div>
                        <div className="mt-1 text-sm font-bold text-black">{entry.memberId || "-"}</div>
                      </div>
                      <div className="border-t border-slate-200/80 pt-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-black">Total Points</div>
                        <div className="mt-1 text-3xl font-black text-black">{entry.totalPoints}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 rounded-full border border-black/15 bg-black/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-black/70">
                      <Sparkles size={13} /> Rank {rank}
                    </div>
                  </div>
                  <div className={`flex w-full items-center justify-center rounded-b-2xl text-lg font-black ${isFirst ? "h-20 max-w-[340px]" : "h-12 max-w-[250px]"} ${rankStyles.podium}`}>
                    <span className="text-black">{rankLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-lg">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-500">Ranking</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">Full leaderboard</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-700">
                  <TrendingUp size={14} /> {leaderboard.length} members
                </div>
                {isOwner && (
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isResetting || isSubmitting}
                    className="rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isResetting ? "Resetting..." : "RESET"}
                  </button>
                )}
              </div>
            </div>

            {resetMessage && (
              <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${resetMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`} role="status" aria-live="polite">
                {resetMessage.text}
              </div>
            )}

            <div className="space-y-3">
              {leaderboard.map((entry, index) => (
                <div key={entry.userId ?? entry.id} className={`flex items-center gap-4 rounded-2xl border p-3 ${index < 3 ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-lg font-black text-white">#{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-black text-slate-900">{entry.fullName}</div>
                    <div className="text-sm text-slate-500">RC {entry.memberId || entry.accountId || "-"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-slate-900">{entry.totalPoints}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">pts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-lg">
              <div className="flex items-center gap-2">
                <Sparkles className="text-violet-500" size={18} />
                <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-500">Categories</p>
              </div>
              <div className="mt-4 space-y-3">
                {categories.map((category) => {
                  const earnedPoints = String(getEarnedCategoryPoints(member, category.value));

                  return <div key={category.value} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${categoryColors[category.value] || "from-slate-500 to-slate-700"}`} />
                        <span className="text-sm font-semibold text-slate-700">{category.label}</span>
                      </div>
                      <span className="text-sm font-black text-slate-900">{earnedPoints}</span>
                    </div>
                  </div>;
                })}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-lg">
              <div className="flex items-center gap-2">
                <ShieldAlert className="text-amber-500" size={18} />
                <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-500">Member status</p>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-900 p-4 text-white">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Current rank</div>
                <div className="mt-2 text-3xl font-black">#{member?.rank ?? "—"}</div>
                <div className="mt-2 text-sm text-slate-300">{member?.fullName || "No member details yet"}</div>
              </div>
            </div>
          </div>
        </section>

        {isOwner && (
          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-lg">
              <h3 className="text-xl font-black text-slate-900">Award points</h3>
              <div className="mt-4 grid gap-4">
                <select
                  value={manualPoints.memberId}
                  onChange={(event) => setManualPoints((current) => ({ ...current, memberId: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-900"
                >
                  <option value="">Select a member</option>
                  {leaderboard.map((entry) => (
                    <option key={entry.userId ?? entry.id} value={entry.id ?? entry.userId}>
                      {entry.fullName} ({entry.memberId || entry.accountId || "-"})
                    </option>
                  ))}
                </select>
                <div className="grid gap-4 sm:grid-cols-2">
                  <select
                    value={manualPoints.category}
                    onChange={(event) => setManualPoints((current) => ({ ...current, category: event.target.value }))}
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-900"
                  >
                    {ownerCategories.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={manualPoints.amount}
                    onChange={(event) => setManualPoints((current) => ({ ...current, amount: event.target.value }))}
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-900"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Optional note"
                  value={manualPoints.description}
                  onChange={(event) => setManualPoints((current) => ({ ...current, description: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-900"
                />
                <button
                  type="button"
                  onClick={handleAward}
                  disabled={isSubmitting}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Processing..." : "Award points"}
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-lg">
              <h3 className="text-xl font-black text-slate-900">Reduce points</h3>
              <div className="mt-4 grid gap-4">
                <select
                  value={reduction.memberId}
                  onChange={(event) => setReduction((current) => ({ ...current, memberId: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-900"
                >
                  <option value="">Select a member</option>
                  {leaderboard.map((entry) => (
                    <option key={entry.userId ?? entry.id} value={entry.id ?? entry.userId}>
                      {entry.fullName} ({entry.memberId || entry.accountId || "-"})
                    </option>
                  ))}
                </select>
                <div className="grid gap-4 sm:grid-cols-2">
                  <select
                    value={reduction.category}
                    onChange={(event) => setReduction((current) => ({ ...current, category: event.target.value }))}
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-900"
                  >
                    {ownerCategories.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={reduction.amount}
                    onChange={(event) => setReduction((current) => ({ ...current, amount: event.target.value }))}
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-900"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Optional note"
                  value={reduction.description}
                  onChange={(event) => setReduction((current) => ({ ...current, description: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-900"
                />
                <button
                  type="button"
                  onClick={handleReduction}
                  disabled={isSubmitting}
                  className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Processing..." : "Reduce points"}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-lg">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-500">Leaderboard history</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">OUR MONTHLY WINNERS</h2>
            </div>
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                {isMonthlyWinnersEditing && (
                  <button
                    type="button"
                    onClick={() => setShowMonthlyWinnerForm(true)}
                    className="rounded-full bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-slate-800"
                  >
                    ADD NEW RECORD
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMonthlyWinnersEditing((current) => !current)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-50"
                >
                  {isMonthlyWinnersEditing ? "DONE" : "EDIT"}
                </button>
              </div>
            )}
          </div>

          {monthlyWinnerMessage && (
            <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${monthlyWinnerMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`} role="status" aria-live="polite">
              {monthlyWinnerMessage.text}
            </div>
          )}

          {monthlyWinners.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {monthlyWinners.map((record) => (
                <div key={record.id} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {isOwner && isMonthlyWinnersEditing && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteMonthlyWinner(Number(record.id))}
                      className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-lg font-bold leading-none text-white transition hover:bg-red-500"
                      aria-label={`Delete monthly winner ${record.name}`}
                    >
                      ×
                    </button>
                  )}
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Name</div>
                      <div className="mt-1 pr-8 text-base font-black text-slate-900">{record.name}</div>
                    </div>
                    <div className="border-t border-slate-200 pt-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">RC Number</div>
                      <div className="mt-1 font-bold text-slate-900">{record.rcNumber}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Month</div>
                        <div className="mt-1 font-bold text-slate-900">{monthNames[Number(record.month) - 1] || record.month}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Year</div>
                        <div className="mt-1 font-bold text-slate-900">{record.year}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">No monthly winners published yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function CelebrationEffect() {
  const confetti = Array.from({ length: 34 }, (_, index) => index);
  const balloons = Array.from({ length: 7 }, (_, index) => index);
  const sparkles = Array.from({ length: 18 }, (_, index) => index);
  const particles = Array.from({ length: 24 }, (_, index) => index);

  return (
    <div className="pointer-events-none fixed inset-0 z-[110] overflow-hidden" aria-hidden="true">
      <div className="celebration-wash" />
      <div className="celebration-confetti">{confetti.map((index) => <span key={`confetti-${index}`} style={{ "--left": `${(index * 29) % 100}%`, "--delay": `${index * 0.035}s`, "--duration": `${2.8 + (index % 7) * 0.22}s`, "--rotation": `${index * 31}deg`, "--drift": `${(index % 9 - 4) * 7}vw`, "--hue": `${index * 47}` } as React.CSSProperties} />)}</div>
      <div className="celebration-ribbons">{[0, 1, 2, 3, 4].map((index) => <span key={`ribbon-${index}`} style={{ "--left": `${(index * 23) % 100}%`, "--rotation": `${index * 19 - 35}deg` } as React.CSSProperties} />)}</div>
      <div className="celebration-balloons">{balloons.map((index) => <span key={`balloon-${index}`} style={{ "--left": `${(index * 17) % 92}%`, "--delay": `${index * 0.1}s`, "--duration": `${3.8 + (index % 3) * 0.35}s`, "--hue": `${index * 51 + 190}` } as React.CSSProperties} />)}</div>
      <div className="celebration-sparkles">{sparkles.map((index) => <span key={`sparkle-${index}`} style={{ "--left": `${(index * 43) % 96}%`, "--top": `${(index * 37) % 86}%`, "--delay": `${index * 0.08}s`, "--hue": `${index * 29 + 35}`, "--size": `${18 + (index % 3) * 8}px` } as React.CSSProperties}>+</span>)}</div>
      <div className="celebration-particles">{particles.map((index) => <span key={`particle-${index}`} style={{ "--delay": `${index * 0.025}s`, "--x": `${(index % 8 - 4) * 14}vw`, "--y": `${(index % 6 - 3) * 14}vh`, "--hue": `${index * 31 + 20}` } as React.CSSProperties} />)}</div>
      <style jsx global>{`
        .celebration-wash { position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.18), transparent 30%), linear-gradient(115deg, rgba(14,165,233,.12), rgba(217,70,239,.12)); animation: celebrationFade 5.2s ease-out forwards; }
        .celebration-confetti, .celebration-ribbons, .celebration-balloons, .celebration-sparkles, .celebration-particles { position: absolute; inset: 0; }
        .celebration-confetti span { position: absolute; top: -12vh; left: var(--left); width: 9px; height: 18px; border-radius: 3px; background: hsl(var(--hue), 90%, 62%); transform: rotate(var(--rotation)); animation: confettiFall var(--duration) cubic-bezier(.2,.7,.3,1) forwards; animation-delay: var(--delay); }
        .celebration-ribbons span { position: absolute; top: -20vh; left: var(--left); width: 12px; height: 120vh; border-radius: 999px; background: linear-gradient(180deg, transparent, rgba(251,191,36,.9), rgba(236,72,153,.7), transparent); transform: rotate(var(--rotation)); opacity: .75; animation: ribbonFall 4.8s ease-in forwards; }
        .celebration-balloons span { position: absolute; bottom: -15vh; left: var(--left); width: 42px; height: 54px; border-radius: 52% 48% 48% 52%; background: hsl(var(--hue), 78%, 62%); box-shadow: inset -8px -8px 0 rgba(0,0,0,.12), 0 0 22px rgba(255,255,255,.16); animation: balloonRise var(--duration) ease-out forwards; animation-delay: var(--delay); }
        .celebration-balloons span::after { content: ""; position: absolute; top: 52px; left: 20px; width: 1px; height: 110px; background: rgba(255,255,255,.55); }
        .celebration-sparkles span { position: absolute; left: var(--left); top: var(--top); color: hsl(var(--hue), 100%, 75%); font-size: var(--size); font-weight: 900; text-shadow: 0 0 14px currentColor; animation: sparklePop 2.2s ease-in-out infinite; animation-delay: var(--delay); }
        .celebration-particles span { position: absolute; left: 50%; top: 48%; width: 7px; height: 7px; border-radius: 50%; background: hsl(var(--hue), 95%, 70%); box-shadow: 0 0 12px currentColor; animation: particleBurst 2.8s cubic-bezier(.15,.75,.35,1) forwards; animation-delay: var(--delay); }
        @keyframes celebrationFade { 0%, 82% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes confettiFall { 0% { opacity: 0; transform: translate3d(0, -10vh, 0) rotate(0deg); } 12% { opacity: 1; } 100% { opacity: 0; transform: translate3d(var(--drift), 120vh, 0) rotate(720deg); } }
        @keyframes ribbonFall { 0% { opacity: 0; transform: translateY(-20vh) rotate(-35deg); } 15% { opacity: .8; } 100% { opacity: 0; transform: translateY(115vh) rotate(35deg); } }
        @keyframes balloonRise { 0% { opacity: 0; transform: translateY(0) scale(.6) rotate(-8deg); } 12% { opacity: 1; } 100% { opacity: 0; transform: translateY(-125vh) scale(1.05) rotate(12deg); } }
        @keyframes sparklePop { 0%, 100% { opacity: 0; transform: scale(.2) rotate(0deg); } 45% { opacity: 1; transform: scale(1) rotate(90deg); } 70% { opacity: .25; transform: scale(.5) rotate(180deg); } }
        @keyframes particleBurst { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.2); } 12% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(.1); } }
        @media (prefers-reduced-motion: reduce) { .celebration-confetti span, .celebration-ribbons span, .celebration-balloons span, .celebration-sparkles span, .celebration-particles span { animation-duration: .8s; } }
      `}</style>
    </div>
  );
}
