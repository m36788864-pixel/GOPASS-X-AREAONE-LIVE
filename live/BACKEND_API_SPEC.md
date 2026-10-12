# API reference (ใช้งานได้แล้วใน `server/index.js`)

endpoint `/api/admin/*` ต้องแนบ `Authorization: Bearer <token>` (ได้จาก `POST /api/admin/login`)
ข้อผิดพลาดตอบรูปแบบ `{ "success": false, "message": "..." }` — `message` จะแสดงให้ผู้ใช้เห็น

## โหมดปรับปรุงระบบ
เมื่อเปิด (`PUT /api/admin/maintenance` → `enabled: true`) API ฝั่งผู้ชมทั้งหมดจะตอบ `503`
`{ success:false, maintenance:true, message:"เรากำลังปรับปรุงเว็บไซต์ใหม่ โปรดมาอีกครั้งภายหลัง", note:"ข้อความที่แอดมินใส่" }`
ยกเว้น `/api/admin/*` และ `/api/maintenance` — หน้าเว็บผู้ชมจะแสดงหน้าปรับปรุงทับทั้งหน้า (รวมคนที่กำลังดูอยู่) และรีโหลดเองเมื่อปิดโหมดนี้

## ผู้ชม (สาธารณะ)

| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/api/shows` | รอบที่เปิดอยู่ |
| POST | `/api/verify-code` | body `{ showId, code, deviceId }` → `{ success, youtube, type }` ตรวจสถานะ / วันหมดอายุ / จำนวนเครื่อง |
| GET | `/api/chat/:showId` | `{ messages[{id,user,text,time,pinned,role}], pinned, settings{slowModeSec}, viewers }` |
| POST | `/api/chat` | body `{ showId, user, text, sid }` — ปฏิเสธเมื่อถูกแบน (403) / มีคำต้องห้าม (400) / ส่งถี่เกินโหมดจำกัด (429) |
| GET | `/api/announcement` | `{ enabled, text, level, link, linkText }` |
| GET | `/api/maintenance` | `{ enabled, note, texts, schedule }` — ไม่ถูกบล็อกตอนปรับปรุงระบบ |
| GET | `/api/security` | `{ enabled }` — ค่ากลางสำหรับ DevTools Security Overlay; ไม่ถูกบล็อกตอน Maintenance |
| POST | `/api/presence` | body `{ showId, sid }` ทุก ~20 วินาที → `{ viewers }` (นับ sid ที่ส่งมาภายใน 45 วินาที) |

## แอดมิน

| Method | Path | หมายเหตุ |
|---|---|---|
| POST | `/api/admin/login` · `/logout` · GET `/session` · GET `/stats` | |
| GET/POST/DELETE | `/api/admin/shows` (`DELETE /:id`) | |
| GET | `/api/admin/codes` | มี `createdAt` (ไทย), `createdAtIso`, `expiresAt`, `maxDevices`, `devices` (จำนวนเครื่อง), `lastUsedAt` |
| POST | `/api/admin/codes/generate` | body `{ showId, count, expiresInDays?, maxDevices? }` สูงสุด 500 โค้ด รูปแบบ `AOL-XXXX-XXXX-XXXX` |
| DELETE | `/api/admin/codes/:id` | ลบโค้ด (404 ถ้าไม่พบ) |
| PATCH | `/api/admin/codes/:id/status` | `{ status: "ACTIVE" \| "SUSPENDED" }` |
| POST | `/api/admin/codes/:id/reset-devices` | ล้างรายการเครื่องที่ลงทะเบียนของโค้ดนั้น |
| GET/PUT | `/api/admin/maintenance` | `{ enabled, note, texts, schedule }` ตั้งค่า Maintenance และ Countdown |
| GET/PUT | `/api/admin/security` | `{ enabled }` เปิด/ปิด DevTools Security Overlay; การตรวจจับทำงานฝั่งเบราว์เซอร์และไม่ใช่การป้องกันข้อมูลแบบสมบูรณ์ |
| GET/PUT | `/api/admin/announcement` | `{ text, level: "info"\|"warn", link, enabled }` |
| GET | `/api/admin/chat?showId=` | ข้อความแชต (มี `isAdmin`) |
| POST | `/api/admin/chat` | ส่งข้อความในฐานะทีมงาน `{ showId, text }` (มีป้ายแอดมิน ไม่ติดโหมดจำกัด/แบน) |
| DELETE | `/api/admin/chat/:id` · PATCH `/api/admin/chat/:id/pin` | |
| GET/PUT | `/api/admin/chat/settings` | `{ slowModeSec (0-300), blockedWords[], banned[] }` |
| POST | `/api/admin/chat/ban` · `/api/admin/chat/unban` | body `{ user }` |
| GET | `/api/admin/live-stats` | `{ total, peak, viewers{showId:n}, chatPerHour[{hour,count}] }` |

## ไม่ได้ทำ: แจ้งเตือนก่อนเริ่มรอบตอนปิดแอป
ต้องใช้ Web Push (VAPID key + ให้ผู้ชมกดยอมรับ + ส่งแจ้งเตือนจากเซิร์ฟเวอร์) — ตอนนี้ไฟล์ปฏิทิน (.ics) ตั้งเตือนล่วงหน้า 30 นาทีให้แล้ว
