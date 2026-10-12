require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { query, pool } = require('./db');
const {
  ensureAdmin,
  login,
  requireAdmin,
  logout,
  cleanupSessions
} = require('./auth');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const startedAt = Date.now();
let lastError = null;
let alertLastSent = 0;
const viewerSamples = new Map();

/* =========================================================
   MIDDLEWARE
========================================================= */

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  // YouTube ต้องเห็น Referer ของเว็บเรา ไม่งั้นตัวเล่นขึ้น "Error 153"
  // (ค่าเริ่มต้นของ helmet คือ no-referrer ซึ่งทำให้ตัวเล่นฝังไม่ทำงาน)
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CSP: report-only by default; switch CSP_MODE=enforce after reviewing browser reports.
const CSP_MODE = String(process.env.CSP_MODE || 'report').toLowerCase();
app.use((req, res, next) => {
  const policy = "default-src 'self'; img-src 'self' https: data:; media-src https: blob:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https: wss:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'";
  res.setHeader(CSP_MODE === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', policy);
  next();
});

// Parse JSON request bodies
app.use(express.json({
  limit: '256kb'
}));

// Parse form-urlencoded request bodies
app.use(express.urlencoded({
  extended: false,
  limit: '256kb'
}));

/* =========================================================
   RATE LIMITERS
========================================================= */

const publicLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

const verifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'ลองรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
  }
});

const chatLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    success: false,
    message: 'โปรดรออีกครั้ง 5 วิ',
    retryAfter: 5
  })
});

// endpoint ที่ผู้ชมเรียกซ้ำๆ (แชต/presence/ประกาศ) ใช้โควต้าแยก เพื่อไม่ให้คนดูหลายคนบน Wi-Fi เดียวกันชนลิมิตกัน
const pollLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 1500,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

function isPollRequest(req) {
  const p = req.path;
  if (req.method === 'GET') return /^\/chat\/[^/]+$/.test(p) || p === '/announcement' || p === '/maintenance' || p === '/security';
  if (req.method === 'POST') return p === '/presence';
  return false;
}

app.use('/api', (req, res, next) =>
  (isPollRequest(req) ? pollLimiter : publicLimiter)(req, res, next)
);

// โหมดปรับปรุงระบบ: เปิดอยู่ = บล็อก API ฝั่งผู้ชมทั้งหมด (ยกเว้น /admin และ /maintenance)
app.use('/api', async (req, res, next) => {
  try {
    const p = req.path;

    if (p.startsWith('/admin') || p.startsWith('/integration') || p === '/maintenance' || p === '/security') return next();

    const m = await getMaintenance();

    if (!m.enabled) return next();

    // แอดมินที่ยืนยันตัวตนแล้วสามารถเข้าเว็บเพื่อทดสอบได้ชั่วคราวระหว่าง Maintenance
    const cookieHeader = String(req.headers.cookie || '');
    const previewMatch = cookieHeader.match(/(?:^|;\s*)aol_mtn_preview=([a-f0-9]{64})(?:;|$)/);
    if (previewMatch) {
      const session = await query(
        `SELECT 1 FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [previewMatch[1]]
      );
      if (session.rowCount) return next();
    }

    return res.status(503).json({
      success: false,
      maintenance: true,
      message: 'We’re updating the website Please come back later.',
      note: m.note,
      texts: m.texts || {},
      schedule: m.schedule || {}
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   HELPERS
========================================================= */

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeYoutube(value) {
  const input = clean(value, 500);

  if (!input) return '';

  try {
    const url = new URL(input);

    if (url.hostname.includes('youtu.be')) {
      return url.pathname
        .replace(/^\//, '')
        .slice(0, 11);
    }

    if (url.hostname.includes('youtube.com')) {
      return url.searchParams.get('v') || input;
    }
  } catch (_) {}

  return input
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 11);
}

function makeCodePart(length = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let out = '';

  for (let i = 0; i < length; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }

  return out;
}

const CODE_PREFIX = 'AOL';

function makeCode() {
  return `${CODE_PREFIX}-${makeCodePart()}-${makeCodePart()}-${makeCodePart()}`;
}

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

// id ของ access_codes เป็น BIGINT — กันค่าแปลกๆ ก่อนส่งเข้า SQL
function parseId(value) {
  const s = String(value ?? '').trim();
  return /^\d{1,18}$/.test(s) ? s : null;
}

const normName = value => String(value ?? '').trim().toLowerCase();

/* ---------- cache เล็กๆ ในหน่วยความจำ ---------- */
const memCache = new Map();

async function cached(key, ttlMs, loader) {
  const hit = memCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await loader();
  memCache.set(key, { value, exp: Date.now() + ttlMs });
  return value;
}

function invalidate(key) {
  memCache.delete(key);
}
function invalidateChat(showId) { if (showId) invalidate('chat:' + showId); else for (const key of memCache.keys()) if (key.startsWith('chat:')) memCache.delete(key); }
async function audit(req, action, details = {}) { try { await query('INSERT INTO admin_audit_log (admin_id, username, action, details, ip) VALUES ($1,$2,$3,$4,$5)', [req.admin?.id || null, req.admin?.username || 'unknown', action, JSON.stringify(details), String(req.ip || '').slice(0,100)]); await sendWebhook(process.env.DISCORD_AUDIT_WEBHOOK || process.env.DISCORD_ALERT_WEBHOOK, `Admin action: ${action}\nUser: ${req.admin?.username || 'unknown'}\nDetails: ${JSON.stringify(details).slice(0,1200)}`); } catch (e) { console.error('Audit log failed:', e.message); } }
async function sendWebhook(url, content) { if (!url || !/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//i.test(url)) return; if (typeof fetch !== 'function') return; try { await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({content:String(content).slice(0,1900)}), signal:AbortSignal.timeout(4000) }); } catch (_) {} }
function invalidateAllAnnouncement() { for (const key of memCache.keys()) if (key.startsWith('announcement:')) memCache.delete(key); }

/* ---------- site_settings (JSONB) ---------- */
async function getSetting(key, fallback) {
  const r = await query('SELECT value FROM site_settings WHERE key = $1', [key]);
  return r.rowCount ? r.rows[0].value : fallback;
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO site_settings (key, value)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

function getMaintenance() {
  return cached('maintenance', 3000, async () => {
    const v = await getSetting('maintenance', {});
    const schedule = (v.schedule && typeof v.schedule === 'object') ? v.schedule : {};
    const startsAt = schedule.startsAt ? Date.parse(schedule.startsAt) : NaN;
    const reopensAt = schedule.reopensAt ? Date.parse(schedule.reopensAt) : NaN;
    const scheduled = !!schedule.enabled && Number.isFinite(startsAt);
    const now = Date.now();
    let enabled = !!v.enabled;
    if (scheduled) {
      enabled = now >= startsAt;
      if (schedule.autoOpen !== false && Number.isFinite(reopensAt) && now >= reopensAt) enabled = false;
    }
    return {
      enabled,
      note: clean(v.note, 500),
      texts: (v.texts && typeof v.texts === 'object') ? v.texts : {},
      schedule: {
        enabled: !!schedule.enabled,
        startsAt: schedule.startsAt || '',
        reopensAt: schedule.reopensAt || '',
        countdownEnabled: schedule.countdownEnabled !== false,
        autoOpen: schedule.autoOpen !== false,
        showDays: schedule.showDays !== false,
        showSeconds: schedule.showSeconds !== false,
        animation: ['flip','roll','fade','none'].includes(schedule.animation) ? schedule.animation : 'flip'
      }
    };
  });
}

function getAnnouncement(showId = '') {
  const scope = clean(showId, 100);
  return cached('announcement:' + scope, 10000, async () => {
    const v = await getSetting('announcement', {});
    const text = clean(v.text, 200);
    const target = clean(v.showId || 'ALL', 100) || 'ALL';
    const matches = target === 'ALL' || (!!scope && target === scope);
    const link = /^https?:\/\//i.test(String(v.link || '')) ? clean(v.link, 500) : '';
    return {
      enabled: !!v.enabled && !!text && matches,
      text: matches ? text : '',
      level: v.level === 'warn' ? 'warn' : 'info',
      link,
      linkText: clean(v.linkText, 40),
      showId: target
    };
  });
}

function getChatSettings() {
  return cached('chatSettings', 5000, async () => {
    const v = await getSetting('chat', {});
    return {
      slowModeSec: clampInt(v.slowModeSec, 0, 300) ?? 0,
      blockedWords: Array.isArray(v.blockedWords)
        ? v.blockedWords.map(w => clean(w, 40)).filter(Boolean).slice(0, 200)
        : []
    };
  });
}

function getActiveShowIds() {
  return cached('activeShows', 30000, async () => {
    const r = await query('SELECT id FROM shows WHERE active = TRUE');
    return new Set(r.rows.map(x => x.id));
  });
}

/* ---------- presence (นับผู้ชมสด) เก็บในหน่วยความจำ ---------- */
const PRESENCE_TTL_MS = 45 * 1000;
const presence = new Map(); // showId -> Map(sid -> lastSeenMs)
let peakViewers = 0;

function countViewers(showId, now = Date.now()) {
  const m = presence.get(showId);
  if (!m) return 0;
  let n = 0;
  for (const [sid, t] of m) {
    if (now - t > PRESENCE_TTL_MS) m.delete(sid);
    else n++;
  }
  if (!m.size) presence.delete(showId);
  return n;
}

function totalViewers() {
  let total = 0;
  const per = {};
  for (const id of [...presence.keys()]) {
    const n = countViewers(id);
    if (n) { per[id] = n; total += n; }
  }
  if (total > peakViewers) peakViewers = total;
  return { total, per };
}

/* ---------- โหมดจำกัดความถี่แชต (key = sid หรือ IP + รอบ) ---------- */
const lastPost = new Map();

setInterval(() => {
  totalViewers();
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, t] of lastPost) if (t < cutoff) lastPost.delete(k);
}, 60 * 1000).unref();

/* ---------- ลงทะเบียนเครื่องของโค้ด (ใช้เมื่อโค้ดจำกัดจำนวนเครื่อง) ---------- */
async function registerDevice(codeId, deviceId, maxDevices) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM access_codes WHERE id = $1 FOR UPDATE', [codeId]);

    const existing = await client.query(
      'SELECT 1 FROM code_devices WHERE code_id = $1 AND device_id = $2',
      [codeId, deviceId]
    );

    if (existing.rowCount) {
      await client.query(
        'UPDATE code_devices SET last_seen = NOW() WHERE code_id = $1 AND device_id = $2',
        [codeId, deviceId]
      );
      await client.query('COMMIT');
      return true;
    }

    const count = await client.query(
      'SELECT COUNT(*)::int AS n FROM code_devices WHERE code_id = $1',
      [codeId]
    );

    if (count.rows[0].n >= maxDevices) {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      'INSERT INTO code_devices (code_id, device_id) VALUES ($1, $2)',
      [codeId, deviceId]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initDb() {
  const fs = require('fs');

  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'schema.sql'),
    'utf8'
  );

  await pool.query(schema);

  await ensureAdmin();

  await cleanupSessions();
}

async function finishShow(showId) {
  const r=await query('SELECT id,name,auto_rerun FROM shows WHERE id=$1',[showId]); if(!r.rowCount)return false;
  const show=r.rows[0];
  const report=await query(`SELECT (SELECT COUNT(*)::int FROM chat_messages WHERE show_id=$1) AS chats,(SELECT COUNT(*)::int FROM access_codes WHERE show_id=$1 AND last_used_at IS NOT NULL) AS codes`,[showId]);
  const pollRows=await query(`SELECT p.id,p.question,p.options,COALESCE((SELECT jsonb_agg(cnt ORDER BY idx) FROM (SELECT i AS idx,COUNT(v.option_index)::int AS cnt FROM generate_series(0,jsonb_array_length(p.options)-1) i LEFT JOIN poll_votes v ON v.poll_id=p.id AND v.option_index=i GROUP BY i) x),'[]'::jsonb) AS counts FROM polls p WHERE p.show_id=$1`,[showId]);
  const n=countViewers(showId), samples=viewerSamples.get(showId)||[]; const avg=samples.length?samples.reduce((a,b)=>a+b,0)/samples.length:n;
  await query(`INSERT INTO show_reports(show_id,show_name,viewers_peak,viewers_average,chat_count,codes_used,poll_results) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[showId,show.name,n,avg,report.rows[0].chats,report.rows[0].codes,JSON.stringify(pollRows.rows)]);
  await query("UPDATE shows SET active=CASE WHEN auto_rerun THEN TRUE ELSE FALSE END, ends_at=NULL, updated_at=NOW(), type=CASE WHEN auto_rerun THEN 'R' ELSE type END WHERE id=$1",[showId]);
  await query('UPDATE polls SET active=FALSE,closed_at=COALESCE(closed_at,NOW()) WHERE show_id=$1',[showId]);
  setTimeout(async()=>{try{await query('DELETE FROM chat_messages WHERE show_id=$1',[showId]);invalidateChat(showId);}catch(err){console.error('Scheduled chat cleanup failed:',err.message);}},Math.max(0,Number(process.env.CHAT_CLEANUP_DELAY_MINUTES||30))*60*1000).unref();
  invalidate('activeShows'); return true;
}

/* =========================================================
   HEALTH / DIAGNOSTICS
========================================================= */
app.get('/healthz', async (_req, res) => {
  const started = process.hrtime.bigint();
  let database = 'ok';
  try { await query('SELECT 1'); } catch (err) { database = 'error'; lastError = { at: new Date().toISOString(), message: String(err.message).slice(0,300) }; }
  const mem = process.memoryUsage();
  const viewers = totalViewers();
  const body = { ok: database === 'ok', database, uptimeSeconds: Math.floor((Date.now()-startedAt)/1000), memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal }, viewers: viewers.total, viewersByShow: viewers.per, checkMs: Number(process.hrtime.bigint()-started)/1e6 };
  res.status(body.ok ? 200 : 503).set('Cache-Control','no-store').json(body);
});
app.get('/api/admin/healthz', requireAdmin, async (_req,res) => {
  let database = 'ok'; try { await query('SELECT 1'); } catch(err) { database='error'; lastError={at:new Date().toISOString(),message:String(err.message).slice(0,300)}; }
  const m=process.memoryUsage(), v=totalViewers();
  res.status(database==='ok'?200:503).json({success:database==='ok',database,uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),memory:{rss:m.rss,heapUsed:m.heapUsed,heapTotal:m.heapTotal},viewers:v.total,viewersByShow:v.per,lastError});
});

/* =========================================================
   PUBLIC API
========================================================= */

// GET SHOWS
app.get('/api/shows', async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT
        id,
        show_date AS date,
        show_time AS time,
        name,
        poster,
        purchase_url AS "purchaseUrl",
        'YES' AS active,
        type
      FROM shows
      WHERE active = TRUE
      ORDER BY sort_order ASC, created_at ASC
    `);

    res.json(
      result.rows.map(r => ({
        ...r,
        type: String(r.type).toUpperCase()
      }))
    );
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   INTEGRATION (สำหรับเว็บกดบัตร GOPASS)
   ใช้ INTEGRATION_SECRET ร่วมกัน — ไม่ต้องล็อกอินแอดมิน
   - GET  /api/integration/shows  → รายการรอบ (ให้ GOPASS เลือกตอนสร้างงาน)
   - POST /api/integration/codes  → ออกโค้ดเข้าชมให้ผู้ซื้อ (1 โค้ดต่อ 1 บัตร)
   ========================================================= */
function integrationGuard(req, res) {
  const secret = String(process.env.INTEGRATION_SECRET || '');

  if (!secret) {
    res.status(503).json({
      success: false,
      message: 'เซิร์ฟเวอร์ LIVE ยังไม่ได้ตั้งค่า INTEGRATION_SECRET'
    });
    return false;
  }

  const given = String(req.get('x-integration-secret') || '');
  const a = Buffer.from(secret);
  const b = Buffer.from(given);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ success: false, message: 'integration secret ไม่ถูกต้อง' });
    return false;
  }

  return true;
}

app.get('/api/integration/shows', async (req, res, next) => {
  try {
    if (!integrationGuard(req, res)) return;

    const result = await query(`
      SELECT
        id,
        name,
        show_date AS date,
        show_time AS time,
        poster,
        active,
        type,
        purchase_url AS "purchaseUrl"
      FROM shows
      ORDER BY sort_order ASC, created_at ASC
    `);

    res.set('Cache-Control', 'no-store').json({
      success: true,
      shows: result.rows.map(r => ({ ...r, type: String(r.type).toUpperCase() }))
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/integration/codes', async (req, res, next) => {
  try {
    if (!integrationGuard(req, res)) return;

    const body = req.body || {};
    const showId = clean(body.showId, 100) || 'ALL';
    const count = Math.max(1, Math.min(100, Number.parseInt(body.count, 10) || 1));
    const expiresInDays = clampInt(body.expiresInDays, 1, 3650);
    const maxDevices = clampInt(body.maxDevices, 1, 1000);
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    // โค้ดที่ GOPASS ส่งมาเอง (ถ้ามี) จะถูกบันทึกตามนั้น ไม่งั้นสร้างใหม่
    const provided = Array.isArray(body.codes)
      ? body.codes.map(c => String(c).trim().toUpperCase()).filter(Boolean).slice(0, 100)
      : [];

    if (showId !== 'ALL') {
      const show = await query('SELECT id FROM shows WHERE id = $1', [showId]);

      if (!show.rowCount) {
        return res.status(400).json({ success: false, message: 'ไม่พบ SHOW_ID นี้' });
      }
    }

    const codes = [];

    if (provided.length) {
      const inserted = await query(
        `
          INSERT INTO access_codes (code, show_id, expires_at, max_devices)
          SELECT c, $2::text, $3::timestamptz, $4::integer
          FROM unnest($1::text[]) AS c
          ON CONFLICT (code) DO NOTHING
          RETURNING code
        `,
        [provided, showId, expiresAt, maxDevices]
      );

      inserted.rows.forEach(r => codes.push(r.code));
    } else {
      for (let attempt = 0; attempt < 8 && codes.length < count; attempt++) {
        const batch = new Set();

        while (batch.size < count - codes.length) {
          batch.add(makeCode());
        }

        const inserted = await query(
          `
            INSERT INTO access_codes (code, show_id, expires_at, max_devices)
            SELECT c, $2::text, $3::timestamptz, $4::integer
            FROM unnest($1::text[]) AS c
            ON CONFLICT (code) DO NOTHING
            RETURNING code
          `,
          [[...batch], showId, expiresAt, maxDevices]
        );

        inserted.rows.forEach(r => codes.push(r.code));
      }
    }

    res.json({ success: true, showId, codes });
  } catch (err) {
    next(err);
  }
});

// VERIFY ACCESS CODE
app.post('/api/verify-code', verifyLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};

    const showId = clean(body.showId, 100);
    const code = clean(body.code, 100).toUpperCase();
    const deviceId = clean(body.deviceId, 80);

    if (!showId || !code) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก Access Code'
      });
    }

    const result = await query(
      `
        SELECT
          c.id,
          c.status,
          c.expires_at,
          c.max_devices,
          s.youtube,
          s.type,
          s.active
        FROM access_codes c
        LEFT JOIN shows s ON s.id = $1
        WHERE c.code = $2
          AND (c.show_id = $1 OR c.show_id = 'ALL')
        LIMIT 1
      `,
      [showId, code]
    );

    if (!result.rowCount) {
      return res.status(403).json({
        success: false,
        message: 'Access Code ไม่ถูกต้อง หรือใช้กับรอบนี้ไม่ได้'
      });
    }

    const row = result.rows[0];

    if (row.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Access Code นี้ถูกระงับแล้ว'
      });
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(403).json({
        success: false,
        message: 'Access Code นี้หมดอายุแล้ว'
      });
    }

    if (!row.active) {
      return res.status(403).json({
        success: false,
        message: 'รอบการแสดงนี้ไม่ได้เปิดใช้งาน'
      });
    }

    if (row.max_devices) {
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          message: 'ไม่พบรหัสเครื่อง กรุณารีเฟรชหน้าเว็บแล้วลองใหม่'
        });
      }

      const allowed = await registerDevice(row.id, deviceId, row.max_devices);

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: `Access Code นี้ใช้ครบ ${row.max_devices} เครื่องแล้ว`
        });
      }
    } else if (deviceId) {
      // โค้ดไม่จำกัดเครื่อง: แค่บันทึกไว้ให้แอดมินดูจำนวนเครื่อง
      await query(
        `
          INSERT INTO code_devices (code_id, device_id)
          VALUES ($1, $2)
          ON CONFLICT (code_id, device_id)
          DO UPDATE SET last_seen = NOW()
        `,
        [row.id, deviceId]
      );
    }

    await query(
      'UPDATE access_codes SET last_used_at = NOW() WHERE id = $1',
      [row.id]
    );

    res.json({
      success: true,
      message: 'ยืนยันรหัสถูกต้อง',
      youtube: row.youtube || '',
      type: row.type
    });
  } catch (err) {
    next(err);
  }
});

// MAINTENANCE (สาธารณะ — หน้าเว็บเช็คก่อนแสดงผล)
app.get('/api/maintenance', async (req, res, next) => {
  try {
    const m = await getMaintenance();

    // แอดมินที่มี Preview cookie และ session ยังไม่หมดอายุ
    // ควรเห็นหน้าเว็บสำหรับทดสอบ แม้ Maintenance จะเปิดอยู่
    const cookieHeader = String(req.headers.cookie || '');
    const previewMatch = cookieHeader.match(/(?:^|;\s*)aol_mtn_preview=([a-f0-9]{64})(?:;|$)/);
    if (m.enabled && previewMatch) {
      const session = await query(
        `SELECT 1 FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [previewMatch[1]]
      );
      if (session.rowCount) {
        return res.json({ enabled: false, note: '', texts: {}, schedule: m.schedule || {}, preview: true });
      }
    }

    res.json({ enabled: m.enabled, note: m.enabled ? m.note : '', texts: m.enabled ? (m.texts || {}) : {}, schedule: m.schedule || {} });
  } catch (err) {
    next(err);
  }
});

// SECURITY SETTINGS (สาธารณะ — ใช้เฉพาะการแสดง Overlay ฝั่งหน้าเว็บ)
app.get('/api/security', async (_req, res, next) => {
  try {
    const v = await getSetting('security', {});
    res.set('Cache-Control', 'no-store');
    res.json({ enabled: !!v.enabled, updatedAt: v.updatedAt || null });
  } catch (err) { next(err); }
});

// ANNOUNCEMENT (สาธารณะ)
app.get('/api/announcement', async (req, res, next) => {
  try {
    const showId = clean(req.query.showId || '', 100);
    const globalRaw = await getSetting('announcement_global', null);
    const oldAnnouncement = globalRaw === null ? await getSetting('announcement', {}) : null;
    const legacy = globalRaw === null ? ((oldAnnouncement && (!oldAnnouncement.showId || oldAnnouncement.showId === 'ALL')) ? oldAnnouncement : {}) : globalRaw;
    const events = await getSetting('announcement_events', {});
    const normalize = (v, scope) => {
      const text = clean(v && v.text, 200);
      const link = /^https?:\/\//i.test(String(v && v.link || '')) ? clean(v.link, 500) : '';
      return { scope, enabled: !!(v && v.enabled && text), text, level: v && v.level === 'warn' ? 'warn' : 'info', link, linkText: clean(v && v.linkText, 40) };
    };
    const global = normalize(legacy, 'global');
    const event = showId ? normalize(events && events[showId], 'event') : normalize(null, 'event');
    res.json({ enabled: global.enabled || event.enabled, items: [global, event].filter(x => x.enabled), global, event });
  } catch (err) { next(err); }
});

// PRESENCE (ผู้ชมส่งสัญญาณทุก ~20 วินาที)
app.post('/api/presence', async (req, res, next) => {
  try {
    const body = req.body || {};
    const showId = clean(body.showId, 100);
    const sid = clean(body.sid, 80);

    if (!showId || !sid) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบ' });
    }

    const ids = await getActiveShowIds();

    if (!ids.has(showId)) {
      return res.json({ success: true, viewers: 0 });
    }

    let m = presence.get(showId);
    if (!m) { m = new Map(); presence.set(showId, m); }
    if (m.size < 50000 || m.has(sid)) m.set(sid, Date.now());

    res.json({ success: true, viewers: countViewers(showId) });
  } catch (err) {
    next(err);
  }
});

// GET CHAT
app.get('/api/chat/:showId', async (req, res, next) => {
  try {
    const showId = clean(req.params.showId, 100);

    const messages = await cached('chat:' + showId, 1500, async () => {
      const result = await query(
      `
        SELECT
          id,
          username AS "user",
          message AS text,
          TO_CHAR(
            created_at AT TIME ZONE 'Asia/Bangkok',
            'HH24:MI'
          ) AS time,
          pinned,
          CASE WHEN is_admin THEN 'admin' ELSE 'user' END AS role
        FROM chat_messages
        WHERE show_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [showId]
      );
      return result.rows.reverse();
    });

    const pinned =
      messages.find(m => m.pinned) || null;

    const settings = await getChatSettings();

    res.json({
      messages,
      pinned,
      settings: { slowModeSec: settings.slowModeSec },
      viewers: countViewers(showId)
    });
  } catch (err) {
    next(err);
  }
});

// SEND CHAT
app.post('/api/chat', chatLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};

    const showId = clean(body.showId, 100);
    const username =
      clean(body.user, 20) || 'Anonymous';
    const message = clean(body.text, 150);
    const sid = clean(body.sid, 80);

    if (!showId || !message) {
      return res.status(400).json({
        success: false,
        message: 'ข้อมูลไม่ครบ'
      });
    }

    const show = await query(
      'SELECT type, active FROM shows WHERE id = $1',
      [showId]
    );

    if (
      !show.rowCount ||
      !show.rows[0].active ||
      show.rows[0].type === 'R'
    ) {
      return res.status(403).json({
        success: false,
        message: 'รอบนี้ไม่เปิดรับแชต'
      });
    }

    const settings = await getChatSettings();

    const banned = await query(
      'SELECT 1 FROM chat_bans WHERE username_key = $1',
      [normName(username)]
    );

    if (banned.rowCount) {
      return res.status(403).json({
        success: false,
        message: 'คุณถูกระงับ'
      });
    }

    const lower = message.toLowerCase();

    if (settings.blockedWords.some(w => lower.includes(w.toLowerCase()))) {
      return res.status(400).json({
        success: false,
        message: 'มีข้อความไม่เหมาะสม'
      });
    }

    if (settings.slowModeSec > 0) {
      const key = `${sid || req.ip}|${showId}`;
      const last = lastPost.get(key) || 0;
      const wait = Math.ceil((last + settings.slowModeSec * 1000 - Date.now()) / 1000);

      if (wait > 0) {
        return res.status(429).json({
          success: false,
          message: `โปรดรออีกครั้ง ${wait} วิ`,
          retryAfter: wait
        });
      }

      lastPost.set(key, Date.now());
    }

    const id =
      `MSG_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    await query(
      `
        INSERT INTO chat_messages
          (id, show_id, username, message)
        VALUES
          ($1, $2, $3, $4)
      `,
      [
        id,
        showId,
        username,
        message
      ]
    );

    invalidateChat(showId);
    res.json({
      success: true,
      id
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   POLLS / FLOATING REACTIONS / REPORTS
========================================================= */
app.get('/api/polls/:showId', async (req,res,next)=>{ try { const showId=clean(req.params.showId,100); const r=await query(`SELECT p.id,p.question,p.options,p.active,COALESCE(v.counts,'[]'::jsonb) AS counts FROM polls p LEFT JOIN LATERAL (SELECT jsonb_agg(cnt ORDER BY idx) AS counts FROM (SELECT i AS idx,COUNT(pv.option_index)::int AS cnt FROM generate_series(0,jsonb_array_length(p.options)-1) i LEFT JOIN poll_votes pv ON pv.poll_id=p.id AND pv.option_index=i GROUP BY i) q) v ON TRUE WHERE p.show_id=$1 AND p.active=TRUE ORDER BY p.created_at DESC LIMIT 1`,[showId]); res.set('Cache-Control','no-store').json({success:true,poll:r.rows[0]||null}); } catch(err){next(err);} });
app.post('/api/polls/:id/vote', pollLimiter, async(req,res,next)=>{ try { const id=parseId(req.params.id), voter=clean(req.body?.voterKey,120), option=Number.parseInt(req.body?.optionIndex,10); if(!id||!voter||voter.length<8||!Number.isInteger(option)) return res.status(400).json({success:false,message:'ข้อมูลโหวตไม่ถูกต้อง'}); const p=await query('SELECT options,active FROM polls WHERE id=$1',[id]); if(!p.rowCount||!p.rows[0].active) return res.status(404).json({success:false,message:'โพลนี้ปิดแล้ว'}); const opts=p.rows[0].options; if(!Array.isArray(opts)||option<0||option>=opts.length)return res.status(400).json({success:false,message:'ตัวเลือกไม่ถูกต้อง'}); await query('INSERT INTO poll_votes(poll_id,voter_key,option_index) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,crypto.createHash('sha256').update(voter).digest('hex'),option]); const v=await query('SELECT option_index,COUNT(*)::int AS count FROM poll_votes WHERE poll_id=$1 GROUP BY option_index',[id]); res.json({success:true,counts:opts.map((_,i)=>Number(v.rows.find(x=>x.option_index===i)?.count||0))}); }catch(err){next(err);} });
app.get('/api/reactions/:showId', async(req,res,next)=>{try{const showId=clean(req.params.showId,100);const r=await query("SELECT reaction,COUNT(*)::int AS count FROM reactions WHERE show_id=$1 AND created_at>NOW()-INTERVAL '10 seconds' GROUP BY reaction",[showId]);res.set('Cache-Control','no-store').json({success:true,reactions:r.rows});}catch(err){next(err);}});
app.post('/api/reactions/:showId', chatLimiter, async(req,res,next)=>{try{const showId=clean(req.params.showId,100),reaction=clean(req.body?.reaction,8);if(!['❤️','😂','🔥','👏','😍','🎉'].includes(reaction))return res.status(400).json({success:false,message:'รีแอคชั่นไม่ถูกต้อง'});const active=await query('SELECT 1 FROM shows WHERE id=$1 AND active=TRUE',[showId]);if(!active.rowCount)return res.status(404).json({success:false,message:'ไม่พบรอบที่เปิดอยู่'});await query('INSERT INTO reactions(show_id,reaction) VALUES($1,$2)',[showId,reaction]);res.json({success:true});}catch(err){next(err);}});
app.get('/api/admin/reports', requireAdmin, async(_req,res,next)=>{try{const r=await query('SELECT id,show_id AS "showId",show_name AS "showName",ended_at AS "endedAt",viewers_peak AS "viewersPeak",viewers_average AS "viewersAverage",chat_count AS "chatCount",codes_used AS "codesUsed",poll_results AS "pollResults" FROM show_reports ORDER BY ended_at DESC LIMIT 200');res.json({success:true,reports:r.rows});}catch(err){next(err);}});
app.get('/api/admin/reports.csv', requireAdmin, async(_req,res,next)=>{try{const r=await query('SELECT show_id,show_name,ended_at,viewers_peak,viewers_average,chat_count,codes_used,poll_results FROM show_reports ORDER BY ended_at DESC');const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const lines=[['show_id','show_name','ended_at','viewers_peak','viewers_average','chat_count','codes_used','poll_results'].join(','),...r.rows.map(row=>[row.show_id,row.show_name,row.ended_at,row.viewers_peak,row.viewers_average,row.chat_count,row.codes_used,JSON.stringify(row.poll_results)].map(esc).join(','))];res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="areaone-live-reports.csv"');res.send('\uFEFF'+lines.join('\r\n'));}catch(err){next(err);}});
app.post('/api/admin/polls', requireAdmin, async(req,res,next)=>{try{const showId=clean(req.body?.showId,100),question=clean(req.body?.question,300),options=Array.isArray(req.body?.options)?req.body.options.map(x=>clean(x,100)).filter(Boolean).slice(0,8):[];if(!showId||!question||options.length<2)return res.status(400).json({success:false,message:'ต้องระบุรอบ คำถาม และตัวเลือกอย่างน้อย 2 ข้อ'});await query('UPDATE polls SET active=FALSE,closed_at=NOW() WHERE show_id=$1 AND active=TRUE',[showId]);const r=await query('INSERT INTO polls(show_id,question,options) VALUES($1,$2,$3::jsonb) RETURNING id',[showId,question,JSON.stringify(options)]);await audit(req,'poll.create',{showId,pollId:r.rows[0].id});res.json({success:true,id:r.rows[0].id});}catch(err){next(err);}});
app.post('/api/admin/polls/:id/close', requireAdmin, async(req,res,next)=>{try{const id=parseId(req.params.id);if(!id)return res.status(400).json({success:false});await query('UPDATE polls SET active=FALSE,closed_at=NOW() WHERE id=$1',[id]);await audit(req,'poll.close',{id});res.json({success:true});}catch(err){next(err);}});
app.post('/api/admin/shows/:id/end', requireAdmin, async(req,res,next)=>{try{const id=clean(req.params.id,100);await finishShow(id);await audit(req,'show.end',{id});res.json({success:true});}catch(err){next(err);}});

/* =========================================================
   ADMIN AUTH
========================================================= */

// ADMIN LOGIN
app.post('/api/admin/login', verifyLimiter, async (req, res, next) => {
  try {
    // ป้องกัน req.body เป็น undefined
    const body = req.body || {};

    const username = clean(body.username, 100);
    const password = String(body.password ?? '');

    // ตรวจข้อมูลก่อนเรียก login()
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก Username และ Password'
      });
    }

    const attemptKey = crypto.createHash('sha256').update(`${req.ip}|${username.toLowerCase()}`).digest('hex');
    const state = await query('SELECT failures, locked_until FROM admin_login_attempts WHERE attempt_key=$1', [attemptKey]);
    if (state.rowCount && state.rows[0].locked_until && new Date(state.rows[0].locked_until) > new Date()) {
      return res.status(429).json({ success:false, message:'ล็อกอินชั่วคราวเนื่องจากลองรหัสผิดหลายครั้ง กรุณารอสักครู่' });
    }
    const token = await login(username, password);
    if (!token) {
      await query(`INSERT INTO admin_login_attempts(attempt_key, failures, locked_until, updated_at) VALUES($1,1,NULL,NOW()) ON CONFLICT(attempt_key) DO UPDATE SET failures=CASE WHEN admin_login_attempts.locked_until IS NOT NULL AND admin_login_attempts.locked_until < NOW() THEN 1 ELSE admin_login_attempts.failures+1 END, locked_until=CASE WHEN (CASE WHEN admin_login_attempts.locked_until IS NOT NULL AND admin_login_attempts.locked_until < NOW() THEN 1 ELSE admin_login_attempts.failures+1 END) >= 5 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END, updated_at=NOW()`, [attemptKey]);
      const after = await query('SELECT failures, locked_until FROM admin_login_attempts WHERE attempt_key=$1', [attemptKey]);
      if (after.rowCount && after.rows[0].locked_until && new Date(after.rows[0].locked_until) > new Date()) return res.status(429).json({success:false,message:'ลองรหัสผิดครบกำหนด ล็อกอินถูกพัก 15 นาที'});
      return res.status(401).json({ success:false, message:'Username หรือ Password ไม่ถูกต้อง' });
    }
    await query('DELETE FROM admin_login_attempts WHERE attempt_key=$1', [attemptKey]);
    res.json({ success:true, token });
  } catch (err) {
    console.error('Admin login error:', err);
    next(err);
  }
});

// MAINTENANCE PREVIEW: เปิดสิทธิ์ทดสอบเว็บชั่วคราวให้แอดมินที่ล็อกอินแล้ว
app.post('/api/admin/maintenance-preview', requireAdmin, async (req, res, next) => {
  try {
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `aol_mtn_preview=${req.adminToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`);
    res.json({ success: true, expiresIn: 1800 });
  } catch (err) {
    next(err);
  }
});

// ปิดสิทธิ์ทดสอบและล้างคุกกี้ Preview
app.post('/api/admin/maintenance-preview/exit', (_req, res) => {
  const secure = _req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `aol_mtn_preview=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  res.json({ success: true });
});

// ADMIN LOGOUT
app.post('/api/admin/logout', requireAdmin, async (req, res, next) => {
  try {
    await logout(req.adminToken);

    res.json({
      success: true
    });
  } catch (err) {
    next(err);
  }
});

// ADMIN SESSION
app.get('/api/admin/session', requireAdmin, (_req, res) => {
  res.json({
    valid: true
  });
});

/* =========================================================
   ADMIN STATS
========================================================= */

app.get('/api/admin/stats', requireAdmin, async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM shows)::int AS "totalShows",
        (SELECT COUNT(*) FROM shows WHERE active = TRUE)::int AS "activeShows",
        (SELECT COUNT(*) FROM access_codes)::int AS "totalCodes",
        (SELECT COUNT(*)
          FROM access_codes
          WHERE status = 'ACTIVE'
        )::int AS "activeCodes",
        (SELECT COUNT(*) FROM chat_messages)::int AS "totalChatMessages"
    `);

    res.json({
      success: true,
      ...result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   ADMIN SHOWS
========================================================= */

// GET SHOWS
app.get('/api/admin/shows', requireAdmin, async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT
        id,
        show_date AS date,
        show_time AS time,
        name,
        poster,
        youtube, purchase_url AS "purchaseUrl", starts_at AS "startsAt", ends_at AS "endsAt", auto_rerun AS "autoRerun", sort_order AS "sortOrder",
        CASE
          WHEN active THEN 'YES'
          ELSE 'NO'
        END AS active,
        type
      FROM shows
      ORDER BY sort_order ASC, created_at ASC
    `);

    res.json({
      success: true,
      shows: result.rows
    });
  } catch (err) {
    next(err);
  }
});

// SAVE SHOW
app.post('/api/admin/shows', requireAdmin, async (req, res, next) => {
  try {
    const s = req.body || {};

    const id = clean(s.id, 100);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก SHOW_ID'
      });
    }

    const values = [
      id,
      clean(s.date, 100),
      clean(s.time, 50),
      clean(s.name, 300),
      clean(s.poster, 1000),
      normalizeYoutube(s.youtube),
      String(s.active).toUpperCase() === 'YES',
      String(s.type).toUpperCase() === 'R' ? 'R' : 'L',
      clean(s.purchaseUrl, 1000), s.startsAt ? new Date(s.startsAt) : null, s.endsAt ? new Date(s.endsAt) : null, !!s.autoRerun, Number.isFinite(Number(s.sortOrder)) ? Math.trunc(Number(s.sortOrder)) : 0
    ];

    await query(
      `
        INSERT INTO shows
          (
            id,
            show_date,
            show_time,
            name,
            poster,
            youtube,
            active,
            type, purchase_url, starts_at, ends_at, auto_rerun, sort_order
          )
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id)
        DO UPDATE SET
          show_date = EXCLUDED.show_date,
          show_time = EXCLUDED.show_time,
          name = EXCLUDED.name,
          poster = EXCLUDED.poster,
          youtube = EXCLUDED.youtube,
          active = EXCLUDED.active,
          type = EXCLUDED.type, purchase_url = EXCLUDED.purchase_url, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, auto_rerun = EXCLUDED.auto_rerun, sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
      `,
      values
    );

    invalidate('activeShows');
    await audit(req, 'show.save', { id, name: values[3] });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Clone show and reorder the homepage list.
app.post('/api/admin/shows/:id/clone', requireAdmin, async (req,res,next)=>{try{const source=await query('SELECT * FROM shows WHERE id=$1',[clean(req.params.id,100)]);if(!source.rowCount)return res.status(404).json({success:false,message:'ไม่พบรอบต้นฉบับ'});const s=source.rows[0],id=clean(req.body?.id,100);if(!id)return res.status(400).json({success:false,message:'กรุณาระบุ ID รอบใหม่'});await query(`INSERT INTO shows(id,show_date,show_time,name,poster,youtube,active,type,purchase_url,starts_at,ends_at,auto_rerun,sort_order) VALUES($1,$2,$3,$4,$5,$6,FALSE,$7,$8,NULL,NULL,$9,$10)`,[id,s.show_date,s.show_time,s.name,s.poster,s.youtube,s.type,s.purchase_url,s.auto_rerun,s.sort_order]);invalidate('activeShows');await audit(req,'show.clone',{sourceId:s.id,id});res.json({success:true,id});}catch(err){next(err);}});
app.put('/api/admin/shows/order', requireAdmin, async(req,res,next)=>{try{const ids=Array.isArray(req.body?.ids)?req.body.ids.slice(0,500).map(x=>clean(x,100)).filter(Boolean):[];const client=await pool.connect();try{await client.query('BEGIN');for(let i=0;i<ids.length;i++)await client.query('UPDATE shows SET sort_order=$1,updated_at=NOW() WHERE id=$2',[i,ids[i]]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}invalidate('activeShows');await audit(req,'show.reorder',{count:ids.length});res.json({success:true});}catch(err){next(err);}});

// DELETE SHOW
app.delete('/api/admin/shows/:id', requireAdmin, async (req, res, next) => {
  try {
    await query(
      'DELETE FROM shows WHERE id = $1',
      [clean(req.params.id, 100)]
    );

    invalidate('activeShows');
    await audit(req, 'show.delete', { id: clean(req.params.id, 100) });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   ADMIN ACCESS CODES
========================================================= */

// GET CODES
app.get('/api/admin/codes', requireAdmin, async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT
        c.id,
        c.code,
        c.show_id AS "showId",
        c.status,
        TO_CHAR(
          c.created_at AT TIME ZONE 'Asia/Bangkok',
          'DD/MM/YYYY HH24:MI'
        ) AS "createdAt",
        c.created_at AS "createdAtIso",
        c.expires_at AS "expiresAt",
        c.max_devices AS "maxDevices",
        c.last_used_at AS "lastUsedAt",
        (
          SELECT COUNT(*)::int
          FROM code_devices d
          WHERE d.code_id = c.id
        ) AS devices
      FROM access_codes c
      ORDER BY c.created_at DESC
    `);

    res.json({
      success: true,
      codes: result.rows
    });
  } catch (err) {
    next(err);
  }
});

// GENERATE CODES
app.post('/api/admin/codes/generate', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};

    const showId = clean(body.showId, 100);

    const count = Math.max(
      1,
      Math.min(
        500,
        Number.parseInt(body.count, 10) || 1
      )
    );

    const expiresInDays = clampInt(body.expiresInDays, 1, 3650);
    const maxDevices = clampInt(body.maxDevices, 1, 1000);
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    if (!showId) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอก SHOW_ID'
      });
    }

    if (showId !== 'ALL') {
      const show = await query(
        'SELECT id FROM shows WHERE id = $1',
        [showId]
      );

      if (!show.rowCount) {
        return res.status(400).json({
          success: false,
          message: 'ไม่พบ SHOW_ID นี้'
        });
      }
    }

    const codes = [];

    // สร้างเป็นชุด แล้ว insert ครั้งเดียว (ชนกับของเดิม = ข้าม แล้วสร้างเพิ่มจนครบ)
    for (let attempt = 0; attempt < 8 && codes.length < count; attempt++) {
      const batch = new Set();

      while (batch.size < count - codes.length) {
        batch.add(makeCode());
      }

      const inserted = await query(
        `
          INSERT INTO access_codes (code, show_id, expires_at, max_devices)
          SELECT c, $2::text, $3::timestamptz, $4::integer
          FROM unnest($1::text[]) AS c
          ON CONFLICT (code) DO NOTHING
          RETURNING code
        `,
        [[...batch], showId, expiresAt, maxDevices]
      );

      inserted.rows.forEach(r => codes.push(r.code));
    }

    res.json({
      success: true,
      codes
    });
  } catch (err) {
    next(err);
  }
});

// DELETE CODE
app.delete('/api/admin/codes/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบโค้ดนี้'
      });
    }

    const result = await query(
      'DELETE FROM access_codes WHERE id = $1',
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบโค้ดนี้'
      });
    }

    res.json({
      success: true
    });
  } catch (err) {
    next(err);
  }
});

// RESET DEVICES OF A CODE
app.post('/api/admin/codes/:id/reset-devices', requireAdmin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบโค้ดนี้'
      });
    }

    await query('DELETE FROM code_devices WHERE code_id = $1', [id]);

    res.json({
      success: true
    });
  } catch (err) {
    next(err);
  }
});

// CHANGE CODE STATUS
app.patch('/api/admin/codes/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const status =
      String(req.body?.status || '').toUpperCase();

    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'สถานะไม่ถูกต้อง'
      });
    }

    const id = parseId(req.params.id);

    if (!id) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบโค้ดนี้'
      });
    }

    await query(
      'UPDATE access_codes SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.json({
      success: true
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================
   ADMIN CHAT
========================================================= */

// GET CHAT
app.get('/api/admin/chat', requireAdmin, async (req, res, next) => {
  try {
    const showId = clean(req.query.showId, 100);

    const result = await query(
      `
        SELECT
          id,
          show_id AS "showId",
          username AS "user",
          message AS text,
          TO_CHAR(
            created_at AT TIME ZONE 'Asia/Bangkok',
            'HH24:MI'
          ) AS time,
          pinned,
          is_admin AS "isAdmin"
        FROM chat_messages
        ${showId ? 'WHERE show_id = $1' : ''}
        ORDER BY created_at DESC
        LIMIT 200
      `,
      showId ? [showId] : []
    );

    res.json({
      success: true,
      messages: result.rows
    });
  } catch (err) {
    next(err);
  }
});

// POST CHAT AS TEAM (ข้อความจากทีมงาน มีป้ายแอดมิน)
app.post('/api/admin/chat', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};

    const showId = clean(body.showId, 100);
    const message = clean(body.text, 300);
    const username = clean(body.user, 20) || 'ทีมงาน';

    if (!showId || !message) {
      return res.status(400).json({
        success: false,
        message: 'ข้อมูลไม่ครบ'
      });
    }

    const show = await query('SELECT id FROM shows WHERE id = $1', [showId]);

    if (!show.rowCount) {
      return res.status(400).json({
        success: false,
        message: 'ไม่พบรอบนี้'
      });
    }

    const id =
      `MSG_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    await query(
      `
        INSERT INTO chat_messages
          (id, show_id, username, message, is_admin)
        VALUES
          ($1, $2, $3, $4, TRUE)
      `,
      [id, showId, username, message]
    );
    invalidateChat(showId);
    await audit(req, 'chat.admin_send', { showId, id });

    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// CHAT SETTINGS
app.get('/api/admin/chat/settings', requireAdmin, async (_req, res, next) => {
  try {
    invalidate('chatSettings');

    const settings = await getChatSettings();
    const bans = await query(
      'SELECT username FROM chat_bans ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      slowModeSec: settings.slowModeSec,
      blockedWords: settings.blockedWords,
      banned: bans.rows.map(r => r.username)
    });
  } catch (err) {
    next(err);
  }
});

app.put('/api/admin/chat/settings', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};

    const slowModeSec = clampInt(body.slowModeSec, 0, 300) ?? 0;
    const blockedWords = Array.isArray(body.blockedWords)
      ? body.blockedWords.map(w => clean(w, 40)).filter(Boolean).slice(0, 200)
      : [];

    await setSetting('chat', { slowModeSec, blockedWords });
    invalidate('chatSettings');

    res.json({
      success: true
    });
  } catch (err) {
    next(err);
  }
});

// BAN / UNBAN (ตามชื่อผู้ใช้ ไม่สนตัวพิมพ์เล็กใหญ่ ใช้กับทุกรอบ)
app.post('/api/admin/chat/ban', requireAdmin, async (req, res, next) => {
  try {
    const user = clean(req.body?.user, 20);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'ไม่พบชื่อผู้ใช้'
      });
    }

    await query(
      `
        INSERT INTO chat_bans (username_key, username)
        VALUES ($1, $2)
        ON CONFLICT (username_key) DO NOTHING
      `,
      [normName(user), user]
    );

    res.json({
      success: true
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/chat/unban', requireAdmin, async (req, res, next) => {
  try {
    const user = clean(req.body?.user, 20);

    await query(
      'DELETE FROM chat_bans WHERE username_key = $1',
      [normName(user)]
    );

    res.json({
      success: true
    });
  } catch (err) {
    next(err);
  }
});

// LIVE STATS
app.get('/api/admin/live-stats', requireAdmin, async (_req, res, next) => {
  try {
    const { total, per } = totalViewers();

    const hours = await query(`
      SELECT TO_CHAR(h, 'HH24:MI') AS hour, n AS "count"
      FROM (
        SELECT
          DATE_TRUNC('hour', created_at AT TIME ZONE 'Asia/Bangkok') AS h,
          COUNT(*)::int AS n
        FROM chat_messages
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY 1
      ) t
      ORDER BY h ASC
    `);

    res.json({
      success: true,
      total,
      peak: peakViewers,
      viewers: per,
      chatPerHour: hours.rows
    });
  } catch (err) {
    next(err);
  }
});

// MAINTENANCE (แอดมิน)
app.get('/api/admin/maintenance', requireAdmin, async (_req, res, next) => {
  try {
    invalidate('maintenance');
    const m = await getMaintenance();

    res.json({
      success: true,
      enabled: m.enabled,
      note: m.note,
      texts: m.texts || {},
      schedule: m.schedule || {}
    });
  } catch (err) {
    next(err);
  }
});

app.put('/api/admin/maintenance', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};

    await setSetting('maintenance', {
      enabled: !!body.enabled,
      note: clean(body.note, 500),
      texts: {
        title: { th: clean(body.texts?.title?.th, 200), en: clean(body.texts?.title?.en, 200) },
        sub: { th: clean(body.texts?.sub?.th, 300), en: clean(body.texts?.sub?.en, 300) },
        note: { th: clean(body.texts?.note?.th, 500), en: clean(body.texts?.note?.en, 500) }
      },
      schedule: {
        enabled: !!body.schedule?.enabled,
        startsAt: clean(body.schedule?.startsAt, 40),
        reopensAt: clean(body.schedule?.reopensAt, 40),
        countdownEnabled: body.schedule?.countdownEnabled !== false,
        autoOpen: body.schedule?.autoOpen !== false,
        showDays: body.schedule?.showDays !== false,
        showSeconds: body.schedule?.showSeconds !== false,
        animation: ['flip','roll','fade','none'].includes(body.schedule?.animation) ? body.schedule.animation : 'flip'
      }
    });

    invalidate('maintenance'); await audit(req, 'maintenance.update', { enabled: !!body.enabled });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// SECURITY & PROTECTION (แอดมิน)
app.get('/api/admin/security', requireAdmin, async (_req, res, next) => {
  try { const v = await getSetting('security', {}); res.json({ success: true, enabled: !!v.enabled }); }
  catch (err) { next(err); }
});

app.put('/api/admin/security', requireAdmin, async (req, res, next) => {
  try {
    const enabled = !!(req.body && req.body.enabled);
    await setSetting('security', { enabled, updatedAt: new Date().toISOString() }); await audit(req, 'security.update', { enabled });
    res.json({ success: true, enabled });
  } catch (err) { next(err); }
});

// ANNOUNCEMENTS: แยกประกาศรวมกับประกาศเฉพาะอีเวนต์
app.get('/api/admin/announcements', requireAdmin, async (_req, res, next) => {
  try {
    const legacy = await getSetting('announcement_global', null);
    const oldAnnouncement = legacy === null ? await getSetting('announcement', {}) : null;
    const global = legacy === null ? ((oldAnnouncement && (!oldAnnouncement.showId || oldAnnouncement.showId === 'ALL')) ? oldAnnouncement : {}) : legacy;
    const events = await getSetting('announcement_events', {});
    res.json({ success: true, global: global || {}, events: events || {} });
  } catch (err) { next(err); }
});
app.put('/api/admin/announcements/global', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {}, text = clean(body.text, 200), link = clean(body.link, 500);
    if (link && !/^https?:\/\//i.test(link)) return res.status(400).json({ success:false, message:'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://' });
    const value = { text, link, linkText: clean(body.linkText, 40), level: body.level === 'warn' ? 'warn' : 'info', enabled: !!body.enabled && !!text };
    await setSetting('announcement_global', value);
    await setSetting('announcement', value); // compatibility with old clients
    for (const key of memCache.keys()) if (key.startsWith('announcement:')) memCache.delete(key);
    res.json({ success:true });
  } catch (err) { next(err); }
});
app.put('/api/admin/announcements/event', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {}, showId = clean(body.showId, 100), text = clean(body.text, 200), link = clean(body.link, 500);
    if (!showId || showId === 'ALL') return res.status(400).json({ success:false, message:'กรุณาเลือกอีเวนต์' });
    if (link && !/^https?:\/\//i.test(link)) return res.status(400).json({ success:false, message:'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://' });
    const events = await getSetting('announcement_events', {});
    events[showId] = { text, link, linkText: clean(body.linkText, 40), level: body.level === 'warn' ? 'warn' : 'info', enabled: !!body.enabled && !!text };
    await setSetting('announcement_events', events);
    for (const key of memCache.keys()) if (key.startsWith('announcement:')) memCache.delete(key);
    res.json({ success:true });
  } catch (err) { next(err); }
});

// ANNOUNCEMENT (แอดมิน)
app.get('/api/admin/announcement', requireAdmin, async (_req, res, next) => {
  try {
    const v = await getSetting('announcement', {});

    res.json({
      success: true,
      enabled: !!v.enabled && !!v.text,
      text: clean(v.text, 200),
      level: v.level === 'warn' ? 'warn' : 'info',
      link: clean(v.link, 500),
      linkText: clean(v.linkText, 40),
      showId: clean(v.showId || 'ALL', 100) || 'ALL'
    });
  } catch (err) {
    next(err);
  }
});

app.put('/api/admin/announcement', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};

    const text = clean(body.text, 200);
    const link = clean(body.link, 500);

    if (link && !/^https?:\/\//i.test(link)) {
      return res.status(400).json({
        success: false,
        message: 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'
      });
    }

    await setSetting('announcement', {
      text,
      level: body.level === 'warn' ? 'warn' : 'info',
      link,
      linkText: clean(body.linkText, 40),
      showId: clean(body.showId || 'ALL', 100) || 'ALL',
      enabled: !!body.enabled && !!text
    });

    for (const key of memCache.keys()) if (key.startsWith('announcement:')) memCache.delete(key);

    res.json({
      success: true
    });
  } catch (err) {
    next(err);
  }
});

// DELETE MULTIPLE CHAT MESSAGES
app.delete('/api/admin/chat/bulk', requireAdmin, async (req, res, next) => {
  try {
    const rawIds = req.body && req.body.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ success: false, message: 'กรุณาเลือกข้อความที่ต้องการลบ' });
    }
    if (rawIds.length > 200) {
      return res.status(400).json({ success: false, message: 'ลบได้สูงสุด 200 ข้อความต่อครั้ง' });
    }

    const ids = [...new Set(rawIds
      .filter(id => typeof id === 'string' || typeof id === 'number')
      .map(id => String(id).trim())
      .filter(id => id.length > 0 && id.length <= 200))];

    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'ไม่พบรหัสข้อความที่ถูกต้อง' });
    }

    const result = await query(
      'DELETE FROM chat_messages WHERE id = ANY($1::text[]) RETURNING id',
      [ids]
    );

    invalidateChat(); await audit(req, 'chat.bulk_delete', { count: result.rowCount });
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    next(err);
  }
});

// DELETE CHAT MESSAGE
app.delete('/api/admin/chat/:id', requireAdmin, async (req, res, next) => {
  try {
    await query(
      'DELETE FROM chat_messages WHERE id = $1',
      [req.params.id]
    );

    invalidateChat(); await audit(req, 'chat.delete', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PIN / UNPIN CHAT
app.patch('/api/admin/chat/:id/pin', requireAdmin, async (req, res, next) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const message = await client.query(
      `
        SELECT show_id, pinned
        FROM chat_messages
        WHERE id = $1
        FOR UPDATE
      `,
      [req.params.id]
    );

    if (!message.rowCount) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อความ'
      });
    }

    const {
      show_id: showId,
      pinned
    } = message.rows[0];

    if (pinned) {
      await client.query(
        `
          UPDATE chat_messages
          SET pinned = FALSE
          WHERE id = $1
        `,
        [req.params.id]
      );
    } else {
      await client.query(
        `
          UPDATE chat_messages
          SET pinned = FALSE
          WHERE show_id = $1
        `,
        [showId]
      );

      await client.query(
        `
          UPDATE chat_messages
          SET pinned = TRUE
          WHERE id = $1
        `,
        [req.params.id]
      );
    }

    await client.query('COMMIT');
    invalidateChat(showId); await audit(req, pinned ? 'chat.unpin' : 'chat.pin', { id: req.params.id, showId });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/* Event-specific share preview for Discord/LINE and other link unfurlers. */
app.get('/e/:id', async(req,res,next)=>{try{const r=await query('SELECT id,name,poster,show_date,show_time,purchase_url FROM shows WHERE id=$1',[clean(req.params.id,100)]);if(!r.rowCount)return res.status(404).send('Event not found');const e=r.rows[0],origin=`${req.protocol}://${req.get('host')}`,title=String(e.name||'AREA ONE LIVE').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),desc=String([e.show_date,e.show_time].filter(Boolean).join(' • ')||'Watch on AREA ONE LIVE').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),image=/^https:\/\//i.test(e.poster||'')?e.poster:'';res.set('Cache-Control','public, max-age=300').type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><meta property="og:type" content="website"><meta property="og:site_name" content="AREA ONE LIVE"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${origin}/e/${encodeURIComponent(e.id)}">${image?`<meta property="og:image" content="${image}">`:''}<meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0;url=/${encodeURIComponent(e.id)}"><link rel="canonical" href="${origin}/"></head><body><p>${title}</p><a href="/">Open AREA ONE LIVE</a>${e.purchase_url?`<a href="${e.purchase_url}">Buy tickets</a>`:''}</body></html>`);}catch(err){next(err);}});

/* =========================================================
   STATIC FRONTEND
========================================================= */

app.use(
  express.static(
    path.join(__dirname, '..', 'public'),
    {
      extensions: ['html'],
      setHeaders(res, filePath) {
        // service worker / manifest ต้องไม่ถูกแคชนาน ไม่งั้นอัปเดตเว็บแล้วผู้ชมยังเห็นของเก่า
        if (/[\\/](sw\.js|manifest\.webmanifest)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }
  )
);

app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  res.sendFile(
    path.join(
      __dirname,
      '..',
      'public',
      'index.html'
    )
  );
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, _next) => {
  console.error(err);
  lastError = { at: new Date().toISOString(), message: String(err.message || err).slice(0,300), path: String(req.originalUrl || '').slice(0,200) };
  if (Date.now() - alertLastSent > 60000) { alertLastSent = Date.now(); sendWebhook(process.env.DISCORD_ALERT_WEBHOOK, `AREA ONE LIVE server error\n${lastError.at}\n${lastError.path}\n${lastError.message}`); }

  res.status(500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์'
  });
});

// Sample viewer counts and finish scheduled shows; safe to skip automation when no explicit end time exists.
setInterval(async()=>{try{const now=new Date();for(const [id] of presence){const arr=viewerSamples.get(id)||[];arr.push(countViewers(id));if(arr.length>360)arr.shift();viewerSamples.set(id,arr);}const due=await query("SELECT id FROM shows WHERE active=TRUE AND ends_at IS NOT NULL AND ends_at<=NOW()");for(const row of due.rows){try{await finishShow(row.id);}catch(err){console.error('Auto-finish failed:',err.message);}}}catch(err){lastError={at:new Date().toISOString(),message:String(err.message).slice(0,300)};console.error('Lifecycle monitor failed:',err.message);}},30000).unref();

/* =========================================================
   START SERVER
========================================================= */

(async () => {
  try {
    await initDb();

    app.listen(
      PORT,
      '0.0.0.0',
      () => {
        console.log(
          `AREAONE-LIVE listening on :${PORT}`
        );
      }
    );
  } catch (err) {
    console.error(
      'Startup failed:',
      err
    );

    process.exit(1);
  }
})();