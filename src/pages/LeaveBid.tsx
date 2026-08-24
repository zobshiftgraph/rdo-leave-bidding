import { useEffect, useState } from "react";
import { YearCalendars } from "../components/MonthCalendar";
import { api } from "../api";
import type { CalendarDay, Cycle, PublicUser } from "../types";
import { biddingPaused } from "../types";

export default function LeaveBid({ user }: { user: PublicUser }) {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [myTurn, setMyTurn] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function load() {
    const { cycle: active } = await api<{ cycle: Cycle | null }>("/api/cycles/active");
    if (!active) return;
    setCycle(active);
    const cal = await api<{ days: CalendarDay[] }>(`/api/cycles/${active.id}/calendar`);
    setDays(cal.days);
    const mine = await api<{ dates: string[]; submitted: unknown }>(`/api/cycles/${active.id}/my-leave`);
    if (mine.submitted) {
      setSubmitted(true);
      setSelected(new Set(mine.dates));
    }
    const status = await api<{ leave: { current: PublicUser | null }; cycle: Cycle }>(`/api/cycles/${active.id}/status`);
    setCycle(status.cycle);
    setMyTurn(status.leave.current?.id === user.id && status.cycle.phase === "leave_bidding" && !biddingPaused(status.cycle));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [user.id]);

  function toggle(date: string) {
    if (!myTurn || submitted) return;
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function submit() {
    if (!cycle) return;
    setError("");
    try {
      await api(`/api/cycles/${cycle.id}/leave-bid`, {
        method: "POST",
        body: JSON.stringify({ dates: [...selected].sort() }),
      });
      setDone("Leave bid submitted. The next person has been notified.");
      setSubmitted(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bid failed");
    }
  }

  if (!cycle) return <p className="text-slate-600">{error || "No active bid cycle."}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Leave bid · {cycle.leave_year}</h1>
          <p className="text-slate-600">
            {cycle.leave_start} through {cycle.leave_end}. Green days have room; red days are full.
            {cycle.max_leave_days ? ` Limit: ${cycle.max_leave_days} days.` : ""}
          </p>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
          Selected: <strong>{selected.size}</strong> day{selected.size === 1 ? "" : "s"}
        </div>
      </div>
      {cycle.paused && (cycle.phase === "leave_bidding" || cycle.phase === "rdo_bidding") && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Bidding is paused. You cannot submit until an administrator resumes it.
        </p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
      {myTurn && !submitted && (
        <div className="rounded-xl border border-gold bg-amber-50 px-4 py-3 text-sm">
          It is your turn. Click days to select them, then submit. The next person is notified after you bid.
        </div>
      )}
      {!myTurn && !submitted && cycle.phase === "leave_bidding" && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">Waiting for your turn. You will get a notification when it is time to bid.</p>
      )}
      <YearCalendars
        year={cycle.leave_year}
        days={days}
        selected={selected}
        onToggle={myTurn && !submitted ? toggle : undefined}
        showNames
      />
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="text-sm">
          Selected: <strong>{selected.size}</strong> day{selected.size === 1 ? "" : "s"}
        </div>
        <button
          type="button"
          disabled={!myTurn || submitted}
          onClick={submit}
          className="rounded-md bg-navy px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Submit leave bid
        </button>
      </div>
    </div>
  );
}
