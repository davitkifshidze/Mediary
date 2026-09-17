---
description: Start the Mediary dev environment (XAMPP MySQL, backend, frontend) and open the app + database.
---

Start the whole Mediary local dev environment. This is a routine, reversible dev action on this project only — proceed without asking for confirmation, but never touch WAMP's own Apache/MySQL (`cms.local` and other projects run there too).

1. Run `./start-dev.sh` (repo root, Bash) — it checks ports 3307/8000/5173 and only starts what's missing: XAMPP's MySQL (detached), the backend (`php artisan serve --port=8000`, backgrounded, logged to `backend.log`) and the frontend (`npm run dev`, backgrounded, logged to `frontend.log`). It also opens `http://mediary.local` and phpMyAdmin in the OS's default browser via `cmd.exe /c start`.
2. **Also** open the same two URLs in the built-in Browser pane (this session's own tabs, in addition to what the script opened):
   - `http://mediary.local`
   - `http://localhost/phpmyadmin5.2.3/index.php?server=3` (pre-selects the "XAMPP - Mediary (3307)" server; the user still types `root` with an empty password themselves)
3. If port 80 has nothing listening, WAMP's Apache is down — say so and tell the user to start it from the WAMP tray icon (`Restart All Services`); `mediary.local` won't resolve until then. Don't try to start it yourself.
4. Finish with a short summary: what the script found already running vs. what it started.
