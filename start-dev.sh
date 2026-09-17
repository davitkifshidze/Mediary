#!/usr/bin/env bash
# Mediary - one-shot dev environment starter (Git Bash / Windows)
# Usage: ./start-dev.sh   (double-click Start-Mediary.bat also works)
#
# Runs everything from this one shell:
#   1) XAMPP's MySQL on port 3307 (holds the `mediary` database)
#   2) Backend  - php artisan serve --port=8000   (backgrounded, logged to backend.log)
#   3) Frontend - npm run dev                     (backgrounded, logged to frontend.log)
#   4) Opens the app (http://mediary.local, via WAMP's reverse-proxy vhost)
#      and phpMyAdmin (pre-selecting the "XAMPP - Mediary (3307)" server)
#
# Deliberately does NOT touch WAMP's own Apache/MySQL - cms.local and other
# projects run there too. WAMP's Apache (port 80) must already be running
# for mediary.local to resolve; if it isn't, start it from the WAMP tray icon.

cd "$(dirname "$0")"
root="$(pwd)"

port_listening() {
  netstat -ano 2>/dev/null | grep -q ":$1 .*LISTENING"
}

echo "=== Mediary dev environment ==="

# --- 1) MySQL (XAMPP, port 3307) ---
if port_listening 3307; then
  echo "[1/4] MySQL already running on :3307"
else
  echo "[1/4] Starting XAMPP MySQL on :3307..."
  nohup "/c/xampp/mysql/bin/mysqld.exe" --defaults-file="C:/xampp/mysql/bin/my.ini" >/dev/null 2>&1 &
  disown
  sleep 3
  if port_listening 3307; then echo "  MySQL is up."
  else echo "  MySQL did not come up - check C:/xampp/mysql/data/mysql_error.log"; fi
fi

# --- 2) Backend ---
if port_listening 8000; then
  echo "[2/4] Backend already running on :8000"
else
  echo "[2/4] Starting backend (php artisan serve), logging to backend.log..."
  (cd "$root/backend" && nohup php artisan serve --port=8000 >"$root/backend.log" 2>&1 &)
fi

# --- 3) Frontend ---
if port_listening 5173; then
  echo "[3/4] Frontend already running on :5173"
else
  echo "[3/4] Starting frontend (npm run dev), logging to frontend.log..."
  (cd "$root/frontend" && nohup npm run dev >"$root/frontend.log" 2>&1 &)
fi

# --- 4) Browser tabs ---
sleep 2
echo "[4/4] Opening the app and the database..."
cmd.exe /c start "" "http://mediary.local" >/dev/null 2>&1
cmd.exe /c start "" "http://localhost/phpmyadmin5.2.3/index.php?server=3" >/dev/null 2>&1

echo ""
echo "Done. Backend and frontend keep running in the background even if you close this window."
echo "Watch their output with:  tail -f backend.log   or   tail -f frontend.log"
echo "mediary.local needs WAMP's Apache (port 80) already running."
