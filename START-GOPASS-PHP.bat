@echo off
setlocal
cd /d "%~dp0"
title GOPASS PHP LOCAL SERVER
color 0F

echo ============================================================
echo                  GOPASS PHP LOCAL SERVER
echo ============================================================
echo.
php -v
if errorlevel 1 (
  echo.
  echo [ERROR] PHP not found in PATH.
  echo Install PHP 8.1+ and reopen this file.
  pause
  exit /b 1
)

echo.
echo Starting PHP server on http://127.0.0.1:8080/
echo Keep this window open while testing.
echo.
php -S 127.0.0.1:8080 router.php

echo.
echo Server stopped.
pause
