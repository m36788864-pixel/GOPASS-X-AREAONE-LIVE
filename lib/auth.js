const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const ADMIN_FILE = path.join(__dirname, "..", "data", "admin.json");

// ตั้งรหัสผ่านเริ่มต้นได้ผ่าน ENV ตอนรันเซิร์ฟเวอร์ครั้งแรก เช่น
//   ADMIN_USER=myuser ADMIN_PASS=mypass node server.js
const DEFAULT_USERNAME = process.env.ADMIN_USER || "admin";
const DEFAULT_PASSWORD = process.env.ADMIN_PASS || "DELEF#GOPASS2026!";

// ตั้ง ADMIN_RESET=true เมื่อต้องการสร้างบัญชีแอดมินใหม่จาก ENV
// หลังรีเซ็ตให้เอา ADMIN_RESET ออกทันที เพื่อไม่ให้เขียนทับบัญชีทุกครั้งที่เปิดเซิร์ฟเวอร์
const RESET_ADMIN = String(process.env.ADMIN_RESET || "").toLowerCase() === "true";

function ensureAdminFile() {
  if (RESET_ADMIN && fs.existsSync(ADMIN_FILE)) {
    fs.unlinkSync(ADMIN_FILE);
    console.log("[auth] ADMIN_RESET=true -> รีเซ็ตบัญชีแอดมิน");
  }

  if (!fs.existsSync(ADMIN_FILE)) {
    const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    fs.writeFileSync(
      ADMIN_FILE,
      JSON.stringify({ username: DEFAULT_USERNAME, passwordHash }, null, 2)
    );
    console.log(
      `[auth] สร้างบัญชีแอดมินเริ่มต้น -> username: "${DEFAULT_USERNAME}" password: "${DEFAULT_PASSWORD}" (แก้ไขได้ที่ data/admin.json หรือรีเซ็ตด้วย ENV ADMIN_USER/ADMIN_PASS แล้วลบไฟล์นี้ทิ้งก่อนรันใหม่)`
    );
  }
}

ensureAdminFile();

function readAdmin() {
  try {
    const admin = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
    if (admin && admin.username && admin.passwordHash) return admin;
  } catch {}

  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
  const admin = { username: DEFAULT_USERNAME, passwordHash };
  fs.mkdirSync(path.dirname(ADMIN_FILE), { recursive: true });
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2));
  return admin;
}

function verifyLogin(username, password) {
  const admin = readAdmin();
  if (!username || !password) return false;
  if (username !== admin.username) return false;
  return bcrypt.compareSync(password, admin.passwordHash);
}

// เก็บ session token ไว้ในหน่วยความจำ (รีสตาร์ตเซิร์ฟเวอร์แล้วต้อง login ใหม่ - พอสำหรับเดโม/โปรเจกต์เดี่ยว)
const sessions = new Map(); // token -> { username, expiresAt }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 ชั่วโมง

function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function verifySession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function destroySession(token) {
  sessions.delete(token);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const session = verifySession(token);
  if (!session) {
    return res.status(401).json({ error: "unauthorized", message: "กรุณาเข้าสู่ระบบแอดมินก่อน" });
  }
  req.admin = session;
  next();
}

module.exports = { verifyLogin, createSession, verifySession, destroySession, requireAuth };
