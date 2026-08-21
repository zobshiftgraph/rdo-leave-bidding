CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'bidder' CHECK (role IN ('admin', 'bidder')),
  seniority INTEGER,
  employee_number TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_seniority ON users (seniority);
CREATE INDEX idx_users_email ON users (email);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  leave_year INTEGER NOT NULL,
  leave_start TEXT NOT NULL,
  leave_end TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'setup' CHECK (phase IN ('setup', 'rdo_bidding', 'leave_bidding', 'complete')),
  rdo_mode TEXT NOT NULL DEFAULT 'lines' CHECK (rdo_mode IN ('lines', 'weekdays')),
  rdo_days_count INTEGER NOT NULL DEFAULT 2,
  default_slots_per_day INTEGER NOT NULL DEFAULT 3,
  max_leave_days INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rdo_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days TEXT NOT NULL,
  slots INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rdo_weekday_caps (
  cycle_id INTEGER NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  slots INTEGER NOT NULL,
  PRIMARY KEY (cycle_id, weekday)
);

CREATE TABLE rdo_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id),
  rdo_line_id INTEGER REFERENCES rdo_lines (id),
  weekdays TEXT,
  skipped INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cycle_id, user_id)
);

CREATE TABLE leave_slot_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  slots_per_day INTEGER NOT NULL
);

CREATE INDEX idx_slot_windows_cycle ON leave_slot_windows (cycle_id, start_date, end_date);

CREATE TABLE leave_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id),
  leave_date TEXT NOT NULL,
  UNIQUE (cycle_id, user_id, leave_date)
);

CREATE INDEX idx_leave_bids_date ON leave_bids (cycle_id, leave_date);

CREATE TABLE leave_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES cycles (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id),
  skipped INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cycle_id, user_id)
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_user ON notifications (user_id, read, created_at);
