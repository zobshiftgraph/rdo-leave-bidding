import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import type { Cycle } from "../types";
import { biddingPaused } from "../types";

export default function PausedBanner() {
  const location = useLocation();
  const [cycle, setCycle] = useState<Cycle | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api<{ cycle: Cycle | null }>("/api/cycles/active");
        setCycle(data.cycle);
      } catch {
        /* ignore */
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [location.pathname]);

  if (!cycle || !biddingPaused(cycle)) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      Bidding is paused. Nobody can submit until an administrator resumes it from Bid setup.
    </div>
  );
}
