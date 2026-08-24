import { useEffect, useState } from "react";
import { api } from "../api";
import { enablePush, pushSupported } from "../push";

export default function PushBanner() {
  const [status, setStatus] = useState<"idle" | "on" | "busy" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ subscribed: boolean }>("/api/push/status");
        if (cancelled) return;
        if (data.subscribed) {
          setStatus("on");
          return;
        }
        if (Notification.permission === "granted") {
          await enablePush();
          if (!cancelled) setStatus("on");
        }
      } catch {
        /* table may not exist yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pushSupported()) {
    return (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        This browser cannot show phone alerts. On iPhone, add this site to your Home Screen (Share → Add to Home Screen), then open it from there.
      </div>
    );
  }

  if (status === "on") {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Phone alerts are on for this device. You will get a notification when it is your turn to bid.
      </div>
    );
  }

  async function turnOn() {
    setError("");
    setStatus("busy");
    try {
      await enablePush();
      setStatus("on");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not enable alerts");
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-gold bg-amber-50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-navy">Get a phone alert when it is your turn</div>
          <div className="text-slate-600">
            Allow notifications on this device. iPhone: add the site to your Home Screen first, then tap the button.
          </div>
          {error && <div className="mt-1 text-red-700">{error}</div>}
        </div>
        <button
          type="button"
          disabled={status === "busy"}
          onClick={turnOn}
          className="rounded-md bg-navy px-4 py-2 font-medium text-white disabled:opacity-70"
        >
          {status === "busy" ? "Enabling…" : "Turn on alerts"}
        </button>
      </div>
    </div>
  );
}
