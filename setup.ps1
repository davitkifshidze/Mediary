# Mediary — one-shot setup for a fresh clone (Windows / PowerShell)
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
Write-Host "`n[2/4] Database: import backup" -ForegroundColor Yellow
$mysql = $null
foreach ($c in 'mysql', 'C:\xampp\mysql\bin\mysql.exe') {
  if (Have $c) { $mysql = (Get-Command $c).Source; break }
  if (Test-Path $c) { $mysql = $c; break }
}
if ($mysql) {
  Write-Host "  Importing mediary_backup.sql (creates DB `mediary`)..."
  & $mysql -u root -e "SOURCE $root\backend\mediary_backup.sql" 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host "  DB imported." -ForegroundColor Green }
  else { Write-Host "  Import failed — start MySQL, then run: mysql -u root < backend/mediary_backup.sql" -ForegroundColor Red }
} else {
  Write-Host "  mysql client not found. Start MySQL, then run:" -ForegroundColor Red
  Write-Host "    mysql -u root < backend/mediary_backup.sql"
  Write-Host "  (or use  php artisan migrate --seed  for an empty seeded DB)"
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
Tip: hit the "re-download media" button (or POST /api/media/redownload)
to fetch posters & cast photos from TMDB on a fresh machine.
"@ -ForegroundColor Cyan
