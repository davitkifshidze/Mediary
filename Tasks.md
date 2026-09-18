# Tasks

აუდიტი 2026-09-17 (`audit-spec.md`-ის მიხედვით). ყველა `path:line` რეპოს root-იდანაა და `sed -n`-ით დადასტურებულია. კოდი არ შეცვლილა — ეს ფაილი ერთადერთი გამოსავალია.

**შესრულება (2026-09-17-დან):** ტასკები სათითაოდ სრულდება, ყოველ შემდეგზე გადასვლა — მხოლოდ ნებართვით. შესრულებული ტასკი **არ იშლება**: მას სტატუსი ეძლევა (ცხრილის ბოლო სვეტი + ტასკის `სტატუსი` ველი), `path:line`-ები კი აუდიტის მომენტს ასახავენ და შესწორებების შემდეგ შეიძლება გადაიწიონ.
სტატუსი: ⬜ ღია · 🟡 ნაწილობრივ (რჩება ნებართვა ან შენი ქმედება) · ✅ შესრულებულია

## Summary
| ID | ტიტული | severity | ტიპი | estimate | სტატუსი |
|----|---------|----------|------|----------|----------|
| SEC-01 | პროდ-ბაზის dump პაროლის ჰეშებით, `remember_token`-ებით, სესიით და პირადი ჩატით git-ში და GitHub-ზეა | Critical | security | M | 🟡 ნაწილობრივ |
| SEC-02 | `admin:users` უფლების მქონე თავის თავს `super_admin`-ად აქცევს | Critical | security | S | ✅ შესრულებულია |
| SEC-03 | `admin:roles` უფლების მქონე საკუთარ როლს `admin:*` უფლებებს ამატებს (ესკალაციის ჯაჭვი SEC-02-ში) | High | security | S | ✅ შესრულებულია |
| SEC-04 | ჩატის მიმაგრებული ფაილი კლიენტის `Content-Type`-ით `inline` ბრუნდება — cross-account stored XSS | High | security | M | ✅ შესრულებულია |
| SEC-05 | SVG დაშვებულია custom-field ფაილად და საჯარო დისკზე ხვდება — stored XSS API-ს origin-ზე | High | security | S | ✅ შესრულებულია |
| SEC-06 | ცოცხალი TMDB API გასაღები `.env.example`-შია (origin/main-ზეც) | High | security | S | 🟡 ნაწილობრივ |
| SEC-07 | `POST /gallery/images/move` უფლებას `create`-ად კითხულობს, კომენტარი კი „ცხადს" ამტკიცებს | High | security | S | ✅ შესრულებულია |
| SEC-12 | Telegram-ის ბოტის ტოკენი `module_user.settings`-ში ღია ტექსტადაა და `GET /api/modules` მას ბრაუზერს უბრუნებს (SEC-01-ის შესრულებისას ნაპოვნი) | High | security | S | ✅ შესრულებულია |
| SEC-13 | ცოცხალ ბაზაში `user` როლს (ე.ი. ყოველ ჩვეულებრივ ანგარიშს) ოთხივე ადმინ-სექცია აქვს მინიჭებული (GAP-10-ის შესრულებისას ნაპოვნი) | High | security | S | ✅ შესრულებულია |
| BUG-01 | დადასტურების დიალოგის ღილაკები ქართულად არის hardcoded — ინგლისურ UI-შიც | High | bug | S | ✅ შესრულებულია |
| GAP-01 | backend-ის 26 მანქანური კოდი ფრონტში არ ითარგმნება — toast-ში snake_case ჩანს | High | gap | M | ✅ შესრულებულია |
| GAP-02 | 419 (CSRF/სესიის ვადა) და ქსელის ჩავარდნა axios-ში არ მუშავდება | High | gap | S | ✅ შესრულებულია |
| PERF-01 | `User::hasModule()` ყოველ გამოძახებაზე DB-ს ეკითხება და ციკლებშია | High | performance | S | ✅ შესრულებულია |
| PERF-02 | `PublicGallery::publicCastIds()` — N+1 ავტორიზაციის გარეშე endpoint-ზე | High | performance | S | ✅ შესრულებულია |
| PERF-03 | `usedByModule()` ყოველ ატვირთვაზე მომხმარებლის მთელ ფაილ-ინვენტარს აგებს | High | performance | M | ✅ შესრულებულია |
| DEBT-01 | TypeScript `strict` მთელ აპში გამორთულია | High | debt | M | ✅ შესრულებულია |
| SEC-08 | ჩანაწერის/custom-field ფაილიც კლიენტის MIME-ს `inline` აბრუნებს | Medium | security | S | ✅ შესრულებულია |
| SEC-09 | `GET/DELETE /batches/{batch}` მფლობელობას არ ამოწმებს | Medium | security | S | ✅ შესრულებულია |
| BUG-02 | საჯარო ალბომის unlock სესიის გარეშე უხმაუროდ არაფერს აკეთებს და პაროლის ორაკული ხდება | Medium | bug | S | ✅ შესრულებულია |
| BUG-03 | `AlbumVault::relocate()` — ფაილის გადატანა DB-ტრანზაქციაშია, რომელიც მას ვერ აბრუნებს; არარსებულ ფაილზეც `path` იწერება | Medium | bug | M | ✅ შესრულებულია |
| BUG-04 | ალბომის წაშლა: vault → images update → delete სამი დაუცველი ნაბიჯია | Medium | bug | S | ✅ შესრულებულია |
| BUG-05 | ლექსიკონის „გადატანა" query-builder `update()`-ით მოდელის ჰუკებს გვერდს უვლის (`watched_at`, audit) | Medium | bug | M | ✅ შესრულებულია |
| BUG-06 | მასობრივი visibility-ცვლილება audit-ლოგში არ ჩანს | Medium | bug | S | ✅ შესრულებულია |
| BUG-07 | `ChatService::between()` — check-then-create race ორმაგ საუბარს ქმნის | Medium | bug | S | ✅ შესრულებულია |
| BUG-08 | `RunBatchItem` ყველა გამონაკლისს ყლაპავს — პარტია არასდროს „ჩავარდნილია" | Medium | bug | M | ✅ შესრულებულია |
| BUG-09 | `notes:remind`-ის `withoutOverlapping()` ვადის გარეშე 24 სთ-ით აჩერებს შეხსენებებს | Medium | bug | S | ✅ შესრულებულია |
| BUG-10 | toast-ის ავტო-დახურვის ტაიმერი პროვაიდერის ყოველ რენდერზე თავიდან იწყება | Medium | bug | S | ✅ შესრულებულია |
| BUG-11 | `key={i}` წაშლადი/გადაადგილებადი სტრიქონებზე სამ ფორმაში | Medium | bug | S | ✅ შესრულებულია |
| PERF-04 | `AdminModuleController::index()` — eager load იკარგება, N_users × N_modules × 2 query | Medium | performance | S | ✅ შესრულებულია |
| PERF-05 | Dashboard ~27 სერიული query ყოველ გახსნაზე | Medium | performance | M | ✅ შესრულებულია |
| PERF-06 | `MatchService::ranking()` ყოველ კანდიდატზე `modules`-ს თავიდან კითხულობს | Medium | performance | S | ✅ შესრულებულია |
| PERF-07 | `ModulePage` `DataTable`-ს არა-memo `columns`-ს აწვდის | Medium | performance | S | ✅ შესრულებულია |
| PERF-08 | ორივე ლოკალის JSON (360 kB) საწყის bundle-შია | Medium | performance | M | ✅ შესრულებულია |
| PERF-09 | პირადი დისკის grid „ყველა" რეჟიმში 1000 blob-XHR-მდე უშვებს | Medium | performance | M | ✅ შესრულებულია |
| GAP-03 | პარამეტრების შენახვის ჩავარდნა უხმაუროდ იყლაპება | Medium | gap | S | ✅ შესრულებულია |
| GAP-04 | read-only probe endpoint-ები POST-ია და `create` უფლებას ითხოვენ | Medium | gap | S | ✅ შესრულებულია |
| GAP-10 | `RolePage` მხოლოდ `super_admin`-ს ხატავს, თუმცა `/roles` `canAdmin('roles')`-ით იხსნება — role-granted ადმინი ცარიელ გვერდს ხედავს (SEC-03-ის შესრულებისას ნაპოვნი) | Medium | gap | S | ✅ შესრულებულია |
| GAP-11 | `APP_KEY`-ის შეცვლის შემდეგ ყველა per-user გასაღები ჩუმად „ცარიელი" ხდება — აპი shared-ზე ან „არაფერზე" ვარდება ახსნის გარეშე (SEC-12-ის შესრულებისას ნაპოვნი) | Medium | gap | S | ✅ შესრულებულია |
| DEBT-02 | `ActorWebPhotos.tsx`-ში ნამდვილი NUL ბაიტებია — ფაილს git/grep ბინარულად კითხულობს | Medium | debt | S | ✅ შესრულებულია |
| DEBT-03 | ახალი `PublicProfileController::photoFile()` (uncommitted) ტესტის გარეშეა | Medium | debt | S | ✅ შესრულებულია |
| DEBT-04 | `mediary:storage-recalc` ტესტის გარეშეა | Medium | debt | S | ✅ შესრულებულია |
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

### [SEC-13] ცოცხალ ბაზაში `user` როლს ოთხივე ადმინ-სექცია აქვს მინიჭებული
- **სტატუსი:** ✅ შესრულებულია (2026-09-18) — **კოდის ხარვეზი არაა, ეს მონაცემი იყო**; შენი გადაწყვეტილება: „მოვხსნა `user`-ს, ცალკე როლი nato_medic-ს".
  - ✅ ახალი, **არა-სისტემური** როლი `co_admin` („თანა-ადმინი" / „Co-admin", id 3, `sort_order` 3) — უფლებები ზუსტად ის, რაც `user`-ს ჰქონდა: 11 მოდული (`view`/`create`/`update`) + ოთხივე `admin:*`
  - ✅ `nato_medic` (user id 2) `co_admin`-ზეა → მისი წვდომა `/users`, `/roles`, `/requests`, `/audit`-ზე **უცვლელია**
  - ✅ `user` როლს ოთხივე `admin:*` გასაღები მოეხსნა → დარჩა მხოლოდ 11 მოდული; ე.ი. **ყოველი ახალი ანგარიში ადმინ-წვდომის გარეშე იბადება**
  - ⚠️ **გადაწყვეტილება ჩაწერილია:** `nato_medic`-ს ადმინ-წვდომა უნდა ჰქონდეს — მაგრამ **ცალკე როლით**. `co_admin` განზრახ `is_system = false`-ია: ის იშლება და უფლებები ეჭრება, `user`-ისგან განსხვავებით, და `User::creating`-ის backfill მას არასდროს ანიჭებს
  - ⚠️ ცვლილება **მოდელით** გაკეთდა, არა `UPDATE`-ით, ე.ი. `AuditObserver` ჩაეწერა: `audit_logs` #6492 (`create` role 3), #6493 (`update` user 2), #6494 (`update` role 2). `user_id` სამივეზე **`NULL`-ია** — CLI-ს `Auth::id()` არ აქვს; ეს ცნობილი და მოსალოდნელი ქცევაა, არა დანაკარგი
  - ℹ️ მიგრაცია **განზრახ არ დაიწერა**: სუფთა ინსტალაციაზე `user` როლი `admin:*`-ს არასდროს იღებს (`create_roles_table` + `ModulesSeeder`), ე.ი. მიგრაცია მხოლოდ ამ ერთი მანქანის მონაცემს ასწორებდა და ყველგან სხვაგან უაზრო no-op იქნებოდა
- **ტიპი:** security
- **სად:** `roles` ცხრილი, `key = user` (id 2) — ამ მანქანის ცოცხალი ბაზა; **არა** `database/migrations/…_create_roles_table.php`-ის ნაგულისხმევი
- **პრობლემა:** GAP-10-ის ცოცხალი შემოწმებისას `/roles/2` „11 მოდული · **4 ადმინის სექცია**"-ს აჩვენა. `roles.permissions` მართლაც შეიცავს `admin:users`, `admin:roles`, `admin:requests` და `admin:audit`-ს, თითოეულს `["view","create","update"]`-ით. ამ როლს **ერთი რეალური ანგარიში** ატარებს (`nato_medic`, user id 2).
- **რატომ:** `EnsureAdminAccess` სწორედ ამ გასაღებებს კითხულობს, ე.ი. ის ანგარიში **ახლა** ხსნის `/users`-ს (ყველა ანგარიშის სია, ელფოსტები, კვოტები), `/roles`-ს, `/requests`-ს და `/audit`-ს. SEC-02/SEC-03-ის შემდეგ `super_admin`-ად ვერ გახდება და ადმინ-სექციების შემადგენლობას ვერ შეცვლის, მაგრამ: სხვისი ანგარიშის რედაქტირება, გათიშვა და **წაშლა** (თავის ჭერამდე), მოთხოვნების დამტკიცება და აუდიტ-ლოგის კითხვა უფლების ფარგლებშია. ⚠️ `user` სისტემური როლია, ე.ი. **ყოველი ახალი ანგარიში** მას იღებს (`User::creating` backfill).
- **ისტორია (audit-ლოგიდან):** როლი 2026-09-15-ს **ოთხჯერ** დაარედაქტირა user id 1 (სუპერ-ადმინი) — `audit_logs` #2952, #2953, #2976, #3147, ყველა `update` / `subject = role 2`. ე.ი. ეს **მიგრაცია არ არის** და კოდის ცვლილებაც არა: მატრიცა ხელით შეინახა UI-დან (სავარაუდოდ „ყველა მოდულზე"/„ყველა" ღილაკის შემდეგ, სანამ ადმინ-ბარათებს read-only არ ჰქონდა — სწორედ ეს დაემატა GAP-10-ში).
- **გადაწყვეტა:** `/roles/2`-ზე ოთხივე ადმინ-სექციის მოხსნა და შენახვა (ერთი მოქმედება UI-დან, `super_admin`-ით), ან SQL-ით იმავე ოთხი გასაღების ამოღება. ⚠️ **განზრახ არ შესრულდა**: ცოცხალი უფლებების ცვლილება შენი გადაწყვეტილებაა და თუ ეს მინიჭება სპეციალურია (მაგ. `nato_medic` თანა-ადმინია), მოხსნა მას სექციებს დაუკეტავს.
- **Acceptance criteria:**
  - [x] `user` როლის `permissions`-ში `admin:*` გასაღები არ არის
  - [x] გადაწყვეტილება ჩაწერილია: `nato_medic`-ს ადმინ-წვდომა **უნდა ჰქონდეს**, და აქვს — ცალკე, არა-სისტემური `co_admin` როლით
- **Estimate:** S
- **დამოკიდებულება:** none

### [SEC-03] `admin:roles` უფლების მქონე საკუთარ როლს `admin:*` უფლებებს ამატებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `AdminRoleController::changesAdminZone()`: `super_admin`-ის გარდა არავის `store()`/`update()` ადმინ-სექციების (`admin:<resource>`) შემადგენლობას **არ ცვლის — არც დამატება, არც მოხსნა** → 403 `role_escalation`. ⚠️ მოხსნაც იკეტება, რადგან „მინიჭება მხოლოდ `super_admin`-ს" წესი ორივე მიმართულებით ადმინ-ზონის შემადგენლობას ეხება, და როლი მის **ყველა** მფლობელს ეხება. სხვის როლზე **მოდულების** რედაქტირება (უცვლელი `admin:*` ნაწილით) ჩვეულებრივ გადის — UI ყოველთვის მთელ მატრიცას აგზავნის
  - ✅ საკუთარი როლის **უფლებების** ნებისმიერი ცვლილება (მოდულისაც) → 422 `cannot_edit_own_role`; ⚠️ ჯერ ადმინ-ზონა (403), მერე „საკუთარი" — SEC-02-ის რიგი. სახელის გადარქმევა და უცვლელი მატრიცის (სხვა რიგით) ხელახლა გამოგზავნა გადის
  - ✅ `RoleApiTest`-ში 4 ახალი ტესტი (საკუთარ როლს `admin:users` · საკუთარი მოდულის უფლება vs გადარქმევა · `admin:*`-იანი ახალი როლი vs `super_admin` · სხვის როლიდან `admin:*`-ის მოხსნა vs მოდულის რედაქტირება). **მუტაციის შემოწმება:** `changesAdminZone()`-ის გამორთვაზე 3 ტესტი წითლდება, „საკუთარი როლის" შემოწმების გამორთვაზე — 1
  - ✅ SPA: `cannot_edit_own_role` `CODES`-შია და ორივე ლოკალში (`role_escalation` SEC-02-იდან უკვე არის)
  - ℹ️ UI-ში საკეტი ჯერ არ სჭირდება: `RolePage` დღეს **მხოლოდ `super_admin`-ს** ხატავს (`isAdmin`), თუმცა სია `canAdmin('roles')`-ით იხსნება — `admin:roles`-ის მქონე ცარიელ გვერდს ხედავს. ჩაიწერა GAP-10-ად (იქ UI-საკეტებიც)
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/Admin/AdminRoleController.php:43-55` (`cleanPermissions()`-ის allow-list `:106-111`)
- **პრობლემა:** `update()` მხოლოდ `super_admin` როლს იცავს (`! $role->isSuperAdmin()`), მაგრამ `cleanPermissions()` `admin:users`/`admin:roles`/`admin:requests`/`admin:audit` გასაღებებს უშვებს. `admin:roles.update`-ის მქონე `PUT /admin/roles/{own role}`-ით საკუთარ როლს `{"admin:users":["update"]}` ამატებს — და SEC-02-ის გზით `super_admin` ხდება. `store()`-საც იგივე ხვრელი აქვს.
- **რატომ:** ერთი სექციის უფლება (`admin:roles`) სრულ ადმინ-ზონამდე ესკალირდება — ზუსტად ის, რასაც `OwnershipTest::test_module_permissions_never_open_the_admin_zone` კრძალავს, მხოლოდ სხვა კარიდან.
- **გადაწყვეტა:** `admin:*` გასაღების მინიჭება მხოლოდ `super_admin`-ს შეეძლოს; მოქმედს საკუთარი როლის `permissions`-ის რედაქტირება აეკრძალოს (422 `cannot_edit_own_role`); `store()`-ზეც იგივე წესი.
- **Acceptance criteria:**
  - [x] `admin:roles` როლით საკუთარ როლზე `admin:users`-ის დამატება 403/422-ია (403 `role_escalation`)
  - [x] `admin:roles` როლით ახალი როლის შექმნა `admin:*` გასაღებით 403-ია; `super_admin`-ს შეუძლია
  - [x] `RoleApiTest`-ში ორივე შემთხვევა დაფარულია
- **Estimate:** S
- **დამოკიდებულება:** SEC-02

### [SEC-04] ჩატის მიმაგრებული ფაილი კლიენტის `Content-Type`-ით `inline` ბრუნდება — cross-account stored XSS
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ **`App\Support\SafeMime`** — ატვირთული ფაილის გაცემის ერთადერთი გზა (SEC-08 მასვე გამოიყენებს): MIME **ფაილის შიგთავსიდან** (`finfo`, local adapter-ის `mimeType()`), `inline` — მხოლოდ allow-list-იდან (raster-სურათი, ვიდეო, აუდიო, PDF, `text/plain`/`text/csv`/`application/json`), დანარჩენი `application/octet-stream` + `attachment`, ყოველთვის `nosniff`. ⚠️ SVG/HTML/XML სიაში განზრახ არ არის
  - ✅ ⚠️ allow-list აუდიტის მინიმუმს (jpeg/png/gif/webp · mp4/webm · pdf) **ცალკე გასწორდა**: ჩატი ვიდეოს `ogg`/`mov`/`m4v`-შიც იღებს (`UploadLimits`), და ისინი ფიქსის შემდეგ ჩამოსატვირთ ფაილად იქცეოდნენ
  - ✅ `ChatController::send()` `attachment_mime`-ს სერვერის `finfo`-ით ინახავს (`SafeMime::ofUpload()`), `file()` შენახულ სვეტს **საერთოდ არ კითხულობს** — ძველ რიგზე ის კლიენტის ჰედერი იყო
  - ✅ **`SetSecurityHeaders`** — `X-Content-Type-Options: nosniff` **გლობალურად** (`$middleware->append`), throttle/auth/404-ის პასუხების ჩათვლით; ⚠️ `/storage/*` სტატიკას Laravel-ის გარეშე web-სერვერი აწვდის და მას ეს არ ეხება
  - ✅ `ChatParityTest`-ში 4 ახალი ტესტი (HTML → ჩამოტვირთვა · ნამდვილი JPEG `text/html`-ად შეთხზული ჰედერით → `image/jpeg` შენახვაშიც, payload-შიც და პასუხშიც · JPEG/PDF კვლავ `inline` · `nosniff` JSON-ზე და 404-ზე). **მუტაციის შემოწმება:** `isInline()` → `true` და `ofUpload()` → კლიენტის MIME — 2 ტესტი წითლდება
  - ✅ backend 704/704, Pint მწვანეა
  - ℹ️ ძველ რიგებზე `messages.attachment_mime` კლიენტის ჰედერად რჩება (payload-ში ჩანს) — XSS-ის ვექტორი ეს არ არის (`file()` მას არ კითხულობს, ChatPage `type`-ით ხატავს), ამიტომ data-migration არ გაკეთდა
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/ChatController.php:421-428` (ვალიდაცია), `:438` (`getClientMimeType()`), `:462-467` (`response(..., 'inline')`)
- **პრობლემა:** დოკუმენტის ტიპი `['file', 'max:…']`-ია — ფორმატი არ იზღუდება; `attachment_mime` კლიენტის multipart ჰედერიდან იწერება და `file()` მას `Content-Type`-ად `inline`-ით აბრუნებს. A აგზავნის `.html`-ს `text/html`-ით → B-ს ბრაუზერში დოკუმენტად API-ს origin-ზე იხატება, B-ს ქუქით.
- **რატომ:** same-origin სკრიპტი `/sanctum/csrf-cookie`-ს იღებს და B-ს სახელით ნებისმიერ endpoint-ს უძახის — ანგარიშის მიტაცება ჩატის ერთი შეტყობინებით. მონაწილეობის შემოწმება არ შველის: B ლეგიტიმური მონაწილეა.
- **გადაწყვეტა:** კლიენტის MIME არასდროს დაბრუნდეს — სერვერზე `finfo`/`$disk->mimeType()`-ით განისაზღვროს; რენდერ-უსაფრთხო allow-list-ის (`image/jpeg|png|gif|webp`, `video/mp4|webm`, `application/pdf`) გარეთ ყველაფერი `application/octet-stream` + `Content-Disposition: attachment`; გლობალურად `X-Content-Type-Options: nosniff`.
- **Acceptance criteria:**
  - [x] `text/html`-ად გამოგზავნილი ფაილი `attachment`-ით და `octet-stream`-ით ბრუნდება
  - [x] JPEG/PDF კვლავ `inline` იხატება
  - [x] ყველა `file`-პასუხს `X-Content-Type-Options: nosniff` აქვს
  - [x] `ChatParityTest`-ში ტესტი: შეთხზული MIME სერვერის პასუხში არ ჩანს
- **Estimate:** M
- **დამოკიდებულება:** none

### [SEC-05] SVG დაშვებულია custom-field ფაილად და საჯარო დისკზე ხვდება — stored XSS API-ს origin-ზე
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `svg` `CustomFields::FILE_MIMES`-იდან ამოვიდა, კომენტარით: SVG/HTML/XML საჯარო დისკზე stored XSS-ია და არასდროს დაბრუნდეს
  - ✅ **დადასტურდა, რომ წესი ფორმატს შიგთავსიდან ადგენს**: ამ PHP-ის `finfo` SVG-ს (XML-prolog-ითაც) `image/svg+xml`-ად კითხულობს → `guessExtension()` = `svg`, ე.ი. `.png`-ად და `image/png`-ად შენიღბული SVG-ც 422-ია
  - ✅ `CustomFieldTest`-ში 2 ახალი ტესტი: `.svg` და შენიღბული SVG → 422 (ცხრილში რიგი და დისკზე ფაილი არ რჩება) · **აპის არც ერთი ატვირთვის სია** (`FILE_MIMES` + `UploadLimits::KINDS`-ის ყველა `mimes`) აქტიური კონტენტის 16 ფორმატიდან (svg/svgz/html/htm/xhtml/xht/xml/xsl/xslt/js/mjs/php/phtml/phar/shtml/swf) არც ერთს არ შეიცავს. **მუტაციის შემოწმება:** `svg`-ის დაბრუნებაზე 2-ივე წითლდება
  - ✅ ცოცხალ ბაზაში custom-field ფაილი საერთოდ არ არის, `storage/app/public`-ში `.svg` — 0, ე.ი. ძველი ფაილების მიგრაცია არ სჭირდება
  - ✅ backend 706/706, Pint მწვანეა; SPA SVG-ს არსად ახსენებს (`accept`-ი ან მინიშნება არ არის) — frontend-ის ცვლილება არ სჭირდება
- **ტიპი:** security
- **სად:** `backend/app/Support/CustomFields.php:54`; დისკის წესი `backend/app/Support/StorageFolder.php:154`, `:169`
- **პრობლემა:** `FILE_MIMES`-ში `svg`-ა; `CustomFieldService::storeFile()` ფაილს `<module>/fields`-ში წერს, რაც `PRIVATE_ROOTS`/`PRIVATE_FOLDERS`-ში არ არის (`notes`, `chat`, `backups` და ორი ქვესაქაღალდე მხოლოდ). ატვირთული `.svg` `/storage/movies/fields/<name>.svg`-ზე `image/svg+xml`-ით ავტორიზაციის გარეშე იხსნება და ბრაუზერი მასში სკრიპტს ასრულებს. (`UploadLimits`-ის `image` წესი SVG-ს გამორიცხავს — ხვრელი მხოლოდ აქაა.)
- **რატომ:** `/storage/*`-ის საჯაროობა შეგნებული წესია, აქტიური კონტენტის ფორმატი კი ამ დისკზე — არა; სკრიპტი API-ს origin-ზე ნებისმიერი ავტორიზებული მნახველის სესიით მოქმედებს.
- **გადაწყვეტა:** `svg` `FILE_MIMES`-იდან ამოღება; თუ საჭიროა — სერვერზე სანიტიზაცია + `text/plain`/`attachment`-ით მიწოდება მხოლოდ API-როუტიდან.
- **Acceptance criteria:**
  - [x] `POST /custom-fields/{module}/{id}/file` `.svg`-ზე 422-ს აბრუნებს
  - [x] `CustomFieldsTest`-ში ტესტი, რომ არც ერთი აქტიური-კონტენტის MIME `FILE_MIMES`-ში არ არის (`CustomFieldTest`)
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
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `move` `EnsureModulePermission::UPDATE_ENDPOINTS`-ში → `POST /gallery/images/move` `gallery.update`-ს ითხოვს; მიზეზის კომენტარი middleware-შიც და `routes/api.php`-შიც (ძველი „უფლება ცხადად `gallery`-ზეა" გასწორდა)
  - ⚠️ **გადაწყვეტა აუდიტის ფორმულირებიდან განსხვავდება, და ეს აუცილებელი იყო**: როუტზე `->middleware('permission:gallery,update')` **არ იმუშავდა** — ჯგუფის შიშველი `permission:gallery` რჩება და **ორივე** ეშვება, ე.ი. update-only როლი ჯგუფის `create`-შემოწმებაზე ისევ 403-ს მიიღებდა (ამისთვის `withoutMiddleware` + ცხადი middleware სჭირდებოდა). **ემპირიულად დადასტურდა**: აუდიტის ვარიანტზე `route:list -v` `EnsureModulePermission:gallery`-სა და `:gallery,update`-ს ერთად აჩვენებს, და update-only ტესტი 403-ს იღებს. `UPDATE_ENDPOINTS` ზუსტად ამ შემთხვევის დოკუმენტირებული მექანიზმია (`primary`, `unlock`, `lock`), და ბოლო სეგმენტი (`move`) ამბობს, რა ხდება — §A4-ის წესი დაცულია
  - ✅ `GalleryAlbumTest`-ში 2 ახალი ტესტი (create-only → 403 `gallery.update` და ფოტო უცვლელი · update-only → 200 და ფოტო გადაიტანდა). **მუტაციის შემოწმება:** `move`-ის ამოღებაზე 2-ივე წითლდება
  - ✅ backend 708/708, Pint მწვანეა; SPA გალერეის ქმედებებს უფლებით არ ფილტრავს — frontend-ის ცვლილება არ სჭირდება
- **ტიპი:** security
- **სად:** `backend/app/Http/Middleware/EnsureModulePermission.php:26`, `:47-57`; `backend/routes/api.php:626`, `:645-650`, `:672`
- **პრობლემა:** ჯგუფის middleware შიშველი `permission:gallery`-ა (მოქმედების არგუმენტის გარეშე), `UPDATE_ENDPOINTS`-ში `move` არ არის → `actionFor()` POST-ს `create`-ად კითხულობს. კომენტარი `:648-650` ამბობს, რომ „უფლება ცხადად `gallery` მოდულზეა" — ეს არასწორია.
- **რატომ:** create-only როლი არსებული ფოტოებს გადაარჭიმავს (ჩაკეტილ ალბომში/ალბომიდან ჩათვლით — ე.ი. დამალვა/გამოჩენა), view+update როლი კი უსაფუძვლო 403-ს იღებს — ზუსტად §A4-ის შეცდომა, რომელიც `/media/sync/{type}/{id}`-ზე გასწორდა.
- **გადაწყვეტა:** როუტს `->middleware('permission:gallery,update')` (წესი „მოქმედება მხოლოდ მაშინ გამოიყვანე, როცა ბოლო სეგმენტი ამბობს რა ხდება"); კომენტარი შესაბამისად გასწორდეს.
- **Acceptance criteria:**
  - [x] create-only როლით `POST /gallery/images/move` 403-ია, update-only როლით 200
  - [x] `GalleryAlbumTest`-ში ორივე ტესტი
- **Estimate:** S
- **დამოკიდებულება:** none

### [SEC-12] Telegram-ის ბოტის ტოკენი `module_user.settings`-ში ღია ტექსტადაა და `GET /api/modules` მას ბრაუზერს უბრუნებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-17) — კოდი, მიგრაცია, ტესტები **და ცოცხალ ბაზაზე migrate** (შენი ნებართვით, უსაფრთხოების dump-ის შემდეგ; dump-ი scratchpad-შია, git-ის გარეთ)
  - ⚠️ **ცოცხალ ბაზაზე პირველი გაშვება ჩავარდა, და ეს სწორი ქცევა იყო**: `user_credentials`-ის ერთადერთ რიგს (telegram, 2026-09-15) ამ მანქანის `APP_KEY` **ვეღარ შიფრავს** — ის ძველ კომპიუტერზე, სხვა გასაღებით დაშიფრდა. აპი (`UserCredential::fields()`) ასეთ რიგს ცარიელად თვლის, ე.ი. შეხსენებები **მხოლოდ pivot-ის ღია ასლის წყალობით** მუშაობდა. მიგრაცია `DecryptException`-ით ცვიოდა **ჩაწერამდე** (ბაზა უცვლელი დარჩა). გასწორდა: შეუშიფრავი რიგი pivot-ის მნიშვნელობით ახალი გასაღებით ხელახლა იწერება (⚠️ `save()`-ის dirty-შემოწმება ძველ მნიშვნელობასაც შიფრავს, ამიტომ original ჯერ `null`-ზე ჯდება) + ტესტი სხვა `APP_KEY`-ით დაშიფრულ რიგზე (მუტაციით დადასტურებული)
  - ✅ მეორე გაშვების შემდეგ: pivot-ში ღია გასაღები — 0; telegram credential ახლა **შიფრდება**; `NoteChannelSettings::for(user 1)` ტოკენს (46) და `chat_id`-ს (10) ისევ აბრუნებს — შეხსენებები მუშაობს, ოღონდ დაშიფრულიდან; note-pivot-ში ძველი `email` ნარჩენი უცვლელი (ე.ი. მიგრაცია ზუსტად ორ გასაღებს შლის)
  - ⚠️ ამ ფაქტიდან ახალი ტასკი: GAP-11 (`APP_KEY`-ის შეცვლის შემდეგ ყველა per-user გასაღები **ჩუმად** „ცარიელი" ხდება)
  - ✅ `ModuleSettings::RETIRED_KEYS` (`telegram_bot_token`, `telegram_chat_id`) — ერთი სია; `withoutRetired()` მათ `GET /api/modules`-იდანაც და `PUT /modules/{key}/settings`-ის პასუხიდანაც ამოჭრის; `merge()` მათ მოთხოვნიდან **არ ჩაწერს** (ძველი კლიენტი ღია ასლს ხელახლა არ შქმნის)
  - ✅ მიგრაცია `2026_09_17_000001_strip_plaintext_telegram_from_module_settings`: ⚠️ **ჯერ ავსება, ველ-ველ, მერე წაშლა** — `user_credentials`-ში ნაკლულ ველს pivot-იდან ავსებს (ტოკენიანი, მაგრამ `chat_id`-ის გარეშე ჩანაწერი `chat_id`-ს pivot-იდან იღებდა, ე.ი. ბრმა წაშლა შეხსენებას აჩუმებდა), უკვე მდგომ მნიშვნელობას **არ ცვლის**, მერე მხოლოდ ორ გასაღებს შლის; `down()` განზრახ არაფერს აბრუნებს. აუდიტის „მხოლოდ იქ, სადაც ჩანაწერი არსებობს" ვარიანტზე ეს უსაფრთხოა: ჩანაწერის არყოფნაზე ის **იქმნება** (Eloquent-ით, `encrypted:array`)
  - ✅ `NoteChannelSettings`-ის fallback დარჩა (ძველი dump-ის აღდგენისთვის)
  - ✅ `CredentialTest`-ში 3 ახალი ტესტი (`/modules` ტოკენის გარეშე, დანარჩენი ფენები ადგილზე · `PUT` ტოკენს ხელახლა არ წერს · მიგრაცია: ცარიელ credential-ზე ორივე ველი გადადის, ტოკენიანზე — თავისი ტოკენი რჩება და `chat_id` ივსება, pivot-იდან ქრება, ბაზაში ღიად არსად). **მუტაციის შემოწმება:** 3 მუტაცია (index-ის ფილტრი / merge-ის ფილტრი / backfill) — თითოეული ზუსტად თავის ტესტს აწითლებს
  - ✅ backend 712/712, Pint მწვანეა; CLAUDE.md-ის §21.9-ის „ძველი გასაღებები განზრახ რჩება" ფრაზა გასწორდა
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/ModuleController.php:46` (`user_settings` = pivot-ის მთელი JSON, ფილტრის გარეშე); `backend/app/Http/Resources/ModuleResource.php:37`; `backend/database/migrations/2026_09_15_000003_move_telegram_into_credentials.php` (ძველი გასაღებები „განზრახ" რჩება); fallback `backend/app/Services/Notes/NoteChannelSettings.php:49-50`
- **პრობლემა:** §21.9-ის მიგრაციამ ტოკენი `user_credentials`-ში დაშიფრულად **დააკოპირა**, `telegram_bot_token`/`telegram_chat_id` კი pivot-ში დატოვა. `ModuleController::index()` pivot-ის settings-ს ყოველ მოდულზე `user_settings`-ად აბრუნებს, ე.ი. `note` მოდულის ყოველ სიაში ტოკენი ღიად ბრაუზერს ეგზავნება — ზუსტად ის, რის გამოც §21.9 გაკეთდა. იგივე ღია ტოკენი ყოველ dump-ში (`mediary_backup.sql`, 4 კომიტებული ვერსია) და `/backups`-ის ყოველ ფაილში ხვდება. SEC-01-ის შესრულებისას დადასტურდა: მნიშვნელობის სიგრძე 46 (მნიშვნელობა არ დაიბეჭდა).
- **რატომ:** ტოკენი ბოტზე სრულ წვდომას იძლევა; `user_credentials`-ის ნიღაბი და „ნახვა ცხადი მოქმედებაა" დაპირება pivot-ის ღია ასლის გამო არაფერს ნიშნავს.
- **გადაწყვეტა:** მიგრაცია, რომელიც ორ გასაღებს `module_user.settings`-იდან **მხოლოდ** იმ რიგებზე ამოჭრის, სადაც `user_credentials`-ში telegram-ის ჩანაწერი უკვე არსებობს (დანარჩენი JSON — ველები, გალერეა, `status_sections` — უცვლელი); `ModuleController::index()`-ში ეს ორი გასაღები თავდაცვითადაც ამოიჭრას; `NoteChannelSettings`-ის fallback-ი ძველი dump-ის აღდგენისთვის დარჩეს ან ავტომატურ გადატანით ჩანაცვლდეს.
- **Acceptance criteria:**
  - [x] `GET /api/modules`-ის პასუხში `telegram_bot_token` არ ჩანს (ტესტი)
  - [x] მიგრაციის შემდეგ `module_user.settings`-ში ტოკენი არ არის, დანარჩენი გასაღებები უცვლელია (ტესტი + ცოცხალი ბაზა)
  - [x] Telegram-ის შეხსენება `user_credentials`-იდან კვლავ მიდის (`NoteChannelSettings::for()` მიგრაციის შემდეგ — ტესტი)
- **Estimate:** S
- **დამოკიდებულება:** none (ძველი ტოკენის როტაცია SEC-01-შია)

### [BUG-01] დადასტურების დიალოგის ღილაკები ქართულად არის hardcoded — ინგლისურ UI-შიც
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `FeedbackProvider`: `useTranslation()`, ნაგულისხმევ ღილაკებზე `t('confirm.cancel')`/`t('confirm.confirm')` (ორივე გასაღები ორივე ლოკალში უკვე იყო)
  - ✅ `errorMessage()`-ის fallback — `i18n.t('toast.error')` default პარამეტრად, ე.ი. **ყოველ გამოძახებაზე** მიმდინარე ენით; ⚠️ `errors.generic` ახალ გასაღებად **არ** შეიქმნა — `toast.error` („Something went wrong" / „დაფიქსირდა შეცდომა") ზუსტად ამ ფაქტს ორივე ენაზე უკვე ამბობდა
  - ✅ `src/components/ui/feedback.test.ts` (`react-dom/client` + `act`, ბიბლიოთეკის გარეშე): ინგლისურ UI-ში ორივე ღილაკი ინგლისურია და ქართული literal არსად · ქართულ UI-ში ტექსტი ლოკალიდანაა · `errorMessage`-ის fallback ენას მიჰყვება. **მუტაციის შემოწმება:** literal-ების დაბრუნებაზე 2 ტესტი წითლდება
  - ✅ `npm run build` და lint (exit 0) მწვანეა; Vitest 121/128 — 7 წითელი **მხოლოდ** `NoteReminders.test.ts`-შია (უწინდელი DEBT-12, BUG-01-ს არ ეხება)
- **ტიპი:** bug
- **სად:** `frontend/src/components/ui/feedback.tsx:137-147`; `frontend/src/lib/errors.ts:100`
- **პრობლემა:** `confirmState.cancelText ?? 'გაუქმება'` და `confirmText ?? 'დადასტურება'`; `errorMessage(e, fallback = 'შეცდომა')`. 49 `confirm({` გამოძახებიდან უმეტესობა `cancelText`-ს არ აწვდის, ე.ი. ინგლისურ ინტერფეისში თითქმის ყველა დესტრუქციული დიალოგს ქართული „გაუქმება" ღილაკი აქვს. `confirm.confirm`/`confirm.cancel` გასაღებები ლოკალებში უკვე არსებობს (`en.json:680-681`).
- **რატომ:** მომხმარებლისთვის ხილული, ყველა წაშლის დიალოგზე; ინგლისურენოვანი მომხმარებელი ვერ კითხულობს, რომელი ღილაკი აჩერებს წაშლას.
- **გადაწყვეტა:** `FeedbackProvider`-ში `useTranslation()` და default-ები `t('confirm.cancel')`/`t('confirm.confirm')`; `errorMessage`-ის fallback `t('errors.generic')`-ის მსგავს გასაღებზე.
- **Acceptance criteria:**
  - [x] `grep -n "'გაუქმება'\|'დადასტურება'\|'შეცდომა'" src/components/ui/feedback.tsx src/lib/errors.ts` ცარიელია
  - [x] ინგლისურ UI-ში confirm-ის ორივე ღილაკი ინგლისურია (Vitest კომპონენტ-ტესტი `react-dom/client`-ით)
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-01] backend-ის 26 მანქანური კოდი ფრონტში არ ითარგმნება — toast-ში snake_case ჩანს
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ⚠️ **აუდიტის grep-მა 26 დათვალა, სინამდვილეში 39 აკლდა.** `'message' => '…'` კოდის ერთადერთი ფორმა არ არის: არის მრავალხაზიანი `abort_unless(…, 403, 'code')`, `ChatService::fail('code')` და `['reason' => 'code']`, რომელსაც კონტროლერი `message`-ად აბრუნებს (`GenreRemover`, `AdminRequestController`) — ე.ი. ერთხაზიან grep-ზე დაყრდნობა თავადვე იყო ხარვეზის წყარო
  - ✅ `CODES` 43 → 82; ყველა 68 backend-კოდი მასშია (`comm -23` ცარიელია), ყველას აქვს `errors.*` ორივე ლოკალში (2678 = 2678 გასაღები, ცალმხრივი და ცარიელი — არცერთი)
  - ⚠️ `approval_required` **202-ია და არა შეცდომა** (ჟანრის წაშლა → მოთხოვნა) — axios მას არასდროს აგდებს, სიაშია მხოლოდ იმისთვის, რომ „backend-ის ყველა კოდი ⊆ CODES" წესს გამონაკლისი არ ჰქონდეს
  - ⚠️ `module_disabled` და `module_not_enabled` ერთი ფაქტია (`hasModule()` false) ორი ადგილიდან — ტექსტიც ერთია, თორემ ერთი და იგივე უარი ორნაირად იკითხებოდა
  - ✅ **ორი ტექსტი პარამეტრს ითხოვდა და `errorMessage()` მას არ გადასცემდა** — `forbidden_permission` ცარიელ ფრჩხილებს ხატავდა და `custom_field_file_limit` `{{max}}`-ს სიტყვასიტყვით: `permission` (სტრიქონი) და `max` (რიცხვი, მაგრამ **არა ბაიტები** — `formatBytes` მას გააფუჭებდა) ახლა გადადის
  - ✅ `StatusController::guard()` ერთადერთი იყო, ვინც `forbidden_permission`-ს `permission`-ის გარეშე აბრუნებდა (`abort_unless`-ს მესამე ველი არ აქვს) — ოთხივე გამომშვები ახლა ერთ ფორმას აბრუნებს
  - ✅ `frontend/src/lib/errors.test.ts` (7 ტესტი) — `CODES` ⊆ ორივე ლოკალი და „არცერთი კოდი toast-ში ნედლად არ ხვდება"; `CODES` მხოლოდ ამისთვის გახდა `export`
  - ⚠️ ეს ტესტი **FEAT-01-ს არ ცვლის**: ის `CODES` ↔ ლოკალს ამოწმებს, backend ↔ `CODES` კავშირს კი ვერა (frontend-ის ტესტი PHP-ს ვერ კითხულობს)
  - ℹ️ `python frontend/src/i18n/audit.py` ამ მანქანაზე **ვერ გაეშვა — Python აქ არ არის** (მხოლოდ Microsoft Store-ის shim-ია); ლოკალების სინქრონი Node-ით შემოწმდა, იგივე კრიტერიუმით
- **ტიპი:** gap
- **სად:** `frontend/src/lib/errors.ts:9-109` (`CODES` და `includes` შემოწმება); მაგ. `backend/app/Http/Middleware/EnsureModuleEnabled.php:27`
- **პრობლემა:** `grep -rhoE "'message' => '[a-z_]+'" backend/app | sort -u` 50 კოდს იძლევა, `CODES`-ში 40-ია; აკლია: `already_reviewed approval_required cannot_delete_self cannot_disable_self custom_field_file_limit file_not_found forbidden forbidden_permission invalid_target_genre invalid_type invalid_url last_super_admin module_already_enabled module_disabled module_inactive module_not_enabled module_not_shareable no_tmdb_id not_found nothing_selected primary_not_supported_for_cast registration_disabled role_in_use system_role too_many_videos worker_unavailable`. `errorMessage()` უცნობ კოდს სიტყვასიტყვით აბრუნებს.
- **რატომ:** CLAUDE.md-ის წესი — „`message` *არის* მანქანური კოდი და ყველა კოდი `CODES`-შია და ორივე ლოკალში" — 26 კოდზე დარღვეულია; `module_not_enabled` middleware-დან ნებისმიერ მოდულურ როუტზე მოდის, `registration_disabled` რეგისტრაციის ფორმაზე.
- **გადაწყვეტა:** 26 კოდი `CODES`-ში და `errors.*`-ში `ka.json`/`en.json`-ში; მუდმივი დაცვა — FEAT-01.
- **Acceptance criteria:**
  - [x] `comm -23 <(backend codes) <(CODES)` ცარიელია
  - [x] ორივე ლოკალი სინქრონშია (Node-ით — Python ამ მანქანაზე არ არის)
  - [x] `registration_disabled` 403-ზე toast-ში თარგმნილი ტექსტი ჩანს
- **Estimate:** M
- **დამოკიდებულება:** none

### [GAP-02] 419 (CSRF/სესიის ვადა) და ქსელის ჩავარდნა axios-ში არ მუშავდება
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ **419 → ერთი განახლება + გამეორება.** `api.ts`-ის interceptor `ensureCsrfCookie()`-ს იძახებს და **იმავე `config`-ს** უშვებს ხელახლა; მარკერი `config._csrfRetried` თვითონ config-ზეა (გლობალური დროშა ერთდროულად ჩავარდნილ მეორე მოთხოვნას ცდას დაუმსახურებლად ჩამოართმევდა)
  - ⚠️ **POST-ის გამეორება აქ ორმაგ ჩანაწერს ვერ შექმნის, და სწორედ ეს ამართლებს გამეორებას:** CSRF-ს `EnsureFrontendRequestsAreStateful`-ის pipeline ამოწმებს — `$next($request)`-**მდე** —, ე.ი. 419 ნიშნავს, რომ მოთხოვნა კონტროლერამდე საერთოდ არ მისულა. სხვა სტატუსზე ასეთი გამეორება დაუშვებელი იქნებოდა
  - ⚠️ **ახალი ტოკენი ხელით არსად იწერება** — დადასტურდა `node_modules/axios/lib/helpers/resolveConfig.js`-ში: axios `X-XSRF-TOKEN`-ს ყოველ **გაგზავნაზე** ქუქიდან კითხულობს და `headers.set()`-ით გადააწერს; `_config`-ი `mergeConfig`-ის ასლია, ე.ი. თავდაპირველი `config` არ ბინძურდება (FormData-ს boundary-ის პრობლემა არ დგება)
  - ✅ **მეორე 419 → `UNAUTHENTICATED_EVENT`** (login/register-ის გარდა — იქ შეცდომა ფორმაშივე ჩანს)
  - ✅ **ქსელი:** `!e.response` → `errors.network`. ⚠️ `ERR_CANCELED` **გამორიცხულია**: მასაც ცარიელი `response` აქვს, მაგრამ ის მომხმარებლის ქმედებაა — გლობალურ ძებნაში ყოველი აკრეფილი ასო წინა მოთხოვნას წყვეტს, ე.ი. „შეამოწმე ინტერნეტი" ყოველ ასოზე დაიწერებოდა
  - ✅ **419-ის ტექსტი backend-ს დაუბრუნდა და არა სტატუსზე მიბმულ გამონაკლისს:** Laravel `message`-ად `'CSRF token mismatch.'`-ს წერდა (ინგლისური **წინადადება**, და არა მანქანური კოდი — იგივე დარღვევა, რასაც GAP-01 დაუთმო ტასკი). `bootstrap/app.php` მას `csrf_token_mismatch`-ად აქცევს, `upload_too_large`-ის პრეცედენტით
  - ⚠️ **`map()` და არა `render()`, და ეს არჩევანი გემოვნების არაა:** `Handler::render()` ჯერ `prepareException()`-ს იძახებს, რომელიც `TokenMismatchException`-ს **უკვე** `HttpException(419)`-ად აქცევს, და მხოლოდ მერე ეძებს `render()`-ის callback-ებს — `render(function (TokenMismatchException …))` ჩუმად არასდროს გაისვრებოდა (გადამოწმდა framework-ის კოდში)
  - ✅ **დამატებით გასწორდა 401, და ეს გაფართოება შეგნებულია:** მხოლოდ 419 სიმპტომს ადგილზე დატოვებდა — ვადაგასული სესიის **პირველი** მოთხოვნა, როგორც წესი, ფონური poll-ია (ჩატი 30 წმ, შეხსენებები), ე.ი. **GET**, რომელსაც CSRF არ ეკითხება და პირდაპირ `auth:sanctum`-ზე ცვივა. Laravel იქ `'Unauthenticated.'`-ს წერდა → ახლა `unauthenticated`
  - ⚠️ 401-ს `render()` სჭირდება და არა `map()` — `prepareException()` `AuthenticationException`-ს არ გარდაქმნის (`default => $e`). ერთი და იგივე პრობლემა, ორი სხვადასხვა კაკვი; callback არა-JSON მოთხოვნაზე `null`-ს აბრუნებს, თორემ ბრაუზერის გადამისამართება დაიკარგებოდა
  - ✅ ორივე ახალი კოდი `CODES`-შია და ორივე ლოკალში (`errors.network` კი frontend-ის საკუთარი ტექსტია — backend-ს ის არასდროს აბრუნებს). ⚠️ ორივე **`bootstrap/app.php`-შია და არა `backend/app`-ში** — FEAT-01-ის სკანერმა ეს უნდა იცოდეს
  - ✅ **ტესტები ცარიელ ადგილას არ დგას:** `api.test.ts`-ის სამი 419-ტესტი ძველ `api.ts`-ზე ცვივა, `AuthTest`-ის ორივე ახალი ტესტი ძველ `bootstrap/app.php`-ზე — და სწორედ იმ ინგლისური ტექსტებით (`'CSRF token mismatch.'`, `'Unauthenticated.'`), რომლებზეც ტასკი წერია. ბიბლიოთეკა არ დამატებულა: `axios`-ის სატესტო ტრანსპორტი `defaults.adapter`-ის ერთი ფუნქციაა
- **ტიპი:** gap
- **სად:** `frontend/src/lib/api.ts:51-60`
- **პრობლემა:** interceptor მხოლოდ `status === 401`-ს იჭერს. Sanctum cookie-რეჟიმში `XSRF-TOKEN`-ის ვადის ამოწურვაზე Laravel **419**-ს აბრუნებს (`grep -rn 419 frontend/src backend/app` — არაფერი); `!error.response` (ქსელი) არსად არ არის განსხვავებული.
- **რატომ:** ღია ტაბში ორი საათის შემდეგ ყველა მუტაცია „Request failed with status code 419" ინგლისურ toast-ით ცვივა, სანამ მომხმარებელი ხელით არ გადატვირთავს; ქსელის გათიშვა ინგლისურ „Network Error"-ად ჩანს UI-ს ენის მიუხედავად.
- **გადაწყვეტა:** 419-ზე `/sanctum/csrf-cookie`-ს ერთხელ ხელახლა წამოღება და მოთხოვნის გამეორება, მეორე 419-ზე `UNAUTHENTICATED_EVENT`; `errorMessage()`-ში `!e.response` → `t('errors.network')`.
- **Acceptance criteria:**
  - [x] 419-ის სიმულაციაზე მოთხოვნა ერთხელ მეორდება და წარმატებით სრულდება
  - [x] ქსელის შეცდომა UI-ს ენაზე თარგმნილი ტექსტით ჩანს
  - [x] Vitest ტესტი interceptor-ზე (axios-ის `defaults.adapter` — ბიბლიოთეკის გარეშე)
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-01] `User::hasModule()` ყოველ გამოძახებაზე DB-ს ეკითხება და ციკლებშია
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `hasModule()` და `isGrantedModule()` `loadMissing('modules')`-ს იყენებენ და პასუხს **მეხსიერებიდან** აძლევენ; super_admin-ის შტოს (მოდული pivot-ის გარეშეც აქვს) აქტიური key-ების per-instance მემო ემსახურება
  - ⚠️ **`loadMissing()` და არა საკუთარი მემო** — ეს Eloquent-ის საკუთარი რელაციის ქეშია, ე.ი. `with('modules')`-ით წამოღებული სია ავტომატურად იკითხება და გაუქმებაც ჩვეულებრივი `refresh()`/`unsetRelation()`-ია. საკუთარი მემო მესამე მექანიზმი იქნებოდა იმავე ფაქტზე
  - ⚠️ **სტალურობის გზა დღეს არ არსებობს და ეს შემოწმებულია, და არა ნავარაუდევი**: `setEnabled()`/`syncModules()`/`approveModule()` ჯერ ამოწმებენ და მერე წერენ, `register()` ბოლოს `load('modules')`-ს (და არა `loadMissing`-ს) იძახებს, ხოლო `enabledModules()`/`moduleKeys()` ისედაც ყოველ ჯერზე ბაზას კითხულობენ. წესი docblock-შია ჩაწერილი
  - ✅ **გაზომილი, ყოველ მოთხოვნაზე ახალი `User` ინსტანციით** (თორემ წინა მოთხოვნის ქეში შედეგს ალამაზებს): `/api/dashboard` 25 → **15** query (`module_user` 11 → **1**), `/api/gallery` 43 → **30** (14 → **1**), `/api/gallery/groups?by=record` 14 → **8** (7 → **1**), `/api/modules` 28 → **8** (13 → **3**), `/api/admin/modules` **164 → 11** (133 → **1**)
  - ✅ `DashboardTest::test_the_dashboard_asks_the_module_pivot_once` — ძველ მოდელზე ცვივა სიტყვებით „11 is identical to 1", ე.ი. ზუსტად ის რიცხვი, რომელზეც ტასკი წერია. ⚠️ **მთლიანი query-რაოდენობა განზრახ არ მოწმდება** — ის ყოველი ახალი მრიცხველით შეიცვლება და ტესტი მყიფე გახდებოდა
  - ⚠️ **PERF-04-ის დიაგნოზი არასწორი აღმოჩნდა და იმავე დღეს გასწორდა (იხ. PERF-04).** ის ამტკიცებს, რომ „PERF-01-ის შემდეგ ავტომატურად წყდება" — არ წყდება: `/api/admin/modules` კვლავ **წრფივია** მომხმარებელთა რიცხვზე (3 → 9, 12 → 18, 30 → 36 query). მიზეზი pivot არაა (ის უკვე 1-ია), არამედ **`role`-ის eager load-ის არყოფნა**: `User::with('modules')` `role`-ს არ იღებს, `users_list` კი ყოველ მომხმარებელზე `roleKey()`/`isSuperAdmin()`-ს ეკითხება — 12 მომხმარებელზე 18 query-დან **14 `roles`-ზეა**
- **ტიპი:** performance
- **სად:** `backend/app/Models/User.php:197-206`; გამომძახებლები მაგ. `backend/app/Http/Controllers/Api/DashboardController.php:71-75`
- **პრობლემა:** `$this->modules()->where(...)->first()` query-builder-ია — eager-loaded `modules` რელაციას იგნორირებს. `foreach ($modules as $module) { if (! $user->hasModule($module->key)) …}` შაბლონი Dashboard-ში, `GalleryController`-ში, `ModuleImages`-ში, `GlobalSearch`-ში, `MediaDomain`-ში და `AdminModuleController`-შია — თითო გვერდზე 10–14 ზედმეტი query.
- **რატომ:** მთავარი გვერდი, გალერეის ინდექსი და ყოველი გლობალური ძებნა სერიულად 10+ round-trip-ს იხდის იმ პასუხისთვის, რომელიც უკვე მეხსიერებაშია.
- **გადაწყვეტა:** `loadMissing('modules')` + `$this->modules->firstWhere('key', $key)`-ით პასუხი; ან per-instance memo `array $moduleCache`.
- **Acceptance criteria:**
  - [x] `GET /api/dashboard`-ზე `DB::getQueryLog()`-ში `module_user`-ის query ერთია
  - [x] `DashboardTest`-ში query-რაოდენობის assertion
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-02] `PublicGallery::publicCastIds()` — N+1 ავტორიზაციის გარეშე endpoint-ზე
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `publicCastIds()` pivot-ს პირდაპირ კითხულობს — თითო დომენზე **ერთი** `castables`-query, ჩანაწერ-ჩანაწერ `$record->cast()->pluck()`-ის ნაცვლად
  - ✅ **გაზომილი** (`/public/profiles/alice` და `/gallery-photos`, ორივე ავტორიზაციის გარეშე): 5 ფილმი 16/15 → 10/9 query, 25 ფილმი 36/34 → **9/7**, 60 ფილმი 71/69 → **9/7** — ე.ი. წრფივობა გაქრა
  - ⚠️ **`castable_type`-ად დომენის key გამოიყენება და არა `getMorphClass()`** — `query()`-შივე `imageable_type` ზუსტად ასე დარდება (`movie`/`series`/`anime` morph-რუკის სახელებია). ორი კონვენცია ერთ ცხრილზე ზუსტად ის არის, რაც ერთ დღეს გაშორდება
  - ✅ **`publicIds()` მემოშია, და ეს ცალკე ხარვეზი იყო**: ერთსა და იმავე დომენს სამფენიანი საჯარო query **ორჯერ** ეკითხებოდა — ჯერ ჩანაწერის ფოტოებისთვის, მერე `publicCastIds()`-იდან მსახიობებისთვის. ინსტანცია ერთი მოთხოვნისაა (კონტროლერში ინჯექტირებული), ე.ი. მეხსიერება იმაზე დიდხანს არ ცოცხლობს
  - ⚠️ **სემანტიკა უცვლელია და ეს შემოწმებულია, და არა ნავარაუდევი**: `castables.cast_member_id`-ს `cascadeOnDelete` აქვს, ე.ი. ობოლი pivot-რიგი ვერ იარსებებს და `cast_members`-თან join-ის მოხსნა შედეგს ვერ შეცვლის; `cast()`-ის `orderByPivot` კი id-ების სიმრავლეს არაფერს მატებდა
  - ⚠️ **ტესტში ერთი „გასათბობი" მოთხოვნაა**: პირველი გამოძახება ერთჯერად query-ებსაც აკეთებს (მოდულების კეში) — მის გარეშე ტესტი ორ სხვადასხვა რამეს შეადარებდა და ცრუ განსხვავებას აჩვენებდა. ძველ კოდზე ცვივა სიტყვებით „39 is identical to 13"
- **ტიპი:** performance
- **სად:** `backend/app/Services/Profile/PublicGallery.php:212-220`
- **პრობლემა:** ყოველ საჯარო ჩანაწერზე `$record->cast()->pluck('cast_members.id')` ცალკე query-ა; `show()` `count()`-ით და გალერეის ტაბი `page()`-ით ორივე `query()`-ს იძახებს — 500 საჯარო ფილმზე 1000+ query ერთ ანონიმურ გახსნაზე.
- **რატომ:** ეს ერთადერთი დომენური endpoint-ია `auth:sanctum`-ის გარეთ, ე.ი. ავტორიზაციის გარეშე გამოძახებადი DoS-ვექტორი და ნელი საჯარო გვერდი.
- **გადაწყვეტა:** დომენზე ერთი pivot-query: `DB::table('castables')->where('castable_type', $morph)->whereIn('castable_id', $ids)->pluck('cast_member_id')`; `query($user)`-ის შედეგი მოთხოვნის ფარგლებში memo-ში.
- **Acceptance criteria:**
  - [x] `PublicGalleryTest`-ში query-რაოდენობა ჩანაწერების რიცხვზე არ არის დამოკიდებული (4 vs 30 ფილმი)
  - [x] პასუხის შიგთავსი უცვლელია (`PublicGalleryTest`/`PublicProfileTest`/`MatchTest` — 42 ტესტი)
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-03] `usedByModule()` ყოველ ატვირთვაზე მომხმარებლის მთელ ფაილ-ინვენტარს აგებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `files()`-ს დაემატა `?string $only` — მოდულის **მინიშნება**, რომელიც სხვა მოდულის ბლოკებს აღარ ეკითხება. გაზომილი `POST /notes/{id}/files`-ზე: 1 ფაილი 42 → **15** query, 5 ფაილი 176 → **41**, 10 ფაილი 346 → **76** (თითო ფაილის ფასი 34 → 7)
  - ⚠️ **„რა ითვლება"-ს მეორე განმარტება არ გაჩენილა, და სწორედ ეს იყო ამოცანის რთული ნაწილი.** ცალკე `SUM(size)` query-ები `usedByModule()`-ის docblock-ის საკუთარ წესს დაარღვევდა (ლიმიტი და ჯამი დროთა განმავლობაში სხვადასხვას აჩვენებდა). აქ იგივე კოდი რჩება — უბრალოდ ზედმეტ ცხრილს აღარ კითხულობს
  - ⚠️ **`where('module', …)` შემორჩა განზრახ**: მინიშნება მხოლოდ სისწრაფეა და არა სიმართლე, ე.ი. გამოტოვებული ბლოკი მხოლოდ ნელია და არასდროს არასწორი
  - ✅ **`test_the_module_hint_never_changes_the_answer`** — ეს ის ფასია, რომელსაც მინიშნება იხდის: 14 მოდულზე (ავატარი, სამივე პოსტერი, ვიდეოს თამბნეილი/ჩამოტვირთვა/ფაილი, სიმღერა, ბუკმარკი, წიგნი, ბორდგეიმი, თამაში, ჩანაწერი, გალერეა, ჩატი, ბექაპი, custom-field) მინიშნებით და მის გარეშე პასუხი ზუსტად ერთი უნდა იყოს. **არასწორად გამოტოვებული ბლოკი სხვაგვარად ჩუმი იქნებოდა** — ლიმიტი უბრალოდ ცოტა უფრო გვიან ჩაირთვებოდა
  - ⚠️ **memo (ტასკის მეორე ვარიანტი) აქ არასწორი იქნებოდა და არა უბრალოდ ზედმეტი.** ატვირთვა პაკეტურია (`files[]`, `UploadLimits::MAX_FILES`) და რიგი **ციკლის შიგნით** ჩნდება — `storeUpload()` არგუმენტად გამოიძახება, ე.ი. მე-2 ფაილის შემოწმების დროს პირველის რიგი უკვე არსებობს. ერთხელ აღებული სურათი მე-2…N-ე ფაილს ძველ ჯამზე შეამოწმებდა და მოდულის ლიმიტი ჩუმად გადაცდებოდა — ზუსტად ის, რასაც acceptance criteria კრძალავს
  - ✅ **`test_an_upload_does_not_scan_other_modules`** — ვიდეოს ლიმიტის შემოწმება `gallery_images`-ს, `messages`-ს, `database_backups`-ს, `book_files`-ს, `game_files`-სა და `note_entry_files`-ს აღარ კითხულობს, `video_files`-ს კი კითხულობს. ძველ კოდზე ცვივა სიტყვებით „ვიდეოს ლიმიტის შემოწმებამ gallery_images წაიკითხა"
  - ℹ️ `guardModule()` ისედაც ადრევე ბრუნდება, თუ მოდულს **ალოკაცია არ აქვს** — ე.ი. ხარვეზი მხოლოდ იმ ანგარიშებს ეხებოდა, ვინც მოდულური ლიმიტი თვითონ დააყენა
- **ტიპი:** performance
- **სად:** `backend/app/Services/Storage/StorageMeter.php:883-886`; გამოძახება `:1175` (`guardModule`), `:1266-1268` (`claim`)
- **პრობლემა:** `files($user)` ~20 ცხრილის სრული ინვენტარია (`:135`-დან, თითო custom-field ცხრილზე `DB::table()->get()`); `usedByModule()` მას `->where('module')->sum('size')`-ით კითხულობს და `claim()` ყოველ ფაილზე იძახებს, როცა მომხმარებელს მოდულური ალოკაცია აქვს.
- **რატომ:** 20-ფაილიანი ატვირთვა ინვენტარს 20-ჯერ აგებს — ატვირთვის hot path-ზე.
- **გადაწყვეტა:** მოდულზე მიზნობრივი `SUM(size)` query-ები წყარო-ცხრილებიდან, ან `files()`-ის შედეგის request-scoped memo `user_id`-ზე.
- **Acceptance criteria:**
  - [x] `StorageManagementTest`-ში ატვირთვა სხვა მოდულების ცხრილებს საერთოდ არ კითხულობს
  - [x] `module_quota_exceeded` კვლავ ზუსტად იმავე ზღვარზე ბრუნდება (მინიშნების იდენტურობის ტესტი + არსებული ზღვრის ტესტი)
- **Estimate:** M
- **დამოკიდებულება:** none

### [DEBT-01] TypeScript `strict` მთელ აპში გამორთულია
- **სტატუსი:** ✅ შესრულებულია (2026-09-17)
  - ✅ `"strict": true` `tsconfig.app.json`-ში **და** `tsconfig.node.json`-ში; `npm run build` მწვანეა, `npm test` 129 ტესტი მწვანე, oxlint სუფთა
  - ⚠️ **ჩართვამ არცერთი შეცდომა არ გამოიღო — და სწორედ ეს არის მთავარი დასკვნა.** კოდი უკვე ასე იყო დაწერილი (`any`/`@ts-ignore` პროექტში ნულია), ე.ი. ეს დღევანდელი გასწორება კი არაა, არამედ **ბოქლომი**: ხვალ დაწერილი `function f(x)` აღარ გაივლის. `@ts-expect-error` ერთიც არ დასჭირვებია (კრიტერიუმი ≤ 10-ს უშვებდა)
  - ✅ **გადამოწმდა ცხადად, რომ შემოწმება ვაკუუმში არ დგას**: დროებითი `function probe(x)` + `const s: string = null` სწორედ TS7006-სა და TS2322-ს აბრუნებს, ე.ი. `noImplicitAny`-ც და `strictNullChecks`-იც ნამდვილად მუშაობს
  - ⚠️ **`noUncheckedIndexedAccess` განზრახ არ ჩაირთო** (ტასკი მას „სასურველად" ასახელებდა და acceptance criteria-ში არ იყო). გაზომილი: **37 შეცდომა 19 ფაილში**, და დიდი ნაწილი `if (xs.length) xs[0]`-ის ფორმისაა — უსაფრთხო, უბრალოდ კომპილატორისთვის უხილავი (`PublicProfilePage:71`, `VisibilityManager:80`, `queue.tsx`, ხუთი ტესტ-ფაილი). მისი ჩვეული პასუხი `!`-ია, რაც შემოწმებას თვითონვე აუქმებს: ხმაური დაემატებოდა, უსაფრთხოება — არა
  - ℹ️ **ერთი ნამდვილი ხვრელი მან მაინც აჩვენა და ის ჯერ ღიაა**: `lib/errors.ts`-ის `fieldErrors()` `v[0]`-ს `Record<string, string>`-ად აცხადებს — ცარიელ მასივზე იქ `undefined` აღმოჩნდებოდა. Laravel ველზე ცარიელ სიას არ აგზავნის, ე.ი. პრაქტიკულად მიუწვდომელია; **განზრახ არ შევეხე** — ფორმის შეცდომების ხატვის გზაზე ტესტის გარეშე ქცევის შეცვლა ამ ტასკის ფარგლებს სცდება
  - ✅ **გზადაგზა ნაპოვნი და დახურული: `vitest.config.ts`-ს არაფერი ამოწმებდა.** `tsconfig.app.json` მხოლოდ `src`-ს იღებს, `tsconfig.node.json` კი მხოლოდ `vite.config.ts`-ს — ე.ი. ტესტების კონფიგში ტიპის შეცდომა მხოლოდ გაშვებისას გამოჩნდებოდა. ახლა ისიც `include`-შია
- **ტიპი:** debt
- **სად:** `frontend/tsconfig.app.json:25-31`
- **პრობლემა:** `grep -n strict frontend/tsconfig*.json` არაფერს აბრუნებს — `strict`, `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess` არც ერთი არ არის ჩართული; `noUnusedLocals`/`noUnusedParameters` მხოლოდ.
- **რატომ:** CI-ს `tsc -b` implicit `any`-ს და `null`/`undefined`-ის non-nullable პოზიციაში გადინებას იღებს ~60k სტრიქონზე; ყველა `?? null`/`?.` დისციპლინა კონვენციაა და არა შემოწმება. (`any`/`@ts-ignore` კოდში 0-ია, ე.ი. მიგრაცია მცირე იქნება.)
- **გადაწყვეტა:** `"strict": true` (და სასურველია `noUncheckedIndexedAccess`), ერთ pass-ში შედეგების გასწორება.
- **Acceptance criteria:**
  - [x] `tsconfig.app.json`-ში (და `tsconfig.node.json`-ში) `"strict": true`
  - [x] `npm run build` მწვანეა, `@ts-expect-error` — **ერთიც არ დასჭირვებია**
- **Estimate:** M
- **დამოკიდებულება:** none

## Medium

### [SEC-08] ჩანაწერის/custom-field ფაილიც კლიენტის MIME-ს `inline` აბრუნებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `NoteEntryFileController::show()` და `CustomFieldController::showFile()` `SafeMime::response()`-ზე გადავიდნენ (SEC-04-ის იგივე helper); შენახული `mime`/`value_mime` სვეტებიც `SafeMime::ofUpload()`-ით იწერება და არა `getClientMimeType()`-ით
  - ⚠️ **SEC-05-ის შემდეგ ახალი `.html`/`.svg` უკვე ვეღარ აიტვირთება** (`mimes:` შიგთავსს ამოწმებს, `image` წესი Laravel-ში SVG-ს `allow_svg`-ის გარეშე არ უშვებს — გადამოწმდა framework-ის კოდში). **ხვრელი ძველ რიგებზე იყო**: `CustomFields::FILE_MIMES` 2026-09-17-მდე `svg`-ს იღებდა, ის ფაილები დისკზე დარჩნენ და კლიენტის ნათქვამ ტიპს ატარებენ — ამიტომ ტესტი მდგომარეობას **პირდაპირ წერს** და არა endpoint-ით (ატვირთვით მისი აღდგენა შეუძლებელია)
  - ⚠️ **ეს defense-in-depth-ია და არა დუბლირება**: `mimes:` სია იზრდება, და გაცემის მხარე არ უნდა იყოს ერთადერთი, რაც ამ სიის სისწორეზეა დამოკიდებული
  - ✅ ტესტები ძველ კოდზე ცვივა ზუსტად იმით, რაც ხვრელი იყო: `image/svg+xml`, `text/html; charset=utf-8` და შენახული `application/pdf` ნაცვლად `text/plain`-ისა
  - ⚠️ **ერთი ტესტი ვაკუუმში გადიოდა და გასწორდა**: `UploadedFile::fake()`-ის `getMimeType()` **გაფართოებიდან** აბრუნებს ტიპს და არა შიგთავსიდან (`Illuminate\Http\Testing\File`), ე.ი. კლიენტისა და სერვერის პასუხი ყოველთვის ემთხვეოდა. საჭიროა ნამდვილი `UploadedFile` ცხადად გაყალბებული client-ტიპით
  - ⚠️ **ჩვეულებრივი ფაილი კვლავ `inline`-ია** — PNG და PDF ცალკე ტესტებით დაფიქსირდა, თორემ გასწორება ნორმალურ სურათს ჩამოსატვირთ ფაილად აქცევდა (`SafeMime`-ის საკუთარი გაფრთხილება)
  - ℹ️ **დარჩენილი სამი გამცემი შემოწმდა და განზრახ არ შეცვლილა** (`grep "disk->response"`): `GalleryController::imageFile()` და `PublicProfileController::photoFile()` — ფოტოს შიგთავსი მომხმარებელს არ მოაქვს (`GalleryFetcher` მხოლოდ TMDB-ს ელაპარაკება, `WebImageImporter::extension()` SVG-ს **უარყოფს**), და იგივე ფაილი ისედაც `/storage/*`-ზე გადის, ე.ი. კონტროლერის გასწორება ვერაფერს დაკეტავდა, სამაგიეროდ TMDB-ის `.svg` ლოგოს ჩამოსატვირთ ფაილად აქცევდა; `VideoDownloadController::show()` — შიგთავსი yt-dlp-ისაა და მკაცრი მფლობელობის შემოწმების გამო მხოლოდ **თვითონ** მომხმარებელს გაეცემა (self-XSS), ადმინის ბიბლიოთეკიდან კი პრივატული დისკის გამო არ იხსნება
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/NoteEntryFileController.php:70`, `:100-105`; `backend/app/Http/Controllers/Api/CustomFieldController.php:195-201`
- **პრობლემა:** ორივე `getClientMimeType()`-ს ინახავს და `$disk->response(..., ['Content-Type' => $row->mime], 'inline')`-ით აბრუნებს — SEC-04-ის იგივე შაბლონი. მფლობელობა აქ მოწმდება (ჩვეულებრივ self-XSS-ია), მაგრამ იგივე რიგები ადმინის `/users/{id}` ფაილ-ბიბლიოთეკაში ჩანს (`StorageMeter::files()` → `mime`), ე.ი. დაბალი უფლების მომხმარებელი payload-ს დებს, ადმინი ხსნის.
- **რატომ:** SEC-05-თან ერთად სრული ესკალაციის გზაა; გასწორება SEC-04-ის იმავე helper-ით.
- **გადაწყვეტა:** ერთი `App\Support\SafeMime` (სერვერული განსაზღვრა + allow-list + `attachment` fallback) და მისი გამოყენება სამივე `file()`-ში.
- **Acceptance criteria:**
  - [x] `text/html`/SVG შიგთავსის ფაილი `attachment`/`octet-stream`-ით ბრუნდება
  - [x] `NoteModuleTest`-ში 3 და `CustomFieldTest`-ში 3 ტესტი (ორივე მხარეს „ჩვეულებრივი ფაილი კვლავ `inline`-ია" ცალკე)
- **Estimate:** S
- **დამოკიდებულება:** SEC-04

### [SEC-09] `GET/DELETE /batches/{batch}` მფლობელობას არ ამოწმებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ მფლობელი თვითონ პარტიაშივე იწერება — `Bus::batch(…)->withOption('user_id', …)`, რაც `job_batches.options`-ში ჯდება; `show()`/`destroy()` ერთ `mine()`-ზე გადიან
  - ⚠️ **ცალკე ცხრილი (`batch_owners`) არ დასჭირვებია** — `withOption()` სერიალიზაციისას და წაკითხვისას თვითონ გადის `DatabaseBatchRepository`-ზე (გადამოწმდა framework-ის კოდში), ე.ი. მეორე წყარო იმავე ფაქტზე არ ჩნდება
  - ⚠️ **პასუხი 404-ია და არა 403**: „ეს პარტია არსებობს" თვითონაც ინფორმაციაა — 403 ზუსტად იმას ადასტურებდა, რაც უნდა დაიმალოს (პროექტის არსებული წესი)
  - ⚠️ **მფლობელის გარეშე დარჩენილი პარტიაც 404-ია** — ასეთი მხოლოდ ამ გასწორებამდე შექმნილი შეიძლება იყოს, და უსაფრთხოების შემოწმებამ უცნობზე უარი უნდა თქვას; პარტია წუთებში სრულდება, ე.ი. ასეთი რიგი დიდხანს არ ცოცხლობს
  - ✅ ტესტი ამოწმებს არა მარტო 404-ს, არამედ იმასაც, რომ **გაუქმება მართლა არ მომხდარა** — თორემ „404 + ჩუმად გაუქმებული" ტესტისთვის იგივე იქნებოდა. ძველ კოდზე ცვივა: „Expected 404 but received 200"
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/BatchController.php:102-118`
- **პრობლემა:** `show()`/`destroy()` მხოლოდ `Bus::findBatch($batch)`-ს აკეთებენ; `Illuminate\Bus\Batch` Eloquent-მოდელი არ არის, ე.ი. `EnsureRecordOwnership` მას არ ხედავს. ვინც სხვის batch UUID-ს გაიგებს, პროგრესს კითხულობს და მიმდინარე პარტიას აუქმებს.
- **რატომ:** სხვისი მუშაობის შეჩერება ერთი მოთხოვნით; UUIDv4-ის გამო Medium.
- **გადაწყვეტა:** batch-ის `user_id` ინახოს (`batch_owners` ცხრილი ან `options`) და ორივე მეთოდში `abort_unless($ownerId === $request->user()->id, 404)`.
- **Acceptance criteria:**
  - [x] სხვა მომხმარებლის batch-ზე `GET`/`DELETE` 404-ია
  - [x] `BatchQueueTest`-ში ტესტი
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-02] საჯარო ალბომის unlock სესიის გარეშე უხმაუროდ არაფერს აკეთებს და პაროლის ორაკული ხდება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `AlbumLock::hasSession()` — „აქვს თუ არა `/api`-ს სესია" **ერთი** პასუხი, იმავე `session()`-ზე, რომელსაც ლოკი ისედაც კითხულობს (კონტროლერში `$request->hasSession()`-ის ასლი იმავე დღეს გაიშლებოდა)
  - ✅ `PublicProfileController::unlockAlbum()` — `abort_unless(AlbumLock::hasSession(), 409, 'session_required')` **ვალიდაციაზე და `Hash::check`-ზე ადრე**: 409 პაროლის შემოწმების შემდეგ იმავე ორაკულს დატოვებდა, უბრალოდ სხვა კოდით
  - ✅ იგივე მცველი `GalleryAlbumController::unlock()`-ზეც: ტოკენით მოსულ (არა-stateful) მფლობელს სწორი პაროლი 200-ს აბრუნებდა და ალბომი ჩაკეტილი რჩებოდა. ორაკულის საკითხი იქ არ დგას (მფლობელობა შემოწმებულია), ჩუმი ჩავარდნა კი იგივეა — და ერთი წესი ორივე კარზე უფრო იოლი დასამახსოვრებელია
  - ✅ `session_required` დარეგისტრირდა `frontend/src/lib/errors.ts`-ის `CODES`-ში და ორივე ლოკალში; UI ცვლილება არ დასჭირვებია — `AlbumUnlockDialog` და `PublicGalleryTab` უცნობ კოდს ისედაც `errorMessage()`-ით ხატავენ (ახლა თარგმნილად და არა `snake_case`-ად)
  - ✅ ტესტები: `PublicGalleryTest` — სესიის გარეშე 409 + `Hash::shouldNotHaveReceived('check')`, და ცალკე „სწორი პაროლი ხსნის და ფოტოც მაშინვე გამოდის" (ორი მოთხოვნა ერთ ტესტში: „გავხსენი" მხოლოდ მაშინ ნიშნავს რამეს, თუ მომდევნო კითხვა ნამდვილ `path`-ს აბრუნებს); `GalleryAlbumTest` — იგივე შიდა კარზე. ⚠️ `test_the_public_unlock_needs_the_right_password` `spa()`-ზე გადავიდა: ის უსესიოდ 422-ს ელოდა, ე.ი. ზუსტად იმ მდგომარეობას აღწერდა, რომელიც ბაგი იყო
  - ✅ დადასტურდა, რომ ახალი ტესტი ცარიელი არ არის: მცველის დროებით მოხსნაზე 409-ის ნაცვლად 422 დაბრუნდა
  - ✅ pint (ამ ფაილში სამი ძველი fixer-იც გასწორდა), 731 backend ტესტი, `npm run build`, i18n აუდიტი — მწვანე
  - ℹ️ **დარჩა განზრახ:** წარუმატებელი ცდების DB-მრიცხველი — ის ცალკე ტასკია (FEAT-04), და `store()`/`update()`-ის „პაროლი დავადე და ალბომი მაშინვე გამიქრა" ქცევა (სესიის გარეშე) სწორია — ახლა `unlock`-ის 409 ამას მაინც ხსნის
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/PublicProfileController.php:199-206`; `backend/app/Support/AlbumLock.php:128-133`; limiter `backend/app/Providers/AppServiceProvider.php:168-180`
- **პრობლემა:** `AlbumLock::unlock()` `session()`-ის არყოფნაზე `return`-ს აკეთებს, კონტროლერი კი მაინც `unlocked: true`-ს აბრუნებს. `/api`-ს სესია მხოლოდ stateful origin-ზე აქვს. (a) არა-stateful კლიენტი „გახსნილს" ხედავს და ალბომი ჩაკეტილი რჩება; (b) თავდამსხმელს ქუქიც არ სჭირდება — endpoint პაროლის stateless ორაკულია, რომელსაც მხოლოდ IP+ალბომზე throttle იცავს (IP-ის როტაციით გვერდი ავლილია).
- **რატომ:** მოტყუებული პასუხი + სუსტი brute-force დაცვა ერთადერთ პაროლ-შემოწმებაზე login-ის გარეთ.
- **გადაწყვეტა:** პაროლის შემოწმებამდე `abort_unless($request->hasSession(), 409, 'session_required')`; დამატებით DB-მრიცხველი წარუმატებელ ცდებზე (FEAT-04).
- **Acceptance criteria:**
  - [x] სესიის გარეშე მოთხოვნა 409-ს აბრუნებს, პაროლი არ მოწმდება (`Hash::check` არ ეშვება)
  - [x] stateful მოთხოვნაზე unlock კვლავ მუშაობს (`PublicGalleryTest`)
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-03] `AlbumVault::relocate()` — ფაილის გადატანა DB-ტრანზაქციაშია, რომელიც მას ვერ აბრუნებს; არარსებულ ფაილზეც `path` იწერება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ რიგი შეიცვალა: **ასლი (ტრანზაქციამდე) → commit → ძველის წაშლა**. `relocate()` ორად გაიყო — `copy()` (მხოლოდ ასლი, ძველს ხელს არ ახლებს) და `relocateAll()` (ტრანზაქცია + შემდგომი წაშლა); `seal`/`reveal`/`place` სამივე ერთ გზაზეა
  - ✅ ჩავარდნაზე **კომპენსაცია**: `catch` ახალ ასლს შლის და გამონაკლისს ისევ აგდებს. ⚠️ **გარდა იმ ფაილისა, რომელიც სამიზნეზე უკვე იდო** (`overwrote`) — ის ჩვენ არ შეგვიქმნია და მისი წაშლა სხვისი ფოტოს წაშლა იქნებოდა
  - ✅ დისკზე არარსებული ფაილი → `null`: `path` **არ იცვლება** და `moved`-შიც არ ითვლება. მეზობელ რიგებს არ აჩერებს (ორი ფოტო, ერთი დაკარგული → პასუხი `1`)
  - ✅ I/O შეცდომა კი პირიქით — **გამონაკლისია და არა გამოტოვება**: ჩუმად გამოტოვებული ფოტო `seal()`-ზე ნიშნავდა „ალბომი ჩაკეტილია, ერთი ფაილი კი საჯარო დისკზე დარჩა". ადრე `writeStream`-ის შედეგი საერთოდ არ მოწმდებოდა და წერის ჩავარდნაზე **ორიგინალი მაინც იშლებოდა** — ე.ი. ფაილი იკარგებოდა (აუდიტში ეს არ იყო)
  - ✅ commit-ის შემდეგ ძველის წაშლის ჩავარდნა `Log::warning`-ია: აპლიკაცია ბმულს აღარსად გასცემს, მაგრამ „რატომ იხსნება ისევ `/storage/...`" პასუხგაუცემელი არ რჩება
  - ✅ **`DB::afterCommit()` განზრახ არ გამოიყენება** — `RefreshDatabase` მთელ ტესტს ერთ ტრანზაქციაში ატარებს, რომელიც არასდროს commit-დება, ე.ი. callback ტესტში საერთოდ არ გაეშვებოდა და კოდი პროდაქშენში სხვას იზამდა. ფასი: სერვისს გარე ტრანზაქციიდან არ ეძახიან (და არც უნდა დაეძახონ) — ჩადგმულ `DB::transaction()`-ს commit არ აქვს, savepoint აქვს. კომენტარშია
  - ✅ `tests/Feature/AlbumVaultTest.php` — 8 ტესტი; **ფიზიკურ გადატანას ერთი ტესტიც არ ჰქონდა** (`grep "gallery/locked" backend/tests` მხოლოდ `PublicGalleryTest`-ს პოულობდა). ძველ კოდზე სამი ცვივა: დაკარგული ორიგინალი, „გადატანილად" ჩათვლილი დაკარგული ფაილი და გაბერილი `moved`
  - ⚠️ ჩავარდნა `DB::listen`-ით სიმულირდება და არა მოდელის მოვლენით: `path`-ს `saveQuietly()` წერს, ე.ი. `saving`/`updating` საერთოდ არ ეშვება — ერთადერთი წერტილი, სადაც ჩარევა შეიძლება, თვითონ query-ა
  - ✅ pint, 739 backend ტესტი — მწვანე
- **ტიპი:** bug
- **სად:** `backend/app/Services/Gallery/AlbumVault.php:76`, `:112-130`
- **პრობლემა:** `move()` მთელ ციკლს `DB::transaction()`-ში აწყობს, `writeStream`/`delete` კი არატრანზაქციულია — rollback-ზე `path` სვეტი ძველ მნიშვნელობას იბრუნებს, ფაილი კი ახალ ადგილზეა და ძველიდან წაშლილი. მეორე: `if ($from->exists($path))` false-ზეც `:130` `path`-ს ახალ მისამართზე გადაწერს და `true`-ს აბრუნებს.
- **რატომ:** ჩაკეტვა/გახსნა ალბომის ყველა ფოტოს 404-ად აქცევს ჩავარდნისას; დაკარგული ფაილის ჩანაწერი „წარმატებულად" გადატანილად ითვლება.
- **გადაწყვეტა:** copy-first → commit → delete-after; ფაილის არყოფნაზე `false` და `path` უცვლელი; `moved` მრიცხველი მხოლოდ რეალურ გადატანაზე.
- **Acceptance criteria:**
  - [x] ტესტი: `saveQuietly()`-ის ჩავარდნის სიმულაციაზე ფაილი ძველ დისკზე რჩება და `path` არ იცვლება
  - [x] ტესტი: დისკზე არარსებული ფოტოს ალბომის ჩაკეტვა `path`-ს არ ცვლის
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-04] ალბომის წაშლა: vault → images update → delete სამი დაუცველი ნაბიჯია
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ რიგი შებრუნდა: **ჯერ რიგები ერთ `DB::transaction()`-ში** (`images.album_id` + ალბომის წაშლა), **ფაილები — commit-ის შემდეგ**
  - ✅ **პირიქით ჩავარდნა უვნებელია და სწორედ ეს ამართლებს ამ რიგს**: ფაილი `gallery/locked`-ში დარჩა, მაგრამ `path` მასზე მიუთითებს და `GalleryImage::servedUrl()` პირად დისკს API-ის მარშრუტით ემსახურება — ფოტო ჩანს, უბრალოდ `/storage/*`-ის გარეთ. საპირისპირო (ძველი) რიგი კი ფაილს საჯარო დისკზე ტოვებდა ჩაკეტილი ალბომით — §7.9-ის ლოკის სრული შემოვლა
  - ✅ `AlbumVault::placeMany()` — ახალი ცხადი შესასვლელი. ⚠️ **`seal`/`reveal` აქ გამოუსადეგარია**: ისინი ფოტოებს `where('album_id', …)`-ით პოულობენ, ე.ი. რიგების გადასვლის (ან ალბომის წაშლის) შემდეგ ვეღარაფერს იპოვიან — ხოლო თუ მათ ჯერ დავუძახებთ, ისევ იმ რიგში ვართ, რომელიც ბაგი იყო. ფოტოები ამიტომ **ცვლილებამდე** იკითხება
  - ✅ კომპენსაცია საჭირო აღარ არის: BUG-03-ის შემდეგ `placeMany()` თითო ფოტოს ან ბოლომდე გადაიტანს, ან ხელს არ ახლებს — ნახევრად გადატანილი ფაილი ვერ დარჩება
  - ✅ `GalleryController::move()`-ის ციკლიც ერთ `placeMany()`-ად შეიკრა: `place()` თითო ფოტოზე თითო ტრანზაქციაა, ე.ი. ასი ფოტოს გადატანა ასი ტრანზაქცია იყო
  - ✅ ტესტები (`GalleryAlbumTest`): გახსნილი ალბომის წაშლა ფაილს საჯაროდ აბრუნებს; `delete()`-ის ჩავარდნაზე ფაილი `gallery/locked`-ში რჩება. ძველ კოდზე მეორე ცვივა და შეტყობინებაც ზუსტად ბაგს ასახელებს (`gallery/images/secret.jpg` მოვიდა). ⚠️ ის მეორე ფაქტსაც პოულობს: **ტრანზაქციის გარეშე წაშლილი ალბომი 500-ის მიუხედავად ნამდვილად ქრებოდა** (`DB::listen` query-ს შესრულების *შემდეგ* აგდებს)
  - ✅ pint, 741 backend ტესტი — მწვანე
  - ℹ️ **`update()`-ს იგივე არ დასჭირვებია**: იქ რიგი უკვე სწორია (ჯერ `password_hash`, მერე ფაილები) და vault ახლა ხმამაღლა ვარდება, ე.ი. ცდის გამეორება ასწორებს
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/GalleryAlbumController.php:228-233`
- **პრობლემა:** `AlbumVault::reveal()` ფაილებს ჯერ საჯარო დისკზე გადაიტანს, მერე `update(['album_id' => …])` და `delete()` — ტრანზაქციის გარეშე. `update`/`delete`-ის ჩავარდნაზე ჩაკეტილი ალბომის ფოტოები `gallery/images`-ში საჯაროდ დევს, ალბომი კი კვლავ `password_hash`-ითაა.
- **რატომ:** ზუსტად ის ხვრელი, რომლის დახურვას §7.9 ემსახურება.
- **გადაწყვეტა:** row-ცვლილებები ტრანზაქციაში, ფაილების გადატანა commit-ის შემდეგ; ჩავარდნაზე კომპენსაცია (`seal` უკან).
- **Acceptance criteria:**
  - [x] ტესტი: `delete()`-ის ჩავარდნაზე ფაილები `gallery/locked`-ში რჩება
- **Estimate:** S
- **დამოკიდებულება:** BUG-03

### [BUG-05] ლექსიკონის „გადატანა" query-builder `update()`-ით მოდელის ჰუკებს გვერდს უვლის (`watched_at`, audit)
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `DictionaryRecords::move(Builder $records, callable $apply)` — წაშლის ბრანჩის ზუსტი ტყუპი (`lazyById(100)` + მოდელი). **ერთი დიალოგის ორი ბრანჩი ერთნაირად მუშაობს ახლა**
  - ✅ ექვსივე ლექსიკონი მასზე გადავიდა: სტატუსი (`applyStatus()`), წიგნისა და ბორდგეიმის ჟანრი, ვიდეოს ტიპი, ჩანაწერისა და ბუკმარკის კატეგორია. ⚠️ სიმღერა/თამაში პივოტზეა და `syncWithoutDetaching`-ს იყენებს — სხვა გზა, ამ ბაგის გარეშე
  - ✅ **მოდელური ციკლი აირჩა და არა „ერთი ცხადი `AuditLogger` ჩანაწერი"**: `watched_at`-ს მხოლოდ `applyStatus()` წერს, ე.ი. სტატუსზე ციკლი ისედაც აუცილებელი იყო — ხოლო ორი სხვადასხვა მექანიზმი ერთი დიალოგის ორ ბრანჩზე ზუსტად ის არის, რაც დაშორდებოდა. `PurgeService`-ის პრეცედენტიც ეს არის: ასი ჩანაწერის წაშლა ასი ლოგის რიგია
  - ✅ `callable $apply` და არა ორი მეთოდი (`move` + `moveStatus`): გამოძახების ადგილი ცხადად ამბობს, **რა** იცვლება (სვეტი თუ `applyStatus()`), კლასს კი მოდელების ცოდნა არ სჭირდება
  - ✅ ტესტები: `StatusDictionaryTest` — `done` → `todo` გადატანა `watched_at`-ს ანულებს, და გადატანა `audit_logs`-ში ჩანს (⚠️ ლოგში **გასაღებია და არა `status_id`** — `AuditLogger`-ის §6.4-ის წესი); `DictionaryDeletionTest` — იგივე ვიდეოს ტიპზე. სამივე ძველ კოდზე ცვივა
  - ✅ pint, 744 backend ტესტი — მწვანე
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/StatusController.php:135-143`; იგივე `BookGenreController.php:74`, `BoardGameGenreController.php:74`, `VideoTypeController.php:79`, `NoteCategoryController.php:74`, `BookmarkCategoryController.php:79`
- **პრობლემა:** `$records->update(['status_id' => …])` `HasStatus::applyStatus()`-ს (`watched_at` როლიდან) და `AuditObserver::updated()`-ს არ უშვებს. `done` სტატუსის წაშლა და `todo`-ზე გადატანა ყველა ჩანაწერს შევსებული `watched_at`-ით ტოვებს; audit-ლოგში ჩანაწერი არ რჩება. წაშლის ბრანჩი (`DictionaryRecords::delete()`) სწორად მოდელით მუშაობს.
- **რატომ:** ერთი სვეტი ორ ფაქტს ეწინააღმდეგება (ის ხაფანგი, რომელსაც `watched_at`-ის წესი აღწერს) და მასობრივი ცვლილება ლოგიდან უჩინარია.
- **გადაწყვეტა:** წაშლის ბრანჟის მსგავსად `lazyById()` + `applyStatus()`/`save()`; ხუთ ლექსიკონზეც მოდელური ციკლი ან ერთი ცხადი `AuditLogger` ჩანაწერი.
- **Acceptance criteria:**
  - [x] ტესტი: `done` სტატუსის წაშლა `todo`-ზე გადატანით `watched_at`-ს `null`-ავს
  - [x] ტესტი: გადატანის შემდეგ `audit_logs`-ში ჩანაწერია
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-06] მასობრივი visibility-ცვლილება audit-ლოგში არ ჩანს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `PATCH /visibility/{domain}` ერთ ცხად `AuditLogger::log(ACTION_UPDATE)` ჩანაწერს წერს
  - ✅ **თითო ჩანაწერზე ციკლი აქ განზრახ არ არის** (BUG-05-ისგან განსხვავებით): იქ `watched_at` მოდელის გავლას **ითხოვდა**, აქ კი ერთადერთი ცვლილება თვითონ სვეტია — სამი ათასი რიგი ლოგში ერთ კლიკზე კითხვას პასუხს კი არ გასცემდა, დამარხავდა
  - ✅ **ახალი `ACTION_*` კონსტანტა არ დაემატა** — `update` ზუსტად ის არის, რაც მოხდა; ახალი მოქმედება `ACTIONS`-ს, i18n-ს და `AuditPage`-ის `ACTION_STYLE`-ს შეეხებოდა (იგივე მსჯელობა, რაც §21-ის credentials-ზე იყო)
  - ✅ `subject_*` ცარიელია — მასობრივ ცვლილებას **ერთი სუბიექტი არ ჰყავს** (`visit`-ის იგივე ფორმა, და UI ასეთ რიგს უკვე ხატავს). დომენი `context`-შია, რადგან `module` მას ვერ ცვლის: `playlist` → `song`, `gallery_album` → `gallery`, ე.ი. მარტო მოდულით „რა გასაჯაროვდა" პასუხგაუცემელია
  - ✅ `context` = `bulk` · `domain` · `scope` (`all`/`ids`) · `updated` · `ids`. ⚠️ **`ids` 200-ზეა შეჭრილი** (`LOG_IDS_MAX`): ვალიდაცია 2000-ს უშვებს, სრული სია ერთ ლოგის რიგს ათი კილობაიტით გაბერავდა და მოდალში წასაკითხი აღარ იქნებოდა; ზუსტი რიცხვი `updated`-შია
  - ✅ ტესტი `PublicProfileTest` — ძველ კოდზე ცვივა („ლოგში უნდა იყოს")
  - ✅ pint, 745 backend ტესტი — მწვანე
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/VisibilityController.php:129-130`
- **პრობლემა:** `$query->where('user_id', …)->update(['visibility' => …])` — query-builder, `AuditObserver` არ ეშვება; ერთეული ცვლილება (`update()`) კი ლოგირდება. `all: true`-თი მთელი დომენი გასაჯაროვდება ნულ ჩანაწერით.
- **რატომ:** „ვინ და როდის გახადა ჩემი ბიბლიოთეკა საჯარო" — სწორედ ის კითხვაა, რისთვისაც `audit_logs` არსებობს.
- **გადაწყვეტა:** ერთი ცხადი `AuditLogger` ჩანაწერი (`domain`, `visibility`, `updated`, id-სია) ან მოდელური ციკლი.
- **Acceptance criteria:**
  - [x] `PATCH /visibility/{domain}` `all: true`-ზე `audit_logs`-ში ჩანაწერი ჩნდება (`PublicProfileTest`)
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-07] `ChatService::between()` — check-then-create race ორმაგ საუბარს ქმნის
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `conversations.pair_key` (`min:max`) + **unique ინდექსი** — ე.ი. უნიკალურობას სქემა იცავს და აღარ კითხვა. `Cache::lock` განზრახ არ აირჩა: lock პროცესებს შორის შეთანხმებაა, ინდექსი კი თვითონ ფაქტია და მისი გვერდის ავლა შეუძლებელია
  - ✅ `between()`: სწრაფი წაკითხვა `pair_key`-ით → `try { create + attach }` → `catch (UniqueConstraintViolationException)` → ხელახალი წაკითხვა. ⚠️ `INSERT` ინდექსზე მეორე ტრანზაქციას ელოდება, ე.ი. catch-ის მომენტისთვის მონაწილეებიც ჩაწერილია — თორემ ცარიელ საუბარს დავაბრუნებდით
  - ✅ **`min:max` და არა „ვინ დაიწყო"**: A→B და B→A ერთი გასაღებია, თორემ ინდექსი არაფერს დაიცავდა
  - ✅ **სვეტი nullable-ია**: `NULL` ორივე ძრავზე unique-ს არ ეწინააღმდეგება, ე.ი. ორზე მეტმონაწილიანი საუბარი მომავალშიც შესაძლებელია
  - ✅ მიგრაცია არსებულებს ავსებს და **უკვე გაორებულ წყვილს ითვალისწინებს**: გასაღები უმცროს id-ს რჩება, დანარჩენი `null`-ით — თორემ ინდექსი საერთოდ არ აიგებოდა. ⚠️ დარჩენილი ძაფი **არ იშლება**: სია მონაწილეობით იგება, ე.ი. წერილები არსად იკარგება
  - ✅ ცოცხალ ბაზაზე გაშვებულია (1 საუბარი → `1:2`)
  - ✅ ტესტები: სქემა მართლა კრძალავს დუბლს; გასაღები მიმართულებისგან დამოუკიდებელია; და **რეალური რბოლის სიმულაცია** — `DB::listen` კონკურენტს ზუსტად `SELECT`-სა და `DB::transaction()`-ს **შორის** წერს (შიგნით რომ ეწეროს, იმავე savepoint-ის rollback მას წაშლიდა და ტესტი საკუთარ თავს გატეხდა). ⚠️ დადასტურდა, რომ catch-ს მართლა ეხება: try/catch-ის მოხსნაზე ტესტი unique-ის შეცდომით ცვივა
  - ✅ pint, 748 backend ტესტი — მწვანე
- **ტიპი:** bug
- **სად:** `backend/app/Services/Chat/ChatService.php:51-64`
- **პრობლემა:** 1:1 საუბრის უნიკალურობა მხოლოდ წაკითხვით მოწმდება; სქემას (`conversation_user` unique `(conversation_id, user_id)`) წყვილზე შეზღუდვა არ აქვს. ორი ტაბი ან polling + ხელით გახსნა ერთდროულად ორ `Conversation`-ს ქმნის.
- **რატომ:** ძაფი სამუდამოდ იყოფა — შეტყობინებები იმ საუბარში ხვდება, რომელიც თითო კლიენტმა დაიქეშა.
- **გადაწყვეტა:** `Cache::lock('chat:'.min.':'.max)` find-or-create-ის გარშემო, ან `conversations.pair_key` (`min_id:max_id`) unique ინდექსით + `firstOrCreate`.
- **Acceptance criteria:**
  - [x] `pair_key` unique ინდექსი (ან lock) და ტესტი, რომ ორი პარალელური `between()` ერთ id-ს აბრუნებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-08] `RunBatchItem` ყველა გამონაკლისს ყლაპავს — პარტია არასდროს „ჩავარდნილია"
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `handle()` ლოგირების შემდეგ **`throw $e`**-ს აკეთებს. `allowFailures()` უკვე დაყენებული იყო, ე.ი. ერთადერთი მიზეზი, რის გამოც გადასროლა „საშიშად" ჩანდა, გათვალისწინებული იყო; `tries = 1` რჩება (გამეორება TMDB-ის მოთხოვნას და Gemini-ს კვოტას ხარჯავს)
  - ✅ ორი უხმო `return`-იც ლოგშია ახლა (`user_missing`, `record_not_found`) — ჩავარდნა არ არის (ანგარიში/ჩანაწერი წაიშალა), მაგრამ „რატომ არაფერი მოხდა" პასუხგაუცემელი აღარ რჩება. `skipped`/`failed`-ის **ცალკე დათვლა** კვლავ FEAT-03-ია
  - ⚡ **აუდიტში არ ეწერა და უფრო მძიმეა: ჩავარდნილი ერთეულის მქონე პარტია Laravel-ისთვის არასდროს მთავრდება.** `incrementFailedJobs()` `pending_jobs`-ს **არ** ამცირებს (job თეორიულად ხელახლა გასაშვებია), `markAsFinished()` კი მხოლოდ `pendingJobs === 0`-ზე ეშვება — ე.ი. მარტო გადასროლა პასუხს „მიმდინარეობს, 50%"-ზე სამუდამოდ გააჩერებდა. ზუსტად ის უხმო ჩაკიდება, რაც `download_status = running`-მა ორჯერ ასწავლა
  - ✅ `payload()` ამიტომ Laravel-ისავე ლექსიკონით ითვლის (`allJobsHaveRanExactlyOnce()` = `pending − failed === 0`): `finished` ისმება, `pending`-ს ჩავარდნილი აკლდება (თორემ „დარჩა 1" ეწერება მაშინაც, როცა დარჩენილი არაფერია) და `progress` 100%-ს აღწევს
  - ✅ ტესტი **ნამდვილ worker-ს** უშვებს (`queue:work --stop-when-empty`) და არა `handle()`-ს პირდაპირ: `failed_jobs`-ის რიგსა და პარტიის მრიცხველს მხოლოდ რიგის მანქანერია წერს. ძველ კოდზე `failed_jobs` 0-ია
  - ✅ pint, 749 backend ტესტი — მწვანე
  - ℹ️ SPA დღეს პარტიას **არ ეკითხება** (`startBatch` აგზავნის და რიგს ასუფთავებს), ე.ი. UI-ს ცვლილება არ დასჭირვებია — მაგრამ პასუხი ახლა მართალია, როცა პირველი მომხმარებელი გაჩნდება
- **ტიპი:** bug
- **სად:** `backend/app/Jobs/RunBatchItem.php:91-101`; `backend/app/Http/Controllers/Api/BatchController.php:84-87`
- **პრობლემა:** `catch (Throwable $e) { SourceLog::threw(...) }` — არაფერი არ გადაისვრის, ე.ი. `$batch->failedJobs` 0-ია, `processedJobs == totalJobs`, `failed_jobs` ცარიელი. `allowFailures()` `:87`-ზე უკვე დაყენებულია, ე.ი. გადასროლა პარტიას არ შეაჩერებდა. `run()`-ის ჩანაწერის ვერპოვნაც უხმო `return`-ია.
- **რატომ:** SPA „300/300 დასრულდა"-ს აჩვენებს იმ გაშვებაზეც, სადაც ყველა TMDB call 401-ს დაბრუნდა — უხმო skip, რომელსაც პროექტი ყველაზე მძიმე ბაგად თვლის.
- **გადაწყვეტა:** ლოგირების შემდეგ `throw $e` (`tries=1` რჩება, `allowFailures()` დანარჩენს არ აჩერებს); `skipped` და `failed` ცალ-ცალკე დაითვალოს (FEAT-03).
- **Acceptance criteria:**
  - [x] `BatchQueueTest`: ჩავარდნილი ერთეულზე `failed_jobs` იზრდება და `payload()`-ში `failed > 0`
  - [x] დანარჩენი ერთეულები კვლავ სრულდება
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-09] `notes:remind`-ის `withoutOverlapping()` ვადის გარეშე 24 სთ-ით აჩერებს შეხსენებებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `->withoutOverlapping(5)` და კომენტარი, რომელიც მიზეზს ამბობს
  - ✅ **რატომ 5 და არა „ყველაზე ცუდი შემთხვევა" (200 × 10 წმ ≈ 33 წთ):** გადაფარვა აქ **უვნებელია** — დისპეტჩერი თითო შეხსენებას გაგზავნამდე პირობითი `UPDATE`-ით იტაცებს (`where next_at = <წაკითხული>`), ე.ი. მეორე გამშვები 0 რიგს იღებს და ტოვებს. ორჯერ გაშვება სქემითაა გამორიცხული, ამიტომ მოკლე ვადა უსაფრთხოა და სწორი: ჩავარდნის ფასი 24 საათი აღარაა
  - ✅ **`releaseOnTerminationSignals` ამას არ ხსნის** (ის ნაგულისხმევად ჩართულია): `pcntl` Windows-ზე არ არის, ხოლო fatal-ი და მანქანის დაძინება სიგნალს საერთოდ არ აგზავნის — ე.ი. სწორედ ის სამი შემთხვევა, რომელზეც mutex ჩაკეტილი რჩებოდა
  - ✅ **`runInBackground()` განზრახ არ დაემატა** (ტასქი მას „სასურველად" ასახელებდა): ერთადერთი დაგეგმილი ბრძანებაა, ე.ი. ბლოკირება არავის უშლის, სამაგიეროდ ის Windows-ზე პროცესის გაშვების ცალკე გზას რთავს — ზუსტად იმ ადგილს, სადაც ამ პროექტს `ProcessEnv`-ის გაკვეთილი უკვე აქვს
  - ✅ ტესტი (`NoteModuleTest`) **რიცხვს არ აფიქსირებს, ჭერს აფიქსირებს**: ვადა ცხადია და დღეზე მოკლე. ძველ კოდზე ცვივა („1440 is less than 1440")
  - ✅ pint, 750 backend ტესტი — მწვანე
- **ტიპი:** bug
- **სად:** `backend/routes/console.php:22`
- **პრობლემა:** `->everyMinute()->withoutOverlapping()` — mutex-ის default ვადა 1440 წუთია. `ReminderDispatcher::fire()` სინქრონულ Telegram call-ს აკეთებს; `schedule:work`-ის Ctrl-C, ძილი ან PHP fatal გაშვების შუაში mutex-ს არ ათავისუფლებს.
- **რატომ:** მომდევნო 24 საათი არც ერთი შეხსენება არ ეშვება დახურული ბრაუზერისთვის — სწორედ ის, რისთვისაც scheduler არსებობს — და უხმოდ.
- **გადაწყვეტა:** `->withoutOverlapping(5)` (worst-case-ზე ოდნავ მეტი); სასურველია `->runInBackground()`.
- **Acceptance criteria:**
  - [x] `console.php`-ში ვადა ცხადადაა და კომენტარი მიზეზს ამბობს
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-10] toast-ის ავტო-დახურვის ტაიმერი პროვაიდერის ყოველ რენდერზე თავიდან იწყება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `onDismiss={dismiss}` (სტაბილური `useCallback([])`) და ეფექტში `onDismiss(id)`; `ToastCard` `id`/`duration`-ს თვითონ ამოიღებს, ე.ი. სამივე დამოკიდებულება ბარათის სიცოცხლეში უცვლელია და ტაიმერი **ერთხელ** ეშვება
  - ✅ დახურვის ღილაკი `onDismiss(id)`-ზე გადავიდა (პროპი აღარ არის ნულ-არგუმენტიანი)
  - ℹ️ **ქვედა ზოლი ბაგს მალავდა და არა აჩვენებდა**: მისი CSS-ანიმაცია სტილია და არა ეფექტი, ე.ი. თავის დროზე სრულდებოდა, ბარათი კი რჩებოდა — „ზოლი გავიდა და არაფერი მოხდა" ერთადერთი ხილული სიმპტომი იყო
  - ✅ ტესტი `components/ui/feedback.test.ts` — **ცრუ ტაიმერებით** მიმაგრებული პროვაიდერი: სამი ზედიზედ toast-იდან პირველი თავის `duration`-ზე ქრება, დანარჩენები თავ-თავის დროზე; მეორე ტესტი — დახურვის ღილაკი მხოლოდ თავისას შლის და მეზობლის ტაიმერს არ წევს. არასტაბილურ callback-ზე პირველი ცვივა (დადასტურდა)
  - ✅ `npm run build`, oxlint (გაფრთხილებები 49 → 49, ე.ი. ახალი არ დამატებულა), ფრონტის ტესტები 136 → 138 — მწვანე
- **ტიპი:** bug
- **სად:** `frontend/src/components/ui/feedback.tsx:158`, `:172-176`
- **პრობლემა:** `onDismiss={() => dismiss(t.id)}` ყოველ რენდერზე ახალი ფუნქციაა და `useEffect(..., [toast.duration, onDismiss])` ტაიმერს თავიდან აწყობს — ნებისმიერ toast-ის დამატება/მოხსნაზე ან confirm-ის გახსნაზე.
- **რატომ:** queue-გაშვების დროს (`ui/queue.tsx` ციკლში toast-ებს უშვებს) ადრეული toast-ები ვადას ვერ აღწევენ და გროვდებიან.
- **გადაწყვეტა:** სტაბილური `dismiss` + `id` პროპად (`onDismiss={dismiss}`, ეფექტში `onDismiss(id)`), ან ref-ში შენახვა.
- **Acceptance criteria:**
  - [x] ტესტი: სამი ზედიზედ toast-იდან პირველი `duration`-ის შემდეგ ქრება მაშინაც, თუ მეორე/მესამე დაემატა
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-11] `key={i}` წაშლადი/გადაადგილებადი სტრიქონებზე სამ ფორმაში
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `lib/rowKeys.ts` — `keyRow` / `keyRows` / `unkeyRows` / `Keyed<T>`; ოთხივე ბლოკი (`GameForm` ბმულები + DLC, `BoardGameForm` ბმულები, `NoteForm` ბმულები) სტაბილურ `_key`-ზეა. `grep -n "key={i}"` სამივე ფორმაზე ცარიელია
  - ⚠️ **`crypto.randomUUID()` განზრახ არ გამოიყენება**, თუმცა ტასქი მას ასახელებდა: ის **მხოლოდ დაცულ კონტექსტში არსებობს** (https ან localhost), აპლიკაცია კი `http://mediary.local`-ზე იხსნება — იქ ის `undefined`-ია და გამოძახება ჩავარდებოდა (იგივე ხაფანგი, რაც `navigator.clipboard`-ს აქვს, §21.8). გასაღები გლობალურად უნიკალური არც უნდა იყოს — მრიცხველი საკმარისია (`feedback.tsx`-ის `nextToastId`-ის გზა)
  - ✅ **გასაღები payload-ში არ მიდის** (`unkeyRows()` სამივე გაგზავნის ადგილზე). ℹ️ სამივე კონტროლერი დღეს რიგს **ველ-ველად თავიდან აწყობს** (`array_map(fn ($link) => ['label' => …, 'url' => …])`), ე.ი. დავიწყებული `unkeyRows` ბაზამდე ვერ მიაღწევდა — მაგრამ ეს **სერვერის** ქცევაა და არა ჩვენი გარანტია
  - ⚠️ **`tsc` დავიწყებულ `unkeyRows`-ს ვერ დაიჭერს**: `Keyed<T>[]` სტრუქტურულად `T[]`-ს ეთავსება (ზედმეტი ველის შემოწმება მხოლოდ ობიექტ-ლიტერალზეა). ამის ტიპებით დაჭერას `{ key, row }` წყვილები სჭირდებოდა, ე.ი. ყველა რენდერის ადგილას `link.row.url` — გაცილებით დიდი ცვლილება ერთი S-ტასქისთვის
  - ✅ **ყველა შესასვლელი დაფარულია**: საწყისი სია, RAWG-ის დრაფტი (`GameForm`), მაღაზიის შეთავაზება (`BoardGameForm`) და „დამატება" ღილაკები. რედაქტირება `{...x, field}`-ია, ე.ი. გასაღები ცოცხლობს
  - ✅ დარჩენილი `key={i}` (14 ადგილი) **განზრახ დარჩა**: ჩონჩხები (`Array.from`), დეტალების მხოლოდ-საკითხავი სიები და `highlightParts`-ის ნაწილები — იქ არც input-ია, არც წაშლა, ე.ი. DOM-ში გადასატანი მდგომარეობა არ არსებობს
  - ✅ ტესტი `lib/rowKeys.test.ts` (5) — უნიკალურობა, „შუა სტრიქონის წაშლა დანარჩენების გასაღებს არ ცვლის" და ის, რომ `unkeyRows` მხოლოდ გასაღებს შლის
  - ✅ `npm run build`, ფრონტის ტესტები 138 → 143, oxlint 49 → 49 — მწვანე
- **ტიპი:** bug
- **სად:** `frontend/src/components/GameForm.tsx:670-671`, `:727-728`; `frontend/src/components/BoardGameForm.tsx:685`; `frontend/src/components/NoteForm.tsx:301-302`
- **პრობლემა:** `links.map((link, i) => <div key={i} …>)` სტრიქონებზე, რომლებსაც წაშლის ღილაკი აქვს (`filter((_, j) => j !== i)`). შუა სტრიქონის წაშლაზე React ძველი `n`-ის DOM-ს `n+1`-ისთვის იყენებს.
- **რატომ:** ფოკუსი, კარეტი, IME და Radix `Select`-ის შიდა open/highlight state სხვა ჩანაწერზე გადადის — ღია დროფდაუნი სხვა სტრიქონის მონაცემზე ხვდება.
- **გადაწყვეტა:** სტრიქონის შექმნაზე კლიენტური `id` (`crypto.randomUUID()`) და `key`-ად მისი გამოყენება.
- **Acceptance criteria:**
  - [x] ოთხივე ადგილზე `key`-ი სტაბილური id-ა; `grep -n "key={i}" src/components/{GameForm,BoardGameForm,NoteForm}.tsx` ცარიელია
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-04] `AdminModuleController::index()` — eager load იკარგება, N_users × N_modules × 2 query
- **სტატუსი:** ✅ შესრულებულია (2026-09-17) — **ორ ნაბიჯად, რადგან ორი მიზეზი იყო**
  - ✅ pivot-ის ნახევარი PERF-01-მა მოხსნა: `with('modules')` აქ თავიდანვე ეწერა (კომენტარიც ამას ამბობდა), მაგრამ `hasModule()`/`isGrantedModule()` query-builder-ს იყენებდნენ და ამ eager load-ს **აგდებდნენ** — 164 query → 11
  - ⚠️ **მაგრამ ტასკის დაშვება „PERF-01-ის შემდეგ ავტომატურად წყდება" არასწორი აღმოჩნდა** (გაზომილი): წრფივობა დარჩა — 3 მომხმარებელი → 9 query, 12 → 18, 30 → 36. მიზეზი `role`-ია და არა pivot: `users_list` ყოველ ანგარიშზე `roleKey()`/`isSuperAdmin()`-ს ეკითხება, ე.ი. 12 მომხმარებელზე 18 query-დან **14 `roles`-ზე მოდიოდა**
  - ✅ `User::with('modules', 'role')` — ახლა **6 query, ანგარიშების რიცხვის მიუხედავად** (3 · 12 · 30 — სამივეზე ერთი და იგივე)
  - ⚠️ **ტესტი ორ განსხვავებულ რაოდენობას ადარებს და არა ერთ მუდმივას**: კონკრეტული რიცხვი (დღეს 6) ყოველი ახალი ველით შეიცვლება და ტესტი უცხო ცვლილებებზე დაიწყებდა ცვენას; „N-ზე არ არის დამოკიდებული" კი ზუსტად ის ფაქტია, რომელზეც ტასკია. ძველ კოდზე ცვივა სიტყვებით „31 is identical to 11"
- **ტიპი:** performance
- **სად:** `backend/app/Http/Controllers/Api/Admin/AdminModuleController.php:29-34`
- **პრობლემა:** `User::with('modules')` `:29`-ზე იტვირთება, მაგრამ `isGrantedModule()`/`hasModule()` `$this->modules()` query-builder-ს იყენებენ (PERF-01) — 12 მოდული × 20 მომხმარებელი ≈ 500 query ერთ ადმინ-გვერდზე.
- **რატომ:** `/modules` ადმინის ერთი გვერდი ასობით სერიულ query-ს აკეთებს; მომხმარებელთა ზრდასთან წრფივად უარესდება.
- **გადაწყვეტა:** PERF-01-ის შემდეგ ავტომატურად წყდება; ან ერთი `module_user` map წინასწარ.
- **Acceptance criteria:**
  - [x] `GET /api/admin/modules` query-რაოდენობა მომხმარებელთა რიცხვზე არ არის დამოკიდებული
- **Estimate:** S
- **დამოკიდებულება:** PERF-01

### [PERF-05] Dashboard ~27 სერიული query ყოველ გახსნაზე
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `DashboardController::countsFor()` — **ყველა მთვლელი ერთ `select`-ში**, სკალარული ქვე-query-ებით (`select (select count(*) from movies where …) as c0, (…) as c1 …`). გაზომილი: `/api/dashboard` **4 query** (მოდულები · `module_user` · `gallery_albums` ლოკისთვის · თვლა), ადრე — 16 (PERF-01-ის შემდეგ; მის გარეშე ~27)
  - ⚠️ **ქვე-query მოდელიდან მოდის** (`$model::query()->toBase()->selectRaw('count(*)')`) და არა ხელით დაწერილი `DB::table()`-იდან — სწორედ ეს ინარჩუნებს global scope-ებს: `owner` (თითოეული თავისას ითვლის) და `album_lock` (ჩაკეტილი ალბომის ფოტო არც რიცხვში ჩანს). ხელით დაწერილი `where` ორივეს ასლი იქნებოდა
  - ⚠️ **ფსევდონიმი `c0`/`c1`… და არა მოდულის key**: `gallery` ორ ცხრილს ითვლის (§8.1), ე.ი. key უნიკალური არაა; რომელი რიცხვი ვისია — `$owner` რუკაშია
  - ⚠️ UNION ALL განზრახ **არაა**: მწკრივების რიგი SQL-ში გარანტირებული არაა, ე.ი. key-ს SELECT-ში ჩაწერა (bindings-ით, MySQL-ზე და sqlite-ზე სხვადასხვა ქცევით) დასჭირდებოდა. `FROM`-ის გარეშე `select`-ს ორივე ძრავა იგებს
  - ✅ `DashboardTest::test_the_dashboard_counts_every_module_in_one_query` — ყველა მოდული ჩართული, `count(*)`-ის შემცველი query **ზუსტად 1**, სულ **≤ 4**; ყველა ბარათს რიცხვი აქვს
  - ✅ **ცოცხალ MariaDB-ზე დადასტურდა** (`tinker`, 375 ფილმი / 30 სერიალი / 2 გალერეა): 4 query, რიცხვები ძველ იმპლემენტაციას ზუსტად ემთხვევა
  - ✅ backend 752/752, Pint მწვანე
- **ტიპი:** performance
- **სად:** `backend/app/Http/Controllers/Api/DashboardController.php:71-75`, `:99-101`
- **პრობლემა:** `foreach ($modules …) { if (! $user->hasModule(...)) }` + `countOf()` → `$model::count()` თითო მოდულზე (gallery-ზე ორი): 1 + 12 + 13 ≈ 27 query სერიულად.
- **რატომ:** აპის საწყისი გვერდია — ყოველ შესვლაზე იხდის.
- **გადაწყვეტა:** PERF-01 + ერთი `UNION ALL` `SELECT 'movie', COUNT(*) …` ან მოკლე TTL-ქეში `user + max(updated_at)`-ზე.
- **Acceptance criteria:**
  - [x] `DashboardTest`-ში query-რაოდენობა ≤ 4
- **Estimate:** M
- **დამოკიდებულება:** PERF-01

### [PERF-06] `MatchService::ranking()` ყოველ კანდიდატზე `modules`-ს თავიდან კითხულობს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `PublicProfileService::$domainsMemo` — `user_id` => დომენების სია, **ინსტანციისა და არა სტატიკური** (სერვისი რექვესთზე იქმნება, ე.ი. მემო თავისით ცხრება; სტატიკური ტესტებში/Octane-ზე შემდეგ მოთხოვნაზე გადაყვებოდა — `AlbumLock`-ის გაკვეთილი)
  - ⚠️ **მარტო მემო ტასკის პირობას არ აკმაყოფილებდა.** ის `domains($me)`-ს 50-ჯერ → 1-ჯერ აქცევდა, მაგრამ კანდიდატისა თითოზე ერთი მაინც რჩებოდა, ე.ი. `module_user` კვლავ **წრფივი** იყო. ამიტომ დაემატა `warmDomains(iterable $users)` — ერთი `whereIn` join ყველა კანდიდატზე ერთად, `ranking()`-ის ციკლამდე
  - ⚠️ **რიგის გარეშე დარჩენილ user-ს ცარიელი სია ეწერება** და არა „არაფერი": თორემ `domains()` მასზე ისევ ცალკე query-ს გააკეთებდა და ჭერი დაბრუნდებოდა
  - ⚠️ `$candidates->concat([$me])` და **არა `push()`** — `push` კოლექციას ცვლის, ე.ი. `$me` ქვემოთ ციკლში ჩავარდებოდა და საკუთარ თავთან დამთხვევას დაბადებდა (`truncated`-ის თვლაც გაფუჭდებოდა)
  - ⚠️ ფილტრი `domainsOf()`-შია ერთხელ და არა ორივე გზაზე ასლად
  - ✅ `MatchTest::test_the_ranking_reads_the_module_pivot_a_constant_number_of_times` — 1 კანდიდატზე და 5-ზე `module_user`-ის წაკითხვა ერთი და იგივეა. **მუტაციის შემოწმება:** ფიქსის გამორთვაზე ტესტი წითლდება („1 → 2, 5 → 10")
  - ℹ️ **ჩანაწერების** წაკითხვა კანდიდატებზე წრფივი **რჩება** — ასეა ჩაფიქრებული (ზუსტი შედარება + `MAX_PROFILES`), და ტასკიც ცხადად მხოლოდ `module_user`-ზეა
  - ✅ backend 752/752, Pint მწვანე
- **ტიპი:** performance
- **სად:** `backend/app/Services/Profile/MatchService.php:211-212`
- **პრობლემა:** `summary($me, $other)` → `domains($a, $b)` → `PublicProfileService::domains()` ორივე მომხმარებელზე `module_user` join-ს აკეთებს ყოველ იტერაციაზე; `MAX_PROFILES = 50`-ზე `domains($me)` 50-ჯერ ერთი და იგივე query-ა. `records()` memo-ს აქვს (`:55`), `domains()` — არა.
- **რატომ:** `/people` გვერდი 100+ ზედმეტ query-ს აკეთებს.
- **გადაწყვეტა:** იგივე per-request memo `domains()`-ზე `user_id`-ით.
- **Acceptance criteria:**
  - [x] `MatchTest`-ში `GET /api/matches` query-რაოდენობა კანდიდატთა რიცხვზე წრფივად არ იზრდება `module_user`-ისთვის
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-07] `ModulePage` `DataTable`-ს არა-memo `columns`-ს აწვდის
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ მფლობელების ცხრილი **ცალკე კომპონენტად გამოვიდა** — `ModuleHolders` (იმავე ფაილში, `ModuleFields`-ის წესით): `columns` `useMemo<DataColumn<User>[]>`-ია, `searchOf` · `holderOf` · `toggleFor` — `useCallback`
  - ⚠️ **`useMemo` ადგილზე არ იდგამდა**: `ModulePage`-ს `if (!module) return` ადრეული გამოსვლა აქვს, ხოლო `holderOf`/`toggleFor`/`enabledCount` მის **შემდეგაა** — ე.ი. hook-ის დამატება იმ ადგილას React-ის წესს არღვევს. ცალკე კომპონენტში hook-ები უპირობოა და ცხრილიც მხოლოდ მოდალის გახსნაზე იდგმება
  - ⚠️ **მუტაცია (`syncUserModules`) კომპონენტში გადავიდა** და მშობელი `onDone`/`onError`-ს გადმოსცემს: `onToggle`-ის პროპად გადმოცემა ყოველ რენდერზე ახალ ფუნქციას ნიშნავდა, ე.ი. `columns`-ის მემო ისევ თავს იბათილებდა. `mutate` react-query v5-ში `useCallback`-ია (სტაბილური), `onDone`/`onError` კი მუტაციის ოფციებშია — ყოველ რენდერზე თავიდან იკითხება, მოძველებული closure არ ჩნდება
  - ⚠️ **`fmt` ობიექტი დესტრუქტურიზებულია (`const { date: fmtDate }`)** — `useDateFormat()` ყოველ რენდერზე ახალ ობიექტს აბრუნებს, თუმცა `date` შიგნით `useCallback`-ია; მთელი `fmt` deps-ში იგივე შეცდომა იყო
  - ✅ `tsc -b` (strict), `npm run build`, oxlint მწვანეა; `ModulePage`-ზე გამაფრთხილებელი აღარაა
  - 🟡 **ნაპოვნი, მაგრამ შეგნებულად შეუხებელი:** `UsersPage:222` და `RequestsPage:266` `searchOf`-ს **ინლაინ** აწვდიან, ე.ი. მათი `columns`-ის `useMemo` ისევ ყოველ რენდერზე იბათილება — `filtered`-ის deps-ში `searchOf`-იც წერია. `UsersPage`-ის ერთხაზიანია, `RequestsPage`-ის კი `typeLabel`/`label` closure-ებზეა დამოკიდებული და ჯერ ისინი უნდა გასტაბილურდეს. ტასკის `სად` მხოლოდ `ModulePage`-ს ასახელებდა, ამიტომ ეს ცალკე გადასაწყვეტია
- **ტიპი:** performance
- **სად:** `frontend/src/pages/ModulePage.tsx:340-347`; `frontend/src/components/ui/data-table.tsx:99`
- **პრობლემა:** `columns={[ … ]}` ინლაინ მასივია; `DataTable`-ის memo `[rows, q, sort, columns, searchOf]`-ზეა, ე.ი. ყოველ რენდერზე მთელი სია თავიდან იფილტრება/ისორტება. CLAUDE.md ამას სავალდებულოს უწოდებს და `RequestsPage`/`UsersPage` `useMemo`-ს იყენებენ.
- **რატომ:** ძებნის ყოველ კლავიშზე სრული re-sort; მომხმარებელთა ზრდაზე შესამჩნევი.
- **გადაწყვეტა:** `const columns = useMemo<DataColumn<User>[]>(() => [...], [t, key, module.is_active, setUserModules.isPending])`; `searchOf` `useCallback`-ით.
- **Acceptance criteria:**
  - [x] `ModulePage.tsx`-ში `columns` `useMemo`-შია
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-08] ორივე ლოკალის JSON (360 kB) საწყის bundle-შია
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `ka` რჩება სტატიკური, `en` — დინამიური chunk. გაზომილი: `errors-*.js` (სადაც ლოკალები ჯდებოდა) **362.66 kB → 258.35 kB** (gzip 92.41 → 58.58), `en-*.js` კი ცალკე 106 kB-ია და **`index.html`-ის `modulepreload`-ში არ არის**, ე.ი. საწყის გრაფში აღარაა
  - ⚠️ **„მხოლოდ შენახული ლოკალი სტატიკურად" ლიტერალურად შეუძლებელია**: სტატიკური იმპორტი build-time-ზე იჭრება, `lang` კი localStorage-შია. ამიტომ სტატიკური ის არის, რაც **ნაგულისხმევია** (`ka`) — ინგლისურენოვანი მხოლოდ თავისას ტვირთავს, ქართული კი არაფერს დამატებით
  - ⚠️ **ჩატვირთვა i18next-ის საკუთარი `backend`-ია** (15 ხაზი, ბიბლიოთეკის გარეშე) და არა ხელით `addResourceBundle`: ამიტომ `LanguageDropdown`-ს და `errors.test.ts`-ს **არაფერი შეეცვალა** — `changeLanguage('en')` თვითონვე იწვევს `read()`-ს. ხელით ჩატვირთვა ყველა გამომძახებელს დაავალდებულებდა „ჯერ ჩატვირთე, მერე გადართე"-ს
  - ⚠️ **`fallbackLng: false` აუცილებელია**: i18next fallback ენას `toResolveHierarchy()`-ში ჩადებს და backend-ით **მასაც ჩამოტვირთავს** — `fallbackLng: 'en'` ზუსტად იმას დააბრუნებდა, რასაც ეს ცვლილება აშორებს. ფასი: `ka`-ში გამორჩენილი გასაღები ინგლისურზე აღარ ჩამოვარდება, არამედ თვითონ გასაღები დაიხატება — **დღეს ეს განსხვავება არ ჩანს**, რადგან აუდიტი დრიფტს კრძალავს (გაზომილი: ორივეში ზუსტად 2682 გასაღები, 0 ცარიელი)
  - ⚠️ **`react: { useSuspense: false }`**: backend-ის არსებობისას `hasLoadedNamespace()` ჩატვირთვისას `false`-ია და `useTranslation` **დაასუსპენდებდა**, `<Suspense>` კი მხოლოდ `<main>`-ის შიგნითაა (route-ების chunk-ებისთვის) — გარსი უსაზღვრო suspend-ზე ჩავარდებოდა
  - ⚠️ **`main.tsx` მაუნთს `i18nReady`-ს შემდეგ აკეთებს** (`.finally`, ე.ი. ჩავარდნაზეც ხატავს — თეთრი ეკრანი უარესი პასუხია): ლოდინის გარეშე ინგლისურენოვანი პირველ კადრში **გასაღებებს** დაინახავდა. ქართულზე ლოდინი არაფერს უდრის
  - ✅ `src/i18n/index.test.ts` — init-ზე `hasResourceBundle('en')` **false**-ია (ესაა ტასკის მთელი აზრი და `fallbackLng`-ის დაბრუნების დამცავი), გადართვაზე კი მთელი ბუნდლი მოდის (ორივე ლოკალის top-level გასაღებები იდენტურია)
  - ✅ **ცოცხლად დადასტურდა** (`http://mediary.local`): პირველ ჩატვირთვაზე `en.json` არ ითხოვება; მენიუდან English-ზე გადართვა **გადატვირთვის გარეშე** მთელ ინტერფეისს თარგმნის („Database backup", „Upload a file", სრული sidebar); `lang=en`-ით გახსნა პირველ კადრშივე ინგლისურია; ბრაუზერი ისევ ქართულზე დაბრუნდა
  - ✅ `tsc -b` (strict), `npm run build`, oxlint 0 შეცდომა, Vitest 145 გადის (ცვივა მხოლოდ DEBT-12-ის ცნობილი flake)
- **ტიპი:** performance
- **სად:** `frontend/src/i18n/index.ts:3-4`
- **პრობლემა:** `import ka from './ka.json'` (232 kB) და `import en from './en.json'` (128 kB) სტატიკურად; `main.tsx` `./i18n`-ს eagerly ტვირთავს და `lib/errors.ts`-იც იმპორტირებს — ინგლისურენოვანი მომხმარებელი მთელ ქართულ ლექსიკონს ტვირთავს და პირიქით.
- **რატომ:** იმავე კლასის რეგრესიაა, რასაც `@/pages/` იმპორტის დამცავი grep იჭერს — უბრალოდ დაუფარავი.
- **გადაწყვეტა:** მხოლოდ შენახული ლოკალი სტატიკურად, მეორე `i18n.addResourceBundle`-ით დინამიური `import()`-ის უკან ენის გადართვაზე (`partialBundledLanguages`).
- **Acceptance criteria:**
  - [x] `npm run build`-ის შემდეგ საწყის chunk-ებში ერთი ლოკალის ტექსტია მხოლოდ
  - [x] ენის გადართვა UI-ს სრულად თარგმნის დამატებითი გადატვირთვის გარეშე
- **Estimate:** M
- **დამოკიდებულება:** none

### [PERF-09] პირადი დისკის grid „ყველა" რეჟიმში 1000 blob-XHR-მდე უშვებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `lib/inView.ts` → `useInViewOnce()` და `PhotoCell`-ში ერთი გამოსახულება: `usePrivateFileUrl(privateDisk && (inView || preload) ? item.src : null)`. ე.ი. blob **მხოლოდ viewport-ში (და 600px ბუფერში) მოხვედრილ უჯრაზე** იკითხება
  - ⚠️ **დროშა ერთჯერადია (latch) და არა ორმხრივი**: `usePrivateFileUrl` მისამართის ცვლილებაზე object URL-ს **ათავისუფლებს**, ე.ი. „გავსრიალდა → false" ფოტოს გაქრობას და ხელახალ ჩამოტვირთვას ნიშნავდა
  - ⚠️ **`IntersectionObserver`-ის არარსებობა „ჩანს"-ს უდრის** — jsdom-ს (ტესტები) და ძველ ბრაუზერს ის არ აქვს, და ორივეგან სწორი პასუხი დღევანდელი ქცევაა, და არა ცარიელი ბადე
  - ⚠️ **callback-ref და არა `useRef`+`useEffect`**: `<li>` Radix-ის `ContextMenuTrigger asChild`-ის შიგნითაა, `Slot` კი ბავშვის `ref`-ს თავისიანთან აკომპოზიციებს — ცოცხლად დადასტურდა, საჯარო ბადე კვლავ იხატება
  - ⚠️ **lightbox-ის მეზობლები წინასწარ მოდის** (`PRELOAD_AROUND = 2`): ისრით გადასვლა ეკრანს გარეთ დარჩენილ სლაიდზეც მიდის და ბუფერის გარეშე ცარიელი დარჩებოდა
  - ⚠️ **ჩამოტვირთვა ახლა თვითონ წამოიღებს, რაც ჯერ არ წამოსულა** (`fetchPrivateObjectUrl`): „ყველას მონიშვნა" სხვა გვერდსაც მოიცავს, ე.ი. **ეს ჩუმი გამოტოვება უკვე არსებობდა** გვერდებისთვის — ახლა დახურულია; ხელით შექმნილი object URL 10 წმ-ში თავისუფლდება (`click()`-ის მიყოლებით გათავისუფლება ჩამოტვირთვას აწყვეტინებს)
  - ✅ `lib/inView.test.ts` — 3 ტესტი ცრუ `IntersectionObserver`-ით: ეკრანს გარეთ „არ ჩანს" + დამკვირვებელი კვანძზე მაშინვე ებმება · გამოჩენა ერთხელ ინთება და უკან აღარ ბრუნდება (+ `disconnect()`) · დამკვირვებლის გარეშე ყველაფერი „ჩანს"
  - ✅ `tsc -b` (strict), `npm run build`, oxlint 0 შეცდომა, Vitest 148 გადის (ცვივა მხოლოდ DEBT-12-ის ცნობილი flake)
  - ℹ️ **პრივატული გზა ცოცხლად ვერ შემოწმდა**: ამ ბაზაში `note`-ის (ერთადერთი პრივატული დისკის) ფოტო საერთოდ არაა — `by=module` მხოლოდ movie/series/anime/book/game-ს აჩვენებს, ყველა საჯარო. საჯარო ბადე შემოწმებულია (იხატება), პრივატულის ქცევა კი ერთ გამოსახულებაზეა და უნიტ-ტესტით დაფარულ hook-ზე
  - 🟡 **რაც ამან არ გააკეთა:** მეხსიერება ისევ იზრდება სქროლთან ერთად (გამოჩენილი blob რჩება) და ვირტუალიზაცია არ დაემატა — `PHOTO_PAGE_MAX = 1000` ისევ ჭერია. მოთხოვნების ერთდროულობა კი აღარაა პრობლემა, რაც ტასკის პირობა იყო
  - ℹ️ `PrivateFile.tsx`-ს ერთი oxlint-გაფრთხილება დაემატა (`only-export-components`, ფაილს უკვე ჰქონდა იმავე ტიპის ერთი `usePrivateFileUrl`-ზე) — „როგორ იკითხება პრივატული ფაილი" განზრახ ერთ ფაილშია
- **ტიპი:** performance
- **სად:** `frontend/src/components/ui/photo-grid.tsx:114`, `:124`; `frontend/src/components/PrivateFile.tsx:27-43`
- **პრობლემა:** `PHOTO_PAGE_ALL = 0` / `PHOTO_PAGE_MAX = 1000` ვირტუალიზაციის გარეშე; `privateDisk`-ზე თითო `PhotoTile` `usePrivateFileUrl` → ავტორიზებული `GET` სრული blob-ით მეხსიერებაში. `loading="lazy"` არ შველის — fetch JS-შია.
- **რატომ:** 1000 პარალელური მოთხოვნა 600/წთ გლობალურ ლიმიტზე — გვერდი თავად ითროთლება; მეხსიერება blob-ებით ივსება.
- **გადაწყვეტა:** blob-ის წამოღება მხოლოდ viewport-ში მოხვედრილ tile-ზე (`IntersectionObserver`), ან `privateDisk`-ზე `PHOTO_PAGE_ALL`-ის აკრძალვა.
- **Acceptance criteria:**
  - [x] პირად grid-ზე ერთდროულად აქტიური blob-მოთხოვნები ≤ ხილული tile-ების რიცხვს + ბუფერი
- **Estimate:** M
- **დამოკიდებულება:** none

### [GAP-03] პარამეტრების შენახვის ჩავარდნა უხმაუროდ იყლაპება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `save()`-ის `.catch(() => {})` → `.catch((e) => toast({ title: errorMessage(e), variant: 'error' }))`. `persisted` არ ახლდება, ე.ი. **`dirty` რჩება** — ცვლილება ჯერ არ შენახულა და ზოლმაც ეს უნდა თქვას
  - ⚠️ **მთავარი აღმოჩენა: `useToast()`-ის უბრალო დამატება არ იმუშავებდა.** `SettingsProvider` `main.tsx`-ში `FeedbackProvider`-ზე **გარეთ** იდგა, `ToastContext`-ს კი უმოქმედო ნაგულისხმევი აქვს (`toast: () => 0`) — ე.ი. გამოძახება არ ცდება, **ჩუმად არაფერს აკეთებს**, ზუსტად იგივე კლასის ხარვეზი, რასაც ტასკი ასწორებს. პროვაიდერები გაცვალა ადგილი: `AuthProvider > FeedbackProvider > SettingsProvider > QueueProvider > TooltipProvider`
  - ⚠️ **რიგის შეცვლა უსაფრთხოა და შემოწმდა**: `FeedbackProvider` მხოლოდ `useTranslation`-ს და Radix-ს ეყრდნობა (არც პარამეტრები, არც auth), `queue.tsx` კი ორივეს იყენებს და ორივეს შიგნითაა. `main.tsx`-ში მიზეზი კომენტარად ეწერა — ტესტი `main.tsx`-ს ვერ ხედავს
  - ✅ `lib/settings.test.ts` (ახალი, 5-ე კომპონენტ-ტესტი): 500-ზე toast `Server Error`-ს აჩვენებს და `dirty` `true` რჩება · წარმატებაზე toast არ ჩნდება და `dirty` ცხრება. **მუტაციის შემოწმება:** `.catch(() => {})`-ზე დაბრუნებისას ტესტი წითლდება („expected [] to deeply equal [ 'Server Error' ]")
  - ✅ **ცოცხლად:** `/settings` სუფთა ტაბში 0 კონსოლ-შეცდომით იხსნება (პროვაიდერის რიგი runtime-ის ფაქტია, `tsc` მას ვერ ხედავს)
  - 🟡 **განზრახ დარჩა:** ერთჯერადი მიგრაციის `void saveSettings(local).catch(() => {})` (ძველი localStorage → backend, `user`-ის პირველი ჩატვირთვაზე) ისევ ჩუმია — ის მომხმარებლის ქმედება არაა და აპის ჩატვირთვაზე toast დამაბნეველი იქნებოდა. ⚠️ სამაგიეროდ `persisted` მაშინვე იწერება, ე.ი. მიგრაციის ჩავარდნაზე ზოლი „ცვლილება არ არის"-ს ამბობს — ეს ხარვეზი აქამდეც იყო და ცალკე გადასაწყვეტია
- **ტიპი:** gap
- **სად:** `frontend/src/lib/settings.tsx:263-271`
- **პრობლემა:** `saveSettings(settings).then(...).catch(() => {}).finally(...)` — `/settings` და `/sync`-ის ერთადერთი შენახვის გზაა; 500/419/ქსელზე toast არ არის, `SettingsSaveBar` „შეუნახავი ცვლილებებს" აჩვენებს ახსნის გარეშე.
- **რატომ:** მომხმარებელი Save-ს უსასრულოდ აჭერს; აპის ყველა სხვა მუტაცია `onError` toast-ს აძლევს.
- **გადაწყვეტა:** პროვაიდერში `useToast()` და `catch`-ში `toast({ title: errorMessage(e), variant: 'error' })`.
- **Acceptance criteria:**
  - [x] შენახვის 500-ზე toast ჩანს და `dirty` რჩება
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-04] read-only probe endpoint-ები POST-ია და `create` უფლებას ითხოვენ
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `EnsureModulePermission::VIEW_ENDPOINTS = ['metadata', 'plan']` — `UPDATE_ENDPOINTS`-ის ტყუპი: POST, რომლის ბოლო სეგმენტი ამბობს, რომ ის **მხოლოდ კითხულობს**. ოთხივე მარშრუტი (`/videos/metadata` · `/songs/metadata` · `/bookmarks/metadata` · `/gallery/plan`) ახლა `view`-ია და ოთხივეს კომენტარი აწერია
  - ⚠️ **ტასკის ღია კითხვას („მეტამონაცემზე `create` განზრახ არის?") კოდმა უპასუხა: არა.** `VideosPage`-ის `loadMeta()` **რედაქტირებიდანაც** ეშვება — `lastFetched` არსებული URL-ით იწყება, ე.ი. ბმულის **შეცვლაზე** probe ისევ მიდის. ამიტომ როლი „ვცვლი, მაგრამ არ ვქმნი" არსებული ჩანაწერის ბმულს ვერ შეასწორებდა (ცრუ 403) — ე.ი. `create` ცოცხალი ხარვეზი იყო და არა კონვენცია. ამიტომ კომენტარის ნაცვლად უფლებაც შეიცვალა
  - ⚠️ **სია და არა როუტის დროშა**: ჯგუფში ცხადი `permission:<module>,view` ჯგუფის საკუთარ `permission:<module>`-ს **არ ცვლის** — შუამავლები გროვდება და ორივე ეშვება (იგივე ხაფანგი, რაც `move`-ს ეწერა). ალტერნატივა ცალკე ჯგუფი იყო (`/media/sync/plan`-ის სტილი), მაგრამ „read-only POST" ერთი ცნებაა და სამ მოდულზეა გაფანტული — ერთი სია ერთ ადგილას
  - ⚠️ **ჩაწერილია, რა რისკს ატარებს სია** (audit §A4-ის წესი): POST, რომელიც `metadata`/`plan`-ზე ბოლოვდება და **მაინც წერს**, ჩუმად გაიხსნება — ახალ ასეთ endpoint-ს სხვა სახელი ან ცხადი უფლება სჭირდება
  - ✅ `GalleryTest::test_a_view_only_role_can_ask_for_the_plan` — view-only როლი გეგმას იღებს (200), **ჩამოტვირთვა კი ისევ 403-ია** (გეგმის გახსნა მას არ აღებს). **მუტაციის შემოწმება:** `VIEW_ENDPOINTS = []`-ზე ტესტი წითლდება (403)
  - ✅ `VideoModuleTest::test_an_update_only_role_can_probe_a_link` — update-only როლი probe-ს აკეთებს, `POST /videos` კი ისევ 403-ია
  - ✅ backend 754/754, Pint მწვანე
  - ℹ️ **`lookup`/`candidates` განზრახ არ შეიცვალა**: `/lookup`-ის მედია-ვერსია უკვე `permission:@type,view`-ია, book/game/board-game-ის კი — `create`. იმავე კითხვა ეხებათ (ფორმა რედაქტირებისასაც იძახებს?), მაგრამ ეს ტასკი მათზე მხოლოდ კომენტარს ითხოვდა და მტკიცებულება ჯერ არ მოგროვდა — ცალკე შესამოწმებელია
- **ტიპი:** gap
- **სად:** `backend/routes/api.php:637` (`/gallery/plan`), `:343` (`/videos/metadata`), `:565` (`/songs/metadata`), `:610` (`/bookmarks/metadata`); წესი `backend/app/Http/Controllers/Api/VideoBulkController.php:60-63`
- **პრობლემა:** კოდში ჩაწერილი წესი („`GET` და არა `POST`, თორემ view+update როლი უსაფუძვლო 403-ს იღებს") `/videos/bulk-preview`-სა და `/board-games/shops`-ზეა გამოყენებული, ამ ოთხზე კი — არა. `/gallery/plan` არაფერს წერს.
- **რატომ:** view-only როლი გალერეის გეგმას ვერ ხედავს; `metadata`/`lookup` create-ის წინა probe-ებია, ე.ი. `create` შეიძლება განზრახ იყოს — მაგრამ ეს არსად არ წერია და მკითხველი ვერ გებულობს, რომელი კონვენციაა ნამდვილი.
- **გადაწყვეტა:** `/gallery/plan` → GET ან `permission:gallery,view`; `metadata`/`lookup`-ზე ერთსტრიქონიანი კომენტარი, რომ `create` განზრახაა.
- **Acceptance criteria:**
  - [x] view-only როლით `/gallery/plan` 200-ია (`GalleryTest`)
  - [x] სამ `metadata` როუტს კომენტარი აქვს
- **Estimate:** S
- **დამოკიდებულება:** SEC-07

### [GAP-10] `RolePage` მხოლოდ `super_admin`-ს ხატავს, თუმცა `/roles` `canAdmin('roles')`-ით იხსნება — role-granted ადმინი ცარიელ გვერდს ხედავს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `RolePage` → `canAdmin('roles')` (query-ის `enabled` და გვერდის დამცავი), შენახვა → `canAdmin('roles', 'update')`. სახელის ველებიც `update`-ზეა და შენახვის ზოლი „შეუნახავის" ნაცვლად **მიზეზს** ამბობს (`roles.readOnly`)
  - ✅ **ორი read-only საკეტი, ორივე SEC-03-ის სარკე**: ადმინ-სექციების ბარათები არა-სუპერ-ადმინზე გამორთულია (`roles.adminSectionsLocked` — 403 `role_escalation`), საკუთარ როლზე კი **მთელი მატრიცა** (`roles.ownRoleLocked` — 422 `cannot_edit_own_role`), სახელი კი იცვლება, რადგან backend გადარქმევას უშვებს
  - ⚠️ **ბარათი არ იმალება, მხოლოდ ცვლილება ითიშება**: „რა უფლება აქვს ამ როლს" ნახვის უფლების მქონესაც ეკუთვნის; `PermCard`/`PermToggle` ერთ ახალ `readOnly` პროპს იღებს (სამი ასლის ნაცვლად ერთ ადგილას)
  - ✅ **`UserPage`-ის ხვრელიც დაიხურა და ახალი endpoint-ით**: `GET /admin/assignable-roles` (`admin_access:users`, `AdminUserController::roles()`) — `fetchRoles()` `admin_access:roles`-ის უკანაა, ე.ი. `admin:users`-only ადმინი 403-ს იღებდა და როლის სელექტი **ჩუმად ცარიელი** რჩებოდა. ⚠️ ფორმა **ვიწროა ხელით** (`id`/`key`/`name_ka`/`name_en`) და არა `RoleResource`: უფლებების მატრიცა ამ სექციის უფლებას სცილდება (`PublicDomain::card()`-ის წესი). ⚠️ `enabled: false`-ის დამატება არ იშველიებდა — სელექტი ისევ ცარიელი იქნებოდა
  - ✅ `pages/RolePage.test.ts` (ახალი, 6-ე კომპონენტ-ტესტი, 4 შემთხვევა): მატრიცა იხატება და მოდული იცვლება · ადმინ-სექცია გამორთულია · საკუთარ როლზე მატრიცა გამორთულია და სახელი — არა · ნახვის უფლებით შენახვა გამორთულია. **მუტაციის შემოწმება:** `if (!isAdmin) return null`-ზე დაბრუნებისას **ოთხივე** წითლდება „expected '' to contain"-ით, ე.ი. ზუსტად ის ცარიელი გვერდი
  - ✅ `RoleApiTest` +2: `admin:users`-ის მქონე სიას იღებს (და `GET /admin/roles` მისთვის ისევ 403-ია) · `admin:roles`-ის მქონეს ახალი endpoint 403-ს აძლევს. „მოდულების უფლების შენახვა" უკვე იყო დაფარული (`test_a_roles_admin_cannot_strip_admin_sections_from_another_role`-ის მეორე ნახევარი)
  - ✅ backend 758/758, Pint, `tsc -b`, build, oxlint და 154 frontend-ტესტი მწვანე; ცოცხლად `/roles/2` და `GET /admin/assignable-roles` მუშაობს
  - 🔴 **ცოცხალი ბაზაზე ნაპოვნი გვერდითი აღმოჩენა — იხ. [SEC-13]**: `user` როლს (ე.ი. ყოველ ჩვეულებრივ ანგარიშს) ოთხივე ადმინ-სექცია აქვს მინიჭებული
- **ტიპი:** gap
- **სად:** `frontend/src/pages/RolePage.tsx:72`, `:80`, `:130` (`isAdmin` → `lib/auth.tsx:99` = `is_super_admin`); vs `frontend/src/pages/RolesPage.tsx:62`, `:69`, `:82` და `frontend/src/App.tsx:299-300` (`canAdmin('roles')`); `frontend/src/pages/UserPage.tsx:75` (`fetchRoles` gate-ის გარეშე)
- **პრობლემა:** SEC-03-ის შესრულებისას ნაპოვნი. `admin:roles`-ის მქონე (`super_admin` არა) სიას ხედავს, როლზე დაჭერისას კი `RolePage` `null`-ს აბრუნებს — ცარიელი გვერდი. CLAUDE.md-ის წესი („`canAdmin()` ხატავს ბმულებს, როუტებს და გვერდის შიდა დამცავებს — `is_super_admin`-ს ნუ ამოწმებ") აქ დარღვეულია. `UserPage` `/admin/roles`-ს `canAdmin('roles')`-ის გარეშე ითხოვს, ე.ი. `admin:users`-only ადმინს როლის select ცარიელია (403). SEC-02/SEC-03-ის შემდეგ გვერდის გახსნა უსაფრთხოა, მაგრამ UI-ს ორი საკეტი სჭირდება: ადმინ-სექციების ბარათები `super_admin`-ის გარდა read-only, და საკუთარი როლის მატრიცა read-only.
- **რატომ:** role-grantable ადმინ-ზონა (Tasks 1.6) `roles` სექციაზე ფაქტობრივად API-only-ია; UI ცარიელ გვერდს აჩვენებს ახსნის გარეშე.
- **გადაწყვეტა:** `RolePage` → `canAdmin('roles')` (`update` — შენახვის ღილაკისთვის); `ADMIN_RESOURCES`-ის `PermCard`-ები `me.is_super_admin`-ის გარეშე `disabled` + ახსნა (`role_escalation`-ის ლოგიკა); საკუთარ როლზე (`me.role_id === role.id`) მატრიცა `disabled` + `cannot_edit_own_role`-ის ახსნა; `UserPage`-ზე `admin:users`-only ადმინს როლების read-only სია სჭირდება — ⚠️ `enabled`-ის დამატება მარტო არ შველის, რადგან `GET /admin/roles` `admin_access:roles`-ის უკანაა (მაგ. სიის `admin:users.view`-ზეც გახსნა, ან ცალკე მსუბუქი endpoint).
- **Acceptance criteria:**
  - [x] `admin:roles`-only ადმინი `/roles/:id`-ზე მატრიცას ხედავს და მოდულების უფლებებს ინახავს
  - [x] მისთვის ადმინ-სექციები და საკუთარი როლი read-only-ია (კომპონენტ-ტესტი `react-dom/client`-ით)
- **Estimate:** S
- **დამოკიდებულება:** SEC-03

### [GAP-11] `APP_KEY`-ის შეცვლის შემდეგ ყველა per-user გასაღები ჩუმად „ცარიელი" ხდება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ `UserCredential::isReadable()` — ერთი პრედიკატი; `fields()` შედეგს იმახსოვრებს, ე.ი. ორი try/catch-ის ასლი არ ჩნდება
  - ✅ `GET /api/credentials` თითო წყაროზე **`undecryptable`**-ს ატარებს. ⚠️ **ცალკე ველი და არა `source`-ის მეოთხე მნიშვნელობა**: `source` პასუხობს „რომელი გასაღები მოქმედებს ახლა" და გაუშიფრავ რიგზე პასუხი მართლაც `shared`/`none`-ია (აპი ზუსტად ასე იქცევა) — ერთ ველში შერევა ერთს მათგანს ატყუებდა
  - ✅ ერთჯერადი `Log::warning` თითო რიგზე (`user_id:provider`), `warning` და არა `error` — აპი აგრძელებს მუშაობას, ე.ი. ეს დიაგნოსტიკაა. სტატიკური `$warned` `TestCase::setUp()`-ში სუფთავდება (`AlbumLock`/`CredentialStore`-ის იგივე წესი)
  - ⚠️ **გზადაგზა ნაპოვნი და გასწორებული 500**: გაუშიფრავ რიგზე **ახალი გასაღების ჩაწერა** — ერთადერთი გამოსავალი, რაც მომხმარებელს რჩება — თვითონ ცდებოდა. Eloquent-ის `originalIsEquivalent()` დაშიფრული cast-ის **ორიგინალს** შიფრავს, ე.ი. `save()` იმავე `DecryptException`-ზე ვარდებოდა (იგივე ხაფანგი SEC-12-ის მიგრაციას დაემართა). `forgetUnreadable()` ორიგინალს მეხსიერებაში აბათილებს. ⚠️ `test()`-ის გზა უსაფრთხო იყო — ის query-builder `update()`-ს იყენებს, ე.ი. dirty-შემოწმება არ ეშვება
  - ✅ SPA: `credentials.undecryptable` ორივე ლოკალში (2683 = 2683, დრიფტი 0) და ბარათზე წითელი ბლოკი მიზეზითა და გამოსავლით. ⚠️ **პროზა და არა ხატულა**: ტექსტი **მდგომარეობითია** (გამოჩნდა ამჟამინდელი მდგომარეობის გამო) — სწორედ ის შემთხვევა, რომელსაც `InfoHint`-ის წესი პროზად ტოვებს
  - ✅ `CredentialTest` +2: სხვა გასაღებით დაშიფრული რიგი → `undecryptable: true`, `source !== 'user'`, `usesOwnKey()` false და ლოგში **ერთი** გაფრთხილება · ახალი გასაღების ჩაწერა მუშაობს და `source` `user` ხდება. **მუტაციის შემოწმება:** `forgetUnreadable()`-ის მოხსნაზე ტესტი 500-ით წითლდება (`The MAC is invalid`)
  - ✅ **ცოცხლად:** `/api/credentials` რვავე წყაროზე ველს ატარებს; ამ ბაზის ერთადერთი რიგი (telegram) SEC-12-ის მიგრაციის შემდეგ **წაკითხვადია**, ე.ი. ბანერი სწორად არ ჩანს
  - ✅ CLAUDE.md-ის SEC-12-ის აბზაცი განახლდა („ეს სიჩუმე აღარაა"); „მანქანის შეცვლისას `APP_KEY` გადაიტანე" იმავე აბზაცში უკვე ეწერა
  - 🟡 **დარჩა FEAT-05-ზე**: `mediary:doctor`-ში ამ შემოწმების ჩადება — ბრძანება ჯერ არ არსებობს, ე.ი. მისი ტასკის ნაწილია
- **ტიპი:** gap
- **სად:** `backend/app/Models/UserCredential.php:53-62` (`fields()` — `catch (\Throwable) { return []; }`); `backend/app/Services/Credentials/CredentialStore.php:143-156` (`value()` → shared-ზე ვარდნა)
- **პრობლემა:** SEC-12-ის ცოცხალ ბაზაზე შესრულებისას ნაპოვნი: `user_credentials`-ის რიგი (telegram, 2026-09-15) ძველ კომპიუტერზე სხვა `APP_KEY`-ით დაშიფრდა, ამ მანქანის `.env`-ის გასაღები კი სხვაა. `fields()` `DecryptException`-ს ყლაპავს, ე.ი. აპი ასეთ რიგს „მომხმარებლის გასაღების არყოფნად" კითხულობს: `CredentialStore` **shared** `.env` გასაღებზე ვარდება (და `quotaOwner()` `null` ხდება — პირადი ლიმიტი ჩუმად საერთო ხდება) ან „none"-ზე; `/credentials` ახსნის გარეშე „არ არის"-ს აჩვენებს; Telegram-ის შეხსენება SEC-12-ამდე მხოლოდ pivot-ის ღია ასლზე მუშაობდა. ლოგში არაფერი იწერება.
- **რატომ:** მანქანის შეცვლა (ზუსტად ეს მოხდა 2026-09-17-ს) ან `key:generate`-ის შემთხვევითი გაშვება ყველა ანგარიშის პირად გასაღებს **უხმოდ** აქრობს — პროექტის ყველაზე მძიმე ბაგის კლასი („silent skip").
- **გადაწყვეტა:** `UserCredential::isReadable()`; `GET /api/credentials` თითო წყაროზე `state: 'undecryptable'` (და UI-ში ახსნა: „სხვა `APP_KEY`-ით დაშიფრულია — ხელახლა ჩაწერე ან ძველი `APP_KEY` დააბრუნე"); ერთჯერადი `Log::warning`; FEAT-05-ის `mediary:doctor`-ში შემოწმება; CLAUDE.md-ში „მანქანის შეცვლისას `APP_KEY` გადაიტანე".
- **Acceptance criteria:**
  - [x] სხვა `APP_KEY`-ით დაშიფრულ რიგზე `/api/credentials` `undecryptable`-ს აბრუნებს (ტესტი `Encrypter`-ით)
  - [x] `/credentials`-ზე ეს მდგომარეობა ორივე ენაზე ახსნილია
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-02] `ActorWebPhotos.tsx`-ში ნამდვილი NUL ბაიტებია — ფაილს git/grep ბინარულად კითხულობს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18)
  - ✅ ორივე ნამდვილი U+0000 ბაიტი ლიტერალურ `\x00` escape-ად გადაიქცა (5286 → 5292 ბაიტი). `file` ახლა `JavaScript source, Unicode text, UTF-8 text`-ს ამბობს (იყო უბრალოდ `data`), NUL ბაიტი — 0
  - ⚠️ **runtime ქცევა ზუსტად იგივეა**: `'\x00'` წყაროში სწორედ იმ ერთსიმბოლოიან სტრიქონს იძლევა, რასაც ნედლი ბაიტი — `dirty`-ს შედარება უცვლელია
  - ✅ `.gitattributes`-ში `*.ts text` + `*.tsx text` (ტასკი `*.tsx`-ს ითხოვდა; `.ts`-ც დაემატა, რადგან `lib/` `.ts`-ია და ხაფანგი იგივეა). ⚠️ **დროშა NUL ბაიტს ვერ აკრძალავს** — ის მხოლოდ იმას იძლევა, რომ ფაილი ინდექსში ყოველთვის ტექსტად ჩაიწეროს, მანქანის `core.autocrlf`-ის მიუხედავად; ნამდვილი ფიქსი თვითონ ბაიტების მოშორებაა
  - ⚠️ `git ls-files --eol` ადრე `i/-text`-ს აჩვენებდა (ე.ი. git-ის ინდექსში ფაილი **არა-ტექსტი** იყო) — ზუსტად ამიტომ ვერ ხედავდა მას `grep -rn`; ინდექსში სხვაგან CRLF არ არის, ე.ი. ახალი დროშა არაფერს გადაანორმალიზებს
  - ℹ️ **პირველი `git diff` ისევ „Binary files differ"-ია და ეს ნორმალურია** — შედარების **ძველ** მხარეს ისევ NUL ბაიტია; კომიტის შემდეგ დიფი ტექსტურია
  - ✅ `tsc -b`, oxlint მწვანე
- **ტიპი:** debt
- **სად:** `frontend/src/components/ActorWebPhotos.tsx:52`
- **პრობლემა:** `tags.join('\x00') !== initial.join('\x00')` — ორი `\x00` ფაილში **ნამდვილი U+0000 ბაიტია** (`cat -v` → `^@`), არა escape. `grep -rn` „Binary file matches"-ს აბეჭდავს, `git diff` „Binary files differ"-ს.
- **რატომ:** კომპონენტი ყველა აუდიტისა და review-ინსტრუმენტისთვის უხილავია (ეს აუდიტიც მას grep-ით ვერ ხედავდა).
- **გადაწყვეტა:** `'\x00'` ან `String.fromCharCode(0)` escape-ად (იგივე runtime ქცევა, ფაილში კი მხოლოდ ტექსტი); `.gitattributes`-ში `*.tsx text`. (ეს აუდიტიც ამავე ხაფანგში მოხვდა: `tasks.md`-ის პირველ ვერსიაში `\x00` ესქეიპი ნამდვილ NUL ბაიტად ჩაიწერა.)
- **Acceptance criteria:**
  - [x] `grep -c -P '\x00' src/components/ActorWebPhotos.tsx` → 0; `file` ტექსტს აჩვენებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-03] ახალი `PublicProfileController::photoFile()` (uncommitted) ტესტის გარეშეა
- **სტატუსი:** ✅ შესრულებულია (2026-09-18) — ოთხივე ტესტი `PublicGalleryTest`-შია, 13/13 მწვანეა.
  - ✅ `test_a_public_photo_is_served_from_the_file_route` — საჯარო ჩანაწერის ფოტო 200 და **ნამდვილი ბაიტები** (`streamedContent()`); უამისოდ „200 დავაბრუნე" ცარიელ სხეულსაც ნიშნავდა
  - ✅ `test_a_locked_albums_file_is_404_until_the_password_is_given` — ერთი და იგივე ბილიკი **ორჯერ**, მხოლოდ სესიის მდგომარეობა იცვლება; ფაილი **პირად დისკზეა** (`gallery/locked`), ე.ი. ტესტი სწორედ იმ მდგომარეობას აღწერს, რისთვისაც ეს მარშრუტი დაიწერა
  - ✅ `test_another_profiles_photo_is_404_on_alices_file_route` — ბობის პროფილიც **საჯაროა**, ე.ი. ტესტი პროფილებს ჭეშმარიტად კვეთს და არა უბრალოდ „დამალულ მონაცემს" ითხოვს
  - ✅ `test_the_file_route_is_404_when_public_profiles_are_off`
  - ✅ **მუტაციის შემოწმება (სამივე მცველი ცალ-ცალკე გატეხილი, სამივე აწითლებს ზუსტად თავის ტესტს):** (ა) `PublicGallery::visible()`-ს ლოკის შემოწმება მოეხსნა → ჩაკეტილის ტესტი „200 ≠ 404"; (ბ) `query($user)` → ბრტყელი `withoutGlobalScope('owner')` → სხვისი id-ის ტესტი წითლდება; (გ) `profiles->resolve()` → პირდაპირი `User::where('username')` → `PUBLIC_PROFILES=false` ტესტი წითლდება
  - ⚠️ **404 და არა 423 ჩაკეტილზე** — აქ ბაიტები ან გამოდის, ან არა; „ეს ფოტო არსებობს" თვითონაც ინფორმაციაა, და სიის endpoint უკვე ამბობს `locked: true`-ს
- **ტიპი:** debt
- **სად:** `backend/app/Http/Controllers/Api/PublicProfileController.php:142-155`
- **პრობლემა:** ერთადერთი ავტორიზაციის გარეშე როუტი, რომელიც **პირადი** დისკიდან ფაილს აბრუნებს; `grep -rn "gallery-photos.*file" backend/tests` ცარიელია. სამი დამცავი (არასაჯარო პროფილი → 404, ჯერ ჩაკეტილი ალბომი → 404, სხვისი image id → 404) შეუმოწმებელია.
- **რატომ:** ცვლილება ჯერ კომიტებულიც არ არის — ტესტის დაწერის იაფესი მომენტია.
- **გადაწყვეტა:** `PublicGalleryTest`-ში: საჯარო ალბომის ფოტო 200; ჩაკეტილი unlock-ამდე 404 და შემდეგ 200; სხვისი id 404; `PUBLIC_PROFILES=false` 404.
- **Acceptance criteria:**
  - [x] ოთხივე ტესტი წერია და მწვანეა
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-04] `mediary:storage-recalc` ტესტის გარეშეა
- **სტატუსი:** ✅ შესრულებულია (2026-09-18) — ორი ტესტი `StorageManagementTest`-ში, 23/23 მწვანე.
  - ✅ `test_storage_recalc_rebuilds_a_drifted_counter` — **ბრძანების** ქცევა: დრიფტი ორივე მიმართულებით (გაბერილიც, დაკლებულიც) სწორდება, `--user=` მართლა ზღუდავს (სხვისი, ასევე არასწორი, მრიცხველი ხელუხლებელია), უ`--user`-ოდ ყველას ასწორებს, უცნობი მომხმარებელი — `FAILURE`
  - ✅ `test_every_stored_file_model_is_counted_by_the_recalculation` — **სისრულის** მცველი: ყოველი `StoredFile`-ის მომხმარებელი მოდელის ყოველი რიგი `StorageMeter::files()`-ში უნდა ჩანდეს
  - ⚠️ **ორად გაყოფა განზრახია და არა მოხერხებულობა.** `recalculate()` ზუსტად `files()->sum('size')`-ია, ე.ი. პირველ ტესტში მასთან შედარება **ტავტოლოგიაა** — ის ბრძანებას ამოწმებს და არა „რა ითვლება"-ს. სწორედ მეორე ტესტი იჭერს იმ შემთხვევას, რომლის გამოც ეს ტასკი დაიწერა: ახალი ცხრილი `files()`-ში არ ჩაიწერა → გადათვლა **უხმოდ ამცირებს** ჯამს და უფასო კვოტას აძლევს (`games.cover_path`-ისა და `database_backups`-ის ისტორია)
  - ⚠️ მოდელების სია **კოდიდან იკითხება** (`glob(app_path('Models/*.php'))` + `class_uses_recursive`), ხელით არ იწერება — თორემ ხვალინდელი `<module>_files` ზუსტად ისე გამოგვრჩებოდა, რაც ტესტს უნდა დაეჭირა. სკანერის გაფუჭება ციკლს **უხმოდ დააცარიელებდა**, ამიტომ ჯერ სამი ღუზა მოწმდება (`GalleryImage`/`VideoFile`/`DatabaseBackup`) — `RegistryConsistencyTest`-ის წესი; ასევე ყოველ ნაპოვნ მოდელს `inventory()`-ში რიგი უნდა ჰქონდეს, თორემ ციკლი მასზე არაფერს ამტკიცებს
  - ⚠️ `fillDisk()` — უსვეტო ბლოკები (ავატარი, პოსტერი, თამბნეილი, ყდა) ზომას **მხოლოდ დისკიდან** კითხულობენ (`fileSize()`), ე.ი. ფაილის გარეშე ისინი ნულია და ტესტი მათ ჩუმად ვერ შეამოწმებდა. მოსალოდნელი ჯამი 8288 = 8188 (სვეტები) + 100 (10 უსვეტო ბილიკი × 10 ბაიტი)
  - ✅ **მუტაციის შემოწმება (სამივე ცალკე, სამივე აწითლებს ზუსტად თავის მტკიცებას):** (ა) `recalculate()`-ს `save()` მოეხსნა → „999999 ≠ 8288"; (ბ) `files()`-ს `book_files`-ის ბლოკი გამოეთიშა → „BookFile … `files()`-ში არ ჩანს"; (გ) ბრძანებას `--user` ფილტრი გამოეთიშა → „0 ≠ 4242"
- **ტიპი:** debt
- **სად:** `backend/app/Console/Commands/RecalculateStorageCommand.php:37-39`
- **პრობლემა:** `grep -rn "storage-recalc" backend/tests` არაფერს აბრუნებს. ბრძანება დრიფტირებული `storage_used_bytes`-ის ერთადერთი შესაკეთებელი გზაა და `StorageMeter::files()`-ის ~20 წყაროზეა დამოკიდებული.
- **რატომ:** ახალი ფაილ-ცხრილის გამოტოვება (`database_backups`, მრავალფაილიანი custom fields ბოლო მაგალითებია) რეკალკულაციას *ამცირებს* და მომხმარებელს უფასო კვოტას აძლევს — უხმოდ.
- **გადაწყვეტა:** ტესტი, რომელიც `files()`-ის ყოველ `owner_type`-ზე თითო ფაილს ქმნის, მრიცხველს აფუჩეჩებს, ბრძანებას უშვებს და ჯამს ადარებს; `RegistryConsistencyTest`-სტილის assertion, რომ ყოველი `StoredFile` მოდელი `files()`-შია.
- **Acceptance criteria:**
  - [x] ორივე ტესტი წერია და მწვანეა
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
