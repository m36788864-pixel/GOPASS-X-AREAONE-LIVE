@echo off
setlocal
cd /d "%~dp0"
title GOPASS + AREAONE-LIVE (ครบชุด)
color 0A

echo ============================================================
echo   GOPASS  (กดบัตร)  : http://127.0.0.1:8080/  ^(PHP^)
echo   AREAONE-LIVE      : http://127.0.0.1:3000/  ^(Node^)
echo ============================================================
echo.

echo [1/2] เริ่ม PHP server (GOPASS)...
start "GOPASS PHP Server" cmd /k "cd /d %~dp0 && php -S 127.0.0.1:8080 router.php"
echo        http://127.0.0.1:8080/
echo.

echo [2/2] เริ่ม Node server (AREAONE-LIVE)...
echo        - ตองมี Postgres รันอยู่ + ตั้ง DATABASE_URL ใน live\.env ก่อน
echo        - ถ้ายังไมมี node_modules จะติดตั้งใหอัตโนมัติ (รอบแรกชาหนอย)
start "AREAONE-LIVE Node Server" cmd /k "cd /d %~dp0live && if not exist node_modules npm install && npm start"
echo        http://127.0.0.1:3000/
echo.

echo เปิดเบราว์เซอร์ไปที่: http://127.0.0.1:8080/
echo.
timeout /t 3 >nul
start http://127.0.0.1:8080/
echo เสร็จแลว — server รันในหน้าต่างแยก ปิดหนาตางนี้ได
pause