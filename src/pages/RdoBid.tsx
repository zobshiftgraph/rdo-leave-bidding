import { useEffect, useState } from "react";
import { api } from "../api";
import type { Cycle, PublicUser } from "../types";
import { WEEKDAYS, biddingPaused } from "../types";

interface RdoData {
  cycle: Cycle;
  lines: { id: number; name: string; days: number[]; slots: number; taken: number; remaining: number }[];
  weekdayCaps: { weekday: number; slots: number; taken: number; remaining: number }[];
  bids: { user_id: number; name: string; seniority: number; rdo_line_id: number | null; weekdays: string | null; skipped: number }[];
  current: PublicUser | null;
  myTurn: boolean;
}

export default function RdoBid({ user }: { user: PublicUser }) {
  const [data, setData] = useState<RdoData | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function load() {
    const { cycle } = await api<{ cycle: Cycle | null }>("/api/cycles/active");
    if (!cycle) return;
    const next = await api<RdoData>(`/api/cycles/${cycle.id}/rdo`);
    setData(next);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function submit() {
    if (!data) return;
    setError("");
    try {
      await api(`/api/cycles/${data.cycle.id}/rdo-bid`, {
        method: "POST",
        body: JSON.stringify({ rdo_line_id: choice, weekdays: days }),
      });
      setDone("RDO bid submitted. The next person on the seniority list has been notified.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bid failed");
    }
  }

  if (!data) {
    return <p className="text-slate-600">{error || "No active bid cycle."}</p>;
  }

  const mine = data.bids.find((b) => b.user_id === user.id);
  const paused = biddingPaused(data.cycle);
  const canBid = data.myTurn && !paused && data.cycle.phase === "rdo_bidding";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Regular Days Off</h1>
        <p className="text-slate-600">
          Bidding follows seniority. {paused ? "Bidding is paused." : data.current ? `Current bidder: ${data.current.name}.` : "RDO bidding is complete."}
        </p>
      </div>
      {paused && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Bidding is paused. You cannot submit until an administrator resumes it.
        </p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
      {mine && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm">
          You already bid
          {mine.skipped
            ? " (skipped)."
            : mine.rdo_line_id
              ? `: ${data.lines.find((l) => l.id === mine.rdo_line_id)?.name ?? "a line"}.`
              : mine.weekdays
                ? `: ${(JSON.parse(mine.weekdays) as number[]).map((d) => WEEKDAYS[d]).join(" / ")}.`
                : "."}
        </p>
      )}

      {data.cycle.rdo_mode === "lines" ? (
        <div className="grid gap-3">
          {data.lines.map((line) => (
            <label
              key={line.id}
              className={`flex cursor-pointer items-center justify-between rounded-xl border bg-white p-4 shadow-sm ${choice === line.id ? "border-navy ring-2 ring-navy/30" : ""} ${line.remaining <= 0 ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="rdo"
                  disabled={!canBid || line.remaining <= 0}
                  checked={choice === line.id}
                  onChange={() => setChoice(line.id)}
                />
                <div>
                  <div className="font-medium">{line.name}</div>
                  <div className="text-sm text-slate-500">{line.days.map((d) => WEEKDAYS[d]).join(" / ")}</div>
                </div>
              </div>
              <div className="text-sm">
                {line.remaining} of {line.slots} left
              </div>
            </label>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm text-slate-600">
            Pick {data.cycle.rdo_days_count} days. Remaining slots are shown under each weekday.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
            {data.weekdayCaps.map((cap) => {
              const on = days.includes(cap.weekday);
              const full = cap.remaining <= 0 && !on;
              return (
                <button
                  key={cap.weekday}
                  type="button"
                  disabled={!canBid || full}
                  onClick={() =>
                    setDays((cur) => {
                      if (cur.includes(cap.weekday)) return cur.filter((d) => d !== cap.weekday);
                      if (cur.length >= data.cycle.rdo_days_count) return cur;
                      return [...cur, cap.weekday];
                    })
                  }
                  className={`rounded-lg border p-3 text-center ${on ? "border-navy bg-sky-50" : "bg-white"} ${full ? "opacity-40" : ""}`}
                >
                  <div className="font-semibold">{WEEKDAYS[cap.weekday]}</div>
                  <div className="text-xs text-slate-500">
                    {cap.remaining}/{cap.slots}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!canBid}
        onClick={submit}
        className="rounded-md bg-navy px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Submit RDO bid
      </button>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold text-navy">Bids so far</h2>
        <ul className="divide-y text-sm">
          {data.bids.map((bid) => (
            <li key={bid.user_id} className="flex justify-between py-2">
              <span>
                #{bid.seniority} {bid.name}
              </span>
              <span className="text-slate-600">
                {bid.skipped
                  ? "Skipped"
                  : bid.rdo_line_id
                    ? data.lines.find((l) => l.id === bid.rdo_line_id)?.name
                    : bid.weekdays
                      ? (JSON.parse(bid.weekdays) as number[]).map((d) => WEEKDAYS[d]).join("/")
                      : "—"}
              </span>
            </li>
          ))}
          {data.bids.length === 0 && <li className="py-2 text-slate-500">No RDO bids yet.</li>}
        </ul>
      </section>
    </div>
  );
}
