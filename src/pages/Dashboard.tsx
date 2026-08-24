import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Cycle, PublicUser } from "../types";
import { PHASE_LABEL } from "../types";

interface Status {
  cycle: Cycle;
  rdo: { current: PublicUser | null; waiting: PublicUser[]; completedCount: number };
  leave: { current: PublicUser | null; waiting: PublicUser[]; completedCount: number };
}

export default function Dashboard({ user }: { user: PublicUser }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { cycle } = await api<{ cycle: Cycle | null }>("/api/cycles/active");
        if (!cycle) return;
        const data = await api<Status>(`/api/cycles/${cycle.id}/status`);
        setStatus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load dashboard");
      }
    })();
  }, []);

  const current =
    status?.cycle.phase === "rdo_bidding"
      ? status.rdo.current
      : status?.cycle.phase === "leave_bidding"
        ? status.leave.current
        : null;
  const myTurn = current?.id === user.id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-slate-600">
          {user.role === "admin" ? "Administrator" : "Account"}
          {user.seniority ? ` · Seniority #${user.seniority} (you can bid)` : user.role === "admin" ? " · add yourself to the roster to bid" : ""}
        </p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!status && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          No bid cycle is open yet.
          {user.role === "admin" && (
            <div className="mt-3">
              <Link to="/cycle" className="font-medium text-navy underline">
                Create a bid cycle
              </Link>
            </div>
          )}
        </div>
      )}
      {status && (
        <>
          {myTurn && (
            <div className="rounded-xl border border-gold bg-amber-50 p-5 shadow-sm">
              <div className="text-sm font-semibold uppercase tracking-wide text-gold-dark">Your turn</div>
              <p className="mt-1 text-lg font-medium text-navy">
                {status.cycle.phase === "rdo_bidding"
                  ? "You are up to bid Regular Days Off."
                  : `You are up to bid leave for ${status.cycle.leave_year}.`}
              </p>
              <Link
                to={status.cycle.phase === "rdo_bidding" ? "/rdo" : "/leave"}
                className="mt-3 inline-block rounded-md bg-navy px-4 py-2 text-sm font-medium text-white"
              >
                Bid now
              </Link>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Bid cycle" value={status.cycle.name} hint={PHASE_LABEL[status.cycle.phase]} />
            <Card
              title="Leave year"
              value={String(status.cycle.leave_year)}
              hint={`${status.cycle.leave_start} to ${status.cycle.leave_end}`}
            />
            <Card
              title="Now bidding"
              value={current?.name ?? (status.cycle.phase === "complete" ? "Finished" : "Waiting")}
              hint={current && current.id !== user.id ? "You will be notified when it is your turn" : " "}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Queue title="RDO order" people={status.rdo.waiting} done={status.rdo.completedCount} currentId={status.rdo.current?.id} />
            <Queue title="Leave order" people={status.leave.waiting} done={status.leave.completedCount} currentId={status.leave.current?.id} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/calendar" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
              View leave calendar
            </Link>
            {user.role === "admin" && (
              <Link to="/cycle" className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">
                Manage bid
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-semibold text-navy">{value}</div>
      <div className="text-sm text-slate-500">{hint}</div>
    </div>
  );
}

function Queue({
  title,
  people,
  done,
  currentId,
}: {
  title: string;
  people: PublicUser[];
  done: number;
  currentId?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-navy">{title}</h2>
        <span className="text-xs text-slate-500">{done} done</span>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-slate-500">Queue empty.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {people.slice(0, 8).map((p) => (
            <li key={p.id} className={p.id === currentId ? "rounded bg-amber-50 px-2 py-1 font-medium" : "px-2 py-1"}>
              #{p.seniority} {p.name}
              {p.id === currentId ? " — bidding now" : ""}
            </li>
          ))}
          {people.length > 8 && <li className="px-2 text-slate-500">+{people.length - 8} more</li>}
        </ol>
      )}
    </div>
  );
}
