# Mediary - one-shot setup for a fresh clone (Windows / PowerShell)
# Keep this file ASCII-only: Windows PowerShell 5.1 reads a BOM-less script as
# Windows-1252, where the UTF-8 bytes of an em dash decode to a typographic
# quote and silently end the string it sits in (the script failed to parse).
# Usage:  ./setup.ps1
# Requires on PATH: php, composer, node, npm, and a MySQL client (mysql).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Have($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

Write-Host "`n=== mediary setup ===" -ForegroundColor Cyan

# --- prerequisite check ---
$missing = @()
foreach ($t in 'php','composer','node','npm') { if (-not (Have $t)) { $missing += $t } }
if ($missing.Count) { Write-Host "Missing tools: $($missing -join ', '). Install them first." -ForegroundColor Red; exit 1 }

# --- backend ---
Write-Host "`n[1/4] Backend: composer install" -ForegroundColor Yellow
Push-Location "$root\backend"
composer install
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host "  .env created from .env.example" }
$envtxt = Get-Content .env -Raw
if ($envtxt -notmatch 'APP_KEY=base64:') { php artisan key:generate }
php artisan storage:link 2>$null

# --- database ---
# No dump is committed any more (Tasks SEC-01): it carried password hashes,
# remember tokens, sessions and private chat. A fresh clone starts from an empty
# seeded database. `migrate` offers to create a missing `mediary` (default: yes).
# No --no-interaction here: without --force it makes migrate skip that creation.
Write-Host "`n[2/4] Database: migrate + seed" -ForegroundColor Yellow
php artisan migrate --seed
if ($LASTEXITCODE -eq 0) { Write-Host "  DB migrated and seeded (genres + modules)." -ForegroundColor Green }
else {
  Write-Host "  Migration failed - start MySQL, check DB_* in backend\.env, then run:" -ForegroundColor Red
  Write-Host "    php artisan migrate --seed"
}
Pop-Location

# --- frontend ---
Write-Host "`n[3/4] Frontend: npm install" -ForegroundColor Yellow
Push-Location "$root\frontend"
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host "  .env created from .env.example" }
Pop-Location

Write-Host "`n[4/4] Done." -ForegroundColor Green
Write-Host @"

Start the app (two terminals):
  1) cd backend  ; php artisan serve --port=8000
  2) cd frontend ; npm run dev
Then open  http://localhost:5173

Make sure MySQL is running (XAMPP: C:\xampp\mysql\bin\mysqld.exe) before starting the backend.

Create the first super-admin (the seeded database has no users):
  cd backend ; php artisan mediary:bootstrap-admin --name= --email= --username= --password=
Moving an existing library: /backups on the old machine (download),
then /backups on this one (upload + restore).
Tip: /sync (or php artisan media:redownload) fetches posters & cast photos
from TMDB on a fresh machine.
"@ -ForegroundColor Cyan
