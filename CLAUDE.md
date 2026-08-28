# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mediary — personal bilingual (Georgian/English) movie catalog. Monorepo:
- `backend/` — **Laravel 13 JSON API** (PHP 8.3, MySQL). No views; API only.
- `frontend/` — **React 18 + TypeScript SPA** (Vite, Tailwind v4, Radix/shadcn-style UI, TanStack Query, react-i18next).
- `Tasks.md` (repo root) — **the single source of current work; read it before starting.**

**Multi-user since I7**: Sanctum cookie auth, per-user libraries, pluggable modules, super-admin panel. Design doc: `docs/I7-multi-tenancy-and-modules.md`.

## Run (dev) — three processes, in this order

```bash
# 1. MySQL — the database now lives in XAMPP (C:\xampp\mysql\data\mediary).
#    Run XAMPP's mysqld directly (or via the XAMPP Control Panel). Do NOT also start WAMP's
#    MySQL — both use port 3306 and whichever binds it first hides the other's data.
"C:/xampp/mysql/bin/mysqld.exe" --defaults-file="C:/xampp/mysql/bin/my.ini"
#    A SQL backup of the DB is committed at backend/mediary_backup.sql

# 2. Backend API  → http://localhost:8000
cd backend && php artisan serve --port=8000

# 3. Frontend SPA → http://localhost:5173
cd frontend && npm run dev
```

Root DB is `mediary`, user `root`, no password, `127.0.0.1:3306`.

## Common commands

Backend (`backend/`):
- `php artisan migrate` / `php artisan migrate:fresh --seed` — schema / reset+seed (seeds bilingual genres **+ modules**)
- `php artisan db:seed --class=GenresSeeder` — reseed the 19 TMDB genres (ka/en) · `--class=ModulesSeeder` — reseed the `movie`/`series` modules
- `php artisan mediary:bootstrap-admin --name= --email= --username= --password=` — create the first super-admin (`--promote` upgrades an existing account). **Run before `migrate` on a DB that already has records** — the ownership migration attaches them to that account.
- `php artisan test` — PHPUnit tests · `./vendor/bin/pint` — format
- `php artisan tinker` — REPL. **Georgian text: pass via heredoc (stdin), never via curl `-d` args** — the Windows console mangles UTF-8 in argv to `?`.

Frontend (`frontend/`):
- `npm run dev` · `npm run build` (runs `tsc -b` typecheck then Vite build) · `npm run lint`
- Verify changes with `npm run build` + API curls. **Do not use Playwright/screenshots** (user preference).

## Architecture

**Data model** (`backend/app/Models`): `Movie` and `Series` are parallel domains. Both link to shared `Genre` / `CastMember` via **polymorphic** pivots `genreables` / `castables` (morph aliases `movie`/`series` registered in `AppServiceProvider::enforceMorphMap`; pivot carries `character`, `billing_order`). Bilingual text lives in per-entity translation tables (`movie_translations`, `series_translations`) surfaced via accessors (`title_ka`/`title_en`, `description_ka`/`description_en`) so the API shape stays flat; genres/cast have their own translation tables. `status` enum = `undecided|to_watch|watching|watched`; `is_favorite`; `sync_status`. **Movies have franchise/collection** (`tmdb_collection_id`, `franchise_next` badge, clustering); **series do not** (TMDB TV has no `belongs_to_collection`) but add `seasons`/`episodes`. A third domain `anime` can be added on the same polymorphic base + morph alias.

**API** (`backend/routes/api.php`, controllers in `app/Http/Controllers/Api`): REST under `/api` — `movies` and `series` each have CRUD, `PATCH .../status`, `PATCH .../favorite`, `POST .../resync`, `POST .../from-tmdb`, `POST .../bulk-status` (movies also `GET .../collection`). Shared endpoints take a `type=movie|series` param: `POST /lookup/candidates`, `POST /lookup`, `GET /discover`. `GET /cast/{id}` returns both `movies`/`series` (+ `suggestions`/`series_suggestions`); `GET /genres` (+ `GET|POST /genres/{genre}/items` — list/attach/detach/move/replace the records linked to a genre); `POST /media/sync/plan` + `POST /media/sync/{type}/{id}` (bulk sync, one item per request). Account/admin surface: `POST /auth/{register,login,logout}`, `GET /auth/me`, `PATCH /auth/{profile,password}`, `PUT /auth/settings`, `GET /modules`, `GET|POST|DELETE /requests…`, and `/admin/{users,modules,requests}` behind `super_admin`. Responses shaped by `app/Http/Resources` (`MovieResource`/`SeriesResource`, …) and return **both languages**; the frontend picks per selected language.

**Auth & multi-tenancy (I7)** — Sanctum **SPA cookie** mode (`$middleware->statefulApi()`, `SANCTUM_STATEFUL_DOMAINS`, `cors.supports_credentials=true`; axios uses `withCredentials`+`withXSRFToken` and hits `/sanctum/csrf-cookie` before login). Every `/api` route sits behind `auth:sanctum` except `/health` and `/auth/{register,login}`. Ownership is **per-user rows**: `movies.user_id`/`series.user_id` + the `BelongsToUser` trait (global scope `owner` + auto-fill on create), so every existing query, `withCount`, and route-model binding scopes itself — another user's record is a **404**. Policies (`MoviePolicy`/`SeriesPolicy`) are the second layer; `Gate::before` lets a super-admin pass any policy but the `owner` scope still applies to them (admin data access is only via `/api/admin/*`, which uses `withoutGlobalScope('owner')` explicitly). **`genres`/`cast_members` stay global** (shared dictionaries). ⚠️ CLI has no `Auth::id()`, so the scope is off there — `media:redownload --user=` exists for that.

**Modules (I2/I3)** — `modules` table (`key`, names ka/en, `icon`, `route_base`, `api_base`, `morph_alias`, `is_sensitive`, `enabled_by_default`, `is_active`) + `module_user` pivot. `movie`/`series` are the first two entries (`ModulesSeeder`). Routes are grouped behind `module:movie` / `module:series` / `module:@type` (the last reads the `type` param for shared endpoints). Frontend nav and routes are built from `GET /api/modules` (`lib/modules.tsx` → `ModulesProvider`/`useModules`), so a disabled module has **no menu entry and no route**; `lib/media.ts` still supplies the static descriptor for domains that use the generic pages. Recipe for adding a module: `docs/I7-multi-tenancy-and-modules.md` §7.3.

**Videos module (I5)** — the first non-media module and the proof of the recipe: `videos` table (`BelongsToUser`), `VideoController`, `VideoPolicy`, routes behind `module:video`. `App\Support\VideoUrl` recognises YouTube / Vimeo / Dailymotion / direct file and builds the embed itself — **raw HTML/embed markup is never stored**; `VideoEmbed.tsx` re-checks the host against the same allowlist and sandboxes the iframe. Adult entries live in the same table behind a **separate sensitive module** `video_adult`: without it they are invisible (404) and cannot be created (403), and `User::hasModule()` deliberately does **not** hand sensitive modules to a super-admin automatically. Consent is stored in `module_user.settings.consent_at` (`PUT /api/modules/{key}/settings`); an uploaded thumbnail for an adult entry goes to the **private** disk and is served only through `GET /api/videos/{id}/thumb`. Frontend registration for a non-media module is two lines: `PAGE_MODULE_KEYS` (`lib/modules.tsx`) + `MODULE_PAGES` (`App.tsx`).

**Approvals (`approval_requests`)** — registration is open but a new account starts empty: the user asks for modules on `/modules` and a super-admin approves on `/admin`. Genres are global, so a non-admin's `DELETE /genres/{id}` returns **202 + a pending request** instead of deleting (super-admin deletes directly). Both flows share one table and `AdminRequestController::approve()`; the genre side runs through `Services/Genres/GenreRemover`, which counts/reassigns across **all** users.

**Settings** — `frontend/src/lib/settings.tsx` (`SettingsProvider` + `useSettings()`) now persists per-user in `users.settings` (`PUT /api/auth/settings`, debounced 400ms) with localStorage as a local cache and as the one-time migration source from the old single-user state.

**Frontend media domains** — `frontend/src/lib/media.ts` defines `MediaType` (`movie|series`) + a descriptor (api/route bases); `api/media.ts` exposes `createMediaApi` + `mediaApi(type)` and the shared `type`-parameterized calls. Pages (`LibraryPage`/`MoviePage`/`MovieFormPage`) take a `type` prop; `App.tsx` generates those routes **per enabled module** (`/` = movies, `/series` = series) and wraps everything in `Protected`/`ModulesProvider`; `MovieCard`/`MovieGrid`/`DiscoverModal`/`ui/queue`/`ActorPage` are all media-type-aware. `api/movies.ts` is a thin backward-compat shim over `media.ts`. Adding `anime` = one entry in `MEDIA` + routes + morph alias.

**TMDB enrichment** — the core feature (`app/Services`):
- `Tmdb/TmdbClient` — find-by-imdb, search, details, credits.
- `Media/MediaDownloader` — downloads poster (`w500`) + cast photos (`w185`) to `storage/app/public/{posters,actors}` (served via `/storage/...`, needs `php artisan storage:link`).
- `Enrichment/MovieEnricher` — orchestrates. `candidates()` returns a pick-list (avoids wrong auto-match); `draftFromId()`/`lookupDraft()` build a non-persisted draft for form prefill; `enrichMovie()` downloads media, fills **only empty fields** (never overwrites user data), and syncs genres (matched by **slug**) + cast.
- `Sync/ItemSyncer` — **bulk** sync of one existing record: the caller picks which `fields` to refresh and the mode (`overwrite` vs only-empty), plus `media` + `only_missing` (skips items whose poster/photos are all on disk without touching TMDB). Drives `POST /media/sync/{type}/{id}`; the loop lives in the frontend queue so `artisan serve` never blocks. CLI equivalent: `php artisan media:redownload [--type=] [--missing]`.
- Requires `TMDB_API_KEY` in `backend/.env`.
- **KA text comes from TMDB, not from a translator**: `TmdbClient` methods take a `$language` param and `App\Support\Lang::georgian()` keeps the response only if it actually contains Mkhedruli (TMDB silently falls back to the original language). `Services/Translation/Translator` is effectively dead without `ANTHROPIC_API_KEY` — its free Google fallback now returns 429 — so it is no longer called from discover/cast/sync.

**Frontend flow** (`frontend/src`): `api/movies.ts` (axios) → TanStack Query in `pages/` (`LibraryPage`, `MoviePage`, `MovieFormPage`). Add/edit form has a "quick fill" lookup: type a ge.movie/IMDb link or title → `/lookup/candidates` → user picks → `/lookup` (by `tmdb_id`) prefills → on save the movie is created then auto-`resync`ed to download media. Translatable content (title/description/genres) lives in a card with a per-card KA/EN toggle (`ContentLangToggle`); non-translatable data (poster, year, rating, IMDb, status, favorite) sits in a static box.

## Gotchas

- **PHP cURL has no CA bundle on Windows** → HTTP calls use `->withOptions(['verify' => storage_path('cacert.pem')])` (bundle committed at `backend/storage/cacert.pem`). Keep this on any new outbound `Http` call (TMDB, images, future Claude).
- **Frontend updates use `POST` + `_method=PUT`** (multipart-safe method spoofing) — see `updateMovie` in `api/movies.ts`.
- **Genres are keyed by `slug`** across manual entry and TMDB sync, so `firstOrCreate(['slug' => …])` (not by `tmdb_id`) avoids duplicate-slug violations.
- **`imdb_id` is unique per user**, not globally (`unique(user_id, imdb_id)`) — two accounts must be able to add the same film.
- **Never name a column `hidden`** (or `visible`, `casts`, `attributes`, `table`, `connection`…): those are protected properties on `Model`, so `$model->pivot->hidden` read from *inside another Model subclass* returns the protected array, not the column — silently, no error. `module_user.is_hidden` is named that way for this reason.
- **Tests run on sqlite `:memory:`** (`phpunit.xml`), which has no FULLTEXT and no `ALTER … MODIFY`: those migration statements are wrapped in a `getDriverName() === 'mysql'` check. Keep new MySQL-only DDL guarded the same way.
- **`/storage/*` is served without auth** — fine for TMDB posters, but a future sensitive module (I5) needs a private disk + a policy-checked route.
- **Path alias** `@/` → `frontend/src` (no `baseUrl`; `paths` only, per the TS version). Radix component wrappers live in `src/components/ui`.
- TMDB search is English/Latin only — Georgian titles won't match; rely on the candidates picker, the ge.movie link (Latin slug), or (planned) Claude translation.

## Tasks

Current backlog and priorities live in `Tasks.md` (repo root). **Read it at the start of every session** and keep it updated (`[x]` when done).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
