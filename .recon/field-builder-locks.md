# Recon — field-builder-locks

**Area:** the `locked` flag in the module field builder (`/modules/{key}` → „ველები"), and what a
super-admin override would actually cost.

**Request (paraphrased):** the editor says *name\* is locked — enabled/required cannot be managed,
only the label*. As a super-admin I do not want to be restricted — just **warn** me what may happen
if I turn a required field off, and that it is not advisable.

---

## 1. What exists today

### 1.1 Where `locked` is declared
`backend/app/Support/FieldCatalog.php` — a `'locked' => true` entry in the per-module `FIELDS` map.
Exactly **9 locked fields**, one per module:

| module | locked key | line |
|---|---|---|
| `movie` / `series` / `anime` (shared `MEDIA_FIELDS`) | `title` | :36 |
| `video` | `url` | :80 |
| `song` | `url` | :106 |
| `game` | `title` | :126 |
| `book` | `title` | :148 |
| `board_game` | `title` | :165 |
| `note` | `title` | :179 |
| `bookmark` | `url` | :192 |

⚠️ `bookmark.title` is deliberately **not** locked — it is `'required' => true` (:198) with an
explicit comment: the column is nullable (filled from the page's `<head>`), so hiding it is legal.
That entry is the existing precedent for "strongly defaulted, still switchable".

### 1.2 Where it is enforced (three layers, all real)

1. **`FieldCatalog::for()`** (`FieldCatalog.php:222-226`) — the forcing loop:
   ```php
   foreach (self::FLAGS as $flag) {
       $row[$flag] = $field['locked']
           ? true
           : (array_key_exists($flag, $override) ? (bool) $override[$flag] : $field[$flag]);
   }
   ```
   i.e. `enabled`, `required` **and** `public` are all forced to `true` for a locked field, on read.
   Even if a stored override existed, it is overruled here.
2. **`FieldSettings::save()`** (`backend/app/Services/Modules/FieldSettings.php:109-115`) —
   `if (! FieldCatalog::isLocked(...))` guards the whole flag-writing block, so the override is never
   even persisted (text attrs *are* persisted — labels/placeholders remain editable, as advertised).
3. **`ModuleController::updateFields()`** (`:167-197`) — validation only; it does **not** mention
   `locked`. There is no 422 for trying: the request succeeds and the flags are silently ignored.
   `FieldCatalog::isLocked()` (`:287-297`) is the single predicate both layers ask.

**Pinned by:** `backend/tests/Feature/VideoModuleTest.php:609` —
`test_locked_field_is_listed_but_cannot_be_disabled` PUTs
`['url' => ['enabled'=>false,'required'=>false,'public'=>false]]` and asserts all three come back
`true`. **Any override work must rewrite this test**, not delete it.

### 1.3 Where it renders
`frontend/src/pages/ModulePage.tsx`, component `ModuleFields` (:435-521) and `FieldEditor` (:545-614):

- the grey `Lock` chip + `t('fields.locked')` — :483-489
- the explanation line: `field.locked ? t('fields.lockedHint') : t('fields.desc.<module>.<key>')` — :491-493
- the row's enable `Switch`: `disabled={field.locked || save.isPending}` — :502-507
- the two checkboxes in the editor: `disabled={field.locked}` — :584 (`required`) and :597 (`public`)
- the section subtitle `t('fields.hint')` — :461

Type: `ModuleField.locked` in `frontend/src/api/account.ts:380`; `ModuleFieldPatch` at :536 already
carries only `enabled|required|public|label_*|placeholder_*`.

Form-side reader: `frontend/src/lib/fields.ts` — `useModuleFields()` exposes
`shows` (:51), `required` (:52), **`locked` (:53)**, `label`, `hint`, `placeholder`, `isMissing`.

i18n (both locales present, `fields.*`):
- `ka.fields.locked` = „ჩაკეტილი" / `en` = "Locked"
- `ka.fields.lockedHint` = „ამ ველის გარეშე ჩანაწერი ვერ ჩაიწერება, ამიტომ ჩართულობა და
  სავალდებულოობა არ იმართება. ლეიბლი კი შეგიძლია შეცვალო." / `en` = "A record cannot be saved
  without this field, so its visibility and required flag are not editable. The label still is."
- `fields.hint`, `fields.required`, `fields.requiredHint`, `fields.public`, `fields.publicHint`,
  `fields.enabled`, `fields.edit` — all present in both.

---

## 2. THE DECISIVE FINDING: today the lock is *already* a no-op in the form

**No form anywhere calls `fields.shows()` on a locked key.** Every locked field is rendered
unconditionally, with a hard-coded `required` on its `FieldLabel`:

| module | locked key | render site | guarded by `shows()`? |
|---|---|---|---|
| movie/series/anime | `title` | `pages/MovieFormPage.tsx:377-386` | **no** — and :373-376 says so in a comment: „`fields.shows('title')`-ს შემოწმებას აზრი არ აქვს" |
| video | `url` | `pages/VideosPage.tsx:874-876` | **no** (comment at :873) |
| song | `url` | `pages/SongsPage.tsx:681` | **no** |
| game | `title` | `components/GameForm.tsx:423` | **no** |
| book | `title` | `components/BookForm.tsx:311,322` | **no** |
| board_game | `title` | `components/BoardGameForm.tsx:432` | **no** |
| note | `title` | `components/NoteForm.tsx:152` | **no** |
| bookmark | `url` | `pages/BookmarksPage.tsx:619` | **no** |

(For contrast, `bookmark.title` — the *unlocked* one — **is** guarded: `BookmarksPage.tsx:640`
`className={fields.shows('title') ? undefined : 'hidden'}`.)

**Consequence for the design:** simply deleting the forcing in `FieldCatalog::for()` would let a
super-admin flip the switch to *off*, store it, see it off in the editor — **and the field would
still be drawn on the form**. That is exactly the project's own stated failure mode („a toggle that
changes nothing is worse than no toggle", `FieldCatalog` docblock and the §5.3/§5.1/§5.7 comments).
A real override therefore means touching **nine render sites in eight files** as well as the backend.

Also note `FieldSettings::enabled()` (`FieldSettings.php:58`) has **zero callers in `backend/app/`**
(verified by grep) — the backend's validation never consults the field config at all. So hiding a
field can only ever *subtract* from the form; it can never relax a rule.

---

## 3. What actually breaks — the precise dead-end analysis

### 3.1 The 2026-09-16 `$must` rule
Every module controller's `validated()` opens with
`$must = $record ? ['sometimes','required'] : ['required']`, e.g.
`backend/app/Http/Controllers/Api/VideoController.php:166`, applied to `type_id` (:174) and
`status` (:180). Same shape in `NoteEntryController`, `BookmarkController`, `BookController`,
`BoardGameController`, `GameController`, `SongController` and the media `Store*Request`s.

`backend/tests/Feature/RequiredFieldsTest.php:44-58` is the canonical list of which key is mandatory
in which module:

```
movie/series/anime -> status, genres
video              -> status, type_id
song               -> genre_ids
book / board_game  -> status, genre_id
game               -> status, genre_ids
note / bookmark    -> status, category_id
```

**None of those keys is `locked`.** `status`, `genres`, `type_id`, `category_id`, `genre` all sit in
`FieldCatalog::FIELDS` as ordinary, switchable rows.

### 3.2 → A live, shippable dead end exists **right now**, without any override
Turn off `status` (or `type_id`) on `/modules/video`:

1. `VideosPage.tsx:1012` renders the status block as
   `className={fields.shows('status') ? undefined : 'hidden'}` — i.e. `display:none`, the element
   stays in the DOM, `form.status` stays `''` (nothing is preselected any more — the 2026-09-16 rule).
2. `VideosPage.tsx:838-846`, `submit()` unconditionally runs
   `pickErrors({ status: form.status, type_id: form.typeId }, t('validation.pickOne'))` and
   `return`s early.
3. Result: pressing **Save does literally nothing** — no toast, no request, no visible error, because
   the error text is painted on a `hidden` element (`:1032`).

Identical shape in `MovieFormPage.tsx:296-301` (`missingPicks({status, genres})` vs. the `hidden`
wrappers at :539 and :562), `NoteForm.tsx:100`, `BookForm.tsx:183`, `GameForm.tsx:280`,
`BoardGameForm.tsx:237`, `BookmarksPage.tsx:584`, `SongsPage.tsx:645`.

**Recovery** is possible but undiscoverable: go back to `/modules/<key>`, re-enable the field.
Nothing on the form says which field is missing. This should be fixed regardless of the override
work — see §5.

### 3.3 …and if the locked fields were unlocked *and* the forms honoured `shows()`
Then the failure becomes a genuine 422 on an off-screen field:

- `note.title` → `NoteEntryController.php:138` `[$entry ? 'sometimes' : 'required', ...]` — **create
  is impossible**, 422 `title`.
- `video.url` → `VideoController.php:171`, `song.url` → `SongController.php:161`,
  `bookmark.url` → required on create — **create impossible**.
- `movie/series/anime.title` → `StoreMovieRequest.php:64-65` cross-field check („სახელი (ქართული ან
  ინგლისური) აუცილებელია") — 422 attached to `title_en`.
- `game.title_ka/title_en` → `GameController.php:280-281` `required_without` pair.
- `board_game.title` → `BoardGameController.php:232`.
- `book` → same `required_without` pair.

**Is it unrecoverable?** No — in every case `/modules/{key}` stays reachable and the switch flips
back. The only *irreversible* damage would be data loss, and there is none: hiding a field never
touches a column. So the honest framing is **"a self-inflicted, silent dead end you escape by
returning to this page"**, not "you brick your account".

⚠️ One genuine escape hatch worth naming in the warning: for `movie`/`series`/`anime` the
discover → `POST /{domain}/from-tmdb` path takes a bare `Request` (only `tmdb_id`) and fills the
status through `HasStatus`'s `creating` hook, so records can still be added with the form broken.
**No other module has such a path** — video/song/note/book/game/board_game/bookmark all go through
the form.

### 3.4 The `public` flag on a locked field — mostly inert
`PublicDomain::card()` (`backend/app/Support/PublicDomain.php:223-305`) `unset()`s the hidden keys
from a hand-built card whose keys are `title_ka`/`title_en`/`subtitle`/`url`. A catalogue key of
`title` therefore unsets **nothing** for media/game/book/video/song/note/board_game. The only locked
key that really lands is `bookmark.url` (:293 — and its own comment says the URL is public on
purpose). `id`/`domain` are explicitly never strippable (:297-302), so the card can never be broken.
⇒ unlocking `public` is the **safest** of the three flags.

---

## 4. Recommended design

### 4.1 Shape: an explicit per-field "unlock", not a silent relaxation
Do **not** simply delete the forcing in `FieldCatalog::for()`. Three reasons: the stored override
would be invisible in the editor's own semantics; `FieldSettings::save()` would start writing flags
that today it deliberately refuses; and the nine forms would keep drawing the field anyway (§2).

Proposed:

- `FieldCatalog::for()` gains a third state per flag. Keep `locked` as a **catalogue** fact (it
  still describes the schema truthfully) and add a separate stored override
  `module_user.settings.fields.<key>.unlocked = true`. Then:
  `$row[$flag] = ($field['locked'] && ! $unlocked) ? true : (override ?? default)`.
  The response keeps `locked: true` **and** gains `unlocked: bool`, so the UI can render
  "locked, but you have unlocked it" rather than losing the warning once it is on.
- `FieldSettings::save()`: allow the flag block when `unlocked` is already stored **or** is being set
  in the same request; persist `unlocked` itself.
- `ModuleController::updateFields()`: add `'fields.*.unlocked' => ['nullable','boolean']`.
  ⚠️ **This is the §6-phase-4 trap written in the file's own comment (:180-182)**: `validate()`
  returns only validated keys, so an unlisted attribute drops the whole `fields` array and the PUT
  500s. Adding the attribute here is mandatory, not optional.
- Frontend: `ModuleField` gains `unlocked: boolean`; `ModuleFieldPatch` gains `'unlocked'`.
- **And** the nine render sites must start honouring `fields.shows(<locked key>)`, or the switch is a
  lie. That is the bulk of the work and it is the part most likely to be skipped.

### 4.2 Gating: super-admin-only is the wrong axis — but do it anyway, narrowly
`/modules/{key}/fields` is **the caller's own config**: `ModuleController::fields()` /
`updateFields()` both do `abort_unless($request->user()->hasModule($key), 403)` and `FieldSettings`
reads/writes `module_user` for *that* user (`FieldSettings.php:148-186`). There is **no endpoint that
edits someone else's field config** (`AdminUserController::syncModules` only grants modules).
So the blast radius of a bad choice is one person's own forms, and by the project's own logic
("`required` is form discipline, not a schema constraint") anyone who owns the config could be
allowed to do it.

**Recommendation:** gate it anyway, because the *value* of the lock is that it stops an accidental
click, and a super-admin is the one user who has said out loud they accept the consequence.
Concretely:
- backend: allow `unlocked` only when `$request->user()->isSuperAdmin()`; otherwise ignore the key
  silently (the file's existing "unknown key is ignored, not 422" rule — `FieldSettings.php:87-88`).
- frontend: gate on `useAuth().isAdmin` (`frontend/src/lib/auth.tsx:99`, `!!user?.is_super_admin`).
  ⚠️ **On the backend it is `isSuperAdmin()`, not `$user->is_super_admin`** — that attribute exists
  only on `UserResource` and evaluates to `null` on the model, i.e. the check fails closed and
  silently (CLAUDE.md, §21.9's own hard-won note).

### 4.3 Interaction: a confirm dialog, not a second switch
`useConfirm()` (`frontend/src/components/ui/feedback.tsx:27`, options
`{title, description, confirmText, cancelText, variant: 'default'|'destructive'}`) already exists and
is used in 37 files. Use it — **no typed-word confirmation**. The typed `DELETE`/`RESTORE` pattern
(`/purge`, `/backups`, dictionary delete) is reserved for irreversible data loss; this is reversible
config, and over-using the word devalues it. `variant: 'destructive'`.

Flow: the row's `Lock` chip becomes a **button** for a super-admin → confirm → on accept, PUT
`{ [key]: { unlocked: true } }` → the switch and both checkboxes become live, and the chip changes to
an amber "unlocked" mark whose hint states the risk permanently. Re-locking needs no confirmation
(it restores the safe state) and must **reset the flags to `true`** so you cannot leave a hidden,
re-locked field behind.

### 4.4 What the warning must literally say
It must name three things: *what breaks*, *how it shows up*, *how to undo it*. Draft (both locales
must get every key — `fields.*` namespace, and run `python frontend/src/i18n/audit.py`):

- `fields.unlock` — ka: „ჩაკეტვის მოხსნა" · en: "Unlock"
- `fields.unlockTitle` — ka: „მართლა მოვხსნათ ამ ველის ჩაკეტვა?" · en: "Unlock this field?"
- `fields.unlockWarning` (the body; `{{field}}` = the field's label) —
  ka: „**{{field}}** ის ველია, რომლის გარეშეც სერვერი ჩანაწერს არ იღებს. თუ მას გამორთავ, ფორმაზე
  აღარ დაიხატება, შენახვა კი **422-ით** ჩავარდება იმ ველზე, რომელიც ეკრანზე აღარ არის — ე.ი. ღილაკი
  „შენახვა" ვიზუალურად არაფერს გააკეთებს. ახალი ჩანაწერის დამატება ამ მოდულში შეუძლებელი გახდება.
  **ამის გამოსწორება მხოლოდ აქ, ამავე გვერდზე ველის უკან ჩართვით შეიძლება.** არსებული ჩანაწერები და
  მონაცემები არ იშლება. **არ გირჩევთ.**"
  en: "**{{field}}** is a field the server refuses to save a record without. Turn it off and it
  disappears from the form, while saving still fails with a **422 on a field that is no longer on
  screen** — i.e. the Save button will appear to do nothing. Adding a new record in this module
  becomes impossible. **The only way back is this page: switch the field on again.** No existing
  record or data is deleted. **Not advisable.**"
- `fields.unlocked` — ka: „ჩაკეტვა მოხსნილია" · en: "Unlocked"
- `fields.unlockedHint` — ka: „ამ ველის ჩაკეტვა შენ მოხსენი. თუ გამორთავ, ამ მოდულში ახალი ჩანაწერი
  ვეღარ დაემატება — უკან ჩართვა აქვეა." · en: "You unlocked this field. With it off you will not be
  able to add a record in this module — switching it back on is right here."
- `fields.relock` — ka: „ისევ ჩაკეტვა" · en: "Lock again"

⚠️ For `movie`/`series`/`anime` the sentence „ახალი ჩანაწერის დამატება … შეუძლებელი გახდება" is
slightly too strong (discover/`from-tmdb` still works, §3.3). Either soften it for those three or
add `fields.unlockWarningTmdb` — do **not** ship one text that is wrong for three of the eleven
modules.

### 4.5 Must anything stay truly unhideable?
**No field needs to stay locked to avoid an unrecoverable state**, because:
- `/modules/{key}` is a plain module page, reachable from the sidebar and from the module's own list;
  it is not gated by anything the broken form controls.
- Hiding a field writes only `module_user.settings.fields`; it never deletes a column or a row.
- The editor row itself keeps rendering the field (the catalogue is code, the override is data), so
  the switch that broke it is always visible on the same screen.

**But two guards are non-negotiable:**
1. The **editor page must never itself be affected** by a field override. It isn't today
   (`ModuleFields` lists `FieldCatalog::for()` output regardless of `enabled`) — keep it that way.
2. `id`/`domain` in `PublicDomain::card()` must stay unstrippable (:297-302). Do not extend the
   `public` unlock to them.

If a belt-and-braces escape is wanted, the cheapest one is a **"reset this module's fields to
defaults" button** on `/modules/{key}` — one write that drops `settings['fields']`.

---

## 5. Independently worth fixing (found while tracing; not part of the ask)
- **Silent dead submit (§3.2).** `status`/`type_id`/`genres`/`category_id`/`genre_id`/`genre_ids` are
  all switchable *today* and the local `pickErrors` guard paints its message on a `hidden` element.
  Minimum fix: in each form, compute the pick set from fields that are actually shown, **or** toast
  `t('validation.pickOne')` naming the field when the offending row is hidden. Better fix: never let
  `shows()` return false for a key that appears in the module's `RequiredFieldsTest` row — a
  registry-consistency style test could pin exactly that list against `FieldCatalog`.
- **`AdminUserController::syncModules` (`:191`) uses `->sync($ids)`**, which detaches and re-attaches
  the pivot with only `enabled_at` — i.e. an admin changing a user's module grants **wipes that
  user's `module_user.settings`**: the field config, gallery defaults, note channels and the status
  sidebar layout. Adjacent to this area, and a real data-loss bug.

## 6. Files to touch (if the override is built)
```
backend/app/Support/FieldCatalog.php                      :222-226 (forcing), :287-297 (isLocked), FLAGS :218
backend/app/Services/Modules/FieldSettings.php            :105-115 (save guard), :35-55 (for)
backend/app/Http/Controllers/Api/ModuleController.php     :172-192 (validation — add 'fields.*.unlocked')
backend/tests/Feature/VideoModuleTest.php                 :609  (rewrite: locked -> unlocked -> disable -> re-lock)
frontend/src/api/account.ts                               :360-380 (ModuleField), :536 (ModuleFieldPatch)
frontend/src/pages/ModulePage.tsx                         :483-507 (chip + switch), :584/:597 (checkboxes)
frontend/src/lib/fields.ts                                :53   (locked) — add `unlocked`
frontend/src/i18n/{ka,en}.json                            fields.* (6 new keys, both locales, CRLF)
# + the nine form render sites listed in §2 if the switch is to mean anything
```
