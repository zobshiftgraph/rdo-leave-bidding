export type Role = "admin" | "bidder";
export type Phase = "setup" | "rdo_bidding" | "leave_bidding" | "complete";

export interface PublicUser {
  id: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: Role;
  seniority: number | null;
  employee_number: string | null;
  must_change_password: boolean;
}

export interface Cycle {
  id: number;
  name: string;
  leave_year: number;
  leave_start: string;
  leave_end: string;
  phase: Phase;
  rdo_mode: "lines" | "weekdays";
  rdo_days_count: number;
  default_slots_per_day: number;
  max_leave_days: number | null;
  is_active: number;
  paused: number;
}

export interface SlotWindow {
  id?: number;
  start_date: string;
  end_date: string;
  slots_per_day: number;
}

export interface CalendarDay {
  date: string;
  weekday: number;
  slots: number;
  taken: number;
  remaining: number;
  names: string[];
  mine: boolean;
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  read: number;
  created_at: string;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const PHASE_LABEL: Record<Phase, string> = {
  setup: "Setup",
  rdo_bidding: "RDO bidding",
  leave_bidding: "Leave bidding",
  complete: "Complete",
};

export function biddingPaused(cycle: Pick<Cycle, "phase" | "paused">) {
  return Boolean(cycle.paused) && (cycle.phase === "rdo_bidding" || cycle.phase === "leave_bidding");
}

export function cyclePhaseLabel(cycle: Pick<Cycle, "phase" | "paused">) {
  const label = PHASE_LABEL[cycle.phase];
  return biddingPaused(cycle) ? `${label} · paused` : label;
}
