# Recon — profile-and-visibility

Area: `/profile` layout, the modules-visibility modal, the record-visibility modal, and the gallery's place in them.
Branch: `improve/gallery-and-bulk-delete`. The album-lock work (§ request 4) is **uncommitted in the working tree** — read there, not in git history.

---

## 0. What exists today (files + line numbers)

### Frontend

| File | Lines | Role |
|---|---|---|
| `frontend/src/pages/ProfilePage.tsx` | 263 | section order: back-link → `PageHeader` → **info form** (133–193) → `<PublicProfileCard />` (196) → `<StorageCard />` (203) → `<WebQuotaCard />` (209) → **password form** (212–260) |
| `frontend/src/components/PublicProfileCard.tsx` | 145 | one `<section>`; layer 1 profile switch (82–93), share link (96–107), **layer 2 module switch list (110–136)**, then `<VisibilityManager />` (142) |
| `frontend/src/components/VisibilityManager.tsx` | 340 | layer 3. Domain **chips** (194–200), search + all/public/private chips (203–229), bulk bar (232–267), list (275–310), pager (313–330) |
| `frontend/src/components/ui/scope-card.tsx` | ~105 | **`ScopeCard` + `ScopeGroup`** — the card-tab primitive already used by `/audit`, `/requests`, `/status`, `/purge` and the gallery |
| `frontend/src/components/gallery/GalleryScope.tsx` | ~115 | gallery's map on top of `ScopeCard`; `GalleryScopeOption` already has `node?: ReactNode` (for a `<ModuleIcon>`) and `color?: string \| null` |
| `frontend/src/components/ModuleIcon.tsx` | `ModuleIcon` at L56 | lucide-name string → component; used by `Sidebar` and `PageHeader` |
| `frontend/src/lib/modules.tsx` | `modAccent()` L101, `MODULE_ACCENT_FALLBACK` L115, `moduleName()` L122 | colour → inline `--mod`/`--mod-soft`; **Tailwind cannot build a class from a hex** |
| `frontend/src/components/ui/modal-shell.tsx` | stack at L~50–90 | module-level `stack` + `useSyncExternalStore` + `useLayoutEffect`; only the top modal is visible, the lower one is **hidden with CSS, still mounted**; `nested` auto-draws the back arrow |
| `frontend/src/api/publicProfile.ts` | `PUBLIC_DOMAINS` L19, `DOMAIN_MODULE` L41, `fetchVisibilityList` L252, `setDomainVisibility` L264, `setRecordVisibility` L219 | the frontend mirror of `PublicDomain::DOMAINS` |
| `frontend/src/pages/PublicProfilePage.tsx` | domain tabs at L211–220 | also plain `Chip`s (not in scope, but the same visual question) |

### Backend

| File | Key lines | Role |
|---|---|---|
| `backend/app/Support/PublicDomain.php` | `DOMAINS` L47–58, `card()` L~215+, `SEARCH`, `MATCH` | **10 domains: movie · series · anime · game · book · board_game · video · song · playlist · bookmark. NO `gallery`.** |
| `backend/app/Http/Controllers/Api/VisibilityController.php` | `index()` L42, `bulk()` L~100, `update()` L~135, `guard()` L~170 | `GET/PATCH /visibility/{domain}` + `PATCH /visibility/{domain}/{id}`; `guard()` does `hasModule()` + `hasPermission()` by hand (no `module:@type` middleware, because `playlist` is not a module) |
| `backend/app/Services/Profile/PublicProfileService.php` | `domains()`, `query()`, `stats()` | three layers; `withoutGlobalScope('owner')` + explicit `user_id` |
| `backend/app/Http/Controllers/Api/PublicProfileController.php` | `show()`, `items()` | the only two **unauthenticated** domain endpoints |
| `backend/app/Http/Controllers/Api/ModuleController.php` | L47–49, L99 | `$m->shareable = (bool) PublicDomain::forModule($m->key)`; `PUT /modules/{key}/public` → 422 `module_not_shareable` |

---

## 1. Request 1 — password block above the public-profile block

Pure ordering in `ProfilePage.tsx`. Move the `<form onSubmit={savePassword}>` JSX block (currently **212–260**) so it renders **between** the info form (ends 193) and `<PublicProfileCard />` (196).

Two real details:
- The password form currently has `className="rounded-xl border border-border bg-card p-5"` with **no `mb-6`** (it is last). Moving it up needs `mb-6` added, or it will butt into the card below.
- Nothing else depends on the order — `pw`/`pwErrors`/`pwBusy` state and `savePassword` already sit above the return.
- No i18n change. No backend change.

Effort: **S**.

---

## 2. Request 2 — module visibility as a button + modal

Today layer 2 is an inline list of `<Switch>` rows in `PublicProfileCard.tsx:110–136`, driven by `useModules().enabled.filter(m => m.shareable)` and `setModulePublic(key, next)` (`@/api/publicProfile`), with `qc.invalidateQueries({queryKey:['modules']})` afterwards.

Plan:
1. New `frontend/src/components/PublicModulesDialog.tsx` — `ModalShell` + the exact same rows, moved (not copied). It should carry a `ModuleIcon` + module colour per row so it reads like the rest of the app (`modAccent(m.color)`, `MODULE_ACCENT_FALLBACK`).
2. `PublicProfileCard.tsx` keeps a summary row: label `publicProfile.modules` on the left, a right-hand button ("N of M public" / `actions.manage`) that opens the dialog.
3. `toggleModule` moves into the dialog (it owns `busy`), but the **`disabled={!isPublic}`** rule must survive: while the profile itself is private, the module switches are dead. Either keep the button enabled and say so inside, or disable the button — decide, don't silently drop the rule.
4. Modal rules that apply: state and the portal JSX must live in the **same component** (`GroupsCut` live bug — here trivially true, one return branch, but `PublicProfileCard` does `if (!user) return null` at L37, so the dialog JSX must be after that guard, which it is). `ModalShell` handles nesting/back arrow itself.
5. i18n: new keys in **both** `ka.json` and `en.json`, 2-space JSON, CRLF. Existing usable keys: `publicProfile.modules`, `publicProfile.modulesHint`, `publicProfile.noShareable`. Needed new: a count line and the button label (or reuse `actions.manage` if present).

Effort: **M**. Backend: none.

---

## 3. Request 3 — record visibility into a modal, card tabs, + GALLERY

### 3a. Modal + card tabs (straightforward)

`VisibilityManager` already is a self-contained block with its own state. Wrap it: `PublicProfileCard` renders a summary row + button; the button opens `ModalShell` (use `size="wide"`, the manager is a list with a bulk bar and a pager).

The domain **chips** (`VisibilityManager.tsx:194–200`) become cards. **Reuse `ScopeCard`/`ScopeGroup` from `@/components/ui/scope-card.tsx`** — do not write a new card. It already takes `icon: ReactNode`, `color`, `label`, `count`, `active`, `onClick` and handles the zero-count dimming, the inline `--mod` colour and the active mark.

- icon: `<ModuleIcon name={module.icon} className="size-4 text-[var(--mod)]" />` (same as `Sidebar`/`PageHeader`)
- colour: `module.color` from `useModules()` (gallery's seeded colour is `#a855f7`, `ModulesSeeder.php:31`)
- count: the manager already knows `meta.total`/`meta.public`/`meta.private` **only for the active domain**. A card per domain with a number needs either a per-domain count endpoint or `count` left `undefined` (`ScopeCard` supports that — it then draws `hint` or nothing). **Recommended: leave `count` undefined for now**, or add a `counts` facet to `GET /visibility/{domain}`-style summary. Do not fake a 0.
- `playlist` has no module icon of its own — `domainLabel()` already special-cases it (`t('playlists.title')`); give it a lucide icon explicitly.

The user says "movies / series / anime" — but the tabs are actually **all ten** `PUBLIC_DOMAINS` filtered by `shareable && can(key,'view')`. Card-style is fine for ten.

### 3b. "GALLERY must be there too" — the honest answer

**This is the part that is genuinely new and needs a decision.**

Hard facts read from the code:

1. `gallery_images` has **no `visibility` column**. A photo inherits its parent's visibility (documented design). `GalleryImage` (`backend/app/Models/GalleryImage.php`) has `BelongsToUser`, `StoredFile`, an `album()` belongsTo and the `album_lock` global scope — nothing about visibility.
2. `gallery_albums` (migration `…_create_gallery_albums…`, re-read above) has: `id, user_id, name, description, sort_order, timestamps` + the uncommitted `password_hash`. **No `visibility` column either.**
3. `gallery` is **not** in `PublicDomain::DOMAINS`, so `PublicDomain::forModule('gallery')` is `[]` → `ModuleController.php:49` sets `shareable = false` → the gallery module **does not even appear** in the layer-2 module list on `PublicProfileCard`, and `PUT /modules/gallery/public` returns 422 `module_not_shareable` (`ModuleController.php:99`).
4. `PublicProfileService::domains()` can therefore never return a gallery domain, and `PublicProfileController::items()` 404s for one.
5. **Nothing from `gallery_images` is rendered on a public profile at all today.** The only image a public card carries is `PublicDomain::card()`'s `'image' => $record->poster_path` / `cover_path` / `cover_url`.

So "gallery in the visibility manager" can only mean one of:

- **(A) Albums as a public domain.** Add `visibility` to `gallery_albums`, add `'gallery_album' => ['model' => GalleryAlbum::class, 'module' => 'gallery']` to `PublicDomain::DOMAINS`. This is the honest reading and the only one with a row to toggle.
- **(B) Do nothing on the backend and just show the gallery tab read-only** ("photos follow their record"). Cheap, honest, no schema change — but it is a tab that toggles nothing, which the project's own rule says not to draw ("a control that lies is not drawn").
- **(C)** Per-photo visibility — **reject**. It contradicts the documented inheritance rule and would add a `visibility` column to a polymorphic table whose parents already carry one; two sources for one fact.

If (A) is chosen, the cascade is real and every item is load-bearing:

- `RegistryConsistencyTest::test_every_visibility_table_is_a_public_domain_or_deliberately_excluded` (`backend/tests/Feature/RegistryConsistencyTest.php:216–238`) **fails** the moment `gallery_albums.visibility` exists unless the domain is registered or the table is added to `$excluded` (currently only `note_entries`).
- `PublicDomain::MATCH` — must **not** get an entry (an album has no global identity; same reasoning as `playlist`). `matchable()` is derived from `MATCH`, so absence is enough. `MatchService` then ignores it.
- `PublicDomain::SEARCH` — `['relation' => null, 'columns' => ['name']]` (like `playlist`).
- `PublicDomain::card()` — a new `match` arm; the card should carry `name`, `photos` count, and **`locked`**. It must **not** carry a preview path for a locked album (see §4).
- `PublicProfileService::query()` — works as-is (generic), but albums need `withCount('images')` the way `playlist` gets `withCount('songs')`, and that count must be taken with `withoutGlobalScope('album_lock')` only if we decide locked counts stay honest publicly (probably **not** — see §4).
- Frontend: `PUBLIC_DOMAINS` + `DOMAIN_MODULE` in `frontend/src/api/publicProfile.ts` (L19/L41), plus `PublicCard`'s shape.
- `ModuleController.php:49` then makes `gallery` shareable → the gallery gets a layer-2 switch too, and `PUT /modules/gallery/public` starts working.
- `VisibilityController::guard()` calls `$user->hasModule('gallery')` + `hasPermission('gallery', …)` — the gallery module does have CRUD permissions, so this works.
- `FieldSettings::hiddenOnPublic($user, 'gallery')` is called by `PublicProfileController::items()` — harmless (no `FieldCatalog` entries for gallery) but worth a glance.

Effort: 3a **M**, 3b option A **L**.

---

## 4. Request 4 — the album lock: what is ALREADY guaranteed

**Almost all of it is already built** (uncommitted, 2026-09-16). Concretely:

### Already done

| Guarantee | Where |
|---|---|
| `gallery_albums.password_hash` nullable, `Hash::make()`, **one column** (locked ⟺ hash exists) | `backend/database/migrations/2026_09_16_000001_add_password_to_gallery_albums.php` |
| `password_hash` in `$hidden` on the model; `row()` never writes it | `backend/app/Models/GalleryAlbum.php` |
| **Global scope `album_lock` on `GalleryImage`** — a locked album's photos are never in any response | `backend/app/Models/GalleryImage.php:51–67` |
| The `NULL NOT IN (…)` trap handled (`whereNull(album_id) OR whereNotIn(...)`) | same, L62–65 |
| Memo keyed on `user + unlocked ids`, `flush()` on change, cleared in `TestCase::setUp()` | `backend/app/Support/AlbumLock.php` (`$memo`, `hiddenIds()`) |
| Session-based unlock, `hasSession()` guard (never a 500 on non-stateful `/api`) | `AlbumLock::session()`, `SESSION_KEY = 'gallery.unlocked_albums'` |
| **423 `album_locked`** on both ways into an album (`owner=album:N` and `album_id=N`) | `GalleryController::assertAlbumOpen()` L688–693 |
| Previews skipped for a locked group — not even a thumbnail path leaves | `GalleryController::albumGroups()` ~L660 |
| Unlock endpoint behind **`throttle:album-unlock` (10/min per user *and* album)** | `routes/api.php:646–648`; `AppServiceProvider::rateLimiters()` L168–177 |
| Changing/removing the password requires `current_password` unless already unlocked this session | `GalleryAlbumController::update()` |
| **Deleting a locked album is 423** (deletion returns photos to `album_id = null` = full bypass) | `GalleryAlbumController::destroy()` L179 |
| Counts stay honest (`withoutGlobalScope('album_lock')` in `imagesCount()`), so a locked card still says "12 photos" | `GalleryAlbumController::imagesCount()` L233 |
| Deletion/quota/dedupe paths **explicitly opt out** so a hidden photo still gets deleted with its record and its quota released | `HasGallery.php:52`, `PurgeService.php:409/502/572/712`, `GalleryFetcher.php:427/433`, `WebImageImporter.php:71/77` |
| Blurred surface is a **CSS gradient with no file underneath** | `frontend/src/components/ui/photo-stack.tsx:144–166` (`locked` prop) |
| Unlock dialog (server-checked, no client token), distinguishes `album_password_wrong` from 429 | `frontend/src/components/gallery/AlbumUnlockDialog.tsx` |
| Lock block inside the album edit modal | `frontend/src/components/gallery/AlbumDialog.tsx` |
| 34 `gallery.album*` i18n keys present in **both** locales | `frontend/src/i18n/{ka,en}.json` |
| Tests | `backend/tests/Feature/GalleryAlbumTest.php` (`lockedAlbum()` L319, 423 assert L381, "deleting the record still deletes a locked photo" L477) |

**So the devtools part of request 4 is already satisfied for the owner's authenticated session**: a locked album's `path` never appears in any JSON, so there is nothing to un-blur in the inspector. The blur is genuinely empty.

### Still open / genuinely new

1. **The public (unauthenticated) path does NOT respect the lock.**
   `AlbumLock::hiddenIds()` starts with `$userId = Auth::id(); if (! $userId) return [];` — **no user, no hidden ids, scope is a no-op.**
   Harmless today only because nothing public reads `gallery_images`. **The moment request 3 puts the gallery/albums on the public profile, a locked album would be fully visible to every stranger.**
   Also: a visitor's session unlock is meaningless — `hiddenIds()` keys the locked set off `Auth::id()`, i.e. the *owner's* id. A stranger cannot be "the owner with an unlocked session".
   **Recommended rule (simplest, and it matches the feature's intent): a locked album can never be public.** Enforce it on the server, not in the UI — `PublicProfileService::query()` for the album domain adds `whereNull('password_hash')`, and `VisibilityController::update()`/`bulk()` refuse to set `visibility = 'public'` on a locked album (422). Then `hiddenIds()` needs no change at all.
   If instead locked albums *may* be public-with-a-password, `hiddenIds()` must take the **profile owner's id as an argument** rather than reading `Auth::id()`, and the visitor unlock has to be its own session key per (owner, album) — considerably more work, and a password typed by a stranger is a different security model.

2. **`poster_path` is a leak path that the scope cannot see.** "Make main" points `movies.poster_path` (etc.) at a `gallery_images.path`. The `album_lock` scope is on the `GalleryImage` **model**, not on the poster column — so a photo that sits in a locked album *and* is a record's primary poster still renders in the owner's own grids and, via `PublicDomain::card()`'s `'image' => $record->poster_path`, on the public profile. Not documented anywhere. Either block "move into a locked album" for a photo that is somebody's poster, or clear the poster on lock, or accept and document it.

3. **The file on the public disk is still reachable by a remembered URL.** CLAUDE.md already states this explicitly. Real closure = locked albums on the **private** disk (`StorageFolder::PRIVATE_FOLDERS`, the `videos/downloads` precedent) + a serving route + physically moving files on lock/unlock. That is a separate, bigger change — flag it, do not smuggle it in.

4. **`StorageMeter::files()` does not opt out** (verified: it is absent from the `withoutGlobalScope('album_lock')` grep). So locked photos vanish from `/profile`'s upload library while `storage_used_bytes` still counts them — list and total legitimately disagree. Intended, documented, but if request 3's modal ends up near `StorageCard` on the same page, expect the question.

---

## 5. Rules this work must not violate

- **Modal JSX must be rendered by every branch that can open it** (`GroupsCut` live bug; `AlbumsCut` shows the correct `const dialogs = (…)` pattern).
- **`ModalShell` owns the stack** — do not re-implement hide/show; nesting the visibility modal inside the profile page is fine, it hides nothing below it.
- **Colour travels as inline `style` via `modAccent()`, never as a Tailwind class** — a templated `` `border-[${hex}]` `` compiles to nothing.
- **Every new i18n key in both `ka.json` and `en.json`**, 2-space JSON, CRLF; run `python frontend/src/i18n/audit.py`.
- **A control that cannot work is not drawn** (`photoActions`' rule) — a gallery tab that toggles nothing is exactly that.
- **`RegistryConsistencyTest`** will catch a `visibility` column with no `PublicDomain` entry; it will not catch a domain added without a frontend `PUBLIC_DOMAINS` mirror.
- **`PATCH`, never `POST`**, for a visibility endpoint (`EnsureModulePermission` derives `create` from POST).
- **`PublicDomain::card()` is a narrow hand-built shape** — a field appears only when written explicitly; never hand it a resource.
- Two accounts' `visibility` bulk write already pins `->where('user_id', $user->id)` explicitly even with the `owner` scope on — keep that if a gallery domain is added.

---

## 6. Suggested order

1. Request 1 (S, zero risk) — move the password form up, add `mb-6`.
2. Request 2 (M) — `PublicModulesDialog`, keep the `!isPublic` rule.
3. Request 3a (M) — `VisibilityManager` into a modal, chips → `ScopeCard` + `ModuleIcon` + module colour; leave `count` undefined unless a facet endpoint is added.
4. **Decide 3b with the user** (albums as a public domain vs. a read-only gallery tab).
5. Request 4: only item (1) above is mandatory *and only if 3b/A is chosen*; items (2)–(4) are documentation/decisions, not silent code.
