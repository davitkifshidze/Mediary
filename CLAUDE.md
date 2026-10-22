# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mediary — a personal, bilingual (Georgian/English), multi-user media catalog.

- `backend/` — Laravel 13 JSON API (PHP 8.3, MariaDB/MySQL). API only, no views.
- `frontend/` — React 19 + TypeScript SPA (Vite, Tailwind v4, Radix/shadcn-style UI, TanStack Query, react-i18next).
- Modules (`modules` table, `ModulesSeeder`): `movie`, `series`, `anime`, `video`, `song` (+ playlists), `book`, `board_game`, `game`, `note`, `bookmark`, `course`, `place`, `gallery` — plus private modules each account creates from `/modules` (key `c{owner}-{slug}`, records in `custom_records`).
- Georgian is the working language: `Tasks.md`, `Questions.md`, code comments and migration docblocks are Georgian — keep new comments Georgian. Identifiers, commit messages and this file are English.

## Working rules (the user's standing instructions)

- Reply to the user in Georgian.
- `Tasks.md` holds the current work and `Questions.md` the open questions — read both at the start of a session. A question carries context, options and a recommendation (⭐); once answered, the full decision goes into its `Tasks.md` section as a „გადაწყვეტილება" paragraph and the question is deleted — no `Qn` number, ❓ mark or option letter stays behind anywhere, and with nothing open `Questions.md` is just its heading. Each new batch numbers from §1 / Q1.
- **One `Tasks.md` section at a time.** When it is done: commit (no push), set its status (⬜ open · 🟡 partial · ✅ done), give a Georgian summary („რა გაკეთდა / რა დარჩა"), then stop and ask before starting the next one. Finished sections are deleted only when the user asks for a cleanup.
- „ამიღე" means *remove*, not *take on*.
- Comments, docblocks, test titles, identifiers, i18n keys and commit messages explain the code itself — never cite a `Tasks.md` section, question, stage, batch or request (`§12`, `Tasks §4.2`, `Q7`, `FEAT-3`, `ეტაპი 2`, „2026-10-21-ის პარტია"): those files are emptied when the work is done, so such a pointer leads nowhere.
- The servers are started by hand (see *Run*); don't add a launcher script or an auto-start.
- Verify with `npm run build`, the test suites and API calls — no Playwright, no screenshots.
- Push only when asked; never with `--all`/`--mirror`/`--tags`, and never from a clone made before 2026-09-17 (its history still carries a leaked database dump).
- Never commit a database dump (`*.sql` and `*.sql.gz` are git-ignored); a library moves between machines through `/backups`.
- Keep this file under ~25k characters: add a rule only when it is load-bearing and not derivable from the code. The previous exhaustive version (incident notes, per-feature traps) is in git history: `git show 4ddeaa5:CLAUDE.md`.
- Decided and closed — do not re-propose: the watch-link bot; image scraping; Georgian book lookup through an external source; the reminders' email channel; tags on movie/series/anime; game DLC/HowLongToBeat/Metacritic/language fields; song files, notes and gallery; board-game status; course lecturer/rating/lessons/length; icon-only row actions; the `*` permission wildcard; a share button inside module pages.

## Run (dev)

```bash
powershell -File C:\xampp\mysql\dumps\start-mysql.ps1   # 1. MariaDB (XAMPP): port 3306, db `mediary`, user root, no password
cd backend && php artisan serve --port=8000              # 2. API
cd frontend && npm run dev                               # 3. SPA → http://localhost:5173
```

- MariaDB is not a Windows service. Start it with the script above (it repairs the known Aria and replication-file failures and prints the real log lines), stop it with `mysqladmin -u root --protocol=tcp shutdown` — never by closing the window. Registering it as a service named `MySQL` needs an elevated shell and is still pending.
- On a startup failure read `C:\xampp\mysql\data\mysql_error.log` (not `<host>.err`) and test with a real query (`php artisan migrate:status`). Never delete `ib_logfile*`, never rebuild from `C:\xampp\mysql\backup`, never change `innodb_log_file_size`; a broken InnoDB is rebuilt as force-recover → `mysqldump` → `mysql_install_db` → import.
- `localhost:5173` and `127.0.0.1:5173` both work (`lib/apiUrl.ts`, `App\Support\LoopbackOrigin`); don't bind Vite to `localhost`.
- `yt-dlp`/`ffmpeg` paths live in `backend/.env` (they are not on PATH); `mysqldump`/`mysql` are found in `C:/xampp/mysql/bin`. `php` on PATH is WAMP's 8.3 — XAMPP's own PHP is 8.2.

## Commands

Backend (`backend/`):
- `php artisan test` (sqlite `:memory:`, `memory_limit` 512M in `phpunit.xml`) · `./vendor/bin/pint` (CI runs `--test`)
- `php artisan migrate` — part of pulling new code; `php artisan mediary:doctor` reports pending migrations, binaries, stray `.env` keys and the last backup
- `php artisan migrate:fresh --seed` · `mediary:bootstrap-admin` (first super admin) · `mediary:seed-demo`
- `php artisan schedule:work` — `notes:remind` every minute, `backups:auto` at 03:00, `trash:prune` at 03:30 (the backup must stay before the prune)
- `mediary:storage-recalc [--user=]` (after restores or hand-deleted files) · `media:redownload` · `videos:download {id}` · `backups:run {id}`
- `php artisan tinker` — pass Georgian text through stdin; the Windows console mangles UTF-8 in argv.

Frontend (`frontend/`):
- `npm run dev` · `npm run build` (`tsc -b` + Vite) · `npm test` (Vitest + jsdom)
- `npm run lint` — oxlint plus `scripts/unused-exports.mjs`, `error-codes.mjs`, `no-focus-ring.mjs`, `select-fit.mjs`, `action-rows.mjs`
- `python src/i18n/audit.py` — after any UI string change; it must print `OK`

Knowledge graph: `python -m graphify query "<question>"` before broad searches, `python -m graphify update .` after code changes. Never call bare `graphify`/`graphify.exe` — it is blocked on this machine.

## Architecture

### Backend

- REST under `/api` (`routes/api.php`, `app/Http/Controllers/Api`); resources return both languages flat (`title_ka`/`title_en`). Movie/series/anime keep bilingual text in `<domain>_translations` behind accessors.
- Auth: Sanctum SPA cookie mode. Everything sits behind `auth:sanctum` except `/health`, register/login/password reset, and the public profile and share-link routes (inventoried in `routes/api.php`).
- Ownership: `BelongsToUser` (global scope `owner`) plus `EnsureRecordOwnership` on every route-bound model — another account's record is a 404, never a 403. Public, CLI and queue paths drop the scope and pass `user_id` explicitly; jobs call `Auth::setUser()`.
- Access: `module:<key>` (module enabled for the user) + `permission:<key>` (role CRUD). The action is derived from the HTTP method, so a POST that edits must have its last path segment in `EnsureModulePermission::UPDATE_ENDPOINTS` or spell `permission:<key>,update`. Admin sections use `admin_access:<resource>`; purge, backups and module administration are `super_admin` only.
- Central registries — a new module or field must be added to every one that applies; `RegistryConsistencyTest` and `CustomModuleRegistryTest` fail when one is missed: `MediaDomain`, `StatusDomain`, `PublicDomain` (+ `card()`), `ShareDomain`, `GalleryParent`, `AuditRegistry`, `TrashDomain`, `ExportDomain`, `ImportSource`, `PurgeService` (`TARGETS`/`TARGET_MODES`), `StorageFolder`, `StorageMeter::referencedPaths()`, `DashboardController::COUNTERS`, `FieldCatalog`, `CustomFields`, `UploadLimits`, `CredentialProviders`. The SPA's mirrors of these lists are pinned by the same tests.
- Statuses: a per-user dictionary (`statuses`, `status_id`) for movie/series/anime/video/note/bookmark and private modules. Logic reads `role` (`todo`/`doing`/`done`) — never the name or the id. Book, game, course, place and duty keep an enum (a cancelled duty shift counts nowhere and pays 0); song and board game have no status. Status and the module's "type" are required on create (`$must` in each controller's `validated()`).
- Files: every upload goes through `StorageMeter` (quota, per-module limits, 413 codes), with sizes and formats from `UploadLimits` (code default → `app_settings` → per-user override, capped by `php.ini`). `StorageFolder` decides the disk: `notes/`, `chat/`, `backups/`, `videos/downloads` and `gallery/locked` are private and leave the server only through ownership-checked routes, always via `SafeMime::response()`. Only a user's own uploads count against the quota; shared TMDB/RAWG/BGG/Open Library files do not.
- Deleting: always through models, so `deleting` hooks release files, quota and polymorphic pivots — cleanup lives in the model, never in a controller. Ordinary deletes go to the trash (`trashed_at` + global `trash` scope, an explicit `moveToTrash()`; `delete()` is not overridden). Only account deletion and the trash's own final delete/prune delete for real.
- Record locks (`record_locks`) — one mechanism for every lock, the gallery album included (`AlbumLock` is a facade): `RecordLocks` + `HasRecordLock`; *hidden* = locked and not unlocked in this server session. A hidden record's content never leaves the server — scopes filter with `RecordLocks::exclude()` (one `not exists`, never a pre-fetch: the dashboard is pinned at ≤ 4 queries). `HidesLockedRecords` (movie, series, anime, actor): the `record_lock` scope hides hidden records from lists and search, `withoutLocked()` keeps **every** locked record out of totals, stats, export, public pages, share links and bulk plans, the route binding still finds a hidden record and `EnsureRecordOwnership` answers 423 `record_locked` on every route except its own `show`. A lock on a global record (actor) belongs to the viewer (`RecordLocks::ownerOf()`). Locking a photo moves it into the system locked album (`LockedPhotos`; in the personal gallery `LockedPersonalMedia`, photos and videos alike).
- External sources (TMDB, Gemini, RAWG/IGDB, Open Library, BGG, Google Places, Nominatim, SerpApi, Serper, Wikimedia, Georgian shops, Telegram): keys are per user only — `user_credentials`, encrypted, read through `CredentialStore`, never from `.env`. A missing key is 409 `credential_missing`, an unreachable source 503 `*_unavailable`, nothing found a 200 with an empty list. Failures are logged through `SourceLog` to `storage/logs/sources.log`. Link metadata has one door — `LinkResolver` (every `/…/metadata` probe and every save-time autofill); YouTube without a key falls back to `yt-dlp -J`, and tests never reach the real binary (`YTDLP_BINARY` in `phpunit.xml`). Outbound HTTP needs the CA bundle `storage/cacert.pem`; a user-supplied URL is fetched only through `SafeHttp`. Place search has one door — `PlaceSearch` (Google Places → SerpApi → Serper → Nominatim); suggestions while typing come only from Google (credit sources and Nominatim's policy forbid it).
- Export & import: a module's JSON/CSV or the full-export ZIP (`LibraryArchive`; a record's extras come from `RecordExtras`) comes back only through `MediaryImporter` — append-only, ids renumbered, dictionaries matched by key or name, files taken only from the uploaded ZIP and never from a server path. Replacing tables is super-admin-only (`DatabaseImporter`, safety dump first). There is no import from other sites.
- Audit: `AuditObserver` over `AuditRegistry::MODELS`; `AuditLogger` is the single writer — no logging code in controllers. Every write passes `AuditSettings` (super-admin switches in `app_settings`; chat deletion is protected). The SPA sends only enabled kinds (`user.audit_kinds`): page visits, record opens (`POST /audit/open/{type}/{id}`, once a minute — there is no visible visit counter any more) and click/refresh batches (`POST /audit/events`); never a field value, and share tokens are masked.
- Long work: `BackgroundProcess` (`start /B`) for downloads and backups; queue batches start their own worker. A Symfony `Process` on Windows must get its environment through `ProcessEnv` (otherwise it loses `SystemRoot` inside a web request).
- Time: `APP_TIMEZONE=Asia/Tbilisi`; use `App\Support\AppTime`, never `->utc()`.
- Errors: the machine code travels in `message` (`{"message": "credential_missing"}`) and must be registered in the SPA's `lib/errors.ts` and in both locales (`npm run lint` checks the literal ones).
- Social: public profiles (`/u/:username`; profile → module → record visibility, all private by default; `note` is never public), matching, chat (access by participation, not ownership), share links (`/share/:token`; the token is stored hashed; the one deliberate exception to record visibility).

### Frontend

- Pages are `lazy()` in `App.tsx`, behind `ErrorBoundary` → `Suspense` inside `<main>`; `components/` and `lib/` never import from `pages/`.
- Navigation and routes come from `GET /api/modules` (`lib/modules.tsx`); media domains from `lib/media.ts`.
- Reuse the shared pieces instead of re-rolling them: `PageHeader`, `EmptyState`, `ModalShell` (+ `ModalFooter`; modals stack), `FormSection`/`FormField`/`MediaRow` (main photo beside the fields)/`QuickFill`, `FilterPanel` + `useFilterDraft`, `PhotoGrid`/`PhotoStack`, `CutTabs`/`ScopeCard`, `InfoHint`, `Badge`, `DataTable`, `ActionMenu`, `DatePicker`/`TimePicker`, `RatingSelect` (my rating), `NumberPick`, `SecretInput`, `FileViewer`, and for module lists `RecordList`/`RecordView` + `ViewToggle` (one record description drawn as cards, grid or rows; the choice lives in `module_user.settings.view` through `useRecordLayout`; a card draws the 2×2 `CardActions` from `favorite`/`onDelete`/`actions`, rows draw the page's `bar`; a click anywhere on a record opens it — `lib/recordClick.ts`).
- Lists page with `Pagination` (numbers + „show more" together): `usePagedList` for a main list (`?page=` in the address), `usePages` for a nested one, `useClientPages` for a list already in the browser. Every request is one page — never grow `per_page` (the backend caps it at 500, photos at 1000). The page size is a multiple of the layout's columns (`lib/pageSize.ts`, picked with `PageSizePick`: cards 9, grid 24, photos 16, rows 10 by default, plus „other" and „all" = one page at the cap); module lists keep it in `module_user.settings.page_size`, photo grids in the browser; nested lists (audit, trash, public pages) stay at 10. A manually ordered list (playlists) stays one list.
- Long text is Markdown — descriptions, note text, record notes: `RichText` edits it (TipTap, lazy-loaded; text is stored unescaped and a line break is `\n`, so search and CSV stay plain), `Markdown` shows it (marked tokens → React elements, never HTML), cards and note search use `plainText()`. One reader config for both sides: `createMarked()` in `lib/richText.ts`. Server side: `App\Support\RichText` (one limit, word search `whereWords`, CSV `plain()`).
- Playback is one app-level player (`lib/player.tsx`, `components/Player.tsx`): its `<aside>` changes layout only by classes (side · bar · inline · float · bubble) — never move the stage, the iframe would reload and restart. A video plays inline over its window's `PlayerSpot` (one component for the video, course and gallery-video windows; `live` via the queue's `origin`); „pop out" pins it to the floating frame and closes the window, and a `ModalShell` that closes (`PlayerWindowScope`) closes the player when its own video was not popped out — a spot on a page (no window) still falls back to the frame; songs use the panel/bar and collapse to a bubble. `ModalShell` ignores clicks on `[data-player]`.
- Stats bars open the matching list: `lib/statsLinks.ts` builds the link from each list page's own URL params, and the list API applies `LibraryStats::drill()` (`done` · `watched` · `year_*` · `my_rating_*`, the same columns the bar counted). A new list module needs both sides.
- Modals are all `ModalShell`: height follows the content (`AutoHeight` measures layout height, never `getBoundingClientRect`), width follows the screen, the top edge stays put after opening. The body keeps a stable scrollbar gutter whose width is taken off its right padding — a full-bleed row uses `.fb-modal-bleed` (as `ModalFooter` does), never `-mx-6`, which would spill into the gutter.
- Look and feel: z-index only from `lib/layers.ts`; colours as CSS variables in both themes (`modules.color` → inline `--mod`, tool sections in `lib/toolSections.ts`); radius ≤ 5px through `@theme` (`rounded-full` only for avatars, switches and radios); no underlines; no focus rings; icon hover motion and colour live in `index.css`; edit buttons are `Button variant="edit"`; delete is one bordered family with an inverted hover — `destructiveOutline` with icon + text for rows, cards and sub-lists, filled `destructive` for confirmations and the photo overlay (never `ghost` + `text-destructive`); every control in an action row is `h-9` (`Button size="sm"`, `FavoriteButton`, `Badge size="row"`), counts inside buttons are `CountBadge` (drawn at 0 too), and whatever may be absent (rating badges, then the invisible link slot) sits at the start of the row; explanations go into an `i` (`InfoHint`), not paragraphs.
- Settings: `users.settings` through `SettingsProvider` with an explicit save; per-module settings in `module_user.settings`.
- Dates through `lib/dates.ts`, browser storage through `lib/storage.ts`, the clipboard through `lib/clipboard.ts`.
- i18n: every key in both `ka.json` and `en.json` (2-space JSON, CRLF); `GLOSSARY.md` fixes the Georgian vocabulary and the audit bans retired words.
- Tests: Vitest + jsdom with `react-dom/client` + `act()`; shared mocks through `vi.hoisted`; a mocked context hook must return the same object on every call.

## Gotchas

- Laravel caches the controller on the route, so instance state survives into the next request in tests (and under Octane): key per-request memos on the `Request`, and resolve services per measurement in perf tests.
- sqlite (tests) vs MySQL: guard MySQL-only DDL; sqlite reads an unknown double-quoted identifier as a string literal, so a mistyped column silently matches nothing; a `date` cast is written as `Y-m-d H:i:s`, so `between` drops the last day — store `Y-m-d` (`DutyShift::setDateAttribute`); compare Georgian text in PHP, not SQL.
- `Http::fake()` appends stubs — a second call changes nothing; keep one stub and vary its data.
- A Georgian value in a JSON column is stored escaped (`\u10d8…`), so a `LIKE` on it needs the escaped form or a PHP comparison.
- On the model use `isSuperAdmin()`; `is_super_admin` exists only on `UserResource`.
- Never name a column `hidden`, `visible`, `casts`, `attributes`, `table` or `connection`.
- Multipart updates are `POST` + `_method=PUT`.
- A missing i18n key renders the raw key silently — run the audit.
- When removing a shared constant or trait, grep its old name repo-wide: PHP resolves it only when the line runs.
