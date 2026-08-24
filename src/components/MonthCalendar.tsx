import { WEEKDAYS, type CalendarDay } from "../types";

function dayClass(day: CalendarDay, selected: boolean, interactive: boolean, compact: boolean) {
  const parts = [
    compact ? "cal-cell-compact rounded border p-0.5 text-left text-[10px] leading-tight transition" : "cal-cell rounded-md border p-1.5 text-left text-xs transition",
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
  compact = false,
}: {
  year: number;
  month: number;
  days: CalendarDay[];
  selected?: Set<string>;
  onToggle?: (date: string) => void;
  showNames?: boolean;
  compact?: boolean;
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
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${compact ? "p-3" : "mb-6 p-4"}`}>
      <h3 className={`font-semibold text-navy ${compact ? "mb-2 text-sm" : "mb-3 text-lg"}`}>{label}</h3>
      <div className={`grid grid-cols-7 gap-1 text-center font-semibold uppercase tracking-wide text-slate-500 ${compact ? "text-[9px]" : "text-[11px]"}`}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-0.5">
            {compact ? d.slice(0, 2) : d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const isSelected = selected?.has(day.date) ?? false;
          const full = day.remaining <= 0 && !isSelected;
          const clickable = Boolean(onToggle) && (!full || isSelected);
          const nameTitle = day.names.length ? day.names.join(", ") : undefined;
          return (
            <button
              key={day.date}
              type="button"
              disabled={Boolean(onToggle) && !clickable}
              title={nameTitle}
              onClick={() => {
                if (clickable) onToggle?.(day.date);
              }}
              className={dayClass(day, isSelected, clickable, compact)}
            >
              <div className="flex items-center justify-between font-semibold">
                <span>{Number(day.date.slice(8))}</span>
                <span className={`font-medium text-slate-600 ${compact ? "text-[9px]" : "text-[10px]"}`}>
                  {day.remaining}/{day.slots}
                </span>
              </div>
              {showNames && !compact && day.names.length > 0 && (
                <div className="mt-1 hidden space-y-0.5 sm:block">
                  {day.names.slice(0, 3).map((name) => (
                    <div key={name} className="truncate text-[10px] text-slate-700">
                      {name}
                    </div>
                  ))}
                  {day.names.length > 3 && <div className="text-[10px] text-slate-500">+{day.names.length - 3}</div>}
                </div>
              )}
              {showNames && compact && day.names.length > 0 && (
                <div className="mt-0.5 truncate text-[9px] text-slate-700">
                  {day.names[0]}
                  {day.names.length > 1 ? ` +${day.names.length - 1}` : ""}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function YearCalendars({
  year,
  days,
  selected,
  onToggle,
  showNames = false,
}: {
  year: number;
  days: CalendarDay[];
  selected?: Set<string>;
  onToggle?: (date: string) => void;
  showNames?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 12 }, (_, month) => (
        <MonthCalendar
          key={month}
          year={year}
          month={month}
          days={days}
          selected={selected}
          onToggle={onToggle}
          showNames={showNames}
          compact
        />
      ))}
    </div>
  );
}
