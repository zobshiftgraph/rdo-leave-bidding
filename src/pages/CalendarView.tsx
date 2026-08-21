import { useEffect, useState } from "react";
import MonthCalendar from "../components/MonthCalendar";
import { api } from "../api";
import type { CalendarDay, Cycle, PublicUser } from "../types";

export default function CalendarView({ user }: { user: PublicUser }) {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [month, setMonth] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { cycle: active } = await api<{ cycle: Cycle | null }>("/api/cycles/active");
        if (!active) return;
        setCycle(active);
        const now = new Date();
        const startMonth = now.getUTCFullYear() === active.leave_year ? now.getUTCMonth() : 0;
        setMonth(startMonth);
        const cal = await api<{ days: CalendarDay[] }>(`/api/cycles/${active.id}/calendar`);
        setDays(cal.days);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load calendar");
      }
    })();
  }, [user.id]);

  if (!cycle) return <p className="text-slate-600">{error || "No leave year is open yet."}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Leave calendar · {cycle.leave_year}</h1>
        <p className="text-slate-600">
          Remaining slots are shown on each day (remaining / total). Gold outline is a day you already have.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Legend className="bg-emerald-50 border-emerald-200" label="Open" />
        <Legend className="bg-amber-50 border-amber-200" label="Filling" />
        <Legend className="bg-red-50 border-red-200" label="Full" />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded border px-3 py-1" onClick={() => setMonth((m) => Math.max(0, m - 1))}>
          Prev
        </button>
        <select className="rounded border px-2 py-1" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, m) => (
            <option key={m} value={m}>
              {new Date(Date.UTC(cycle.leave_year, m, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
            </option>
          ))}
        </select>
        <button type="button" className="rounded border px-3 py-1" onClick={() => setMonth((m) => Math.min(11, m + 1))}>
          Next
        </button>
      </div>
      <MonthCalendar year={cycle.leave_year} month={month} days={days} showNames />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-3 w-3 rounded border ${className}`} />
      {label}
    </span>
  );
}
