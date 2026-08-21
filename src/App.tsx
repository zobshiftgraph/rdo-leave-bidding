import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import Layout from "./components/Layout";
import type { PublicUser } from "./types";
import Account from "./pages/Account";
import CalendarView from "./pages/CalendarView";
import CycleSetup from "./pages/CycleSetup";
import Dashboard from "./pages/Dashboard";
import LeaveBid from "./pages/LeaveBid";
import Login from "./pages/Login";
import RdoBid from "./pages/RdoBid";
import Roster from "./pages/Roster";
import Setup from "./pages/Setup";
import Users from "./pages/Users";

export default function App() {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boot = await api<{ needsSetup: boolean }>("/api/bootstrap");
        if (cancelled) return;
        setNeedsSetup(boot.needsSetup);
        if (!boot.needsSetup) {
          try {
            const me = await api<{ user: PublicUser }>("/api/me");
            if (!cancelled) setUser(me.user);
          } catch {
            if (!cancelled) setUser(null);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (needsSetup) {
    return (
      <Routes>
        <Route path="*" element={<Setup onCreated={() => { setNeedsSetup(false); }} />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={setUser} />} />
      </Routes>
    );
  }

  if (user.must_change_password && location.pathname !== "/account") {
    return <Navigate to="/account" replace />;
  }

  return (
    <Layout user={user} onLogout={() => setUser(null)}>
      <Routes>
        <Route path="/" element={<Dashboard user={user} />} />
        <Route path="/rdo" element={<RdoBid user={user} />} />
        <Route path="/leave" element={<LeaveBid user={user} />} />
        <Route path="/calendar" element={<CalendarView user={user} />} />
        <Route path="/account" element={<Account user={user} onUpdated={setUser} />} />
        {user.role === "admin" && (
          <>
            <Route path="/roster" element={<Roster />} />
            <Route path="/cycle" element={<CycleSetup />} />
            <Route path="/users" element={<Users />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
