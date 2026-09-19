# Mediary 🎬

პირადი ორენოვანი (ქართული/ინგლისური) **მედია-კატალოგი**: ფილმი · სერიალი · ანიმე ·
ვიდეო · სიმღერა (პლეილისტებით) · წიგნი · სამაგიდო თამაში · თამაში · ჩანაწერი ·
ბუკმარკი · გალერეა — **11 მოდული**, per-user ბიბლიოთეკებით, საჯარო პროფილებით და
ჩატით. გარე წყაროები: TMDB, Open Library, RAWG/IGDB, BGG, Wikimedia, SerpApi/Serper, Gemini.

- **backend/** — Laravel 13 JSON API (PHP 8.3, MySQL/MariaDB), 85 ცხრილი
- **frontend/** — React 19 + TypeScript SPA (Vite, Tailwind v4, shadcn/Radix UI, TanStack Query, react-i18next)

> **სამუშაო დოკუმენტი [`CLAUDE.md`](CLAUDE.md)-ია** — არქიტექტურა, გადაწყვეტილებები და
> ის ხაფანგები, რომლებიც ჩუმად ტყდება. ეს README მხოლოდ აწყობისა და გაშვებისაა.

---

## საჭირო ინსტრუმენტები (prerequisites)

სხვა კომპიუტერზე გასაშვებად წინასწარ დააყენე:

| ინსტრუმენტი | ვერსია | შენიშვნა |
|---|---|---|
| **PHP** | 8.3+ | `pdo_mysql`, `mbstring`, `openssl`, `fileinfo` გაფართოებებით |
| **Composer** | 2.x | PHP პაკეტების მენეჯერი |
| **Node.js** | 22.12+ (რეკომენდებულია 24 LTS) | `npm`-თან ერთად; ზუსტი დიაპაზონი `frontend/package.json`-ის `engines`-შია |
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
`php artisan key:generate`, `storage:link`, **ბაზის მიგრაციასა და seed-ს**
(`php artisan migrate --seed` — ჟანრები და მოდულები; თუ ბაზა `mediary` არ არსებობს,
შექმნას შემოგთავაზებს) და `npm install`-ს.

⚠️ **ბაზის dump git-ში არ ინახება.** ის პაროლების ჰეშებს, სესიებს, პირად ჩატს და
API ტოკენებს შეიცავს (Tasks SEC-01), ე.ი. ახალი კლონი ცარიელი ბაზით იწყება:

- პირველი სუპერ-ადმინი: `php artisan mediary:bootstrap-admin --name= --email= --username= --password=`
- **საჩვენებელი მონაცემები** (სინთეზური, პერსონალური მონაცემის გარეშე): `php artisan mediary:seed-demo`
  → `demo@example.com` / `demo-password`. ⚠️ პაროლი ცნობილია — საჯარო ინსტალაციაზე
  ეს ანგარიში წაშალე. ხელახლა გაშვება დუბლიკატებს არ ქმნის.
- ძველი მანქანიდან ბიბლიოთეკის გადმოტანა: **`/backups`** — ძველზე ჩამოტვირთვა, ახალზე ატვირთვა და აღდგენა.

### ხელით აწყობა (თუ სკრიპტს არ იყენებ)

```bash
# backend
cd backend
composer install
cp .env.example .env          # Windows: copy .env.example .env
php artisan key:generate
php artisan storage:link
php artisan migrate --seed

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
გახსენი **`/sync`** და გაუშვი მედიის ჩამოტვირთვა, ან CLI-დან:

```bash
php artisan media:redownload --missing
```

ორივე შენახულ `tmdb_id`-ებს მიჰყვება. საჭიროა `TMDB_API_KEY` (`.env`-ში ან `/credentials`-ზე).

---

## ბაზა

- ბაზა: `mediary` · მომხმარებელი `root` · პაროლი ცარიელი · `127.0.0.1:3306` (**85 ცხრილი**)
- ⚠️ **SQL dump-ი git-ში არასდროს ჩაიდება** — `.gitignore` ყველა `*.sql`/`*.sql.gz` ფაილს
  ბლოკავს. ბექაპი ორ გზით კეთდება, ორივე **ლოკალურია**:
  - აპიდან: **`/backups`** (super-admin) — ფაილი პირად დისკზე ინახება და ჩამოტვირთვადია;
  - ხელით (ფაილი git-ის გარეთ რჩება):
    ```bash
    mysqldump -u root --databases mediary --add-drop-database --result-file=backend/mediary_backup.sql
    ```
- არც ერთი ასლი მანქანას არ ტოვებს — მანქანის გარეთ ასლის შენახვა (მაგ. პირად დისკზე) შენი საქმეა.
- ⚠️ XAMPP-ის MySQL-სა და WAMP-ის MySQL-ს **ერთდროულად არ გაუშვა** — ორივე 3306-ს იყენებს.

## კონფიგურაცია

- `backend/.env` — `TMDB_API_KEY` **ცარიელია და შენ უნდა ჩასვა** (Tasks SEC-06: ცოცხალი
  გასაღები `.env.example`-ში იდგა და ისტორიიდანაც ამოღებულია). უფასო გასაღები:
  https://www.themoviedb.org/settings/api
  ⚠️ გასაღებები **per-user-იცაა**: `/credentials` გვერდზე ყოველი ანგარიში თავისას
  ჩაწერს (TMDB · Gemini · RAWG · IGDB · SerpApi · Serper · YouTube · Telegram), `.env` კი
  მთელი ინსტალაციის ნაგულისხმევი რჩება.
- ⚠️ `.env.example` **უსაფრთხო default-ებზეა** (`APP_DEBUG=false`, `SESSION_SECURE_COOKIE=true`
  — Tasks SEC-11); `setup.sh`/`setup.ps1` ლოკალურ ინსტალაციაზე ორივეს ცხადად აბრუნებს,
  რადგან ლოკალურად `http://`-ზე secure-ქუქი საერთოდ არ იგზავნება.
- `frontend/.env` — `VITE_API_URL` (backend-ის მისამართი). ⚠️ **ცარიელი მნიშვნელობა**
  ნიშნავს ფარდობით `/api`-ს და სწორედ ისაა საჭირო, როცა SPA და API ერთ origin-ზეა
  (იხ. „პროდაქშენში გაშვება") — Sanctum-ის cookie-რეჟიმი ამას ითხოვს.
- ⚠️ `VITE_DEV_HOST` — მხოლოდ მაშინ, როცა dev-სერვერი პროქსის (Apache/nginx, პორტი 80)
  უკან დგას. ცარიელზე Vite ჩვეულებრივად მუშაობს. ადრე აქ `mediary.local` ჩაბეტონებული
  იყო, ე.ი. იმ სახელის გარეშე მანქანაზე HMR **უხმოდ ვერ მუშაობდა** (Tasks GAP-17).

## პროდაქშენში გაშვება

⚠️ **`php artisan serve` და `npm run dev` მხოლოდ დეველოპმენტისთვისაა.** პირველი
ერთნაკადიანია (ერთი ნელი რექვესთი მთელ აპს აჩერებს), მეორე კი ჩაუთარგმნელ
წყაროს გასცემს. სერვერზე Apache/nginx **აგებულ `frontend/dist`-ს** ემსახურება,
PHP კი FPM-ის (ან `mod_php`-ის) უკან დგას.

```bash
cd backend  && composer install --no-dev --optimize-autoloader && php artisan migrate --force
cd frontend && npm ci && npm run build        # → frontend/dist
```

`backend/.env`-ში:

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://example.com
FRONTEND_URL=https://example.com
SANCTUM_STATEFUL_DOMAINS=example.com
# ⚠️ სესიის ქუქი თვითონაა შესვლა (Sanctum cookie) — HTTP-ზე ის არ უნდა გავიდეს
SESSION_SECURE_COOKIE=true
# ⚠️ საჯარო სერვერზე: სუპერ-ადმინი მხოლოდ `mediary:bootstrap-admin`-ით (Tasks SEC-15)
FIRST_USER_IS_ADMIN=false
```

⚠️ **SPA და API ერთ origin-ზე უნდა იყოს.** Sanctum-ის cookie-რეჟიმი სწორედ ამას
ითხოვს, ამიტომ `/api`, `/sanctum` და `/storage` იმავე ჰოსტზე იდგმება და
`frontend/.env`-ის `VITE_API_URL` **ცარიელი რჩება** (ფარდობითი `/api`).

### Apache — ერთი ვჰოსტი

```apache
<VirtualHost *:443>
    ServerName example.com
    DocumentRoot /srv/mediary/frontend/dist

    # ⚠️ **`Alias` საქაღალდეზე და არა `index.php`-ზე.** ფაილზე მიბმული alias
    # მხოლოდ ზუსტ `/api`-ს ფარავს, `/api/movies` კი `PATH_INFO`-ზე დარჩებოდა —
    # საქაღალდე + `FallbackResource` Laravel-ის front controller-ის ჩვეულებრივი
    # სქემაა და `REQUEST_URI`-საც უცვლელს ტოვებს.
    Alias /api     /srv/mediary/backend/public
    Alias /sanctum /srv/mediary/backend/public
    # ⚠️ `/storage` **ნამდვილი ფაილებია** — მას fallback არ უნდა: არარსებული
    # ფაილი 404 უნდა იყოს და არა აპლიკაციის პასუხი.
    Alias /storage /srv/mediary/backend/storage/app/public

    <Directory /srv/mediary/backend/public>
        Require all granted
        # ⚠️ ორივე alias-ს ერთი front controller ემსახურება: `/sanctum/csrf-cookie`
        # `/api`-ს ქვეშ არ არის, მაგრამ იმავე `index.php`-ზე მიდის და მარშრუტს
        # Laravel `REQUEST_URI`-დან კითხულობს.
        FallbackResource /api/index.php
    </Directory>

    <Directory /srv/mediary/frontend/dist>
        Require all granted
        # SPA-ს მარშრუტები კლიენტზეა — უცნობი გზაც `index.html`-ია
        FallbackResource /index.html
    </Directory>

    # ⚠️ **ჰედერები აქაც საჭიროა** (Tasks SEC-16 + GAP-17): SPA-ს HTML-სა და
    # `/storage/*`-ს **Laravel არ ემსახურება**, ე.ი. `SetSecurityHeaders` მათ
    # ვერ სწვდება — ორივე ფენას თავისი უნდა ჰქონდეს.
    Header always set X-Content-Type-Options "nosniff"
    Header always set Content-Security-Policy "frame-ancestors 'none'"
    Header always set X-Frame-Options "DENY"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/example.com/privkey.pem
</VirtualHost>
```

### რა **არ** სჭირდება

- ⚠️ **`queue:work`-ის მუდმივი პროცესი არ არის საჭირო.** პარტიები worker-ს
  მოთხოვნისას თვითონ უშვებენ (`BackgroundProcess` → `queue:work --stop-when-empty`),
  ე.ი. მეოთხე მუდმივი პროცესი არ არსებობს. თუ მაინც გინდა — ჩვეულებრივი
  supervisor-ის ერთეული უშლელია, პარალელური worker უვნებელია.
- ⚠️ **`schedule:run` კი სჭირდება** — შეხსენებები, `model:prune` და
  `backups:prune-inspect` მასზეა:

  ```cron
  * * * * * cd /srv/mediary/backend && php artisan schedule:run >> /dev/null 2>&1
  ```

- ⚠️ **`php artisan storage:link`** — პოსტერები და გალერეა `/storage/*`-იდან გაიცემა.
- ⚠️ **პირადი დისკი ვებიდან არ უნდა იხსნებოდეს**: `storage/app/private-uploads`
  (ჩანიშვნების ფაილები, ჩატის მედია, ბაზის ასლები, ჩაკეტილი ალბომები) მხოლოდ
  ავტორიზებულ მარშრუტებზე გადის — `Alias`-ი მასზე **არ** დაამატო.

⚠️ **აგების შემდეგ ერთი შემოწმება ღირს**: ძველი ტაბით გახსნილი აპი ახალ `dist`-ზე
ვერ იპოვის წაშლილ chunk-ს — ეს `ErrorBoundary`-ის „გვერდი ვერ ჩაიტვირთა"-ს უნდა
აჩვენებდეს და არა თეთრ ეკრანს.

---

## ხშირი ბრძანებები

**Backend:** `php artisan migrate:fresh --seed` · `php artisan test` · `./vendor/bin/pint`
**Frontend:** `npm run dev` · `npm run build` · `npm run lint` · `npm test`

---

დამატებითი ტექნიკური დეტალები: [`CLAUDE.md`](CLAUDE.md).
