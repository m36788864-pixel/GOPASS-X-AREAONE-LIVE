# AREAONE-LIVE

ระบบถ่ายทอดสด/จำหน่ายสิทธิ์เข้าชมด้วย Access Code — Node.js + Express + PostgreSQL (ไม่ใช้ Google Apps Script)

- Frontend: `public/` (`index.html` หน้าผู้ชม, `admin.html` หน้าผู้ดูแล)
- Backend/API: `server/` (Express)
- Database: PostgreSQL (สร้าง/อัปเดตตารางอัตโนมัติจาก `db/schema.sql` ทุกครั้งที่เริ่มเซิร์ฟเวอร์)
- Admin auth: DB session token + bcrypt
- Chat: REST polling
- YouTube: เก็บ YouTube video ID
- Deploy: Node host หรือ Docker

## ฟีเจอร์

**ผู้ชม** — ธีมมืด/สว่าง/ตามระบบ, ไทย/English, ตารางรอบแบบปฏิทิน, นับถอยหลัง + ป้าย LIVE NOW, ห้องรอก่อนเริ่ม,
เพิ่มลงปฏิทิน (.ics), แชร์, ลิงก์/QR กรอกโค้ดอัตโนมัติ (`/?code=AOL-XXXX-XXXX-XXXX&show=รหัสรอบ`), RERUN เล่นต่อจากเดิม + เปลี่ยนความเร็ว,
แชตพร้อมอีโมจิ / ป้ายแอดมิน / โหมดจำกัดความถี่, ประกาศจากแอดมิน, จำนวนผู้ชมสด, ติดตั้งเป็นแอป (PWA), FAQ,
หน้า "กำลังปรับปรุงเว็บไซต์" (เมื่อแอดมินเปิดโหมดปรับปรุงระบบ)

**แอดมิน** — จัดการรอบ, สร้างโค้ด (ตั้งวันหมดอายุ / จำกัดจำนวนเครื่องได้), ลบโค้ด (ทีละรายการ/เลือกหลายรายการ/ล้างโค้ดเก่า),
QR + ลิงก์ของโค้ด, ส่งออก CSV, รีเซ็ตเครื่องของโค้ด, ประกาศถึงผู้ชม, ตั้งค่าแชต (จำกัดความถี่ / คำต้องห้าม / แบน),
ส่งข้อความในฐานะทีมงาน, สถิติผู้ชมสดและข้อความต่อชั่วโมง,
**โหมดปรับปรุงระบบ** (ปิดเว็บชั่วคราว พร้อมข้อความเพิ่มเติม เช่น เวลาที่จะกลับมาเปิด — Admin → ภาพรวม)

## 1. Local

```bash
npm install
```

สร้าง `.env` จาก `.env.example` แล้วตั้งค่า (อย่างน้อย `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`):

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://tdl:password@localhost:5432/tdl_live
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ตั้งรหัสใหม่ตรงนี้
```

จากนั้น `npm start` แล้วเปิด `http://localhost:3000` (หน้า admin: `/admin.html`)

## 2. Docker

สร้าง `.env` ที่ root:

```env
POSTGRES_PASSWORD=ตั้งรหัส DB ใหม่
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ตั้งรหัส Admin ใหม่
```

แล้ว `docker compose up -d --build`

> `docker-compose.yml` ตั้ง `DB_SSL=false` ให้แล้ว เพราะ Postgres ใน container ไม่รองรับ SSL
> (ถ้าใช้ฐานข้อมูลบน cloud ที่บังคับ SSL ให้ลบ `DB_SSL` ออก หรือไม่ตั้งค่านี้)

## 3. Deploy host

ถ้า host รองรับ Node.js:

- Build: `npm ci --omit=dev` (หรือ `npm install --omit=dev`)
- Start: `npm start`
- Port: ใช้ค่า `PORT` ของ host
- Environment variables: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (และ `DB_SSL=false` ถ้าฐานข้อมูลไม่มี SSL)

ถ้า host รองรับ Docker ใช้ `Dockerfile` ได้ทันที — ต้องเปิดผ่าน **HTTPS** ถึงจะติดตั้งเป็นแอป (PWA) ได้

## 4. ตั้งค่าหน้าเว็บ (โลโก้ / footer / FAQ)

เปิด `public/index.html` แล้วแก้บล็อก `<script id="tdl-config">` ที่หัวไฟล์: `TDL_IMAGES` (โลโก้/ไอคอน), `TDL_FX` (เขตเวลา, ความยาวรอบสำหรับป้าย LIVE NOW),
`TDL_FAQ` (คำถามที่พบบ่อย), `TDL_FOOTER` (ข้อมูลติดต่อ/โซเชียล)
ส่วน `public/admin.html` แก้บล็อก `<script id="tdl-admin-config">` (โลโก้, `siteUrl` สำหรับลิงก์/QR)

## 5. อัปเกรดจากเวอร์ชันก่อนหน้า

1. อัปเดตไฟล์แล้วรีสตาร์ตเซิร์ฟเวอร์ — ตารางใหม่/คอลัมน์ใหม่ถูกเพิ่มเองอัตโนมัติ ข้อมูลเดิมไม่หาย
2. โค้ดใหม่ขึ้นต้น `AOL-` ส่วนโค้ดเก่า `TDLLIVE-` ยังใช้ได้จนกว่าจะลบ (ลบได้ที่ Admin → Access Codes → ล้างโค้ดเก่า)
3. `sw.js`, `manifest.webmanifest` และ `icons/` อยู่ใน `public/` แล้ว (ต้องอยู่ที่นี่เซิร์ฟเวอร์ถึงจะเสิร์ฟให้ถูกต้อง)

## 6. ข้อควรรู้

- จำนวนผู้ชมสด (presence), โหมดจำกัดความถี่แชต และแคชการตั้งค่า เก็บในหน่วยความจำของ process
  → ใช้ได้ดีกับเซิร์ฟเวอร์ตัวเดียว ถ้ารันหลายตัวพร้อมกัน ตัวเลขจะแยกตามแต่ละตัว และสถิติ "สูงสุด" จะรีเซ็ตเมื่อรีสตาร์ต
- endpoint ที่ผู้ชมเรียกบ่อย (`GET /api/chat/:showId`, `GET /api/announcement`, `POST /api/presence`) ใช้โควต้า 1,500 ครั้ง/5 นาที/IP
  ส่วน endpoint อื่นใช้ 300 ครั้ง/5 นาที/IP เพื่อไม่ให้ผู้ชมหลายคนบน Wi-Fi เดียวกันชนลิมิตกัน
- การแบนแชตทำตามชื่อผู้ใช้ (ไม่สนตัวพิมพ์เล็กใหญ่) ใช้กับทุกรอบ — ผู้ใช้เปลี่ยนชื่อเล่นเพื่อเลี่ยงได้ จึงเหมาะกับการจัดการเบื้องต้น
- รายละเอียด API ดู `BACKEND_API_SPEC.md`

## 7. แก้ปัญหา: ตัวเล่น YouTube ขึ้น "Error 153"

สาเหตุคือ YouTube ต้องเห็น Referer ของเว็บที่ฝังตัวเล่น แต่เว็บส่ง `Referrer-Policy: no-referrer` (ค่าเริ่มต้นของ helmet)
แก้แล้วใน `server/index.js` (ตั้งเป็น `strict-origin-when-cross-origin`) และใน `public/index.html` (meta + `referrerpolicy` ที่ iframe)
ถ้ายังเจออยู่ ให้ตรวจว่า host/proxy (เช่น Cloudflare, Nginx) ไม่ได้เติม `Referrer-Policy: no-referrer` หรือ `same-origin` ทับ —
เปิดหน้าเว็บ → DevTools → Network → คลิกหน้าเว็บ → ดู Response Headers
และถ้าผู้ชมเปิดจากแอป (Instagram/Discord/LINE) แล้วยังมีปัญหา ให้แนะนำเปิดใน Safari/Chrome

## 8. Migration จาก Google Sheets

โครงสร้างเดิมถูกแมปไว้ดังนี้:

- shows: `id, date, time, name, poster, youtube, active, type`
- codes: `code, showId, status, createdAt`
- chat: `showId, user, text, time, id, pinned`

export Google Sheets เป็น CSV แล้วนำเข้า PostgreSQL ภายหลังได้ โดยไม่ต้องใช้ Apps Script

## Scheduled Maintenance & Countdown

The Admin overview includes scheduled maintenance controls. Configure a start time and reopening time in Thailand time (UTC+7), enable the schedule, and choose whether to show the countdown, display days/seconds, and automatically reopen the site. Countdown animation options are Flip Clock, Number Roll, Smooth Fade, or none. Settings are stored in the existing `site_settings` JSONB row under `maintenance`; no schema migration is required. The backend evaluates the schedule when maintenance state is requested, so automatic start/reopen does not depend on a browser timer.

## v3 additions (2026-10)

- `GET /healthz`: database check, uptime, memory and current viewer counts. Keep this endpoint behind platform-level access controls if operational details should not be public.
- Admin health: `GET /api/admin/healthz` (requires Bearer session).
- Show scheduling: optional `startsAt`, `endsAt`, `purchaseUrl`, `autoRerun`, `sortOrder` fields in `POST /api/admin/shows`. An explicit `endsAt` is required for automatic completion; otherwise use `POST /api/admin/shows/:id/end`.
- Event sharing metadata: `/e/:id` returns Open Graph metadata for crawlers.
- Reports: `GET /api/admin/reports` and `GET /api/admin/reports.csv`.
- Polls: `POST /api/admin/polls`, `POST /api/admin/polls/:id/close`, `GET /api/polls/:showId`, and `POST /api/polls/:id/vote`. Voting identity is client-supplied, so this is one vote per voter key, not strong identity verification.
- Reactions: `POST /api/reactions/:showId` and `GET /api/reactions/:showId`.
- Audit: actions are stored in `admin_audit_log` and optionally posted to Discord.
- Login throttling: five failures for the same IP + username causes a 15-minute lock.
- CSP: `CSP_MODE=report` (default) or `CSP_MODE=enforce`. Inline scripts/styles remain allowed for compatibility with the existing frontend, so this is not a complete XSS defense.
- Chat cache: 1.5 seconds, invalidated after chat writes/deletes/pin changes.

### Environment variables

Set `DISCORD_ALERT_WEBHOOK` and `DISCORD_AUDIT_WEBHOOK` in the deployment environment. They can use the same webhook, but separate channels are recommended. Never commit real webhook URLs or production credentials. `CHAT_CLEANUP_DELAY_MINUTES` defaults to 30.

### Important validation notes

Run the schema migration against a backup/staging PostgreSQL database first. This archive was syntax-checked locally, but production PostgreSQL, Discord delivery, YouTube embeds, scheduled execution on a sleeping host, and end-to-end browser behavior still require deployment-side testing. Scheduled cleanup uses an in-process timer; for hosts that sleep/restart, move delayed cleanup to a persistent database job/worker before relying on it for strict retention guarantees.
