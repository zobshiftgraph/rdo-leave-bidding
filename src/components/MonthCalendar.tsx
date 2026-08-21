import { WEEKDAYS, type CalendarDay } from "../types";

function dayClass(day: CalendarDay, selected: boolean, interactive: boolean) {
  const parts = [
    "cal-cell rounded-md border p-1.5 text-left text-xs transition",
    interactive ? "cursor-pointer hover:ring-2 hover:ring-navy/40" : "",
    selected ? "ring-2 ring-navy bg-sky-100 border-navy" : "",
  ];
  if (!selected) {
    if (day.remaining <= 0) parts.push("bg-red-50 border-red-200");
    else if (day.remaining <= Math.max(1, Math.floor(day.slots / 3))) parts.push("bg-amber-50 border-amber-200");
    else parts.push("bg-emerald-50/80 border-emerald-200");
  }
  if (day.mine && !selected) parts.push("outline outline-2 outline-gold");
  return parts.join(" ");
}

export default function MonthCalendar({
  year,
  month,
  days,
  selected,
  onToggle,
  showNames = false,
}: {
  year: number;
  month: number;
  days: CalendarDay[];
  selected?: Set<string>;
  onToggle?: (date: string) => void;
  showNames?: boolean;
}) {
  const first = new Date(Date.UTC(year, month, 1));
  const startPad = first.getUTCDay();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: (CalendarDay | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= count; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push(byDate.get(date) ?? null);
  }

  const label = first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-lg font-semibold text-navy">{label}</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const isSelected = selected?.has(day.date) ?? false;
          const full = day.remaining <= 0 && !isSelected;
          const clickable = Boolean(onToggle) && (!full || isSelected);
          return (
            <button
              key={day.date}
              type="button"
              disabled={!clickable}
              onClick={() => onToggle?.(day.date)}
              className={dayClass(day, isSelected, clickable)}
            >
              <div className="flex items-center justify-between font-semibold">
                <span>{Number(day.date.slice(8))}</span>
                <span className="text-[10px] font-medium text-slate-600">
                  {day.remaining}/{day.slots}
                </span>
              </div>
              {showNames && day.names.length > 0 && (
                <div className="mt-1 hidden space-y-0.5 sm:block">
                  {day.names.slice(0, 3).map((name) => (
                    <div key={name} className="truncate text-[10px] text-slate-700">
                      {name}
                    </div>
                  ))}
                  {day.names.length > 3 && <div className="text-[10px] text-slate-500">+{day.names.length - 3}</div>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
