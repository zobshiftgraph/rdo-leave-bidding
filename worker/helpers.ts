import type { Env, RosterRow, User } from "./types";
import { WEEKDAYS } from "./types";
import { sendWebPushes } from "./push";

function splitRosterLine(line: string) {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim()).filter(Boolean);
  if (line.includes(",")) return line.split(",").map((c) => c.trim()).filter(Boolean);
  return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
}

function looksLikeHeaderRow(cells: string[]) {
  return cells.some((h) => {
    const v = h.toLowerCase();
    if (v.includes("@")) return false;
    return /^(name|seniority|rank|email|e-?mail|employee|#|phone|cell|mobile)$/i.test(h) || /name|seniority|email|employee|phone|cell|mobile/.test(v);
  });
}

export function parseRoster(text: string): RosterRow[] {
  const rawLines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (rawLines.length === 0) return [];

  let lines = rawLines;
  let nameIdx = -1;
  let seniorityIdx = -1;
  let emailIdx = -1;
  let empIdx = -1;
  let phoneIdx = -1;
  const headerCells = splitRosterLine(lines[0]);
  const header = headerCells.map((c) => c.toLowerCase());
  if (looksLikeHeaderRow(headerCells)) {
    nameIdx = header.findIndex((h) => h.includes("name"));
    seniorityIdx = header.findIndex((h) => /seniority|rank/.test(h) || h === "#");
    emailIdx = header.findIndex((h) => h.includes("email") || h.includes("mail"));
    empIdx = header.findIndex((h) => /(employee|emp\b|id)/.test(h) && !h.includes("email") && !h.includes("name"));
    phoneIdx = header.findIndex((h) => /phone|cell|mobile/.test(h));
    lines = lines.slice(1);
  }

  const rows: RosterRow[] = [];
  let auto = 1;
  for (const line of lines) {
    const cells = splitRosterLine(line);
    if (cells.length === 0) continue;

    let name = "";
    let seniorityRaw = "";
    let email: string | undefined;
    let employee_number: string | undefined;
    let phone: string | undefined;

    if (nameIdx >= 0) {
      name = (cells[nameIdx] || "").replace(/^\d+[.)\-]\s*/, "").trim();
      seniorityRaw = seniorityIdx >= 0 ? cells[seniorityIdx] || "" : "";
      email = emailIdx >= 0 ? cells[emailIdx] : cells.find((c) => c.includes("@"));
      if (empIdx >= 0 && cells[empIdx] && empIdx !== nameIdx) employee_number = cells[empIdx];
      if (phoneIdx >= 0 && cells[phoneIdx]) phone = cells[phoneIdx];
    } else {
      email = cells.find((c) => c.includes("@"));
      const rest = cells.filter((c) => c !== email);
      if (rest[0] && /^\d+[.)]*$/.test(rest[0]) && rest[1]) {
        seniorityRaw = rest[0];
        name = rest[1];
        employee_number = rest[2];
      } else {
        const numbered = line.match(/^(\d+)[.)\-]\s+(.+)$/) || line.match(/^(\d+)\s+([A-Za-z].+)$/);
        if (numbered) {
          seniorityRaw = numbered[1];
          const after = splitRosterLine(numbered[2]).filter((c) => !c.includes("@"));
          name = after[0] || numbered[2];
          employee_number = after[1];
        } else {
          name = rest[0] || "";
          employee_number = rest[1];
        }
      }
    }

    name = name.replace(/^\d+[.)\-]\s+/, "").trim();
    if (!name || /^\d+$/.test(name)) continue;
    const seniority = Number.parseInt(String(seniorityRaw).replace(/\D/g, ""), 10);
    rows.push({
      seniority: Number.isFinite(seniority) && seniority > 0 ? seniority : auto,
      name,
      email: email || undefined,
      phone,
      employee_number,
    });
    auto += 1;
  }

  rows.sort((a, b) => a.seniority - b.seniority);
  return rows.map((row, i) => ({ ...row, seniority: i + 1 }));
}

export function slugUsername(name: string, used: Set<string>) {
  let base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  if (!base) base = "user";
  let username = base;
  let n = 2;
  while (used.has(username)) {
    username = `${base}${n}`;
    n += 1;
  }
  used.add(username);
  return username;
}

export function eachDate(start: string, end: string) {
  const dates: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function lineDaysLabel(daysJson: string) {
  try {
    const days = JSON.parse(daysJson) as number[];
    return days.map((d) => WEEKDAYS[d] ?? d).join("/");
  } catch {
    return daysJson;
  }
}

export async function getBidders(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT id, name, username, email, phone, role, seniority, employee_number, active, must_change_password
       FROM users
       WHERE active = 1 AND seniority IS NOT NULL
       ORDER BY seniority ASC`,
    )
    .all<User>();
  return results ?? [];
}

export async function getQueue(db: D1Database, cycleId: number, phase: "rdo" | "leave") {
  const bidders = await getBidders(db);
  const table = phase === "rdo" ? "rdo_bids" : "leave_submissions";
  const { results } = await db
    .prepare(`SELECT user_id FROM ${table} WHERE cycle_id = ?`)
    .bind(cycleId)
    .all<{ user_id: number }>();
  const done = new Set((results ?? []).map((r) => r.user_id));
  const waiting = bidders.filter((b) => !done.has(b.id));
  const completed = bidders.filter((b) => done.has(b.id));
  return { current: waiting[0] ?? null, waiting, completed, bidders };
}

export async function slotsForDate(
  db: D1Database,
  cycle: { id: number; default_slots_per_day: number },
  date: string,
) {
  const window = await db
    .prepare(
      `SELECT slots_per_day FROM leave_slot_windows
       WHERE cycle_id = ? AND start_date <= ? AND end_date >= ?
       ORDER BY start_date DESC LIMIT 1`,
    )
    .bind(cycle.id, date, date)
    .first<{ slots_per_day: number }>();
  return window?.slots_per_day ?? cycle.default_slots_per_day;
}

export function normalizePhone(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return undefined;
}

export async function notify(
  env: Env,
  userId: number,
  title: string,
  body: string,
) {
  await env.DB.prepare("INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)").bind(userId, title, body).run();
  const user = await env.DB
    .prepare("SELECT name, email, phone FROM users WHERE id = ?")
    .bind(userId)
    .first<{ name: string; email: string | null; phone: string | null }>();
  if (!user) return;

  const link = env.APP_URL?.replace(/\/$/, "") || "";
  const text = [body, link].filter(Boolean).join(" ");

  if (env.RESEND_API_KEY && user.email) {
    const from = env.MAIL_FROM || "RDO Bidding <noreply@example.com>";
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: title,
          text: `Hi ${user.name},\n\n${body}\n\n${link}`.trim(),
        }),
      });
    } catch (err) {
      console.error("email failed", err);
    }
  }

  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER && user.phone) {
    try {
      const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: user.phone,
          From: env.TWILIO_FROM_NUMBER,
          Body: `${title}. ${text}`.slice(0, 320),
        }),
      });
      if (!res.ok) console.error("sms failed", await res.text());
    } catch (err) {
      console.error("sms failed", err);
    }
  }

  await sendWebPushes(env, userId, title, body);
}

export async function notifyTurn(env: Env, user: User, phase: "rdo" | "leave", leaveYear?: number) {
  if (phase === "rdo") {
    await notify(env, user.id, "It's your turn to bid RDOs", "You are up on the seniority list. Log in and select your Regular Days Off.");
  } else {
    await notify(
      env,
      user.id,
      "It's your turn to bid leave",
      `You are up to bid annual leave for ${leaveYear ?? "next year"}. Log in and pick your days on the calendar.`,
    );
  }
}
