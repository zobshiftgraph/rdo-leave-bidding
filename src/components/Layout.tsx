import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { NotificationItem, PublicUser } from "../types";
import PushBanner from "./PushBanner";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10 hover:text-white"}`;

export default function Layout({
  user,
  onLogout,
  children,
}: {
  user: PublicUser;
  onLogout: () => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<NotificationItem[]>([]);

  async function loadNotes() {
    const data = await api<{ notifications: NotificationItem[] }>("/api/notifications");
    setNotes(data.notifications);
  }

  useEffect(() => {
    loadNotes().catch(() => undefined);
    const t = setInterval(() => loadNotes().catch(() => undefined), 15000);
    return () => clearInterval(t);
  }, []);

  const unread = notes.filter((n) => !n.read).length;

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    onLogout();
    navigate("/");
  }

  async function markRead() {
    await api("/api/notifications/read", { method: "POST" });
    await loadNotes();
  }

  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded bg-gold text-navy-dark text-xs font-bold">RDO</span>
            Leave Bid
          </div>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            <NavLink to="/" className={linkClass} end>
              Home
            </NavLink>
            <NavLink to="/rdo" className={linkClass}>
              RDO
            </NavLink>
            <NavLink to="/leave" className={linkClass}>
              Leave bid
            </NavLink>
            <NavLink to="/calendar" className={linkClass}>
              Calendar
            </NavLink>
            {user.role === "admin" && (
              <>
                <NavLink to="/roster" className={linkClass}>
                  Roster
                </NavLink>
                <NavLink to="/cycle" className={linkClass}>
                  Bid setup
                </NavLink>
                <NavLink to="/users" className={linkClass}>
                  Users
                </NavLink>
              </>
            )}
          </nav>
          <div className="relative">
            <button
              type="button"
              className="relative rounded-md p-2 hover:bg-white/10"
              onClick={() => {
                setOpen((v) => !v);
                if (!open && unread) markRead().catch(() => undefined);
              }}
              aria-label="Notifications"
            >
              <span className="text-lg">🔔</span>
              {unread > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy-dark">
                  {unread}
                </span>
              )}
            </button>
            {open && (
              <div className="absolute right-0 z-20 mt-2 w-80 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white text-slate-800 shadow-xl">
                <div className="border-b px-3 py-2 text-sm font-semibold">Notifications</div>
                {notes.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">No notifications yet.</p>}
                {notes.map((n) => (
                  <div key={n.id} className={`border-b px-3 py-2 text-sm ${n.read ? "bg-white" : "bg-amber-50"}`}>
                    <div className="font-medium">{n.title}</div>
                    <div className="text-slate-600">{n.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="hidden text-right text-xs sm:block">
            <div className="font-medium">{user.name}</div>
            <div className="text-slate-300">
              {user.role === "admin" ? "admin" : "bidder"}
              {user.seniority ? ` · bid #${user.seniority}` : ""}
            </div>
          </div>
          <NavLink to="/account" className="text-sm text-slate-200 hover:text-white">
            Account
          </NavLink>
          <button type="button" className="text-sm text-slate-200 hover:text-white" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <PushBanner />
        {children}
      </main>
    </div>
  );
}
