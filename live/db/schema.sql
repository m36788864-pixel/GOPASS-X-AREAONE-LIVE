CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shows (
  id TEXT PRIMARY KEY,
  show_date TEXT NOT NULL DEFAULT '',
  show_time TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  poster TEXT NOT NULL DEFAULT '',
  youtube TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  type CHAR(1) NOT NULL DEFAULT 'L' CHECK (type IN ('L','R')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  show_id TEXT NOT NULL DEFAULT 'ALL',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_codes_show ON access_codes(show_id);

CREATE INDEX IF NOT EXISTS idx_access_codes_status ON access_codes(status);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  show_id TEXT NOT NULL REFERENCES shows(id) ON UPDATE CASCADE ON DELETE CASCADE,
  username TEXT NOT NULL DEFAULT 'Anonymous',
  message TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_show_created ON chat_messages(show_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON admin_sessions(expires_at);

/* ===== v2: หมดอายุ/จำกัดเครื่อง, ประกาศ, ตั้งค่าแชต, แบน, แอดมินในแชต ===== */
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS max_devices INTEGER;
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS code_devices (
  code_id BIGINT NOT NULL REFERENCES access_codes(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (code_id, device_id)
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_bans (
  username_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;


/* v3: event lifecycle, reports, polls, audit trail, login throttling */
ALTER TABLE shows ADD COLUMN IF NOT EXISTS purchase_url TEXT NOT NULL DEFAULT '';
ALTER TABLE shows ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS auto_rerun BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS show_reports (
  id BIGSERIAL PRIMARY KEY,
  show_id TEXT NOT NULL,
  show_name TEXT NOT NULL DEFAULT '',
  ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewers_peak INTEGER NOT NULL DEFAULT 0,
  viewers_average NUMERIC(12,2) NOT NULL DEFAULT 0,
  chat_count INTEGER NOT NULL DEFAULT 0,
  codes_used INTEGER NOT NULL DEFAULT 0,
  poll_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_show_reports_ended ON show_reports(ended_at DESC);

CREATE TABLE IF NOT EXISTS polls (
  id BIGSERIAL PRIMARY KEY,
  show_id TEXT NOT NULL REFERENCES shows(id) ON UPDATE CASCADE ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_key TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, voter_key)
);
CREATE TABLE IF NOT EXISTS reactions (
  id BIGSERIAL PRIMARY KEY,
  show_id TEXT NOT NULL REFERENCES shows(id) ON UPDATE CASCADE ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT '❤️',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reactions_show_created ON reactions(show_id, created_at DESC);
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT,
  username TEXT NOT NULL DEFAULT 'unknown',
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
