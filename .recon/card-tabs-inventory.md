# Recon — card-style tabs everywhere (`card-tabs-inventory`)

Date: 2026-09-16 · branch `improve/gallery-and-bulk-delete`
Scope: convert every tab-like / switcher-like control to the `ScopeCard` visual, with a matching
icon + colour. User's named example: `/notes/reminders`'s all / active / paused / finished counters.

Read-only recon. **Nothing was modified**; no build, test or git command was run.

---

## 1. What already exists (reuse, do not re-invent)

### 1.1 The primitive — `frontend/src/components/ui/scope-card.tsx`
- `ScopeCard({active, color?, icon, label, count?, hint?, onClick})` — L37-87.
  - `<button aria-pressed>`, `style={modAccent(color) ?? MODULE_ACCENT_FALLBACK}` (L62).
  - active → `border-[var(--mod)] bg-[var(--mod-soft)]`; idle → `border-border hover:border-[var(--mod)]` (L65-68).
  - zero-count card stays clickable, only `opacity-60` (L68).
  - icon tile: `grid size-8 ... rounded-md bg-[var(--mod-soft)]` (L71).
  - `count` and `hint` are mutually exclusive (L78-83); `count === undefined` = "this cut has no number".
- `ScopeGroup({label?, children})` — L95-104. Fixed grid `grid-cols-2 sm:3 lg:4 xl:6`, `gap-2`.
  - Docblock: **no `uppercase` on the group label** — CSS `text-transform` turns Mkhedruli into Mtavruli.
- Docblock rules that must survive any change:
  - colour arrives as **inline CSS vars**, never a class (Tailwind cannot build `border-[#6366f1]`);
  - no `hover:scale` here — `index.css`'s global `.lucide-*` rules already animate icons inside a `<button>`.

**Every existing call site passes the icon as `<X className="size-4 text-[var(--mod)]" />`** — that
`text-[var(--mod)]` is the contract, not decoration. Losing it makes the icon grey.

### 1.2 Existing `ScopeCard` consumers (5 files — the visual precedent)

| File | Line | What it cuts |
|---|---|---|
| `components/audit/AuditScope.tsx` | 91-150 | two `ScopeGroup`s: actions (from `actionStyle()`), modules (from `modules.color` + `ModuleIcon`, pseudo-modules from a local `PSEUDO_ICONS`) |
| `components/gallery/GalleryScope.tsx` | 29-104 | wrapper + `GALLERY_SCOPE_STYLE` map (key → `{icon, color}`) |
| `pages/RequestsPage.tsx` | 48-53, 134-146 | local `STATUSES` const: pending/approved/rejected/all with icon + `var(--…)` colour |
| `pages/StatusBulkPage.tsx` | 87-99 | domain picker, colour/icon from `modules` |
| `pages/PurgePage.tsx` | 435-461, 468-482 | purge target + gallery media type; **deliberately no `count`** |

`GalleryScope` consumers: `pages/GalleryPage.tsx:167` (provider/source),
`components/gallery/RecordsCut.tsx:96` (domain tabs) and `:120` (records/actors — **a 2-option cut
already rendered as two cards**, so 2 cards is an accepted shape in this repo),
`components/gallery/GroupsCut.tsx:470`.

### 1.3 The chip — `frontend/src/components/ui/chip.tsx`
`Chip({active, size:'sm'|'md', icon?, count?, remove?, ...})` + `ChipRow`. 13 call sites.
`remove` mode (an X that reddens on hover) has **no `ScopeCard` equivalent** — those call sites can
never be converted.

### 1.4 The low-profile tab — `frontend/src/components/ui/tabs.tsx`
`Tabs<T>({items: TabItem[], value, onChange})` — underline tabs with an optional `badge`, plus
`TabInfo`. Consumers: `SongDetail.tsx:137`, `VideoDetail.tsx:143`, `GenresPage.tsx:171`,
`GalleryDownloadDialog.tsx:361`. **All four are inside a modal.**

### 1.5 Registries that already set the pattern

| File | Shape | Colour form |
|---|---|---|
| `lib/actionStyle.ts` | `Record<string,{icon:LucideIcon;color:string}>` + `actionStyle(key)` with a neutral fallback (L65-67) | `var(--icon-ok)` / `var(--destructive)` / `var(--gold)` — **theme tokens, never hex**, documented L29-31 |
| `lib/toolSections.ts` | `Record<ToolSectionKey,{color,icon}>`, 15 entries | `var(--tool-*)` |
| `lib/roles.ts` | `roleScope` / `roleTone` / `roleIcon` | tokens |
| `components/gallery/GalleryScope.tsx` L29-51 | `GALLERY_SCOPE_STYLE` — **identical shape, wrong location** (sits in `components/`, gallery-only) |
| `lib/statusStyles.ts` | tone → **Tailwind class strings** (`bg-status-watched/15`) | ⚠️ **NOT CSS vars** — incompatible with `ScopeCard.color` |

Available tokens (`index.css` L35-77, dark set L107-134): `--gold`, `--favorite`,
`--icon-ok/warn/info`, `--status-undecided/towatch/watching/watched`, `--tool-*` ×15, `--primary`,
`--destructive`, `--muted-foreground`.

---

## 2. Complete inventory

### 2.A — CONVERT (mutually-exclusive cuts of one list, page/section level)

| # | File:line | Switches | Opts | Icon today | Colour today | Notes |
|---|---|---|---|---|---|---|
| A1 | `pages/NoteRemindersPage.tsx:112-125` | reminder state: all / active / paused / done | 4 | no | no | **the user's named case.** `counts` already computed L83-87 via `reminderState()`. i18n `notes.reminderCut.*` exists in **both** locales (ka.json:2198, en.json:2198). |
| A2 | `components/GalleryPanel.tsx:102-114` | photo category all/backdrop/poster/logo/actor | ≤5 | no | no | **strongest case: `GALLERY_SCOPE_STYLE` already holds these exact keys** (`all`,`backdrop`,`poster`,`logo`,`actor`, L31-35). Counts already passed. |
| A3 | `pages/SearchPage.tsx:147-155` | result domain (all + N) | 2-12 | no | no | counts from the overview query. Module colour via `useModules()`; ⚠️ 3 domains are **not modules** (`cast`, `playlist`, `gallery`) → need a registry fallback. |
| A4 | `pages/PublicProfilePage.tsx:207-219` | public-profile domain | 1-9 | no | no | `size="md"` chips in a `fb-scroll` nav; counts present. Module colour available. |
| A5 | `components/VisibilityManager.tsx:194-200` | domain | 1-9 | no | no | inside a card on `/profile` → **needs a compact variant** (§3). |
| A6 | `components/VisibilityManager.tsx:214-226` | all / public / private | 3 | no | no | counts on 2 of 3. Sits in a `flex` row next to a search input → compact/inline variant, otherwise the row breaks. |
| A7 | `components/StorageLibrary.tsx:199-216` | storage module | 2-13 | no | no | counts present; module colour available; `account`/`chat`/`backup` are pseudo-modules → registry fallback. Compact variant. |
| A8 | `components/StorageLibrary.tsx:218-226` | file kind all/image/doc/… | 2-5 | no | no | second cut in the same row; compact variant. |
| A9 | `components/GalleryDownloadDialog.tsx:361-370` | download flow record ↔ cast | 2 | no | no | currently `ui/tabs`. Two distinct *scopes*, not two views of one scope — and `RecordsCut:120` already renders a 2-option cut as two cards. |

### 2.B — BORDERLINE (convert only with a compact variant; otherwise KEEP)

| # | File:line | Switches | Why borderline |
|---|---|---|---|
| B1 | `components/gallery/GroupFilters.tsx:171-177` | `have` = with / without / all | It **is** a mutually-exclusive cut, but it lives in a toolbar row beside the search input, `LayoutToggle`, the sort `Pick` and the sections pick. Three page-level cards there would dominate a filter bar. |
| B2 | `components/SongDetail.tsx:137` · `components/VideoDetail.tsx:143` | images / notes / docs | Mutually exclusive panels with badges — but inside a `ModalShell`; cards would push content below the fold. `ui/tabs` is the right weight here. |

### 2.C — KEEP (converting would be a regression)

| # | File:line | What | Why KEEP |
|---|---|---|---|
| C1 | `components/gallery/LayoutToggle.tsx` — 3 call sites (`GroupFilters.tsx:187`, `AlbumsCut.tsx:169`, `CastPhotoStacks.tsx:123`) | grouped ↔ mixed | **Its own docblock L11-14 says „ეს ჭრილი არ არის"** — it renders the *same* scope two ways. Two big cards = exactly the regression the request warns about, and it contradicts a documented §28 decision. |
| C2 | `components/gallery/SortPick.tsx:34-64` | new / old / random | Ordering, not a cut. `role="radiogroup"`, icon-only on narrow screens. |
| C3 | `components/StorageLibrary.tsx:179-193` | list ↔ grid | 2-state presentation toggle, icon-only 36px squares. |
| C4 | `pages/LibraryPage.tsx:316-334` | franchise grouping on/off | A boolean; an icon `Button` with a two-state tooltip. Not a cut. |
| C5 | `components/FilterPanel.tsx:125-140` | selected-filter chips with `remove` | Multi-select removal marks. No card equivalent. |
| C6 | `components/gallery/GroupFilters.tsx:225-245, 252-305` | genre / status / favorite / year chips | Multi-select + removal chips. |
| C7 | `pages/BoardGamesPage.tsx:427-437` | players 1..8+ | Multi-select **OR** filter (documented). |
| C8 | `components/NoteReminders.tsx:380-392, 417-430, 436-448, 475-490, 500-512` | reminder mode (6), interval presets, weekdays, days-of-month (31), times | **Form inputs**, several multi-select. 31 day cards would be absurd. |
| C9 | `components/CastMemberDialog.tsx:255-268` · `components/WebImageDialog.tsx:312-320, 410-418` | context suggestion chips | They **fill a field**, they do not switch a view. |
| C10 | `components/{BoardGameGenre,BookGenre,BookmarkCategory,GameGenre,NoteCategory,SongGenre,VideoType,Status}Dialog.tsx` (≈L103-150 each) | icon pickers, `aria-pressed` | A ~20-cell picker grid. |
| C11 | `components/StatusDialog.tsx:119-127` | role todo / doing / done | Form field inside a dialog. |
| C12 | All `RadioGroup` scope pickers: `SyncDialog.tsx:120,186`, `TranslateDialog.tsx:238`, `VideoBulkPanel.tsx:149`, `StatusBulkPage.tsx:177`, `PurgePage.tsx:490`, `DictionariesPage.tsx:609`, `GenresPage.tsx:295`, `GalleryMoveDialog.tsx:138`, `GalleryDownloadDialog.tsx:399,582` | mode / scope | Each option **expands its own sub-form inline** (a record picker, a "move to" select, a typed DELETE). A card row cannot hold that, and `RadioGroup` is the correct semantics. |
| C13 | `components/MatchPanel.tsx:98-128` | per-domain rows | An accordion — the row expands `MatchItems`. |
| C14 | `pages/ChatPage.tsx:122` | conversation list | Navigation. |
| C15 | `components/WebSourcePicker.tsx:69` | search source | Multi-select source cards carrying credits/quota. |
| C16 | `pages/GenresPage.tsx:163-171` | names / items / **add** | „add" is an *action*, not a cut — mixing it into a card row repeats the sidebar's `SUB_ADD` mistake. |
| C17 | `components/GameForm.tsx:92,542`, `GameFranchiseDialog.tsx:185`, `pages/SongsPage.tsx:838`, `VideoBulkPanel.tsx:136` | record-pick rows | Multi-select pickers. |

**Count: 9 CONVERT · 2 borderline (≈3 files) · 17 KEEP groups.**

---

## 3. What `ScopeCard` / `ScopeGroup` still need

1. **`size?: 'sm' | 'md'` on `ScopeCard`** (default `md` = today). `sm`: icon tile `size-7`, `p-2`,
   `gap-2`, label `text-[13px]`. Required by A5-A8 and B1 — those rows live *inside* a card or a
   toolbar, where the current `p-2.5` + `size-8` card reads as a page-level control.
2. **A layout escape on `ScopeGroup`: `layout?: 'grid' | 'inline'`.** The fixed
   `grid-cols-2 sm:3 lg:4 xl:6` stretches a 3-option cut (A6: all/public/private) across a
   6-column grid with dead gaps, and forces a 2-option cut into two half-width slabs where that is
   wrong (A9 sits above a scrolling dialog body). `inline` = `flex flex-wrap gap-2` with a
   `min-w-[9rem]` card.
3. *(optional)* `disabled?: boolean` — `ui/tabs.tsx`'s `TabItem.disabled` has no equivalent, so
   converting B2 later would lose it.
4. **Nothing else.** `color` / `count` / `hint` already cover every case found. Do **not** add a
   `tone` prop — `color` already accepts a `var(--…)` token, which is exactly how `actionStyle()`
   feeds it in `AuditScope`.

---

## 4. Where icons and colours come from — one registry, not per-page maps

Three concepts in the CONVERT list have **no** icon/colour anywhere today: reminder states,
visibility states, and the non-module search/storage domains. Two more have maps in the wrong
place (`RequestsPage`'s local `STATUSES` L48-53; `GALLERY_SCOPE_STYLE` inside `components/`).

**Proposal — `frontend/src/lib/cutStyle.ts`**, copying `lib/actionStyle.ts` literally:

```ts
export type CutStyle = { icon: LucideIcon; color: string }
const CUT_STYLE: Record<string, CutStyle> = { /* … */ }
export function cutStyle(key: string): CutStyle {
  return CUT_STYLE[key] ?? { icon: CircleSlash, color: 'var(--muted-foreground)' }
}
```

Suggested entries (all **theme tokens**, never hex — `actionStyle.ts` L29-31's rule, because
`modAccent()` puts the value in `color-mix()` so dark mode needs no second palette):

| Concept | key | icon | colour |
|---|---|---|---|
| generic | `all` | `LayoutGrid` | `var(--primary)` |
| reminder (A1) | `active` | `BellRing` | `var(--primary)` |
| | `paused` | `BellOff` | `var(--status-undecided)` |
| | `done` | `CheckCheck` | `var(--icon-ok)` |
| visibility (A6) | `public` | `Globe` | `var(--icon-ok)` |
| | `private` | `Lock` | `var(--status-undecided)` |
| requests | `pending` / `approved` / `rejected` | move `RequestsPage.tsx:48-53` here verbatim | unchanged |
| non-module domains (A3/A7) | `cast` | `Users` | `var(--tool-people)` |
| | `playlist` | `ListMusic` | `var(--tool-chat)` |
| | `gallery` | `Images` | `var(--gold)` |
| | `account` | `UserCog` | `var(--tool-users)` |
| | `chat` | `MessageSquare` | `var(--tool-chat)` |
| | `backup` | `DatabaseBackup` | `var(--tool-backups)` |
| storage kinds (A8) | `image` / `video` / `doc` / `book` | `Image` / `Video` / `FileText` / `BookOpen` | `--tool-sync` / `--tool-translations` / `--muted-foreground` / `--tool-dictionaries` |

⚠️ The icons chosen for A1 **already exist in `ReminderCard.tsx`** (`BellRing`, `BellOff`,
`CheckCheck` — imports L4-18, rendered L200-218) and its local `STATE_TONE` (L125-136) already
distinguishes the three states. The registry must agree with that card, or the same reminder gets
one colour on the card and another on its tab. Move / re-derive, don't invent a second set.

⚠️ `GALLERY_SCOPE_STYLE` should be **moved into `lib/cutStyle.ts` and re-exported** from
`GalleryScope.tsx` so no gallery call site changes. Leaving both is the duplication this whole
exercise exists to remove.

⚠️ Do **not** feed `statusTone()` (`lib/statuses.ts:109`) into `ScopeCard.color` —
`lib/statusStyles.ts` returns Tailwind class strings, not CSS vars. If a status cut ever becomes
cards, the tone→token map must be added to `cutStyle.ts`.

---

## 5. Traps

1. **`LayoutToggle` must not be converted** — `components/gallery/LayoutToggle.tsx` L11-14
   explicitly documents it is *not* a cut (§28). Converting it contradicts a written decision and
   turns a 2-state view switch into two page-level slabs.
2. **Tailwind cannot generate a class from a hex or a var-in-template.** Colour goes through
   `modAccent(color)` as inline `--mod`/`--mod-soft`; the classes stay literal. A templated
   `text-[...]` with an interpolated colour compiles to nothing.
3. **The icon must keep `className="size-4 text-[var(--mod)]"`.** Every call site writes it by
   hand; a compact variant that renders the icon itself must preserve it or all icons go grey.
4. **No `uppercase` on a `ScopeGroup` label** (turns Mkhedruli into Mtavruli) and **no
   `hover:scale`** inside `ScopeCard` (it would override `index.css`'s global icon animation).
5. **`count === undefined` ≠ `count: 0`.** `/purge` deliberately has no number. A converted cut
   must pass `undefined` when the number is unknown, not `0`.
6. **Facet counts must not count their own cut** (the audit/gallery rule). A1 is safe — it counts
   client-side over the whole list (`NoteRemindersPage.tsx:83-87`). A3/A7 already use separate
   overview/total queries; check before reusing a filtered response.
7. **`Chip`'s `remove` prop has no card equivalent** — `FilterPanel.tsx:132` and
   `GroupFilters.tsx:227-245` are removal marks, not tabs.
8. **`rounded-full` is banned** (13 sanctioned exceptions) and every radius is 5px from
   `index.css`'s `@theme inline`. `ScopeCard` is already `rounded-md`; a new variant must not
   introduce a literal radius.
9. **i18n**: `notes.reminderCut.*` exists in both locales — A1 needs no new key unless a `hint` is
   added. Any new key goes in **both** `ka.json` and `en.json`, 2-space JSON, **CRLF**, and
   `python frontend/src/i18n/audit.py` must exit 0. A key-like literal stored in a map (e.g. a
   label inside `cutStyle`) is flagged by the audit's "key-like literal outside `t()`" check.
10. **Verify compiled CSS**, not source, for anything new touching `--mod` (the repo's standing
    rule): `npm run build`, then grep `dist/assets/*.css`.
11. `ScopeGroup`'s `xl:grid-cols-6` means a converted 4-option cut (A1) renders as 4 of 6 columns
    on a wide screen — visually fine (it matches `/requests`), but confirm before shipping.
12. `Chip` is still needed after this work (multi-select filters, suggestion chips, form inputs) —
    it must **not** be deleted, and `ui/tabs.tsx` must stay for B2 unless those are converted too.
