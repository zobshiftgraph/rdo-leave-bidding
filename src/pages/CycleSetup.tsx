import { useEffect, useState } from "react";
import { api } from "../api";
import type { Cycle, PublicUser, SlotWindow } from "../types";
import { WEEKDAYS } from "../types";

interface LineDraft {
  name: string;
  days: number[];
  slots: number;
}

interface Status {
  cycle: Cycle;
  rdo: { current: PublicUser | null; waiting: PublicUser[] };
  leave: { current: PublicUser | null; waiting: PublicUser[] };
  windows: SlotWindow[];
  lines: { id: number; name: string; days: string; slots: number }[];
  weekdayCaps: { weekday: number; slots: number }[];
}

export default function CycleSetup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [leaveYear, setLeaveYear] = useState(new Date().getUTCFullYear() + 1);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"lines" | "weekdays">("lines");
  const [rdoDays, setRdoDays] = useState(2);
  const [defaultSlots, setDefaultSlots] = useState(3);
  const [maxLeave, setMaxLeave] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [caps, setCaps] = useState<number[]>([6, 4, 4, 4, 4, 4, 6]);
  const [windows, setWindows] = useState<SlotWindow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const { cycle } = await api<{ cycle: Cycle | null }>("/api/cycles/active");
    if (!cycle) {
      setStatus(null);
      return;
    }
    const data = await api<Status>(`/api/cycles/${cycle.id}/status`);
    setStatus(data);
    setLeaveYear(data.cycle.leave_year);
    setName(data.cycle.name);
    setMode(data.cycle.rdo_mode);
    setRdoDays(data.cycle.rdo_days_count);
    setDefaultSlots(data.cycle.default_slots_per_day);
    setMaxLeave(data.cycle.max_leave_days?.toString() ?? "");
    setLines(
      data.lines.map((l) => ({
        name: l.name,
        days: JSON.parse(l.days) as number[],
        slots: l.slots,
      })),
    );
    const nextCaps = [0, 0, 0, 0, 0, 0, 0];
    for (const cap of data.weekdayCaps) nextCaps[cap.weekday] = cap.slots;
    setCaps(nextCaps);
    setWindows(data.windows.length ? data.windows : [{ start_date: data.cycle.leave_start, end_date: data.cycle.leave_end, slots_per_day: data.cycle.default_slots_per_day }]);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function createCycle() {
    setError("");
    await api("/api/cycles", {
      method: "POST",
      body: JSON.stringify({
        name: name || `${leaveYear} bid`,
        leave_year: leaveYear,
        rdo_mode: mode,
        rdo_days_count: rdoDays,
        default_slots_per_day: defaultSlots,
        max_leave_days: maxLeave ? Number(maxLeave) : null,
      }),
    });
    setMessage("Bid cycle created.");
    await load();
  }

  async function saveSettings() {
    if (!status) return;
    setError("");
    await api(`/api/cycles/${status.cycle.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        leave_year: leaveYear,
        rdo_mode: mode,
        rdo_days_count: rdoDays,
        default_slots_per_day: defaultSlots,
        max_leave_days: maxLeave ? Number(maxLeave) : null,
      }),
    });
    if (status.cycle.phase === "setup") {
      await api(`/api/cycles/${status.cycle.id}/rdo-lines`, { method: "PUT", body: JSON.stringify({ lines }) });
      await api(`/api/cycles/${status.cycle.id}/weekday-caps`, {
        method: "PUT",
        body: JSON.stringify({ caps: caps.map((slots, weekday) => ({ weekday, slots })) }),
      });
    }
    await api(`/api/cycles/${status.cycle.id}/slot-windows`, { method: "PUT", body: JSON.stringify({ windows }) });
    setMessage("Settings saved.");
    await load();
  }

  async function action(path: string) {
    if (!status) return;
    setError("");
    try {
      await api(`/api/cycles/${status.cycle.id}/${path}`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  const locked = Boolean(status && status.cycle.phase !== "setup");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Bid setup</h1>
        <p className="text-slate-600">Leave bidding always covers January 1 through December 31 of the leave year.</p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

      <section className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-navy">Cycle</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input className="w-full rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="2027 annual bid" />
          </Field>
          <Field label="Leave year">
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2"
              value={leaveYear}
              onChange={(e) => setLeaveYear(Number(e.target.value))}
              disabled={locked}
            />
          </Field>
          <Field label="RDO style">
            <select className="w-full rounded-md border px-3 py-2" value={mode} onChange={(e) => setMode(e.target.value as "lines" | "weekdays")} disabled={locked}>
              <option value="lines">Pick from RDO lines (Sat/Sun, Sun/Mon, …)</option>
              <option value="weekdays">Pick weekdays with a cap per day</option>
            </select>
          </Field>
          <Field label="Days off per person (weekday mode)">
            <input type="number" min={1} max={6} className="w-full rounded-md border px-3 py-2" value={rdoDays} onChange={(e) => setRdoDays(Number(e.target.value))} disabled={locked} />
          </Field>
          <Field label="Default leave slots per day">
            <input type="number" min={0} className="w-full rounded-md border px-3 py-2" value={defaultSlots} onChange={(e) => setDefaultSlots(Number(e.target.value))} />
          </Field>
          <Field label="Max leave days per person (optional)">
            <input className="w-full rounded-md border px-3 py-2" value={maxLeave} onChange={(e) => setMaxLeave(e.target.value)} placeholder="Unlimited" />
          </Field>
        </div>
        {!status ? (
          <button type="button" onClick={() => createCycle().catch((err) => setError(err.message))} className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">
            Create bid cycle
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => saveSettings().catch((err) => setError(err.message))} className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">
              Save settings
            </button>
            {status.cycle.phase === "setup" && (
              <button type="button" onClick={() => action("start-rdo")} className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy-dark">
                Start RDO bidding
              </button>
            )}
            {(status.cycle.phase === "setup" || status.cycle.phase === "rdo_bidding") && (
              <button type="button" onClick={() => action("start-leave")} className="rounded-md border px-4 py-2 text-sm font-medium">
                Start leave bidding
              </button>
            )}
            {(status.cycle.phase === "rdo_bidding" || status.cycle.phase === "leave_bidding") && (
              <button type="button" onClick={() => action("skip")} className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700">
                Skip current bidder
              </button>
            )}
          </div>
        )}
        {status && (
          <p className="text-sm text-slate-600">
            Phase: <strong>{status.cycle.phase.replace("_", " ")}</strong>
            {status.cycle.phase === "rdo_bidding" && status.rdo.current && ` · Now: ${status.rdo.current.name}`}
            {status.cycle.phase === "leave_bidding" && status.leave.current && ` · Now: ${status.leave.current.name}`}
          </p>
        )}
      </section>

      {mode === "lines" && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-navy">RDO lines</h2>
            <button
              type="button"
              className="text-sm text-navy underline"
              onClick={() => setLines((l) => [...l, { name: "", days: [6, 0], slots: 1 }])}
              disabled={locked}
            >
              Add line
            </button>
          </div>
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto]">
                <input
                  className="rounded-md border px-3 py-2"
                  value={line.name}
                  disabled={locked}
                  placeholder="Saturday / Sunday"
                  onChange={(e) => setLines((all) => all.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                />
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((label, d) => (
                    <label key={label} className={`rounded border px-2 py-1 text-xs ${line.days.includes(d) ? "bg-navy text-white" : "bg-white"}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        disabled={locked}
                        checked={line.days.includes(d)}
                        onChange={() =>
                          setLines((all) =>
                            all.map((x, i) =>
                              i === idx
                                ? { ...x, days: x.days.includes(d) ? x.days.filter((n) => n !== d) : [...x.days, d].sort() }
                                : x,
                            ),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <input
                  type="number"
                  min={1}
                  className="w-24 rounded-md border px-3 py-2"
                  value={line.slots}
                  disabled={locked}
                  onChange={(e) => setLines((all) => all.map((x, i) => (i === idx ? { ...x, slots: Number(e.target.value) } : x)))}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {mode === "weekdays" && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-navy">How many people can have each weekday off</h2>
          <div className="grid grid-cols-7 gap-2">
            {WEEKDAYS.map((label, d) => (
              <label key={label} className="text-center text-sm">
                {label}
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-md border px-2 py-1"
                  value={caps[d]}
                  disabled={locked}
                  onChange={(e) => setCaps((all) => all.map((n, i) => (i === d ? Number(e.target.value) : n)))}
                />
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-navy">Leave slots by date range</h2>
            <p className="text-sm text-slate-600">Use this when staffing changes during the year (for example more slots in summer).</p>
          </div>
          <button
            type="button"
            className="text-sm text-navy underline"
            onClick={() =>
              setWindows((w) => [
                ...w,
                { start_date: `${leaveYear}-01-01`, end_date: `${leaveYear}-12-31`, slots_per_day: defaultSlots },
              ])
            }
          >
            Add range
          </button>
        </div>
        <div className="space-y-2">
          {windows.map((w, idx) => (
            <div key={idx} className="grid gap-2 md:grid-cols-4">
              <input type="date" className="rounded-md border px-3 py-2" value={w.start_date} onChange={(e) => setWindows((all) => all.map((x, i) => (i === idx ? { ...x, start_date: e.target.value } : x)))} />
              <input type="date" className="rounded-md border px-3 py-2" value={w.end_date} onChange={(e) => setWindows((all) => all.map((x, i) => (i === idx ? { ...x, end_date: e.target.value } : x)))} />
              <input type="number" min={0} className="rounded-md border px-3 py-2" value={w.slots_per_day} onChange={(e) => setWindows((all) => all.map((x, i) => (i === idx ? { ...x, slots_per_day: Number(e.target.value) } : x)))} />
              <button type="button" className="text-sm text-red-700" onClick={() => setWindows((all) => all.filter((_, i) => i !== idx))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: import("react").ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
