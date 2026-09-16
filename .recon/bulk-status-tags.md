# recon: bulk-status-tags — /status, VideoBulkPanel, POST /videos/bulk

Date: 2026-09-16. Branch: improve/gallery-and-bulk-delete. Read-only recon; nothing was modified.

## 1. What exists today

### Pages / components (there is no MediaBulkPanel.tsx — it lives inside the page)

- `frontend/src/pages/StatusBulkPage.tsx` (258 lines)
  - `StatusBulkPage()` L36 — domain switcher built from `useModules()`: `mediaModules` (movie/series/anime) + the `video` module only. `ScopeCard`/`ScopeGroup` cards L88-L102; counts come from `GET /dashboard` (L57-L58, `countOf`).
  - `MediaBulkPanel({type})` L112 — **defined in the same file**, not a separate component. Two modes only: `type Mode = 'by_status' | 'specific'` (L25).
    - pool: `api.list({ all: true })` under queryKey `[type, 'bulk']` (L122) — one of the four legitimate `all=1` callers.
    - `affectedCount` L134-L139 is computed **client-side** from that pool (`movies.filter(m => m.status?.key === fromStatus).length`, or `ids.length`).
    - sends `api.bulkStatus({status, from_status})` or `{status, ids}` (L142-L147).
- `frontend/src/components/VideoBulkPanel.tsx` (252 lines)
  - `type Mode = 'by_type' | 'specific'` (L28), `NO_TYPE = '0'` (L30).
  - actions: `const actions: VideoBulkAction[] = ['type','tags_add','tags_remove']` (L117), rendered as a plain pill row L124-L143 — **not** `ScopeCard`, unlike the domain row above it and unlike `/audit`'s action cards.
  - pool: `fetchVideos({ all: true })` queryKey `['videos','bulk']` (L40-L43); `knownTags` derived from that pool L49-L52 and fed to `TagSelect`.
  - source scope UI L146-L209: exactly two radio options — `by_type` (a `Select` over `video_types` with per-type counts via `countOfType`, plus the „no type" row **only when `countOfType('0') > 0`**, L176-L180) and `specific` (`IdMultiSelect`).
  - `affectedCount` L64-L65 — again client-side, from the `all=1` pool.
  - mutation L73-L81: `{action, ...(mode==='specific' ? {ids} : {from_type_id: Number(fromType)}), ...(action==='type' ? {type_id} : {tags})}`.
  - ⚠️ dead branch at L79: `targetType === NO_TYPE ? null : Number(targetType)` — the target `Select` (L222-L226) no longer renders a `NO_TYPE` item (2026-09-16 rule), so `null` can never be produced there. Remove it when touching this file, or the rule looks half-applied.
- `frontend/src/components/MediaRecordPicker.tsx` (78 lines) — the „specific records" picker for **media domains only** (`types: MediaType[]`), one `OneDomain` per domain, pool under queryKey `['genre-attach-pool', type]` with `all: true`. **It is not used by `/status`**: `StatusBulkPage` uses `MovieMultiSelect` directly and `VideoBulkPanel` uses `IdMultiSelect` (`frontend/src/components/MovieMultiSelect.tsx` L14, domain-agnostic). If bulk grows a real scope object, those two are what to reuse.

### Backend

- `backend/app/Http/Controllers/Api/VideoBulkController.php` (122 lines), `POST /videos/bulk` (`backend/routes/api.php` L336, deliberately above `/videos/{video}`).
  - validation L23-L41: `action ∈ {type, tags_add, tags_remove}`; `ids[]`; `from_type_id` (nullable int, `0` = „no type"); `type_id` with `Rule::requiredIf(action === 'type')` + `Rule::exists('video_types','id')->where('user_id', …)` (the 2026-09-16 rule — a bulk run may no longer strip a type); `tags[] max:20`, `tags.* max:40`.
  - **scope selection L43-L51 — this is the whole limitation**:

    ```php
    if (! empty($data['ids']))             $query->whereIn('id', $data['ids']);
    elseif ($request->has('from_type_id'))  $from === 0 ? whereNull('type_id') : where('type_id', $from);
    else return 422 'აირჩიე ვიდეოები ან საწყისი ტიპი.';
    ```

    So: **ids OR one single type. No tag scope, no status scope, no „all", not even a multi-type list.**
  - L53-L56: empty `tags` on a tag action → 422 (a Georgian sentence, not a machine code).
  - loop L59-L71 saves **through the model** (`$video->save()`) so `AuditObserver` fires; only really-changed rows count into `updated`.
  - tag helpers L88-L121 go through `Video::normalizeTags()` / `Video::tagKey()` (`backend/app/Models/Video.php` L197-L230) — the single normalisation source; `tagKey()` is lowercase + whitespace-collapsed, which is why removal is case-insensitive.
- `POST /videos/bulk-status` (`routes/api.php` L339) → `VideoStatusController::bulkUpdate`, inherited from `backend/app/Http/Controllers/Api/RecordStatusController.php` L62-L96.
  - **⚠️ It has NO frontend caller.** `grep -rn "bulk-status" frontend/src` returns exactly one hit — `frontend/src/api/media.ts:75` (`mediaApi(type).bulkStatus`), and `mediaApi` covers movie/series/anime only. `StatusBulkPage`'s own header comment (L31) claims „ვიდეოები → სტატუსი, ტიპი და ტეგები", which is **not true**: `VideoBulkPanel` has no status action. Video status can only be changed one record at a time (`PATCH /videos/{video}/status`).
  - `RecordStatusController::bulkUpdate` has the same two-way scope: `ids` OR `from_status` (L77-L83), else `422 'scope_required'`.

### i18n

- `bulkVideo.*` — 22 keys, ka+en in sync: `whichLabel, modeByType, modeSpecific, fromTypePick, videosPick, actionLabel, targetTypeLabel, targetTypePick, typeNone, affected, done, subtitle, tagsAddLabel, tagsAddHint, tagsRemoveLabel, tagsRemoveHint, action_type, action_tags_add, action_tags_remove, confirm_type, confirm_tags_add, confirm_tags_remove`.
- `bulkStatus.*` — 15 keys: `manage, title, subtitle, whichLabel, modeByStatus, modeSpecific, fromStatusPick, moviesPick, targetLabel, targetPick, affected, apply, confirmTitle, confirmDesc, done`.
- ⚠️ `bulkVideo.action_*` / `confirm_*` are reached through a **dynamic key that breaks mid-segment** (`` t(`bulkVideo.action_${action}`) ``, VideoBulkPanel L106/L107/L140) — exactly the shape the i18n audit's third check (2026-09-11, §1.1) was added for. New `bulkVideo.scope_*` keys written the same way are covered; run `python frontend/src/i18n/audit.py`, add to both locales, write with `newline='\r\n'`.
- ⚠️ `bulkStatus.*` is worded movie-only (`whichLabel` = „რომელ ფილმებს?", `affected` = „შეიცვლება {{count}} ფილმი") although the panel also serves series and anime. The project's existing answer is a domain-suffixed key via `mediaKey()` (`frontend/src/lib/media.ts`).

## 2. The user's request mapped onto the code

Requested source sets for `tags_add` **and** `tags_remove` (and by symmetry for `type`):

| source set | exists today? | where it would come from |
|---|---|---|
| records that already have a given **tag** | **no** | `tags` JSON column; `whereJsonContains('tags', $t)` as in `VideoController::index` L45-L47, or the PHP `tagKey()` intersection in `PurgeService::recordIds()` L629-L642 |
| records of a given **type** | yes, but a **single** `from_type_id` | `type_id`; `VideoController::index` L49-L51 already accepts a comma list via `Controller::slugList()` |
| **specific** hand-picked records | yes (`ids`) | `IdMultiSelect` |
| **all** | **no** | must be its own mode — `PurgeService`'s rule is that an empty filter may never silently mean „everything" |
| by **status** (not asked for, but the domain has one since §6.4) | **no** | `statusKey()` scope + `Status::rule('video')` |

## 3. The API shape to build

The vocabulary already exists twice; do not invent a third:

- `backend/app/Services/Purge/PurgeService.php` L81-L98 `TARGET_MODES` — `video => ['ids','type','tag','status','all']`. That is **exactly** the set the user asked for.
- its typed frontend mirror `frontend/src/api/account.ts` L809-L826 `PURGE_TARGET_MODES` (`as const satisfies`), plus the computed `PurgeTargetWithType` / `PurgeTargetWithStatus` L837-L844.
- the scope-building `match` is `PurgeService::recordIds()` L582-L645. Note L629-L642: **tags are filtered in PHP**, because a Georgian tag sits JSON-escaped in the column (the `GlobalSearch::jsonLike()` trap).
- the „an empty filter is not `all`" validation is `backend/app/Http/Controllers/Api/Admin/AdminPurgeController.php` L165-L182 (`scope_required`, `mode_not_supported_for_target`).

Recommended body for `POST /videos/bulk` (backwards compatible):

```jsonc
{
  "action": "type|tags_add|tags_remove",   // unchanged
  "scope":  "ids|type|tag|status|all",     // NEW — explicit, no default
  "ids":       [1, 2],                     // scope=ids
  "type_ids":  [3, 4],                     // scope=type  (a list, not the single from_type_id; 0 = „no type")
  "scope_tags": ["music"],                 // scope=tag   ⚠️ name clash — see below
  "status":    "watched",                  // scope=status, validated by Status::rule('video')
  "type_id":   5,                          // action=type target (keep Rule::requiredIf)
  "tags":      ["meme"]                    // action=tags_* payload (unchanged name)
}
```

⚠️ **The one real shape trap: `tags` is already the action's payload.** Reusing it for the tag *scope* makes „add tag X to everything tagged Y" unsayable and silently self-referential. Rename one side (`scope_tags` above, or `target_tags` for the payload) — never overload. `PurgeService` has no such clash because it has no payload.

Keep `from_type_id` accepted for one release: it is what the shipped SPA sends and what `VideoModuleTest` L354 / L416 assert. Map it to `scope=type, type_ids=[n]`.

## 4. Counts before applying — yes, and here is the argument

- `/purge` is the project's own precedent: `plan()` → typed `DELETE` → per-item queue, with the load-bearing rule that `plan()` and `run()` share one query so *counted* and *deleted* cannot drift.
- Today the count exists but is computed **on the client** from the `all=1` pool (`VideoBulkPanel` L64-L65, `StatusBulkPage` L134-L139). That is honest only because the client holds every record.
- The moment the scope becomes `tag` or `status`, the client would have to re-implement `Video::tagKey()` normalisation and the status/role rules in TypeScript — a **second** definition of „which records are in scope". That is precisely the class of bug this repo keeps fixing (`PublicDomain::isDone()`, `NoteReminder::computeNextAt()`, `filterKey()`).
- A scope-based bulk edit with no server-side preview is the same danger class as `/purge`: „add a tag to everything" and „retag the wrong 300 videos" are both irreversible in practice; the only difference from a delete is that the damage is quieter.
- Therefore: **`GET /api/videos/bulk-preview?scope=…` returning `{count, sample[]}`**, sharing one private `scopeQuery()` with `update()` so the two can never disagree.
  - ⚠️ It must be a **GET**. A POST whose last segment is `preview`/`plan` is **not** in `EnsureModulePermission::UPDATE_ENDPOINTS` (`backend/app/Http/Middleware/EnsureModulePermission.php` L26), so the middleware would derive `create` and a view+update role would get a spurious 403. This is the documented `GET /admin/audit/plan` rule.
  - The existing `POST /videos/bulk` is safe: `'bulk'` **is** in `UPDATE_ENDPOINTS` (L26) and `VideoModuleTest::test_bulk_requires_update_permission` (L403-L417) pins it.

## 5. Traps, concretely

1. **`EnsureModulePermission::UPDATE_ENDPOINTS`** (L26) — `bulk` and `bulk-status` are listed; a new `preview`/`plan` POST segment is not. Use GET, or spell the permission out (`permission:video,update`).
2. **`type_id` `Rule::requiredIf(action === 'type')`** (VideoBulkController L34-L38) must survive the rework — it is what stops bulk doing what the forms forbid (2026-09-16 „status and type are mandatory in every module"). The frontend's dead `NO_TYPE → null` branch (VideoBulkPanel L79) and the `type_id => null` body in `VideoModuleTest` L416 are leftovers of the old behaviour (that test still passes only because the 403 fires before validation).
3. **Georgian tags sit JSON-escaped in the column** — `whereJsonContains` is fine, a hand-written `LIKE` is not (`GlobalSearch::jsonLike()`). `PurgeService::recordIds()` L629-L642 does it in PHP through `Video::tagKey()`; the bulk tag scope should do the same, and must use `tagKey()` rather than `===`, or „ MUSIC " would not match „Music" — behaviour already pinned for the *payload* side by `VideoModuleTest` L375-L386.
4. **Ownership** — `Video::query()` carries `BelongsToUser`'s `owner` scope, which is what makes another account's id drop silently (controller docblock L17; pinned by `VideoModuleTest` L344-L360). A scope rework must not reach for `withoutGlobalScope('owner')`.
5. **Save through the model** (L68) — the audit log and the tag/`watched_at` rules ride on model events. A `->update()` on the query would be faster and silently wrong.
6. **Error messages are inconsistent** — `VideoBulkController` returns Georgian sentences (L50, L55) while `RecordStatusController` returns the machine code `scope_required` (L82). Neither `scope_required` nor any bulk code is in `frontend/src/lib/errors.ts`'s `CODES` (L9…), so a 422 renders the raw string today. New codes go into `CODES` **and** into both locales under `errors.*`.
7. **`all=1` cost** — `VideoBulkPanel` already pulls the whole video library, and it needs to keep doing so for the `ids` picker and for `knownTags`. A server-side preview must not become a *second* full fetch.
8. **The action row should become `ScopeCard`s** (`frontend/src/components/ui/scope-card.tsx` + `lib/actionStyle.ts` colours) — the treatment `/audit`, `/requests`, `/status`'s own domain row and `/purge` all got on 2026-09-15. Three near-identical pills are exactly the „only reading told them apart" complaint.
9. **A radio group will not scale to five scopes.** `PurgePage`'s scope UI is the pattern to copy, not a fifth radio card.
10. **Mirror maps must be `as const satisfies`** if a `BULK_SCOPES` map is introduced, so a domain missing its dictionary fails `tsc` (the 2026-09-04 `game`/`DICTIONARIES` lesson).

## 6. Do media domains have tags? — No.

A `tags` JSON column exists on **`videos`** (`2026_08_28_000005_create_videos_table.php` L37), **`songs`** (`2026_09_03_000004` L80), **`books`** (`2026_09_04_000003` L100), **`note_entries`** (`2026_09_04_000006` L68), **`bookmarks`** (`2026_09_07_000001` L77), plus `cast_member_tags` (a different thing — per-user search tags on the global cast dictionary).

`movies` / `series` / `animes` have **no tags at all**; they classify through the shared polymorphic `genres`. Consequences:

- **Tag bulk editing is video-only today.** If it is ever generalised, the next candidates are song / book / note / bookmark — none of which has a bulk page at all.
- The media half of `/status` can only ever grow *status*-ish scopes (`ids | status | genre | all`), never tags.
- `PurgeService::TARGET_MODES` already states exactly this: media = `ids/genre/status/all`, video = `ids/type/tag/status/all`.

## 7. Gaps worth listing beside the request

- `POST /videos/bulk-status` exists and is **unreachable from the UI**; `StatusBulkPage` L31 documents a video status action that was never built. Adding `status` as a fourth *action* in `VideoBulkPanel` is one mutation plus three i18n keys and closes a dead endpoint.
- `bulkStatus.*` wording is movie-specific on a panel serving three domains (`mediaKey()` is the existing fix).
- `VideoBulkPanel` L79's `NO_TYPE → null` is dead code left by the 2026-09-16 rule.

## 8. Rules this work would touch (from CLAUDE.md)

- „`all=1` is an explicit escape with exactly four callers" — bulk change is one of them; a preview must not become a fifth full fetch.
- „derive the action only when the last segment says what happens — otherwise write it" (§A4) — the preview must be a GET, or the permission must be spelled out.
- „a new machine code must be added to `lib/errors.ts`'s `CODES` list" — otherwise the toast shows the raw string.
- „a control that lies is not drawn" — the „no type" source row already follows this (`countOfType('0') > 0`); a tag/status scope with zero matches should behave the same way.
- every key in **both** `ka.json` and `en.json`, 2-space JSON, CRLF; run `python frontend/src/i18n/audit.py`.
