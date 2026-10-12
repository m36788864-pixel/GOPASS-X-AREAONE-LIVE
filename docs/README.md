# GOPASS — PHP Edition

GOPASS ticketing system for Apache/cPanel/PHP hosting. The original Frontend is kept, while the `/api/*` backend is implemented in PHP.

## Production upload
Upload the entire folder to the document root for:
`https://gopass.griffinsite.xyz/`

Required:
- PHP 8.1+ (recommended 8.2+)
- Apache with `.htaccess` / `mod_rewrite`
- PHP cURL extension
- write permission for `data/` and `uploads/`

## Check after upload
Open:
- `/api/health`
- `/api/events`

Expected:
- `/api/health` returns JSON with `ok: true`
- `/api/events` returns the event list

## Admin
`/admin/login.html`

Default:
- Username: `admin`
- Password: `DELEF#GOPASS2026!`

Change `config.php` before production use.

## PHP API
All frontend requests continue to use `/api/...`; `.htaccess` routes them to `api/index.php`.

## Google Sheets / Discord
Edit `config.php` or set environment variables:
- `GOOGLE_SHEET_WEBHOOK_URL`
- `GOOGLE_SHEET_SECRET`
- `DISCORD_WEBHOOK_URL`

## Local Windows test
Install PHP, then double-click:
`START-GOPASS-PHP.bat`

Open:
`http://127.0.0.1:8080/`

Do not close the CMD window while the PHP server is running.
