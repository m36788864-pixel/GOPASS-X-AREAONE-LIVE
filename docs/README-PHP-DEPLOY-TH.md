# GOPASS — PHP Edition

ชุดนี้เปลี่ยน Backend จาก Node/Express เป็น PHP เพื่อให้ลงบน Shared Hosting / cPanel ที่รองรับ PHP ได้ โดย Frontend ยังคงเรียก `/api/...` เหมือนเดิม จึงไม่ต้องแก้ HTML/JS ทั้งระบบ

## Requirement
- PHP 8.1+ แนะนำ 8.2/8.3/8.4
- Apache + mod_rewrite (.htaccess)
- PHP cURL สำหรับ Google Sheet / Discord webhook
- เขียนไฟล์ได้ใน `data/` และ `uploads/`

## Deploy cPanel
อัปโหลดไฟล์ทั้งหมดไป `public_html/` ของโดเมน `gopass.griffinsite.xyz` โดยให้ `.htaccess` อยู่ที่ root เดียวกับ `index.html`

ตรวจว่าเปิด:
- `https://gopass.griffinsite.xyz/api/health`
- `https://gopass.griffinsite.xyz/api/events`

ถ้า `/api/health` ได้ JSON และ `/api/events` ได้รายการงาน แปลว่า PHP API เชื่อมแล้ว

## Admin
- URL: `/admin/login.html`
- Username: `admin`
- Password เริ่มต้น: `DELEF#GOPASS2026!`

เปลี่ยนรหัสได้โดยตั้ง `ADMIN_USER` / `ADMIN_PASS` ใน environment ของ hosting หาก hosting รองรับ หรือแก้ `data/admin.json` หลังระบบสร้างไฟล์ครั้งแรก

## Google Sheet / Discord
ตั้ง Environment Variables:
- `GOOGLE_SHEET_WEBHOOK_URL`
- `GOOGLE_SHEET_SECRET`
- `DISCORD_WEBHOOK_URL`

ถ้า hosting ไม่มี Environment Variables ให้ถามผู้ดูแลโฮสต์ก่อนใส่ค่าเหล่านี้ในไฟล์ที่อยู่เหนือ public_html

## Permissions
ถ้าบันทึกงาน/คำสั่งซื้อไม่ได้ ให้สิทธิ์เขียนกับ:
- `data/`
- `uploads/`

## Local test on Windows
ติดตั้ง PHP แล้วดับเบิลคลิก `START-GOPASS-PHP.bat` จากนั้นเปิด `http://127.0.0.1:8080/`

## Important
อย่าให้คนภายนอกเปิดดู `data/*.json` ตรง ๆ ชุดนี้มี `.htaccess` บล็อกไว้เมื่อใช้ Apache
