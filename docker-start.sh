#!/bin/bash
set -e

# ---- เริ่มเว็บไลฟ์ (Node) เป็น background พร้อม auto-restart ----
# บังคับ PORT=3000 เสมอ เพราะ Apache proxy ไปที่ 127.0.0.1:3000
# (Render อาจ inject PORT ค่าอื่นมา)
(
  while true; do
    cd /var/www/html/live
    PORT=3000 node server/index.js || true
    echo "[gopass-start] live server หยุดทำงาน -> restart ใน 3 วินาที"
    sleep 3
  done
) &

# ---- รัน Apache (PHP เว็บกดบัตร) เป็น process หลัก ----
exec apache2-foreground