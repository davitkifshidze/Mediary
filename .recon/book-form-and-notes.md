# Recon — book-form-and-notes

Area: the book module — (1) the `language` field in the add/edit form, (2) the files + notes/quotes
block in `BookDetail`, and the same rework rippling to video / song / game / board-game notes.

---

## 1. The language field — what exists today

### Frontend
`frontend/src/components/BookForm.tsx:386-396` — a **plain free-text `<Input>`**:

```tsx
<div className={fields.shows('language') ? undefined : 'hidden'}>
  <FieldLabel htmlFor="b-language" required={fields.required('language')} hint={fields.hint('language')}>
    {fields.label('language')}
  </FieldLabel>
  <Input id="b-language" placeholder="ka / en / ru"
         value={form.language}
         onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} />
</div>
```

Related lines in the same file:
- `:73` initial state `language: book?.language ?? ''`
- `:153` Open Library draft prefill `language: f.language || (draft.language ?? '')` (inside `applyDraft`,
  which is "empty fields only")
- `:211` payload `language: form.language || null`  ← **this line is the danger, see below**

The field is already wired to the field builder (`fields.shows/required/label/hint`), i.e. it obeys
`FieldCatalog` overrides. Keep that wiring — do not hardcode a label.

### Backend
- `backend/app/Http/Controllers/Api/BookController.php:265` — `'language' => ['nullable','string','max:10']`
  (free text, **no `Rule::in`**)
- `:301` — `language` is in the `$plain` list of `apply()`, written as `$data[$field] ?: null`
  (so an empty string clears it, and an absent key leaves it alone)
- Column: `backend/database/migrations/2026_09_04_000003_create_books_module.php` →
  `$table->string('language', 10)->nullable();`
- `backend/app/Http/Resources/BookResource.php:28` — `'language' => $this->language`
- `backend/app/Support/FieldCatalog.php:144` — `['key' => 'language', 'type' => 'text', 'sort_order' => 60]`
  (would become `'select'` if we change it; `type` is metadata for the field editor)
- Test that pins a value: `backend/tests/Feature/BookModuleTest.php:141` → `'language' => 'ka'` (safe)
- **Nothing filters or displays `language`**: `BooksPage.tsx` has no language filter, `BookDetail` never
  renders it, `BookController::index()` has no `language` filter. The i18n key `books.language` ("ენა")
  exists in both locales but is currently unused by any component — the form label comes from
  `fields.name.book.language`.

### CRITICAL — Open Library does NOT only produce ka/en/ru

`backend/app/Services/Books/OpenLibraryClient.php:259-275`:

```php
/** `/languages/geo` → `ka` (ISO 639-2 → 639-1, only what we actually meet) */
private function language(?string $value): ?string
{
    if (! $value) return null;
    $code = strtolower(basename($value));
    return match ($code) {
        'geo', 'kat', 'ka' => 'ka',
        'eng', 'en'        => 'en',
        'rus', 'ru'        => 'ru',
        'ger', 'deu', 'de' => 'de',      // <- beyond the requested three
        'fre', 'fra', 'fr' => 'fr',      // <- beyond the requested three
        default => mb_substr($code, 0, 10),   // <- ANY raw MARC code passes through
    };
}
```

Called from two places: `:200` (`search()` → candidate row, `$doc['language'][0]`) and `:242`
(`edition()` → `$edition['languages'][0]['key']`). So a book imported from Open Library can legitimately
carry **`de`, `fr`, `spa`, `ita`, `jpn`, `ara`, `chi`, `heb`, …** — an un-normalised 3-letter MARC code for
everything outside the five mapped languages.

**Concrete failure if a strict 3-value select is built naively:**
1. User imports "Der Process" → `applyDraft` sets `form.language = 'de'`.
2. A Radix `<Select value="de">` whose items are only `ka|en|ru` renders an **empty trigger**
   (`SelectValue` falls back to the placeholder) — the field looks unfilled.
3. User presses save; `BookForm.tsx:211` sends `language: form.language || null`.
   If the select's `onValueChange` never fired the value survives — but the moment the user touches the
   select, or if the initial state is "normalised" to `''`, the stored `de` is **silently overwritten with
   `null`**. Same for editing any existing book whose language is outside the three.

→ **Recommendation: a select whose option list is `ka / en / ru` PLUS a self-added option for the record's
own current value when it is outside the list** (one `<SelectItem value={form.language}>` rendered only when
`form.language && !PRESETS.includes(form.language)`). That is the minimum that satisfies "an ordinary select"
without inventing a data-loss path. Optionally add `de`/`fr` as presets too, since the mapper emits them
deliberately.
→ **Backend: leave `nullable|string|max:10` as it is.** Adding `Rule::in(['ka','en','ru'])` would 422 every
save of an already-imported German/French/Spanish book — and that value came from *our own* importer.
This is an **open question for the user** (strict 3 vs. "3 presets + keep whatever is there").

### Precedent to copy for the markup
`BookForm.tsx:421-435` (format) and `:441-458` (status) — `Select / SelectTrigger / SelectValue /
SelectContent / SelectItem` from `@/components/ui/select`, with `<SelectValue placeholder={t('validation.choose')} />`.
Note `language` is **not** in the mandatory-pick set (`lib/requiredPicks.ts`) — it must stay nullable, so it
gets no red border and no `$must` rule.

### i18n needed
Option labels. `books.language` already exists; add e.g. `books.languages.ka|en|ru` (+ an `other` label if a
pass-through option is rendered). **Both `ka.json` and `en.json`**, 2-space JSON, CRLF; then run
`python frontend/src/i18n/audit.py`. The audit's "string-array literal paired with a prefix" check will see a
`LANGUAGES = ['ka','en','ru']` const next to `` t(`books.languages.${x}`) `` — all three members must have
keys or it exits non-zero.

---

## 2. `BookDetail.tsx` — what exists today (419 lines)

Structure (`frontend/src/components/BookDetail.tsx`):

| Lines | Piece |
|---|---|
| 35-64 | `BookDetail` — `<ModalShell wide>`, `VisibilityBadge`, then three `<section>`s |
| 66-154 | `ProgressCard` — page/percent inputs + bar |
| 156-301 | `FilesCard` — kind chips, upload button, `<ul>` of files, `useFileViewer` |
| 303-419 | `NotesCard` — add form (textarea + `is_quote` checkbox + page + Add), then `<ul>` of notes |

Mounted only from `frontend/src/pages/BooksPage.tsx:483-488`.

### The exact strings the user quoted
All of them are real i18n keys, present in **both** locales (books namespace = 79 keys each, in sync):
`books.filesTitle` "ფაილები" · `books.filesHint` "თვითონ წიგნი (pdf/epub), ფოტოები და დოკუმენტები." ·
`books.fileKinds.{book,image,doc}` · `books.fileUpload` · `books.filesEmpty` "ფაილი ჯერ არ არის." ·
`books.notesTitle` "ჩანიშვნები და ციტატები" · `books.notesHint` "ციტატას გვერდის მითითებაც შეუძლია." ·
`books.notePlaceholder` · `books.quotePlaceholder` · `books.isQuote` · `books.notePage` ·
`books.notesEmpty` · `books.pageShort` "გვ. {{page}}".

### What is wrong with it today (concrete, not taste)
1. **`books.filesEmpty` / `books.notesEmpty` are bare grey `<p>`s** (`:240-242`, `:383-385`) — exactly the
   case `components/ui/empty-state.tsx` was written for (state + why + next button).
2. **The kind chips at `:201-213` are a hand-rolled pill** (`rounded-md px-2.5 py-1 text-xs`) —
   `components/ui/chip.tsx` (`Chip`/`ChipRow`) exists precisely to kill those copies.
3. **Deleting a note has NO confirmation** (`:399-407` calls `remove.mutate(note.id)` straight), while
   deleting a file does (`:281-288` → `useConfirm` with `variant: 'destructive'`). Asymmetric, and a real
   data-loss path.
4. **A note cannot be edited from the UI at all**, even though `updateBookNote` exists
   (`frontend/src/api/books.ts:286`) and `PATCH /api/book-notes/{bookNote}` is routed
   (`backend/routes/api.php:529`).
5. `created_at` / `updated_at` come back in the payload (`BookNoteResource`) and are **never rendered**.
6. The note body is rendered inline with `whitespace-pre-wrap` — a long quote makes the list unusable,
   which is the argument for "each entry is a button that opens a modal".

---

## 3. `book_notes` — can the schema answer "who added"?

Schema (migration lines ~126-143 of `2026_09_04_000003_create_books_module.php`):

```
book_notes: id, user_id (FK users, cascade), book_id (FK books, cascade),
            body text, is_quote bool default false, page unsignedInt nullable,
            timestamps (created_at, updated_at)
            index(user_id), index(book_id, id)
```

Model `backend/app/Models/BookNote.php` — `use BelongsToUser;` (global `owner` scope + auto-fill of
`user_id` from `Auth::id()` on create). `BookNoteController::store()` also passes
`['user_id' => $request->user()->id]` explicitly.

**Honest answer: there IS a `user_id`, but it can only ever be the record's owner.**
`BelongsToUser`'s `owner` scope + `EnsureRecordOwnership` + `books.user_id` mean a `book_notes` row is
never visible to, nor creatable by, anybody but the book's owner. There is no collaboration in this app,
so "who added" is always **me**. It is *not* exposed by `BookNoteResource` (only `id, body, is_quote, page,
created_at, updated_at`).

→ Two ways to render "who added" without inventing a column:
- (a) **Zero backend change** — render `useAuth().user.display_name` + `components/UserAvatar.tsx`.
  `User` (`frontend/src/api/account.ts:8-16`) has `display_name` and `avatar_path`.
- (b) Add `user_id` (or a `user: {id, display_name}` block) to `BookNoteResource`. Costs a payload field
  that restates a fact the client already knows.

→ **Open question**: does the user want a name at all, or did "who added" really mean "when it was added /
that it is mine"? `created_at` + `updated_at` are already there and are the genuinely informative half.
If (a) is chosen, nothing in `backend/` changes for this feature.

---

## 4. Shared primitives that MUST be reused (do not re-invent)

| Primitive | File | Why it matters here |
|---|---|---|
| `ModalShell` | `components/ui/modal-shell.tsx` | Module-level modal **stack** via `useSyncExternalStore` + `useLayoutEffect` (`:47-91`). Only the top modal is visible; the lower one is **hidden with CSS, stays mounted**. `onBack` **appears automatically when nested** (`:112-119`). So a note modal opened from `BookDetail` gets the back arrow, hides `BookDetail`, and closing it restores `BookDetail` with its state intact. **The user's requirement ("closing the modal or going back must return to the page you came from") is satisfied for free — write no navigation code.** Sizes: `default` max-w-xl · `wide` max-w-5xl · `full` max-w-7xl. |
| "render the dialog in every branch" | CLAUDE.md rule, pinned by `components/gallery/GroupsCut.test.ts` | State that opens a portal belongs to the component; the JSX must not sit in only one `return` branch. `NotesCard` has a single return today, but the moment it grows an `if (openNote) return …` the dialog must be hoisted into a `const dialogs = (…)` rendered by both branches. |
| `useFileViewer` / `FileViewer` | `components/FileViewer.tsx:196-231` (hook), `:70` (component), `kindOf` `:45` | Already used at `BookDetail.tsx:195` with `resolve: storageUrl` (book files are on the **public** disk). Hook returns `{open, close, node}`; `node` must be rendered by the caller. Do not add a second viewer. |
| `EmptyState` | `components/ui/empty-state.tsx` | Replaces the two bare `<p>`s. Props `icon`, `title`, `hint`, `actions` — the buttons are the caller's. |
| `Badge` | `components/ui/badge.tsx` | `inline-flex … rounded-md px-2.5 py-1 text-xs font-medium`; **background colour is the caller's**. Use for the quote mark and the page number. |
| `Chip` / `ChipRow` | `components/ui/chip.tsx` | The file-kind switcher at `:201-213`. |
| `useConfirm` | `components/ui/feedback.tsx:27` | `await confirm({title, description, variant:'destructive'})` → boolean. z-90, above every modal. |
| `useToast` | same file | already imported. |
| `PageContainer` / `pageContainer()` | `components/ui/page.tsx` | **Not applicable** — this is a modal, not a page. Listed only so nobody reaches for it. |
| `useDateFormat()` | `lib/dates.ts:87-108` | `{format, date, dateTime, relative}`. `relative` takes the **UI language**, `date`/`dateTime` the user's `dateFormat` setting. Never call `toLocaleDateString()` directly. |
| `highlightParts` | `lib/searchResults.ts:30-50` (unit-tested in `searchResults.test.ts`) | For the SEARCH requirement: splits with `toLowerCase()+indexOf`, **never a RegExp** (a query containing `(` must not be read as a pattern), and finds **inside** a Georgian word. Reuse it. |
| `DataTable` search idiom | `components/ui/data-table.tsx:38-50, 98-107` | Precedent for a client-side search box (`searchOf` + `t('table.search')` + the `Search` lucide icon positioned absolutely). A notes list is already fully loaded, so client-side filtering is right here. |
| `UserAvatar` | `components/UserAvatar.tsx` | If "who added" is rendered. |
| Icon hover rules | `index.css` | Do **not** hand-write `hover:scale`/colour on lucide icons — `index.css` already shakes the bin and makes the pen write. Use `SquarePen` (not `Pencil`) for edit. |
| No underlines | project-wide rule | `grep -rn "underline" src` must stay clean; use `hover:text-primary` for the clickable note button — exactly what `BookDetail.tsx:259` already does for a file name. |

---

## 5. The other four note families — is ONE shared component feasible?

Yes, with one well-contained difference. Measured shapes:

| Module | TS type | create signature | update in `api/`? | backend routes |
|---|---|---|---|---|
| book | `BookNote {id, body, is_quote, page, created_at, updated_at}` (`api/books.ts:261`) | `createBookNote(bookId, {body, is_quote, page})` `:281` | yes `updateBookNote` `:286` | `routes/api.php:529-530` |
| video | `VideoNote {id, body, created_at, updated_at}` (`api/videos.ts:79`) | `createVideoNote(videoId, body: string)` `:112` | yes `updateVideoNote` `:117` | `:368-369` |
| song | `SongNote {id, body, created_at, updated_at}` (`api/songs.ts:216`) | `createSongNote(songId, body)` `:249` | yes `updateSongNote` `:254` | `:562-563` |
| game | `GameNote {id, body, created_at, updated_at}` (`api/games.ts:396`) | `createGameNote(gameId, body)` `:408` | **missing** | `:444-445` (exists) |
| board_game | `BoardGameNote {…same…}` (`api/boardGames.ts:291`) | `createBoardGameNote(gameId, body)` `:303` | **missing** | `:403-404` (exists) |

So: **all five rows are `{id, body, created_at, updated_at}`; book adds exactly two optional fields
(`is_quote: boolean`, `page: number|null`). All five already have PUT/PATCH + DELETE routes.** Game and
board game are missing only the frontend `update*` helper (two ~4-line functions).

Also worth knowing:
- `GameDetail.tsx:523` and `BoardGameDetail.tsx:362` **borrow `t('books.notesEmpty')`** — a cross-namespace
  reuse a shared component either legitimises (one generic `notes.*` namespace) or should fix.
- **Two different host shapes**: `BookDetail` / `GameDetail` / `BoardGameDetail` render notes as a plain
  `<section>`; `VideoDetail` (`:34` `type Tab = 'video'|'images'|'notes'|'docs'`) and `SongDetail` (`:42`)
  render them inside a **tab** with `badge: notes.length` and a `TabInfo` line. The shared component must
  therefore be *body-only* (no `<h3>`/hint of its own) and leave the section heading to the caller.
- `VideoDetail`/`SongDetail` already have an **inline edit** state (`saveNote.mutate({id, body})`,
  `VideoDetail.tsx:229`); the rework replaces it with the modal.

**Feasible design:** one `components/RecordNotes.tsx` parameterised by an adapter object, not by a
`module: 'book'|'video'|…` string — the adapter carries `list/create/update/remove` + `queryKey` + an
optional `extras` descriptor enabling the quote/page controls. `is_quote`/`page` then live in one optional
branch instead of a `switch` repeated in five files. The note **modal** is its own file
(`components/RecordNoteDialog.tsx`), so the state/JSX-in-one-component rule is satisfied by construction.

---

## 6. Concrete component plan

**A. `frontend/src/components/RecordNotes.tsx`** (new, shared, body-only)
- props: `{ notes, isLoading, onAdd, onUpdate?, onRemove, quotes?: boolean, emptyAction?: ReactNode }`
  (or the adapter form above).
- renders: the add form (textarea + `is_quote` checkbox + page input **only when `quotes`**), a search
  `<Input>` with the `Search` icon (client-side, `highlightParts` for matches, shown only past ~5 notes),
  then the list. `EmptyState` when there is nothing; a distinct "nothing matched" variant when the search is
  what emptied it — "I have no notes" and "the filter hid them" are different facts.
- each row is a `<button type="button" className="… text-left hover:text-primary">` (the idiom
  `BookDetail.tsx:256-263` already uses for a file name) → opens the dialog. **The delete button stays
  outside that button** — nesting buttons is invalid HTML and one click would do both.
- quote rows keep their `Quote` icon + a `Badge` for `გვ. {{page}}`.

**B. `frontend/src/components/RecordNoteDialog.tsx`** (new)
- `<ModalShell title={…} onClose={…}>` — **no `onBack` prop needed**, it appears by itself because the
  dialog is nested inside `BookDetail`'s own `ModalShell`.
- shows: who added (`useAuth().user.display_name` + `UserAvatar`, pending the open question), when
  (`useDateFormat().dateTime(created_at)` + `relative`; show `updated_at` only when it differs from
  `created_at`), the full body, quote/page badges, an **edit** mode (`SquarePen`) that PATCHes, and
  **delete behind `useConfirm({variant:'destructive'})`**.
- the parent (`RecordNotes`) holds `openNote` state and renders `<RecordNoteDialog>` from a `const dialogs`
  used by **every** return branch.

**C. `BookDetail.tsx` edits**
- `FilesCard`: kind pills → `ChipRow`/`Chip`; `books.filesEmpty` → `EmptyState`; keep `useFileViewer` and
  the `viewer.node` render exactly as they are.
- `NotesCard` → thin wrapper over `RecordNotes` with `quotes` on; keep the existing `queryKey`
  `['book-notes', book.id]` and the `done()` invalidation set (`book-notes`, `books`).
- Do **not** touch `ProgressCard` — `Book::syncProgress()` owns the two-unit rule.

**D. Ripple to the other four** — same wrapper, `quotes` off; add `updateGameNote` / `updateBoardGameNote`
to `api/games.ts` / `api/boardGames.ts` (routes already exist).

**E. i18n** — a generic `notes.*` sub-namespace (search placeholder, "added by", "added on", "edited",
"delete this note?", "nothing matched") in **both** locales, CRLF, then `python frontend/src/i18n/audit.py`.
Keep `books.notesTitle`/`notesHint`/`isQuote`/`pageShort` where they are (book-specific chrome).

---

## 7. Rules this work could violate — watch these

1. **`GroupsCut` rule** — the dialog must be rendered by every `return` branch of the component that owns
   its state. This is the live bug the project already paid for once.
2. **Never re-roll a shared primitive** — `EmptyState`, `Badge`, `Chip`, `useConfirm`, `FileViewer`,
   `highlightParts`, `useDateFormat` all exist.
3. **No `hover:underline`**; no `rounded-full` (only avatars/switch/radio keep it); no bare
   `toLocaleDateString()`; no hand-written icon hover animation.
4. **Both locale files**, then run the i18n audit (its string-array-literal check will trip on a
   `['ka','en','ru']` const).
5. **`lib/layers.ts`** decides z-index — a `Select` inside the note modal must not get a hand-written one.
6. **The language select must not be able to null out an imported value** (§1).
7. `FieldCatalog`'s `language` entry may change `type` to `select`, but its `key` must not change — a key
   change orphans every user's `module_user.settings.fields` override.

---

## 8. Open questions for the user

1. **Language**: strict `ka/en/ru` only, or the three as presets while any existing/imported value
   (`de`, `fr`, `spa`, …) is preserved? Our own `OpenLibraryClient` emits five mapped codes plus raw MARC.
2. **"Who added"**: there is no second person in this app — a note's `user_id` is always the book's owner.
   Show my own name/avatar, or is `created_at` (+ `updated_at` when edited) what was actually wanted?
3. **SEARCH**: a search box over the notes *list*, or searching inside one note's text in the modal?
4. Should the modal rework land on video / song / game / board-game notes in this pass, or book first?
5. Should the note modal also allow **editing** (`PATCH` exists for all five), or only view + delete?
