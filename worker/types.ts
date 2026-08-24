export type Role = "admin" | "bidder";
export type Phase = "setup" | "rdo_bidding" | "leave_bidding" | "complete";
export type RdoMode = "lines" | "weekdays";

export interface Env {
  DB: D1Database;
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;
  APP_URL?: string;
  MAIL_FROM?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
}

export interface User {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: Role;
  seniority: number | null;
  employee_number: string | null;
  phone: string | null;
  active: number;
  must_change_password: number;
}

export interface Cycle {
  id: number;
  name: string;
  leave_year: number;
  leave_start: string;
  leave_end: string;
  phase: Phase;
  rdo_mode: RdoMode;
  rdo_days_count: number;
  default_slots_per_day: number;
  max_leave_days: number | null;
  is_active: number;
}

export interface RdoLine {
  id: number;
  cycle_id: number;
  name: string;
  days: string;
  slots: number;
  sort_order: number;
}

export interface RosterRow {
  seniority: number;
  name: string;
  email?: string;
  phone?: string;
  employee_number?: string;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
