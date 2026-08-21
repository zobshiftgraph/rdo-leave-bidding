import { Hono } from "hono";
import {
  clearSession,
  createSession,
  hashPassword,
  publicUser,
  randomPassword,
  requireAdmin,
  requireAuth,
  verifyPassword,
  type AppEnv,
} from "./auth";
import { eachDate, getQueue, lineDaysLabel, notify, notifyTurn, parseRoster, slugUsername, slotsForDate, weekdayOf } from "./helpers";
import type { Cycle, RdoLine, User } from "./types";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "Server error" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

function userCount(n: unknown) {
  return Number(n ?? 0);
}

app.get("/api/bootstrap", async (c) => {
  if (!c.env.DB) return c.json({ error: "Database is not connected." }, 500);
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  return c.json({ needsSetup: userCount(row?.n) === 0 });
});

app.post("/api/bootstrap", async (c) => {
  if (!c.env.DB) return c.json({ error: "Database is not connected." }, 500);
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  if (userCount(row?.n) > 0) return c.json({ error: "Already set up." }, 400);
  const body = await c.req.json<{ name: string; username: string; password: string; email?: string }>();
  if (!body.name?.trim() || !body.username?.trim() || !body.password || body.password.length < 8) {
    return c.json({ error: "Name, username, and a password of at least 8 characters are required." }, 400);
  }
  const { hash, salt } = await hashPassword(body.password);
  const result = await c.env.DB
    .prepare(
      `INSERT INTO users (name, username, email, password_hash, password_salt, role, must_change_password)
       VALUES (?, ?, ?, ?, ?, 'admin', 0)`,
    )
    .bind(body.name.trim(), body.username.trim().toLowerCase(), body.email?.trim() || null, hash, salt)
    .run();
  await createSession(c, Number(result.meta.last_row_id));
  return c.json({ ok: true });
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  const user = await c.env.DB
    .prepare(
      `SELECT id, name, username, email, role, seniority, employee_number, active, must_change_password, password_hash, password_salt
       FROM users WHERE lower(username) = lower(?) AND active = 1`,
    )
    .bind(body.username?.trim() ?? "")
    .first<User & { password_hash: string; password_salt: string }>();
  if (!user || !(await verifyPassword(body.password ?? "", user.password_hash, user.password_salt))) {
    return c.json({ error: "Invalid username or password." }, 401);
  }
  await createSession(c, user.id);
  return c.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", async (c) => {
  await clearSession(c);
  return c.json({ ok: true });
});

app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth") || c.req.path === "/api/health" || c.req.path === "/api/bootstrap") {
    return next();
  }
  return requireAuth(c, next);
});

app.get("/api/me", (c) => c.json({ user: publicUser(c.get("user")) }));

app.post("/api/me/password", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ currentPassword?: string; password: string }>();
  if (!body.password || body.password.length < 8) return c.json({ error: "Password must be at least 8 characters." }, 400);
  const row = await c.env.DB
    .prepare("SELECT password_hash, password_salt, must_change_password FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string; must_change_password: number }>();
  if (!row) return c.json({ error: "User not found." }, 404);
  if (!row.must_change_password) {
    if (!body.currentPassword || !(await verifyPassword(body.currentPassword, row.password_hash, row.password_salt))) {
      return c.json({ error: "Current password is incorrect." }, 400);
    }
  }
  const { hash, salt } = await hashPassword(body.password);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?")
    .bind(hash, salt, user.id)
    .run();
  return c.json({ ok: true });
});

app.get("/api/notifications", async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT id, title, body, read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50")
    .bind(c.get("user").id)
    .all();
  return c.json({ notifications: results ?? [] });
});

app.post("/api/notifications/read", async (c) => {
  await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").bind(c.get("user").id).run();
  return c.json({ ok: true });
});

app.post("/api/roster/preview", requireAdmin, async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  return c.json({ rows: parseRoster(text ?? "") });
});

app.post("/api/roster/import", requireAdmin, async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const rows = parseRoster(text ?? "");
  if (rows.length === 0) return c.json({ error: "No names found in the pasted roster." }, 400);

  const existing = await c.env.DB
    .prepare("SELECT id, name, username, email, employee_number FROM users")
    .all<{ id: number; name: string; username: string; email: string | null; employee_number: string | null }>();
  const used = new Set((existing.results ?? []).map((u) => u.username.toLowerCase()));
  const created: { name: string; username: string; tempPassword: string; seniority: number }[] = [];
  const updated: string[] = [];

  const matchUser = (row: typeof rows[0]) =>
    (existing.results ?? []).find((u) => {
      if (row.employee_number && u.employee_number && row.employee_number === u.employee_number) return true;
      if (row.email && u.email && row.email.toLowerCase() === u.email.toLowerCase()) return true;
      return u.name.trim().toLowerCase() === row.name.trim().toLowerCase();
    });

  await c.env.DB.prepare("UPDATE users SET seniority = NULL WHERE role = 'bidder'").run();

  for (const row of rows) {
    const found = matchUser(row);
    if (found) {
      await c.env.DB
        .prepare(
          `UPDATE users SET name = ?, email = COALESCE(?, email), employee_number = COALESCE(?, employee_number),
           seniority = ?, active = 1 WHERE id = ?`,
        )
        .bind(row.name, row.email ?? null, row.employee_number ?? null, row.seniority, found.id)
        .run();
      updated.push(row.name);
    } else {
      const username = slugUsername(row.name, used);
      const tempPassword = randomPassword();
      const { hash, salt } = await hashPassword(tempPassword);
      await c.env.DB
        .prepare(
          `INSERT INTO users (name, username, email, password_hash, password_salt, role, seniority, employee_number, must_change_password)
           VALUES (?, ?, ?, ?, ?, 'bidder', ?, ?, 1)`,
        )
        .bind(row.name, username, row.email ?? null, hash, salt, row.seniority, row.employee_number ?? null)
        .run();
      created.push({ name: row.name, username, tempPassword, seniority: row.seniority });
    }
  }

  await c.env.DB
    .prepare("UPDATE users SET active = 0 WHERE role = 'bidder' AND seniority IS NULL")
    .run();

  return c.json({ ok: true, created, updated, total: rows.length });
});

app.get("/api/users", requireAdmin, async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT id, name, username, email, role, seniority, employee_number, active, must_change_password
       FROM users ORDER BY CASE WHEN seniority IS NULL THEN 1 ELSE 0 END, seniority, name`,
    )
    .all();
  return c.json({ users: results ?? [] });
});

app.patch("/api/users/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ role?: string; active?: boolean; email?: string }>();
  const user = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(id).first<{ id: number; role: string }>();
  if (!user) return c.json({ error: "User not found." }, 404);
  if (body.role === "bidder" || body.role === "admin") {
    await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(body.role, id).run();
  }
  if (typeof body.active === "boolean") {
    await c.env.DB.prepare("UPDATE users SET active = ? WHERE id = ?").bind(body.active ? 1 : 0, id).run();
  }
  if (body.email !== undefined) {
    await c.env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(body.email || null, id).run();
  }
  return c.json({ ok: true });
});

app.post("/api/users/:id/reset-password", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const tempPassword = randomPassword();
  const { hash, salt } = await hashPassword(tempPassword);
  const result = await c.env.DB
    .prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1 WHERE id = ?")
    .bind(hash, salt, id)
    .run();
  if (!result.meta.changes) return c.json({ error: "User not found." }, 404);
  const user = await c.env.DB.prepare("SELECT name, username FROM users WHERE id = ?").bind(id).first<{ name: string; username: string }>();
  return c.json({ tempPassword, username: user?.username, name: user?.name });
});

async function getActiveCycle(db: D1Database) {
  return db.prepare("SELECT * FROM cycles WHERE is_active = 1 ORDER BY id DESC LIMIT 1").first<Cycle>();
}

app.get("/api/cycles", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM cycles ORDER BY id DESC").all<Cycle>();
  return c.json({ cycles: results ?? [] });
});

app.get("/api/cycles/active", async (c) => {
  const cycle = await getActiveCycle(c.env.DB);
  return c.json({ cycle });
});

app.post("/api/cycles", requireAdmin, async (c) => {
  const body = await c.req.json<{
    name?: string;
    leave_year?: number;
    rdo_mode?: "lines" | "weekdays";
    rdo_days_count?: number;
    default_slots_per_day?: number;
    max_leave_days?: number | null;
  }>();
  const leaveYear = body.leave_year ?? new Date().getUTCFullYear() + 1;
  const leaveStart = `${leaveYear}-01-01`;
  const leaveEnd = `${leaveYear}-12-31`;
  const name = body.name?.trim() || `${leaveYear} bid`;
  await c.env.DB.prepare("UPDATE cycles SET is_active = 0").run();
  const result = await c.env.DB
    .prepare(
      `INSERT INTO cycles (name, leave_year, leave_start, leave_end, rdo_mode, rdo_days_count, default_slots_per_day, max_leave_days, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      name,
      leaveYear,
      leaveStart,
      leaveEnd,
      body.rdo_mode === "weekdays" ? "weekdays" : "lines",
      body.rdo_days_count ?? 2,
      body.default_slots_per_day ?? 3,
      body.max_leave_days ?? null,
    )
    .run();
  const cycleId = Number(result.meta.last_row_id);
  const defaultLines = [
    { name: "Saturday / Sunday", days: [6, 0], slots: 4 },
    { name: "Sunday / Monday", days: [0, 1], slots: 3 },
    { name: "Friday / Saturday", days: [5, 6], slots: 3 },
    { name: "Monday / Tuesday", days: [1, 2], slots: 2 },
    { name: "Tuesday / Wednesday", days: [2, 3], slots: 2 },
    { name: "Wednesday / Thursday", days: [3, 4], slots: 2 },
    { name: "Thursday / Friday", days: [4, 5], slots: 2 },
  ];
  const stmts = defaultLines.map((line, i) =>
    c.env.DB
      .prepare("INSERT INTO rdo_lines (cycle_id, name, days, slots, sort_order) VALUES (?, ?, ?, ?, ?)")
      .bind(cycleId, line.name, JSON.stringify(line.days), line.slots, i),
  );
  const weekdayCaps = [0, 1, 2, 3, 4, 5, 6].map((d) =>
    c.env.DB.prepare("INSERT INTO rdo_weekday_caps (cycle_id, weekday, slots) VALUES (?, ?, ?)").bind(cycleId, d, d === 0 || d === 6 ? 6 : 4),
  );
  await c.env.DB.batch([...stmts, ...weekdayCaps]);
  return c.json({ id: cycleId });
});

app.patch("/api/cycles/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  const body = await c.req.json<Partial<Cycle>>();
  const canEditStructure = cycle.phase === "setup";
  const leaveYear = canEditStructure ? (body.leave_year ?? cycle.leave_year) : cycle.leave_year;
  await c.env.DB
    .prepare(
      `UPDATE cycles SET name = ?, leave_year = ?, leave_start = ?, leave_end = ?, rdo_mode = ?, rdo_days_count = ?,
       default_slots_per_day = ?, max_leave_days = ? WHERE id = ?`,
    )
    .bind(
      body.name ?? cycle.name,
      leaveYear,
      `${leaveYear}-01-01`,
      `${leaveYear}-12-31`,
      canEditStructure ? (body.rdo_mode ?? cycle.rdo_mode) : cycle.rdo_mode,
      canEditStructure ? (body.rdo_days_count ?? cycle.rdo_days_count) : cycle.rdo_days_count,
      body.default_slots_per_day ?? cycle.default_slots_per_day,
      body.max_leave_days === undefined ? cycle.max_leave_days : body.max_leave_days,
      id,
    )
    .run();
  return c.json({ ok: true });
});

app.put("/api/cycles/:id/rdo-lines", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  if (cycle.phase !== "setup") return c.json({ error: "RDO lines can only be edited before bidding starts." }, 400);
  const { lines } = await c.req.json<{ lines: { name: string; days: number[]; slots: number }[] }>();
  await c.env.DB.prepare("DELETE FROM rdo_lines WHERE cycle_id = ?").bind(id).run();
  const stmts = (lines ?? []).map((line, i) =>
    c.env.DB
      .prepare("INSERT INTO rdo_lines (cycle_id, name, days, slots, sort_order) VALUES (?, ?, ?, ?, ?)")
      .bind(id, line.name, JSON.stringify(line.days), Math.max(1, Number(line.slots) || 1), i),
  );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.put("/api/cycles/:id/weekday-caps", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const { caps } = await c.req.json<{ caps: { weekday: number; slots: number }[] }>();
  const stmts = (caps ?? []).map((cap) =>
    c.env.DB
      .prepare("INSERT INTO rdo_weekday_caps (cycle_id, weekday, slots) VALUES (?, ?, ?) ON CONFLICT(cycle_id, weekday) DO UPDATE SET slots = excluded.slots")
      .bind(id, cap.weekday, Math.max(0, Number(cap.slots) || 0)),
  );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.put("/api/cycles/:id/slot-windows", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  const { windows } = await c.req.json<{ windows: { start_date: string; end_date: string; slots_per_day: number }[] }>();
  const sorted = [...(windows ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_date <= sorted[i - 1].end_date) {
      return c.json({ error: "Leave slot date ranges cannot overlap." }, 400);
    }
  }
  await c.env.DB.prepare("DELETE FROM leave_slot_windows WHERE cycle_id = ?").bind(id).run();
  const stmts = sorted.map((w) =>
    c.env.DB
      .prepare("INSERT INTO leave_slot_windows (cycle_id, start_date, end_date, slots_per_day) VALUES (?, ?, ?, ?)")
      .bind(id, w.start_date, w.end_date, Math.max(0, Number(w.slots_per_day) || 0)),
  );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.post("/api/cycles/:id/start-rdo", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  if (cycle.phase !== "setup") return c.json({ error: "RDO bidding already started." }, 400);
  const bidders = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE active = 1 AND seniority IS NOT NULL").first<{ n: number }>();
  if (!bidders?.n) return c.json({ error: "Import a seniority roster before starting the bid." }, 400);
  await c.env.DB.prepare("UPDATE cycles SET phase = 'rdo_bidding' WHERE id = ?").bind(id).run();
  const queue = await getQueue(c.env.DB, id, "rdo");
  if (queue.current) await notifyTurn(c.env, queue.current, "rdo");
  return c.json({ ok: true, current: queue.current ? publicUser(queue.current) : null });
});

app.post("/api/cycles/:id/start-leave", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  if (cycle.phase === "leave_bidding" || cycle.phase === "complete") {
    return c.json({ error: "Leave bidding already started." }, 400);
  }
  await c.env.DB.prepare("UPDATE cycles SET phase = 'leave_bidding' WHERE id = ?").bind(id).run();
  const queue = await getQueue(c.env.DB, id, "leave");
  if (queue.current) await notifyTurn(c.env, queue.current, "leave", cycle.leave_year);
  return c.json({ ok: true, current: queue.current ? publicUser(queue.current) : null });
});

app.post("/api/cycles/:id/skip", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  const { userId } = await c.req.json<{ userId?: number }>();
  const phase = cycle.phase === "rdo_bidding" ? "rdo" : cycle.phase === "leave_bidding" ? "leave" : null;
  if (!phase) return c.json({ error: "No bid is in progress." }, 400);
  const queue = await getQueue(c.env.DB, id, phase);
  const target = userId ? queue.waiting.find((u) => u.id === userId) : queue.current;
  if (!target) return c.json({ error: "That person is not waiting to bid." }, 400);
  if (phase === "rdo") {
    await c.env.DB.prepare("INSERT INTO rdo_bids (cycle_id, user_id, skipped) VALUES (?, ?, 1)").bind(id, target.id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO leave_submissions (cycle_id, user_id, skipped) VALUES (?, ?, 1)").bind(id, target.id).run();
  }
  await notify(c.env, target.id, "Your bid turn was skipped", "An administrator skipped your turn. Contact them if that was a mistake.");
  const next = await getQueue(c.env.DB, id, phase);
  if (next.current) await notifyTurn(c.env, next.current, phase, cycle.leave_year);
  else if (phase === "rdo") {
    await c.env.DB.prepare("UPDATE cycles SET phase = 'leave_bidding' WHERE id = ?").bind(id).run();
    const leaveQueue = await getQueue(c.env.DB, id, "leave");
    if (leaveQueue.current) await notifyTurn(c.env, leaveQueue.current, "leave", cycle.leave_year);
  } else {
    await c.env.DB.prepare("UPDATE cycles SET phase = 'complete' WHERE id = ?").bind(id).run();
  }
  return c.json({ ok: true });
});

app.get("/api/cycles/:id/status", async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  const rdo = await getQueue(c.env.DB, id, "rdo");
  const leave = await getQueue(c.env.DB, id, "leave");
  const windows = await c.env.DB
    .prepare("SELECT id, start_date, end_date, slots_per_day FROM leave_slot_windows WHERE cycle_id = ? ORDER BY start_date")
    .bind(id)
    .all();
  const lines = await c.env.DB.prepare("SELECT * FROM rdo_lines WHERE cycle_id = ? ORDER BY sort_order").bind(id).all<RdoLine>();
  const caps = await c.env.DB.prepare("SELECT weekday, slots FROM rdo_weekday_caps WHERE cycle_id = ? ORDER BY weekday").bind(id).all();
  return c.json({
    cycle,
    rdo: {
      current: rdo.current ? publicUser(rdo.current) : null,
      waiting: rdo.waiting.map(publicUser),
      completedCount: rdo.completed.length,
    },
    leave: {
      current: leave.current ? publicUser(leave.current) : null,
      waiting: leave.waiting.map(publicUser),
      completedCount: leave.completed.length,
    },
    windows: windows.results ?? [],
    lines: lines.results ?? [],
    weekdayCaps: caps.results ?? [],
  });
});

app.get("/api/cycles/:id/rdo", async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  const lines = await c.env.DB.prepare("SELECT * FROM rdo_lines WHERE cycle_id = ? ORDER BY sort_order").bind(id).all<RdoLine>();
  const bids = await c.env.DB
    .prepare(
      `SELECT b.*, u.name, u.seniority
       FROM rdo_bids b JOIN users u ON u.id = b.user_id
       WHERE b.cycle_id = ? ORDER BY u.seniority`,
    )
    .bind(id)
    .all();
  const caps = await c.env.DB.prepare("SELECT weekday, slots FROM rdo_weekday_caps WHERE cycle_id = ?").bind(id).all<{ weekday: number; slots: number }>();
  const takenByLine: Record<number, number> = {};
  const takenByWeekday: Record<number, number> = {};
  for (const bid of bids.results ?? []) {
    const row = bid as { rdo_line_id: number | null; weekdays: string | null; skipped: number };
    if (row.skipped) continue;
    if (row.rdo_line_id) takenByLine[row.rdo_line_id] = (takenByLine[row.rdo_line_id] ?? 0) + 1;
    if (row.weekdays) {
      for (const d of JSON.parse(row.weekdays) as number[]) {
        takenByWeekday[d] = (takenByWeekday[d] ?? 0) + 1;
      }
    }
  }
  const queue = await getQueue(c.env.DB, id, "rdo");
  return c.json({
    cycle,
    lines: (lines.results ?? []).map((line) => ({
      ...line,
      days: JSON.parse(line.days) as number[],
      taken: takenByLine[line.id] ?? 0,
      remaining: line.slots - (takenByLine[line.id] ?? 0),
      label: lineDaysLabel(line.days),
    })),
    weekdayCaps: (caps.results ?? []).map((cap) => ({
      ...cap,
      taken: takenByWeekday[cap.weekday] ?? 0,
      remaining: cap.slots - (takenByWeekday[cap.weekday] ?? 0),
    })),
    bids: bids.results ?? [],
    current: queue.current ? publicUser(queue.current) : null,
    myTurn: queue.current?.id === c.get("user").id,
  });
});

app.post("/api/cycles/:id/rdo-bid", async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle || cycle.phase !== "rdo_bidding") return c.json({ error: "RDO bidding is not open." }, 400);
  const user = c.get("user");
  const queue = await getQueue(c.env.DB, id, "rdo");
  if (queue.current?.id !== user.id) return c.json({ error: "It is not your turn to bid RDOs." }, 403);
  const body = await c.req.json<{ rdo_line_id?: number; weekdays?: number[] }>();

  if (cycle.rdo_mode === "lines") {
    if (!body.rdo_line_id) return c.json({ error: "Select an RDO line." }, 400);
    const line = await c.env.DB.prepare("SELECT * FROM rdo_lines WHERE id = ? AND cycle_id = ?").bind(body.rdo_line_id, id).first<RdoLine>();
    if (!line) return c.json({ error: "That RDO line does not exist." }, 400);
    const taken = await c.env.DB
      .prepare("SELECT COUNT(*) AS n FROM rdo_bids WHERE cycle_id = ? AND rdo_line_id = ? AND skipped = 0")
      .bind(id, line.id)
      .first<{ n: number }>();
    if ((taken?.n ?? 0) >= line.slots) return c.json({ error: "That RDO line is full." }, 400);
    await c.env.DB.prepare("INSERT INTO rdo_bids (cycle_id, user_id, rdo_line_id) VALUES (?, ?, ?)").bind(id, user.id, line.id).run();
  } else {
    const days = [...new Set(body.weekdays ?? [])].sort();
    if (days.length !== cycle.rdo_days_count) {
      return c.json({ error: `Select exactly ${cycle.rdo_days_count} days off.` }, 400);
    }
    for (const d of days) {
      const cap = await c.env.DB
        .prepare("SELECT slots FROM rdo_weekday_caps WHERE cycle_id = ? AND weekday = ?")
        .bind(id, d)
        .first<{ slots: number }>();
      const taken = await c.env.DB
        .prepare("SELECT weekdays FROM rdo_bids WHERE cycle_id = ? AND skipped = 0 AND weekdays IS NOT NULL")
        .bind(id)
        .all<{ weekdays: string }>();
      const used = (taken.results ?? []).reduce((n, row) => n + (JSON.parse(row.weekdays) as number[]).filter((x) => x === d).length, 0);
      if (used >= (cap?.slots ?? 0)) return c.json({ error: `No remaining RDO slots on that day of the week.` }, 400);
    }
    await c.env.DB.prepare("INSERT INTO rdo_bids (cycle_id, user_id, weekdays) VALUES (?, ?, ?)").bind(id, user.id, JSON.stringify(days)).run();
  }

  const next = await getQueue(c.env.DB, id, "rdo");
  if (next.current) {
    await notifyTurn(c.env, next.current, "rdo");
  } else {
    await c.env.DB.prepare("UPDATE cycles SET phase = 'leave_bidding' WHERE id = ?").bind(id).run();
    const leaveQueue = await getQueue(c.env.DB, id, "leave");
    if (leaveQueue.current) await notifyTurn(c.env, leaveQueue.current, "leave", cycle.leave_year);
  }
  return c.json({ ok: true, next: next.current ? publicUser(next.current) : null });
});

app.get("/api/cycles/:id/calendar", async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle) return c.json({ error: "Cycle not found." }, 404);
  const month = c.req.query("month");
  const start = month ? `${month}-01` : cycle.leave_start;
  const end = month
    ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
    : cycle.leave_end;

  const bids = await c.env.DB
    .prepare(
      `SELECT b.leave_date, b.user_id, u.name, u.seniority
       FROM leave_bids b JOIN users u ON u.id = b.user_id
       WHERE b.cycle_id = ? AND b.leave_date >= ? AND b.leave_date <= ?
       ORDER BY b.leave_date, u.seniority`,
    )
    .bind(id, start, end)
    .all<{ leave_date: string; user_id: number; name: string; seniority: number }>();

  const byDate: Record<string, { leave_date: string; user_id: number; name: string; seniority: number }[]> = {};
  for (const bid of bids.results ?? []) {
    (byDate[bid.leave_date] ??= []).push(bid);
  }

  const days = [];
  for (const date of eachDate(start < cycle.leave_start ? cycle.leave_start : start, end > cycle.leave_end ? cycle.leave_end : end)) {
    if (date < cycle.leave_start || date > cycle.leave_end) continue;
    const slots = await slotsForDate(c.env.DB, cycle, date);
    const taken = byDate[date] ?? [];
    days.push({
      date,
      weekday: weekdayOf(date),
      slots,
      taken: taken.length,
      remaining: Math.max(0, slots - taken.length),
      names: taken.map((t) => t.name),
      mine: taken.some((t) => t.user_id === c.get("user").id),
    });
  }
  return c.json({ cycle, days });
});

app.get("/api/cycles/:id/my-leave", async (c) => {
  const id = Number(c.req.param("id"));
  const { results } = await c.env.DB
    .prepare("SELECT leave_date FROM leave_bids WHERE cycle_id = ? AND user_id = ? ORDER BY leave_date")
    .bind(id, c.get("user").id)
    .all<{ leave_date: string }>();
  const submitted = await c.env.DB
    .prepare("SELECT skipped, submitted_at FROM leave_submissions WHERE cycle_id = ? AND user_id = ?")
    .bind(id, c.get("user").id)
    .first();
  return c.json({ dates: (results ?? []).map((r) => r.leave_date), submitted });
});

app.post("/api/cycles/:id/leave-bid", async (c) => {
  const id = Number(c.req.param("id"));
  const cycle = await c.env.DB.prepare("SELECT * FROM cycles WHERE id = ?").bind(id).first<Cycle>();
  if (!cycle || cycle.phase !== "leave_bidding") return c.json({ error: "Leave bidding is not open." }, 400);
  const user = c.get("user");
  const queue = await getQueue(c.env.DB, id, "leave");
  if (queue.current?.id !== user.id) return c.json({ error: "It is not your turn to bid leave." }, 403);
  const body = await c.req.json<{ dates: string[] }>();
  const dates = [...new Set(body.dates ?? [])].sort();
  if (cycle.max_leave_days != null && dates.length > cycle.max_leave_days) {
    return c.json({ error: `You can bid at most ${cycle.max_leave_days} leave days.` }, 400);
  }
  for (const date of dates) {
    if (date < cycle.leave_start || date > cycle.leave_end) {
      return c.json({ error: `Leave must be between ${cycle.leave_start} and ${cycle.leave_end}.` }, 400);
    }
    const slots = await slotsForDate(c.env.DB, cycle, date);
    const taken = await c.env.DB
      .prepare("SELECT COUNT(*) AS n FROM leave_bids WHERE cycle_id = ? AND leave_date = ?")
      .bind(id, date)
      .first<{ n: number }>();
    if ((taken?.n ?? 0) >= slots) {
      return c.json({ error: `${date} is full (${slots} slot${slots === 1 ? "" : "s"}).` }, 400);
    }
  }
  const stmts = dates.map((date) =>
    c.env.DB.prepare("INSERT INTO leave_bids (cycle_id, user_id, leave_date) VALUES (?, ?, ?)").bind(id, user.id, date),
  );
  stmts.push(c.env.DB.prepare("INSERT INTO leave_submissions (cycle_id, user_id) VALUES (?, ?)").bind(id, user.id));
  await c.env.DB.batch(stmts);

  const next = await getQueue(c.env.DB, id, "leave");
  if (next.current) await notifyTurn(c.env, next.current, "leave", cycle.leave_year);
  else await c.env.DB.prepare("UPDATE cycles SET phase = 'complete' WHERE id = ?").bind(id).run();
  return c.json({ ok: true, next: next.current ? publicUser(next.current) : null });
});

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found." }, 404);
  return c.text("Not found", 404);
});

export default app;
