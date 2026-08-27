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
[ -f .env ] || { cp .env.example .env; echo "  .env created from .env.example"; }
grep -q 'APP_KEY=base64:' .env || php artisan key:generate
php artisan storage:link 2>/dev/null || true

# --- database ---
echo ""
echo "[2/4] Database: import backup"
if command -v mysql >/dev/null 2>&1; then
  echo "  Importing mediary_backup.sql (creates DB mediary)..."
  if mysql -u root < "$root/backend/mediary_backup.sql" 2>/dev/null; then
    echo "  DB imported."
  else
    echo "  Import failed — start MySQL, then run: mysql -u root < backend/mediary_backup.sql"
  fi
else
  echo "  mysql client not found. Start MySQL, then run:"
  echo "    mysql -u root < backend/mediary_backup.sql"
  echo "  (or use  php artisan migrate --seed  for an empty seeded DB)"
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
Tip: hit the "re-download media" button (or POST /api/media/redownload)
to fetch posters & cast photos from TMDB on a fresh machine.
EOF
