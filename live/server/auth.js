const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('./db');

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function ensureAdmin() {
  const username = String(process.env.ADMIN_USERNAME || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!username || !password) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required');

  const existing = await query('SELECT id FROM admins WHERE username = $1', [username]);
  const hash = await bcrypt.hash(password, 12);

  if (existing.rowCount) {
    await query('UPDATE admins SET password_hash = $1 WHERE username = $2', [hash, username]);
  } else {
    await query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [username, hash]);
  }
}

async function login(username, password) {
  const result = await query('SELECT id, username, password_hash FROM admins WHERE username = $1', [String(username || '').trim()]);
  if (!result.rowCount) return null;

  const admin = result.rows[0];
  const ok = await bcrypt.compare(String(password || ''), admin.password_hash);
  if (!ok) return null;

  const token = makeToken();
  await query(
    `INSERT INTO admin_sessions (token, admin_id, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 hour'))`,
    [token, admin.id, SESSION_TTL_HOURS]
  );
  return token;
}

async function requireAdmin(req, res, next) {
  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบใหม่' });

    const result = await query(
      `SELECT s.token, a.id, a.username
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    if (!result.rowCount) return res.status(401).json({ success: false, message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });

    req.admin = result.rows[0];
    req.adminToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

async function logout(token) {
  if (token) await query('DELETE FROM admin_sessions WHERE token = $1', [token]);
}

async function cleanupSessions() {
  await query('DELETE FROM admin_sessions WHERE expires_at <= NOW()');
}

module.exports = { ensureAdmin, login, requireAdmin, logout, cleanupSessions };
