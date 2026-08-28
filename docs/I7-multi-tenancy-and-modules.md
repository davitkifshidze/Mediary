# I7 — დიზაინ-დოკუმენტი: მრავალმომხმარებლიანობა, მოდულური სისტემა და უფლებები

> სტატუსი: **დასამტკიცებელი წინადადება**. კოდი ჯერ არ იწერება (იხ. `Tasks.md` სექცია I).
> ეხება: F4 (ავტორიზაცია), I1–I6, ნაწილობრივ E1 (პარამეტრების backend-ზე გატანა).
> თარიღი: 2026-08-28.

---

## 0. TL;DR — რას ვთავაზობ

| კითხვა | წინადადება |
|---|---|
| მფლობელობის მოდელი | **ვარიანტი A** — `movies`/`series`-ს დაემატოს `user_id`; თითო user-ს **თავისი რიგები**. მედია-ფაილები და ლექსიკონები (`genres`, `cast_members`) გაზიარებული რჩება. |
| ავტორიზაცია | **Laravel Sanctum, SPA cookie რეჟიმი** (httpOnly სესია). Bearer-token — სარეზერვო ვარიანტი cross-domain დეპლოისთვის. |
| ჟანრები | გლობალური სისტემური 19 + **per-user საკუთარი** (`genres.user_id` nullable: `null` = სისტემური). |
| მსახიობები | სუფთა გლობალური ლექსიკონი, `user_id` **არ** ემატება. |
| მოდულები | `modules` ცხრილი + `module_user` pivot; frontend-ის `MEDIA` დესკრიპტორი **backend-იდან** მოდის. |
| როლები | ორი როლი: `super_admin`, `user`; შემოწმება Policy-ებით, არა მხოლოდ UI-ს დამალვით. |
| მიგრაცია | 5 ეტაპი, თითო ცალკე PR/კომიტი; არსებული 280 ჩანაწერი #1 user-ს (super_admin) მიება. |

**რატომ ვარიანტი A და არა „გლობალური კატალოგი + per-user pivot"** — დეტალური შედარება §3-შია; მოკლედ: A ინარჩუნებს ყველა არსებულ query-ს (ერთი global scope + ერთი სვეტი), B კი მოითხოვს `genreables`/`castables`-ის პირველადი გასაღების გადაწერას, `GenreItemController`-ის სრულ გადაკეთებას და ჩანაწერის რედაქტირების კონფლიქტების გადაწყვეტას (user A-ს ჩასწორებული აღწერა user B-ს რომ არ შეეცვალოს).

---

## 1. მიზანი და სკოუპი

**მიზანი.** Mediary გახდეს მრავალმომხმარებლიანი, მოდულური პლატფორმა: თითო user-ს **საკუთარი** ბიბლიოთეკა და **მხოლოდ ის მოდულები**, რაც სუპერ-ადმინმა ჩაურთო.

**სკოუპში შედის:** ავტორიზაცია/რეგისტრაცია/პროფილი (F4), per-user მონაცემები (I1), მოდულების რეესტრი და per-user ჩართვა (I2/I3), როლები + ადმინ-პანელი (I4), ვიდეო-მოდულის ჩარჩო (I5).

**სკოუპში არ შედის (ცალკე ეპიკებია):** ქართული/უცხოური ლინკების პარსინგი (G/H), თარგმანის ფიჩერი (F1/F2), ჰედერი (F3 — მაგრამ ავტორიზაცია მას წინაპირობად სჭირდება: პროფილის მენიუ ჰედერშია).

---

## 2. საწყისი მდგომარეობა (გაზომილი 2026-08-28)

| ფაქტი | მნიშვნელობა |
|---|---|
| Laravel | **13.17** (`composer.json`), PHP 8.3 — `CLAUDE.md`-ში ჯერ კიდევ „Laravel 11" წერია, გასასწორებელია |
| Sanctum | **არ არის დაინსტალირებული** (`composer require laravel/sanctum` / `php artisan install:api` დასჭირდება) |
| `users` ცხრილი | არსებობს (Laravel-ის default), **0 რიგი** |
| მონაცემები | movies **258**, series **22**, genres **36**, cast_members **2359**, genreables **785**, castables **3170** |
| API routes | **ყველა route ღიაა**, middleware არ არის (`routes/api.php` — 30+ endpoint) |
| Frontend auth | არ არსებობს; `lib/api.ts` — ერთი axios instance, მხოლოდ `Accept` ჰედერით |
| მედია | `storage/app/public/posters/<slug>.jpg`, `actors/<personId>.jpg` — **სახელი კონტენტზეა მიბმული, არა user-ზე** (ე.ი. ბუნებრივად დედუპლიცირებულია) |
| სერვერი | `php artisan serve` — **ერთი რექვესთი ერთდროულად** (იხ. Tasks J) |

**კრიტიკული სქემის დეტალები, რომლებიც მიგრაციაზე მოქმედებს:**
- `movies.imdb_id` და `series.imdb_id` — **`unique()`**. per-user რიგებზე ორი user ვერ დაამატებს ერთსა და იმავე ფილმს → **უნდა გახდეს `unique(user_id, imdb_id)`**.
- `genreables`/`castables` — კომპოზიტური primary key `(genre_id, genreable_id, genreable_type)`; `morphs()` FK-cascade-ს არ ქმნის, წაშლისას ხელით იშლება (`Movie::booted()`).
- `movie_translations`/`series_translations` — `unique(entity_id, locale)`, ჩანაწერზეა მიბმული (მფლობელობა მშობლიდან მემკვიდრეობით მოდის).

---

## 3. საკვანძო გადაწყვეტილება — მფლობელობის მოდელი

### ვარიანტი A — per-user რიგები (**რეკომენდებული**)

`movies`/`series`-ს ემატება `user_id`. ერთი ფილმი, რომელიც ორ user-ს აქვს = **ორი რიგი**.

```
users ──< movies ──< movie_translations
             └──< genreables >── genres (გლობალური + per-user)
             └──< castables  >── cast_members (გლობალური)
```

- **მფლობელობა მემკვიდრეობით გადადის**: თარგმანები, ჟანრის მიბმა, მსახიობის მიბმა, სტატუსი, რჩეული, მომავალი ლინკები — ყველაფერი movie-ს რიგზეა, ე.ი. **ავტომატურად per-user**.
- **დამატებითი ცხრილი არ სჭირდება**; pivot-ების სქემა უცვლელი რჩება.
- **დისკზე დუბლი არ ჩნდება** — პოსტერი `posters/<slug>.jpg`-ია, ე.ი. მეორე user-ის სინქრონი იმავე ფაილს გადააწერს (იგივე შიგთავსით).
- **ხარჯი:** TMDB-ის მოთხოვნები დუბლირდება (თითო user თავისთვის ამდიდრებს) და ბაზაში 258×N რიგი. რეალურ მასშტაბზე (პირადი პლატფორმა, ერთეული მომხმარებლები) — უმნიშვნელო.

### ვარიანტი B — გლობალური კატალოგი + per-user pivot

ერთი `movies` რიგი ყველასთვის; `user_movie` pivot-ში `status`, `is_favorite`, `watched_at`, `sort_order`, `links`.

- ✅ TMDB-ის მოთხოვნა ერთხელ; ბაზა კომპაქტური.
- ❌ **ჟანრი/მსახიობი per-user რომ იყოს, `genreables`-ს `user_id` სჭირდება პირველად გასაღებში** → `GenreItemController` (attach/detach/move/replace, `all=1`), `Genre::withCount`, `Movie::genres()` — ყველა გადასაწერია.
- ❌ **რედაქტირების კონფლიქტი:** user A-მ შეასწორა `description_ka` → იცვლება user B-სთვისაც. გამოსავალი — per-user translation override ცხრილი, ე.ი. კიდევ ერთი ფენა.
- ❌ ხელით შექმნილი ჩანაწერი (TMDB-ის გარეშე) გლობალურ კატალოგში ხვდება — „ვისია?" ისევ საჭიროებს `created_by`-ს.
- ❌ წაშლა: user-ს რომ „წაშალოს" ფილმი, რეალურად pivot იშლება — მაგრამ `MovieController::destroy()` ფაილსაც შლის; ლოგიკა ორად იყოფა.

### ვარიანტი C — ჰიბრიდი (გლობალური TMDB ქეში + per-user რიგები)

ვარიანტი A + ცალკე `tmdb_cache` ცხრილი (JSON პასუხები `tmdb_id`+`language`-ით), რომ მეორე user-ის დამატება TMDB-ს აღარ შეეხოს.

- ✅ A-ს ყველა უპირატესობა + TMDB-ის ტრაფიკის დაზოგვა.
- ⚠️ **მაგრამ ეს ოპტიმიზაციაა, არქიტექტურა არა** — შეიძლება მოგვიანებით დაემატოს, სქემის შეცვლის გარეშე.

### გადაწყვეტილება

**ვარიანტი A ახლა, ვარიანტი C-ს კარი ღიაა.** ვარიანტი B-ს ღირებულება (ბაზის კომპაქტურობა) ამ მასშტაბზე არ ამართლებს pivot-ების და რედაქტირების ლოგიკის გადაწერას.

> **შენიშვნა Tasks.md-ის I1-ზე:** იქ ჩაწერილი მოთხოვნა — „ერთი TMDB ფილმი შეიძლება რამდენიმე user-ს ჰქონდეს, თითოს — თავისი სტატუსი/რჩეული/ლინკები" — ვარიანტი A-თი **სრულად სრულდება**. სხვაობა მხოლოდ იმაშია, რომ „per-user pivot"-ის როლს თვითონ `movies` რიგი ასრულებს.

---

## 4. მონაცემთა მოდელი (ER)

### 4.1 ახალი/შეცვლილი ცხრილები

```
users                     (არსებული, ფართოვდება)
 ├ id, name, email, password, remember_token, timestamps      ← არსებული
 ├ first_name, last_name  string nullable                      ← F4
 ├ username               string unique nullable               ← F4
 ├ avatar_path            string nullable                      ← F4 (storage/avatars)
 ├ role                   enum('super_admin','user') default 'user'
 ├ settings               json nullable                        ← E1-ის localStorage → backend
 └ is_active              bool default true                    ← ადმინს შეეძლოს გათიშვა

modules                   (ახალი — მოდულების რეესტრი)
 ├ id
 ├ key                    string unique          ('movie','series','anime','video','adult','games','links')
 ├ name_ka / name_en      string
 ├ description_ka / description_en  string nullable
 ├ icon                   string                 (lucide-ის სახელი: 'Film','Tv','Video'…)
 ├ route_base             string                 ('/', '/series', '/video')
 ├ api_base               string                 ('/movies','/series','/video')
 ├ morph_alias            string nullable        ('movie','series' — polymorphic pivot-ებისთვის)
 ├ is_sensitive           bool default false     (adult — default off, ცალკე gate)
 ├ enabled_by_default     bool default false
 ├ sort_order             int default 0
 └ timestamps

module_user               (ახალი — per-user ჩართვა)
 ├ user_id                FK → users, cascade
 ├ module_id              FK → modules, cascade
 ├ settings               json nullable          (per-user per-module პარამეტრები)
 ├ enabled_at             timestamp nullable     (ვინ/როდის ჩართო — აუდიტისთვის)
 └ primary(user_id, module_id)

movies / series           (არსებული, ფართოვდება)
 ├ user_id                FK → users, cascade, index          ← ახალი
 ├ imdb_id: unique  →  unique(user_id, imdb_id)               ← შეცვლილი
 └ index(user_id, status), index(user_id, year)               ← ახალი კომპოზიტური

genres                    (არსებული, ფართოვდება)
 └ user_id                FK → users nullable, cascade         ← null = სისტემური (19 TMDB seed)
    unique(slug)  →  unique(user_id, slug)                     ← შეცვლილი

cast_members              უცვლელი (სუფთა გლობალური ლექსიკონი)
genreables / castables    უცვლელი (მფლობელობა მშობლიდან)
```

### 4.2 რატომ ასე

- **`role` სვეტი და არა `roles` ცხრილი.** ორი როლისთვის ცალკე ცხრილი + pivot ზედმეტი ცერემონიაა. თუ მოგვიანებით მეტი როლი/უფლება დაგვჭირდა, `role` სვეტიდან `roles`+`role_user`-ზე გადასვლა ერთი მიგრაციაა (I4-ის „გაფართოებადი" შენარჩუნებულია).
- **`genres.user_id` nullable.** სისტემური 19 ჟანრი (`GenresSeeder`) ყველასია და **მხოლოდ super_admin-ს შეუძლია მისი შეცვლა/წაშლა**; user-ის ხელით შექმნილი ჟანრი (`MovieController::syncGenres` → `firstOrCreate`) მას ეკუთვნის და მხოლოდ მას უჩანს. ხილვადობა = `whereNull('user_id')->orWhere('user_id', $me)`.
- **`cast_members`-ს `user_id` არ ემატება.** ეს TMDB-ის ლექსიკონია (2359 რიგი, `actors/<personId>.jpg`), მისი დუბლირება უაზროა. `/api/cast/{id}`-ის პასუხი (ჩემი ფილმები + შემოთავაზებები) ისედაც `movies`-ზე გადის, ე.ი. **ავტომატურად სკოუპდება**.
- **`users.settings` json.** E1-ის `mediary.settings.v1` (localStorage) გადმოვა როგორც JSON — `SettingsProvider` ერთადერთი ცვლილების წერტილია (იხ. `Tasks.md` E1: „backend-ზე გატანა ერთი ფაილის საქმეა").

---

## 5. ავტორიზაცია (F4)

### 5.1 მიდგომა — Sanctum SPA cookie

```bash
composer require laravel/sanctum
php artisan install:api          # ქმნის personal_access_tokens-ს + api middleware group-ს
```

**.env / config:**
```
SANCTUM_STATEFUL_DOMAINS=localhost:5173,127.0.0.1:5173
SESSION_DOMAIN=localhost
SESSION_DRIVER=database          # jobs/cache ცხრილები უკვე გვაქვს
```
`config/cors.php` → `'supports_credentials' => true`, `'paths' => ['api/*','sanctum/csrf-cookie']`.

**Frontend:** `lib/api.ts` → `axios.create({ withCredentials: true })`; login-ამდე ერთი `GET /sanctum/csrf-cookie`.

| | SPA cookie | Bearer token (localStorage) |
|---|---|---|
| XSS-ზე პაროლის/ტოკენის გატანა | ❌ შეუძლებელია (httpOnly) | ⚠️ შესაძლებელია |
| CSRF | საჭიროა `csrf-cookie` ნაბიჯი | არ სჭირდება |
| cross-domain დეპლოი | სჭირდება `SESSION_DOMAIN` კონფიგი | უპრობლემოდ |
| მობილური/CLI კლიენტი მომავალში | ცალკე ტოკენი დასჭირდება | უკვე მზადაა |

**რეკომენდაცია:** cookie რეჟიმი (ორივე ჰოსტი `localhost`-ია, ე.ი. same-site პრობლემა არ დგება). `personal_access_tokens` ცხრილი მაინც შეიქმნება — `php artisan media:redownload`-ის მსგავს CLI/სკრიპტულ წვდომას მოგვიანებით გამოადგება.

### 5.2 Endpoint-ები

```
POST   /api/auth/register     name, email, password        → 201 + user
POST   /api/auth/login        email|username, password      → 200 + user
POST   /api/auth/logout                                     → 204
GET    /api/auth/me                                         → user + enabled modules + settings
PATCH  /api/auth/profile      first_name, last_name, username, email, avatar (multipart)
PATCH  /api/auth/password     current_password, password
PUT    /api/auth/settings     { … }  ← E1-ის settings-ის persist
```

`routes/api.php` მთლიანად შეიფუთება:
```php
Route::middleware('auth:sanctum')->group(function () {
    // არსებული 30+ route უცვლელად
});
```
გამონაკლისი: `/api/health` და `/api/auth/{register,login}`.

### 5.3 რეგისტრაცია — ღია თუ დახურული?

**წინადადება: ღია რეგისტრაცია, მაგრამ „ცარიელი" ანგარიში.** ახალ user-ს ეძლევა მხოლოდ `enabled_by_default = true` მოდულები (movie, series), sensitive მოდულები — არასდროს ავტომატურად. სუპერ-ადმინს შეუძლია `is_active = false`-ით გათიშვა. თუ გირჩევნია მხოლოდ მოწვევით — `ALLOW_REGISTRATION=false` .env დროშა და `/auth/register` 403-ს აბრუნებს. **← შესათანხმებელია.**

### 5.4 Bootstrap

`php artisan mediary:bootstrap-admin` — ინტერაქტიულად ქმნის პირველ user-ს, ანიჭებს `super_admin`-ს და ურთავს ყველა მოდულს. თუ `users` ცარიელია და `register`-ით პირველი ანგარიში იქმნება — ისიც ავტომატურად `super_admin`-ია (I4: „პირველი user bootstrap-ით გახდეს super_admin").

---

## 6. Query-scoping (I1)

### 6.1 ტრეიტი + global scope

```php
// app/Models/Concerns/BelongsToUser.php
trait BelongsToUser
{
    protected static function bootBelongsToUser(): void
    {
        static::addGlobalScope('owner', function (Builder $q) {
            if ($id = Auth::id()) {
                $q->where($q->getModel()->getTable().'.user_id', $id);
            }
        });

        static::creating(function ($model) {
            $model->user_id ??= Auth::id();
        });
    }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
```

`Movie`, `Series` (და მომავალი მოდულების მოდელები) → `use BelongsToUser;`

**რას იძლევა უფასოდ:**
- `MovieController::index()` — ყველა ფილტრი/სორტი უცვლელი, სია სკოუპდება.
- `Movie::annotateFranchise()` — `static::whereIn(...)` global scope-ს იმემკვიდრებს, ე.ი. ფრანჩაიზის badge სხვისი ფილმებით აღარ დაითვლება.
- `Genre::withCount(['movies','series'])` — მთვლელები ავტომატურად per-user (A2-ის ლოგიკა უცვლელი).
- `GenreItemController` — `all=1` მხოლოდ ჩემს ჩანაწერებს შეეხება.
- `CastController::show()` — „ჩემს კოლექციაში" და `owned` badge სწორად მუშაობს.
- `DiscoverController` — `owned`/`movie_id` per-user.
- `MediaSyncController::plan()` — რიგში მხოლოდ ჩემი ჩანაწერები.
- Route-model-binding (`show(Movie $movie)`) — სხვისი id → **404** (და არა 403, რაც ID-ების ჩამოთვლასაც კეტავს).

**სად სჭირდება ხელით ყურადღება:**

| ადგილი | პრობლემა | გადაწყვეტა |
|---|---|---|
| `php artisan media:redownload` | CLI-ს `Auth::id()` არ აქვს → scope გამორთულია, ყველა user-ის ჩანაწერს ამუშავებს | `--user=` ოფცია; ცარიელზე გაფრთხილება „ყველა user-ზე გაეშვება" |
| `GenresSeeder` | სისტემური ჟანრები `user_id = null`-ით უნდა ჩაიწეროს | seeder-ში აშკარად `user_id => null` |
| `MovieController::storeFromTmdb` | `Movie::where('tmdb_id')` — სკოუპდება, ე.ი. **სწორია** (სხვისი ჩანაწერი არ დაბრუნდება) | ცვლილება არ სჭირდება |
| `imdb_id` unique | ორი user ერთსა და იმავე ფილმზე → 23000 შეცდომა | `unique(user_id, imdb_id)` მიგრაცია |
| `/storage/*` | ფაილები **ავტორიზაციის გარეშე** ხელმისაწვდომია URL-ით | TMDB-ის პოსტერებზე მისაღებია (ისედაც საჯარო CDN-ია); **sensitive მოდულისთვის (I5) — აუცილებლად ცალკე private disk + controller-route** |

### 6.2 „როგორ დავრწმუნდეთ, რომ არსად გაჟონა"

- ტესტი `tests/Feature/OwnershipTest.php`: ორი user, თითოს თითო ფილმი — `index` თითოზე 1 ჩანაწერს აბრუნებს; სხვისი `show/update/destroy/status/favorite/resync/sync` → **404**.
- ტესტი `GenreCountScopingTest`: A-ს 5 დრამა, B-ს 2 — `/api/genres` თითოსთვის შესაბამის რიცხვს აჩვენებს.
- **API-ს smoke-სკრიპტი**: ყველა route ავტორიზაციის გარეშე → 401.

---

## 7. მოდულური არქიტექტურა (I2/I3)

### 7.1 Backend

```
GET /api/modules            → ჩემთვის ჩართული მოდულები (frontend-ის ნავიგაციისთვის)
GET /api/admin/modules      → ყველა მოდული (super_admin)
```

Middleware `module:{key}` — თუ user-ს მოდული ჩართული არ აქვს, 403:
```php
Route::middleware(['auth:sanctum', 'module:movie'])->group(fn () => /* movies routes */);
Route::middleware(['auth:sanctum', 'module:series'])->group(fn () => /* series routes */);
```
გაზიარებული endpoint-ები (`/lookup`, `/discover`, `/media/sync/*`) `type`-ს იღებენ — შემოწმება `type`-ის მიხედვით ხდება controller-ში (`Gate::authorize('use-module', $type)`).

### 7.2 Frontend

`lib/media.ts`-ის hard-coded `MEDIA` ჩანაცვლდება backend-იდან წამოღებულით:

```ts
// ModulesProvider (settings.tsx-ის ანალოგიური): /api/modules ერთხელ, mount-ზე
const { modules } = useModules()            // MediaDescriptor[] + icon + label
```
- `Sidebar`-ის `DOMAINS` მასივი → `modules`-იდან.
- `App.tsx`-ის მარშრუტები → `modules.map(m => <Route path={m.route_base} …>)`.
- `mediaFromPath()` → `route_base`-ების მიხედვით dinamiurad.
- `MediaType` `'movie'|'series'`-იდან ხდება `string` — ტიპური უსაფრთხოება ცოტა სუსტდება, სამაგიეროდ ახალი მოდული კოდის შეცვლას აღარ საჭიროებს.

**ეტაპობრივად:** ჯერ `MEDIA` რჩება fallback-ად (თუ `/api/modules` ვერ წამოვიდა), მერე იშლება.

### 7.3 Recipe — „როგორ ემატება ახალი მოდული" (I2-ის deliverable)

1. **მიგრაცია** — `xxxx_create_<module>_table.php`: `user_id` + დომენის ველები (+ `<module>_translations`, თუ ორენოვანია).
2. **მოდელი** — `App\Models\<Module>`: `use BelongsToUser;` + `genres()`/`cast()` morphToMany (თუ საჭიროა).
3. **Morph alias** — `AppServiceProvider::enforceMorphMap` → `'<key>' => <Module>::class`.
4. **Controller + Resource** — `MovieController`/`MovieResource`-ის შაბლონით.
5. **Routes** — `Route::middleware(['auth:sanctum','module:<key>'])->group(…)`.
6. **`modules` ჩანაწერი** — seeder-ში ან ადმინ-პანელიდან (`key`, `route_base`, `api_base`, `icon`, `morph_alias`).
7. **Frontend** — თუ დომენი movie/series-ის ფორმისაა, **კოდი არ იწერება** (dinamiuri `MEDIA`); თუ სხვა ფორმისაა (მაგ. ვიდეო) — თავისი გვერდები.
8. **Enrichment** (არასავალდებულო) — `Services/Enrichment/<Module>Enricher` + `ItemSyncer`-ის ველების რუკა.

---

## 8. როლები და უფლებები (I4)

```php
// AuthServiceProvider / Gate
Gate::before(fn (User $u) => $u->role === 'super_admin' ? true : null);
Gate::define('use-module', fn (User $u, string $key) => $u->hasModule($key));
Gate::define('manage-users', fn (User $u) => false);   // მხოლოდ before-ით გაივლის
```
Policy-ები (`MoviePolicy`, `SeriesPolicy`) — `view/update/delete` = `$model->user_id === $user->id`.
Global scope-ს + policy-ს **ორივეს** ვტოვებთ: scope ჩუმად მალავს, policy აშკარად კეტავს (defence in depth; scope შემთხვევით `withoutGlobalScopes()`-ით რომ გაითიშოს, policy მაინც დაიჭერს).

**⚠️ `Gate::before`-ის შედეგი:** super_admin **ყველა** policy-ს გაივლის, მაგრამ **global scope მასზეც მოქმედებს** — ე.ი. ადმინი თავის ბიბლიოთეკას ხედავს, სხვისას არა. სხვისი მონაცემების სანახავად ცალკე `/api/admin/*` endpoint-ები დასჭირდება, აშკარა `withoutGlobalScope('owner')`-ით. **ეს განზრახაა** (ადმინი ავტომატურად არ „ერევა" სხვის ბიბლიოთეკაში).

**ადმინ-პანელი** — `/admin` მარშრუტი:
```
GET    /api/admin/users                     სია (+ ჩანაწერების რაოდენობა, ბოლო აქტივობა)
PATCH  /api/admin/users/{user}              role, is_active
PUT    /api/admin/users/{user}/modules      { module_keys: [...] }
DELETE /api/admin/users/{user}              (cascade — მისი ჩანაწერებიც)
```

---

## 9. მიგრაციის თანმიმდევრობა

> წინაპირობა ყოველი ეტაპის წინ: `mysqldump` → `backend/mediary_backup.sql` განახლება + ცალკე ბრენჩი.

| ეტაპი | შიგთავსი | რისკი | ზომა |
|---|---|---|---|
| **0. მომზადება** | ბექაპი; `Tasks.md`/`CLAUDE.md`-ში Laravel 13-ის გასწორება; `OwnershipTest`-ის ჩონჩხი | — | S |
| **1. Auth** | sanctum, users-ის გაფართოება, `/api/auth/*`, `mediary:bootstrap-admin`, frontend login/register + `ProtectedRoute` + პროფილის გვერდი | **მაღალი** — ამ მომენტიდან API დახურულია | L |
| **2. მფლობელობა** | `user_id` (nullable) → backfill 280 ჩანაწერზე `user_id=1` → `NOT NULL`; `unique(user_id, imdb_id)`; `genres.user_id`; `BelongsToUser`; policy-ები; `media:redownload --user=` | **მაღალი** — მონაცემებს ეხება | M |
| **3. მოდულები** | `modules` + `module_user` + seeder (movie/series); `module:` middleware; `/api/modules`; frontend `ModulesProvider` + dinamiuri Sidebar/Routes | საშუალო | M |
| **4. ადმინი** | `role`, `Gate`, `/api/admin/*`, ადმინ-პანელის გვერდი | დაბალი | M |
| **5. Settings + ახალი მოდულები** | `users.settings` (localStorage → backend, ერთჯერადი მიგრაცია კლიენტზე); I5 ვიდეო-მოდული | დაბალი | M+ |

### 9.1 ეტაპი 2-ის მიგრაცია დეტალურად

```php
// up()
Schema::table('movies', function (Blueprint $t) {
    $t->foreignId('user_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
});
DB::table('movies')->whereNull('user_id')->update(['user_id' => $adminId]);   // 258
Schema::table('movies', fn (Blueprint $t) => $t->foreignId('user_id')->nullable(false)->change());
Schema::table('movies', function (Blueprint $t) {
    $t->dropUnique(['imdb_id']);
    $t->unique(['user_id', 'imdb_id']);
    $t->index(['user_id', 'status']);
});
// series — იგივე (22 რიგი); genres — user_id nullable, backfill არ სჭირდება (null = სისტემური)
```
`$adminId` = `User::where('role','super_admin')->orderBy('id')->value('id')` — თუ ვერ იპოვა, მიგრაცია **ჩერდება** გასაგები შეტყობინებით (ე.ი. ეტაპი 1 აუცილებლად წინ უსწრებს).

**Rollback:** `down()` — `dropForeign`+`dropColumn`, `unique(imdb_id)`-ის აღდგენა. მონაცემი არ იკარგება (სვეტის მოხსნა მხოლოდ მიბმას შლის). დამატებით — SQL ბექაპი.

---

## 10. გავლენა არსებულ კოდზე

**Backend — შეიცვლება:** `routes/api.php` (middleware-ის ჯგუფები), `AppServiceProvider` (morph map — მოდულებიდან), `Movie`/`Series` (trait), `GenresSeeder` (`user_id => null`), `RedownloadMediaCommand` (`--user=`), `bootstrap/app.php` (sanctum middleware, CORS).
**Backend — უცვლელი რჩება:** ყველა controller-ის query-ლოგიკა, `Services/*` (Enrichment, Sync, Tmdb, Media), Resource-ები, `GenreItemController`, `MediaSyncController`.

**Frontend — შეიცვლება:** `lib/api.ts` (`withCredentials` + 401-ის interceptor → login), `App.tsx` (auth routes + `ProtectedRoute` + dinamiuri მოდულები), `Sidebar.tsx` (მოდულები + პროფილის ბლოკი), `lib/media.ts` (`MEDIA` → provider), `lib/settings.tsx` (localStorage → `/api/auth/settings`).
**Frontend — ახალი:** `pages/LoginPage`, `pages/RegisterPage`, `pages/ProfilePage`, `pages/AdminPage`, `lib/auth.tsx` (`AuthProvider`), `lib/modules.tsx`.
**Frontend — უცვლელი:** `LibraryPage`, `MoviePage`, `MovieFormPage`, `ActorPage`, `GenresPage`, `DiscoverModal`, `SyncDialog`, `ui/*` — ყველა API-ს იმავე ფორმით იღებს.

---

## 11. I5 — ვიდეო/adult მოდულის სპეციფიკა

- **ცალკე მოდული** `video` (ჩვეულებრივი) და `video_adult` (`is_sensitive = true`, `enabled_by_default = false`).
- **`/storage/*` საჯაროა** → sensitive მოდულის ფაილები **მხოლოდ** private disk-ზე (`storage/app/private/...`) + `GET /api/video/{id}/thumb` route policy-შემოწმებით.
- **Embed-ის უსაფრთხოება:** ინახება მხოლოდ URL; iframe იგება allowlist-ით (`youtube.com/embed`, `player.vimeo.com`…), თვითნებური HTML არასდროს ინახება/რენდერდება.
- **UI:** ჩაურთველი მოდული ნავიგაციაში საერთოდ არ ჩანს; ჩართულზე — პირველ გახსნაზე age/consent გადამოწმება (`module_user.settings.consent_at`) და „დამალვის" ღილაკი.

---

## 12. დამტკიცებული გადაწყვეტილებები (2026-08-28)

| # | კითხვა | გადაწყვეტილება |
|---|---|---|
| 1 | მფლობელობის მოდელი | **ვარიანტი A** — per-user რიგები (`movies.user_id` / `series.user_id`). |
| 2 | Auth რეჟიმი | **ქუქები** — Sanctum SPA stateful session. |
| 3 | რეგისტრაცია | **ღიაა**, მაგრამ ანგარიში ცარიელია: **მოდულებზე მოთხოვნა იგზავნება ადმინთან** და ის რთავს. |
| 4 | ჟანრები | **სრულიად გლობალური** (per-user `user_id` **არ** დაემატა). მომხმარებელს წაშლა შეუძლია, მაგრამ **მოთხოვნა ადმინთან მიდის დასადასტურებლად**. |
| 5 | არსებული 280 ჩანაწერი | მიება **პირველ super_admin-ს** (id=1). |
| 6 | API-ის დახურვა | მისაღებია — ყოველი გახსნა login-ს მოითხოვს (auto-login დროშა არ გაკეთდა). |
| 7 | ეტაპების რიგი | **1→2→3→4→5 მიყოლებით.** |

### 12.1 რა შეიცვალა თავდაპირველ გეგმასთან შედარებით

პასუხებმა #3 და #4 გეგმას ერთი ცხრილი დაამატა — **`approval_requests`** (§4.1-ის ნაცვლად, სადაც
მოთხოვნების ცნება საერთოდ არ იყო):

- `type` = `module_access` \| `genre_delete`; `status` = `pending|approved|rejected`;
  `payload` (ჟანრის შემთხვევაში `reassign_to`, `force` და **გლობალური** მთვლელები),
  `reviewed_by` / `reviewed_at` / `review_note`.
- ერთი ცხრილი ორივე ნაკადზე — ახალი ტიპი = ერთი enum-მნიშვნელობა + handler
  (`AdminRequestController::approveModule()` / `approveGenreDelete()`).
- `modules.enabled_by_default` **false**-ია ორივე მოდულზე: ახალი ანგარიში ცარიელია
  და `/modules` გვერდიდან ითხოვს ჩართვას.
- `genres` ცხრილს `user_id` **არ** დაემატა (§4.1-ის წინადადება უარყოფილია პასუხით #4).
  ჟანრის წაშლა/გადაბმა `GenreRemover`-ში გადავიდა, სადაც `owner` scope **განზრახ ითიშება** —
  გლობალური ჟანრის წაშლა ყველა მომხმარებლის მიბმას ეხება, ამიტომ მთვლელებიც გლობალურია.

### 12.2 იმპლემენტაციის სტატუსი

ხუთივე ეტაპი **შესრულებულია** (იხ. `Tasks.md` სექცია I), მასზე დაშენდა **I5 — ვიდეოს მოდული**.
გადამოწმებული: `php artisan test` → **18/18**; `npm run build` → წარმატებით; API-ს ხელით
შემოწმება ორ ანგარიშზე (იზოლაცია, მოდულის gate, მოთხოვნა→დადასტურება, ჟანრის წაშლის ნაკადი,
18+ დაფარვა).

### 12.3 რა დაზუსტდა I5-ის გაკეთებისას

- **sensitive მოდული super_admin-საც აშკარად ერთვება.** თავდაპირველი წესი („ადმინს ყველა
  მოდული აქვს") 18+-ზე არასწორი აღმოჩნდა — „default off" სხვაგვარად ირღვეოდა.
  `User::hasModule()`/`enabledModules()` ახლა sensitive-ს მხოლოდ pivot-ით აძლევს.
- **არა-მედია მოდულს ფრონტზე ორი რეესტრი სჭირდება** (§7.2-ის „dinamiuri MEDIA"-ს ნაცვლად):
  `PAGE_MODULE_KEYS` (`lib/modules.tsx`) და `MODULE_PAGES` (`App.tsx`). მედია-დომენებს
  (`movie`/`series`/მომავალი `anime`) კოდი კვლავ არ სჭირდება — მათ generic გვერდები ემსახურება.
- **`ModalShell` გავიდა `components/ui/modal-shell.tsx`-ში** (იყო `GenresPage`-ის ლოკალური),
  რომ ვიდეოს ფორმასაც გამოეყენებინა.
