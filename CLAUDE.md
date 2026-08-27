# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mediary — personal bilingual (Georgian/English) movie catalog. Monorepo:
- `backend/` — **Laravel 11 JSON API** (PHP 8.3, MySQL). No views; API only.
- `frontend/` — **React 18 + TypeScript SPA** (Vite, Tailwind v4, Radix/shadcn-style UI, TanStack Query, react-i18next).
- `Tasks.md` (repo root) — **the single source of current work; read it before starting.**

No authentication (single personal user).

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
- `php artisan migrate` / `php artisan migrate:fresh --seed` — schema / reset+seed (seeds bilingual genres)
- `php artisan db:seed --class=GenresSeeder` — reseed the 19 TMDB genres (ka/en)
- `php artisan test` — PHPUnit tests · `./vendor/bin/pint` — format
- `php artisan tinker` — REPL. **Georgian text: pass via heredoc (stdin), never via curl `-d` args** — the Windows console mangles UTF-8 in argv to `?`.

Frontend (`frontend/`):
- `npm run dev` · `npm run build` (runs `tsc -b` typecheck then Vite build) · `npm run lint`
- Verify changes with `npm run build` + API curls. **Do not use Playwright/screenshots** (user preference).

## Architecture

**Data model** (`backend/app/Models`): `Movie` and `Series` are parallel domains. Both link to shared `Genre` / `CastMember` via **polymorphic** pivots `genreables` / `castables` (morph aliases `movie`/`series` registered in `AppServiceProvider::enforceMorphMap`; pivot carries `character`, `billing_order`). Bilingual text lives in per-entity translation tables (`movie_translations`, `series_translations`) surfaced via accessors (`title_ka`/`title_en`, `description_ka`/`description_en`) so the API shape stays flat; genres/cast have their own translation tables. `status` enum = `undecided|to_watch|watching|watched`; `is_favorite`; `sync_status`. **Movies have franchise/collection** (`tmdb_collection_id`, `franchise_next` badge, clustering); **series do not** (TMDB TV has no `belongs_to_collection`) but add `seasons`/`episodes`. A third domain `anime` can be added on the same polymorphic base + morph alias.

**API** (`backend/routes/api.php`, controllers in `app/Http/Controllers/Api`): REST under `/api` — `movies` and `series` each have CRUD, `PATCH .../status`, `PATCH .../favorite`, `POST .../resync`, `POST .../from-tmdb`, `POST .../bulk-status` (movies also `GET .../collection`). Shared endpoints take a `type=movie|series` param: `POST /lookup/candidates`, `POST /lookup`, `GET /discover`. `GET /cast/{id}` returns both `movies`/`series` (+ `suggestions`/`series_suggestions`); `GET /genres`. Responses shaped by `app/Http/Resources` (`MovieResource`/`SeriesResource`, …) and return **both languages**; the frontend picks per selected language.

**Frontend media domains** — `frontend/src/lib/media.ts` defines `MediaType` (`movie|series`) + a descriptor (api/route bases); `api/media.ts` exposes `createMediaApi` + `mediaApi(type)` and the shared `type`-parameterized calls. Pages (`LibraryPage`/`MoviePage`/`MovieFormPage`) take a `type` prop wired in `App.tsx` routes (`/` = movies, `/series` = series); `MovieCard`/`MovieGrid`/`DiscoverModal`/`ui/queue`/`ActorPage` are all media-type-aware. `api/movies.ts` is a thin backward-compat shim over `media.ts`. Adding `anime` = one entry in `MEDIA` + routes + morph alias.

**TMDB enrichment** — the core feature (`app/Services`):
- `Tmdb/TmdbClient` — find-by-imdb, search, details, credits.
- `Media/MediaDownloader` — downloads poster (`w500`) + cast photos (`w185`) to `storage/app/public/{posters,actors}` (served via `/storage/...`, needs `php artisan storage:link`).
- `Enrichment/MovieEnricher` — orchestrates. `candidates()` returns a pick-list (avoids wrong auto-match); `draftFromId()`/`lookupDraft()` build a non-persisted draft for form prefill; `enrichMovie()` downloads media, fills **only empty fields** (never overwrites user data), and syncs genres (matched by **slug**) + cast.
- Requires `TMDB_API_KEY` in `backend/.env`. `ANTHROPIC_API_KEY` is for planned KA↔EN auto-translation.

**Frontend flow** (`frontend/src`): `api/movies.ts` (axios) → TanStack Query in `pages/` (`LibraryPage`, `MoviePage`, `MovieFormPage`). Add/edit form has a "quick fill" lookup: type a ge.movie/IMDb link or title → `/lookup/candidates` → user picks → `/lookup` (by `tmdb_id`) prefills → on save the movie is created then auto-`resync`ed to download media. Translatable content (title/description/genres) lives in a card with a per-card KA/EN toggle (`ContentLangToggle`); non-translatable data (poster, year, rating, IMDb, status, favorite) sits in a static box.

## Gotchas

- **PHP cURL has no CA bundle on Windows** → HTTP calls use `->withOptions(['verify' => storage_path('cacert.pem')])` (bundle committed at `backend/storage/cacert.pem`). Keep this on any new outbound `Http` call (TMDB, images, future Claude).
- **Frontend updates use `POST` + `_method=PUT`** (multipart-safe method spoofing) — see `updateMovie` in `api/movies.ts`.
- **Genres are keyed by `slug`** across manual entry and TMDB sync, so `firstOrCreate(['slug' => …])` (not by `tmdb_id`) avoids duplicate-slug violations.
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
