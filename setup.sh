#!/usr/bin/env bash
# Mediary — one-shot setup for a fresh clone (macOS / Linux)
# Usage:  ./setup.sh
# Requires on PATH: php, composer, node, npm, and the mysql client.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "=== mediary setup ==="

# --- prerequisite check ---
missing=()
for t in php composer node npm; do command -v "$t" >/dev/null 2>&1 || missing+=("$t"); done
if [ ${#missing[@]} -ne 0 ]; then echo "Missing tools: ${missing[*]}. Install them first."; exit 1; fi

# --- backend ---
echo ""
echo "[1/4] Backend: composer install"
cd "$root/backend"
composer install
# Tasks SEC-11 — `.env.example` is safe by default (APP_DEBUG=false,
# SESSION_SECURE_COOKIE=true), because a server install copies it too.
# A local install is the opposite case and says so out loud here:
#   · debug on, so a 500 is readable while developing;
#   · the session cookie NOT secure — local runs over http://, where a secure
#     cookie is never sent and login would simply stop working.
if [ ! -f .env ]; then
  cp .env.example .env
  # ⚠️ no `$` anchor: with git's core.autocrlf the checked-out file may be CRLF,
  # where `^...false$` never matches. `^` alone is enough to mean "the value
  # line and not the comment above it", and it behaves the same in GNU and BSD sed.
  sed -i.bak -e 's/^APP_DEBUG=false/APP_DEBUG=true/' \
             -e 's/^SESSION_SECURE_COOKIE=true/SESSION_SECURE_COOKIE=false/' .env && rm -f .env.bak
  echo "  .env created from .env.example (local: APP_DEBUG=true, SESSION_SECURE_COOKIE=false)"
fi
grep -q 'APP_KEY=base64:' .env || php artisan key:generate
php artisan storage:link 2>/dev/null || true

# --- database ---
# No dump is committed any more (Tasks SEC-01): it carried password hashes,
# remember tokens, sessions and private chat. A fresh clone starts from an empty
# seeded database. `migrate` offers to create a missing `mediary` (default: yes).
# No --no-interaction here: without --force it makes migrate skip that creation.
echo ""
echo "[2/4] Database: migrate + seed"
if php artisan migrate --seed; then
  echo "  DB migrated and seeded (genres + modules)."
else
  echo "  Migration failed — start MySQL, check DB_* in backend/.env, then run:"
  echo "    php artisan migrate --seed"
fi

# --- frontend ---
echo ""
echo "[3/4] Frontend: npm install"
cd "$root/frontend"
npm install
[ -f .env ] || { cp .env.example .env; echo "  .env created from .env.example"; }

echo ""
echo "[4/4] Done."
cat <<'EOF'

Start the app (two terminals):
  1) cd backend  && php artisan serve --port=8000
  2) cd frontend && npm run dev
Then open  http://localhost:5173

Make sure MySQL is running before starting the backend.

Create the first super-admin (the seeded database has no users):
  cd backend && php artisan mediary:bootstrap-admin --name= --email= --username= --password=
Moving an existing library: /backups on the old machine (download),
then /backups on this one (upload + restore).
Tip: /sync (or php artisan media:redownload) fetches posters & cast photos
from TMDB on a fresh machine.
EOF
