# GOPASS V9 — Thai / English

เพิ่มระบบเปลี่ยนภาษาไทย/อังกฤษทั้งเว็บไซต์

## วิธีใช้
- ปุ่ม `EN` / `ไทย` จะปรากฏบน Header
- เลือกภาษาแล้วระบบจำค่าไว้ใน browser ด้วย localStorage
- การ์ดและข้อมูลที่สร้างแบบไดนามิกจะถูกตรวจจับและแปลด้วย MutationObserver
- Admin pages ก็มีตัวเปลี่ยนภาษาเช่นกัน

## Deploy Render
โปรเจกต์ยังมี Dockerfile ที่ root และสามารถ Deploy แบบ Docker ได้เหมือน V8
