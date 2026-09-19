# Tasks

აუდიტი 2026-09-18 (`audit-spec.md`-ის მიხედვით) — წინა აუდიტის (2026-09-17) 67 შესრულებული ტასკი შენი მითითებით (2026-09-18: „ამჯამინდელები გაასუფთავე და წაშალე შესრულებულები") ამ ფაილიდან წაიშალა; დარჩა მხოლოდ ორი 🟡, რომელთა ნარჩენი **შენი** ქმედებაა (SEC-01, SEC-06). ყველა `path:line` რეპოს root-იდანაა და `sed -n`-ით დადასტურებულია. კოდი არ შეცვლილა — ეს ფაილი ერთადერთი გამოსავალია.

**ID-ები ძველი აუდიტის ნუმერაციას აგრძელებენ** (SEC-14+, BUG-16+, PERF-14+, GAP-12+, DEBT-13+, FEAT-06+): CLAUDE.md და git-ის ისტორია ძველ ID-ებზე (SEC-01…SEC-13, BUG-01…BUG-15, PERF-01…PERF-13, GAP-01…GAP-11, DEBT-01…DEBT-12, FEAT-01…FEAT-05) მიუთითებს, ე.ი. მათი ხელახლა გამოყენება ორაზროვნებას შექმნიდა.

**შესრულება:** ტასკები სათითაოდ სრულდება, ყოველ შემდეგზე გადასვლა — მხოლოდ ნებართვით; თითო შესრულებული ტასკი ცალკე კომიტია (push-ის გარეშე). შესრულებული ტასკი სტატუსს იღებს (ცხრილის ბოლო სვეტი + ტასკის `სტატუსი` ველი) და **შენი მითითებით იშლება** შემდეგი აუდიტის/გასუფთავების დროს (2026-09-18-ის ახალი წესი — აქამდე „არასდროს იშლებოდა"). `path:line`-ები აუდიტის მომენტს ასახავენ და შესწორებების შემდეგ შეიძლება გადაიწიონ.
სტატუსი: ⬜ ღია · 🟡 ნაწილობრივ (რჩება ნებართვა ან შენი ქმედება) · ✅ შესრულებულია

**ამ აუდიტის მოცულობა:** backend-ის ყველა კონტროლერი, სერვისი, Support-კლასი, მოდელი, middleware, მიგრაციების ინდექსები და კონსოლის ბრძანებები; frontend-ის shell (`App`, `auth`, `api`, `i18n`), `lib/`, სქრიპტები და რისკიანი პატერნები (`grep`-ით); CI/README/`.env.example`; ორივე ლოკალი — `ka.json`-ის 2690 გასაღები სათითაოდ წაიკითხა და პროგრამულადაც შემოწმდა (მხედრულის არქონა, en-ის ასლი, ბრჭყალები, პლეისჰოლდერები, ლათინური სიტყვები, სასვენი ნიშნები). დამოკიდებულებების აუდიტი (`composer audit`, `npm audit`) სუფთაა.

## Summary
| ID | ტიტული | severity | ტიპი | estimate | სტატუსი |
|----|---------|----------|------|----------|----------|
| SEC-01 | პროდ-ბაზის dump git-ის ისტორიაში იყო — რჩება პაროლების შეცვლა და Telegram ტოკენის როტაცია | Critical | security | M | 🟡 ნაწილობრივ |
| BUG-16 | `/purge`: ბუკმარკზე `mode=tag` **ყველა** ბუკმარკს შლის — ტეგის ფილტრი დომენების სიაში `bookmark`-ს არ იცნობს | Critical | bug | S | ✅ |
| SEC-06 | ცოცხალი TMDB გასაღები `.env.example`-ში იყო — რჩება გასაღების როტაცია themoviedb.org-ზე | High | security | S | 🟡 ნაწილობრივ |
| SEC-14 | API-გასაღებები URL-ის query-შია და cURL-ის შეცდომის ტექსტით პასუხის body-სა და `sources.log`-ში ხვდება | High | security | M | ✅ |
| BUG-17 | `MovieEnricher`/`TvEnricher` თითო ჩანაწერზე ორ Gemini-გამოძახებას ხარჯავს TMDB-ის ქართულის ნაცვლად და `source='translated'`-ს წერს — ბარათი „წყარო უცნობია"-ს აჩვენებს | High | bug | M | ✅ |
| GAP-12 | 25 API-პასუხი ქართული წინადადებაა და არა მანქანური კოდი; Laravel-ის ვალიდაციის ტექსტი ინგლისურია (`lang/ka` არ არსებობს) | High | gap | M | ✅ |
| BUG-18 | `ka.json`-ში ორთოგრაფიული და გრამატიკული შეცდომებია („ჟანრიის" ×8, „კატეგორიაის" ×2, „ნიშავს", „სასაათე", „გალერიის", „დამრჩეს", „ნაცვლად არ არის", ბრუნვები `moveTo`-ში) | High | bug | S | ✅ |
| BUG-19 | `GenreRemover` ანიმეს არ ითვლის და არ გადაიტანს — ჟანრის წაშლა ანიმეს მიბმებს ჩუმად კარგავს | High | bug | S | ✅ |
| BUG-20 | „მთავარად დაყენება" სიმღერის/წიგნის/თამაშის ფოტოზე 500-ია — `poster_path` მათ არ აქვთ, UI კი ღილაკს ხატავს | High | bug | S | ✅ |
| BUG-21 | ანგარიშის წაშლა (`DELETE /admin/users/{id}`) მხოლოდ ფილმებს/სერიალებს შლის მოდელით — 8 მოდულის ფაილები დისკზე რჩება, კვოტა კი გაქრობს | High | bug | M | ✅ |
| PERF-14 | `/admin/users` თითო მომხმარებელზე `StorageMeter::files()`-ს (~30 query + დისკი) იძახებს | High | performance | S | ✅ |
| GAP-13 | აუდიტ-ლოგში 8 მოდელის სუბიექტი ლეიბლის გარეშეა — ცხრილში `anime`, `gallery_video`, `song_file`, `status`… ინგლისურად ჩანს | Medium | gap | S | ✅ |
| GAP-14 | 8 UI-ტექსტი მოძველებულია ან მცდარია: „გასაღები `.env`-ში" (§21-ის შემდეგ `/credentials`-ია), „სერვერი UTC-ზეა" (§8-ის შემდეგ Tbilisi), ბრაუზერის შეტყობინების ლოგიკა შებრუნებულია, „უკატეგორიო" §26-ის შემდეგ არ არსებობს | Medium | gap | S | ✅ |
| GAP-15 | ტერმინოლოგია არათანმიმდევრულია: ლინკი/ბმული, სინქრონი/სინქრონიზაცია, ჩამოწერა/ჩამოტვირთვა, ესკიზი/თამბნეილი, ჩანიშვნა/შენიშვნა, ფრენჩაიზი/ფრანჩაიზი, კლავიში/გასაღები | Medium | gap | M | ✅ |
| BUG-22 | ვიდეოს ხელახლა ჩამოტვირთვა არსებულ ლოკალურ ასლს **კვოტის შემოწმებამდე** შლის — 413-ზე ფაილი დაკარგულია | Medium | bug | S | ✅ |
| BUG-23 | სინქრონზე შექმნილ ახალ ჟანრს ინგლისური სახელი `name_ka`-დაც ეწერება — მთარგმნელი მას „ნათარგმნად" თვლის და აღმოჩენა ინგლისურს ქართულად აჩვენებს | Medium | bug | S | 🟡 ნაწილობრივ |
| BUG-24 | `localStorage` მოდულის ჩატვირთვისას დაუცველად იკითხება — დაბლოკილ საცავზე (Safari private, „ყველა ქუქის ბლოკირება") აპი თეთრ ეკრანზე ვარდება | Medium | bug | S | ✅ |
| PERF-15 | `MatchService::thinColumns()` ყოველ კანდიდატ-პროფილზე და დომენზე `Schema::hasColumn()`-ს იძახებს | Medium | performance | S | ✅ |
| PERF-16 | `GET /chat` თითო საუბარზე პროფილის ჰედერსა და ბლოკის სტატუსს ცალკე query-ებით კითხულობს (N+1) | Medium | performance | S | ✅ |
| PERF-17 | ჰედერის „სათარგმნი" ბეჯი მთელ მედია-ბიბლიოთეკას თარგმანებით ტვირთავს, რომ დათვალოს | Medium | performance | S | ✅ |
| DEBT-13 | `LIKE`-ის wildcard-ები 37 ადგილას/13 კონტროლერში არ იესკეიპება — `App\Support\Like` არსებობს და მხოლოდ 4 ადგილას გამოიყენება | Medium | debt | M | ✅ |
| GAP-16 | ასლის ვიუერის დროებითი ბაზა (`<db>_inspect_<id>`) ვადას არ იწურავს და ასლის წაშლაზე არ იშლება | Medium | gap | S | ✅ |
| DEBT-14 | ტესტის გარეშეა `/movies/{id}/collection`, სამივე `resync`, `GenreItemController`, `LookupController`, `DiscoverController`, `VideoBulkController`, `AdminAuditController`-ის უმეტესობა | Medium | debt | M | ✅ |
| GAP-17 | პროდაქშენში გაშვების გზა არ არსებობს: README მხოლოდ dev-ს აღწერს, Apache Vite-ის dev-სერვერზე პროქსირებს, `dist/`-ს არავინ ემსახურება | Medium | gap | M | ⬜ |
| SEC-15 | პირველი რეგისტრაციის „`User::count() === 0` → super_admin" race-ია — ორი ერთდროული რეგისტრაცია ორ სუპერ-ადმინს ქმნის | Low | security | S | ✅ |
| SEC-16 | უსაფრთხოების ჰედერებიდან მხოლოდ `nosniff` დგას — `frame-ancestors`/`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` არ არის | Low | security | S | ✅ |
| SEC-17 | `GalleryFetcher` `.svg`-ს `image/svg+xml`-ად საჯარო დისკზე წერს — `WebImageImporter` მას უარყოფს, ეს გზა კი არა | Low | security | S | ✅ |
| GAP-18 | სამი ტექსტი თქვენობითშია („ჩაწერეთ", „სცადეთ", „არ გირჩევთ") — მთელი აპი შენობითზეა | Low | gap | S | ✅ |
| GAP-19 | ბრჭყალების ორი სტილი ერევა: სწორი „…“ და შერეული „…" (21 ხაზი) | Low | gap | S | ✅ |
| GAP-20 | ქართულ წინადადებებში ლათინური სიტყვებია: default, private, abuse, credit, engine | Low | gap | S | ✅ |
| GAP-21 | უცნობი მისამართი უხმოდ `/`-ზე გადამისამართდება — 404 გვერდი არ არსებობს | Low | gap | S | ✅ |
| BUG-25 | `LinkMetadata::absolute()` `img/x.png`-ს (დახრილის გარეშე) ჰოსტის ფესვთან ითვლის და არა გვერდის საქაღალდესთან | Low | bug | S | ✅ |
| DEBT-15 | CI-ში დამოკიდებულებების აუდიტი (`composer audit`, `npm audit`) და Dependabot არ არის | Low | debt | S | ✅ |
| DEBT-16 | README „Node.js 18+"-ს ითხოვს, Vite 8/Vitest 5 კი ≥20.19-ს; `package.json`-ს `engines` არ აქვს | Low | debt | S | ✅ |
| DEBT-17 | ~180 გამოუყენებელი i18n გასაღები (`videos.kind*`, `admin.pageTitle`, `library.tabSynced`, `audit.subjects.gallery_theme`…) — `audit.py` „unused"-ს არ ამოწმებს | Low | debt | S | ✅ |
| DEBT-18 | მკვდარი backend კოდი: `Translator::translateBatch()/toGeorgianBatch()`, `inspire` ბრძანება, ერთჯერადი `movies:backfill-collections`, `composer.json`-ის `laravel/laravel` სახელი | Low | debt | S | ✅ |
| DEBT-19 | `auth.tsx`-ში მკვდარი `permissions['*']` ბრანჩი — wildcard 2026-09-15-ს ამოვიდა | Low | debt | S | ✅ |
| DEBT-20 | მოძველებული კომენტარები: `PublicProfileController` „მხოლოდ ორი GET" (ხუთია, ერთი POST), `sw.js` ელფოსტის არხს ასახელებს, CLAUDE.md ამ მანქანაზე yt-dlp/ffmpeg/python-ის არსებობას ამტკიცებს | Low | debt | S | ⬜ |
| DEBT-21 | ენების სახელები („ქართული"/„English") 4 კომპონენტში hardcoded-ია და არა i18n-ში | Low | debt | S | ✅ |
| DEBT-22 | `GenreController::store()` slug-ს შეუზღუდავი `while exists` ციკლით ქმნის — `DictionaryKey::make()` სწორედ ამისთვის დაიწერა | Low | debt | S | ✅ |
| DEBT-23 | `GeorgianShops::fetch()` მთელ პასუხს კითხულობს და მერე ჭრის — „ჭერი ტყუილია"-ს იგივე პატერნი, რაც `LinkMetadata`-ს §A3-მდე ჰქონდა | Low | debt | S | ✅ |
| DEBT-24 | უსასრულოდ მზარდი ცხრილები (`serp_searches`, `translation_usages`, `note_notifications`, `batch_items`, `job_batches`) არასდროს იწმინდება | Low | debt | S | ✅ |
| DEBT-25 | `<html lang="ka">` სტატიკურია — ინგლისურ UI-ზეც `ka` რჩება | Low | debt | S | ✅ |
| DEBT-26 | ქართული ორთოგრაფიის ავტომატური შემოწმება (hunspell `ka_GE`) CI-ში არ არის — BUG-18-ის ტიპის შეცდომას ვერავინ იჭერს | Low | debt | S | 🟡 |
| FEAT-06 | მომხმარებლის საკუთარი მონაცემების ექსპორტი (JSON/CSV თითო მოდულზე) | — | feature | M | ⬜ |
| FEAT-07 | იმპორტი გარე სერვისების CSV-დან (Letterboxd/IMDb, Goodreads, Steam) | — | feature | L | ⬜ |
| FEAT-08 | სტატისტიკის გვერდი — დეშბორდის „სტატუსებად დაშლა მოგვიანებით" (19.10) ჯერ არ შესრულებულა | — | feature | M | ⬜ |
| FEAT-09 | სერიალის სეზონების/ეპიზოდების პროგრესი (TMDB `/tv/{id}/season/{n}`) | — | feature | L | ⬜ |
| FEAT-10 | „მალე" — კალენდარი: შემდეგი ეპიზოდის ეთერი, თამაშის/წიგნის გამოსვლის თარიღი | — | feature | M | ⬜ |
| FEAT-11 | კალათა (soft delete + ვადა) ჩანაწერებზე — `purge.warning` თვითონ ამბობს „კალათა არ არსებობს" | — | feature | L | ⬜ |
| FEAT-12 | ავტომატური, დაგეგმილი ბაზის ასლი აპიდან (`backups:run --auto` + შენახვის ვადა) — გარე PowerShell-ტასკის ნაცვლად | — | feature | S | ⬜ |
| FEAT-13 | ჩანაწერის გაზიარება ჩატში ბარათად (`record` ტიპის წერილი) | — | feature | M | ⬜ |
| FEAT-14 | ხელახლა ნახვის ჟურნალი — `watched_at` ერთი მომენტია, გამეორება არ ინახება | — | feature | M | ⬜ |
| FEAT-15 | PWA manifest + „მთავარ ეკრანზე დამატება" (SW უკვე არსებობს, ქეშის გარეშე) | — | feature | S | ⬜ |
| FEAT-16 | ანგარიშის აღდგენა SMTP-ის გარეშე (ადმინის ერთჯერადი ბმული) და არჩევითი TOTP 2FA | — | feature | L | ⬜ |
| FEAT-17 | დუბლის გაფრთხილება ვიდეოს/სიმღერის დამატებაზე (`platform`+`external_id` უკვე არსებობს) | — | feature | S | ⬜ |
| FEAT-18 | პირადი ტეგები მედია-დომენებზე (ფილმს/სერიალს/ანიმეს `tags` არ აქვს) | — | feature | M | ⬜ |
| FEAT-19 | შეტყობინებების ცენტრი: მოთხოვნა დამტკიცდა, კვოტა ივსება, ასლი ჩავარდა, პარტია დასრულდა | — | feature | M | ⬜ |
| FEAT-20 | „რა ვნახო დღეს" — შემთხვევითი არჩევანი `todo` სტატუსიდან ფილტრით | — | feature | S | ⬜ |
| FEAT-21 | წლიური მიზნები (წიგნი/ფილმი წელიწადში) — FEAT-08-ზე დგას | — | feature | M | ⬜ |
| FEAT-25 | ახალი მოდული: **კურსები** (ხელით, გაკვეთილების პროგრესით) | — | feature | L | ⬜ |
| FEAT-26 | ახალი მოდული: **ადგილები** (ნანახი/სანახავი; OSM Nominatim — უფასო) | — | feature | L | ⬜ |

## Critical

### [SEC-01] პროდ-ბაზის dump git-ის ისტორიაში იყო — რჩება პაროლების შეცვლა და Telegram ტოკენის როტაცია
- **სტატუსი:** 🟡 ნაწილობრივ შესრულებულია (2026-09-17). რეპოს და ბაზის მხარე მზადაა: dump `git rm --cached`, ისტორია `filter-branch`-ით გადაიწერა (46 → 44 კომიტი, `origin/main` `f730e0d` → `42350d0`), `remember_token`-ები `NULL`, `sessions` ცარიელი, `.gitignore` ყველა `*.sql`/`*.sql.gz`-ს ბლოკავს, `setup.sh`/`setup.ps1` `migrate --seed`-ს იძახის. რჩება **მხოლოდ შენი ქმედება**.
  - ⚠️ **ძველ მანქანაზე (ან ნებისმიერ ძველ კლონში) `git push` არ გააკეთე** — ძველი ისტორია dump-ითა და გასაღებით თავიდან აიტვირთება; იქ `git fetch && git reset --hard origin/main` (ან ახალი კლონი).
  - ℹ️ ლოკალურ reflog-ში ძველი კომიტები ~90 დღე რჩება (`git reflog expire --expire=now --all && git gc --prune=now` — შეუქცევადი, სურვილისამებრ, მხოლოდ შენი ცხადი „კი"-თ).
- **ტიპი:** security
- **სად:** `.gitignore:36-37` (ლოგები) და `*.sql` წესი იმავე ფაილში; ისტორია — `git log --all -- backend/mediary_backup.sql` → 0
- **პრობლემა:** dump-ი ორი რეალური ანგარიშის bcrypt-ჰეშს, `remember_token`-ს, სესიის id-ს, პირად ჩატსა და ღია Telegram-ტოკენს შეიცავდა და 7 კომიტში GitHub-ზე იყო.
- **რატომ:** ჰეშები offline brute-force-ისთვის გამოსადეგია; ტოკენი ბოტზე სრული წვდომაა — ისტორიის გადაწერა უკვე ჩამოტვირთულ ასლს ვერ აბრუნებს.
- **გადაწყვეტა:** ორივე ანგარიშის პაროლის შეცვლა `/profile`-ზე; BotFather → `/revoke` და ახალი ტოკენის ჩაწერა `/credentials`-ზე (`telegram`).
- **Acceptance criteria:**
  - [ ] ორივე ანგარიშის პაროლი შეცვლილია
  - [ ] Telegram-ის ძველი ტოკენი BotFather-ში გაუქმებულია, ახალი `/credentials`-შია და `POST /credentials/telegram/test` „მუშაობს"-ს აბრუნებს
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-16] `/purge`: ბუკმარკზე `mode=tag` **ყველა** ბუკმარკს შლის
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). დომენების სია `TARGET_MODES`-იდან გამოითვლება — `PurgeService::supportsTag()`; ხელით ჩაწერილი `['video', 'song', 'book', 'note']` აღარ არსებობს, ე.ი. ორი სიის დაშორება შეუძლებელია. სამიზნე, რომელსაც `tag` არ აქვს, `recordIds()`-ში **422 `mode_not_supported_for_target`**-ია და არა ჩუმი „ყველა".
- **ტიპი:** bug
- **სად:** `backend/app/Services/Purge/PurgeService.php:96` (`TARGET_MODES['bookmark']` `tag`-ს უშვებს), `:640` (ტეგის ფილტრი მხოლოდ `['video', 'song', 'book', 'note']`-ზე მუშაობს), `backend/app/Http/Controllers/Api/Admin/AdminPurgeController.php:171,180`
- **პრობლემა:** `recordIds()`-ის `match`-ში `'tag' => null` ყველა ჩანაწერს აბრუნებს და ტეგით ჭრა მერე ხდება — მაგრამ მხოლოდ ჩამოთვლილ ოთხ დომენზე. ბუკმარკს `tags` სვეტი აქვს და `TARGET_MODES`-შიც `tag` წერია, ე.ი. ვალიდაცია გადის, ფილტრი კი არ მოქმედებს: `plan()` და `run()` **ანგარიშის ყველა ბუკმარკს** ითვლის და შლის. `plan` და `run` ერთ query-ს იზიარებენ, ამიტომ გეგმაც „სწორ" (მთლიან) რიცხვს აჩვენებს და მომხმარებელი მას ტეგის ჩანაწერებად კითხულობს.
- **რატომ:** მონაცემების დაკარგვა ერთ დაჭერაზე, ტიპიზებული `DELETE`-ის მიუხედავად — სამიზნე სხვისი ბიბლიოთეკაც შეიძლება იყოს.
- **გადაწყვეტა:** დომენების სია ერთ ადგილას — `TARGET_MODES`-იდან გამოთვლადი (`tag` აქვს → ტეგით ჭრა სავალდებულოა) ან `TAG_TARGETS` კონსტანტა, რომელსაც `RegistryConsistencyTest` `TARGET_MODES`-ს ადარებს; `recordIds()`-ში `mode === 'tag'` და ჩამოთვლილში არყოფნა — გამონაკლისი (422 `mode_not_supported_for_target`) და არა ჩუმი „ყველა".
- **Acceptance criteria:**
  - [x] `PurgeTest::test_bookmarks_by_tag` — გეგმაც და წაშლაც მხოლოდ ტეგიანს ეხება, უტეგო და სხვატეგიანი რჩება (ძველ კოდზე „3 is identical to 1"-ით ვარდება)
  - [x] `PurgeTest::test_the_tag_scope_really_cuts_on_every_target_that_allows_it` — სია `TARGET_MODES`-იდან იკითხება, ე.ი. მეექვსე დომენი ავტომატურად შედის შემოწმებაში
  - [x] `RegistryConsistencyTest::test_every_tag_purge_target_actually_has_a_tags_column` — დარჩენილი ერთადერთი დაშვება (სქემა) მოწმდება: `tag` სკოუპი `tags` სვეტის გარეშე უპირობო წაშლა იქნებოდა
- **Estimate:** S
- **დამოკიდებულება:** none

## High

### [SEC-06] ცოცხალი TMDB გასაღები `.env.example`-ში იყო — რჩება როტაცია
- **სტატუსი:** 🟡 ნაწილობრივ შესრულებულია (2026-09-17, SEC-01-თან ერთად). `backend/.env.example`-ში `TMDB_API_KEY=` ცარიელია, ისტორიიდან გასაღები 46-ივე კომიტიდან ამოვიდა (`git grep` 0 blob). რჩება **მხოლოდ შენი ქმედება**: themoviedb.org-ზე ძველი გასაღების გაუქმება, ახლის აღება და `backend/.env`-ში (ან `/credentials`-ზე) ჩაწერა. ⚠️ **ამდე ძველი გასაღები `backend/.env`-ში ნუ წაშლე** — აპი TMDB-ს მასზე ეყრდნობა.
- **ტიპი:** security
- **სად:** `backend/.env.example:3-7` (გასაღებების ცარიელი ბლოკის თავი; `TMDB_API_KEY=` იმავე ფაილშია)
- **პრობლემა:** გასაღები 2026-09-17-მდე `origin/main`-ზე იყო — ვინც ისტორია მანამდე ჩამოტვირთა, მას აქვს.
- **რატომ:** სხვისი მოხმარება ანგარიშის rate-limit-ს ხარჯავს და TMDB-ს ToS-ს არღვევს.
- **გადაწყვეტა:** როტაცია themoviedb.org → Settings → API; ახალი მნიშვნელობა `backend/.env`-ში; `php artisan mediary:doctor` „TMDB_API_KEY ჩაწერილია"-ს უნდა ამბობდეს.
- **Acceptance criteria:**
  - [ ] TMDB-ზე ძველი გასაღები გაუქმებულია, ახალი მხოლოდ `backend/.env`-შია (ან `/credentials`-ზე) და `POST /credentials/tmdb/test` „მუშაობს"-ს აბრუნებს
- **Estimate:** S
- **დამოკიდებულება:** SEC-01

### [SEC-14] API-გასაღებები URL-ის query-ში მიდის და cURL-ის შეცდომის ტექსტით პასუხსა და ლოგში ხვდება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). ნიღბვა ერთ კლასშია — **`App\Support\Redact`** — და არა თითო კლიენტში: `SourceLog::threw()`/`failed()`/`status()` მას იძახებენ, ე.ი. ცხრავე კლიენტის დავიწყება შეუძლებელია. `?api_key=`, `?key=`, `?token=`, `?client_secret=`… → `***`, `user:pass@` → `***@`, და **ტელეგრამის ბოტის ტოკენი გზაში** (`/bot<id>:<secret>/`) — ეს ცალკე გაჟონვა აღმოჩნდა სამუშაოდ: `TelegramNotifier` ტოკენიან URL-ს `note_notifications.error`-ში წერდა, რომელსაც მომხმარებელი ხედავს. ხუთივე კონტროლერში `'TMDB შეცდომა: '.$e->getMessage()` → `SourceLog::threw('tmdb', $e)` + **`tmdb_error`** (`CODES` + ორივე ლოკალი); YouTube Data API-ს გასაღები `X-goog-api-key` ჰედერით ეზიდება. დაცვა სიღრმეში: იგივე ნიღაბი დაედო `ItemSyncer`/`ItemTranslator`/`Translator`/`GalleryFetcher`/`VideoDownloader`/`BackupRunner`/`RunBatchItem`/`AdminPurgeController`/`TranslationController`/`UserCredential`-საც, სადაც გამონაკლისის ტექსტი `error` ველით კლიენტს ან ბაზაში მიდიოდა.
- **ტიპი:** security
- **სად:** `backend/app/Services/Tmdb/TmdbClient.php:55` (`api_key` query-ში), `backend/app/Services/Games/RawgClient.php:172`, `backend/app/Services/Serp/SerpApiClient.php:266,459`, `backend/app/Services/Video/VideoMetadata.php:92`, `backend/app/Services/Credentials/CredentialTester.php:52,63,78,92`; გაჟონვის გზები — `backend/app/Http/Controllers/Api/LookupController.php:47,80`, `backend/app/Http/Controllers/Api/DiscoverController.php:113` (`'TMDB შეცდომა: '.$e->getMessage()` პასუხის body-ში), `backend/app/Support/SourceLog.php:73` (`getMessage()` ლოგში); Guzzle — `backend/vendor/guzzlehttp/guzzle/src/Handler/CurlFactory.php:1131-1135`
- **პრობლემა:** კავშირის შეცდომაზე (timeout, DNS, TLS) Guzzle 7.15 გამონაკლისის ტექსტს **სრულ URL-ს** ამატებს (`… for https://api.themoviedb.org/3/search/movie?api_key=<გასაღები>&query=…`) — `redactUserInfo()` მხოლოდ `user:pass@`-ს ფარავს, query-ს არა. `LookupController`/`DiscoverController` ამ ტექსტს პირდაპირ 502-ის `message`-ად აბრუნებს, `SourceLog::threw()` კი `sources.log`-ში წერს. ე.ი. ერთი TMDB-ის timeout-ი საერთო (`.env`) გასაღებს ნებისმიერ შესულ მომხმარებელს აჩვენებს, RAWG/SerpApi/YouTube-ის კი ლოგში ტოვებს.
- **რატომ:** საერთო გასაღები ინსტალაციისაა (§21) — მისი გამჟღავნება ჩვეულებრივი მომხმარებლისთვის სწორედ ის რისკია, რომელსაც `reveal`-ის super_admin-ზე შეზღუდვა ხურავს; ლოგი კი dump-თან ერთად სხვა მანქანაზე მიდის.
- **გადაწყვეტა:** (1) `$e->getMessage()` კლიენტს არასდროს — `tmdb_unavailable`/`tmdb_error` კოდი (GAP-12-თან ერთად); (2) `SourceLog::threw()`-ში query-ს ნიღბვა (`api_key|key|client_secret=…` → `***`) ან URL-ის მოჭრა `?`-მდე; (3) სადაც წყარო უშვებს, ავტორიზაცია ჰედერში — TMDB v4 `Authorization: Bearer` / v3 `api_key` ჰედერით არ მიიღება, ამიტომ (2) სავალდებულოა; YouTube Data API `X-goog-api-key`-ს იღებს (Gemini-ს იგივე წესი).
- **Acceptance criteria:**
  - [x] `SecretRedactionTest::test_a_connection_failure_never_returns_the_api_key` — `POST /lookup/candidates` პასუხის body-ში გასაღები არ ჩანს (grep სხეულზე, და არა `message`-ის ტოლობა); `…_from_discover` — იგივე `/discover`-ზე
  - [x] `…::test_the_source_log_masks_the_query` — `Log::shouldReceive`-ით: `api_key=***`, მაგრამ `query=matrix` რჩება (URL `?`-ზე არ იჭრება — დიაგნოსტიკა სწორედ იქაა)
  - [x] `…::test_a_telegram_token_is_masked_in_a_path` — ბოტის ტოკენი გზაშიც ინიღბება
  - [x] `VideoMetadata` YouTube-ის გასაღებს `X-goog-api-key` ჰედერით აგზავნის
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-17] enricher-ები Gemini-ს პირდაპირ იძახებენ და `source='translated'`-ს წერენ
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). ორივე გამამდიდრებელი `details($id, 'ka')`/`tvDetails($id, 'ka')`-ს კითხულობს და `Lang::georgian()`-ში ატარებს — `Translator`-ის დამოკიდებულება ორივე კლასიდან ამოღებულია, ე.ი. Gemini აქედან აღარ იძახება (თარგმნა `/translations`-ის საქმეა, ცხადი დაჭერით). `source` ახლა `'tmdb'`-ა (ტექსტი მართლაც TMDB-ისაა), არსებულ რიგებს კი `2026_09_18_000005_normalise_translation_source_values` `translated → translation`-ს უწერს (`'tmdb'` არ — ისინი მართლა მანქანური თარგმანია). დამატებით `detail.source.ge_movie` ორივე ლოკალში — ეს იყო მეორე, დაუნახავი მნიშვნელობა, რომელსაც ბარათი ვერ ხსნიდა. ⚠️ გვერდით გამოაჩნდა არაპირდაპირი მოგებაც: ძველ კოდზე ესევე სამი ტესტი **25 წამს** აქედებდა (Gemini-ის გამეორებები და პაუზები), ახლა — 1.1-ს.
- **ტიპი:** bug
- **სად:** `backend/app/Services/Enrichment/MovieEnricher.php:117,121` (`draftFromId` — ორი `toGeorgian()` თითო lookup-ზე), `:201-207` (`enrichMovie` — ორი გამოძახება + `$descKaSrc = 'translated'`), `backend/app/Services/Enrichment/TvEnricher.php:132,139,218-224`; შედეგი — `frontend/src/pages/MoviePage.tsx:294`
- **პრობლემა:** `POST /{domain}/from-tmdb`, `resync` და ფორმის „სწრაფი შევსება" (`/lookup`) TMDB-ის `language=ka` პასუხს **არ ეკითხება** (რასაც `ItemSyncer`/`ItemTranslator` სწორად აკეთებენ) და თითო ჩანაწერზე ორ Gemini-გამოძახებას ხარჯავს — 15/წთ და 1500/დღე ბიუჯეტიდან, უფასო TMDB-ტექსტის ნაცვლად; discover-იდან 20 ჩანაწერის ერთ დაჭერით დამატება 40 გამოძახებაა. თან აღწერას `source = 'translated'`-ს წერს, დანარჩენი აპი კი მხოლოდ `tmdb|translation|manual`-ს იცნობს: `MoviePage` `t('detail.source.translated')`-ს ვერ პოულობს და **„ტექსტის წყარო უცნობია"**-ს ხატავს, `TranslationScanner::reviewable()` (`=== 'tmdb'`) მას არასდროს გადაამოწმებს. CLAUDE.md-ის „Translator არ იძახება discover/cast/sync-იდან" ამ ორ ფაილზე არ სრულდება.
- **რატომ:** კვოტის უხმო ხარჯვა და ცრუ ბეჯი; `draftFromId()`-ის შემთხვევაში ჯერ არშენახულ ჩანაწერზეც ხარჯავს.
- **გადაწყვეტა:** ორივე enricher-ში ჯერ `details($id, 'ka')` + `Lang::georgian()`, Gemini — მხოლოდ TMDB-ის ცარიელზე და მხოლოდ თუ მომხმარებელმა `autoTranslate`-ის მსგავსი პარამეტრი ჩართა (ან საერთოდ არა — თარგმანი `/translations`-ის საქმეა); `source` მნიშვნელობა `'translation'`; `draftFromId()`-დან Gemini ამოსაღებია (ფორმა TMDB-ის ka-ს აჩვენებს, ცარიელი ველი ცარიელი რჩება).
- **Acceptance criteria:**
  - [x] `EnrichmentLanguageTest::test_enrichment_takes_georgian_from_tmdb_and_never_calls_gemini` — `Http::assertNotSent()` Gemini-ზე, ka ტექსტი TMDB-ის `language=ka` პასუხიდან; იგივე `…_a_draft_…` (ფორმის „სწრაფი შევსება"). ორივე ძველ კოდზე წითელია.
  - [x] `…::test_a_latin_answer_is_not_stored_as_georgian` — TMDB ქართულის უქონობაზე ორიგინალს აბრუნებს, ე.ი. `Lang::georgian()` სავალდებულოა
  - [x] `<domain>_translations.source` არასდროს არის `'translated'` — ახალი ჩანაწერი `'tmdb'`-ია, ძველი — მიგრაციით `'translation'`
  - [x] `MoviePage` ყველა არსებულ მნიშვნელობაზე ლეიბლს პოულობს (`ge_movie` დაემატა)
- **Estimate:** M
- **დამოკიდებულება:** none

### [GAP-12] 25 API-პასუხი ქართული წინადადებაა; ვალიდაციის ტექსტი ინგლისურია
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). ორივე ნახევარი გაკეთდა და თითოს თავისი მექანიზმი აქვს. (1) **პასუხი კოდია**: 25 ქართული წინადადება 11 ახალ კოდად გადაკეთდა (`tmdb_not_configured`, `lookup_query_required`, `tmdb_not_found`, `account_disabled`, `current_password_wrong`, `genre_name_required`, `imdb_already_added`, `title_required_either`, `download_timed_out`, `download_no_file`; ვიდეოს ფონური პროცესი არსებულ `background_unavailable`-ს იყენებს — ერთი ფაქტი, ერთი კოდი), ყველა `CODES`-სა და ორივე ლოკალშია. (2) **Laravel-ის საკუთარი ვალიდაცია** — `lang/ka/validation.php` (სრული, 100%-იანი დაფარვა — ტესტი `en`-ის გასაღებებს ადარებს) + `SetAppLocale` middleware (`prepend`, რომ ვალიდაციამდე მოასწროს) + SPA-ს request-interceptor-ი, რომელიც `Accept-Language`-ს **`i18n.language`-დან** აგზავნის (ბრაუზერის საკუთარი ჰედერი ოპერაციულ სისტემას ასახავს და არა აპში არჩეულ ენას). ⚠️ სამი რამ აღმოჩნდა გზაში: `withMessages()` კოდს **ორ ადგილას** წერს, ამიტომ `fieldErrors()`-მაც უნდა თარგმნოს, თორემ toast ქართულია და ველის ქვეით `account_disabled` წერია; `videos.download_error` სვეტში ხან კოდი ზის, ხან yt-dlp-ის stderr — ამისთვისაა `translateCode()`, რომელიც უცნობს ხელს არ ახლებს; და კონსოლის ბრძანებები (`$this->error(…)`) განზრახ ქართულ ტექსტზე დარჩა — მათ ადამიანი კითხულობს ტერმინალში. (3) **სკანერს მეორე შემოწმება დაემატა**: `message`/`reason`/`fail()`/`abort*()`-ში ქართული სიმბოლო წითელია (ცოცხლად გადამოწმდა დროებითი ფაილით).
- **ტიპი:** gap
- **სად:** `backend/app/Http/Controllers/Api/LookupController.php:36,41,47,67,72,80,84`, `backend/app/Http/Controllers/Api/DiscoverController.php:48,113`, `backend/app/Http/Controllers/Api/MovieController.php:167`, `backend/app/Http/Controllers/Api/MediaSyncController.php:107`, `backend/app/Http/Controllers/Api/GalleryController.php:1263,1625`, `backend/app/Services/Tmdb/TmdbClient.php:50`, `backend/app/Http/Controllers/Api/AuthController.php:96,217`, `backend/app/Http/Controllers/Api/GenreController.php:159`, `backend/app/Http/Requests/StoreMovieRequest.php:58,65` (+ `StoreSeries:60,67`, `StoreAnime:56,63`, `UpdateMovie:61,68`, `UpdateSeries:63,70`, `UpdateAnime:53,60`), `backend/app/Services/Video/YtDlp.php:184,196`, `backend/app/Services/Video/VideoDownloader.php:98`; სკანერი — `frontend/scripts/error-codes.mjs:26`
- **პრობლემა:** GAP-01-ის წესი („backend-ის `message` მანქანური კოდია, `lib/errors.ts` თარგმნის") 25 ადგილას არ სრულდება: `'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'`, `'მიუთითე ლინკი, IMDb ID ან სახელი.'`, `'ვერ მოიძებნა TMDB-ზე.'`, `'ანგარიში გათიშულია…'`, `'მიმდინარე პაროლი არასწორია.'`, `'ჟანრის სახელი აუცილებელია.'`, `'ეს ფილმი უკვე დამატებულია…'`, yt-dlp-ის `download_error` ტექსტები. ინგლისურ UI-ში ეს ქართულად ჩანს; საპირისპიროდ Laravel-ის საკუთარი ვალიდაცია (`required`, `max`, `email`…) `lang/ka`-ს არქონის გამო ქართულ UI-ში ინგლისურად მოდის. `error-codes.mjs` მხოლოდ `snake_case` სტრიქონებს ამოწმებს, ე.ი. წინადადება მას გვერდს უვლის. თანაც ხუთი ტექსტი შინაარსობრივად მოძველდა — გასაღები §21-ის შემდეგ `/credentials`-ზეც შეიყვანება, არა მხოლოდ `.env`-ში.
- **რატომ:** ინტერფეისის ენა ნახევრად მუშაობს; ვალიდაციის შეცდომა ქართველ მომხმარებელს ინგლისურად ეწერება.
- **გადაწყვეტა:** კოდები (`tmdb_not_configured`, `lookup_query_required`, `tmdb_not_found`, `tmdb_error`, `account_disabled`, `current_password_wrong`, `genre_name_required`, `imdb_already_added`, `title_required_either`, `download_timed_out`, `download_no_file`, `background_process_failed`) + `CODES` + ორივე ლოკალი; `lang/ka/validation.php` (Laravel-ის ოფიციალური `ka` თარგმანი) და `Accept-Language`/მომხმარებლის `settings.lang`-ის მიხედვით `App::setLocale()` middleware; `error-codes.mjs`-ს მეორე შემოწმება — `'message' => '<არა-კოდი>'` და ქართული სიმბოლო `app/`-ში → წითელი.
- **Acceptance criteria:**
  - [x] `grep -rn "[ა-ჰ]" backend/app --include=*.php | grep "'message' =>\|withMessages\|Exception('"` ცარიელია
  - [x] `node scripts/error-codes.mjs` წინადადებას `message`-ში წითლად აღნიშნავს (დროებითი ფაილით გადამოწმდა: `exit=1` და ფაილის სახელი ეწერება)
  - [x] `ApiLanguageTest::test_laravel_validation_speaks_georgian` — `Accept-Language: ka`-ზე ტექსტი მხედრულია; `…_speaks_english_when_asked` და `…_an_unknown_language_falls_back` საპირისპიროს ამოწმებენ (თორემ ლოკალი უბრალოდ ჩაკეტილი იქნებოდა)
  - [x] `ApiLanguageTest`-ის დანარჩენი ხუთი — `tmdb_not_configured`, `lookup_query_required`, `account_disabled`, `current_password_wrong`, `title_required_either` (ბოლო ორი **`errors`-ის ჩანთაში** მოწმდება, სადაც ფორმა კითხულობს)
- **Estimate:** M
- **დამოკიდებულება:** none

### [BUG-18] `ka.json`-ში ორთოგრაფიული და გრამატიკული შეცდომებია
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). 30 ხაზი გასწორდა მხოლოდ `ka.json`-ში — `en.json` ხელუხლებელია და გასაღებების რაოდენობა ორივეგან უცვლელია (2702; აუდიტის ჩანაწერში „2690" წერია, რადგან GAP-12-მა 11 ახალი `errors.*` და `detail.source.ge_movie` დაამატა). ⚠️ `moveTo` ექვსივე გასწორდა და არა ხუთი: ვიდეოების ხაზი („სად გადავიდეს ეს ვიდეოები") სიაში არ იყო, მაგრამ იგივე შეცდომაა — ზმნა მხოლობითში მრავლობით ქვემდებარესთან.
- **ტიპი:** bug
- **სად:** `frontend/src/i18n/ka.json:73` („ნიშავს"), `:1440,1446,1456,1462,1478,1484,1494,1500` („ჟანრიის"), `:1510,1516` („კატეგორიაის"), `:1508` („კატეგორიას დამატება"), `:1445,1461,1483,1499,1515` („სად გადავიდეს წიგნს/თამაშს/სიმღერას/ბორდგეიმს/ჩანაწერს"), `:1324` („დამრჩეს"), `:1605` („გალერიის"), `:2237` („სასაათე"), `:2835` („მსახიობები ნაცვლად არ არის"), `:2852` („TMDB ვერ ჩანს"), `:2850`, `:2180-2188` („ფრენჩაიზი" ×6)
- **პრობლემა:** ხილული შეცდომები ფორმებსა და ლექსიკონებში: „ჟანრიის გარეშე" ოთხი ლექსიკონის select-ში, „კატეგორიაის გარეშე", „კატეგორიას დამატება" (მიცემითი ნათესაობითის ნაცვლად), „სად გადავიდეს წიგნს" (მიცემითი სახელობითი მრავლობითის ნაცვლად — „წიგნები"), „ფოტოები გალერეაში დამრჩეს" (დიალექტური „დარჩეს"-ის ნაცვლად), „გალერიის ჩამოტვირთვა" (ყველგან „გალერეა"), „მსახიობები ნაცვლად არ არის" („ჯერ არ არის"), „ქართულ სახელს TMDB ვერ ჩანს" („ვერ ცნობს"), „იგი მსახიობს და ჩანაწერს შორის და არა თვით მსახიობზე" (ზმნის გარეშე), „სასაათე სარტყელი" („სასაათო"), „ნიშავს" („ნიშნავს"), „ფრენჩაიზი" ექვსჯერ, „ფრანჩაიზი" კი — თორმეტჯერ.
- **რატომ:** შენი მოთხოვნაა, რომ ყველა ქართული ტექსტი გამართული იყოს; ეს ხაზები ყოველდღიურ ფორმებში ჩანს.
- **გადაწყვეტა:** ხაზ-ხაზ შესწორება (სია ზემოთ), `ფრენჩაიზი → ფრანჩაიზი` მთელ ფაილში; `en.json` უცვლელი; `python frontend/src/i18n/audit.py` მწვანე.
- **Acceptance criteria:**
  - [x] `grep -c "ჟანრიის\|კატეგორიაის\|ნიშავს\|სასაათე\|გალერიის\|დამრჩეს\|ფრენჩაიზ\|ნაცვლად არ არის" frontend/src/i18n/ka.json` → 0
  - [x] ექვსივე `*.moveTo` სახელობით მრავლობითშია („ფრანჩაიზი" კი — 18-ჯერვე)
  - [x] i18n audit მწვანეა და გასაღებების რაოდენობა ორივე ლოკალში ერთნაირია (2702)
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-19] `GenreRemover` ანიმეს არ ითვლის და არ გადაიტანს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). `GenreRemover` ახლა `MediaDomain::TYPES`-ზე დადის და გასაღებებსაც თვითონ აწყობს (`<relation>_count`), ე.ი. მეოთხე დომენი პასუხში თავისით გამოჩნდება. რელაციების რუკა `MediaDomain::RELATIONS`-ში გადავიდა და **ერთია მსახიობისთვისაც და ჟანრისთვისაც**: `castRelation()` `relation()`-ად გადაერქვა (სამივე გამომძახებელი განახლდა; pass-through alias განზრახ არ დარჩა — პროექტის წესი), `GenreItemController::RELATIONS` წაიშალა. პასუხის რიცხვები ორივე კონტროლერში `$result`-იდან იფილტრება (`*_count`) და არა ხელით ჩაწერილი ორი ხაზით; ფრონტზე `animes_count` დაემატა `Genre`-ის ტიპს, `GenresPage`-ის ჯამსა და `admin.genreDeleteWarning`-ს (ორივე ლოკალი). ⚠️ `GenreItemController::BUCKETS` **განზრახ დარჩა ცალკე**, თუმცა მნიშვნელობით ემთხვევა: ის API-ის პასუხის ფორმაა და არა მოდელის რელაცია.
- **ტიპი:** bug
- **სად:** `backend/app/Services/Genres/GenreRemover.php:22-23` (მხოლოდ `movies`/`series`), `:33-46` (გადატანა მხოლოდ ორ დომენზე), `backend/app/Http/Controllers/Api/GenreController.php:111-112` (პასუხში `animes_count` არ არის)
- **პრობლემა:** `anime` §7.1-ით მესამე TMDB-დომენია და `Genre::animes()` არსებობს (`GenreController::index()` მას ითვლის), მაგრამ წაშლის სერვისი მას არ იცნობს: მხოლოდ ანიმეზე გამოყენებული ჟანრი „უხმარად" ითვლება და დადასტურების გარეშე იშლება, `reassign_to`-ზე კი ანიმეს მიბმები `genreables`-ის კასკადით ქრება და სამიზნეზე არ გადადის. `ApprovalRequest`-ის payload-შიც (`globalCounts`) ანიმე არ ჩანს, ე.ი. ადმინი „0 ჩანაწერს" ხედავს.
- **რატომ:** მონაცემის ჩუმი დაკარგვა — სწორედ ის კლასი შეცდომისა, რისთვისაც `MediaDomain::TYPES` შეიქმნა („`['movie','series']` თოთხმეტ ადგილას ეწერა").
- **გადაწყვეტა:** `GenreRemover` `MediaDomain::TYPES`-ზე ციკლით (`castRelation()`-ის ანალოგი ჟანრებზე — `GenreItemController::RELATIONS`-ის რუკა `MediaDomain`-ში გადავიდეს და ორივემ ის იკითხოს); პასუხსა და `admin.genreDeleteWarning`-ს `animes_count`.
- **Acceptance criteria:**
  - [x] `GenreRemovalTest::test_a_genre_used_only_by_anime_is_in_use` — ძველ კოდზე „true is false"-ით ვარდება (ჟანრი უხმოდ იშლებოდა)
  - [x] `GenreRemovalTest::test_reassigning_moves_the_anime_links` + `…_still_moves_movies` (ციკლმა ძველი ქცევა არ დაარღვია)
  - [x] `GenreRemovalTest::test_the_endpoint_reports_the_anime_count` (409 + `animes_count`) და `…_the_approval_payload_carries_the_anime_count`
  - [x] `grep -rn "'movie', 'series'\]" backend/app` ცოცხალ კოდში ცარიელია — ერთადერთი დარჩენილი ხსენება `MediaDomain`-ის docblock-ია, სადაც სწორედ ეს ისტორიული შეცდომაა აღწერილი
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-20] „მთავარად დაყენება" სიმღერის/წიგნის/თამაშის ფოტოზე 500-ია
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). აღებულია **პირველი ვარიანტი — ღილაკი მუშაობს** და არა 422: მშობლის მთავარი სურათის სვეტები `GalleryParent::PARENTS[*]['primary']`-შია (`path` · `source` · `value`), `setPrimary()` მას კითხულობს. ⚠️ სამი რამ: (1) **წყაროს მნიშვნელობა მხოლოდ ერთ კითხვას პასუხობს — „ჩემი ატვირთვაა თუ არა"** (კვოტა + ჩანაწერთან წაშლა), ამიტომ წიგნს/თამაშს ახალი, პატიოსანი `gallery` ეწერება და არა `openlibrary`/`rawg`; მედია-დომენებზე ისტორიული `tmdb` უცვლელია. (2) **სიმღერას წყაროს სვეტი არ აქვს** — `source: null`, და სვეტები ცალ-ცალკე ეწერება: `forceFill([null => …])`-ში PHP-ის `null` გასაღები `''`-ად გარდაიქმნება და თვითონ 500-ს იძლეოდა. (3) **ბმულის მოხსნაც იმავე რუკაზე გადავიდა** — `GalleryParent::clearPrimaryIfAt()`, რომელსაც ფოტოს წაშლაც იძახებს და `AlbumVault`-იც (§7.14, ლოკის ერთადერთი შემოვლა): ხელით ჩაწერილი `poster_path` იქ ახალ მშობლებზე ჩუმად გატეხილ სურათს დატოვებდა. ღილაკი ახლა `supports_primary`-ზე იხატება (backend-ის პასუხი) და არა `category !== 'actor'`-ზე.
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/GalleryController.php:1702-1722` (`setPrimary()` — `CastMember`-ის გარდა ყველა მშობელს `poster_path`/`poster_source`-ს `forceFill`-ით წერს, `:1719-1722`), `frontend/src/components/GalleryPanel.tsx:134` (`canPrimary: image.category !== 'actor'`)
- **პრობლემა:** `GalleryParent` §8.3-დან შვიდ მშობელს იცნობს (`song`, `book`, `game` ჩათვლით), მათ კი `poster_path` სვეტი არ აქვთ (`thumbnail_path`/`cover_path`) — `save()` `Column not found` → 500. UI ღილაკს ხატავს, რადგან მხოლოდ `actor`-ს გამორიცხავს.
- **რატომ:** მომხმარებლისთვის ხილული ავარია ჩვეულებრივ მოქმედებაზე; წიგნის `cover_source`/თამაშის `cover_source` სემანტიკაც სხვაა (`upload|openlibrary|rawg`).
- **გადაწყვეტა:** ან ყველა მშობელს `primaryImageColumns()` (მოდელის მეთოდი: `[poster_path, poster_source]` / `[cover_path, cover_source]` / `[thumbnail_path, null]`) და `setPrimary()` მას იკითხავს, ან 422 `primary_not_supported` + `canPrimary` მშობლის ტიპიდან (`GalleryParent` პასუხში `supports_primary`). `photoActions()`-ის წესი: „მოქმედება, რომელიც ვერ იმუშავებს, არ იხატება".
- **Acceptance criteria:**
  - [x] `GalleryTest::test_setting_a_song_photo_as_primary_writes_the_thumbnail` — 200 და `songs.thumbnail_path`; ძველ კოდზე `no such column: poster_path` → 500
  - [x] `GalleryTest::test_setting_a_book_photo_as_primary_writes_the_cover` — `cover_path` + `cover_source = gallery` (და არასდროს `upload`)
  - [x] `GalleryTest::test_setting_an_actor_photo_as_primary_is_still_refused` — მსახიობზე კვლავ 422 `primary_not_supported_for_cast`
  - [x] `GalleryTest::test_the_payload_says_whether_primary_is_supported` — ღილაკს backend წყვეტს (`supports_primary`)
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-21] ანგარიშის წაშლა 8 მოდულის ფაილებს დისკზე ტოვებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). `AccountEraser` (`app/Services/Users/`) — ორი ფენა: (1) ყველა მოდული `PurgeService::run(mode=all)`-ით, რომელიც სწორედ იმიტომ შლის **მოდელით**, რომ ივენთები გაეშვას; (2) ბოლოს `StorageMeter::files()` ერთხელ იკითხება და დარჩენილი ყველაფერი (ავატარი, ჩატის მიმაგრება, ბაზის ასლი) `deleteOwnFiles()`-ით ქრება — `files()` ისედაც **ერთადერთი განმარტებაა** „რა ეკუთვნის ამ ანგარიშს". პლუს მშობლის გარეშე დარჩენილი გალერეის ფოტოები/ვიდეოები/ალბომები (`album_lock` scope ცხადად ითიშება).
  ⚠️ **გზაში უფრო დიდი ხარვეზი გამოჩნდა და მისი ფესვი `/admin/purge`-საც ეხებოდა:** `Song`/`Book`/`BoardGame`/`Game`/`NoteEntry`-ის `booted()` ფაილებს `$record->files()->get()`-ით შლიდა, `<module>_files` კი `BelongsToUser`-ს იყენებს — ე.ი. სია **ავტორიზებულ** მომხმარებელზე იჭრებოდა. სხვისი ბიბლიოთეკის წაშლა ადმინის სესიიდან (როგორც `/admin/purge`, ისე ანგარიშის წაშლა) **ცარიელ სიას** იღებდა: რიგები კასკადით ქრებოდა, ფაილები დისკზე რჩებოდა, კვოტა არ თავისუფლდებოდა. ხუთივეს `withoutGlobalScope('owner')` დაემატა — ზუსტად ის, რასაც `Video::booted()` თავიდანვე სწორად აკეთებდა. ცოცხლად გადამოწმდა: შესწორებამდე ოთხი ფაილი რჩებოდა დისკზე, შემდეგ — არცერთი.
  ⚠️ **მოჩვენება საუბარზე პასუხი: საუბარი არ იშლება.** მეორე მხარის წერილები მისი ისტორიაა; `ChatController::index()` ახლა მოითხოვს, რომ სულ ცოტა ერთი **სხვა** მონაწილე არსებობდეს (ადრე `otherThan()` `null`-ს აბრუნებდა და სიაში უსახელო რიგი ჩნდებოდა). საუბარი, სადაც **არავინ** რჩება, `AccountEraser`-ს მიაქვს — ის სუფთა ნაგავია.
- **ტიპი:** bug
- **სად:** `backend/app/Http/Controllers/Api/Admin/AdminUserController.php:271-299` (`destroy()` — მოდელით მხოლოდ `movies()`/`series()` იშლება, ვიდეოზე მხოლოდ `deleteThumbnail()`)
- **პრობლემა:** `$user->delete()` ანიმეს, ვიდეოს ფაილებს/ჩამოწერილ ასლს, სიმღერებს, წიგნებს, ბორდგეიმებს, თამაშებს, ჩანაწერებს, ბუკმარკებს, გალერეას, ჩატის მიმაგრებებს, ასლებს და custom-field ფაილებს SQL-კასკადით შლის — კასკადი მოდელის ივენთს არ ისვრის (`StoredFile`/`HasGallery`/`HasCustomFields`-ის მთელი წესი), ე.ი. ფაილები დისკზე ობლად რჩება. `ConversationNickname`/`conversation_user` წაშლის შემდეგ მეორე მონაწილეს ცარიელი „ghost" საუბარი რჩება. `PurgeService` სწორედ ამისთვის „მოდელით შლის".
- **რატომ:** დისკი და საერთო აუზი ჩუმად ივსება; ობოლების სკანერს (`storage/orphans`) მხოლოდ super_admin ხელით უშვებს.
- **გადაწყვეტა:** `destroy()` → `PurgeService::run(target=<თითო მოდული>, mode=all, user_id)` ციკლში ყველა სამიზნეზე (გალერეისა და ჩატის ჩათვლით), მერე `$user->delete()`; საუბრები, სადაც მეორე მონაწილე დარჩა — `messages` სისტემური „ანგარიში წაიშალა" ან საუბრის წაშლა (გადასაწყვეტია).
- **Acceptance criteria:**
  - [x] `StorageManagementTest::test_deleting_an_account_leaves_no_file_behind` — არსებულ `inventory()`-ზე დგას (ხვალინდელი მოდული ავტომატურად შემოწმდება), 15+ ფაილი, ყველა `assertMissing`
  - [x] `…::test_deleting_an_account_keeps_another_users_files` — სკოუპის შეცდომა მეზობლის ბიბლიოთეკას წაშლიდა და ეს ჩუმი იქნებოდა
  - [x] `…::test_a_deleted_account_leaves_no_ghost_conversation` — `GET /chat` 0 რიგს აბრუნებს, თვითონ საუბარი კი ბაზაში რჩება
- **Estimate:** M
- **დამოკიდებულება:** none

### [PERF-14] `/admin/users` თითო მომხმარებელზე `StorageMeter::files()`-ს იძახებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). სიიდან `storageUsage()` ამოვიდა — სულ ერთი ხაზი. გაზომილი: **4 ანგარიშზე 126 query, 24-ზე 725**; ახლა ორივეზე ერთი და იგივე. ⚠️ **რიცხვები არ დაიკარგა**: `UserResource` `usage()`-ზე ჩამოდის, რომელიც `users.storage_used_bytes`/`storage_quota_bytes`-ს კითხულობს და **query-ს საერთოდ არ აკეთებს** — სწორედ ის `used`/`quota`, რასაც სია ხატავს. სრული ინვენტარი (`files`/`bytes`/`modules`) `GET /admin/users/{id}`-ზე რჩება, სადაც ის ისედაც იკითხება და ერთ ანგარიშზეა; ფრონტის `User.storage` ტიპი შესაბამისად დავიწროვდა.
- **ტიპი:** performance
- **სად:** `backend/app/Http/Controllers/Api/Admin/AdminUserController.php:56` (`index()` ციკლში `storageUsage($user)`), `:159` (`storageUsage()` → `$this->meter->files($user)`)
- **პრობლემა:** `files()` ~30 query-ს და ზომის გარეშე რიგებზე დისკის `size()`-საც აკეთებს — თითო მომხმარებელზე. 3 მომხმარებელზე ~100 query, 30-ზე ~1000; PERF-01/PERF-04-მა იმავე endpoint-ს N+1-ისგან გაწმინდა, ეს კი დარჩა.
- **რატომ:** ადმინის სია წრფივად ნელდება ანგარიშების რაოდენობასთან ერთად.
- **გადაწყვეტა:** სიაში მხოლოდ `users.storage_used_bytes`/`storage_quota_bytes` (მრიცხველი უკვე ინახება) და `files()`-ის მხოლოდ `count` — ან ერთი `UNION`-ური `count(*)` per user; სრული ინვენტარი მხოლოდ `show()`-ზე (:135-138), სადაც ისედაც იკითხება.
- **Acceptance criteria:**
  - [x] `AdminUserListTest::test_the_user_list_does_not_query_per_user` — ძველ კოდზე „725 is identical to 126"-ით ვარდება
  - [x] `AdminUserListTest::test_the_list_still_reports_the_quota_and_the_used_bytes` და `…_the_detail_page_still_reports_the_full_inventory`
- **Estimate:** S
- **დამოკიდებულება:** none

## Medium

### [GAP-13] აუდიტ-ლოგში 8 მოდელის სუბიექტი ლეიბლის გარეშეა
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). რვავე ლეიბლი ორივე ლოკალშია (`anime`, `anime_translation`, `song_file`, `song_note`, `gallery_album`, `gallery_video`, `cast_member_tag`, `status`), მკვდარი `gallery_theme` წაიშლა. ⚠️ **მცველი `RegistryConsistencyTest`-შია და ორმხრივია**: ყოველ `AuditRegistry::MODELS`-ის ტიპს ლეიბლი უნდა ჰქონდეს **და** ყოველ ლეიბლს — ლოგირებადი ტიპი; ძველ ლოკალებზე ზუსტად ამ რვას აბრუნებს. ეს კავშირი სხვაგან არსად მოწმდება: გასაღები დინამიურია (`audit.subjects.<type>`), ე.ი. i18n-ის აუდიტი მას ვერ ხედავს.
- **ტიპი:** gap
- **სად:** `frontend/src/pages/AuditPage.tsx:318` (`t(\`audit.subjects.${type}\`, type)` — fallback ნედლი ტიპია), `frontend/src/i18n/ka.json:2619` (`audit.subjects` ბლოკი), `backend/app/Support/AuditRegistry.php:103,116,153,169`
- **პრობლემა:** `AuditRegistry::MODELS`-ის `Anime`, `AnimeTranslation`, `SongFile`, `SongNote`, `GalleryAlbum`, `GalleryVideo`, `CastMemberTag`, `Status` ლოგში `anime`, `anime_translation`, `song_file`, `song_note`, `gallery_album`, `gallery_video`, `cast_member_tag`, `status`-ად ჩანს — ინგლისურ snake_case-ად ქართულ UI-ში. სამაგიეროდ `audit.subjects.gallery_theme` (§4.5-ში წაშლილი ფუნქცია) კვლავ არსებობს.
- **რატომ:** სწორედ ის ტიპი, რომელსაც i18n audit ვერ იჭერს (გასაღები დინამიურია); ლოგი „სრულ ლოგირებას" ჰპირდება.
- **გადაწყვეტა:** 8 გასაღები ორივე ლოკალში; `RegistryConsistencyTest`-ს (ან `audit.py`-ს) შემოწმება: `AuditRegistry::MODELS`-ის ყოველი `typeFor()` ლეიბლს აქვს ორივე ლოკალში; `gallery_theme` წაიშალოს.
- **Acceptance criteria:**
  - [x] `RegistryConsistencyTest::test_every_logged_model_has_a_subject_label` — ორივე ლოკალზე, ორივე მიმართულებით; ძველ ლოკალებზე რვავე გამორჩენილს ასახელებს
  - [x] `/audit`-ზე სტატუსის ცვლილება „სტატუსი"-ს წერს და არა `status`-ს
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-14] 8 UI-ტექსტი მოძველებულია ან მცდარია
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). რვავე ტექსტი გადაიწერა ორივე ლოკალში: გასაღებზე მიმთითებელი ოთხი აღარ `.env`-ზე, არამედ „მონაცემებზე" (§21) მიუთითებს; `web.quotaHint` აღარ ამბობს „ლიმიტი მთელ ანგარიშზეა" (§21-ის შემდეგ ის **გასაღებზეა**) და აღარც წიგნების SerpApi-ძებნას, რომელიც არასდროს არსებობდა; `notes.timezoneHint`-ს სერვერის ზონის ხსენება მოეხსნა (§8-ის შემდეგ Tbilisi-ა და ფაქტს აღარაფერს მატებს); `notes.browserHint` შებრუნებულია — „მხოლოდ მაშინ, როცა აპლიკაცია ღიაა" (en სწორი იყო); `gallery.albumDeleteHint`-ში „უკატეგორიოში დაბრუნდება" → „ალბომის გარეშე რჩება".
  ⚠️ **გზაში კიდევ ორი „უკატეგორიო" გამოჩნდა და ისინი უფრო მეტს ტყუოდნენ**: `gallery.statUncategorized` და `gallery.moveToUncategorized` **მშობლის** (ჩანაწერი/მსახიობი) არქონას ნიშნავენ და არა ალბომის — backend-შიც `whereNull('imageable_type')`-ია. §26-ის ლექსიკის შემდეგ ისინი „ალბომის გარეშედ" იკითხებოდა, ე.ი. ორი სხვადასხვა ღერძი ერთ სიტყვაში ირეოდა; ტექსტი ახლა „მშობლის გარეშე"-ა.
- **ტიპი:** gap
- **სად:** `frontend/src/i18n/ka.json:135` (`videos.metaNeedsKey` — „YOUTUBE_API_KEY-ს backend/.env-ში"), `:1426` (`translate.noKey`), `:1427` (`translate.noTmdbKey`), `:1399` (`translate.quotaOff` — „GEMINI_DAILY_LIMIT=0"), `:2707` (`web.quotaHint` — „ლიმიტი მთელ ანგარიშზეა… წიგნებიც"), `:2237` (`notes.timezoneHint` — „სერვერი UTC-ზეა"), `:2240` (`notes.browserHint` — „მუშაობს მაშინაც, როცა აპლიკაცია ღიაა"), `:1841` (`gallery.albumDeleteHint` — „უკატეგორიოში დაბრუნდება")
- **პრობლემა:** §21-ის შემდეგ გასაღები და ლიმიტი `/credentials`-ზეა და პერ-მომხმარებელი — ხუთი ტექსტი ისევ `.env`-ზე მიუთითებს და „საერთო ბიუჯეტს" ამბობს (წიგნების SerpApi-ძებნა კი საერთოდ არ არსებობს); §8-ის შემდეგ სერვერი `Asia/Tbilisi`-ზეა; ბრაუზერის შეტყობინება **მხოლოდ** ღია აპში მუშაობს („მაშინაც" საწინააღმდეგოს ამბობს; en სწორია); §26-ის შემდეგ „უკატეგორიო" ბარათი არ არსებობს — ალბომის წაშლაზე ფოტო „ყველა ფოტოში" რჩება.
- **რატომ:** მომხმარებელს არასწორ ადგილზე აგზავნის და მცდარ ფაქტს ეუბნება.
- **გადაწყვეტა:** ტექსტების გადაწერა ორივე ლოკალში (`/credentials`-ზე მიმართვა, ზონის ხსენების მოხსნა ან „სერვერის ზონა Tbilisi-ა", „მხოლოდ მაშინ, როცა", „ალბომის გარეშე რჩება").
- **Acceptance criteria:**
  - [x] `grep -n "\.env\|UTC\|უკატეგორიო" frontend/src/i18n/ka.json` → სამი ხაზი და სამივეზე ფაქტი სწორია: `credentials.installationHint`, `backups.unavailableHint` და `errors.tmdb_not_configured` (რომელიც **ორივე** ადგილს ასახელებს)
  - [x] i18n audit მწვანეა, ორივე ლოკალის გასაღებების რაოდენობა უცვლელი
- **Estimate:** S
- **დამოკიდებულება:** BUG-18

### [GAP-15] ტერმინოლოგია არათანმიმდევრულია
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). `frontend/src/i18n/GLOSSARY.md` დაიწერა და `ka.json`-ის 58 ხაზი გაერთიანდა: **ბმული** (ლინკი −11; `ge_url` სამივე ადგილას „საყურებელი ბმული"-ა), **სინქრონიზაცია** (შენი არჩევანი — 18 „სინქრონი" გადავიდა; ზმნა „სინქრონიზდება…" და ზედსართავი „სინქრონიზებული" რჩება), **ჩამოტვირთვა** (17 „ჩამოწერა/ჩამოიწერა"), **ესკიზი** (შენი არჩევანი — „თამბნეილი" −6), **გასაღები** (კლავიში −2), **მეტსახელი** (ნიკნეიმი −2). „ფრენჩაიზი" BUG-18-ს უკვე წაეშალა.
  ⚠️ **„ნოუთი" სამი სხვადასხვა ობიექტია და სამივეს თავისი სიტყვა აქვს** — ეს ლექსიკონის მთავარი პუნქტია: `note` **მოდულის** ჩანაწერი „ჩანაწერია" (სახელს **ბაზა** ფლობს — `modules.name_ka`, ე.ი. i18n-იდან მისი გადარქმევა შეუძლებელია), ჩანაწერზე მიმაგრებული ნოუთი — „ჩანიშვნა" (36 ხმარება), ადმინის/ოპერაციული კომენტარი კი — „შენიშვნა" (`requests.noteLabel`, `backups.note`). ოთხი ხაზი სწორედ ამ ზღვარზე გასწორდა (`search.hint`, `search.field.note`, `games.dlcNote`, `dictionaries.deleteRecordsWarning`), ერთი კი — „შენიშვნების მოდული" → „**ჩანაწერების** მოდული".
  ⚠️ **შემოწმება მხოლოდ `ka.json`-ზეა და ეს ცნობიერი ზღვარია**: აკრძალული სიტყვები კოდის **ქართულ კომენტარებშიც** გვხვდება (`api/media.ts`, `api/gallery.ts`, `api/videos.ts`…), მაგრამ ისინი დეველოპერს ელაპარაკებიან და პროდუქტის ლექსიკას არ ქმნიან — მათი გასწორება ხმაური იქნებოდა.
  ⚠️ `audit.py`-ის **მე-7 შემოწმება** (`BANNED` + `banned_terms()`) ჩაირთო და **არავაკუუმურობა დამტკიცდა** — ხელოვნურ ლექსიკონზე ორივე დარღვევას პოულობს. აუდიტი მწვანეა, ორივე ლოკალის გასაღებების რაოდენობა უცვლელი (`only in ka: 0 · only in en: 0`); `npm test` 172/172, `npm run build` მწვანე.
- **ტიპი:** gap
- **სად:** `frontend/src/i18n/ka.json:441,458,556` („ლინკი" — სულ 10 vs „ბმული" 55; ერთი ველი სამი სახელით: `:458` „საყურებელი ლინკი", `:556` „საყურებელი ლინკი", `:1051` „ყურების ბმული"), `:492,533,640` („სინქრონი" 16 vs „სინქრონიზაცია" 5, `:380`), `:191,534,1612,1667` („ჩამოწერა/ჩამოიწერა" 17 vs „ჩამოტვირთვა" 32), `:140,2937,1732` („სურათი"/„თამბნეილი" vs `:2533` „ესკიზი"), `:407,2771` („შენიშვნა" ჩანაწერის ნოუთზე vs `:156` „ჩანიშვნები" 35), `:953,2094` („კლავიში" API-გასაღებზე vs „გასაღები" `/credentials`-ზე), `:2422` („ნიკნეიმი")
- **პრობლემა:** ერთი ცნება სხვადასხვა გვერდზე სხვა სიტყვით ჰქვია — მომხმარებელი ვერ ხვდება, ერთი და იგივეა თუ სხვა („ჩამოწერა" ლოკალურ ასლზე vs „ჩამოტვირთვა" გალერეაზე; „კლავიში" კლავიატურის ღილაკია და არა გასაღები).
- **რატომ:** ტერმინოლოგიური ერთიანობა ქართული ტექსტის „გამართულობის" ნაწილია; ცალკეული სიტყვის შეცვლა ცალკე ტასკებად არ იშლება — ერთი ლექსიკონია.
- **გადაწყვეტა:** ერთი ტერმინოლოგიური ცხრილი (`frontend/src/i18n/GLOSSARY.md` ან CLAUDE.md-ის სექცია): ბმული · სინქრონიზაცია (ან ყველგან „სინქრონი" — ერთი) · ჩამოტვირთვა · ესკიზი · ჩანიშვნა (ჩანაწერის ნოუთი) / შენიშვნა (ადმინის კომენტარი) · გასაღები · მეტსახელი; `ka.json`-ის შესაბამისი ჩანაცვლება; `audit.py`-ს ან `check:codes`-ს აკრძალული სიტყვების სია (`ლინკ`, `თამბნეილ`, `კლავიშ`) — რომ არ დაბრუნდეს.
- **Acceptance criteria:**
  - [x] გლოსარი დაწერილია და თითო ცნებას ერთი სიტყვა აქვს
  - [x] `grep -c "ლინკ\|თამბნეილ\|კლავიშ\|ფრენჩაიზ" frontend/src/i18n/ka.json` → 0
  - [x] i18n audit-ის ახალი შემოწმება აკრძალულ სიტყვას წითლად აღნიშნავს
- **Estimate:** M
- **დამოკიდებულება:** BUG-18

### [BUG-22] ვიდეოს ხელახლა ჩამოტვირთვა არსებულ ასლს კვოტის შემოწმებამდე შლის
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). `VideoDownloader::start()`-ში თანმიმდევრობა შებრუნდა — `probe()` + `guard()` **ჯერ**, `deleteDownload()` მხოლოდ შემდეგ. ✅ **ზიანი უფრო დიდი იყო, ვიდრე ტასქში ეწერა**: `deleteDownload()` სვეტებს მხოლოდ მეხსიერებაში `forceFill`-ავს, `save()` კი 413-მდე ვერ აღწევდა — ე.ი. ფაილი და კვოტა ქრებოდა, ჩანაწერი კი ბაზაში კვლავ `ready`-ს ამბობდა და ღილაკი წაშლილ ფაილს ხსნიდა.
  ⚠️ **ძველი ასლის ბაიტები კვოტიდან წინასწარ გამოიკლება** (`freedBytes()`): ის სწორედ ამ ჩამოტვირთვას დაეთმობა, ე.ი. მის გარეშე ჩანაწერი **საკუთარ** ადგილს დაიკავებდა და თითქმის სავსე კვოტაზე განახლება შეუძლებელი გახდებოდა — ერთი ხარვეზი მეორეთი შეიცვლებოდა. `freedBytes()` `download_path`-ს ეკითხება და არა `download_size`-ს: ჩავარდნილი გაშვების შემდეგ ზომა შეიძლება დარჩეს, ფაილი კი — არა.
  ⚠️ **წაშლა `start()`-ში რჩება და ვერც გადაიწევს `run()`-ში**: `storeLocalFile()`-ის `claim()` **ატომურია** (`reserve()`), ე.ი. ახალი ასლი ძველის გვერდით კვოტაში ვერ ჩაეტევა — „ჯერ ახალი, მერე ძველის წაშლა" სავსე კვოტაზე განახლებას საერთოდ გამორიცხავდა.
  ℹ️ **დარჩენილი ორი ვიწრო შემთხვევა (ტასქის მიღმა, არსებული ქცევა):** `dispatch()`-ის ჩავარდნაზე (503) ძველი ასლი უკვე წაშლილია; და ხელით გაშვებული `php artisan videos:download {id}` `ready` ვიდეოზე `run()`-ს პირდაპირ იძახებს, სადაც კრედიტი არ მოქმედებს. ორივე უცვლელია — მათი გასწორება `fail()`-ის სემანტიკის შეცვლას მოითხოვს.
- **ტიპი:** bug
- **სად:** `backend/app/Services/Video/VideoDownloader.php:71` (`deleteDownload()`), `:73-76` (მერე `probe()` + `guard()` 413-ით), `backend/app/Models/Video.php:136`
- **პრობლემა:** `start()` `ready` სტატუსზეც იშვება (409 მხოლოდ `running`-ზეა): ჯერ ძველი ფაილი იშლება, მერე სავარაუდო ზომა კვოტას ამოწმებს — ამოწურვაზე 413 ბრუნდება, ფაილი კი უკვე წაშლილია და `download_status` `null`-ია. „ხელახლა ჩამოტვირთე" → „ადგილი აღარ არის" → ლოკალური ასლი აღარ გაქვს.
- **რატომ:** მომხმარებლის ფაილის დაკარგვა შეცდომის პასუხზე.
- **გადაწყვეტა:** `probe()` + `guard()` **ჯერ** (ძველი ასლის ზომა კვოტიდან წინასწარ გამოკლებით — `fits(bytes - download_size)`), წაშლა მხოლოდ შემდეგ; ან `ready`-ზე 409 `download_already_ready` და ცალკე ცხადი „წაშალე და თავიდან".
- **Acceptance criteria:**
  - [x] ტესტი: `ready` ვიდეო + კვოტა სავსე → `POST /videos/{id}/download` 413-ია და `download_path`/ფაილი ადგილზეა (`test_a_failed_quota_check_keeps_the_existing_copy` — ძველ კოდზე წითელია: „Unable to find a file … videos/downloads/…mp4")
  - [x] ტესტი: სხვაობის კრედიტი მუშაობს — თითქმის სავსე კვოტაზე განახლება 202-ია (`test_replacing_a_copy_counts_only_the_difference`)
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-23] სინქრონზე შექმნილ ჟანრს ინგლისური სახელი `name_ka`-დაც ეწერება
- **სტატუსი:** 🟡 კოდი შესრულებულია (2026-09-18), ცოცხალ ბაზაზე მიგრაცია **შენი ქმედებაა**. სამივე ადგილას (`MovieEnricher`, `TvEnricher`, `ItemSyncer`) `setTranslation('ka', …)` აღარ იძახება — TMDB-ის ჟანრის ობიექტში მხოლოდ ინგლისური სახელია და მისი `name_ka`-ში ჩაწერა ჟანრს „ნათარგმნად" აქცევდა. ქართულს ახლა `/translations` ავსებს `TmdbClient::genreList('ka')`-დან, უფასოდ და ავტორიტეტულად.
  ⚠️ **ხილული ქცევა არ გაუარესებულა**: ცარიელი `name_ka` ეკრანზე ინგლისურად ჩანს (`lib/display.ts::genreName()`-ის fallback), ე.ი. ზუსტად ის, რასაც აქამდე ხედავდი — ოღონდ ახლა სკანერი მას სათარგმნად ითვლის.
  ⚠️ მიგრაცია `2026_09_18_000006_drop_english_genre_translations` ძველ რიგებს იღებს. **შემოწმება PHP-შია და არა SQL-ში**: მხედრულის `REGEXP` MySQL-სა და sqlite-ზე სხვადასხვანაირად პასუხობს, `Lang::georgian()` კი ამ კითხვის ერთადერთი განსაზღვრებაა. **ჯერ id-ები გროვდება, წაშლა მერეა** — `chunk()`-ის შიგნით წაშლა ოფსეტს წასწევდა და ყოველ მეორე პორციას ჩუმად გამოტოვებდა. `down()` განზრახ არაფერს აბრუნებს.
  ⚠️ **ცოცხალ ბაზაზე გასაშვებია `php artisan migrate`** (`backend/`-იდან): გასაწმენდია **7 რიგი** (`genre_translations.id` 64, 66, 68, 70, 72, 77, 79 — 38 ka-რიგიდან). ⚠️ ამავე გაშვებაზე გავა **წინა ტასქის** მიგრაციაც, `2026_09_18_000005_normalise_translation_source_values`, რომელიც ჯერ Pending-ია — ამიტომაც არ გამიშვია თვითონ.
- **ტიპი:** bug
- **სად:** `backend/app/Services/Enrichment/MovieEnricher.php:234`, `backend/app/Services/Enrichment/TvEnricher.php:251`, `backend/app/Services/Sync/ItemSyncer.php:271` (`$genre->setTranslation('ka', $g['name'])`)
- **პრობლემა:** ახალი TMDB-ჟანრი ორივე ლოკალზე ინგლისურ სახელს იღებს. `TranslationScanner::genreMissing()` `name_ka`-ს შევსებულად ხედავს და `/translations` მას **არასდროს** თარგმნის; `DiscoverController::mapGenres()` და ფილტრი ინგლისურს „ქართულად" აჩვენებენ. `TmdbClient::genreList('ka')` ქართულ სახელს უფასოდ იძლევა და `ItemTranslator::translateGenres()` მას სწორად იყენებს — მაგრამ მხოლოდ იმაზე, რაც „აკლია".
- **რატომ:** ჩუმი ხარვეზი — ჟანრი „ნათარგმნია", სინამდვილეში ინგლისურია (`Lang::georgian()`-ის წესის დარღვევა).
- **გადაწყვეტა:** სამივე ადგილას `ka`-ზე არაფერი ჩაიწეროს (ან `genreList('ka')`-ის სახელი, თუ ქეშირებულია); ერთჯერადი მიგრაცია/ბრძანება: `genre_translations` `locale='ka'` რიგები მხედრულის გარეშე → წაშლა, რომ სკანერმა დაინახოს.
- **Acceptance criteria:**
  - [x] ტესტი: `enrichMovie()` ახალ ჟანრზე `name_ka`-ს არ წერს და `TranslationScanner::genreMissing()` `name_ka`-ს აბრუნებს (`test_a_new_genre_is_left_untranslated_instead_of_taking_the_english_name`; ბულკ-სინქრონიზაციაზეც — `test_bulk_sync_also_leaves_a_new_genre_untranslated`). ორივე ძველ კოდზე წითელია: „Failed asserting that 'Action' is null"
  - [ ] ცოცხალ ბაზაზე `genre_translations`-ში ka რიგი მხედრულის გარეშე 0-ია — **გასაშვებია `php artisan migrate`** (ახლა 7 ასეთი რიგია)
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-24] `localStorage` მოდულის ჩატვირთვისას დაუცველად იკითხება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). `frontend/src/lib/storage.ts` (`safeGet`/`safeSet`) დაემატა და ოთხივე დაუცველი ადგილი მასზე გადავიდა: `i18n/index.ts`, `hooks/useTheme.ts` (კითხვაც და ჩაწერაც), `components/LanguageDropdown.tsx`; `lib/settings.tsx`-ის `loadLocal/saveLocal`-იც იმავეზეა, ე.ი. `grep localStorage src` კომენტარების გარდა აღარაფერს პოულობს.
  ⚠️ **`try`-ის შიგნით თვისებაზე მიმართვაცაა და არა მხოლოდ `getItem()`**: „ყველა ქუქის ბლოკირებაზე" ისვრის **თვითონ `window.localStorage`**, ე.ი. მხოლოდ გამოძახების შემოტანა try-ში ხარვეზს ვერ დახურავდა.
  ⚠️ **ჩავარდნა ჩუმია განზრახ**: საცავი აქ მხოლოდ მოხერხებულობაა (ენა, თემა, ქეშირებული პარამეტრები — `lib/settings.tsx` სერვერზეც ინახავს), ე.ი. გაფრთხილება იმას შესთავაზებდა, რასაც მომხმარებელი ვერაფერს უშველის.
  ⚠️ ტესტი `blockStorage()`-ით საცავს **ჩამგდებ getter-ად** ცვლის და აღდგენას **დესკრიპტორით** აკეთებს (`delete` jsdom-ში საცავს სამუდამოდ წაიღებდა). ორი შემოწმება ძველ კოდზე წითელია.
- **ტიპი:** bug
- **სად:** `frontend/src/i18n/index.ts:57` (`export const savedLanguage = localStorage.getItem('lang')…` — მოდულის დონეზე), `frontend/src/hooks/useTheme.ts:7,12`, `frontend/src/components/LanguageDropdown.tsx:11`
- **პრობლემა:** `lib/settings.tsx:140-150` და CLAUDE.md-ის წესი („ყოველი read/write try/catch-ში") სამ ადგილას არ სრულდება. Safari private-ში `setItem` `QuotaExceededError`-ს ისვრის, „ყველა ქუქის/საიტის მონაცემის ბლოკირება" რეჟიმში კი თვითონ `localStorage`-ზე მიმართვა `SecurityError`-ია — `i18n/index.ts` იმპორტისას ვარდება და აპი `ErrorBoundary`-მდეც არ აღწევს (თეთრი ეკრანი).
- **რატომ:** მთელი აპის ჩავარდნა ბრაუზერის კონფიდენციალურობის პარამეტრზე.
- **გადაწყვეტა:** `lib/storage.ts` — `safeGet/safeSet` try/catch-ით, სამივე ადგილი მასზე; `settings.tsx`-ის `loadLocal/saveLocal`-იც იმავეზე.
- **Acceptance criteria:**
  - [x] Vitest: `localStorage` getter, რომელიც `SecurityError`-ს ისვრის → `savedLanguage === 'ka'`, `useTheme()` `'light'`-ს აბრუნებს, არაფერი არ ვარდება (`lib/storage.test.ts`, 4 შემოწმება; ძველ კოდზე ორი წითელია)
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-15] `MatchService::thinColumns()` ყოველ კანდიდატზე `Schema::hasColumn()`-ს იძახებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). `thinColumns()` სვეტების სიას `table:domain`-ზე იმახსოვრებს, ე.ი. `Schema::hasColumn()` თითო წყვილზე ერთხელ გადის და არა თითო კანდიდატზე. გაზომილი: **50 საჯარო პროფილზე 450 → 9 სქემის query** (5-ზე 45 → 9).
  ⚠️ **ქეში ინსტანციაზეა და არა `static`**: `MatchService` კონტროლერში ინჟექტირდება, ე.ი. ერთი ინსტანცია = ერთი რექვესთი — ზუსტად ის საზღვარი, რომელშიც პრობლემა იყო. `static` მიგრაციის შემდეგ მოძველებულ სიას შეინახავდა (`AuditLogger::$tableExists`-ის გაკვეთილი).
  ⚠️ **ტესტი HTTP-ს არ აგზავნის და ეს ხაფანგის გამოა**: `Illuminate\Routing\Route::getController()` კონტროლერს **მარშრუტზე** ინახავს, ტესტში კი მარშრუტების კოლექცია რექვესთებს შორის ცოცხლობს — ე.ი. მეორე `getJson()` იმავე `MatchService`-ს (და მის უკვე შევსებულ მემოს) იღებდა და გაზომვა **0**-ს აჩვენებდა. `app()->make(MatchService::class)` თითო გაზომვაზე ზუსტად პროდაქშენის სიცოცხლეს იმეორებს. ⚠️ ამიტომვეა ტესტში `assertGreaterThan(0, $five)` — ორი ნული ერთმანეთს ვაკუუმში დაემთხვეოდა.
- **ტიპი:** performance
- **სად:** `backend/app/Services/Profile/MatchService.php:327`
- **პრობლემა:** `ranking()` `MAX_PROFILES` (50) კანდიდატზე × 9 დომენზე `thinColumns()`-ს იძახებს, ის კი სვეტების არსებობას `Schema::hasColumn()`-ით ამოწმებს — თითო გამოძახება `information_schema`-ს query-ა (sqlite-ზე `PRAGMA`). `/people`-ის ერთი გახსნა ასეულობით სქემის query-ა.
- **რატომ:** სქემა რექვესთის შუაში არ იცვლება — ეს სტატიკური ფაქტია.
- **გადაწყვეტა:** სვეტების სია `static $memo[$table]`-ში (ან `PublicDomain::SEARCH`/`MATCH`-ის მსგავსი კონსტანტა), `Schema::hasColumn()` მაქსიმუმ ერთხელ ცხრილზე პროცესში.
- **Acceptance criteria:**
  - [x] ტესტი: `GET /matches` 5 და 50 საჯარო პროფილზე `information_schema`/`PRAGMA` query-ების რაოდენობა ერთნაირია (`test_the_ranking_reads_the_schema_a_constant_number_of_times`; ძველ კოდზე 5 → 45, 50 → 450)
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-16] `GET /chat` თითო საუბარზე პროფილსა და ბლოკს ცალკე კითხულობს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). ბლოკების სია ერთი კითხვით მოდის (`ChatService::blockedUserIds()`) და შედარება PHP-შია. გაზომილი: **3 → 11, 30 → 38** გახდა **3 → 9, 30 → 9**, ე.ი. სია მუდმივია.
  ⚠️ **ტასქის ორი ბრალდებიდან მხოლოდ ერთი დადასტურდა და ეს გაზომვამ აჩვენა.** ზრდა ზუსტად **თითო საუბარზე ერთი** query იყო (27 დამატებულ რიგზე +27), ე.ი. მთელი N+1 `iBlocked()`-ია. `profiles->header($other)` **არცერთ query-ს არ აგზავნის**: `otherThan()` უკვე eager-loaded `participants`-იდან იღებს მოდელს, `header()` და `displayName()` კი მხოლოდ ატრიბუტებს კითხულობენ. ამიტომ `PublicProfileService::headers()` ბატჩ-ვერსია **არ დაწერილა** — ის ნულ query-ს ბატჩავდა და მკვდარი სირთულე იქნებოდა.
  ⚠️ `iBlocked()` რჩება: `show()`-ზე ერთი წყვილია და იქ ერთი `exists()` ნორმაა (ტასქიც ასე ამბობს). ახალი მეთოდი მას არ ცვლის — ის სიის საჭიროებაა.
- **ტიპი:** performance
- **სად:** `backend/app/Http/Controllers/Api/ChatController.php:84-85` (`index()` — `profiles->header($other)` და `chat->iBlocked($me, $other)` ციკლში), `:203-204` (იგივე `show()`-ზე — ერთზე ნორმაა)
- **პრობლემა:** სია 15 წამში ერთხელ პოლდება; N საუბარზე 2N დამატებითი query. 30 საუბარზე 60 query ყოველ 15 წამში.
- **რატომ:** ფონური პოლინგი — ღია ტაბი მუდმივად ხარჯავს.
- **გადაწყვეტა:** `user_blocks` ერთ `whereIn`-ით (`blocked_user_id` სეტი), `header()` — `users` ერთი `whereIn` + `module_user`; `PublicProfileService::headers(array $users)` ბატჩ-ვერსია.
- **Acceptance criteria:**
  - [x] ტესტი: `GET /chat` 3 და 30 საუბარზე query-ების რაოდენობა ერთნაირია (`test_the_conversation_list_does_not_grow_a_query_per_row`; ძველ კოდზე 3 → 11, 30 → 38)
- **Estimate:** S
- **დამოკიდებულება:** none

### [PERF-17] ჰედერის „სათარგმნი" ბეჯი მთელ ბიბლიოთეკას ტვირთავს
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). `summary()` სამივე რიცხვს **SQL-ში** ითვლის (`missingQuery()` / `reviewableQuery()` / ჟანრებზე იგივე `missingNameQuery()`), ე.ი. ჰედერის ბეჯი ბიბლიოთეკას აღარ ტვირთავს: 30 ფილმზე დაჰიდრატებული მოდელების რიცხვი **30 → 0**. ფრონტზე query `mediaModules.length > 0`-ზეა — ბმულიც და მარშრუტიც იმავე პირობაზეა, ე.ი. მედია-მოდულის გარეშე ბეჯი მკვდარ რიცხვს ხატავდა.
  ⚠️ **query-ების დათვლა აქ არაფერს ამტკიცებდა და ესაა მთავარი გაკვეთილი**: `->get()` ერთი query-ა 3 ფილმზეც და 3000-ზეც — პირველი ვერსიის ტესტი (3 → 9, 30 → 9) **ძველ კოდზეც მწვანე იყო**. ზომა `eloquent.retrieved`-ია: რამდენი მოდელი დაჰიდრატდა.
  ⚠️ **ორი განსაზღვრება ერთ კითხვაზე** გაჩნდა (`missing()` რიგზე, SQL — დათვლაზე), ამიტომ დაემატა ტესტი „ბეჯი = გეგმის სია", რომელიც სამივე დომენს ადარებს. ცნობილი და ჩაწერილი განსხვავება: PHP-ის `trim()` `\n`/`\t`-საც ჭრის, SQL-ისა — მხოლოდ ჰარეს.
  ⚠️ **ლენივი სიდინგი გაზომვას ამახინჯებს**: პირველი მოთხოვნა `Status::ensureDefaults`-სა და მოდულების ჩატვირთვას აკეთებს (9 → 5 query), ე.ი. „ცივი" და „თბილი" გაზომვის შედარება სულ სხვა რამეს ზომავს.
- **ტიპი:** performance
- **სად:** `backend/app/Services/Translation/TranslationScanner.php:96-101` (`summary()` — `$this->query($type)->get()` სამ დომენზე თარგმანებით), `frontend/src/components/Header.tsx:42-47` (ყოველ მომხმარებელზე, `staleTime` 5 წთ)
- **პრობლემა:** ბეჯის რიცხვი PHP-ში ითვლება ყველა ჩანაწერის ჩატვირთვით — 353 ფილმზე ~700 რიგი, თუმცა ბიბლიოთეკასთან ერთად წრფივად იზრდება და ყოველ ტაბზე 5 წუთში ერთხელ სრულდება. მომხმარებელს მედია-მოდულის გარეშეც ეშვება (ცარიელი, მაგრამ query მაინც).
- **რატომ:** აპის ჰედერი ყველა გვერდზეა — ეს ყველაზე ხშირად შესრულებული „მძიმე" query-ა.
- **გადაწყვეტა:** დათვლა SQL-ში (`<domain>_translations` self-join: არსებობს `en.title` და არა `ka.title`…) ან `Cache::remember` მოკლე TTL-ით + ინვალიდაცია `TranslationController::item()`-ზე და `ItemSyncer`-ზე; ფრონტზე `enabled: hasMediaModule`.
- **Acceptance criteria:**
  - [x] `GET /translations/summary` ჩანაწერებს არ ტვირთავს — 30 ფილმზე 0 დაჰიდრატებული მოდელი (`test_the_summary_does_not_load_the_library`; ძველ კოდზე 30)
  - [x] რიცხვები `plan()`-ის სიას ემთხვევა — ახალი `test_the_badge_matches_the_plan` + არსებული `TranslationTest` (42 ტესტი მწვანე)
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-13] `LIKE`-ის wildcard-ები 37 ადგილას არ იესკეიპება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). **41 ადგილი** გადავიდა `Like::contains()`/`Like::escape()`-ზე 15 ფაილში (13 კონტროლერი + `MatchService` + `VideoSearch`), `CastSync`-ის პრეფიქსის ძებნის ჩათვლით. `grep -rn "like', '%\|like\", \"%\|like \"%" backend/app/Http/Controllers` → **0**.
  ⚠️ **ორი ცალკე ასლი წაიშალა და ესაა ტასქის ნახევარი**: `MatchService`-ში `str_replace(['\', '%', '_'], …)` ხელით ეწერა, `VideoSearch`-ს კი საკუთარი `private escapeLike()` ჰქონდა — ზუსტად ის დუბლირება, რომლის გამოც `Like` შეიქმნა.
  ⚠️ **`Controller::like()` helper-ი განზრახ არ დაწერილა** (ტასქი მას ვარაუდობდა): `Like::contains()` უკვე ერთადერთი წყაროა და მეორე სახელი ერთ ცნებაზე სწორედ ის იქნებოდა, რასაც ეს ტასქი აშორებს.
  ⚠️ **ტესტი ბათ `%`-ს ეძებს და არა „50%"-ს**: ლიტერალი პრეფიქსი („50") ისედაც ჭრის შედეგს, ე.ი. ტასქში შემოთავაზებული `?q=50%` **ძველ კოდზეც მწვანე იყო** — ხარვეზი მხოლოდ მაშინ ჩანს, როცა მთელი ტერმინი შაბლონია. ⚠️ `%` URL-ში დაშიფრული უნდა იყოს, თორემ სერვერამდე საერთოდ ვერ აღწევს.
  ⚠️ **დადებითი ნახევარი მხოლოდ MySQL-ზე მოწმდება**: `Like::escape()` `\`-ით იქცევა, sqlite-ს კი ნაგულისხმევი `ESCAPE` **არ აქვს** (`jsonLike()`-ის იგივე ხაფანგი) — ე.ი. იქ ასეთი ძებნა ცარიელს აბრუნებს „ყველაფრის" ნაცვლად. ორივე დრაივერზე ჭეშმარიტი ნაწილი ისაა, რომ სხვა ჩანაწერები აღარ ბრუნდება. ეს არსებული ქცევაა (`GlobalSearch`-საც ასე აქვს) და ამ ტასქით არ შეცვლილა.
- **ტიპი:** debt
- **სად:** `backend/app/Support/Like.php:19,30` (მზა `contains()`/`escape()`), გამოუყენებელი 13 კონტროლერში — მაგ. `backend/app/Http/Controllers/Api/MovieController.php:49` (`like "%{$q}%"`), `AnimeController`, `SeriesController`, `SongController`, `BookController`, `GameController`, `BoardGameController`, `NoteEntryController`, `BookmarkController`, `RecordCastController`, `GalleryController` (`applyTitleSearch`, `castPoolQuery`), `ChatController`, `Admin/AdminAuditController` (`filtered()` `q`)
- **პრობლემა:** `GlobalSearch`-ისთვის §D6-ში დაწერილი წესი („`%`/`_` ლიტერალია") სექციების საკუთარ ძებნებზე არ გავრცელდა: `50%` ან `a_b` ძებნა მთელ ცხრილს აბრუნებს; `RecordCastController`-ის `like $prefix%` ბექსლეშზეც ტყდება.
- **რატომ:** არასწორი შედეგი ჩვეულებრივ შეყვანაზე; მეორე ასლი „ერთი წყარო"-ს წესის დარღვევაა.
- **გადაწყვეტა:** ყველა `'like', '%'.$q.'%'` → `Like::contains($q)`; `Controller::slugList()`-ის მსგავსი `Controller::like()` helper-ი; ტესტი ერთ სექციაზე `%`-იანი ძებნით.
- **Acceptance criteria:**
  - [x] `grep -rn "like', '%\|like\", \"%\|like \"%" backend/app/Http/Controllers | wc -l` → 0
  - [x] ტესტი: `GET /movies?q=%` სხვა ჩანაწერებს აღარ აბრუნებს (`test_a_percent_in_the_query_is_not_a_wildcard`; ძველ კოდზე წითელია — „does not contain 'Inception'"), MySQL-ზე დამატებით — მხოლოდ `%`-იანი სათაური
- **Estimate:** M
- **დამოკიდებულება:** none

### [GAP-16] ასლის ვიუერის დროებითი ბაზა ვადას არ იწურავს და ასლის წაშლაზე არ იშლება
- **სტატუსი:** ✅ შესრულებულია (2026-09-18). სამივე გაჟონვის გზა დაიხურა: `DatabaseBackup::deleting` → `BackupInspector::close()`; ახალი სვეტი `inspected_at` + `pruneStale()` (ვადა `STALE_HOURS` = 2), რომელსაც **`open()` თვითონაც იძახებს** და დაგეგმილი `backups:prune-inspect` საათში ერთხელაც; `mediary:doctor`-ს ახალი სექცია „ასლის ვიუერი" აქვს.
  ⚠️ **გასუფთავება `open()`-შიც არის და არა მარტო scheduler-ში**: ამ პროექტში `schedule:work` ხშირად საერთოდ არ ეშვება (თვითონ `doctor` ამას აფრთხილებს), ე.ი. მარტო დაგეგმილ ბრძანებას დაყრდნობა ნიშნავდა, რომ პრაქტიკაში არაფერი გასუფთავდებოდა.
  ⚠️ **ორი ასლის ერთდროულად გახსნა კვლავ შეიძლება** — ამიტომ **არ** არის არჩეული ტასქის მეორე ვარიანტი („`open()`-ზე ყველა სხვა `_inspect_*`-ის დახურვა"): `databaseName()`-ის docblock-ში ეს ცხადი გადაწყვეტილებაა, ხოლო ახლად გახსნილი ვიუერი „მიტოვებული" არ არის.
  ⚠️ **`inspected_at` და არა `updated_at`**: ჩანაწერი სხვა მიზეზითაც იცვლება (სახელი, შენიშვნა, სტატუსი) — იგივე გაკვეთილი, რაც `download_started_at`-ს აქვს. ცარიელი `inspected_at` მიტოვებულად ითვლება (`downloadStale()`-ის წესი).
  ⚠️ **გზაში ცოცხალი ხარვეზი გამოჩნდა და ისიც გასწორდა**: `available()` მხოლოდ `mysql` **ბინარს** ეკითხებოდა, თუმცა კლასის docblock-ში ეწერა „sqlite-ზე false-ია" — ე.ი. დეველოპერულ მანქანაზე, სადაც XAMPP-ის კლიენტი დაყენებულია, sqlite-ზეც `true` ბრუნდებოდა და ახალმა ჰუკმა `drop database` პირდაპირ sqlite-ს მიაწოდა (`near "database": syntax error`, 2 ტესტი). ახლა **ორივე** პირობაა: MySQL-კავშირი **და** ბინარი.
  ℹ️ ცოცხალ ბაზაზე `backups:prune-inspect`-ის პირველმა გაშვებამ **ერთი ნარჩენი `_inspect_` სქემა უკვე ჩამოაგდო** — ზუსტად ის, რასაც ტასქი აღწერს (დამპის ფაილს არაფერი დაშავებია; ვიუერის ხელახლა გახსნა მას თავიდან ჩატვირთავს).
- **ტიპი:** gap
- **სად:** `backend/app/Services/Backup/BackupInspector.php:63` (`<db>_inspect_<id>`), `:84` (`open()`), `:104` (`close()` — მხოლოდ ცხადი დახურვა), `backend/app/Models/DatabaseBackup.php:25` (`StoredFile` — ფაილს შლის, ბაზას არა)
- **პრობლემა:** §11.3-ის ვიუერი დამპს დროებით ბაზაში ტვირთავს; დახურვის გარეშე დატოვებული ტაბი, ბრაუზერის დახურვა ან თვითონ ასლის წაშლა ბაზას MySQL-ში სამუდამოდ ტოვებს — მონაცემის სრული მეორე ასლი დისკზე, კვოტის გარეთ (რასაც UI-ც აღიარებს), და პაროლის ჰეშებით.
- **რატომ:** დისკი და საიდუმლო მონაცემი, რომელსაც არავინ აღრიცხავს; `mediary:doctor` მას ვერ ხედავს.
- **გადაწყვეტა:** `DatabaseBackup::deleting` → `inspector->close()`; `inspected_at` სვეტი + `Schedule` (`backups:prune-inspect --older-than=2h`) ან `open()`-ზე ყველა სხვა `_inspect_*` ბაზის დახურვა; `mediary:doctor`-ში `_inspect_*` ბაზების სია.
- **Acceptance criteria:**
  - [x] ტესტი: ასლის წაშლა ვიუერს ხურავს — `test_deleting_a_backup_closes_its_viewer` + endpoint-ის ტყუპი (ორივე ძველ კოდზე წითელია); MySQL-ზე ნამდვილი სქემის ჩამოგდება — `test_an_orphaned_viewer_database_is_pruned_on_mysql` (sqlite-ზე `markTestSkipped`)
  - [x] `doctor` ღია ვიუერს WARN-ით აჩვენებს (ახალი სექცია „ასლის ვიუერი"; ცოცხალ მანქანაზე გადამოწმებული)
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-14] კრიტიკული endpoint-ები ტესტის გარეშეა
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). 27 ახალი ტესტი ორ ახალ ფაილში (`GenreItemsTest` 5, `TmdbEndpointsTest` 16) და ორ არსებულში (`VideoModuleTest` +5, `PurgeTest` +1).
  ⚠️ **ზუსტად ის მოხდა, რასაც ტასკი წინასწარმეტყველებდა: დაუტესტავი ბრანჩი ცოცხალ 500-ს მალავდა.** `GenreItemController::update()` `self::RELATIONS`-ს კითხულობდა, რომელიც **BUG-19-ს უკვე წაშლილი ჰქონდა** (სია `MediaDomain`-ში გადავიდა) — ე.ი. `attach`/`detach`/`move`/`replace` **ყოველთვის** „Undefined constant"-ით ვარდებოდა, ცვლილების ბაზაში ჩაწერის **შემდეგ**: მომხმარებელი შეცდომას ხედავდა, ჟანრი კი უკვე შეცვლილი იყო. ერთი ტესტიც რომ ყოფილიყო, BUG-19 ამას იმავე წუთში დაიჭერდა.
  ⚠️ **`AdminAuditController` სინამდვილეში დაფარული იყო** — ტასკის „0–1 ხსენება" კლასის *სახელს* ეხებოდა და არა endpoint-ს: `AuditLogTest`-ში `summary`-ს სამი ტესტი აქვს, `destroy`-ს — ორი. ე.ი. რვიდან ერთი უკვე დახურული იყო, და აუდიტის მეტრიკა (სახელის grep) აქ ტყუოდა.
  ⚠️ **TMDB ყველგან `Http::fake()`-ია** — ცოცხალი გასაღები არც ერთ ტესტს არ სჭირდება — და ცალკეა „წყარო არ არის" (503) „ვერაფერი ვიპოვე"-სგან: სწორედ ეს განსხვავებაა, რასაც ეს endpoint-ები იცავენ.
  ⚠️ **`PurgeTest`-ის მატრიცა სრულია: 11 სამიზნე × 6 რეჟიმი = 66 წყვილი** (48 დაშვებული → 200, 18 აკრძალული → 422 `mode_not_supported_for_target`). ერთი წყვილის შემოწმება BUG-16-ს ვერ დაიჭერდა, რადგან იქ ცდომილება **რეგისტრსა და ფილტრს შორის** იყო და არა თვითონ რეჟიმში; მატრიცა ორივე მხარეს ერთდროულად ამოწმებს. სკოუპი ყოველთვის შევსებულია, თორემ `scope_required` უფრო ადრე გაისროდა და ტესტი სულ სხვა უარს დაინახავდა.
- **ტიპი:** debt
- **სად:** `backend/routes/api.php:310` (`/movies/{movie}/collection` — 0 ტესტი), `:309,325,346` (სამივე `resync` — 0), `GenreItemController`, `LookupController`, `DiscoverController`, `VideoBulkController`, `MediaSyncController::item`, `AdminAuditController::summary/destroy` — სახელით 0–1 ხსენება `backend/tests`-ში
- **პრობლემა:** BUG-16 (purge-ის ტეგი) და BUG-19 (ჟანრის წაშლა ანიმეზე) სწორედ დაუტესტავ ბრანჩებში იყო; `/purge`-ს 5 ტესტი აქვს, მაგრამ ტეგის რეჟიმზე არცერთი. `resync` აპის მთავარი გზაა და მას არც ერთი ტესტი არ ეხება (`Http::fake()`-ით სავსებით ტესტირებადია).
- **რატომ:** მომდევნო რეგრესია იმავე ადგილებში ჩუმად გაივლის.
- **გადაწყვეტა:** თითო endpoint-ზე მინიმუმ „happy path" + „სხვისი ჩანაწერი 404" + `Http::fake()` წყაროზე; `PurgeTest`-ს ყოველ `TARGET_MODES` კომბინაციაზე data provider.
- **Acceptance criteria:**
  - [x] ჩამოთვლილი 8 კონტროლერიდან თითოეულს მინიმუმ ორი ტესტი აქვს (`collection` 3 · `resync` 4 · `GenreItemController` 5 · `LookupController` 4 · `DiscoverController` 2 · `VideoBulkController` 5 · `MediaSyncController::item` 3 · `AdminAuditController` 5)
  - [x] `PurgeTest` `TARGET_MODES`-ის ყველა წყვილს გადის — 66-ივე (48 × 200, 18 × 422)
- **Estimate:** M
- **დამოკიდებულება:** BUG-16, BUG-19

### [GAP-17] პროდაქშენში გაშვების გზა არ არსებობს
- **ტიპი:** gap
- **სად:** `README.md:82-89` (მხოლოდ dev — `php artisan serve` + `npm run dev`), `frontend/vite.config.ts:14-21` (`server.allowedHosts: ['mediary.local']`, HMR პორტ 80-ზე — dev-სერვერი Apache-ს უკან), `backend/app/Http/Middleware/SetSecurityHeaders.php:28` (SPA-ს HTML-ს Laravel არ ემსახურება, ე.ი. მისი ჰედერი მას არ ეხება)
- **პრობლემა:** `npm run build` CI-ში გადის, მაგრამ `dist/`-ს არავინ ემსახურება: `mediary.local`-ის ვჰოსტი Vite-ის **dev**-სერვერზე პროქსირებს, `artisan serve` ერთნაკადიანია (CLAUDE.md-ის განმეორებადი გაფრთხილება), `SESSION_SECURE_COOKIE`/HTTPS მხოლოდ `.env.example`-ის კომენტარშია. აპი მრავალმომხმარებლიანია და საჯარო პროფილს/ჩატს ჰპირდება, მაგრამ „როგორ გავუშვა სერვერზე" არსად წერია.
- **რატომ:** README/CLAUDE.md „მულტი-იუზერ" პროდუქტს აღწერს, გაშვება კი მხოლოდ ერთ დეველოპერულ მანქანაზეა შესაძლებელი.
- **გადაწყვეტა:** `docs`-ის გარეშე — README-ის სექცია „Production": Apache/nginx ვჰოსტი `frontend/dist`-ზე (`FallbackResource /index.html`), `/api`+`/sanctum`+`/storage` → PHP-FPM/Apache+PHP (არა `artisan serve`), HTTPS + `SESSION_SECURE_COOKIE=true`, `queue:work`-ის არქონა (`BackgroundProcess`), `schedule:run` cron; `npm run build`-ის შედეგის შემოწმება `ErrorBoundary`-ის „ძველი ჩანქი" სცენარზე.
- **Acceptance criteria:**
  - [ ] README-ის მიხედვით `dist/` სუფთა მანქანაზე Apache-ით იხსნება და შესვლა (Sanctum cookie) მუშაობს
  - [ ] SPA-ს HTML პასუხზეც `X-Content-Type-Options`/`frame-ancestors` ჰედერებია (SEC-16-თან ერთად)
- **Estimate:** M
- **დამოკიდებულება:** SEC-16

## Low

### [SEC-15] პირველი რეგისტრაციის super_admin-შემოწმება race-ია
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). „ეს პირველი ანგარიშია?" და ანგარიშის შექმნა ერთ `DB::transaction`-შია, წაკითხვა კი ჩაკეტილი — **`User::accountsLocked()`**, ერთადერთი განსაზღვრება. ⚠️ **ბილდერს აბრუნებს და არა `bool`-ს განზრახ**: sqlite-ის გრამატიკა `for update`-ს აგდებს, ე.ი. SQL-ზე დაწერილი ტესტი ტესტურ ბაზაზე ვერაფერს დაიჭერდა — `getQuery()->lock` ორივე დრაივერზე ერთნაირად ჩანს. ⚠️ **ტესტი კინაღამ ცარიელი გამოვიდა**: `unique:users,username` ვალიდაციაც `count(*)`-ია და `RefreshDatabase` თვითონ ატრიალებს ტრანზაქციას, ე.ი. „დონე > 0" ძველ კოდზეც მართალი იყო — ფილტრი `where`-ის არქონასაც ითხოვს და შედარება საბაზისო დონესთანაა (ძველ კოდზე: „Failed asserting that 1 is greater than 1"). ⚠️ დაემატა **`FIRST_USER_IS_ADMIN`** (ნაგულისხმევად `true`, ე.ი. ქცევა არ შეცვლილა): საჯარო სერვერზე გამორთვა ნიშნავს, რომ სუპერ-ადმინი მხოლოდ `mediary:bootstrap-admin`-ით იქმნება — გამორთულზე ჩაკეტილი წაკითხვა საერთოდ არ სრულდება (ფლაგი შედარებაში პირველია).
- **ტიპი:** security
- **სად:** `backend/app/Http/Controllers/Api/AuthController.php:49` (`$isFirst = User::count() === 0;` — შემდეგ `create()`)
- **პრობლემა:** check-then-create ტრანზაქციისა და ლოკის გარეშე: ორი ერთდროული `POST /auth/register` ცარიელ ბაზაზე ორივეს super_admin-ად ქმნის. მხოლოდ ინსტალაციის პირველ წუთებში მიღწევადია, მაგრამ `ALLOW_REGISTRATION=true` ნაგულისხმევია და `setup.sh` ბაზას ცარიელს ტოვებს.
- **რატომ:** ღია რეგისტრაციაზე პირველი ანგარიშის მოპოვება = ინსტალაციის დაპატრონება; შემთხვევითი „ორი პირველი" ერთი ხაზით იხურება.
- **გადაწყვეტა:** `DB::transaction` + `User::lockForUpdate()->count()` (ან `Cache::lock('first-user')`); სასურველია `mediary:bootstrap-admin` ერთადერთი გზა და პირველი რეგისტრაცია ჩვეულებრივი `user` — `.env`-ის `FIRST_USER_IS_ADMIN=false`-ით.
- **Acceptance criteria:**
  - [x] ტესტი: ორი პარალელური რეგისტრაციის სიმულაციაზე (ლოკის დაკავებით) მხოლოდ ერთია super_admin
- **Estimate:** S
- **დამოკიდებულება:** none

### [SEC-16] უსაფრთხოების ჰედერებიდან მხოლოდ `nosniff` დგას
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `SetSecurityHeaders`-ს სამი ჰედერი დაემატა (`Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`) და სია კონსტანტაა, ე.ი. მეოთხის დამატება ერთი ხაზია. ⚠️ **სრული CSP განზრახ არ დაიწერა**: SPA-ს HTML-ს Laravel არ ემსახურება, ე.ი. `script-src` ამ პასუხებზე არაფერს იცავს. ⚠️ **`Permissions-Policy`-ის სია მოკლეა გააზრებულად** — `autoplay`/`fullscreen`/`encrypted-media`/`picture-in-picture`/`clipboard-write`/`accelerometer` `VideoEmbed`-ისა და `PlayerStage`-ის `allow=`-შია და ფლეერს/ლაითბოქსს/გასაღების კოპირებას გატეხავდა; `SecurityHeadersTest` ამას ცალკე ამოწმებს. ⚠️ უკვე დაყენებულ ჰედერს არ ვცვლით — `SafeMime::response()`-ის გარანტია რომ არ გადაიფაროს.
- **ტიპი:** security
- **სად:** `backend/app/Http/Middleware/SetSecurityHeaders.php:28`
- **პრობლემა:** `Content-Security-Policy: frame-ancestors 'none'` / `X-Frame-Options: DENY` (clickjacking — საჯარო ალბომის unlock ფორმა და ჩატი), `Referrer-Policy: strict-origin-when-cross-origin` (ბუკმარკის/ვიდეოს გარე ბმულზე გადასვლისას მიმართვა `mediary.local/…` გზას ატანს — თუმცა ანჩორებს `noreferrer` აქვთ, API-პასუხებს არა), `Permissions-Policy` არ დგას. dev-ზე HTTP-ა, ამიტომ HSTS მხოლოდ GAP-17-თან ერთად.
- **რატომ:** იაფი, სტანდარტული დაცვა მრავალმომხმარებლიან აპზე; SEC-04-ის იგივე ფენა.
- **გადაწყვეტა:** `SetSecurityHeaders`-ში სამი ჰედერი (`has()`-ის შემოწმებით), ტესტი `RateLimitTest`/`SecurityHeadersTest`-ში.
- **Acceptance criteria:**
  - [x] `/api/health` და 404 პასუხზე სამივე ჰედერია
- **Estimate:** S
- **დამოკიდებულება:** none

### [SEC-17] `GalleryFetcher` `.svg`-ს საჯარო დისკზე `image/svg+xml`-ად წერს
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `GalleryFetcher::extension()` **allow-სიაა** (`jpg·jpeg·png·webp·gif·avif`) და არა „აკრძალულების" სია — აკრძალულების სია ახალ ფორმატს ჩუმად გაუშვებდა. `svg` `mime()`-იდან ამოვიდა (სამაგიეროდ `gif`/`avif` დაემატა, რომ allow-სიასა და MIME-ს შორის ხვრელი არ დარჩეს). ⚠️ **შემოწმება ჩამოტვირთვამდეა**: უარყოფილი კანდიდატი TMDB-ის რექვესთსაც არ ღირს და კვოტასაც არ ეხება. ⚠️ **გაფართოების გარეშე მოსული გზა ისევ `jpg`-ია** — ძველი ქცევა, და ყველაზე ვიწრო რასტრული ტიპი. `GalleryTest::test_an_svg_candidate_is_skipped_and_never_written` ძველ კოდზე წითელია („2 is identical to 1") და დისკზეც ამოწმებს, რომ `.svg` არ დარჩა.
- **ტიპი:** security
- **სად:** `backend/app/Services/Gallery/GalleryFetcher.php:760` (`'svg' => 'image/svg+xml'` — გაფართოება TMDB-ის `file_path`-იდან მოდის, უარყოფა არსად)
- **პრობლემა:** SEC-05/SEC-08-ის წესია „SVG საჯარო დისკზე არასდროს" და `WebImageImporter::extension()` მას უარყოფს; TMDB-ის კადრები დღეს `.jpg`-ა (`.svg` მხოლოდ ლოგოებს აქვს, რომელთა ჩამოტვირთვა 2026-09-14-ს ამოვიდა), მაგრამ `taggedCandidates()` `image_type = logo`-ს კვლავ იღებს და კოდი svg-ს ცხადად „იცნობს". წყარო სანდოა, ამიტომ Low — თავდაცვის მეორე ფენაა.
- **რატომ:** ერთი ჩვევა („svg-ს ვწერთ") ერთ დღეს სხვა წყაროზე გადავა.
- **გადაწყვეტა:** `download()`-ში `svg`/`xml`/`html` გაფართოება → `skipped`; `mime()`-დან `svg` ამოღება; `CustomFieldTest::test_no_upload_rule_accepts_active_content`-ის მსგავსი შემოწმება ამ სიაზეც.
- **Acceptance criteria:**
  - [x] ტესტი: `file_path: /x.svg` კანდიდატი `skipped`-ში ითვლება და დისკზე არაფერი იწერება
- **Estimate:** S
- **დამოკიდებულება:** none

### [GAP-18] სამი ტექსტი თქვენობითშია
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). ოთხივე ტექსტი შენობითზეა („ჩაწერე", „სცადე", „არ გირჩევ" ×2) და `audit.py`-ს **მე-8 შემოწმება** დაემატა, ე.ი. მომდევნო თქვენობითი ფორმა ავტომატურად დაიჭერა (ძველ `ka.json`-ზე ზუსტად ოთხივეს პოულობს). ⚠️ **`-ეთ` დაბოლოება თავისთავად ნიშანი არაა და ეს გაზომილია**: `ka.json` 10 ასეთ სიტყვას შეიცავს და მხოლოდ ორი იყო თქვენობითი — „ასეთ"/„გარეთ" ზმნები არაა, ხოლო „ვნახეთ"/„წავიკითხეთ"/„გავიარეთ"/„მივყვეთ" **პირველი პირის მრავლობითია** („ორივემ ვნახეთ"); ამიტომ allow-სია **სიტყვებისაა** და არა გასაღებების. ცხადი ფორმები (`გირჩევთ`, `გთხოვთ`, `შეგიძლიათ`…) ცალკე მოწმდება, რადგან იქ დაბოლოება ვერ შველის. ⚠️ **ერთადერთი გასაღების გამონაკლისი `matches.sharedTotal`-ია** („თქვენ ორივეს გაქვთ…") — ის **ორ ადამიანს** მიმართავს და არა ზრდილობით. ⚠️ **ამავე გაშვებაზე გამოჩნდა, რომ სკრიპტი ქართულ სიტყვას ვერ ბეჭდავდა**: Windows-ის კონსოლი cp1252-ია და `UnicodeEncodeError` სკრიპტს **წყვეტდა**, ე.ი. ნაპოვნი დარღვევა (მე-7 შემოწმებისაც) ეკრანამდე ვერ აღწევდა — `sys.stdout.reconfigure(utf-8, replace)` ამას ხსნის. წესი `GLOSSARY.md`-შია („მიმართვა — შენობითზე").
- **ტიპი:** gap
- **სად:** `frontend/src/i18n/ka.json:391` (`search.hint` „ჩაწერეთ…"), `:392` (`search.emptyHint` „სცადეთ…"), `:1239,1240` (`fields.unlockWarning*` „არ გირჩევთ.")
- **პრობლემა:** 2690 გასაღებიდან სამი თქვენობითშია, დანარჩენი აპი — შენობითზე („აირჩიე", „დააჭირე", „ჩასვი"). `matches.sharedTotal` („თქვენ ორივეს") ლეგიტიმურია — ორ ადამიანს მიმართავს.
- **რატომ:** რეგისტრის ერთიანობა ქართული ტექსტის გამართულობის ნაწილია.
- **გადაწყვეტა:** „ჩაწერე", „სცადე", „არ გირჩევ"; `audit.py`-ს შემოწმება თქვენობითი ზმნის დაბოლოებებზე (`-ეთ` სიის მიხედვით, გამონაკლისების სიით).
- **Acceptance criteria:**
  - [x] სამივე ხაზი შენობითშია; i18n audit მწვანეა
- **Estimate:** S
- **დამოკიდებულება:** BUG-18

### [GAP-19] ბრჭყალების ორი სტილი ერევა
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). 20 ტექსტში დახურვა ტიპოგრაფიულ `“`-ზე გადავიდა (ასლი 21 ხაზს ითვლიდა — რიცხვი ხაზებისა იყო და არა გასაღებების) და `audit.py`-ს **მე-9 შემოწმება** დაემატა. ⚠️ **ჩანაცვლება JSON-ის მნიშვნელობებში მოხდა და არა ფაილის ტექსტში**: ფაილში ყოველი მნიშვნელობა ისედაც ბრჭყალებშია, ე.ი. „რომელი `"` არის ტექსტის ნაწილი" მხოლოდ დაპარსვის შემდეგ ჩანს — ტექსტზე გაშვებული `sed` თვითონ JSON-ს გატეხდა. ⚠️ **შემოწმება ნებისმიერ ASCII ბრჭყალზეა და არა მხოლოდ შერეულ წყვილზე**: გასწორების შემდეგ `ka.json`-ში ასეთი სიმბოლო **საერთოდ** აღარ დარჩა (გაზომილი — 0), ე.ი. მისი გამოჩენა ყოველთვის ან ახალი შერეული წყვილია, ან კოპირებული ტექსტი. ⚠️ **მხოლოდ `ka.json`** — ინგლისურში ASCII `"` სწორი ბრჭყალია და იმავე წესის `en.json`-ზე გავრცელება ყოველ ინგლისურ ციტატაზე იყვირებდა. `grep -c '„[^"“]*"' frontend/src/i18n/ka.json` → 0; ძველ ფაილზე აუდიტი 20-ს პოულობს.
- **ტიპი:** gap
- **სად:** `frontend/src/i18n/ka.json:389,517,718,719,942,967,1239,1240,1321,1322,1323,1665,1669,1804,1806,1841,2752,2753,3019,3021,3037` (დაბალი გახსნა „ + სწორი დახურვა `"`), სწორი „…“ — 50+ სხვა ხაზზე
- **პრობლემა:** ქართული ტიპოგრაფიული ბრჭყალი „…“ (U+201E/U+201C) ფაილის უმეტესობაშია, 21 ხაზზე კი დახურვა ASCII `"`-ია (JSON-ში `\"`); `storage.allocationsWhere` ერთსა და იმავე წინადადებაში ორივეს იყენებს.
- **რატომ:** ხილული არათანმიმდევრულობა ყოველ დიალოგში.
- **გადაწყვეტა:** 21 ხაზზე `\"` → `“`; `audit.py`-ს შემოწმება: `ka.json`-ის მნიშვნელობაში `„` არსებობს და `\"` არსებობს → წითელი.
- **Acceptance criteria:**
  - [x] `grep -c '„[^"“]*"' frontend/src/i18n/ka.json` → 0
- **Estimate:** S
- **დამოკიდებულება:** BUG-18

### [GAP-20] ქართულ წინადადებებში ლათინური სიტყვებია
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). ხუთივე ტექსტი ქართულადაა („ნაგულისხმევად", „პირად დისკზე", „ბოროტად გამოყენების შემთხვევაში", „ერთი კრედიტია", „ვებძებნის საძიებო სისტემა") და `audit.py`-ს **მე-10 შემოწმება** დაემატა. ⚠️ **მეექვსე თვითონ ამ შემოწმებამ იპოვა**: `storage.orphansWhy`-ის „ბაზა backup-იდან აღდგა" — `backups.*` მთელ სექციაში „ასლი"-ა (GLOSSARY.md), ე.ი. იმავე ცნებას მეორე სახელი ერქვა; გასწორდა. ⚠️ **განმასხვავებელი რეგისტრია და არა ლექსიკონი** — ეს შემოწმების მთელი დიზაინია: ბრენდი/აბრევიატურა ყოველთვის დიდი ასოთია (`TMDB-ის` ქართული ბრუნვითაც სწორია), დეფექტი კი ყოველთვის **პატარა ასოებით** დაწერილი ჩვეულებრივი სიტყვაა. გაზომილი: 236 ლათინური ტოკენიდან ფილტრს **38** გადის, `LATIN_OK` (ბრძანებები · პროტოკოლები · პროვაიდერის მენიუს სიტყვები · TMDB-ის ზომის გასაღებები) 32-ს ფარავს — ე.ი. allow-სია 200-ჩანაწერიანი „დავამატოთ და მოვისვენოთ" სია არ გამხდარა. ⚠️ `{{…}}` და `` `…` `` ჯერ იჭრება (ინტერპოლაციის სახელი და კოდის ნაჭერი ინტერფეისის ტექსტი არაა), წერტილიანი/დახრილიანი ტოკენი კი **სტრუქტურულად** გამოიტოვება და არა სიით — ის ყოველთვის მისამართი, ფაილი ან ველის გზაა. ⚠️ `credentials.help.serpapi`-ის „Your Private API Key" შეუხებელია — ეს serpapi.com-ის ღილაკის ტექსტია. ძველ ფაილზე აუდიტი ზუსტად ექვსივეს პოულობს.
- **ტიპი:** gap
- **სად:** `frontend/src/i18n/ka.json:268` („default-ად ჩართული"), `:158` („private დისკზე"), `:834` („abuse-ის შემთხვევაში"), `:2736` („ერთი credit-ია" — იქვე `credentials.desc.serper`-ში „კრედიტია"), `:1731` („ვებძებნის engine")
- **პრობლემა:** ხუთ ტექსტში ინგლისური სიტყვა ქართული ბრუნვით — ტექნიკური ტერმინის გარეშე შესაძლებელი: „ნაგულისხმევად", „პირად დისკზე", „ბოროტად გამოყენების შემთხვევაში", „ერთი კრედიტია", „ვებძებნის საძიებო სისტემა". `slug`, `php.ini`, `?view=` ტექნიკურია და რჩება.
- **რატომ:** შენი მოთხოვნა გამართულ ქართულზე; „credit" და „კრედიტი" ერთ გვერდზე ერთდროულად.
- **გადაწყვეტა:** ხუთი ხაზის შესწორება; `audit.py`-ს ლათინური სიტყვის შემოწმება ბრენდების/აბრევიატურების allow-სიით (სკრიპტი `scratchpad/ka_checks`-იდან გადმოსატანია).
- **Acceptance criteria:**
  - [x] ხუთივე ხაზი ქართულადაა; allow-სიის გარეთ ლათინური სიტყვა ka.json-ში 0
- **Estimate:** S
- **დამოკიდებულება:** GAP-15

### [GAP-21] უცნობი მისამართი უხმოდ `/`-ზე გადამისამართდება
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `pages/NotFoundPage.tsx` (`EmptyState` + „მთავარზე") და `path="*"` მასზე; ძველი, უხმო `Navigate to="/"` აღარ არსებობს. ⚠️ **`lazy()` განზრახ არაა** (განსხვავებით 37-ვე დანარჩენი გვერდისა): ეს სწორედ ის ეკრანია, რომელიც **გატეხილ მდგომარეობაში** უნდა დაიხატოს — ახალი ჩანქის ჩამოტვირთვა მას არ უნდა სჭირდებოდეს; ფასი ნულთან ახლოსაა, რადგან `EmptyState`/`Button` `ErrorBoundary`-ს გამო საწყის ჩანქში ისედაც ზის (build: 421 kB / 122 kB gzip — უცვლელი). ⚠️ **ორი ექსპორტია**: `NotFoundPage` მარშრუტისაა, `NotFound` კი ჩანაწერის გვერდისა — ერთი ტექსტი ორივეზე ტყუილი იქნებოდა. ⚠️ **ჩანაწერის 404 ცოცხალი ხარვეზი იყო**: `MoviePage`-ის `if (isLoading || !m)` ერთ პირობაში ორ მდგომარეობას აერთებდა, ე.ი. წაშლილი (ან სხვისი) ჩანაწერის URL **სამუდამოდ „იტვირთება"-ს** აჩვენებდა; ახლა ორი ტოტია და ღილაკი სექციაში აბრუნებს და არა დეშბორდზე. ⚠️ **გამორთული მოდულის მისამართიც აქ ჩავარდება** და ესეც სწორია — backend-იც უცხო ჩანაწერზე 404-ს აბრუნებს და არა 403-ს („ეს არსებობს" თვითონაც ინფორმაციაა).
- **ტიპი:** gap
- **სად:** `frontend/src/App.tsx:308` (`<Route path="*" element={<Navigate to="/" replace />} />`)
- **პრობლემა:** არასწორი ან მოძველებული ბმული (გაზიარებული `/gallery/uncategorized`-ის მსგავსი, წაშლილი ჩანაწერის URL) დეშბორდზე გადადის ახსნის გარეშე — მომხმარებელი ვერ ხვდება, რომ მისამართი არასწორი იყო. `ErrorBoundary`-ის „ჩანქი ვერ ჩაიტვირთა" გვერდი არსებობს, „ასეთი გვერდი არ არის" — არა.
- **რატომ:** edge case, რომელიც არსად მუშავდება (spec-ის GAP).
- **გადაწყვეტა:** `pages/NotFoundPage.tsx` (`EmptyState` + „მთავარზე" ღილაკი), `path="*"` მასზე; ჩანაწერის 404-ზე (`MoviePage` `isError` 404) იგივე კომპონენტი.
- **Acceptance criteria:**
  - [x] `/does-not-exist` 404 გვერდს აჩვენებს და ბმულით `/`-ზე გადადის
- **Estimate:** S
- **დამოკიდებულება:** none

### [BUG-25] `LinkMetadata::absolute()` დახრილის გარეშე ფარდობით გზას ჰოსტის ფესვთან ითვლის
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `absolute()` ბაზის გზის **საქაღალდეს** იყენებს (`directory()`) და `.`/`..` სეგმენტებს `removeDotSegments()`-ით ხსნის (RFC 3986 §5.2.4) — `img/x.png` გვერდზე `…/blog/post/` ახლა `…/blog/post/img/x.png`-ია. ⚠️ **იგივე ბაგი favicon-საც ჰქონდა** (ერთსა და იმავე მეთოდზე გადის), ე.ი. ორივე ერთად გასწორდა. ⚠️ **პორტიც იკარგებოდა** — `parse_url` მას ცალკე ველად აბრუნებს და ძველი კოდი მხოლოდ `host`-ს კითხულობდა, ე.ი. `http://host:8080/…` ჩუმად 80-ზე გადადიოდა; `authority()` ერთადერთი ადგილია, სადაც ეს იწერება (`defaultFavicon()`-იც მასზე გადავიდა). ⚠️ **ფესვზე ზემოთ ასვლა შეუძლებელია**: `..` პირველ (ცარიელ) სეგმენტს არ ხსნის, ე.ი. `../../x.png` ფესვიდან `/x.png`-ია და არა ჰოსტს გარეთ გასვლა. `LinkMetadataTest` — 12 ტესტი, ძველ კოდზე **8 წითელია**.
- **ტიპი:** bug
- **სად:** `backend/app/Services/Bookmarks/LinkMetadata.php:184` (`return $root.'/'.ltrim($path, '/')`)
- **პრობლემა:** `og:image="img/x.png"` გვერდზე `https://site.ge/blog/post/` → `https://site.ge/img/x.png`-ს ქმნის, სწორი კი `https://site.ge/blog/post/img/x.png`-ა (RFC 3986 §5.2). favicon-ზეც იგივე. შედეგი — ბუკმარკის სურათი გატეხილია.
- **რატომ:** არასწორი ქცევა edge case-ში; ხილული, თუმცა იშვიათი.
- **გადაწყვეტა:** ბაზის `path`-ის საქაღალდე (`dirname(parse_url($base, PHP_URL_PATH))`) დახრილის გარეშე გზაზე; ტესტი ორივე ფორმაზე (`/x.png`, `x.png`, `../x.png`).
- **Acceptance criteria:**
  - [x] `LinkMetadataTest`: სამი ფარდობითი ფორმა სწორ აბსოლუტურ URL-ს იძლევა
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-15] CI-ში დამოკიდებულებების აუდიტი და Dependabot არ არის
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). CI-ს ორივე ნაბიჯი დაემატა (`composer audit --no-dev` backend-ზე, `npm audit --omit=dev --audit-level=high` frontend-ზე) და დაიწერა `.github/dependabot.yml` (composer · npm · github-actions, კვირაში ერთხელ). ორივე აუდიტი ცოცხლად გაშვებულია სუფთაა („No security vulnerability advisories found", „found 0 vulnerabilities"). ⚠️ **აუდიტი და Dependabot ერთი და იგივე არ არის და ორივე საჭიროა**: პირველი ამბობს „აქ ცნობილი მოწყვლადობაა", მეორე PR-ს ხსნის — ე.ი. ერთი პოულობს, მეორე წყვეტს. ⚠️ **`--no-dev` და `--audit-level=high` გააზრებული ზღვრებია და არა სისუსტე**: dev-პაკეტი (PHPUnit, Pint) პროდაქშენში არ ჯდება, ხოლო `npm audit` ტრანზიტულ dev-დამოკიდებულებებზე მუდმივად აბრუნებს `low`/`moderate`-ს, რომელსაც ხშირად upstream ჯერ არ გაუსწორებია — ყოველ push-ზე წითელი CI, რომელსაც ვერაფერს უშველი, თვითონვე კლავს შემოწმებას. ⚠️ **`directory` ორივეზე ქვესაქაღალდეა** (`/backend`, `/frontend`): რეპოს ფესვში არც `composer.json` დგას და არც `package.json`, ე.ი. ნაგულისხმევი `/` ვერაფერს იპოვიდა. ⚠️ `github-actions` მესამე ეკოსისტემად განზრახ დაემატა — `actions/checkout@v4`-ის მიტოვებული ვერსია ჩუმად მოძველებულ Node-ზე გადის.
- **ტიპი:** debt
- **სად:** `.github/workflows/ci.yml:52` (`composer install` — `composer audit` არა), `:84` (`npm ci` — `npm audit` არა); `.github/dependabot.yml` არ არსებობს
- **პრობლემა:** დღეს ორივე აუდიტი სუფთაა (გადამოწმდა 2026-09-18), მაგრამ ცნობილი მოწყვლადობა მომავალში მხოლოდ ხელით შემოწმებით გამოჩნდება; SEC-14-ის Guzzle-ის ქცევაც სწორედ ვერსიაზეა დამოკიდებული.
- **რატომ:** spec-ის SEC „დამოკიდებულების ცნობილი მოწყვლადობა" — შემოწმების არქონა თვითონ დეფექტია.
- **გადაწყვეტა:** `composer audit --no-dev`-ის და `npm audit --omit=dev --audit-level=high`-ის ნაბიჯები CI-ში; `.github/dependabot.yml` (composer + npm + github-actions, კვირაში ერთხელ).
- **Acceptance criteria:**
  - [x] CI ორივე აუდიტს გადის და მოწყვლადობაზე წითლდება
  - [x] Dependabot PR-ებს ხსნის
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-16] README „Node.js 18+"-ს ითხოვს, Vite 8/Vitest 5 კი ≥20.19-ს
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `frontend/package.json`-ს დაემატა `engines` და დაიწერა `.nvmrc` (`24`); README ამავე რიცხვს ამბობს. ⚠️ **ტასკის „≥20.19" არასწორი აღმოჩნდა და გაზომვამ გამოასწორა**: `vite@8.2.1`-ის `engines` მართლაც `^20.19.0 || >=22.12.0`-ია, მაგრამ **`vitest@5.0.0`-ისა `^22.12.0 || ^24.0.0 || >=26.0.0`** — ე.ი. ნამდვილი ზღვარი **22.12**-ია და არა 20.19, ხოლო **Node 25 საერთოდ გამორიცხულია** (vitest-ს ის არ უშვებს, vite კი უშვებს). `engines`-ში ზუსტად vitest-ის (უფრო მკაცრი) დიაპაზონი ჩაიწერა — გადაკვეთა სწორედ ისაა. ⚠️ CI უკვე `node-version: '24'`-ზეა, ე.ი. სამივე წყარო (README · `engines` · CI) ერთსა და იმავეს ამბობს. ⚠️ `setup.sh`/`setup.ps1` ვერსიას არ ამოწმებენ — მხოლოდ `node`-ის არსებობას; `npm ci` `EBADENGINE`-ს თვითონ გააფრთხილებს.
- **ტიპი:** debt
- **სად:** `README.md:24` (`| **Node.js** | 18+ |`), `frontend/package.json:54-55` (`vite ^8.2.0`, `vitest ^5.0.0` — Vite 8-ის მინიმუმი Node 20.19/22.12), `engines` ველი არ არსებობს; CI `node-version: '24'`
- **პრობლემა:** README-ს მიმდევარი Node 18-ზე `npm run dev`-ზე `crypto.hash is not a function`-ის მსგავს შეცდომას მიიღებს; `engines`-ის გარეშე `npm` არ აფრთხილებს.
- **რატომ:** დოკუმენტაცია კოდს არ ემთხვევა (spec-ის პროცესის მე-3 ნაბიჯი).
- **გადაწყვეტა:** README `20.19+ (რეკომენდებულია 22 LTS)`; `package.json` `"engines": {"node": ">=20.19"}` + `.nvmrc`.
- **Acceptance criteria:**
  - [x] README და `engines` ერთ რიცხვს ამბობენ; `npm ci` Node 18-ზე `EBADENGINE`-ს აფრთხილებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-17] ~180 გამოუყენებელი i18n გასაღები — `audit.py` „unused"-ს არ ამოწმებს
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). ორივე ლოკალიდან **204 გასაღები** წაიშალა (2720 → 2516) და `audit.py`-ს **მე-11 შემოწმება** დაემატა, ე.ი. სია აღარ დაგროვდება. ⚠️ **„გამოყენებულის" განსაზღვრება განზრახ ფართოა, რადგან წაშლა საშიში მოქმედებაა.** `TPL_RE` მხოლოდ `t(`ns.${…}`)`-ს ხედავს, `MovieFormPage`-ის `tm()` კი `t(type === 'movie' ? `form.${key}` : …)`-ია — შაბლონი `t(`-ის პირველი არგუმენტი **არ არის**; ვიწრო შემოწმებაზე დაყრდნობით `form.*`-ის ათობით **ცოცხალი** გასაღები წაიშლებოდა. ამიტომ იკითხება ნებისმიერი `` `ns.${ `` და `'ns.' + x`, პლუს `mediaKey()`-ის `Series`/`Anime` სუფიქსები. პირველი (ვიწრო) გაშვება 233-ს აჩვენებდა, ფართო — 205-ს, ე.ი. **28 ცრუ დადებითი სწორედ ამ ხარვეზმა გამოიწვია**. ⚠️ **ერთი კანდიდატი არ წაიშალა, არამედ ჩაერთო**: `web.pagesCostWarn` („თითო გვერდი ერთი კრედიტია") InfoHint-ის გაყოფისას გაჩნდა და არსად ჩაერთო — ფულის გაფრთხილების წაშლა არასწორი პასუხია, ამიტომ ის `WebImageDialog`-ის „გვერდები" ველზე წითელ სამკუთხედად დადგა (მხოლოდ მაშინ, როცა ფასიანი წყაროა არჩეული). ⚠️ **რა იყო მკვდარი**: შვიდივე ლექსიკონის წაშლის დიალოგის ტექსტები (ისინი `dictionaries.*`-ზე გადავიდა), ველის ძველი ლეიბლები (`books.author`, `songs.artist` — ველების ბილდერის შემდეგ ისინი `fields.name.<module>.<key>`-დან მოდის), 18+ თანხმობის ეკრანი (`is_adult` სვეტი კოდში საერთოდ არაა), ერთგვერდიანი ადმინი (`admin.pageTitle`) და `videos.kind*`. შემოწმება: `tsc`, 177 ტესტი, build და i18n-ის აუდიტი — მწვანე.
- **ტიპი:** debt
- **სად:** `frontend/src/i18n/ka.json:143` (`videos.kindMedia` — `kind` enum §5.1-ში გაქრა), `:235` (`admin.pageTitle` — ერთგვერდიანი ადმინი Tasks 1-ში დაიშალა), `:380` (`library.tabSynced`), `:2652` (`audit.subjects.gallery_theme`); სრული სია — გამოუყენებელობის სკანით 182 კანდიდატი; `frontend/src/i18n/audit.py:175` (`main()` — მხოლოდ „აკლია"/„დრიფტი"/„ინტერპოლაცია")
- **პრობლემა:** გაქრობილი ფუნქციების ტექსტი ორივე ლოკალში ცოცხლობს (`videos.kind*`, `videos.isAdult`/`consent*` — `is_adult` სვეტი კოდში საერთოდ არაა, `settings.sync/syncCli`, `api.connected`, `detail.source.synced`, `confirm.deleteTitle`…). ნაწილი false positive-ია (`mediaKey()`-ის `…Series`/`…Anime` სუფიქსები, 17 გამოძახება), ამიტომ ხელით გადასინჯვაა საჭირო.
- **რატომ:** მკვდარი ტექსტი ითარგმნება, ინახება და GAP-15-ის მსგავს გასწორებას აორმაგებს.
- **გადაწყვეტა:** `audit.py`-ს მეხუთე შემოწმება — გასაღები არც სტატიკურად, არც დინამიური პრეფიქსით (`\`ns.${`), არც `mediaKey()`-ის სუფიქსით არ იხმარება → სია (ჯერ WARN, გასუფთავების შემდეგ FAIL); ორივე ლოკალიდან წაშლა.
- **Acceptance criteria:**
  - [x] `audit.py` „unused" სექციას ბეჭდავს და გასუფთავების შემდეგ 0-ს აჩვენებს
  - [x] ორივე ლოკალში გასაღებების რაოდენობა ერთნაირია და აპი ყველა გვერდზე ტექსტს პოულობს (`npm test` + i18n audit მწვანე)
- **Estimate:** S
- **დამოკიდებულება:** GAP-13, GAP-14

### [DEBT-18] მკვდარი backend კოდი
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). წაიშალა `Translator::translateBatch()`/`toGeorgianBatch()`, `inspire` (Laravel-ის სკელეტი) და `BackfillCollections` (`movies:backfill-collections`); `composer.json`-ის სახელი `mediary/backend`-ია (აღწერასთან და keyword-ებთან ერთად). ⚠️ `translateBatch()` მხოლოდ „გამოუყენებელი" არ იყო — ის ტექსტებს `\n`-ით ამწებებდა და **ერთ** `ask()`-ად ითვლებოდა, ე.ი. ვინც მას „აღმოაჩენდა", კვოტის მრიცხველსაც აცდენდა და ხაზების აღდგენაზეც დაეყრდნობოდა, რაც Gemini-ზე არასდროს შემოწმებულა. ⚠️ `movies:backfill-collections` ერთჯერადი იყო და `ItemSyncer`-ის `details` ველით უკვე დაფარულია. ⚠️ **`composer.lock`-ის content-hash `name`-საც ითვლის**, ე.ი. სახელის შეცვლა `composer update --lock`-ს ითხოვდა (მხოლოდ ჰეში შეიცვალა — `composer validate` სუფთაა, ვერსიები უცვლელია). `php artisan list` აღარც `inspire`-ს აჩვენებს და აღარც `movies:backfill-collections`-ს.
- **ტიპი:** debt
- **სად:** `backend/app/Services/Translation/Translator.php:270,289` (`translateBatch()`/`toGeorgianBatch()` — გამომძახებელი არსად, `grep` 0), `backend/routes/console.php:7` (Laravel-ის სკელეტის `inspire`), `backend/app/Console/Commands/BackfillCollections.php:12` (`movies:backfill-collections` — 2026-08-ის ერთჯერადი backfill), `backend/composer.json:3` (`"name": "laravel/laravel"`)
- **პრობლემა:** `translateBatch()` `\n`-ით ტექსტების შერწყმას აკეთებს — Gemini-ზე ეს პატერნი შემოწმებული არაა და კვოტას/`ask()`-ს გვერდს უვლის (`translate()`-ით გადის, ე.ი. ერთ გამოძახებად ითვლება); ვინც მას „აღმოაჩენს", არაპროგნოზირებად შედეგს მიიღებს. `inspire` აპისთვის უცხოა; backfill-ის ბრძანება `ItemSyncer`-ის `details` ველით უკვე დაფარულია.
- **რატომ:** dead code (spec-ის DEBT).
- **გადაწყვეტა:** ორივე მეთოდის, `inspire`-ის და `BackfillCollections`-ის წაშლა (ან CLAUDE.md-ში მიზეზის დაწერა, თუ დარჩენა გადაწყდა); `composer.json` `"name": "mediary/backend"`.
- **Acceptance criteria:**
  - [x] `php artisan list` `inspire`-სა და `movies:backfill-collections`-ს არ აჩვენებს; `php artisan test` მწვანე
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-19] `auth.tsx`-ში მკვდარი `permissions['*']` ბრანჩი
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `?? user.permissions['*']` ამოღებულია — wildcard 2026-09-15-ს მოიხსნა როლიდან, ვალიდატორიდან და მონაცემებიდანაც (მიგრაციამ `user` როლის მასკა მოდულებად გაშალა), ე.ი. backend `'*'`-ს არასდროს აბრუნებს და ბრანჩი მკვდარი იყო. ⚠️ **ტიპით ჩაკეტვა (`Record<ModuleKey, Action[]>`) შეუძლებელია და ეს არ არის გამორჩენა**: იგივე რუკა `admin:users`/`admin:audit` გასაღებებსაც ატარებს (`canAdmin()` მათ სწორედ აქედან კითხულობს), ე.ი. ვიწრო ტიპი ადმინის შტოს გატეხდა — `Record<string, string[]>` რჩება. `canAdmin()`-ის კომენტარი („`'*'` აქ განზრახ არ მოქმედებს") ახლა მთელ ფაილზე მართალია.
- **ტიპი:** debt
- **სად:** `frontend/src/lib/auth.tsx:104` (`user.permissions[module] ?? user.permissions['*'] ?? []`)
- **პრობლემა:** wildcard 2026-09-15-ს ამოვიდა (`Role`, ვალიდატორი, მონაცემი — CLAUDE.md *The wildcard permission is gone*); backend `'*'`-ს არასდროს აბრუნებს, ე.ი. ბრანჩი მკვდარია და ცრუ შთაბეჭდილებას ტოვებს, რომ ფუნქცია ცოცხალია.
- **რატომ:** მკვდარი კოდი უსაფრთხოების ლოგიკაში — მომდევნო მკითხველი მასზე დაეყრდნობა.
- **გადაწყვეტა:** `?? user.permissions['*']` ამოღება; `RoleApiTest`-ის ანალოგი ფრონტზე არ სჭირდება — `tsc` ტიპით (`Record<ModuleKey, Action[]>`) ჩაკეტვა.
- **Acceptance criteria:**
  - [x] `grep -n "'\*'" frontend/src/lib/auth.tsx` ცარიელია; `npm run build` მწვანე
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-20] მოძველებული კომენტარები და მანქანის შესახებ ჩანაწერები
- **ტიპი:** debt
- **სად:** `backend/app/Http/Controllers/Api/PublicProfileController.php:27` („ჩაწერა აქ **არაფერი ხდება** — მხოლოდ ორი GET" — მარშრუტი ხუთია, ერთი `POST …/unlock`, GAP-06-ის შემდეგ), `frontend/public/sw.js:12` („ამ შემთხვევისთვის ტელეგრამი/ელფოსტაა" — ელფოსტის არხი §8.2-ში ამოვიდა), `CLAUDE.md` (*Local video download* — „ორივე ბინარი ამ მანქანაზე დაყენებულია" და *Knowledge graph* `python -m graphify` — ამ დესკტოპზე (2026-09-17-დან) `yt-dlp`/`ffmpeg` არ არის (`mediary:doctor` FAIL) და `python` Store-ის stub-ია — მხოლოდ uv-ის cpython გზით)
- **პრობლემა:** კომენტარი, რომელიც კოდს ეწინააღმდეგება, უფრო ცუდია, ვიდრე მისი არქონა — შემდეგი ცვლილება მას დაეყრდნობა (GAP-06-ის მიზეზი).
- **რატომ:** README/დოკუმენტაცია vs კოდი (spec-ის მე-3 ნაბიჯი).
- **გადაწყვეტა:** სამი ტექსტის შესწორება; CLAUDE.md-ში მანქანის სპეციფიკური ფაქტები ერთ „ეს მანქანა" ბლოკში, თარიღით.
- **Acceptance criteria:**
  - [ ] სამივე ადგილი კოდის რეალობას აღწერს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-21] ენების სახელები კომპონენტებში hardcoded-ია
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). ოთხივე ადგილი (`SettingsPage`, `MovieFormPage`, `GenresPage`, `LanguageDropdown`) `lang.ka`/`lang.en`-ზე გადავიდა, `CastMemberDialog`-ის ორივე placeholder კი — `cast.namePlaceholderKa`/`…En`-ზე. ⚠️ **მნიშვნელობა ორივე ლოკალში ერთი და იგივეა და ეს გააზრებულია**: ენის სახელი **ენდონიმია** — ენა თავის ენაზე იწერება, თორემ ინგლისურ ინტერფეისში „ქართული" „Georgian"-ად იქცეოდა (და პირიქით), ე.ი. ამომრჩევი ვერ იცნობდა საკუთარ ენას. i18n-ში ის მაინც იმიტომ ზის, რომ ოთხივე ადგილმა **ერთი** წყარო კითხულობდეს და აუდიტმაც დაინახოს. იგივე ეხება მსახიობის ველების მაგალითებს: „ნინო ქასრაძე" ქართული სახელის ველის მაგალითია და ინგლისურ ინტერფეისშიც ქართული რჩება. ⚠️ **`lang.auto` განზრახ არ დაემატა** — `settings.contentLangAuto` უკვე არსებობს და ის ენის სახელი კი არაა, არამედ პარამეტრის არჩევანი („ავტომატურად"); ორი გასაღები ერთ ტექსტზე ზუსტად ის დუბლირებაა, რასაც ეს ტასკი ასწორებს. i18n-ის აუდიტი: `lang.* -> 2`, `key-like literals outside t(): 0`.
- **ტიპი:** debt
- **სად:** `frontend/src/pages/SettingsPage.tsx:173`, `frontend/src/pages/MovieFormPage.tsx:388`, `frontend/src/pages/GenresPage.tsx:182` (`… === 'ka' ? 'ქართული' : 'English'`), `frontend/src/components/LanguageDropdown.tsx:21` (`<SelectItem value="ka">ქართული</SelectItem>`)
- **პრობლემა:** BUG-01-ის (hardcoded ქართული დიალოგში) იგივე კლასი, ოთხ ადგილას; ენის სახელი ენდონიმად ლეგიტიმურია, მაგრამ ერთი წყარო (`lang.ka`/`lang.en` გასაღები) ოთხ ასლს სჯობს — `CastMemberDialog.tsx:250`-ის `placeholder="ნინო ქასრაძე"` მაგალითიც ინგლისურ UI-ში ქართულად რჩება.
- **რატომ:** არათანმიმდევრული პატერნი; i18n audit ამ ლიტერალებს ვერ ხედავს.
- **გადაწყვეტა:** `lang.ka`/`lang.en`/`lang.auto` გასაღებები, ოთხივე ადგილი `t()`-ზე; `CastMemberDialog`-ის placeholder `cast.namePlaceholderKa` გასაღებად.
- **Acceptance criteria:**
  - [x] `node scratchpad/ka_literals.mjs`-ის ანალოგი (ქართული ლიტერალი TSX-ში კომენტარების გარეთ) 0 ხაზს აბრუნებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-22] `GenreController::store()` slug-ს შეუზღუდავი ციკლით ქმნის
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `GenreController::store()` `DictionaryKey::make()`-ზე გადავიდა — ის სწორედ ამ ციკლის ცხრა ასლის გასაერთიანებლად დაიწერა (§B3) და გლობალური ჟანრი მეათე ასლად რჩებოდა. ორი რამ შეიცვალა: ციკლს **ჭერი** აქვს (უსასრულო `while`, რომელიც ყოველ ბიჯზე ბაზას ეკითხება, ხარვეზზე სერვერს დაბლოკავდა) და **ჭრა სუფიქსამდეა** — `SLUG_LENGTH = 120` (`genres.slug`-ის რეალური სიგრძე) ცალკე კონსტანტაა და არა ლექსიკონების ნაგულისხმევი 60. ⚠️ **პრობლემა გაზომილია**: 95-სიმბოლოიანი ქართული სახელის `Str::slug` **127 სიმბოლოა** (`ღ`→`gh`, `ძ`→`dz`), ე.ი. სვეტს არ ეტეოდა. ⚠️ **ფოლბექი შენარჩუნებულია** — ლათინურად ცარიელ სახელზე `g-<md5>`, ოღონდ ახლა `DictionaryKey`-ს `$fallback`-ად გადაეცემა და არა ხელით აეწყობა. ორი ახალი ტესტი `GenreItemsTest`-ში (ძველ კოდზე წითელია).
- **ტიპი:** debt
- **სად:** `backend/app/Http/Controllers/Api/GenreController.php:55` (`while (Genre::where('slug', $slug)->exists())`)
- **პრობლემა:** §B3-ის `DictionaryKey::make()` სწორედ ამ ციკლის ცხრა ასლს გაერთიანებდა („უსასრულო `while`, რომელიც ყოველ ბიჯზე ბაზას ეკითხება, სერვერს დაბლოკავს") — გლობალური ჟანრები მეათე ასლად დარჩა; ჭრის წესიც აქ არ მოქმედებს (`Str::slug` 100-სიმბოლოიან სახელზე სვეტს შეიძლება გადააჭარბოს).
- **რატომ:** დუბლიკატი ცნობილი ბაგით.
- **გადაწყვეტა:** `DictionaryKey::make($name, fn ($k) => Genre::where('slug', $k)->exists(), 'g', max: <genres.slug სიგრძე>)`.
- **Acceptance criteria:**
  - [x] ტესტი: 100-სიმბოლოიანი ქართული სახელით ორი ჟანრი უნიკალურ, სვეტში მოთავსებულ slug-ს იღებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-23] `GeorgianShops::fetch()` მთელ პასუხს კითხულობს და მერე ჭრის
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `GeorgianShops::fetch()` `'stream' => true`-ით ითხოვს და სხეულს **`SafeHttp::readCapped()`**-ით კითხულობს — `SafeHttp::read()` `private`-იდან `public static`-ად გავიდა, ე.ი. „ნაკადის ჭერამდე წაკითხვა" ერთ ადგილას რჩება და არ გადაიწერა. ⚠️ **სრული `SafeHttp::fetch()` განზრახ არ გამოიყენება**: მისი SSRF-ფენა (DNS + `CURLOPT_RESOLVE`) აქ არაფერს იცავს — ჰოსტები ფიქსირებულია და მომხმარებელი მათ ვერ კარნახობს — სამაგიეროდ ტესტებს **ქსელზე დამოკიდებულს** გახდიდა (`Http::fake()` DNS-ს არ ცვლის; `SafeHttpTest`-ის RFC 5737-ის წესი). ⚠️ **ქცევა ერთ წერტილში შეიცვალა და ეს გააზრებულია**: `Content-Length`-ით გამოცხადებული ჭერზე დიდი პასუხი ახლა საერთოდ არ იკითხება და წყარო `ok: false`-ს იღებს („ვერ წავიკითხე"), 200-ის ფარგლებში — სქრეიპინგის ჩავარდნა ჩანაწერის დამატებას ვერასდროს აჩერებს. ორი ტესტი: ჭერს იქით მოქცეული პროდუქტი შედეგში არ ჩანს, და გამოცხადებული 5 MB საერთოდ არ იკითხება (ეს უკანასკნელი ძველ კოდზე წითელია).
- **ტიპი:** debt
- **სად:** `backend/app/Services/BoardGames/GeorgianShops.php:143` (`substr($res->body(), 0, self::MAX_BYTES)`)
- **პრობლემა:** `MAX_BYTES`-ის კომენტარი ჰპირდება, რომ დიდი გვერდი `artisan serve`-ს არ დაბლოკავს — `body()` კი მთელ პასუხს მეხსიერებაში უკვე ჩატვირთავს (§A3-ში `LinkMetadata`-ზე იგივე „ჭერი ტყუილია" გასწორდა `SafeHttp::read()`-ით). ჰოსტები ფიქსირებულია, ე.ი. SSRF არაა — მხოლოდ მეხსიერება/დრო.
- **რატომ:** არათანმიმდევრული პატერნი ცნობილი წესის წინააღმდეგ.
- **გადაწყვეტა:** `SafeHttp`-ის ნაკადური კითხვა (`allowPrivate` არ სჭირდება) ან `stream => true` + `read(MAX_BYTES)`; კომენტარის შესწორება, თუ დარჩა.
- **Acceptance criteria:**
  - [x] ტესტი `Http::fake()`-ის 5 MB სხეულზე: მეხსიერებაში ≤2 MB იკითხება (ან პასუხი `MAX_BYTES`-ზე წყდება)
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-24] მზარდი ცხრილები არასდროს იწმინდება
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). ოთხივე მოდელს `MassPrunable` დაემატა თავისი ვადით: `SerpSearch`/`TranslationUsage` — `KEEP_MONTHS = 3`, `BatchItem` — `KEEP_DAYS = 30`, `NoteNotification` — **`KEEP_READ_DAYS = 90`**; `Schedule`-ში `model:prune` და `queue:prune-batches --hours=48` (ორივე დღეში ერთხელ). ⚠️ **`MassPrunable` და არა `Prunable`**: წაშლა ერთი query-ია, მოვლენების გარეშე — ოთხივე `AuditRegistry::NOT_LOGGED`-შია, ე.ი. observer-ს ისედაც არაფერი ეთქმოდა, ათასობით ობიექტის ჩატვირთვა კი ფუჭი ხარჯი იქნებოდა. ⚠️ **შეტყობინებებიდან მხოლოდ წაკითხული იშლება** — `read_at`-ის გარეშე რიგი ან ჯერ ეკრანზე არ ყოფილა, ან ჩავარდნილია (`failed` + მიზეზი); ვადით ბრმა წაშლა შეხსენებას უბრალოდ დაკარგავდა. ⚠️ **`owner` სკოუპი ცხადად ეხსნება** `BatchItem`/`NoteNotification`-ზე: CLI-ზე ის ისედაც არ მოქმედებს, მაგრამ ამაზე დაყრდნობა ნიშნავდა, რომ ვებიდან გაშვებული იგივე ბრძანება ჩუმად ერთი ანგარიშის რიგებს წაშლიდა (ტესტი სწორედ ამიტომ ავტორიზებულია). ⚠️ **`audit_logs` არ ეხება** (§4.7, ხელითაა) და **`failed_jobs`-იც განზრახ რჩება**: `tries = 1`, ე.ი. ჩავარდნა იშვიათია და თითოეული მოსაკვლევია — ავტომატური წაშლა სწორედ იმ კვალს გაანადგურებდა, რისთვისაც ის ცხრილი არსებობს. ცოცხლად გადამოწმდა: `php artisan model:prune --pretend` ოთხივე მოდელს ასახელებს, `schedule:list` — ოთხ ბრძანებას.
- **ტიპი:** debt
- **სად:** `backend/routes/console.php:41` (`Schedule` — მხოლოდ `notes:remind`); `Prunable` არცერთ მოდელზე (`grep -rl Prunable backend/app/Models` → 0)
- **პრობლემა:** `serp_searches` (თითო ძებნა), `translation_usages` (თითო გამოძახება), `note_notifications` (ჟურნალი), `batch_items`, `job_batches`/`failed_jobs` შეუზღუდავად იზრდება; `audit_logs` განზრახ ხელითაა (§4.7), დანარჩენი — უბრალოდ დაუწერელი. კვოტის ფანჯარა 1 თვე/1 დღეა, ე.ი. ძველი რიგი ვერაფერს ემსახურება.
- **რატომ:** SQLite-ზე არა, MySQL-ზე წლის შემდეგ მილიონობით რიგი ბექაპსა და ვიუერს ამძიმებს.
- **გადაწყვეტა:** `Prunable` (`serp_searches` >3 თვე, `translation_usages` >3 თვე, `batch_items` >30 დღე, `note_notifications` წაკითხული >90 დღე) + `Schedule::command('model:prune')->daily()` და `queue:prune-batches --hours=48`; `audit_logs` — შეუხებელი.
- **Acceptance criteria:**
  - [x] `php artisan model:prune --pretend` ოთხივე მოდელს ასახელებს; `schedule:list` ორ ახალ ბრძანებას აჩვენებს
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-25] `<html lang="ka">` სტატიკურია
- **სტატუსი:** ✅ შესრულებულია (2026-09-19). `i18n/index.ts`-ში `languageChanged` listener-ი `document.documentElement.lang`-ს აახლებს, საწყისი მნიშვნელობა კი ცხადად იწერება (init-ზე ივენთი გარანტირებული არაა). ⚠️ **ეს i18n-შია და არა კომპონენტში**: ენის ცვლილების ერთადერთი წყარო i18next-ია, ე.ი. listener-ი ყველა გზას ფარავს — მათ შორის მომავალ გამომძახებელს; `LanguageDropdown`-ში ჩაწერა ნიშნავდა, რომ პროგრამული `changeLanguage()` ჩუმად აღარ იმუშავებდა. ⚠️ **`index.html`-ის `lang="ka"` რჩება და ეს სწორია** — JS-მდე დოკუმენტს რაღაც ენა მაინც სჭირდება და აპის ნაგულისხმევი ქართულია (`savedLanguage`); სკრიპტი მას მაუნთამდე ასწორებს. ⚠️ `typeof document` შემოწმება ტესტისთვის არაა (jsdom-ში ის არსებობს) — ის მოდულს DOM-ის გარეშე გარემოშიც უსაფრთხოს ხდის. ტესტი `i18n/index.test.ts`-შია.
- **ტიპი:** debt
- **სად:** `frontend/index.html:2`
- **პრობლემა:** ინგლისურ UI-ზეც დოკუმენტის ენა `ka` რჩება — ეკრანის მკითხველი, ბრაუზერის თარგმანი და hyphenation ინგლისურ ტექსტს ქართულად კითხულობს.
- **რატომ:** მცირე დეფექტი წვდომადობაში.
- **გადაწყვეტა:** `i18n.on('languageChanged', l => document.documentElement.lang = l)` `main.tsx`-ში.
- **Acceptance criteria:**
  - [x] ენის გადართვაზე `document.documentElement.lang` იცვლება (Vitest)
- **Estimate:** S
- **დამოკიდებულება:** none

### [DEBT-26] ქართული ორთოგრაფიის ავტომატური შემოწმება CI-ში არ არის
- **სტატუსი:** 🟡 ნაწილობრივ შესრულებულია (2026-09-19). დაიწერა **`scripts/ka-spell.py`** (`ka.json`-იდან ქართული სიტყვების ამოღება → `hunspell -d ka_GE -l` → პროექტის საკუთარი სია `frontend/src/i18n/ka-words.txt`) და CI-ში ორი ნაბიჯი დაემატა. ⚠️ **რჩება ერთადერთი, რაც ამ მანქანაზე ვერ გაკეთდა: ცრუ დადებითების გაზომვა ნამდვილ `ka_GE`-ზე** — `hunspell` აქ დაყენებული არ არის და ლექსიკონის ჩამოტვირთვა შენი ნებართვის გარეშე არ გამიკეთებია. სწორედ ეს გაზომვა წყვეტს WARN→FAIL-ს (ეს თვითონ ტასკშივე წერია), ამიტომ ნაგულისხმევი **WARN**-ია და `--strict` ერთი სიტყვის დამატებაა.
  - ⚠️ **ლექსიკონის არქონა შეცდომად არ ითვლება**: სკრიპტი მიზეზს ბეჭდავს და **0-ს** აბრუნებს, CI-ის `apt-get`-ს კი `|| true` მოსდევს — `hunspell-ka` პაკეტი შეიძლება არ აღმოჩნდეს, და შემოწმება, რომელიც *საკუთარი ინფრასტრუქტურის* გამო წითლდება, პირველივე დღეს გამოირთვება.
  - ⚠️ hunspell-ის **არა-ნულოვანი კოდი `None`-ია და არა „ყველა სიტყვა უცნობი"** — ლექსიკონის არქონა ზუსტად ასე გამოიყურება და 2190 სიტყვის „შეცდომად" წაკითხვა ყველაზე ცუდი პასუხი იქნებოდა.
  - ⚠️ `ka-words.txt`-ში **მხოლოდ სწორი** სიტყვა ემატება (ბუკმარკი · ტეგი · ესკიზი · ფრანჩაიზი · კრედიტი…); შეცდომის „დაჩუმება" ამ ფაილით აკრძალულია — სწორედ ისინია მოსაძებნი. ქართულს ბრუნება აქვს, ამიტომ ბრუნვებიც ცალკე ხაზებია.
  - ⚠️ სუფთა-Python ნაწილი გადამოწმებულია: 2190 ქართული სიტყვა ამოიღება, allow-სია ნამდვილად ჭრის, ხოლო BUG-18-ის ექვსივე სიტყვა („ჟანრიის", „კატეგორიაის", „ნიშავს", „სასაათე", „გალერიის", „დამრჩეს") `ka.json`-ში **აღარ არსებობს**.
- **ტიპი:** debt
- **სად:** `frontend/src/i18n/audit.py:175` (`main()` — ორთოგრაფიას არ ეხება), `.github/workflows/ci.yml:113`
- **პრობლემა:** BUG-18-ის ტიპის შეცდომა („ჟანრიის", „კატეგორიაის") არცერთ შემოწმებას არ უჭირავს — მხოლოდ თვალით კითხვას. ⚠️ დასადასტურებელია: hunspell-ის `ka_GE` ლექსიკონი (LibreOffice-ის ქართული პაკეტი) აპის ტერმინოლოგიას (ბუკმარკი, ტეგი, ჟანრი…) რამდენად ფარავს — false positive-ების რაოდენობა გადაწყვეტს, WARN იქნება თუ FAIL.
- **რატომ:** შენი მოთხოვნა „ყველა ქართული ტექსტი გამართული იყოს" მხოლოდ ერთჯერადი შესწორებით არ სრულდება.
- **გადაწყვეტა:** `scripts/ka-spell.py`: `ka.json`-ის მნიშვნელობებიდან სიტყვების ამოღება, `hunspell -d ka_GE -l` + პროექტის საკუთარი სიტყვების სია (`frontend/src/i18n/ka-words.txt`); CI-ში ცალკე ნაბიჯად.
- **Acceptance criteria:**
  - [ ] სკრიპტი BUG-18-ის სიტყვებს (გასწორებამდე) წითლად აჩვენებს და გასწორების შემდეგ მწვანეა
- **Estimate:** S
- **დამოკიდებულება:** BUG-18, GAP-15

## Backlog

### [FEAT-06] მომხმარებლის საკუთარი მონაცემების ექსპორტი
- **ტიპი:** feature
- **სად:** `backend/routes/api.php` — `POST /storage/files/download` (zip მხოლოდ ფაილებზე) და `/admin/backups` (`super_admin`, მთელი ბაზა) არსებობს; პერ-მომხმარებელი ჩანაწერების ექსპორტი — არა
- **პრობლემა:** მრავალმომხმარებლიან აპში ჩვეულებრივ მომხმარებელს თავისი ბიბლიოთეკის წაღების გზა არ აქვს — SQL-ასლი ყველასი და მხოლოდ ადმინისაა.
- **რატომ:** მონაცემების პორტატულობა (Letterboxd/Goodreads-ის CSV-ის ანალოგი) და FEAT-07-ის შებრუნებული მხარე.
- **გადაწყვეტა:** `GET /export/{module}?format=json|csv` (`PublicDomain::card()`-ის მსგავსი ცხადი ველების სია, `owner` scope), `/profile`-ზე „ჩემი მონაცემები" ბლოკი; დიდ ბიბლიოთეკაზე `BatchController`-ის მოდელით ფაილად საცავში.
- **Acceptance criteria:**
  - [ ] თითო მოდულზე CSV/JSON მხოლოდ საკუთარ ჩანაწერებს შეიცავს (ტესტი სხვისი ჩანაწერით)
  - [ ] ექსპორტი აუდიტ-ლოგში იწერება
- **Estimate:** M
- **დამოკიდებულება:** none

### [FEAT-07] იმპორტი გარე სერვისების CSV-დან
- **ტიპი:** feature
- **სად:** n/a (ახალი — `Services/Import/*`)
- **პრობლემა:** ბიბლიოთეკის ჩამოტანა Letterboxd/IMDb-ის (ფილმი, `tmdb_id`/`imdb_id` სვეტით), Goodreads-ის (წიგნი, ISBN) და Steam-ის (თამაში, appid → RAWG ძებნა) ექსპორტიდან დღეს მხოლოდ სათითაოდაა შესაძლებელი. ⚠️ ეს **არა** დახურული „ლინკ-ბოტი" (ყურების ბმულების ავტომატური ძებნა) — მომხმარებლის საკუთარი ფაილის წაკითხვაა.
- **რატომ:** ახალი მომხმარებლის პირველი საათი; დუბლის თავიდან აცილება `imdb_id`/`isbn` unique-ით უკვე უზრუნველყოფილია.
- **გადაწყვეტა:** CSV ატვირთვა → სვეტების რუკა → გეგმა (რამდენი ახალი / უკვე არსებული / ვერ მოიძებნა) → `BatchController`-ის რიგი `from-tmdb`/Open Library-ით; სტატუსი და რეიტინგი CSV-იდან.
- **Acceptance criteria:**
  - [ ] Letterboxd-ის სატესტო CSV 10 ფილმს ქმნის, დუბლს გამოტოვებს და ანგარიშს აჩვენებს
- **Estimate:** L
- **დამოკიდებულება:** FEAT-06

### [FEAT-08] სტატისტიკის გვერდი
- **ტიპი:** feature
- **სად:** `backend/app/Http/Controllers/Api/DashboardController.php:27` („გადაწყდა (19.10): **ჯერ მხოლოდ რაოდენობა** — სტატუსებად დაშლა მოგვიანებით")
- **პრობლემა:** 19.10-ის „მოგვიანებით" არ დამდგარა: დეშბორდი მხოლოდ რიცხვებია; „წელს რამდენი ვნახე", ჟანრების/წლების/ქულების განაწილება, კითხვის ტემპი (`progress_*` უკვე ინახება), თვეების მიხედვით `watched_at` — არსად.
- **რატომ:** მონაცემი უკვე გვაქვს (`watched_at`, `rating`, `status_role`, `genreables`), მისი ჩვენება პირადი კატალოგის მთავარი „ჯილდოა".
- **გადაწყვეტა:** `GET /stats?year=` (სტატუსით/როლით, ჟანრით, წლით, თვით; SQL-აგრეგატები `owner` scope-ით), `pages/StatsPage.tsx` — ბარები CSS-ით (ბიბლიოთეკის გარეშე, bundle-ის წესი) ან მსუბუქი `recharts`-ის ზომის შეფასების შემდეგ.
- **Acceptance criteria:**
  - [ ] გვერდი თითო ჩართულ მოდულზე მინიმუმ ორ ჭრილს აჩვენებს და ცარიელ ბიბლიოთეკაზე `EmptyState`-ს
- **Estimate:** M
- **დამოკიდებულება:** none

### [FEAT-09] სერიალის სეზონების/ეპიზოდების პროგრესი
- **ტიპი:** feature
- **სად:** `backend/database/migrations/2026_08_23_000001_create_series_tables.php:31-32` — `series.seasons`/`episodes` მხოლოდ რაოდენობაა; `TmdbClient` `/tv/{id}/season/{n}`-ს არ იძახებს
- **პრობლემა:** „ვუყურებ" სტატუსი ვერ ამბობს, სად გავჩერდი; ანიმეზეც იგივე.
- **რატომ:** სერიალის კატალოგის ძირითადი ფუნქცია (Trakt/TVTime); მონაცემი TMDB-ზე უფასოა.
- **გადაწყვეტა:** `series_episodes` (ცხრილი TMDB-იდან, `season`/`episode`/`air_date`/`name`) + `episode_watches` (per-user, `watched_at`); სინქრონის `fields`-ს `episodes`; ჩანაწერის გვერდზე სეზონების აკორდეონი ჩამრთველებით, „შემდეგი ეპიზოდი" ბარათზე; `status_role` `doing`→`done` ბოლო ეპიზოდზე.
- **Acceptance criteria:**
  - [ ] ეპიზოდის მონიშვნა ინახება და სხვა ანგარიშს არ ჩანს; სეზონის ბოლო ეპიზოდი პროგრესს 100%-ს აყენებს
- **Estimate:** L
- **დამოკიდებულება:** none

### [FEAT-10] „მალე" — კალენდარი
- **ტიპი:** feature
- **სად:** n/a (TMDB `next_episode_to_air` `tvDetails()`-ის პასუხშივე მოდის; `games.release_date` არსებობს)
- **პრობლემა:** მომავალი მოვლენა (შემდეგი ეპიზოდი, თამაშის გამოსვლა, წიგნის გამოშვება) აპში არსად ჩანს — შეხსენება მხოლოდ ხელით (`note_reminders`).
- **რატომ:** სტატუსი `todo`/`doing` + თარიღი უკვე ინფორმაციაა, რომელიც ჩუმად კარგავს ღირებულებას.
- **გადაწყვეტა:** `series.next_air_at` სინქრონზე; `GET /upcoming` (30 დღე, ყველა მოდულზე); დეშბორდის ბლოკი + არჩევითი ავტომატური `note_reminder` („ეთერში გასვლის დღეს").
- **Acceptance criteria:**
  - [ ] დეშბორდზე მომდევნო 30 დღის სია თარიღით და მოდულის ფერით
- **Estimate:** M
- **დამოკიდებულება:** FEAT-09

### [FEAT-11] კალათა ჩანაწერებზე
- **ტიპი:** feature
- **სად:** `frontend/src/i18n/ka.json:1321` (`purge.warning` — „„კალათა“ არ არსებობს")
- **პრობლემა:** წაშლა ყველგან მყისიერი და შეუქცევადია — მასობრივი წაშლის ტიპიზებული `DELETE`-ის მიუხედავად ერთი შემთხვევითი დაჭერა ბიბლიოთეკის ნაწილს კარგავს; ერთადერთი „უკან" `/backups`-ის სრული აღდგენაა (`super_admin`).
- **რატომ:** მონაცემების დაკარგვის რისკი ყოველდღიურ ოპერაციაზე.
- **გადაწყვეტა:** `trashed_at` (⚠️ არა `deleted_at` — `SoftDeletes`-ის კონტრაქტი, CLAUDE.md-ის ჩატის წესი) მოდულების მთავარ ცხრილებზე, `owner` scope-ის მსგავსი `trash` scope, „კალათა" გვერდი აღდგენით, `model:prune` 30 დღეზე ნამდვილი `delete()`-ით (ფაილები/კვოტა მაშინ თავისუფლდება); `/purge` კალათის გვერდის ავლით რჩება.
- **Acceptance criteria:**
  - [ ] წაშლილი ჩანაწერი სიაში არ ჩანს, კალათაში ჩანს, აღდგენა ფაილებით და მიბმებით მუშაობს; 30 დღის მერე ნამდვილად იშლება
- **Estimate:** L
- **დამოკიდებულება:** none

### [FEAT-12] ავტომატური, დაგეგმილი ბაზის ასლი აპიდან
- **ტიპი:** feature
- **სად:** `backend/app/Console/Commands/RunDatabaseBackupCommand.php:25` (`backups:run {backup}` — მხოლოდ არსებულ რიგზე), `backend/routes/console.php:41` (`Schedule` — ასლი არ არის)
- **პრობლემა:** ყოველდღიური ასლი ამ მანქანის გარე PowerShell-ტასკზეა (CLAUDE.md-ის „ტასკი ჩუმად არ ეშვებოდა" ისტორიით) — `/backups` კი ხელით დაჭერას მოითხოვს; შენახვის ვადა/რაოდენობა არსად.
- **რატომ:** §22-ის ბუნებრივი გაგრძელება — ასლი, რომელიც აპს არ ავიწყდება.
- **გადაწყვეტა:** `backups:auto` (`super_admin`-ის სახელით `DatabaseBackup` რიგი + `dump()`, `source = 'schedule'`, `keep` პარამეტრი — ბოლო N რჩება, ძველი `StoredFile`-ით იშლება), `Schedule::command(...)->dailyAt('03:00')`, `/backups`-ზე გადამრთველი და ბოლო ავტომატურის დრო; `mediary:doctor`-ში „ბოლო ასლი N დღის წინ".
- **Acceptance criteria:**
  - [ ] `schedule:run` ასლს ქმნის და `keep`-ის ზემოთ ძველს შლის (ტესტი MySQL-ზე `@requires`-ით, ლოგიკა sqlite-ზე mock-ით)
- **Estimate:** S
- **დამოკიდებულება:** none

### [FEAT-13] ჩანაწერის გაზიარება ჩატში ბარათად
- **ტიპი:** feature
- **სად:** `backend/app/Models/Message.php` — `type ∈ text|emoji|gif|image|video|file` (`MEDIA_TYPES`), ჩანაწერის ტიპი არ არსებობს
- **პრობლემა:** „ეს ნახე" დღეს URL-ის ჩასმაა — ბარათის (პოსტერი, სათაური, სტატუსი) და „დაამატე ჩემთანაც" ღილაკის გარეშე; მატჩინგი (§16.2) კი „ორივეს გვაქვს"-ს ითვლის, რეკომენდაციის გზა კი არაა.
- **რატომ:** სოციალური ფენის (§16) ლოგიკური ნაბიჯი, არსებულ ინფრასტრუქტურაზე.
- **გადაწყვეტა:** `type = 'record'` + `attachment_path`-ის ნაცვლად `payload` JSON (`domain`, `id`, `tmdb_id`/გლობალური იდენტობა `PublicDomain::MATCH`-ით); მიმღებს ბარათი `PublicDomain::card()`-ის ფორმით (მხოლოდ თუ ჩანაწერი საჯაროა — სხვაგვარად სათაური მხოლოდ) და „ჩემთან დამატება" (`from-tmdb`/lookup იდენტობით).
- **Acceptance criteria:**
  - [ ] პირადი ჩანაწერის გაზიარება მიმღებს მხოლოდ სათაურს აჩვენებს; საჯაროსი — სრულ ბარათს; „დამატება" მიმღების ბიბლიოთეკაში ჩანაწერს ქმნის
- **Estimate:** M
- **დამოკიდებულება:** none

### [FEAT-14] ხელახლა ნახვის ჟურნალი
- **ტიპი:** feature
- **სად:** `backend/app/Models/Concerns/HasStatus.php` — `watched_at` ერთი მომენტია (`applyStatusKey()`); ვიდეოს `watch_count`/`POST /videos/{id}/watched` არსებობს, მედია-დომენებზე — არა
- **პრობლემა:** ფილმის მეორედ ნახვა `watched_at`-ს გადაწერს — პირველი თარიღი იკარგება; „წელს რამდენი ვნახე" (FEAT-08) გამეორებებს ვერ ითვლის.
- **რატომ:** მონაცემი ჩუმად იკარგება ჩვეულებრივ მოქმედებაზე.
- **გადაწყვეტა:** `media_watches` (polymorphic `watchable`, `user_id`, `watched_at`, `note`) — `HasStatus`-ის `done` როლზე პირველი რიგი ავტომატურად, „კიდევ ვნახე" ღილაკი ჩანაწერზე; `watched_at` „ბოლო ნახვად" რჩება (ერთი წყარო — `max(media_watches.watched_at)`).
- **Acceptance criteria:**
  - [ ] ორჯერ მონიშნული ფილმი ორ რიგს ინახავს და გვერდზე ორივე თარიღი ჩანს
- **Estimate:** M
- **დამოკიდებულება:** FEAT-08

### [FEAT-15] PWA manifest + „მთავარ ეკრანზე დამატება"
- **ტიპი:** feature
- **სად:** `frontend/index.html:3-12` (manifest/`theme-color` არ არის), `frontend/public/sw.js` (SW მხოლოდ შეტყობინებებისთვისაა — კარგია)
- **პრობლემა:** ტელეფონზე აპი მხოლოდ ბრაუზერის ტაბია; SW უკვე რეგისტრირდება, ე.ი. „installable" ერთი manifest-ის დაშორებითაა.
- **რატომ:** მობილური ბიბლიოთეკა (რას ვნახო, წიგნის პროგრესი) მთავარი სცენარია.
- **გადაწყვეტა:** `manifest.webmanifest` (სახელი, ხატულები, `display: standalone`, `theme_color` ორ თემაზე), `<link rel="manifest">`, `<meta name="theme-color">`; ⚠️ SW-ში **ქეში არ დაემატოს** — ძველი ჩანქის პრობლემა (`ErrorBoundary`-ის მიზეზი) გამრავლდებოდა.
- **Acceptance criteria:**
  - [ ] Chrome Lighthouse „Installable" მწვანე; SW კვლავ არაფერს არ ქეშავს
- **Estimate:** S
- **დამოკიდებულება:** none

### [FEAT-16] ანგარიშის აღდგენა SMTP-ის გარეშე + არჩევითი 2FA
- **ტიპი:** feature
- **სად:** `backend/routes/api.php` — `POST /auth/{register,login,logout}`, `PATCH /auth/password` მხოლოდ მიმდინარე პაროლით; `backend/app/Support/AuditRegistry.php` `HIDDEN` `two_factor_secret`-ს ასახელებს, სვეტი კი არსად არსებობს
- **პრობლემა:** ელფოსტის არხი აპში არ არსებობს (§8.2-ის გადაწყვეტილება), ე.ი. დავიწყებული პაროლი = ადმინის ხელით SQL; ღია რეგისტრაციაზე მეორე ფაქტორი არ არის.
- **რატომ:** მრავალმომხმარებლიანი აპი მხოლოდ პაროლზე დგას, აღდგენის გზის გარეშე.
- **გადაწყვეტა:** (1) `/admin/users/{id}/reset-link` — ერთჯერადი, 24-საათიანი ტოკენი (ჰეშით `password_reset_tokens`-ში), ბმულს ადმინი აწვდის (ჩატი/სხვა არხი), `/reset/{token}` გვერდი; (2) TOTP (`pragmarx/google2fa` ან `spomky-labs/otphp`), `users.two_factor_secret` დაშიფრული, `/profile`-ზე ჩართვა QR-ით, შესვლაზე მეორე ნაბიჯი, აღდგენის კოდები; `login` limiter უცვლელი.
- **Acceptance criteria:**
  - [ ] ვადაგასული/გამოყენებული ბმული 410-ია; ტოკენი ბაზაში მხოლოდ ჰეშად ინახება
  - [ ] 2FA-იან ანგარიშზე პაროლი მარტო არ შედის; აღდგენის კოდი ერთხელ მუშაობს
- **Estimate:** L
- **დამოკიდებულება:** SEC-15

### [FEAT-17] დუბლის გაფრთხილება ვიდეოს/სიმღერის დამატებაზე
- **ტიპი:** feature
- **სად:** `backend/database/migrations/2026_08_28_000005_create_videos_table.php:29` (`external_id` — unique არ არის; `PublicDomain::MATCH` `platform+external_id`-ს იდენტობად იყენებს)
- **პრობლემა:** ერთი YouTube-ვიდეო ორჯერ ემატება ხმის გარეშე — ფილმზე `imdb_id` per-user unique-ს 422-ით იჭერს, ვიდეო/სიმღერა კი არა; მატჩინგი და ძებნა დუბლს ორად ითვლის.
- **რატომ:** მონაცემის სისუფთავე; მოდელი (`platform`+`external_id`) უკვე არსებობს.
- **გადაწყვეტა:** `POST /videos/metadata`-ს პასუხში `existing: {id, title}` (იგივე სიმღერაზე), ფორმაში „ეს ვიდეო უკვე გაქვს — გახსნა" ბმული; მკაცრი unique **არა** (სხვადასხვა ტიპით/ტეგით ერთი ბმულის შენახვა ლეგიტიმურია) — გაფრთხილება.
- **Acceptance criteria:**
  - [ ] არსებულ `external_id`-ზე `metadata` `existing`-ს აბრუნებს და ფორმა ბმულს აჩვენებს; შენახვა მაინც შესაძლებელია
- **Estimate:** S
- **დამოკიდებულება:** none

### [FEAT-18] პირადი ტეგები მედია-დომენებზე
- **ტიპი:** feature
- **სად:** `backend/database/migrations` — `movies`/`series`/`animes`-ს `tags` სვეტი არ აქვს (ვიდეო/სიმღერა/წიგნი/ჩანაწერი/ბუკმარკს აქვს)
- **პრობლემა:** ფილმზე კლასიფიკაცია მხოლოდ TMDB-ის გლობალური ჟანრია — „ოჯახთან სანახავი", „საახალწლო", „კომფორტ-ფილმი" პირადი ღერძი არსად იწერება; `GlobalSearch`-ის `json` წყაროც მედია-დომენებზე ცარიელია.
- **რატომ:** სხვა ექვსი მოდულის არსებული პატერნი (`Video::normalizeTags()`, `dedupeTags()`, ტეგის AND-ფილტრი) მედიაზე უბრალოდ არ არის გადატანილი.
- **გადაწყვეტა:** `tags` JSON სამივე ცხრილზე, `normalizeTags()`-ის დელეგაცია, `FilterPanel`-ში ტეგების ჯგუფი, `GlobalSearch`-ის რეესტრში `json`, `FieldCatalog`-ში ველი (ჩართული), `PurgeService`/`bulk`-ის `tag` სკოუპი (⚠️ BUG-16-ის სია ერთ ადგილას).
- **Acceptance criteria:**
  - [ ] ფილმზე ტეგი ინახება, ფილტრი AND-ით მუშაობს, ძებნა ტეგშიც პოულობს (ქართულ ესკეიპზეც)
- **Estimate:** M
- **დამოკიდებულება:** BUG-16

### [FEAT-19] შეტყობინებების ცენტრი
- **ტიპი:** feature
- **სად:** `backend/app/Models/NoteNotification.php` — ერთადერთი შეტყობინების არხი შეხსენებებისთვისაა; მოთხოვნის დამტკიცება/უარყოფა, კვოტის 90%, ჩავარდნილი ასლი, დასრულებული პარტია — არსად არ ეცნობება
- **პრობლემა:** მომხმარებელი მოთხოვნის სტატუსს `/modules`-ზე ხელით ამოწმებს; ადმინი ჩავარდნილ ასლს მხოლოდ გვერდის გახსნით ხედავს.
- **რატომ:** მოვლენები უკვე ლოგში იწერება (`audit_logs`), მაგრამ ადამიანამდე არ მიდის.
- **გადაწყვეტა:** `notifications` (Laravel-ის database channel — `Notifiable` უკვე framework-შია), ჰედერის ზარი + `GET /notifications`, პოლინგი `Sidebar`-ის 30-წამიან ბეჯთან ერთად (ერთი მოთხოვნა), ტელეგრამის არხი `NoteChannelSettings`-ის მოდელით — არჩევითი.
- **Acceptance criteria:**
  - [ ] მოთხოვნის დამტკიცება მომხმარებელს შეტყობინებას უტოვებს; წაკითხვა `read_at`-ს წერს; ბეჯი წაუკითხავს ითვლის
- **Estimate:** M
- **დამოკიდებულება:** none

### [FEAT-20] „რა ვნახო დღეს" — შემთხვევითი არჩევანი
- **ტიპი:** feature
- **სად:** n/a (`LibraryPage`-ის ფილტრი + `statusKey` scope არსებობს)
- **პრობლემა:** 300-ფილმიან „საყურებელი" სიაზე არჩევანი თვითონ საქმეა; აპი ამას არ ეხმარება.
- **რატომ:** პირადი კატალოგის ყველაზე ხშირი კითხვა — მცირე კოდი.
- **გადაწყვეტა:** `GET /{domain}?pick=random` (ფილტრით, `todo` როლი default), ბიბლიოთეკის ჰედერზე „კამათელი" ღილაკი ბარათის მოდალით და „სხვა"/„დავიწყო" (სტატუსი `doing`).
- **Acceptance criteria:**
  - [ ] ღილაკი ფილტრის ფარგლებში შემთხვევით ჩანაწერს აჩვენებს; ცარიელ ფილტრზე `EmptyState`
- **Estimate:** S
- **დამოკიდებულება:** none

### [FEAT-21] წლიური მიზნები
- **ტიპი:** feature
- **სად:** n/a (FEAT-08-ის აგრეგატებზე)
- **პრობლემა:** „წელს 24 წიგნი" ტიპის მიზანი და პროგრესი (Goodreads Challenge-ის ანალოგი) არ არსებობს.
- **რატომ:** მოტივაცია, რომელიც ბიბლიოთეკის რეგულარულ შევსებას უწყობს ხელს; მონაცემი `watched_at`/`status_role`-ში უკვე დგას.
- **გადაწყვეტა:** `users.settings.goals` (`{module: {year: target}}`, მიგრაციის გარეშე — `SettingsProvider`-ის სქემით), დეშბორდის ბლოკი პროგრესის ზოლით, FEAT-08-ის აგრეგატი.
- **Acceptance criteria:**
  - [ ] მიზნის ჩაწერა ინახება; ზოლი დასრულებულთა რაოდენობას წლის მიხედვით ითვლის
- **Estimate:** M
- **დამოკიდებულება:** FEAT-08

### [FEAT-25] ახალი მოდული: კურსები
- **ტიპი:** feature
- **სად:** n/a (რეესტრები — `ModulesSeeder`, `StatusDomain`, `PublicDomain`, `PurgeService` 4 რუკა, `AuditRegistry`, `DashboardController::COUNTERS`, `StorageFolder`, `StorageMeter::files()/referencedPaths()`, `CustomFields`, `FieldCatalog`, `ModuleImages`, frontend `PAGE_MODULE_KEYS`/`MODULE_PAGES`/`dictionaries`/`PURGE_TARGET_MODES`, `ModuleIcon`, `cutStyle`, i18n — `RegistryConsistencyTest`-ის 17 შემოწმება გამორჩენას იჭერს)
- **პრობლემა:** ონლაინ-კურსი (Udemy/Coursera/YouTube-პლეილისტი) დღეს ან „ვიდეოა", ან „ბუკმარკი" — არც პროგრესი აქვს გაკვეთილებით, არც სერტიფიკატის ფაილი. გარე უფასო API არ არსებობს (Udemy/Coursera-ს კატალოგი დახურულია) — მოდული **ხელითაა**, ბუკმარკის `LinkMetadata` პრობით სათაურისა და სურათისთვის.
- **რატომ:** `note`/`bookmark`-ის მსგავსი „წყაროს გარეშე" მოდულის მზა რეცეპტი; პროგრესი წიგნის მოდელით.
- **გადაწყვეტა:** `courses` (`url`, `platform` დომენიდან, `lessons_total`/`lessons_done`, `hours`, `status` enum `to_take/taking/done/dropped`, `certificate` ფაილი `course_files`-ში), per-user კატეგორიები, `MATCH` `url`-ით (ბუკმარკის წესი).
- **Acceptance criteria:**
  - [ ] კურსი პროგრესით და სერტიფიკატით ინახება; ბმულის პრობი სათაურს ავსებს; `RegistryConsistencyTest` მწვანე
- **Estimate:** L
- **დამოკიდებულება:** none

### [FEAT-26] ახალი მოდული: ადგილები
- **ტიპი:** feature
- **სად:** n/a (რეესტრები — FEAT-25-ის სია)
- **პრობლემა:** „სანახავი/ნანახი ადგილები" (რესტორანი, მუზეუმი, ქალაქი) კატალოგის იგივე ლოგიკაა (სტატუსი `todo/done`, რეიტინგი, ფოტოები, ჩანიშვნები), მაგრამ მოდულებში არ ჯდება. წყარო უფასოა: **OSM Nominatim** (გასაღების გარეშე, `User-Agent` სავალდებულოა — Wikimedia-ს იგივე წესი, 1 req/s ლიმიტი → ქეში).
- **რატომ:** გალერეის მოდულს (ფოტოები მშობელზე) და `GalleryParent`-ის რუკას ბუნებრივი მშობელი ემატება; შენი ფოტოები `place_files`-ში, ვებძებნა (`WebSearchController::TARGETS`) ადგილზეც.
- **გადაწყვეტა:** `places` (`name`, `lat`/`lng`, `address`, `country`, `osm_id`, `visited_at`, `status`, `rating`), Nominatim-ის კანდიდატები (§12-ის `candidates → lookup` ფორმა), რუკა — მოგვიანებით (Leaflet ~40 kB — bundle-ის წესით ცალკე ჩანქი, გადასაწყვეტია); `MATCH` `osm_id`-ით.
- **Acceptance criteria:**
  - [ ] ადგილის ძებნა Nominatim-ით და ხელით; ფოტოები გალერეაში ჩანს; მატჩინგი `osm_id`-ით ითვლის
- **Estimate:** L
- **დამოკიდებულება:** none
