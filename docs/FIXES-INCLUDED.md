# GOPASS B-FIXED

ชุดนี้จัดเป็น **Node.js Backend + Frontend ในโปรเจกต์เดียว** สำหรับนำไป Deploy ใหม่

สิ่งที่ปรับหลัก ๆ:

- บังคับ Node.js 20+ ผ่าน `.nvmrc` และ `package.json` engines
- รองรับ `HOST=0.0.0.0` สำหรับ Hosting/Container
- เพิ่ม `/api` สำหรับตรวจว่า API ตอบอยู่
- ปรับ `/api/health` ให้แสดง Node version, environment และ timestamp
- เพิ่ม graceful shutdown สำหรับ Deploy/Restart
- เพิ่ม `railway.json` สำหรับ Railway
- ปรับ `render.yaml` และ Dockerfile สำหรับ Render/Container
- เพิ่ม `Procfile` และ `ecosystem.config.js` สำหรับระบบที่ใช้ PM2/Procfile
- เพิ่มคู่มือ `DEPLOY-B-NOW-TH.md`

## สำคัญ

ชุดนี้แก้ตัวโปรเจกต์ให้พร้อม Deploy แต่ **ยังต้อง Deploy เป็น Node.js service** ไม่ใช่ Static Hosting

หลัง Deploy ให้ทดสอบ 3 URL:

```text
/api/health
/api/events
/admin/login.html
```

ถ้า `/api/health` และ `/api/events` ใช้งานได้ หน้าเว็บจะหยุดอาการ 404 ที่เห็นก่อนหน้านี้ในส่วน Event API
