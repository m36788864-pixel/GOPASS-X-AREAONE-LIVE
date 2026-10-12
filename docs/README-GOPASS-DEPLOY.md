# GOPASS deployment quick guide

## GitHub → Render
1. Push the contents of this folder to a GitHub repository.
2. On Render, create **New + → Web Service** and connect the repository.
3. Build Command: `npm ci`
4. Start Command: `npm start`
5. Set the environment variables in Render.
6. Deploy and open `/`.
7. Admin is at `/admin/login.html`.
8. Sales summary is at `/admin/sales.html`.

## Environment variables
Use `.env.example` as the reference. Do not upload a real `.env` to GitHub.


## Sales Summary
หน้า "สรุปยอดขายบัตรของงาน" ถูกย้ายออกจากหน้าเว็บไซต์สาธารณะแล้ว และให้ดูได้เฉพาะในแผงแอดมินที่ `/admin/sales.html` เท่านั้น
