# Tasks

აუდიტი 2026-09-17 (`audit-spec.md`-ის მიხედვით). ყველა `path:line` რეპოს root-იდანაა და `sed -n`-ით დადასტურებულია. კოდი არ შეცვლილა — ეს ფაილი ერთადერთი გამოსავალია.

**შესრულება (2026-09-17-დან):** ტასკები სათითაოდ სრულდება, ყოველ შემდეგზე გადასვლა — მხოლოდ ნებართვით. შესრულებული ტასკი **არ იშლება**: მას სტატუსი ეძლევა (ცხრილის ბოლო სვეტი + ტასკის `სტატუსი` ველი), `path:line`-ები კი აუდიტის მომენტს ასახავენ და შესწორებების შემდეგ შეიძლება გადაიწიონ.
სტატუსი: ⬜ ღია · 🟡 ნაწილობრივ (რჩება ნებართვა ან შენი ქმედება) · ✅ შესრულებულია

## Summary
| ID | ტიტული | severity | ტიპი | estimate | სტატუსი |
|----|---------|----------|------|----------|----------|
| SEC-01 | პროდ-ბაზის dump პაროლის ჰეშებით, `remember_token`-ებით, სესიით და პირადი ჩატით git-ში და GitHub-ზეა | Critical | security | M | 🟡 ნაწილობრივ |
| SEC-02 | `admin:users` უფლების მქონე თავის თავს `super_admin`-ად აქცევს | Critical | security | S | ✅ შესრულებულია |
| SEC-03 | `admin:roles` უფლების მქონე საკუთარ როლს `admin:*` უფლებებს ამატებს (ესკალაციის ჯაჭვი SEC-02-ში) | High | security | S | ⬜ |
| SEC-04 | ჩატის მიმაგრებული ფაილი კლიენტის `Content-Type`-ით `inline` ბრუნდება — cross-account stored XSS | High | security | M | ⬜ |
| SEC-05 | SVG დაშვებულია custom-field ფაილად და საჯარო დისკზე ხვდება — stored XSS API-ს origin-ზე | High | security | S | ⬜ |
| SEC-06 | ცოცხალი TMDB API გასაღები `.env.example`-შია (origin/main-ზეც) | High | security | S | 🟡 ნაწილობრივ |
| SEC-07 | `POST /gallery/images/move` უფლებას `create`-ად კითხულობს, კომენტარი კი „ცხადს" ამტკიცებს | High | security | S | ⬜ |
| SEC-12 | Telegram-ის ბოტის ტოკენი `module_user.settings`-ში ღია ტექსტადაა და `GET /api/modules` მას ბრაუზერს უბრუნებს (SEC-01-ის შესრულებისას ნაპოვნი) | High | security | S | ⬜ |
| BUG-01 | დადასტურების დიალოგის ღილაკები ქართულად არის hardcoded — ინგლისურ UI-შიც | High | bug | S | ⬜ |
| GAP-01 | backend-ის 26 მანქანური კოდი ფრონტში არ ითარგმნება — toast-ში snake_case ჩანს | High | gap | M | ⬜ |
| GAP-02 | 419 (CSRF/სესიის ვადა) და ქსელის ჩავარდნა axios-ში არ მუშავდება | High | gap | S | ⬜ |
| PERF-01 | `User::hasModule()` ყოველ გამოძახებაზე DB-ს ეკითხება და ციკლებშია | High | performance | S | ⬜ |
| PERF-02 | `PublicGallery::publicCastIds()` — N+1 ავტორიზაციის გარეშე endpoint-ზე | High | performance | S | ⬜ |
| PERF-03 | `usedByModule()` ყოველ ატვირთვაზე მომხმარებლის მთელ ფაილ-ინვენტარს აგებს | High | performance | M | ⬜ |
| DEBT-01 | TypeScript `strict` მთელ აპში გამორთულია | High | debt | M | ⬜ |
| SEC-08 | ჩანაწერის/custom-field ფაილიც კლიენტის MIME-ს `inline` აბრუნებს | Medium | security | S | ⬜ |
| SEC-09 | `GET/DELETE /batches/{batch}` მფლობელობას არ ამოწმებს | Medium | security | S | ⬜ |
| BUG-02 | საჯარო ალბომის unlock სესიის გარეშე უხმაუროდ არაფერს აკეთებს და პაროლის ორაკული ხდება | Medium | bug | S | ⬜ |
| BUG-03 | `AlbumVault::relocate()` — ფაილის გადატანა DB-ტრანზაქციაშია, რომელიც მას ვერ აბრუნებს; არარსებულ ფაილზეც `path` იწერება | Medium | bug | M | ⬜ |
| BUG-04 | ალბომის წაშლა: vault → images update → delete სამი დაუცველი ნაბიჯია | Medium | bug | S | ⬜ |
| BUG-05 | ლექსიკონის „გადატანა" query-builder `update()`-ით მოდელის ჰუკებს გვერდს უვლის (`watched_at`, audit) | Medium | bug | M | ⬜ |
| BUG-06 | მასობრივი visibility-ცვლილება audit-ლოგში არ ჩანს | Medium | bug | S | ⬜ |
| BUG-07 | `ChatService::between()` — check-then-create race ორმაგ საუბარს ქმნის | Medium | bug | S | ⬜ |
| BUG-08 | `RunBatchItem` ყველა გამონაკლისს ყლაპავს — პარტია არასდროს „ჩავარდნილია" | Medium | bug | M | ⬜ |
| BUG-09 | `notes:remind`-ის `withoutOverlapping()` ვადის გარეშე 24 სთ-ით აჩერებს შეხსენებებს | Medium | bug | S | ⬜ |
| BUG-10 | toast-ის ავტო-დახურვის ტაიმერი პროვაიდერის ყოველ რენდერზე თავიდან იწყება | Medium | bug | S | ⬜ |
| BUG-11 | `key={i}` წაშლადი/გადაადგილებადი სტრიქონებზე სამ ფორმაში | Medium | bug | S | ⬜ |
| PERF-04 | `AdminModuleController::index()` — eager load იკარგება, N_users × N_modules × 2 query | Medium | performance | S | ⬜ |
| PERF-05 | Dashboard ~27 სერიული query ყოველ გახსნაზე | Medium | performance | M | ⬜ |
| PERF-06 | `MatchService::ranking()` ყოველ კანდიდატზე `modules`-ს თავიდან კითხულობს | Medium | performance | S | ⬜ |
| PERF-07 | `ModulePage` `DataTable`-ს არა-memo `columns`-ს აწვდის | Medium | performance | S | ⬜ |
| PERF-08 | ორივე ლოკალის JSON (360 kB) საწყის bundle-შია | Medium | performance | M | ⬜ |
| PERF-09 | პირადი დისკის grid „ყველა" რეჟიმში 1000 blob-XHR-მდე უშვებს | Medium | performance | M | ⬜ |
| GAP-03 | პარამეტრების შენახვის ჩავარდნა უხმაუროდ იყლაპება | Medium | gap | S | ⬜ |
| GAP-04 | read-only probe endpoint-ები POST-ია და `create` უფლებას ითხოვენ | Medium | gap | S | ⬜ |
| DEBT-02 | `ActorWebPhotos.tsx`-ში ნამდვილი NUL ბაიტებია — ფაილს git/grep ბინარულად კითხულობს | Medium | debt | S | ⬜ |
| DEBT-03 | ახალი `PublicProfileController::photoFile()` (uncommitted) ტესტის გარეშეა | Medium | debt | S | ⬜ |
| DEBT-04 | `mediary:storage-recalc` ტესტის გარეშეა | Medium | debt | S | ⬜ |
| DEBT-05 | შეხსენების ორმაგი გაშვების claim ტესტით არ არის დაცული | Medium | debt | S | ⬜ |
| DEBT-12 | `NoteReminders.test.ts` სრულ `npm test`-ში 5-წამიან ტაიმაუტზე ცვივა (ცალკე გადის) — CI-ს flaky-ს ხდის (SEC-02-ის შესრულებისას ნაპოვნი) | Medium | debt | S | ⬜ |
| SEC-10 | `roles.permissions = NULL` „ყველაფერს" ნიშნავს და სვეტი nullable-ია | Low | security | S | ⬜ |
| SEC-11 | `.env.example` `APP_DEBUG=true`-თი და `SESSION_SECURE_COOKIE`-ს გარეშე | Low | security | S | ⬜ |
| BUG-12 | `updateOrInsert` ყოველ რედაქტირებაზე `created_at`-ს გადაწერს | Low | bug | S | ⬜ |
| BUG-13 | `deleteResolved()`-ის custom-field ბრანჩი: დისკი + მრიცხველი + row ტრანზაქციის გარეშე | Low | bug | S | ⬜ |
| BUG-14 | `errorMessage()` 422-ზე ვალიდაციის ტექსტს კოდზე წინ აყენებს | Low | bug | S | ⬜ |
| BUG-15 | ექსპორტის ფაილის სახელი `toISOString()`-ით — ღამით გუშინდელი თარიღი | Low | bug | S | ⬜ |
| PERF-10 | `PurgeService::run()` plan-ს და id-სეტს ორჯერ ითვლის | Low | performance | S | ⬜ |
| PERF-11 | `AllPhotosCut`-ის `useMemo` ახალი `{}`-ით ყოველ რენდერზე ცვივა | Low | performance | S | ⬜ |
| PERF-12 | `noteReminders` ყოველ poll-ზე მთელ `['notes']` ქეშს ინვალიდირებს | Low | performance | S | ⬜ |
| PERF-13 | `PhotoTile` ყოველ გახსნილ URL-ზე მთელ grid-ს ხელახლა ხატავს | Low | performance | S | ⬜ |
| GAP-05 | Root `README.md` ორმოდულიან Laravel 11 / React 18 აპს აღწერს | Low | gap | S | ⬜ |
| GAP-06 | საჯარო როუტების ინვენტარი კომენტარსა და CLAUDE.md-ში მოძველებულია („ორი, read-only") | Low | gap | S | ⬜ |
| GAP-07 | `PUBLIC_PROFILES=false` `/matches`-ს არ თიშავს | Low | gap | S | ⬜ |
| GAP-08 | გახსნილი ჩაკეტილი ალბომის ფოტო `Cache-Control`-ის გარეშე ბრუნდება | Low | gap | S | ⬜ |
| GAP-09 | ლექსიკონის წაშლისას `move_to: null`, გამოტოვება და self ერთსა და იმავეს ნიშნავს — გადაწყვეტილება სჭირდება | Low | gap | S | ⬜ |
| DEBT-06 | CLAUDE.md-ის „visibility-ს UI არ აქვს" ფრაზები მოძველებულია | Low | debt | S | ⬜ |
| DEBT-07 | ექვსი ექსპორტი `src/lib`-ში არსად არ გამოიყენება | Low | debt | S | ⬜ |
| DEBT-08 | 11 `eslint-disable react-hooks/exhaustive-deps` კომენტარი პროექტში, სადაც ESLint არ არის | Low | debt | S | ⬜ |
| DEBT-09 | `settle()` state-updater-ში side effect-ს აკეთებს (StrictMode-ში ორჯერ) | Low | debt | S | ⬜ |
| DEBT-10 | `backend/README.md` და `frontend/README.md` ფრეიმვორკის boilerplate-ია | Low | debt | S | ⬜ |
| DEBT-11 | `AuditRegistry::MODELS`-ში `UserCredential`/`DatabaseBackup`-ის არყოფნა დაუსაბუთებელია | Low | debt | S | ⬜ |
| FEAT-01 | ტესტი: backend-ის ყველა მანქანური კოდი ⊆ `CODES` ⊆ ორივე ლოკალი | Backlog | feature | S | ⬜ |
| FEAT-02 | `mediary:seed-demo` — ანონიმური საჩვენებელი მონაცემები კომიტებული dump-ის ნაცვლად | Backlog | feature | M | ⬜ |
| FEAT-03 | პარტიის თითო ერთეულის შედეგი (`ok`/`skipped`/`failed` + მიზეზი) და მისი ჩვენება SPA-ში | Backlog | feature | M | ⬜ |
| FEAT-04 | ალბომის პაროლის წარუმატებელი ცდების DB-მრიცხველი და დროებითი დაბლოკვა | Backlog | feature | S | ⬜ |
| FEAT-05 | `mediary:doctor` — ბინარების, scheduler-ის და storage-მრიცხველის დრიფტის ერთი შემოწმება | Backlog | feature | M | ⬜ |

## Critical

### [SEC-01] პროდ-ბაზის dump პაროლის ჰეშებით, `remember_token`-ებით, სესიით და პირადი ჩატით git-ში და GitHub-ზეა
- **სტატუსი:** 🟡 ნაწილობრივ შესრულებულია (2026-09-17) — რეპოს და ბაზის მხარე მზადაა; რჩება **მხოლოდ შენი ქმედება**: ორივე ანგარიშის პაროლის შეცვლა და Telegram ტოკენის გაუქმება (BotFather → `/revoke`) + ახალის ჩაწერა `/credentials`-ში.
  - ✅ `git rm --cached` — dump-ი git-ში ვეღარ track-დება, ლოკალური ფაილი (4.7 MB) დისკზე დარჩა და ignore-დება
  - ✅ ისტორია გადაიწერა (`git filter-branch`, SEC-06-თან ერთ ნაბიჯში): dump-ი 46-ივე კომიტიდან ამოვიდა, ორი მხოლოდ-dump კომიტი (`Refresh the committed DB dump`, `…after the §10/§11 migrations`) გაქრა → 44 კომიტი; ყოველი ახალი კომიტი ძველს ემთხვევა dump-ის, `.env.example`-ის გასაღებ-ხაზის და ერთ ადგილას Tasks.md-ის გარდა (ავტორები/თარიღები უცვლელი). `git push --force-with-lease` (`f730e0d` → `42350d0`) — `origin/main` ახლა ახალ ისტორიაზეა
  - ✅ `UPDATE users SET remember_token = NULL` (2 ანგარიში) + `sessions` გასუფთავდა (3 სესია) — ყველა ხელახლა შედის
  - ⚠️ **ძველ მანქანაზე (ან ნებისმიერ ძველ კლონში) `git push` არ გააკეთე** — ძველი ისტორია dump-ითა და გასაღებით თავიდან აიტვირთება. იქ: ლოკალური ცვლილებების შენახვა → `git fetch && git reset --hard origin/main` (ან ახალი კლონი)
  - ℹ️ ლოკალურ reflog-ში ძველი კომიტები ~90 დღე რჩება (`git reflog expire --expire=now --all && git gc --prune=now` — შეუქცევადი, სურვილისამებრ); GitHub-ზე ძველი კომიტი SHA-ით კეში ვადამდე შეიძლება გაიხსნოს — სრულ purge-ს GitHub Support აკეთებს
  - ✅ `.gitignore` ყველა `*.sql`/`*.sql.gz`-ს ბლოკავს (dump-ი ხეში სადაც არ უნდა იყოს)
  - ✅ `setup.sh`/`setup.ps1` dump-ის ნაცვლად `php artisan migrate --seed`-ს იძახის და `mediary:bootstrap-admin`-სა და `/backups`-ზე მიუთითებს; ცარიელ MySQL-ბაზაზე ბოლომდე დადასტურდა (84 ცხრილი, 11 მოდული, 31 ჟანრი; სატესტო ბაზა შემდეგ წაიშალა)
  - ✅ ამ დადასტურებისას ნაპოვნი და გასწორებული: (a) XAMPP-ის MariaDB-ს `default_storage_engine` MyISAM-ია, ე.ი. ცარიელ ბაზაზე `migrate` პირველსავე ცხრილზე ცვიოდა (`max key length is 1000 bytes`) — `config/database.php`-ში `'engine' => env('DB_ENGINE', 'InnoDB')`; (b) `setup.ps1` Windows PowerShell 5.1-ზე საერთოდ არ პარსირდებოდა (em dash-ის UTF-8 ბაიტები Windows-1252-ში `”`-ად იკითხება) — ფაილი ASCII-ია; (c) `--no-interaction` `--force`-ის გარეშე ბაზის შექმნას თიშავს, ამიტომ სკრიპტები მას არ იყენებენ
  - ✅ README.md, `backend/.env.example` და CLAUDE.md ახალ წესს აღწერენ
  - ⏳ ორივე ანგარიშის პაროლის შეცვლა და Telegram ტოკენის როტაცია — მხოლოდ შენ. ⚠️ ტოკენი dump-ში **ღია ტექსტადაც** იყო (`module_user.settings`, 46 სიმბოლო, 4 კომიტებულ ვერსიაში) — ე.ი. `APP_KEY` არ სჭირდებოდა, ისტორიის გადაწერა კი უკვე push-ილ ასლს არ აბრუნებს; იხ. SEC-12
  - ℹ️ `api.github.com/repos/davitkifshidze/Mediary` ავტორიზაციის გარეშე 404-ს აბრუნებს — repo, სავარაუდოდ, **პრივატულია** (აუდიტი საჯაროს ვარაუდობდა). რისკი ნაკლებია, მაგრამ ისტორია საიდუმლოებს კვლავ ატარებს.
- **ტიპი:** security
- **სად:** `backend/mediary_backup.sql:2990` (users), `:2585` (sessions), `:1762` (messages), `:2944` (user_credentials); remote `origin/main`-ზეც
- **პრობლემა:** `INSERT INTO \`users\`` სტრიქონი ორი რეალური ანგარიშის ელფოსტას, bcrypt-ჰეშს და 60-სიმბოლოიან `remember_token`-ს შეიცავს; `sessions`-ში დღევანდელი სესიის id-ა (`last_activity` 1789589889), `messages`-ში პირადი მიმოწერა, `user_credentials`-ში დაშიფრული Telegram ტოკენი. ფაილი 7 კომიტში განახლდა და `git ls-tree origin/main` ადასტურებს, რომ GitHub-ზეა (`README.md:26` საჯარო repo-ს ასახელებს).
- **რატომ:** `remember_token` ავთენტიფიკაციის credential-ია — `remember_web_*` ქუქის შეთხზვით სუპერ-ადმინად შესვლა პაროლის გარეშე შეიძლება; სესიის id ვადის ამოწურვამდე hijack-ისთვის გამოსადეგია; ჰეშები offline brute-force-ისთვის; ელფოსტები და მიმოწერა პერსონალური მონაცემია.
- **გადაწყვეტა:** `/backend/mediary_backup.sql` `.gitignore`-ში; ისტორიიდან ამოღება (`git filter-repo --path backend/mediary_backup.sql --invert-paths` + force-push); ორივე მომხმარებლის პაროლის შეცვლა, `UPDATE users SET remember_token = NULL`, `sessions` ცხრილის გასუფთავება, Telegram ტოკენის როტაცია; `README.md:94`/`setup.sh` და `backup.ps1` ისე გადაკეთდეს, რომ კომიტებული dump საერთოდ არ იყოს (იხ. FEAT-02).
- **Acceptance criteria:**
  - [x] `git ls-files | grep mediary_backup.sql` ცარიელს აბრუნებს ყველა ბრენჩზე და ისტორიაში (`git log --all -- backend/mediary_backup.sql` → 0)
  - [ ] ორივე ანგარიშის პაროლი შეცვლილია, `remember_token`-ები `NULL`-ია, `sessions` ცარიელია — ✅ ტოკენები `NULL`, ✅ `sessions` ცარიელი; ⏳ პაროლები (შენ)
  - [ ] Telegram ტოკენი გადახალისებულია და ძველი Telegram-ის მხრიდან გაუქმებულია
  - [x] `setup.sh`/`setup.ps1` dump-ის ნაცვლად `migrate --seed`-ს ან ანონიმურ seed-ს იყენებს
- **Estimate:** M
- **დამოკიდებულება:** none

### [SEC-02] `admin:users` უფლების მქონე თავის თავს `super_admin`-ად აქცევს
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `Role::exceedsAdmin()` + `AdminUserController::outranks()`: ახალი `role_id`, რომელიც `super_admin`-ია ან ისეთ `admin:<resource>`-ს აძლევს, რაც მოქმედს არ აქვს → **403 `role_escalation`**; `super_admin` ყველაფერს გადის. ⚠️ ჯერ ესკალაცია, მერე „საკუთარი" — ე.ი. საკუთარ თავს `super_admin`-ად მინიჭება 403-ია (acceptance-ის მოთხოვნა), სხვა საკუთარ როლზე გადასვლა კი **422 `cannot_change_own_role`** (`super_admin`-ზეც; იგივე მნიშვნელობის გამოგზავნა ცვლილება არაა)
  - ✅ **დამატებით, იმავე ხვრელის მეორე კარი:** მაღლა მდგომ ანგარიშს (მაგ. `super_admin`-ს) `admin:users`-ის მქონე ვეღარ ათიშავს, ვეღარ უცვლის კვოტას/მოდულებს და ვეღარ **შლის** (`DELETE` მთელ ბიბლიოთეკას შლიდა) — `update`/`syncModules`/`destroy`, 403 `role_escalation`
  - ⚠️ **გადაწყვეტილება, რომელიც აუდიტის ფორმულირებიდან განსხვავდება:** „უფლებებით აღემატება" მხოლოდ **ადმინ-ძალაუფლებას** ადარებს (`super_admin` + `admin:*`), მოდულების CRUD-ს — არა. მოდულის უფლება მხოლოდ საკუთარ ბიბლიოთეკაზე მოქმედებს, და მისი დათვლა `admin:users`-ის მქონეს (მოდულების უფლების გარეშე) ჩვეულებრივ `user` როლის მინიჭებას და ჩვეულებრივ მომხმარებლების მართვას აკრძალავდა — ფიქსი სექციას გამოუსადეგარს გახდიდა
  - ✅ `User::effectiveRole()` — „როლის გარეშე → `user`" ფოლბექი სამ ადგილას იწერებოდა; ახლა ერთია, და შედარება ზუსტად იმ როლს ადარებს, რასაც `hasPermission()` ამოწმებს
  - ✅ `RoleApiTest`-ში 6 ახალი ტესტი (საკუთარი დაწინაურება · სხვის დაწინაურება · `admin:audit`-ის მიცემა vs ჩვეულებრივ `user` როლი · საკუთარი როლი · სუპერ-ადმინის გათიშვა/მოდულები/წაშლა · ჩვეულებრივი მართვა კვლავ მუშაობს). **მუტაციის შემოწმება:** დაცვის დროებით გამორთვაზე 4 ტესტი წითლდება
  - ✅ SPA: `role_escalation`/`cannot_change_own_role` `CODES`-შია და ორივე ლოკალში; `UserPage`-ზე საკუთარი როლის ველი გათიშულია (+ ახსნა), `super_admin` როლი სიაში მხოლოდ `super_admin`-ს ჩანს — მოხერხებულობა, დაცვა სერვერშია
  - ✅ backend 696/696 (6 ახალი), `npm run build`, oxlint და Pint მწვანეა; ყველა `CODES` ორივე ლოკალშია, ლოკალებს შორის დრიფტი 0 (Node-ით — Python ამ მანქანაზე არ არის, `audit.py` არ ეშვება)
  - ℹ️ frontend Vitest: 118–119/125 — `NoteReminders.test.ts`-ის 6–7 ტესტი სრულ რანში ცვივა, **SEC-02-ის ცვლილებების stash-ის შემდეგაც** (ე.ი. უწინდელია), ცალკე კი 7/7 გადის → ჩაიწერა DEBT-12-ად
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/Admin/AdminUserController.php:149`, `:164-173`; როუტი `backend/routes/api.php:875-879`
- **პრობლემა:** `PATCH /admin/users/{user}` `admin_access:users`-ის უკანაა (არა `super_admin`). ვალიდაცია `'role_id' => ['sometimes','integer', Rule::exists('roles','id')]`-ია, `wouldOrphanAdmins()` კი მხოლოდ *ჩამოქვეითებას* იცავს — *დაწინაურებას* არაფერი. `$user->forceFill($data)->save()` ნებისმიერ `role_id`-ს იღებს, საკუთარ ანგარიშზეც.
- **რატომ:** `admin:users` უფლების მქონე ერთ მოთხოვნით (`role_id = <super_admin>`) იღებს `/admin/purge`-ს (სხვისი ბიბლიოთეკის წაშლა), `/admin/backups`-ს (მთელი ბაზა ჰეშებით და ჩატით) და orphan-cleanup-ს.
- **გადაწყვეტა:** `update()`-ში: თუ `role_id` ისეთ როლზე მიუთითებს, რომელიც `isSuperAdmin()`-ია ან უფლებებით მოქმედს აღემატება — 403 `role_escalation`, გარდა იმ შემთხვევისა, თუ მოქმედი თვითონ `super_admin`-ია; საკუთარი `role_id`-ს შეცვლა ყოველთვის 422 `cannot_change_own_role`.
- **Acceptance criteria:**
  - [x] `admin:users` როლით `PATCH /admin/users/{self}` `role_id=super_admin` 403-ს აბრუნებს
  - [x] `admin:users` როლით სხვა მომხმარებლის `super_admin`-ად დაწინაურება 403-ია; `super_admin`-ს კვლავ შეუძლია
  - [x] ორივე შემთხვევა `RoleApiTest`/`OwnershipTest`-ში ტესტითაა დაცული
- **Estimate:** S
- **დამოკიდებულება:** none

## High

### [SEC-03] `admin:roles` უფლების მქონე საკუთარ როლს `admin:*` უფლებებს ამატებს
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/Admin/AdminRoleController.php:43-55` (`cleanPermissions()`-ის allow-list `:106-111`)
- **პრობლემა:** `update()` მხოლოდ `super_admin` როლს იცავს (`! $role->isSuperAdmin()`), მაგრამ `cleanPermissions()` `admin:users`/`admin:roles`/`admin:requests`/`admin:audit` გასაღებებს უშვებს. `admin:roles.update`-ის მქონე `PUT /admin/roles/{own role}`-ით საკუთარ როლს `{"admin:users":["update"]}` ამატებს — და SEC-02-ის გზით `super_admin` ხდება. `store()`-საც იგივე ხვრელი აქვს.
- **რატომ:** ერთი სექციის უფლება (`admin:roles`) სრულ ადმინ-ზონამდე ესკალირდება — ზუსტად ის, რასაც `OwnershipTest::test_module_permissions_never_open_the_admin_zone` კრძალავს, მხოლოდ სხვა კარიდან.
- **გადაწყვეტა:** `admin:*` გასაღების მინიჭება მხოლოდ `super_admin`-ს შეეძლოს; მოქმედს საკუთარი როლის `permissions`-ის რედაქტირება აეკრძალოს (422 `cannot_edit_own_role`); `store()`-ზეც იგივე წესი.
- **Acceptance criteria:**
  - [ ] `admin:roles` როლით საკუთარ როლზე `admin:users`-ის დამატება 403/422-ია
  - [ ] `admin:roles` როლით ახალი როლის შექმნა `admin:*` გასაღებით 403-ია; `super_admin`-ს შეუძლია
  - [ ] `RoleApiTest`-ში ორივე შემთხვევა დაფარულია
- **Estimate:** S
- **დამოკიდებულება:** SEC-02

### [SEC-04] ჩატის მიმაგრებული ფაილი კლიენტის `Content-Type`-ით `inline` ბრუნდება — cross-account stored XSS
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/ChatController.php:421-428` (ვალიდაცია), `:438` (`getClientMimeType()`), `:462-467` (`response(..., 'inline')`)
- **პრობლემა:** დოკუმენტის ტიპი `['file', 'max:…']`-ია — ფორმატი არ იზღუდება; `attachment_mime` კლიენტის multipart ჰედერიდან იწერება და `file()` მას `Content-Type`-ად `inline`-ით აბრუნებს. A აგზავნის `.html`-ს `text/html`-ით → B-ს ბრაუზერში დოკუმენტად API-ს origin-ზე იხატება, B-ს ქუქით.
- **რატომ:** same-origin სკრიპტი `/sanctum/csrf-cookie`-ს იღებს და B-ს სახელით ნებისმიერ endpoint-ს უძახის — ანგარიშის მიტაცება ჩატის ერთი შეტყობინებით. მონაწილეობის შემოწმება არ შველის: B ლეგიტიმური მონაწილეა.
- **გადაწყვეტა:** კლიენტის MIME არასდროს დაბრუნდეს — სერვერზე `finfo`/`$disk->mimeType()`-ით განისაზღვროს; რენდერ-უსაფრთხო allow-list-ის (`image/jpeg|png|gif|webp`, `video/mp4|webm`, `application/pdf`) გარეთ ყველაფერი `application/octet-stream` + `Content-Disposition: attachment`; გლობალურად `X-Content-Type-Options: nosniff`.
- **Acceptance criteria:**
  - [ ] `text/html`-ად გამოგზავნილი ფაილი `attachment`-ით და `octet-stream`-ით ბრუნდება
  - [ ] JPEG/PDF კვლავ `inline` იხატება
  - [ ] ყველა `file`-პასუხს `X-Content-Type-Options: nosniff` აქვს
  - [ ] `ChatParityTest`-ში ტესტი: შეთხზული MIME სერვერის პასუხში არ ჩანს
- **Estimate:** M
- **დამოკიდებულება:** none

### [SEC-05] SVG დაშვებულია custom-field ფაილად და საჯარო დისკზე ხვდება — stored XSS API-ს origin-ზე
- **ტიპი:** security
- **სად:** `backend/app/Support/CustomFields.php:54`; დისკის წესი `backend/app/Support/StorageFolder.php:154`, `:169`
- **პრობლემა:** `FILE_MIMES`-ში `svg`-ა; `CustomFieldService::storeFile()` ფაილს `<module>/fields`-ში წერს, რაც `PRIVATE_ROOTS`/`PRIVATE_FOLDERS`-ში არ არის (`notes`, `chat`, `backups` და ორი ქვესაქაღალდე მხოლოდ). ატვირთული `.svg` `/storage/movies/fields/<name>.svg`-ზე `image/svg+xml`-ით ავტორიზაციის გარეშე იხსნება და ბრაუზერი მასში სკრიპტს ასრულებს. (`UploadLimits`-ის `image` წესი SVG-ს გამორიცხავს — ხვრელი მხოლოდ აქაა.)
- **რატომ:** `/storage/*`-ის საჯაროობა შეგნებული წესია, აქტიური კონტენტის ფორმატი კი ამ დისკზე — არა; სკრიპტი API-ს origin-ზე ნებისმიერი ავტორიზებული მნახველის სესიით მოქმედებს.
- **გადაწყვეტა:** `svg` `FILE_MIMES`-იდან ამოღება; თუ საჭიროა — სერვერზე სანიტიზაცია + `text/plain`/`attachment`-ით მიწოდება მხოლოდ API-როუტიდან.
- **Acceptance criteria:**
  - [ ] `POST /custom-fields/{module}/{id}/file` `.svg`-ზე 422-ს აბრუნებს
  - [ ] `CustomFieldsTest`-ში ტესტი, რომ არც ერთი აქტიური-კონტენტის MIME `FILE_MIMES`-ში არ არის
- **Estimate:** S
- **დამოკიდებულება:** none

### [SEC-06] ცოცხალი TMDB API გასაღები `.env.example`-შია (origin/main-ზეც)
- **სტატუსი:** 🟡 ნაწილობრივ შესრულებულია (2026-09-17, SEC-01-თან ერთად, შენი ნებართვით) — რჩება **მხოლოდ შენი ქმედება**: themoviedb.org-ზე ძველი გასაღების გაუქმება/ახალის აღება და ახალის ჩაწერა `backend/.env`-ში (ან `/credentials`-ში). ⚠️ ამდე ძველი გასაღებს `backend/.env`-ში **ნუ წაშლე** — აპი TMDB-ს მასზე ეყრდნობა.
  - ✅ `backend/.env.example`: `TMDB_API_KEY=` ცარიელია + კომენტარი, რომ ამ ფაილში რეალური გასაღები არასდროს ჩაიწეროს
  - ✅ ისტორია: გასაღები 46-ივე კომიტის `.env.example`-იდან და აუდიტის კომიტის Tasks.md-იდან ამოვიდა (იგივე `filter-branch` + force-push, რაც SEC-01-ში); სრული გასაღებიც და მისი 8-სიმბოლოიანი პრეფიქსიც `git grep`-ით 0 blob-ში
  - ✅ ამ ფაილიდანაც ამოიღოს (აუდიტის ტექსტი მას სრულად შეიცავდა)
  - ℹ️ ისტორიის დანარჩენი ნაწილი სხვა საიდუმლოებზეც მოწმდა (Google `AIza…`, Telegram ტოკენის ფორმატი, bcrypt, `*_API_KEY=`, `APP_KEY=base64:`, `remember_token`) — dump-ის გარეთ არაფერი
- **ტიპი:** security
- **სად:** `backend/.env.example:76`
- **პრობლემა:** `TMDB_API_KEY=<32 hex სიმბოლო; 2026-09-17-ს ამ ფაილიდანაც ამოიღოს>` — ის იგივე მნიშვნელობაა, რაც `backend/.env`-ში (grep-ით დადასტურდა), ისტორიაშია `92e4872`-დან და `origin/main:backend/.env.example:74`-ზეც არის. ყველა სხვა გასაღები ფაილში სწორად ცარიელია.
- **რატომ:** საჯარო repo-ში გასაღები ანგარიშს ეკუთვნის: სხვისი მოხმარება მის rate-limit-ს ხარჯავს და TMDB-ს ToS-ს არღვევს; `.env.example` არის ის ფაილი, რომელსაც `setup.sh` `.env`-ად კოპირებს.
- **გადაწყვეტა:** მნიშვნელობა ცარიელი დარჩეს (`TMDB_API_KEY=`), გასაღები themoviedb.org-ზე გადახალისდეს, ისტორიიდან SEC-01-თან ერთად ამოიღოს.
- **Acceptance criteria:**
  - [x] ძველი გასაღები (`backend/.env`-ის მნიშვნელობა როტაციამდე) `git grep -F "<გასაღები>" $(git rev-list --all)`-ით არსად არ ჩანს — ⚠️ გასაღები ამ ფაილში არ იწერება
  - [ ] TMDB-ზე ძველი გასაღები გაუქმებულია, ახალი მხოლოდ `backend/.env`-შია
- **Estimate:** S
- **დამოკიდებულება:** SEC-01

### [SEC-07] `POST /gallery/images/move` უფლებას `create`-ად კითხულობს, კომენტარი კი „ცხადს" ამტკიცებს
- **ტიპი:** security
- **სად:** `backend/app/Http/Middleware/EnsureModulePermission.php:26`, `:47-57`; `backend/routes/api.php:626`, `:645-650`, `:672`
- **პრობლემა:** ჯგუფის middleware შიშველი `permission:gallery`-ა (მოქმედების არგუმენტის გარეშე), `UPDATE_ENDPOINTS`-ში `move` არ არის → `actionFor()` POST-ს `create`-ად კითხულობს. კომენტარი `:648-650` ამბობს, რომ „უფლება ცხადად `gallery` მოდულზეა" — ეს არასწორია.
- **რატომ:** create-only როლი არსებული ფოტოებს გადაარჭიმავს (ჩაკეტილ ალბომში/ალბომიდან ჩათვლით — ე.ი. დამალვა/გამოჩენა), view+update როლი კი უსაფუძვლო 403-ს იღებს — ზუსტად §A4-ის შეცდომა, რომელიც `/media/sync/{type}/{id}`-ზე გასწორდა.
- **გადაწყვეტა:** როუტს `->middleware('permission:gallery,update')` (წესი „მოქმედება მხოლოდ მაშინ გამოიყვანე, როცა ბოლო სეგმენტი ამბობს რა ხდება"); კომენტარი შესაბამისად გასწორდეს.
- **Acceptance criteria:**
  - [ ] create-only როლით `POST /gallery/images/move` 403-ია, update-only როლით 200
  - [ ] `GalleryAlbumTest`-ში ორივე ტესტი
- **Estimate:** S
- **დამოკიდებულება:** none

### [SEC-12] Telegram-ის ბოტის ტოკენი `module_user.settings`-ში ღია ტექსტადაა და `GET /api/modules` მას ბრაუზერს უბრუნებს
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/ModuleController.php:46` (`user_settings` = pivot-ის მთელი JSON, ფილტრის გარეშე); `backend/app/Http/Resources/ModuleResource.php:37`; `backend/database/migrations/2026_09_15_000003_move_telegram_into_credentials.php` (ძველი გასაღებები „განზრახ" რჩება); fallback `backend/app/Services/Notes/NoteChannelSettings.php:49-50`
- **პრობლემა:** §21.9-ის მიგრაციამ ტოკენი `user_credentials`-ში დაშიფრულად **დააკოპირა**, `telegram_bot_token`/`telegram_chat_id` კი pivot-ში დატოვა. `ModuleController::index()` pivot-ის settings-ს ყოველ მოდულზე `user_settings`-ად აბრუნებს, ე.ი. `note` მოდულის ყოველ სიაში ტოკენი ღიად ბრაუზერს ეგზავნება — ზუსტად ის, რის გამოც §21.9 გაკეთდა. იგივე ღია ტოკენი ყოველ dump-ში (`mediary_backup.sql`, 4 კომიტებული ვერსია) და `/backups`-ის ყოველ ფაილში ხვდება. SEC-01-ის შესრულებისას დადასტურდა: მნიშვნელობის სიგრძე 46 (მნიშვნელობა არ დაიბეჭდა).
- **რატომ:** ტოკენი ბოტზე სრულ წვდომას იძლევა; `user_credentials`-ის ნიღაბი და „ნახვა ცხადი მოქმედებაა" დაპირება pivot-ის ღია ასლის გამო არაფერს ნიშნავს.
- **გადაწყვეტა:** მიგრაცია, რომელიც ორ გასაღებს `module_user.settings`-იდან **მხოლოდ** იმ რიგებზე ამოჭრის, სადაც `user_credentials`-ში telegram-ის ჩანაწერი უკვე არსებობს (დანარჩენი JSON — ველები, გალერეა, `status_sections` — უცვლელი); `ModuleController::index()`-ში ეს ორი გასაღები თავდაცვითადაც ამოიჭრას; `NoteChannelSettings`-ის fallback-ი ძველი dump-ის აღდგენისთვის დარჩეს ან ავტომატურ გადატანით ჩანაცვლდეს.
- **Acceptance criteria:**
  - [ ] `GET /api/modules`-ის პასუხში `telegram_bot_token` არ ჩანს (ტესტი)
  - [ ] მიგრაციის შემდეგ `module_user.settings`-ში ტოკენი არ არის, დანარჩენი გასაღებები უცვლელია (ტესტი)
  - [ ] Telegram-ის შეხსენება `user_credentials`-იდან კვლავ მიდის
- **Estimate:** S
- **დამოკიდებულება:** none (ძველი ტოკენის როტაცია SEC-01-შია)

### [BUG-01] დადასტურების დიალოგის ღილაკები ქართულად არის hardcoded — ინგლისურ UI-შიც
- **ტიპი:** bug
- **სად:** `frontend/src/components/ui/feedback.tsx:137-147`; `frontend/src/lib/errors.ts:100`
- **პრობლემა:** `confirmState.cancelText ?? 'გაუქმება'` და `confirmText ?? 'დადასტურება'`; `errorMessage(e, fallback = 'შეცდომა')`. 49 `confirm({` გამოძახებიდან უმეტესობა `cancelText`-ს არ აწვდის, ე.ი. ინგლისურ ინტერფეისში თითქმის ყველა დესტრუქციული დიალოგს ქართული „გაუქმება" ღილაკი აქვს. `confirm.confirm`/`confirm.cancel` გასაღებები ლოკალებში უკვე არსებობს (`en.json:680-681`).
- **რატომ:** მომხმარებლისთვის ხილული, ყველა წაშლის დიალოგზე; ინგლისურენოვანი მომხმარებელი ვერ კითხულობს, რომელი ღილაკი აჩერებს წაშლას.
- **გადაწყვეტა:** `FeedbackProvider`-ში `useTranslation()` და default-ები `t('confirm.cancel')`/`t('confirm.confirm')`; `errorMessage`-ის fallback `t('errors.generic')`-ის მსგავს გასაღებზე.
- **Acceptance criteria:**
  - [ ] `grep -n "'გაუქმება'\|'დადასტურება'\|'შეცდომა'" src/components/ui/feedback.tsx src/lib/errors.ts` ცარიელია
  - [ ] ინგლისურ UI-ში confirm-ის ორივე ღილაკი ინგლისურია (Vitest კომპონენტ-ტესტი `react-dom/client`-ით)
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-01] backend-ის 26 მანქანური კოდი ფრონტში არ ითარგმნება — toast-ში snake_case ჩანს
- **ტიპი:** gap
- **სად:** `frontend/src/lib/errors.ts:9-109` (`CODES` და `includes` შემოწმება); მაგ. `backend/app/Http/Middleware/EnsureModuleEnabled.php:27`
- **პრობლემა:** `grep -rhoE "'message' => '[a-z_]+'" backend/app | sort -u` 50 კოდს იძლევა, `CODES`-ში 40-ია; აკლია: `already_reviewed approval_required cannot_delete_self cannot_disable_self custom_field_file_limit file_not_found forbidden forbidden_permission invalid_target_genre invalid_type invalid_url last_super_admin module_already_enabled module_disabled module_inactive module_not_enabled module_not_shareable no_tmdb_id not_found nothing_selected primary_not_supported_for_cast registration_disabled role_in_use system_role too_many_videos worker_unavailable`. `errorMessage()` უცნობ კოდს სიტყვასიტყვით აბრუნებს.
- **რატომ:** CLAUDE.md-ის წესი — „`message` *არის* მანქანური კოდი და ყველა კოდი `CODES`-შია და ორივე ლოკალში" — 26 კოდზე დარღვეულია; `module_not_enabled` middleware-დან ნებისმიერ მოდულურ როუტზე მოდის, `registration_disabled` რეგისტრაციის ფორმაზე.
- **გადაწყვეტა:** 26 კოდი `CODES`-ში და `errors.*`-ში `ka.json`/`en.json`-ში; მუდმივი დაცვა — FEAT-01.
- **Acceptance criteria:**
  - [ ] `comm -23 <(backend codes) <(CODES)` ცარიელია
  - [ ] `python frontend/src/i18n/audit.py` მწვანეა (ორივე ლოკალი სინქრონშია)
  - [ ] `registration_disabled` 403-ზე toast-ში თარგმნილი ტექსტი ჩანს
- **Estimate:** M
- **დამოკიდებულება:** none

### [GAP-02] 419 (CSRF/სესიის ვადა) და ქსელის ჩავარდნა axios-ში არ მუშავდება
- **ტიპი:** gap
- **სად:** `frontend/src/lib/api.ts:51-60`
- **პრობლემა:** interceptor მხოლოდ `status === 401`-ს იჭერს. Sanctum cookie-რეჟიმში `XSRF-TOKEN`-ის ვადის ამოწურვაზე Laravel **419**-ს აბრუნებს (`grep -rn 419 frontend/src backend/app` — არაფერი); `!error.response` (ქსელი) არსად არ არის განსხვავებული.
- **რატომ:** ღია ტაბში ორი საათის შემდეგ ყველა მუტაცია „Request failed with status code 419" ინგლისურ toast-ით ცვივა, სანამ მომხმარებელი ხელით არ გადატვირთავს; ქსელის გათიშვა ინგლისურ „Network Error"-ად ჩანს UI-ს ენის მიუხედავად.
- **გადაწყვეტა:** 419-ზე `/sanctum/csrf-cookie`-ს ერთხელ ხელახლა წამოღება და მოთხოვნის გამეორება, მეორე 419-ზე `UNAUTHENTICATED_EVENT`; `errorMessage()`-ში `!e.response` → `t('errors.network')`.
- **Acceptance criteria:**
  - [ ] 419-ის სიმულაციაზე მოთხოვნა ერთხელ მეორდება და წარმატებით სრულდება
  - [ ] ქსელის შეცდომა UI-ს ენაზე თარგმნილი ტექსტით ჩანს
  - [ ] Vitest ტესტი interceptor-ზე (mock adapter)
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-01] `User::hasModule()` ყოველ გამოძახებაზე DB-ს ეკითხება და ციკლებშია
- **ტიპი:** performance
- **სად:** `backend/app/Models/User.php:197-206`; გამომძახებლები მაგ. `backend/app/Http/Controllers/Api/DashboardController.php:71-75`
- **პრობლემა:** `$this->modules()->where(...)->first()` query-builder-ია — eager-loaded `modules` რელაციას იგნორირებს. `foreach ($modules as $module) { if (! $user->hasModule($module->key)) …}` შაბლონი Dashboard-ში, `GalleryController`-ში, `ModuleImages`-ში, `GlobalSearch`-ში, `MediaDomain`-ში და `AdminModuleController`-შია — თითო გვერდზე 10–14 ზედმეტი query.
- **რატომ:** მთავარი გვერდი, გალერეის ინდექსი და ყოველი გლობალური ძებნა სერიულად 10+ round-trip-ს იხდის იმ პასუხისთვის, რომელიც უკვე მეხსიერებაშია.
- **გადაწყვეტა:** `loadMissing('modules')` + `$this->modules->firstWhere('key', $key)`-ით პასუხი; ან per-instance memo `array $moduleCache`.
- **Acceptance criteria:**
  - [ ] `GET /api/dashboard`-ზე `DB::getQueryLog()`-ში `module_user`-ის query ერთია
  - [ ] `DashboardTest`-ში query-რაოდენობის assertion
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-02] `PublicGallery::publicCastIds()` — N+1 ავტორიზაციის გარეშე endpoint-ზე
- **ტიპი:** performance
- **სად:** `backend/app/Services/Profile/PublicGallery.php:212-220`
- **პრობლემა:** ყოველ საჯარო ჩანაწერზე `$record->cast()->pluck('cast_members.id')` ცალკე query-ა; `show()` `count()`-ით და გალერეის ტაბი `page()`-ით ორივე `query()`-ს იძახებს — 500 საჯარო ფილმზე 1000+ query ერთ ანონიმურ გახსნაზე.
- **რატომ:** ეს ერთადერთი დომენური endpoint-ია `auth:sanctum`-ის გარეთ, ე.ი. ავტორიზაციის გარეშე გამოძახებადი DoS-ვექტორი და ნელი საჯარო გვერდი.
- **გადაწყვეტა:** დომენზე ერთი pivot-query: `DB::table('castables')->where('castable_type', $morph)->whereIn('castable_id', $ids)->pluck('cast_member_id')`; `query($user)`-ის შედეგი მოთხოვნის ფარგლებში memo-ში.
- **Acceptance criteria:**
  - [ ] `PublicGalleryTest`-ში 50 საჯარო ფილმზე query-რაოდენობა ჩანაწერების რიცხვზე არ არის დამოკიდებული
  - [ ] პასუხის შიგთავსი უცვლელია
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-03] `usedByModule()` ყოველ ატვირთვაზე მომხმარებლის მთელ ფაილ-ინვენტარს აგებს
- **ტიპი:** performance
- **სად:** `backend/app/Services/Storage/StorageMeter.php:883-886`; გამოძახება `:1175` (`guardModule`), `:1266-1268` (`claim`)
- **პრობლემა:** `files($user)` ~20 ცხრილის სრული ინვენტარია (`:135`-დან, თითო custom-field ცხრილზე `DB::table()->get()`); `usedByModule()` მას `->where('module')->sum('size')`-ით კითხულობს და `claim()` ყოველ ფაილზე იძახებს, როცა მომხმარებელს მოდულური ალოკაცია აქვს.
- **რატომ:** 20-ფაილიანი ატვირთვა ინვენტარს 20-ჯერ აგებს — ატვირთვის hot path-ზე.
- **გადაწყვეტა:** მოდულზე მიზნობრივი `SUM(size)` query-ები წყარო-ცხრილებიდან, ან `files()`-ის შედეგის request-scoped memo `user_id`-ზე.
- **Acceptance criteria:**
  - [ ] `StorageManagementTest`-ში N ფაილის ატვირთვაზე `files()`-ის სრული სკანი ერთხელაც არ ეშვება (ან ერთხელ)
  - [ ] `module_quota_exceeded` კვლავ ზუსტად იმავე ზღვარზე ბრუნდება
- **Estimate:** M
- **დამოკიდებულება:** none

### [DEBT-01] TypeScript `strict` მთელ აპში გამორთულია
- **ტიპი:** debt
- **სად:** `frontend/tsconfig.app.json:25-31`
- **პრობლემა:** `grep -n strict frontend/tsconfig*.json` არაფერს აბრუნებს — `strict`, `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess` არც ერთი არ არის ჩართული; `noUnusedLocals`/`noUnusedParameters` მხოლოდ.
- **რატომ:** CI-ს `tsc -b` implicit `any`-ს და `null`/`undefined`-ის non-nullable პოზიციაში გადინებას იღებს ~60k სტრიქონზე; ყველა `?? null`/`?.` დისციპლინა კონვენციაა და არა შემოწმება. (`any`/`@ts-ignore` კოდში 0-ია, ე.ი. მიგრაცია მცირე იქნება.)
- **გადაწყვეტა:** `"strict": true` (და სასურველია `noUncheckedIndexedAccess`), ერთ pass-ში შედეგების გასწორება.
- **Acceptance criteria:**
  - [ ] `tsconfig.app.json`-ში `"strict": true`
  - [ ] `npm run build` მწვანეა, `@ts-expect-error` ახალი გამოყენება ≤ 10 და თითოეულს კომენტარი აქვს
- **Estimate:** M
- **დამოკიდებულება:** none

## Medium

### [SEC-08] ჩანაწერის/custom-field ფაილიც კლიენტის MIME-ს `inline` აბრუნებს
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/NoteEntryFileController.php:70`, `:100-105`; `backend/app/Http/Controllers/Api/CustomFieldController.php:195-201`
- **პრობლემა:** ორივე `getClientMimeType()`-ს ინახავს და `$disk->response(..., ['Content-Type' => $row->mime], 'inline')`-ით აბრუნებს — SEC-04-ის იგივე შაბლონი. მფლობელობა აქ მოწმდება (ჩვეულებრივ self-XSS-ია), მაგრამ იგივე რიგები ადმინის `/users/{id}` ფაილ-ბიბლიოთეკაში ჩანს (`StorageMeter::files()` → `mime`), ე.ი. დაბალი უფლების მომხმარებელი payload-ს დებს, ადმინი ხსნის.
- **რატომ:** SEC-05-თან ერთად სრული ესკალაციის გზაა; გასწორება SEC-04-ის იმავე helper-ით.
- **გადაწყვეტა:** ერთი `App\Support\SafeMime` (სერვერული განსაზღვრა + allow-list + `attachment` fallback) და მისი გამოყენება სამივე `file()`-ში.
- **Acceptance criteria:**
  - [ ] `text/html`-ად ატვირთული ჩანაწერის ფაილი `attachment`/`octet-stream`-ით ბრუნდება
  - [ ] `NoteModuleTest`/`CustomFieldsTest`-ში ტესტი
- **Estimate:** S
- **დამოკიდებულება:** SEC-04

### [SEC-09] `GET/DELETE /batches/{batch}` მფლობელობას არ ამოწმებს
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/BatchController.php:102-118`
- **პრობლემა:** `show()`/`destroy()` მხოლოდ `Bus::findBatch($batch)`-ს აკეთებენ; `Illuminate\Bus\Batch` Eloquent-მოდელი არ არის, ე.ი. `EnsureRecordOwnership` მას არ ხედავს. ვინც სხვის batch UUID-ს გაიგებს, პროგრესს კითხულობს და მიმდინარე პარტიას აუქმებს.
- **რატომ:** სხვისი მუშაობის შეჩერება ერთი მოთხოვნით; UUIDv4-ის გამო Medium.
- **გადაწყვეტა:** batch-ის `user_id` ინახოს (`batch_owners` ცხრილი ან `options`) და ორივე მეთოდში `abort_unless($ownerId === $request->user()->id, 404)`.
- **Acceptance criteria:**
  - [ ] სხვა მომხმარებლის batch-ზე `GET`/`DELETE` 404-ია
  - [ ] `BatchQueueTest`-ში ტესტი
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-02] საჯარო ალბომის unlock სესიის გარეშე უხმაუროდ არაფერს აკეთებს და პაროლის ორაკული ხდება
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/PublicProfileController.php:199-206`; `backend/app/Support/AlbumLock.php:128-133`; limiter `backend/app/Providers/AppServiceProvider.php:168-180`
- **პრობლემა:** `AlbumLock::unlock()` `session()`-ის არყოფნაზე `return`-ს აკეთებს, კონტროლერი კი მაინც `unlocked: true`-ს აბრუნებს. `/api`-ს სესია მხოლოდ stateful origin-ზე აქვს. (a) არა-stateful კლიენტი „გახსნილს" ხედავს და ალბომი ჩაკეტილი რჩება; (b) თავდამსხმელს ქუქიც არ სჭირდება — endpoint პაროლის stateless ორაკულია, რომელსაც მხოლოდ IP+ალბომზე throttle იცავს (IP-ის როტაციით გვერდი ავლილია).
- **რატომ:** მოტყუებული პასუხი + სუსტი brute-force დაცვა ერთადერთ პაროლ-შემოწმებაზე login-ის გარეთ.
- **გადაწყვეტა:** პაროლის შემოწმებამდე `abort_unless($request->hasSession(), 409, 'session_required')`; დამატებით DB-მრიცხველი წარუმატებელ ცდებზე (FEAT-04).
- **Acceptance criteria:**
  - [ ] სესიის გარეშე მოთხოვნა 409-ს აბრუნებს, პაროლი არ მოწმდება (`Hash::check` არ ეშვება)
  - [ ] stateful მოთხოვნაზე unlock კვლავ მუშაობს (`PublicGalleryTest`)
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-03] `AlbumVault::relocate()` — ფაილის გადატანა DB-ტრანზაქციაშია, რომელიც მას ვერ აბრუნებს; არარსებულ ფაილზეც `path` იწერება
- **ტიპი:** bug
- **სად:** `backend/app/Services/Gallery/AlbumVault.php:76`, `:112-130`
- **პრობლემა:** `move()` მთელ ციკლს `DB::transaction()`-ში აწყობს, `writeStream`/`delete` კი არატრანზაქციულია — rollback-ზე `path` სვეტი ძველ მნიშვნელობას იბრუნებს, ფაილი კი ახალ ადგილზეა და ძველიდან წაშლილი. მეორე: `if ($from->exists($path))` false-ზეც `:130` `path`-ს ახალ მისამართზე გადაწერს და `true`-ს აბრუნებს.
- **რატომ:** ჩაკეტვა/გახსნა ალბომის ყველა ფოტოს 404-ად აქცევს ჩავარდნისას; დაკარგული ფაილის ჩანაწერი „წარმატებულად" გადატანილად ითვლება.
- **გადაწყვეტა:** copy-first → commit → delete-after; ფაილის არყოფნაზე `false` და `path` უცვლელი; `moved` მრიცხველი მხოლოდ რეალურ გადატანაზე.
- **Acceptance criteria:**
  - [ ] ტესტი: `saveQuietly()`-ის ჩავარდნის სიმულაციაზე ფაილი ძველ დისკზე რჩება და `path` არ იცვლება
  - [ ] ტესტი: დისკზე არარსებული ფოტოს ალბომის ჩაკეტვა `path`-ს არ ცვლის
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-04] ალბომის წაშლა: vault → images update → delete სამი დაუცველი ნაბიჯია
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/GalleryAlbumController.php:228-233`
- **პრობლემა:** `AlbumVault::reveal()` ფაილებს ჯერ საჯარო დისკზე გადაიტანს, მერე `update(['album_id' => …])` და `delete()` — ტრანზაქციის გარეშე. `update`/`delete`-ის ჩავარდნაზე ჩაკეტილი ალბომის ფოტოები `gallery/images`-ში საჯაროდ დევს, ალბომი კი კვლავ `password_hash`-ითაა.
- **რატომ:** ზუსტად ის ხვრელი, რომლის დახურვას §7.9 ემსახურება.
- **გადაწყვეტა:** row-ცვლილებები ტრანზაქციაში, ფაილების გადატანა commit-ის შემდეგ; ჩავარდნაზე კომპენსაცია (`seal` უკან).
- **Acceptance criteria:**
  - [ ] ტესტი: `delete()`-ის ჩავარდნაზე ფაილები `gallery/locked`-ში რჩება
- **Estimate:** S
- **დამოკიდებულება:** BUG-03

### [BUG-05] ლექსიკონის „გადატანა" query-builder `update()`-ით მოდელის ჰუკებს გვერდს უვლის (`watched_at`, audit)
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/StatusController.php:135-143`; იგივე `BookGenreController.php:74`, `BoardGameGenreController.php:74`, `VideoTypeController.php:79`, `NoteCategoryController.php:74`, `BookmarkCategoryController.php:79`
- **პრობლემა:** `$records->update(['status_id' => …])` `HasStatus::applyStatus()`-ს (`watched_at` როლიდან) და `AuditObserver::updated()`-ს არ უშვებს. `done` სტატუსის წაშლა და `todo`-ზე გადატანა ყველა ჩანაწერს შევსებული `watched_at`-ით ტოვებს; audit-ლოგში ჩანაწერი არ რჩება. წაშლის ბრანჩი (`DictionaryRecords::delete()`) სწორად მოდელით მუშაობს.
- **რატომ:** ერთი სვეტი ორ ფაქტს ეწინააღმდეგება (ის ხაფანგი, რომელსაც `watched_at`-ის წესი აღწერს) და მასობრივი ცვლილება ლოგიდან უჩინარია.
- **გადაწყვეტა:** წაშლის ბრანჟის მსგავსად `lazyById()` + `applyStatus()`/`save()`; ხუთ ლექსიკონზეც მოდელური ციკლი ან ერთი ცხადი `AuditLogger` ჩანაწერი.
- **Acceptance criteria:**
  - [ ] ტესტი: `done` სტატუსის წაშლა `todo`-ზე გადატანით `watched_at`-ს `null`-ავს
  - [ ] ტესტი: გადატანის შემდეგ `audit_logs`-ში ჩანაწერია
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-06] მასობრივი visibility-ცვლილება audit-ლოგში არ ჩანს
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/VisibilityController.php:129-130`
- **პრობლემა:** `$query->where('user_id', …)->update(['visibility' => …])` — query-builder, `AuditObserver` არ ეშვება; ერთეული ცვლილება (`update()`) კი ლოგირდება. `all: true`-თი მთელი დომენი გასაჯაროვდება ნულ ჩანაწერით.
- **რატომ:** „ვინ და როდის გახადა ჩემი ბიბლიოთეკა საჯარო" — სწორედ ის კითხვაა, რისთვისაც `audit_logs` არსებობს.
- **გადაწყვეტა:** ერთი ცხადი `AuditLogger` ჩანაწერი (`domain`, `visibility`, `updated`, id-სია) ან მოდელური ციკლი.
- **Acceptance criteria:**
  - [ ] `PATCH /visibility/{domain}` `all: true`-ზე `audit_logs`-ში ჩანაწერი ჩნდება (`PublicProfileTest`)
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-07] `ChatService::between()` — check-then-create race ორმაგ საუბარს ქმნის
- **ტიპი:** bug
- **სად:** `backend/app/Services/Chat/ChatService.php:51-64`
- **პრობლემა:** 1:1 საუბრის უნიკალურობა მხოლოდ წაკითხვით მოწმდება; სქემას (`conversation_user` unique `(conversation_id, user_id)`) წყვილზე შეზღუდვა არ აქვს. ორი ტაბი ან polling + ხელით გახსნა ერთდროულად ორ `Conversation`-ს ქმნის.
- **რატომ:** ძაფი სამუდამოდ იყოფა — შეტყობინებები იმ საუბარში ხვდება, რომელიც თითო კლიენტმა დაიქეშა.
- **გადაწყვეტა:** `Cache::lock('chat:'.min.':'.max)` find-or-create-ის გარშემო, ან `conversations.pair_key` (`min_id:max_id`) unique ინდექსით + `firstOrCreate`.
- **Acceptance criteria:**
  - [ ] `pair_key` unique ინდექსი (ან lock) და ტესტი, რომ ორი პარალელური `between()` ერთ id-ს აბრუნებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-08] `RunBatchItem` ყველა გამონაკლისს ყლაპავს — პარტია არასდროს „ჩავარდნილია"
- **ტიპი:** bug
- **სად:** `backend/app/Jobs/RunBatchItem.php:91-101`; `backend/app/Http/Controllers/Api/BatchController.php:84-87`
- **პრობლემა:** `catch (Throwable $e) { SourceLog::threw(...) }` — არაფერი არ გადაისვრის, ე.ი. `$batch->failedJobs` 0-ია, `processedJobs == totalJobs`, `failed_jobs` ცარიელი. `allowFailures()` `:87`-ზე უკვე დაყენებულია, ე.ი. გადასროლა პარტიას არ შეაჩერებდა. `run()`-ის ჩანაწერის ვერპოვნაც უხმო `return`-ია.
- **რატომ:** SPA „300/300 დასრულდა"-ს აჩვენებს იმ გაშვებაზეც, სადაც ყველა TMDB call 401-ს დაბრუნდა — უხმო skip, რომელსაც პროექტი ყველაზე მძიმე ბაგად თვლის.
- **გადაწყვეტა:** ლოგირების შემდეგ `throw $e` (`tries=1` რჩება, `allowFailures()` დანარჩენს არ აჩერებს); `skipped` და `failed` ცალ-ცალკე დაითვალოს (FEAT-03).
- **Acceptance criteria:**
  - [ ] `BatchQueueTest`: ჩავარდნილი ერთეულზე `failed_jobs` იზრდება და `payload()`-ში `failed > 0`
  - [ ] დანარჩენი ერთეულები კვლავ სრულდება
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-09] `notes:remind`-ის `withoutOverlapping()` ვადის გარეშე 24 სთ-ით აჩერებს შეხსენებებს
- **ტიპი:** bug
- **სად:** `backend/routes/console.php:22`
- **პრობლემა:** `->everyMinute()->withoutOverlapping()` — mutex-ის default ვადა 1440 წუთია. `ReminderDispatcher::fire()` სინქრონულ Telegram call-ს აკეთებს; `schedule:work`-ის Ctrl-C, ძილი ან PHP fatal გაშვების შუაში mutex-ს არ ათავისუფლებს.
- **რატომ:** მომდევნო 24 საათი არც ერთი შეხსენება არ ეშვება დახურული ბრაუზერისთვის — სწორედ ის, რისთვისაც scheduler არსებობს — და უხმოდ.
- **გადაწყვეტა:** `->withoutOverlapping(5)` (worst-case-ზე ოდნავ მეტი); სასურველია `->runInBackground()`.
- **Acceptance criteria:**
  - [ ] `console.php`-ში ვადა ცხადადაა და კომენტარი მიზეზს ამბობს
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-10] toast-ის ავტო-დახურვის ტაიმერი პროვაიდერის ყოველ რენდერზე თავიდან იწყება
- **ტიპი:** bug
- **სად:** `frontend/src/components/ui/feedback.tsx:158`, `:172-176`
- **პრობლემა:** `onDismiss={() => dismiss(t.id)}` ყოველ რენდერზე ახალი ფუნქციაა და `useEffect(..., [toast.duration, onDismiss])` ტაიმერს თავიდან აწყობს — ნებისმიერ toast-ის დამატება/მოხსნაზე ან confirm-ის გახსნაზე.
- **რატომ:** queue-გაშვების დროს (`ui/queue.tsx` ციკლში toast-ებს უშვებს) ადრეული toast-ები ვადას ვერ აღწევენ და გროვდებიან.
- **გადაწყვეტა:** სტაბილური `dismiss` + `id` პროპად (`onDismiss={dismiss}`, ეფექტში `onDismiss(id)`), ან ref-ში შენახვა.
- **Acceptance criteria:**
  - [ ] ტესტი: სამი ზედიზედ toast-იდან პირველი `duration`-ის შემდეგ ქრება მაშინაც, თუ მეორე/მესამე დაემატა
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-11] `key={i}` წაშლადი/გადაადგილებადი სტრიქონებზე სამ ფორმაში
- **ტიპი:** bug
- **სად:** `frontend/src/components/GameForm.tsx:670-671`, `:727-728`; `frontend/src/components/BoardGameForm.tsx:685`; `frontend/src/components/NoteForm.tsx:301-302`
- **პრობლემა:** `links.map((link, i) => <div key={i} …>)` სტრიქონებზე, რომლებსაც წაშლის ღილაკი აქვს (`filter((_, j) => j !== i)`). შუა სტრიქონის წაშლაზე React ძველი `n`-ის DOM-ს `n+1`-ისთვის იყენებს.
- **რატომ:** ფოკუსი, კარეტი, IME და Radix `Select`-ის შიდა open/highlight state სხვა ჩანაწერზე გადადის — ღია დროფდაუნი სხვა სტრიქონის მონაცემზე ხვდება.
- **გადაწყვეტა:** სტრიქონის შექმნაზე კლიენტური `id` (`crypto.randomUUID()`) და `key`-ად მისი გამოყენება.
- **Acceptance criteria:**
  - [ ] ოთხივე ადგილზე `key`-ი სტაბილური id-ა; `grep -n "key={i}" src/components/{GameForm,BoardGameForm,NoteForm}.tsx` ცარიელია
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-04] `AdminModuleController::index()` — eager load იკარგება, N_users × N_modules × 2 query
- **ტიპი:** performance
- **სად:** `backend/app/Http/Controllers/Api/Admin/AdminModuleController.php:29-34`
- **პრობლემა:** `User::with('modules')` `:29`-ზე იტვირთება, მაგრამ `isGrantedModule()`/`hasModule()` `$this->modules()` query-builder-ს იყენებენ (PERF-01) — 12 მოდული × 20 მომხმარებელი ≈ 500 query ერთ ადმინ-გვერდზე.
- **რატომ:** `/modules` ადმინის ერთი გვერდი ასობით სერიულ query-ს აკეთებს; მომხმარებელთა ზრდასთან წრფივად უარესდება.
- **გადაწყვეტა:** PERF-01-ის შემდეგ ავტომატურად წყდება; ან ერთი `module_user` map წინასწარ.
- **Acceptance criteria:**
  - [ ] `GET /api/admin/modules` query-რაოდენობა მომხმარებელთა რიცხვზე არ არის დამოკიდებული
- **Estimate:** S
- **დამოკიდებულება:** PERF-01

### [PERF-05] Dashboard ~27 სერიული query ყოველ გახსნაზე
- **ტიპი:** performance
- **სად:** `backend/app/Http/Controllers/Api/DashboardController.php:71-75`, `:99-101`
- **პრობლემა:** `foreach ($modules …) { if (! $user->hasModule(...)) }` + `countOf()` → `$model::count()` თითო მოდულზე (gallery-ზე ორი): 1 + 12 + 13 ≈ 27 query სერიულად.
- **რატომ:** აპის საწყისი გვერდია — ყოველ შესვლაზე იხდის.
- **გადაწყვეტა:** PERF-01 + ერთი `UNION ALL` `SELECT 'movie', COUNT(*) …` ან მოკლე TTL-ქეში `user + max(updated_at)`-ზე.
- **Acceptance criteria:**
  - [ ] `DashboardTest`-ში query-რაოდენობა ≤ 4
- **Estimate:** M
- **დამოკიდებულება:** PERF-01

### [PERF-06] `MatchService::ranking()` ყოველ კანდიდატზე `modules`-ს თავიდან კითხულობს
- **ტიპი:** performance
- **სად:** `backend/app/Services/Profile/MatchService.php:211-212`
- **პრობლემა:** `summary($me, $other)` → `domains($a, $b)` → `PublicProfileService::domains()` ორივე მომხმარებელზე `module_user` join-ს აკეთებს ყოველ იტერაციაზე; `MAX_PROFILES = 50`-ზე `domains($me)` 50-ჯერ ერთი და იგივე query-ა. `records()` memo-ს აქვს (`:55`), `domains()` — არა.
- **რატომ:** `/people` გვერდი 100+ ზედმეტ query-ს აკეთებს.
- **გადაწყვეტა:** იგივე per-request memo `domains()`-ზე `user_id`-ით.
- **Acceptance criteria:**
  - [ ] `MatchTest`-ში `GET /api/matches` query-რაოდენობა კანდიდატთა რიცხვზე წრფივად არ იზრდება `module_user`-ისთვის
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-07] `ModulePage` `DataTable`-ს არა-memo `columns`-ს აწვდის
- **ტიპი:** performance
- **სად:** `frontend/src/pages/ModulePage.tsx:340-347`; `frontend/src/components/ui/data-table.tsx:99`
- **პრობლემა:** `columns={[ … ]}` ინლაინ მასივია; `DataTable`-ის memo `[rows, q, sort, columns, searchOf]`-ზეა, ე.ი. ყოველ რენდერზე მთელი სია თავიდან იფილტრება/ისორტება. CLAUDE.md ამას სავალდებულოს უწოდებს და `RequestsPage`/`UsersPage` `useMemo`-ს იყენებენ.
- **რატომ:** ძებნის ყოველ კლავიშზე სრული re-sort; მომხმარებელთა ზრდაზე შესამჩნევი.
- **გადაწყვეტა:** `const columns = useMemo<DataColumn<User>[]>(() => [...], [t, key, module.is_active, setUserModules.isPending])`; `searchOf` `useCallback`-ით.
- **Acceptance criteria:**
  - [ ] `ModulePage.tsx`-ში `columns` `useMemo`-შია
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-08] ორივე ლოკალის JSON (360 kB) საწყის bundle-შია
- **ტიპი:** performance
- **სად:** `frontend/src/i18n/index.ts:3-4`
- **პრობლემა:** `import ka from './ka.json'` (232 kB) და `import en from './en.json'` (128 kB) სტატიკურად; `main.tsx` `./i18n`-ს eagerly ტვირთავს და `lib/errors.ts`-იც იმპორტირებს — ინგლისურენოვანი მომხმარებელი მთელ ქართულ ლექსიკონს ტვირთავს და პირიქით.
- **რატომ:** იმავე კლასის რეგრესიაა, რასაც `@/pages/` იმპორტის დამცავი grep იჭერს — უბრალოდ დაუფარავი.
- **გადაწყვეტა:** მხოლოდ შენახული ლოკალი სტატიკურად, მეორე `i18n.addResourceBundle`-ით დინამიური `import()`-ის უკან ენის გადართვაზე (`partialBundledLanguages`).
- **Acceptance criteria:**
  - [ ] `npm run build`-ის შემდეგ საწყის chunk-ებში ერთი ლოკალის ტექსტია მხოლოდ
  - [ ] ენის გადართვა UI-ს სრულად თარგმნის დამატებითი გადატვირთვის გარეშე
- **Estimate:** M
- **დამოკიდებულება:** none

### [PERF-09] პირადი დისკის grid „ყველა" რეჟიმში 1000 blob-XHR-მდე უშვებს
- **ტიპი:** performance
- **სად:** `frontend/src/components/ui/photo-grid.tsx:114`, `:124`; `frontend/src/components/PrivateFile.tsx:27-43`
- **პრობლემა:** `PHOTO_PAGE_ALL = 0` / `PHOTO_PAGE_MAX = 1000` ვირტუალიზაციის გარეშე; `privateDisk`-ზე თითო `PhotoTile` `usePrivateFileUrl` → ავტორიზებული `GET` სრული blob-ით მეხსიერებაში. `loading="lazy"` არ შველის — fetch JS-შია.
- **რატომ:** 1000 პარალელური მოთხოვნა 600/წთ გლობალურ ლიმიტზე — გვერდი თავად ითროთლება; მეხსიერება blob-ებით ივსება.
- **გადაწყვეტა:** blob-ის წამოღება მხოლოდ viewport-ში მოხვედრილ tile-ზე (`IntersectionObserver`), ან `privateDisk`-ზე `PHOTO_PAGE_ALL`-ის აკრძალვა.
- **Acceptance criteria:**
  - [ ] პირად grid-ზე ერთდროულად აქტიური blob-მოთხოვნები ≤ ხილული tile-ების რიცხვს + ბუფერი
- **Estimate:** M
- **დამოკიდებულება:** none

### [GAP-03] პარამეტრების შენახვის ჩავარდნა უხმაუროდ იყლაპება
- **ტიპი:** gap
- **სად:** `frontend/src/lib/settings.tsx:263-271`
- **პრობლემა:** `saveSettings(settings).then(...).catch(() => {}).finally(...)` — `/settings` და `/sync`-ის ერთადერთი შენახვის გზაა; 500/419/ქსელზე toast არ არის, `SettingsSaveBar` „შეუნახავი ცვლილებებს" აჩვენებს ახსნის გარეშე.
- **რატომ:** მომხმარებელი Save-ს უსასრულოდ აჭერს; აპის ყველა სხვა მუტაცია `onError` toast-ს აძლევს.
- **გადაწყვეტა:** პროვაიდერში `useToast()` და `catch`-ში `toast({ title: errorMessage(e), variant: 'error' })`.
- **Acceptance criteria:**
  - [ ] შენახვის 500-ზე toast ჩანს და `dirty` რჩება
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-04] read-only probe endpoint-ები POST-ია და `create` უფლებას ითხოვენ
- **ტიპი:** gap
- **სად:** `backend/routes/api.php:637` (`/gallery/plan`), `:343` (`/videos/metadata`), `:565` (`/songs/metadata`), `:610` (`/bookmarks/metadata`); წესი `backend/app/Http/Controllers/Api/VideoBulkController.php:60-63`
- **პრობლემა:** კოდში ჩაწერილი წესი („`GET` და არა `POST`, თორემ view+update როლი უსაფუძვლო 403-ს იღებს") `/videos/bulk-preview`-სა და `/board-games/shops`-ზეა გამოყენებული, ამ ოთხზე კი — არა. `/gallery/plan` არაფერს წერს.
- **რატომ:** view-only როლი გალერეის გეგმას ვერ ხედავს; `metadata`/`lookup` create-ის წინა probe-ებია, ე.ი. `create` შეიძლება განზრახ იყოს — მაგრამ ეს არსად არ წერია და მკითხველი ვერ გებულობს, რომელი კონვენციაა ნამდვილი.
- **გადაწყვეტა:** `/gallery/plan` → GET ან `permission:gallery,view`; `metadata`/`lookup`-ზე ერთსტრიქონიანი კომენტარი, რომ `create` განზრახაა.
- **Acceptance criteria:**
  - [ ] view-only როლით `/gallery/plan` 200-ია (`GalleryTest`)
  - [ ] სამ `metadata` როუტს კომენტარი აქვს
- **Estimate:** S
- **დამოკიდებულება:** SEC-07

### [DEBT-02] `ActorWebPhotos.tsx`-ში ნამდვილი NUL ბაიტებია — ფაილს git/grep ბინარულად კითხულობს
- **ტიპი:** debt
- **სად:** `frontend/src/components/ActorWebPhotos.tsx:52`
- **პრობლემა:** `tags.join('\x00') !== initial.join('\x00')` — ორი `\x00` ფაილში **ნამდვილი U+0000 ბაიტია** (`cat -v` → `^@`), არა escape. `grep -rn` „Binary file matches"-ს აბეჭდავს, `git diff` „Binary files differ"-ს.
- **რატომ:** კომპონენტი ყველა აუდიტისა და review-ინსტრუმენტისთვის უხილავია (ეს აუდიტიც მას grep-ით ვერ ხედავდა).
- **გადაწყვეტა:** `'\x00'` ან `String.fromCharCode(0)` escape-ად (იგივე runtime ქცევა, ფაილში კი მხოლოდ ტექსტი); `.gitattributes`-ში `*.tsx text`. (ეს აუდიტიც ამავე ხაფანგში მოხვდა: `tasks.md`-ის პირველ ვერსიაში `\x00` ესქეიპი ნამდვილ NUL ბაიტად ჩაიწერა.)
- **Acceptance criteria:**
  - [ ] `grep -c -P '\x00' src/components/ActorWebPhotos.tsx` → 0; `file` ტექსტს აჩვენებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-03] ახალი `PublicProfileController::photoFile()` (uncommitted) ტესტის გარეშეა
- **ტიპი:** debt
- **სად:** `backend/app/Http/Controllers/Api/PublicProfileController.php:142-155`
- **პრობლემა:** ერთადერთი ავტორიზაციის გარეშე როუტი, რომელიც **პირადი** დისკიდან ფაილს აბრუნებს; `grep -rn "gallery-photos.*file" backend/tests` ცარიელია. სამი დამცავი (არასაჯარო პროფილი → 404, ჯერ ჩაკეტილი ალბომი → 404, სხვისი image id → 404) შეუმოწმებელია.
- **რატომ:** ცვლილება ჯერ კომიტებულიც არ არის — ტესტის დაწერის იაფესი მომენტია.
- **გადაწყვეტა:** `PublicGalleryTest`-ში: საჯარო ალბომის ფოტო 200; ჩაკეტილი unlock-ამდე 404 და შემდეგ 200; სხვისი id 404; `PUBLIC_PROFILES=false` 404.
- **Acceptance criteria:**
  - [ ] ოთხივე ტესტი წერია და მწვანეა
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-04] `mediary:storage-recalc` ტესტის გარეშეა
- **ტიპი:** debt
- **სად:** `backend/app/Console/Commands/RecalculateStorageCommand.php:37-39`
- **პრობლემა:** `grep -rn "storage-recalc" backend/tests` არაფერს აბრუნებს. ბრძანება დრიფტირებული `storage_used_bytes`-ის ერთადერთი შესაკეთებელი გზაა და `StorageMeter::files()`-ის ~20 წყაროზეა დამოკიდებული.
- **რატომ:** ახალი ფაილ-ცხრილის გამოტოვება (`database_backups`, მრავალფაილიანი custom fields ბოლო მაგალითებია) რეკალკულაციას *ამცირებს* და მომხმარებელს უფასო კვოტას აძლევს — უხმოდ.
- **გადაწყვეტა:** ტესტი, რომელიც `files()`-ის ყოველ `owner_type`-ზე თითო ფაილს ქმნის, მრიცხველს აფუჩეჩებს, ბრძანებას უშვებს და ჯამს ადარებს; `RegistryConsistencyTest`-სტილის assertion, რომ ყოველი `StoredFile` მოდელი `files()`-შია.
- **Acceptance criteria:**
  - [ ] ორივე ტესტი წერია და მწვანეა
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-05] შეხსენების ორმაგი გაშვების claim ტესტით არ არის დაცული
- **ტიპი:** debt
- **სად:** `backend/app/Services/Notes/ReminderDispatcher.php:113-121`
- **პრობლემა:** `where('next_at', $reminder->next_at)->update(...)` compare-and-swap-ია — კლასის docblock-ის ერთადერთი დაპირება; `NoteModuleTest` `run()`-ს განრიგის სისწორეზე ამოწმებს, claim-ს — არა. `Asia/Tbilisi`-ზე გადასვლის შემდეგ Carbon↔string შედარების პრეციზია/ზონა რომ დაირღვეს, claim 0 რიგს დაემთხვევა და ყველა შეხსენება უხმოდ გაჩერდება.
- **რატომ:** ორი პარალელური გამომძახებელი (cron + ბრაუზერი) დიზაინითაა — ხაზი, რომელიც მათ ორმაგ გაშვებას უშლის, დაუცველია.
- **გადაწყვეტა:** ტესტი: ერთი due შეხსენება, `run()` ორჯერ (მოდელის ერთი snapshot-ით), ზუსტად ერთი `NoteNotification`.
- **Acceptance criteria:**
  - [ ] ტესტი წერია და მწვანეა; claim-ის შეცვლა (`where('next_at')`-ის ამოღება) მას აწითლებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-12] `NoteReminders.test.ts` სრულ `npm test`-ში 5-წამიან ტაიმაუტზე ცვივა (ცალკე გადის) — CI-ს flaky-ს ხდის
- **ტიპი:** debt
- **სად:** `frontend/src/components/NoteReminders.test.ts` (პირველი ტესტი „რიგზე დაჭერა რედაქტირებას ხსნის…"); სტატიკური იმპორტები `frontend/src/components/NoteReminders.tsx:22-23` (`TimePicker` — react-aria, `DatePicker` — react-day-picker); `frontend/vitest.config.ts` (`testTimeout` არ არის); CI `.github/workflows/ci.yml:93` (`npm test`)
- **პრობლემა:** SEC-02-ის შემოწმებისას (2026-09-17) სრულ `npm test`-ში 6–7 ტესტი ცვივა: პირველი `Test timed out in 5000ms` (~5.1 წმ), დანარჩენი ჯაჭვურად (`expected '' to contain …`, `Cannot read properties of undefined (reading 'click')`). `npx vitest run src/components/NoteReminders.test.ts` ცალკე 7/7 გადის. **უწინდელია**: SEC-02-ის 4 frontend-ფაილის stash-ის შემდეგაც ზუსტად ისევ ცვივა. სავარაუდო მიზეზი — 19 jsdom გარემოს პარალელური შექმნის (`environment 87%`) დროს მძიმე picker-ების იმპორტი პირველ ტესტის 5 წამზე ჭრის. **დასადასტურებელი:** ტესტის ხანგრძლივობა ბოლო მწვანე CI-რანზე.
- **რატომ:** CI-ს `npm test` ლოგიკური ცვლილების გარეშე წითლდება — ნამდვილი რეგრესია flaky ხმაურში დაიმალება, და ჩვეულებრივ „შეიძლება ისევ ტაიმაუტია"-ს ვარაუდით გადაიტანენ.
- **გადაწყვეტა:** ფაილის `beforeAll`-ში picker-ების მოდულების წინასწარ `await import()` (warm-up, ტაიმაუტის გარეთ) ან ფაილზე `vi.setConfig({ testTimeout: 20_000 })`; სასურველია `vitest.config.ts`-ში jsdom-ის ერთხელ შექმნა (`pool: 'vmThreads'`), რასაც Vitest-ი თვითონ ურჩევს.
- **Acceptance criteria:**
  - [ ] სრული `npm test` 3 ზედიზედ რანში 125/125-ია
  - [ ] ტესტის სემანტიკა უცვლელია (ტაიმაუტის ზრდა მიზეზის კომენტარით)
- **Estimate:** S
- **დამოკიდებულება:** none

## Low

### [SEC-10] `roles.permissions = NULL` „ყველაფერს" ნიშნავს და სვეტი nullable-ია
- **ტიპი:** security
- **სად:** `backend/app/Models/Role.php:58-65` (`allowsAdmin`-შიც იგივე); `backend/database/migrations/2026_09_02_000003_create_roles_table.php:30`
- **პრობლემა:** `if ($this->isSuperAdmin() || $this->permissions === null) return true;`. API ასეთ რიგს ვეღარ ქმნის (`cleanPermissions()` მასივს აბრუნებს), მაგრამ სვეტი `nullable()`-ია და partial-restore (`PartialRestore::table()`) ნებისმიერი ატვირთული dump-იდან შეიძლება შემოიტანოს. **დასადასტურებელი:** პროდზე `SELECT id,key FROM roles WHERE permissions IS NULL AND key <> 'super_admin'`.
- **რატომ:** არასაიმედო default — `NULL` „არაფრის" ნაცვლად „ყველაფერს" ნიშნავს ყველა მოდულსა და ადმინ-სექციაზე.
- **გადაწყვეტა:** `null` → „უფლება არ აქვს", სრული წვდომა მხოლოდ `isSuperAdmin()`-ზე; backfill `'{}'`, სვეტი `NOT NULL DEFAULT '{}'`.
- **Acceptance criteria:**
  - [ ] `permissions = null` როლით `hasPermission('movie','view')` false-ია (გარდა `super_admin`-ის)
  - [ ] მიგრაცია + ტესტი
- **Estimate:** S
- **დამოკიდებულება:** none

### [SEC-11] `.env.example` `APP_DEBUG=true`-თი და `SESSION_SECURE_COOKIE`-ს გარეშე
- **ტიპი:** security
- **სად:** `backend/.env.example:4`; `backend/config/session.php:172`
- **პრობლემა:** `setup.sh` ამ ფაილს `.env`-ად კოპირებს; `APP_DEBUG=true` სერვერზე ყოველ 500-ზე stack trace-ს, კონფიგს და query-ფრაგმენტებს აჩვენებს; `SESSION_SECURE_COOKIE` არსად არ არის (`env('SESSION_SECURE_COOKIE')` → null).
- **რატომ:** არასაიმედო default, რომელიც პირდაპირ პროდ-ინსტალაციაში გადადის.
- **გადაწყვეტა:** `APP_DEBUG=false`, კომენტარით `# APP_DEBUG=true — მხოლოდ ლოკალურად`; `SESSION_SECURE_COOKIE=true`, `SESSION_SAME_SITE=lax`.
- **Acceptance criteria:**
  - [ ] `.env.example`-ში სამივე მნიშვნელობა სწორია; `setup.sh` ლოკალურ debug-ს ცალკე ხაზით რთავს
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-12] `updateOrInsert` ყოველ რედაქტირებაზე `created_at`-ს გადაწერს
- **ტიპი:** bug
- **სად:** `backend/app/Services/Modules/CustomFieldService.php:252-259`
- **პრობლემა:** მეორე მასივი UPDATE-ის payload-იც არის და `'created_at' => now()`-ს შეიცავს — არსებული მნიშვნელობის რედაქტირება შექმნის თარიღს ახლანდელზე აყენებს. `StorageMeter::files()` ამ ცხრილებიდან `created_at`-ს „ატვირთვის თარიღად" კითხულობს.
- **რატომ:** storage-ბიბლიოთეკაში custom-field ფაილის თარიღი ჩანაწერის ყოველ უკავშირო რედაქტირებაზე წინ მიცოცავს.
- **გადაწყვეტა:** `created_at` მხოლოდ insert-ზე (ცალკე exists-შემოწმება ან Eloquent-მოდელი timestamps-ით).
- **Acceptance criteria:**
  - [ ] ტესტი: მნიშვნელობის მეორე ჩაწერა `created_at`-ს არ ცვლის
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-13] `deleteResolved()`-ის custom-field ბრანჩი: დისკი + მრიცხველი + row ტრანზაქციის გარეშე
- **ტიპი:** bug
- **სად:** `backend/app/Services/Storage/StorageMeter.php:704-706`
- **პრობლემა:** `deleteUpload()`, `addFor(-size)`, `DB::table()->delete()` სამი ცალკე side effect-ია; `DELETE`-ის ჩავარდნაზე ფაილი წაშლილია, კვოტა ჩამოკლებული, row კი კვლავ `value_path`/`value_size`-ს აცხადებს — მომდევნო `recalculate()` არარსებული ფაილის ბაიტებს *ხელახლა ამატებს*.
- **რატომ:** მრიცხველი სამუდამოდ იბერება; მოდელური ბრანჟი (`:683-688`) `StoredFile` ჰუკით უსაფრთხოა, ეს — არა.
- **გადაწყვეტა:** `DB::transaction()`, დისკის წაშლა commit-ის შემდეგ.
- **Acceptance criteria:**
  - [ ] ტესტი: `DELETE`-ის ჩავარდნაზე ფაილი და მრიცხველი უცვლელია
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-14] `errorMessage()` 422-ზე ვალიდაციის ტექსტს კოდზე წინ აყენებს
- **ტიპი:** bug
- **სად:** `frontend/src/lib/errors.ts:104-109`
- **პრობლემა:** `const message = first ?? data?.message ?? …` — როცა პასუხს `errors` bag-იც აქვს და მანქანური `message`-იც (Laravel `ValidationException`-ის ქვეკლასები), `first` იმარჯვებს და თარგმნადი კოდი იკარგება.
- **რატომ:** მომხმარებელი ლოკალიზებული ტექსტის ნაცვლად ვალიდატორის ინგლისურ წინადადებას იღებს.
- **გადაწყვეტა:** ჯერ `data?.message` `CODES`-ში შემოწმდეს, `first` მხოლოდ კოდის არყოფნაზე.
- **Acceptance criteria:**
  - [ ] Vitest: `{message:'storage_quota_exceeded', errors:{file:['x']}}` თარგმნილ ტექსტს აბრუნებს
- **Estimate:** S
- **დამოკიდებულება:** GAP-01

### [BUG-15] ექსპორტის ფაილის სახელი `toISOString()`-ით — ღამით გუშინდელი თარიღი
- **ტიპი:** bug
- **სად:** `frontend/src/api/account.ts:149`
- **პრობლემა:** `` `mediary-files-${new Date().toISOString().slice(0, 10)}.zip` `` — ზუსტად ის ბაგი, რისთვისაც `lib/dates.ts`-ის `sv-SE` წესი და `dates.test.ts` არსებობს; არა-ტესტ კოდში ერთადერთი დარჩენილი `toISOString().slice`.
- **რატომ:** თბილისში 00:00–04:00 ექსპორტი გუშინდელი თარიღით ინომრება.
- **გადაწყვეტა:** `formatDate(new Date(), 'iso')` `lib/dates.ts`-იდან.
- **Acceptance criteria:**
  - [ ] `grep -rn "toISOString().slice" src --include=*.ts --include=*.tsx` მხოლოდ ტესტებში პოულობს
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-10] `PurgeService::run()` plan-ს და id-სეტს ორჯერ ითვლის
- **ტიპი:** performance
- **სად:** `backend/app/Services/Purge/PurgeService.php:352-356`
- **პრობლემა:** `$plan = $this->plan(...)` თავად `recordIds()`-ს იძახებს (`:212`), მერე `:356` `recordIds()`-ს თავიდან — ყველაზე ძვირი query ორჯერ, და ორი სეტი შუაში ჩაწერაზე შეიძლება განსხვავდებოდეს.
- **რატომ:** დიდი ბიბლიოთეკის `all` purge-ზე დროის ორმაგი ხარჟი; „დათვლილი ≠ წაშლილი" რისკი, რომელსაც კლასის მთავარი წესი კრძალავს.
- **გადაწყვეტა:** `plan()` მიღებულ/დაბრუნებულ `$ids`-ს ხელახლა გამოიყენოს.
- **Acceptance criteria:**
  - [ ] `run()`-ში `recordIds()` ერთხელ ეშვება (`PurgeTest` query-count)
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-11] `AllPhotosCut`-ის `useMemo` ახალი `{}`-ით ყოველ რენდერზე ცვივა
- **ტიპი:** performance
- **სად:** `frontend/src/components/gallery/AllPhotosCut.tsx:42`, `:52-56`
- **პრობლემა:** `const counts = summaryQ.data?.categories ?? {}` ყოველ რენდერზე ახალი ობიექტია და `useMemo`-ს deps-შია (`[counts, category, summaryQ.data, t]`) — memo არასდროს არ ინახება, შვილები ხელახლა იხატება; `eslint-disable` კომენტარი ამას ფარავს.
- **რატომ:** უსარგებლო memo + `options`-ის მიმღები კომპონენტების re-render.
- **გადაწყვეტა:** მოდულის დონეზე `const EMPTY = {}` ან `?? {}` memo-ს შიგნით და deps `summaryQ.data`.
- **Acceptance criteria:**
  - [ ] `counts` რეფერენციულად სტაბილურია loading-ის დროს
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-12] `noteReminders` ყოველ poll-ზე მთელ `['notes']` ქეშს ინვალიდირებს
- **ტიპი:** performance
- **სად:** `frontend/src/lib/noteReminders.ts:90-106`
- **პრობლემა:** `qc.invalidateQueries({ queryKey: ['notes'] })` ციკლის გარეთაა და „ნაჩვენები იყო თუ არა" შემოწმების გარეშე — ყოველ 60 წმ-ზე არაცარიელ `due`-ზე ყველა `['notes']*` query refetch-დება, მაშინაც, თუ ყველა ერთეული უკვე `shown.current`-შია (permission ≠ granted-ზე ეს მუდმივია).
- **რატომ:** ზედმეტი ქსელური ტრაფიკი ყოველ წუთს, ჩანაწერების გვერდის ხელახალი დახატვით.
- **გადაწყვეტა:** invalidate მხოლოდ მაშინ, როცა `show()` რეალურად გაეშვა (`markNotificationRead`-ის `.then()`-ში).
- **Acceptance criteria:**
  - [ ] Vitest: უკვე ნაჩვენებ `due`-ზე `invalidateQueries` არ ეშვება
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-13] `PhotoTile` ყოველ გახსნილ URL-ზე მთელ grid-ს ხელახლა ხატავს
- **ტიპი:** performance
- **სად:** `frontend/src/components/ui/photo-grid.tsx:452`, `:556-559`
- **პრობლემა:** ყოველი tile-ის blob სხვა დროს ჩნდება და `setResolved((cur) => ({...cur, [id]: url}))` მთელ map-ს კლონავს → `PhotoGrid` და ყველა tile re-render, `slides` memo (`:291`) გადაითვლება. 50 tile = 50 სრული re-render.
- **რატომ:** PERF-09-თან ერთად კვადრატულად იზრდება.
- **გადაწყვეტა:** გახსნილი URL-ები `useRef` map-ში, ერთი re-render lightbox-ის გახსნაზე; ან rAF-ბატჩინგი.
- **Acceptance criteria:**
  - [ ] N tile-ის გახსნა `PhotoGrid`-ს ≤ 2-ჯერ ხატავს (React Profiler ან render-მრიცხველი ტესტში)
- **Estimate:** S
- **დამოკიდებულება:** PERF-09

### [GAP-05] Root `README.md` ორმოდულიან Laravel 11 / React 18 აპს აღწერს
- **ტიპი:** gap
- **სად:** `README.md:3`, `:5-6`, `:94`; ფაქტები `backend/composer.json:10` (`^13.17`), `frontend/package.json:32` (`react ^19.2.8`), dump-ში 85 `CREATE TABLE`
- **პრობლემა:** „ფილმებისა და სერიალების კატალოგი", „Laravel 11", „React 18", „19 ცხრილი" — repo-ს 11 მოდული, Laravel 13, React 19 და 85 ცხრილი აქვს. `CLAUDE.md:9`-იც „React 18"-ს ამბობს.
- **რატომ:** README საჯარო სახე და setup-გზამკვლევია (`setup.sh` მის გვერდითაა); მკითხველი არასწორ ვერსიის დოკუმენტაციასთან მიდის.
- **გადაწყვეტა:** სამი ხაზის განახლება + „სამუშაო დოკუმენტი CLAUDE.md-ია" ზედა ხაზი; `CLAUDE.md:9` React 19.
- **Acceptance criteria:**
  - [ ] README-სა და CLAUDE.md-ში ვერსიები `composer.json`/`package.json`-ს ემთხვევა
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-06] საჯარო როუტების ინვენტარი კომენტარსა და CLAUDE.md-ში მოძველებულია („ორი, read-only")
- **ტიპი:** gap
- **სად:** `backend/routes/api.php:117-121` vs `:122-137`; `CLAUDE.md:529`
- **პრობლემა:** კომენტარი „ერთადერთი დომენური endpoint-ები… ორივე read-only-ია" — რეალურად ხუთი როუტია, ერთი მათგანი (`:132` `unlockAlbum`) POST-ია და სესიას ცვლის. `PUBLIC_PROFILES`-ის ნახევარი დაპირება მართალია (ხუთივე `resolve()`-ს იძახებს).
- **რატომ:** ავტორიზაციის გარეშე ზედაპირის ინვენტარი ყველაზე სენსიტიური სიაა — შემდეგი reviewer-ი „ორი read-only"-ს ვარაუდით შედის.
- **გადაწყვეტა:** კომენტარი და CLAUDE.md ხუთივეს ჩამოთვლის, `unlockAlbum`-ს ერთადერთ write-ად ნიშნავს და მის ორ დამცავს (`throttle:album-unlock`, `user_id`+`public` შემოწმება) ასახელებს.
- **Acceptance criteria:**
  - [ ] ორივე ტექსტი ხუთ როუტს ასახელებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-07] `PUBLIC_PROFILES=false` `/matches`-ს არ თიშავს
- **ტიპი:** gap
- **სად:** `backend/config/mediary.php:15-23`; `backend/app/Http/Controllers/Api/MatchController.php:52`; `backend/app/Services/Profile/MatchService.php:191-196`
- **პრობლემა:** `MatchController::index()` `ranking()`-ს პირდაპირ იძახებს, `resolve()`-ის გვერდის ავლით (`show()`/`items()` `:100`-ზე იყენებენ). გამორთული გადამრთველზეც ავტორიზებული მომხმარებელი ყველა `profile_visibility='public'` ანგარიშს და მათი ბიბლიოთეკის დომენურ ჭრილს ხედავს. Docblock „ერთი გადამრთველი მთელ მექანიზმს თიშავს"-ს ამბობს.
- **რატომ:** განზრახია თუ არა — არსად წერია; ეს ორაზროვნებაა დასკვნა.
- **გადაწყვეტა:** ან `ranking()`-ის თავში `if (! config('mediary.public_profiles')) return ['items'=>[], 'total'=>0, 'truncated'=>false];`, ან docblock-ში „გადამრთველი ანონიმურ ზედაპირს თიშავს, matching რჩება".
- **Acceptance criteria:**
  - [ ] გადაწყვეტილება მიღებულია და ტესტით ან docblock-ით დაფიქსირებულია
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-08] გახსნილი ჩაკეტილი ალბომის ფოტო `Cache-Control`-ის გარეშე ბრუნდება
- **ტიპი:** gap
- **სად:** `backend/app/Http/Controllers/Api/PublicProfileController.php:150-154`; `CLAUDE.md:426`
- **პრობლემა:** `return $disk->response($galleryImage->path)` default ჰედერებით; ეს 2026-09-17-ს დამატებული პირადი გზაა, რომელზეც ჩაკეტილი ალბომის ფოტო unlock-ის შემდეგ გამოდის — შუამავალს (CDN/ბრაუზერი) ქეშირება შეუძლია. CLAUDE.md:426 „ვერ აკეთებს"-ად აღწერს ძველი საჯარო URL-ის ქეშს, ახალ როუტზე კი იგივე კლასის ხვრელი ხელახლა შემოდის.
- **რატომ:** პაროლის მოხსნის შემდეგ ფოტო ქეშიდან კვლავ იხსნება.
- **გადაწყვეტა:** `isLocked()` ალბომის ფოტოზე `['Cache-Control' => 'private, no-store, max-age=0']`.
- **Acceptance criteria:**
  - [ ] `PublicGalleryTest`: ჩაკეტილი ალბომის ფოტოს პასუხს `no-store` აქვს
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-09] ლექსიკონის წაშლისას `move_to: null`, გამოტოვება და self ერთსა და იმავეს ნიშნავს — გადაწყვეტილება სჭირდება
- **ტიპი:** gap
- **სად:** `backend/app/Support/DictionaryRecords.php:49-55`
- **პრობლემა:** `isset($data['move_to'])` `null`-ზე false-ია, ე.ი. „გასაღები არ არის", `move_to: null` და `move_to: <self>` სამივე „ჩანაწერები ცარიელი დარჩეს"-ად იკითხება; docblock სამ ცხად არჩევანს აღწერს და სერვერს არასრულ ფორმაზე 422-ის საშუალება არ აქვს. CLAUDE.md-ის 🟡 პუნქტი ამას „განზრახ ღია ხვრელს" უწოდებს, რომელსაც მომხმარებლის გადაწყვეტილება სჭირდება (status/type სავალდებულო გახდა, ეს გზა კი სტატუსის გარეშე ჩანაწერს ტოვებს).
- **რატომ:** სავალდებულო სტატუსის წესის ერთადერთი დარჩენილი გამონაკლისია და ქცევა `isset()`-ის შემთხვევითობაა, არა დიზაინი.
- **გადაწყვეტა:** გადაწყვეტილება: (a) `null` აიკრძალოს (`move_target_required`) და „ცარიელი" მხოლოდ ცხადი ფლაგით; ან (b) docblock-ში ჩაიწეროს, რომ სამივე ერთი განზრახვაა.
- **Acceptance criteria:**
  - [ ] გადაწყვეტილება CLAUDE.md-სა და docblock-ში ერთნაირადაა; (a)-ზე ტესტი
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-06] CLAUDE.md-ის „visibility-ს UI არ აქვს" ფრაზები მოძველებულია
- **ტიპი:** debt
- **სად:** `CLAUDE.md:247` („no UI exposes it yet"), `:271` („have no UI toggle yet"); ფაქტი `frontend/src/api/publicProfile.ts:19-29`, `frontend/src/components/VisibilityManager.tsx:103`
- **პრობლემა:** `PUBLIC_DOMAINS`-ში `video`, `song`, `playlist` არის და `VisibilityManager` მათ ტაბებს აწყობს — გადამრთველი აშენდა, დოკუმენტი არ განახლდა.
- **რატომ:** კონფიდენციალურობის კონტროლზე დოკუმენტი *ნაკლებს* ამბობს, ვიდრე რეალურად საჯაროა — საშიში მიმართულებაა.
- **გადაწყვეტა:** ორივე ფრაზის ამოღება.
- **Acceptance criteria:**
  - [ ] `grep -n "no UI exposes it yet\|have no UI toggle yet" CLAUDE.md` ცარიელია
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-07] ექვსი ექსპორტი `src/lib`-ში არსად არ გამოიყენება
- **ტიპი:** debt
- **სად:** `frontend/src/lib/emoji.ts:74`, `frontend/src/lib/statuses.ts:116`, `frontend/src/lib/dictionaries.tsx:311`, `frontend/src/lib/settings.tsx:111`, `:113`, `frontend/src/lib/paged.ts:59`
- **პრობლემა:** `ALL_EMOJI`, `useViewLabel`, `dictionaryOf`, `SORT_DIR_OPTIONS`, `LIBRARY_VIEW_FRAME`, `emptyPage` — თითოეულს რეპოში ერთი მოხსენიება აქვს (საკუთარი დეფინიცია). `noUnusedLocals` ექსპორტს ვერ ხედავს; `ALL_EMOJI` მოდულის ჩატვირთვაზე მთელ ემოჯი-ცხრილს ბრტყელებს უმიზნოდ.
- **რატომ:** მკვდარი ქცევა (`useViewLabel` მკვდარი hook-ია) მომავალ მკითხველს ატყუებს.
- **გადაწყვეტა:** ექვსივეს წაშლა; `knip` ან oxlint-ის unused-export წესი `lint`-ში.
- **Acceptance criteria:**
  - [ ] ექვსივე წაშლილია, `npm run build` მწვანეა, `lint`-ს unused-export შემოწმება აქვს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-08] 11 `eslint-disable react-hooks/exhaustive-deps` კომენტარი პროექტში, სადაც ESLint არ არის
- **ტიპი:** debt
- **სად:** `frontend/.oxlintrc.json:1-9`; მაგ. `frontend/src/lib/player.tsx:200`, `frontend/src/components/ui/photo-grid.tsx:290`, `:559`
- **პრობლემა:** `lint` სკრიპტი `oxlint`-ია და `.oxlintrc.json`-ში `exhaustive-deps` არ არის ჩართული — 11 suppress-კომენტარი წესს თიშავს, რომელიც არასდროს არ ეშვება; `player.tsx:200` (`[seq]` deps, სხეული `current`-ს კითხულობს) რეალური stale-closure რისკია, რომელსაც ვერაფერი დაიჟერს.
- **რატომ:** კომენტარები გარანტიას გულისხმობენ, რომელიც არ არსებობს.
- **გადაწყვეტა:** `react/exhaustive-deps` `.oxlintrc.json`-ში ჩართვა და თითო suppress-ის გადახედვა; ან კომენტარების წაშლა.
- **Acceptance criteria:**
  - [ ] `npm run lint` `exhaustive-deps`-ს ამოწმებს; დარჩენილ ყოველ disable-ს მიზეზის კომენტარი აქვს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-09] `settle()` state-updater-ში side effect-ს აკეთებს (StrictMode-ში ორჯერ)
- **ტიპი:** debt
- **სად:** `frontend/src/components/ui/feedback.tsx:72-77`
- **პრობლემა:** `setConfirmState((cur) => { cur?.resolve(value); return null })` — `main.tsx` `<StrictMode>`-შია, updater dev-ში ორჯერ ეშვება; დღეს უვნებელია მხოლოდ იმიტომ, რომ promise-ის resolve იდემპოტენტურია.
- **რატომ:** მუტაცია ან `toast()` აქ რომ მოხვდეს — ორჯერ შესრულდება.
- **გადაწყვეტა:** state ref-ში, `setConfirmState(null)` და resolve updater-ის გარეთ.
- **Acceptance criteria:**
  - [ ] updater-ში side effect არ არის
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-10] `backend/README.md` და `frontend/README.md` ფრეიმვორკის boilerplate-ია
- **ტიპი:** debt
- **სად:** `backend/README.md:1`; `frontend/README.md:1-3`
- **პრობლემა:** Laravel-ის ლოგო-README და „React + TypeScript + Vite / This template provides a minimal setup…" — Mediary-ს არსად არ ახსენებენ.
- **რატომ:** ახალი კონტრიბუტორის პირველი ფაილია და შაბლონს აღწერს.
- **გადაწყვეტა:** 10–15 სტრიქონი: „იხ. ../CLAUDE.md" + dev/test ბრძანებები; ან წაშლა.
- **Acceptance criteria:**
  - [ ] ორივე README Mediary-ს აღწერს ან წაშლილია
- **Estimate:** S
- **დამოკიდებულება:** GAP-05

### [DEBT-11] `AuditRegistry::MODELS`-ში `UserCredential`/`DatabaseBackup`-ის არყოფნა დაუსაბუთებელია
- **ტიპი:** debt
- **სად:** `backend/app/Support/AuditRegistry.php:161-168`
- **პრობლემა:** ორივე მოდელი ცხადად ლოგირდება (`CredentialController`, `DatabaseBackupController` → `AuditLogger`), მაგრამ map-ში არ არის და არც კომენტარი ამბობს რატომ (`castables`-ს განსხვავებით). `RegistryConsistencyTest` მოდულებს ამოწმებს, მოდელებს — არა.
- **რატომ:** შემდეგი write-path ამ კონტროლერებში უხმოდ დაულოგავი დარჩება.
- **გადაწყვეტა:** `Status::class`-ის სტილის კომენტარ-ბლოკი: ორივე კლასი, „ცხადად ლოგირდება", მიზეზი (საიდუმლო მასალა / restore-ის რიგი).
- **Acceptance criteria:**
  - [ ] კომენტარი წერია; სასურველია ტესტი, რომ ყოველი `Models/*` კლასი ან map-შია, ან ცხად გამონაკლისების სიაში
- **Estimate:** S
- **დამოკიდებულება:** none

## Backlog

### [FEAT-01] ტესტი: backend-ის ყველა მანქანური კოდი ⊆ `CODES` ⊆ ორივე ლოკალი
- **ტიპი:** feature
- **სად:** `frontend/src/lib/errors.ts:9-109`; CI `.github/workflows/ci.yml` (`i18n` job)
- **პრობლემა:** GAP-01-ის 26 კოდი დაგროვდა, რადგან „კოდი CODES-ში და ლოკალებში" წესს არაფერი არ იცავს — `RegistryConsistencyTest` backend-ის map-ებს იჭერს, ეს კავშირი კი ორ რეპო-ნახევარს კვეთს.
- **რატომ:** მომდევნო ახალი კოდი ისევ raw toast-ად გამოჩნდება.
- **გადაწყვეტა:** სკრიპტი/ტესტი (Python-ის `audit.py`-ის გვერდით ან Vitest), რომელიც `backend/app`-ს `'message' => '…'`-ზე grep-ავს და `CODES` + `errors.*`-ს ადარებს; CI-ს `i18n` job-ში.
- **Acceptance criteria:**
  - [ ] კოდის დამატება ლოკალის გარეშე CI-ს აწითლებს
- **Estimate:** S
- **დამოკიდებულება:** GAP-01

### [FEAT-02] `mediary:seed-demo` — ანონიმური საჩვენებელი მონაცემები კომიტებული dump-ის ნაცვლად
- **ტიპი:** feature
- **სად:** `setup.sh:22-36`; `README.md:94`
- **პრობლემა:** setup-სკრიპტები და README პროდ-dump-ს ეყრდნობიან, რაც SEC-01-ის მიზეზია; მისი ამოღების შემდეგ „სწრაფი აწყობა" ცარიელ ბაზას მიიღებს.
- **რატომ:** ახალი მანქანა/კონტრიბუტორი პერსონალური მონაცემების გარეშე უნდა აწყობდეს, მაგრამ არა ცარიელ აპს.
- **გადაწყვეტა:** seeder ან command, რომელიც თითო მოდულზე რამდენიმე სინთეზურ ჩანაწერს, დემო-მომხმარებელს (ცნობილი პაროლით) და სტატუსებს/ჟანრებს ქმნის; `setup.*` მას იძახებს.
- **Acceptance criteria:**
  - [ ] `php artisan migrate:fresh --seed && php artisan mediary:seed-demo` სრულ სამუშაო აპს იძლევა
  - [ ] repo-ში პერსონალური მონაცემი არ არის
- **Estimate:** M
- **დამოკიდებულება:** SEC-01

### [FEAT-03] პარტიის თითო ერთეულის შედეგი (`ok`/`skipped`/`failed` + მიზეზი) და მისი ჩვენება SPA-ში
- **ტიპი:** feature
- **სად:** `backend/app/Jobs/RunBatchItem.php:91-101`; `backend/app/Http/Controllers/Api/BatchController.php:102-108` (`payload()`)
- **პრობლემა:** სერვერული პარტია მხოლოდ `processed/total`-ს აბრუნებს; BUG-08-ის შემდეგაც „რომელი ჩანაწერი და რატომ ჩავარდა" მხოლოდ `sources.log`-შია, კლიენტური queue კი თითო ჩანაწერზე შედეგს აჩვენებს — ორ რეჯიმს სხვადასხვა პასუხი აქვს.
- **რატომ:** მომხმარებელი „300/300"-ის შემდეგ ვერ გებულობს, რას გადაუშვას თავიდან.
- **გადაწყვეტა:** `batch_items` ცხრილი (`batch_id`, `type`, `record_id`, `status`, `error`) რომელსაც job წერს; `payload()` მას აბრუნებს; `ui/queue.tsx`-ის „სერვერზე გადაცემა" ხედი შედეგების სიას ხატავს.
- **Acceptance criteria:**
  - [ ] პარტიის დასრულებაზე თითო ერთეულის სტატუსი API-შიც და UI-შიც ჩანს
- **Estimate:** M
- **დამოკიდებულება:** BUG-08

### [FEAT-04] ალბომის პაროლის წარუმატებელი ცდების DB-მრიცხველი და დროებითი დაბლოკვა
- **ტიპი:** feature
- **სად:** `backend/app/Http/Controllers/Api/PublicProfileController.php:199-206`; `backend/app/Providers/AppServiceProvider.php:168-180`
- **პრობლემა:** ერთადერთი დაცვა IP+ალბომზე 10/წთ throttle-ია — IP-ის როტაციით გვერდი ავლილია, პაროლი კი მოკლე შეიძლება იყოს.
- **რატომ:** BUG-02-ის შემდეგ სესია სავალდებულო ხდება, მაგრამ per-album მცდელობათა ჯამი კვლავ არსად არ ითვლება.
- **გადაწყვეტა:** `gallery_albums.failed_unlocks` + `locked_until`; N წარუმატებელზე ალბომი M წუთით იბლოკება (423 `album_temporarily_locked`), მფლობელს გაფრთხილება.
- **Acceptance criteria:**
  - [ ] სხვადასხვა IP-დან 10+ არასწორი პაროლი ალბომს ბლოკავს; სწორი პაროლი დაბლოკვის დროს 423-ია
- **Estimate:** S
- **დამოკიდებულება:** BUG-02

### [FEAT-05] `mediary:doctor` — ბინარების, scheduler-ის და storage-მრიცხველის დრიფტის ერთი შემოწმება
- **ტიპი:** feature
- **სად:** n/a (ახალი `backend/app/Console/Commands/DoctorCommand.php`)
- **პრობლემა:** აპს ბევრი „მდგომარეობა და არა crash" 503 აქვს (`ytdlp_unavailable`, `mysqldump_unavailable`, `worker_unavailable`), scheduler-ის გაშვება ხელითაა და `storage_used_bytes` დრიფტს მხოლოდ `storage-recalc`-ის გაშვება ამჟღავნებს — არც ერთ ადგილას ერთი პასუხი „რა არ მუშაობს ამ მანქანაზე".
- **რატომ:** CLAUDE.md-ის ინციდენტების უმეტესობა (ბინარები PATH-ზე არ არის, scheduler არ ეშვება, მრიცხველი დრიფტირებულია) ერთი ბრძანებით დაიჭირებოდა.
- **გადაწყვეტა:** ბრძანება, რომელიც ბეჭდავს: `YtDlp::available()`, `DatabaseDumper::available()`, ffmpeg, `schedule:run`-ის ბოლო გაშვება (cache-ნიშანი `notes:remind`-იდან), `storage_used_bytes` vs `recalculate()` (dry-run) მომხმარებელზე, `.env` კრიტიკული მნიშვნელობები (`APP_DEBUG`, `PUBLIC_PROFILES`).
- **Acceptance criteria:**
  - [ ] `php artisan mediary:doctor` ყველა პუნქტზე OK/WARN-ს ბეჭდავს და პრობლემაზე არა-ნულოვან კოდს აბრუნებს
- **Estimate:** M
- **დამოკიდებულება:** DEBT-04
