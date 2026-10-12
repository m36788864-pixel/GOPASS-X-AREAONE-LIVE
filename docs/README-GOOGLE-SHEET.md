# Google Sheets Integration — GOPASS

ระบบนี้ส่งข้อมูลผู้ซื้อจาก `PUT /api/orders/:id` ไป Google Apps Script แล้วบันทึกลง Google Sheets

## ค่าที่ใช้ตอนนี้

- Google Apps Script Web App: `https://script.google.com/macros/s/AKfycbzuDmAAYtU8UMo4YnbT0J5L7nwFJRooaJG-SRIzygle9IR5S4e7T6ybWL9P3-wOJJu5/exec`
- Spreadsheet ID: `1Ypo-2ithFjMr8QylqQBJfqYbHNVM1sIzf3NCE0VWjaM`
- Secret: `CHANGE_ME_TO_A_LONG_RANDOM_SECRET`

> ในโค้ด `server.js` มี fallback ของค่าข้างบนเพื่อให้ Render ทำงานได้ แม้ยังไม่ได้ตั้ง Environment Variables แต่แนะนำให้ตั้งค่าใน Render แล้วค่อยลบ fallback ภายหลังเพื่อความปลอดภัย

## 1) อัปเดต Google Apps Script

เปิด Apps Script ของ Google Sheet แล้วใช้ไฟล์ `google-apps-script.gs` เวอร์ชันล่าสุดในโปรเจกต์นี้

สำคัญ: หลังแก้โค้ดต้องกด **Deploy > Manage deployments > Edit > New version > Deploy** ให้ Web App ใช้เวอร์ชันใหม่

ตั้งค่า:
- Execute as: Me
- Who has access: Anyone

จากนั้นเปิด `/exec` ต้องได้ JSON ประมาณนี้:

`{"ok":true,"status":"running","service":"GOPASS"}`

## 2) Render

ถ้าใช้ Render ให้ตั้ง Environment Variables:
- `GOOGLE_SHEET_WEBHOOK_URL` = URL `/exec`
- `GOOGLE_SHEET_SECRET` = `CHANGE_ME_TO_A_LONG_RANDOM_SECRET`

แล้วกด Manual Deploy / Deploy latest commit

## 3) ตรวจสอบจากเว็บ

หลัง Deploy เปิด:

`https://โดเมนของคุณ/api/google-sheet/health`

ถ้าปกติจะได้ `ok: true` และ Google Apps Script จะตอบ `status: running`

## 4) การบันทึกข้อมูล

เมื่อผู้ซื้อกรอก:
- Email
- Discord
- Roblox

แล้วกดส่งข้อมูล ระบบจะส่งไป Google Apps Script และสร้าง/ใช้ชีต:
- `Members`
- `Orders`
- `Receipts`
- `Realtime`

ข้อมูลจะถูกเพิ่มใน `Members`, `Orders`, `Receipts` ส่วน `Realtime` จะแสดงรายการล่าสุดเพียงรายการเดียว


## IMPORTANT: current order not appearing in Sheets

This version adds a retry endpoint:
`POST /api/orders/:id/sync-sheet`

The receipt page automatically calls it after loading an order with buyer information. This repairs a missed Google Sheets webhook without requiring the buyer to submit the form again.

The Google Apps Script now uses OrderID upsert for Orders and Receipts, so repeated sync attempts update the existing row instead of creating duplicate order/receipt rows.

After uploading this version to Render, you must also paste the updated `google-apps-script.gs` into Apps Script and deploy a **new version** of the Web App. Keep:
- Execute as: Me
- Who has access: Anyone
