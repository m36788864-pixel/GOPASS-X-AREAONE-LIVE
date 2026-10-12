# Admin Login Fix

Default username: admin
Default password: DELEF#GOPASS2026!

The broken data/admin.json was removed. lib/auth.js will generate a real bcrypt hash at startup. If an old deployed admin.json remains, temporarily set ADMIN_RESET=true on Render, deploy/restart once, then remove ADMIN_RESET.
