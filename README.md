# Mediary 🎬

პირადი ორენოვანი (ქართული/ინგლისური) ფილმებისა და სერიალების კატალოგი, TMDB-ინტეგრაციით.

- **backend/** — Laravel 11 JSON API (PHP 8.3, MySQL)
- **frontend/** — React 18 + TypeScript SPA (Vite, Tailwind v4, shadcn/Radix UI, TanStack Query, react-i18next)

---

## საჭირო ინსტრუმენტები (prerequisites)

სხვა კომპიუტერზე გასაშვებად წინასწარ დააყენე:

| ინსტრუმენტი | ვერსია | შენიშვნა |
|---|---|---|
| **PHP** | 8.3+ | `pdo_mysql`, `mbstring`, `openssl`, `fileinfo` გაფართოებებით |
| **Composer** | 2.x | PHP პაკეტების მენეჯერი |
| **Node.js** | 18+ | `npm`-თან ერთად |
| **MySQL** | 8.x (ან MariaDB / XAMPP) | ბაზა `mediary` |

---

## სწრაფი აწყობა (fresh clone)

```bash
git clone https://github.com/davitkifshidze/mediary.git
cd mediary
```

**MySQL ჯერ უნდა იყოს გაშვებული** (XAMPP-ზე: `C:\xampp\mysql\bin\mysqld.exe`).

შემდეგ ერთი ბრძანება ყველაფერს დააყენებს:

```powershell
# Windows (PowerShell)
./setup.ps1
```
```bash
# macOS / Linux
chmod +x setup.sh && ./setup.sh
```

სკრიპტი აკეთებს: `composer install`, `.env` ფაილების შექმნას `.env.example`-იდან,
`php artisan key:generate`, `storage:link`, **ბაზის ბექაპის იმპორტს**
(`backend/mediary_backup.sql`) და `npm install`-ს.

### ხელით აწყობა (თუ სკრიპტს არ იყენებ)

```bash
# backend
cd backend
composer install
cp .env.example .env          # Windows: copy .env.example .env
php artisan key:generate
php artisan storage:link
mysql -u root < mediary_backup.sql   # ან: php artisan migrate --seed

# frontend
cd ../frontend
npm install
cp .env.example .env          # Windows: copy .env.example .env
```

---

## გაშვება (dev) — ორი ტერმინალი

```bash
# 1) Backend API  → http://localhost:8000
cd backend && php artisan serve --port=8000

# 2) Frontend SPA → http://localhost:5173
cd frontend && npm run dev
```

გახსენი **http://localhost:5173**.

---

## პოსტერების/ფოტოების ჩამოტვირთვა (ახალ მანქანაზე)

პოსტერები და მსახიობთა ფოტოები ინახება `backend/storage/app/public/{movies,series}/posters`-სა
და `cast/photos`-ში (საქაღალდე მოდულისაა — იხ. `app/Support/StorageFolder.php`)
და **git-ში არ იტვირთება** (მძიმეა). ახალ კომპიუტერზე კლონის შემდეგ სურათები ცარიელი იქნება —
დააჭირე **„მედიის ხელახლა ჩამოტვირთვა" ღილაკს** ბიბლიოთეკის გვერდზე (ან გამოიძახე
`POST /api/media/redownload`) და ყველა პოსტერი/ფოტო თავიდან ჩამოიტვირთება TMDB-დან
შენახული `tmdb_id`-ების მიხედვით. საჭიროა `TMDB_API_KEY` `backend/.env`-ში.

---

## ბაზა

- ბაზა: `mediary` · მომხმარებელი `root` · პაროლი ცარიელი · `127.0.0.1:3306`
- სრული SQL ბექაპი (სქემა + მონაცემები, 19 ცხრილი): **`backend/mediary_backup.sql`**
- ბექაპის ხელახლა შესაქმნელად:
  ```bash
  mysqldump -u root --databases mediary --add-drop-database --result-file=backend/mediary_backup.sql
  ```
- ⚠️ XAMPP-ის MySQL-სა და WAMP-ის MySQL-ს **ერთდროულად არ გაუშვა** — ორივე 3306-ს იყენებს.

## კონფიგურაცია

- `backend/.env` — `TMDB_API_KEY` უკვე ჩართულია (რეალური პოსტერები/მსახიობები/აღწერები).
  უფასო გასაღები: https://www.themoviedb.org/settings/api
- `frontend/.env` — `VITE_API_URL` (backend-ის მისამართი).

## ხშირი ბრძანებები

**Backend:** `php artisan migrate:fresh --seed` · `php artisan test` · `./vendor/bin/pint`
**Frontend:** `npm run dev` · `npm run build` · `npm run lint`

---

დამატებითი ტექნიკური დეტალები: [`CLAUDE.md`](CLAUDE.md).
