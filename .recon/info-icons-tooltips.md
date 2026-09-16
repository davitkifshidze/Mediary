# recon: info-icons-tooltips

Replacing explanatory paragraph text with icons + tooltips.
User: "Instead of these information blocks at the bottom of the page, put an ICON with a TOOLTIP.
CRITICAL = RED icon; INFORMATIONAL = BLUE 'i'. One element may carry BOTH at once, each showing
its own independent text."

All line numbers verified by reading the files on 2026-09-16.

---

## 0. Corrections to the previous (lost) run

| prior claim | verdict |
|---|---|
| `ui/tooltip.tsx` is a 28-line Radix re-export, only `TooltipContent` wrapped, `LAYER_TOOLTIP` z-[110] | **CONFIRMED** |
| `TooltipProvider` mounted once in `main.tsx` with `delayDuration={0}` | **CONFIRMED** — `main.tsx:27`, inside `QueueProvider`, outside `<App/>` |
| 14 files use `TooltipTrigger`, all wrapping an existing control | **CONFIRMED** (13 + the wrapper itself) |
| `FieldHint` is ~90% of the component | **CONFIRMED** — `ui/field-label.tsx:24-64` |
| Radix tooltip is broken on touch | **CONFIRMED in the installed source**: `node_modules/@radix-ui/react-tooltip/dist/index.mjs` contains `pointerType === "touch") return`, `isPointerDownRef.current = true` in `onPointerDown`, `!isPointerDownRef.current` guarding `onOpen`, and an `onClick` that closes. A tap opens nothing. |
| **"exactly 10 keys carry a warn sign"** | **WRONG — there are 16.** Measured on `ka.json` (2464 keys; `en.json` also 2464, in sync). The 6 the prior run missed: `fields.desc.board_game.links`, `gallery.castSearchNarrows`, `gallery.estimateOver`, `songs.docsInfo`, `translate.reviewWarn`, `translate.sourceNever`. All 16 use U+26A0 **plus** the U+FE0F variation selector; zero use the bare U+26A0. |
| "259 hint-like keys" | **270** by the regex `(Hint|hint|subtitle|Note|Desc|desc|explain|About)$` on the last segment. |

**@radix-ui/react-popover IS already a direct dependency** (`package.json`, `^1.1.23`), and it is already used raw twice: `components/Header.tsx:150-218` (the profile dropdown) and `components/ui/action-menu.tsx:29-60`. **There is no `ui/popover.tsx` wrapper** — both import `* as PopoverPrimitive` directly.

---

## 1. What already exists and MUST be reused

### 1a. The colours are already global and free

`src/index.css`, `@layer base` (lines 345-358):

    .lucide-triangle-alert,
    .lucide-circle-alert { color: var(--icon-warn); }   /* amber */
    .lucide-info         { color: var(--icon-info); }   /* BLUE  */

Token values (`index.css:40-47` light, `139-141` dark):

- `--icon-info` = `--status-watching` = **`#2f6b8f`** (light) / `#6aa6c8` (dark) → **the blue 'i' the user asked for already renders blue with no class at all.**
- `--icon-warn` = `--status-towatch` = `#b4791f` (amber) — **not red**.
- `--destructive` = `#a52714` (light) / `#e5674f` (dark) → **red**.

So the RED critical icon needs an explicit `text-destructive`. That is legal and is the documented pattern: CLAUDE.md records that static icon colours live in `@layer base` **precisely so** "a base-layer colour is a *default* that any component class overrides (the header's storage warning stays red at critical instead of turning amber)".

`index.css:603` also already gives `.lucide-info` a hover colour inside any `<button>`, so the trigger gets hover feedback for free.

### 1b. `ui/field-label.tsx` — `FieldHint` (the 90% component)

Lines 24-64. Shape:

    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" tabIndex={-1}
          aria-label={required ? t('form.requiredHint') : hint}
          className={cn('inline-grid size-4 shrink-0 cursor-help place-items-center rounded-md align-text-bottom transition-colors',
            required ? 'text-destructive hover:bg-destructive/15'
                     : 'text-muted-foreground hover:bg-muted hover:text-foreground', className)}>
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {required && <p className="font-medium text-destructive">{t('form.requiredHint')}</p>}
        {hint && <p className={cn(required && 'mt-1')}>{hint}</p>}
      </TooltipContent>
    </Tooltip>

It returns `null` when both `hint` and `required` are empty.

Four defects to carry forward:

1. `tabIndex={-1}` → keyboard-unreachable (defensible inside a form, wrong for a page-level icon).
2. Critical text hard-coded to `t('form.requiredHint')` — cannot carry an arbitrary critical sentence.
3. `text-muted-foreground` on the info branch **overrides** the free blue `--icon-info`. Under the new rule the info icon should be blue.
4. Both texts share ONE tooltip. The user's wording ("each showing its own **independent** text") reads as **two icons, two tooltips**.

**Blast radius: 179 `FieldLabel`/`FieldHint` call sites across 10 files** — `ActorWebPhotos.tsx`, `BoardGameForm.tsx`, `BookForm.tsx`, `GameForm.tsx`, `NoteForm.tsx`, `WebSourcePicker.tsx`, `BookmarksPage.tsx`, `MovieFormPage.tsx`, `SongsPage.tsx`, `VideosPage.tsx`. **Do not rewrite `FieldHint`'s props.** Make it a thin wrapper over the new component — all 179 sites then gain touch + keyboard for free.

### 1c. `ui/tabs.tsx:68-75` — `TabInfo`, an existing info-box primitive

    export function TabInfo({ children }) {
      return (<p className="mb-4 flex items-start gap-2 rounded-lg border border-dashed border-border bg-card/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" /><span>{children}</span></p>)
    }

Used 9x: `SongDetail.tsx:142,161,246`, `VideoDetail.tsx:167,187,270`, `GenresPage.tsx:176,207,208`. This is a *third* pattern — a dashed prose box that already carries an icon. A plausible conversion target, but NOT the thing to build on.

### 1d. `ui/step-section.tsx` — the counter-example

Its docblock records that the web-search dialog was unreadable because "context chips, the distribution block, the query, the source picker, three warnings and the grid" sat on one scroll at equal weight. `StepSection.hint` is what fixed it. **Hiding a step's `hint` behind an icon would undo that fix.** This is the anchor for "some text must stay prose".

### 1e. `lib/layers.ts`

`LAYER_POPUP` = `z-[100]`, `LAYER_TOOLTIP` = `z-[110]`. Literal strings (Tailwind reads classes from source). A hint opened from inside a modal/lightbox needs 110.

### 1f. `lib/actionStyle.ts` — the repo's severity vocabulary

`view`/`update` → `var(--icon-info)`, `create` → `var(--icon-ok)`, `delete` → `var(--destructive)`. Its docblock: **"colour is meaning, not decoration"**. The same rule governs this work.

---

## 2. The touch problem and the component design

### Why not Tooltip

Verified above: a tap opens nothing. Also `FieldHint`'s `tabIndex={-1}` makes it keyboard-dead. A page-level explanation only a mouse can reach is not an explanation.

### Why not a Tooltip+Popover hybrid

Two layers means the same text rendered twice plus a controlled `open` on the Tooltip to suppress it while the Popover is up. More moving parts, and the text would exist in two DOM nodes.

### Recommended: one Popover, two triggers (hover + click/tap)

New file `frontend/src/components/ui/info-hint.tsx`:

    export function InfoHint({ info, critical, side = 'top', className, label }: {
      /** BLUE 'i' — explanatory. Already-translated text, never a key. */
      info?: ReactNode
      /** RED triangle — critical. Already-translated text, never a key. */
      critical?: ReactNode
      side?: 'top' | 'right' | 'bottom' | 'left'
      className?: string
      /** aria-label override; defaults to t('common.info') / t('common.warning') */
      label?: string
    })

- Renders **nothing** when both are empty (`FieldHint`'s existing rule; `lib/fields.ts:27-28` — "an empty tooltip is worse than no icon").
- With both given, renders **two adjacent triggers**: critical first (severity leads), then info. Each is its own `PopoverPrimitive.Root` with its own content → literally "each showing its own independent text".
- Trigger: `<button type="button">` (an untyped `<button>` inside a form submits — `field-label.tsx`'s recorded lesson), `size-4`, `rounded-md`, `cursor-help`.
- Icons: `<Info className="size-3.5" />` (blue for free from `@layer base`) and `<AlertTriangle className="size-3.5 text-destructive" />` (the component class overrides the amber base default).
  - **Different glyph, not just a different colour.** The repo's own rule from the roles work: "the icon says the same, because colour alone means nothing to a colour-blind reader."
  - lucide's class comes from the **icon id**, not the React alias — `AlertTriangle` renders `lucide-triangle-alert`. CLAUDE.md records three rules that were silently dead from exactly this mistake. `lucide-triangle-alert` is already styled at `index.css:347`, so this name is correct.
- Content: `PopoverPrimitive.Portal` → `Content` with `LAYER_TOOLTIP` and the same visual as `TooltipContent` (`max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md`).
- **Controlled `open`**: `onMouseEnter` opens, `onMouseLeave` closes (on the trigger **and** the content, so the pointer can travel into it to read or select text); click/tap toggles and pins.
- **`onOpenAutoFocus={(e) => e.preventDefault()}` is mandatory.** The repo already learned this — `GlobalSearch.tsx:61`: "`Popover` is deliberately not used here: it takes focus to itself and typing in the field was interrupted." Without it a hover would yank focus out of whatever the user was doing.
- Keep Radix's default `modal={false}` (what `ActionMenu` uses) — no focus trap, no `pointer-events:none` on `<body>`, so it composes inside `ModalShell`.
- Keyboard: real `tabIndex` (0). Radix Popover's trigger opens on Enter/Space and closes on Escape.

`FieldHint` then becomes:

    export function FieldHint({ hint, required, className }) {
      const { t } = useTranslation()
      return <InfoHint info={hint} critical={required ? t('form.requiredHint') : undefined} className={className} />
    }

179 call sites unchanged; they gain touch + keyboard. The one visible change is that a required field now shows a red **triangle** rather than a red `i`, and the two texts sit in two tooltips instead of one stack. Flag this to the user first — it is a deliberate consequence of their own "each showing its own independent text".

### Testing

`vitest.config.ts` includes `src/**/*.test.ts` only (not `.tsx`). Precedents for component tests written as `.ts` with `createElement`: `ui/modal-shell.test.ts`, `components/gallery/GroupsCut.test.ts`, `components/NoteReminders.test.ts`. A test asserting that **a click/tap opens the content** is worth writing — that is exactly the defect Radix Tooltip has, and nothing else would catch a regression back to `Tooltip`.

---

## 3. The classification rule

> **An icon may hide text the reader can act without. Prose is required when the text is needed to
> perform the action that is on screen right now.**
>
> Text stays visible prose when any of these is true:
>
> 1. **It is conditional** — it appears because of the current state (an over-quota estimate, a "source
>    unavailable" notice). State is not documentation; hiding it means the user never learns why.
> 2. **It is a step's instruction** — `StepSection.hint`, a form field's "how to fill this in". §5's whole
>    point was making the order of work readable.
> 3. **It is a live fact** — a count, a name, a quota number.
> 4. **It is an empty state's explanation** — `EmptyState` exists to say what to do next.
>
> Everything else — the standing description of a section, a policy note, a "by the way, this also
> means…" — becomes an icon.
>
> Then, of the text that becomes an icon:
> **RED (`AlertTriangle`, `text-destructive`) when ignoring it can lose data, spend money or quota, expose
> something, or produce a result the user cannot undo. BLUE (`Info`) for everything else.**
>
> **The ⚠️ character in the locale is a hint, not the rule.** Of the 16 keys carrying it, several are plainly
> informational (`gallery.bySourceHint` explains why an actor appears in two groups;
> `fields.desc.board_game.links` is a field description). Classify by the four tests above, then strip the
> ⚠️ character from the string — the red triangle *is* the sign, and keeping both says it twice.

---

## 4. Conversion inventory

### 4a. The key shape: most of these strings must be SPLIT

The most important finding. Several hints already pack an informational sentence **and** a critical clause into a single string — i.e. the "one element, two independent texts" the user described already exists in the data, just fused. Conversion = **split the key**: `X` (blue) + `XWarn` (red). `translate.reviewWarn` already establishes the `Warn` suffix.

| key | EN text | split |
|---|---|---|
| `audit.subtitle` | "Who changed what and when. ⚠️ The log is kept forever — cleanup is manual only." | blue `audit.subtitle` + red `audit.subtitleWarn` |
| `chat.subtitle` | "Private messages. ⚠️ You can only write between two public profiles." | blue + red `chat.subtitleWarn` |
| `purge.keepGalleryHint` | "The record goes, its photos move to 'uncategorized'. ⚠️ No space is freed — the files stay on disk." | blue + red `purge.keepGalleryWarn` |
| `fields.publicHint` | "…this field disappears from your public card and from matches. ⚠️ The record's own visibility is a separate switch." | blue + red |
| `fields.requiredHint` | "The form won't let this field through empty. ⚠️ This is your own rule, not a database constraint…" | blue + red |
| `uploads.hint` | "What the server accepts… ⚠️ Decided by the app's rule and PHP's php.ini together…" | blue + red |
| `roles.adminSectionsHint` | "Not modules. ⚠️ 'All modules' does not open these… Bulk delete and the global module switches stay super-admin only." | blue + red `roles.adminSectionsWarn` |
| `gallery.bySourceHint` | "Whether a photo came from a film or a series. ⚠️ A cast photo hangs off the actor…" | **blue only** — the ⚠️ clause is explanatory, not critical. Strip the sign. |
| `web.pagesHint` | "Up to {{max}}. ⚠️ Each page costs one credit." | blue (keeps `{{max}}`) + red `web.pagesCostWarn`. The `{{max}}` interpolation must stay on the half that is called with `{ max }`, or audit check #5 fires. |

### 4b. Page-level: `PageHeader` subtitles (28 call sites)

**`PageHeader` renders `subtitle` as `<p className="truncate text-sm text-muted-foreground">`** (`ui/page-header.tsx`, inside the `min-w-0 flex-1` column, below the `<h1>` and the optional eyebrow). It is **`truncate`-d** — so `audit.subtitle` (81 chars), `chat.subtitle` (67) and `purge.subtitle` (64) are **already being cut off with an ellipsis today**. Moving them to an icon *recovers* information rather than hiding it. This is the single strongest argument for the change.

`PageHeader` needs one new optional prop, e.g. `hint?: ReactNode`, rendered **on the title row next to `<h1>`** — not in the subtitle slot, because a `<button>` inside a `truncate`d `<p>` would clip.

Split the 28 by the rule in §3:

**STAYS (a live fact, rule 3) — 11 sites:** `LibraryPage.tsx:245` (`countLabel`), `BoardGamesPage.tsx:215`, `BookmarksPage.tsx:228`, `BooksPage.tsx:220`, `GamesPage.tsx:215`, `NotesPage.tsx:232`, `SongsPage.tsx:236`, `VideosPage.tsx:321` (all `<module>.count`), `SearchPage.tsx:126` (`search.found`), `BackupsPage.tsx:135` (`backups.subtitle` with `{database}`), `gallery/GroupsCut.tsx:336` (`gallery.photos` count).

**CONVERTS to an icon — 17 sites:**

| file:line | key | icon |
|---|---|---|
| `pages/AuditPage.tsx:152` | `audit.subtitle` | **blue + RED** (split) |
| `pages/PurgePage.tsx:415` | `purge.subtitle` — "⚠️ This cannot be undone. Check the scope first, then confirm." | **RED only** (pure critical) |
| `pages/ChatPage.tsx:76` | `chat.subtitle` | **blue + RED** (split) |
| `pages/TranslationsPage.tsx:62` | `translate.pageHint` — "TMDB first, then Gemini. Existing text is never overwritten." | blue |
| `pages/SyncPage.tsx:40` | `settings.syncHint` | blue |
| `pages/PeoplePage.tsx:122` | `people.subtitle` | blue |
| `pages/RolesPage.tsx:90` | `roles.subtitle` | blue |
| `pages/CredentialsPage.tsx:72` | `credentials.subtitle` | blue |
| `pages/SettingsPage.tsx:82` | `settings.subtitle` | blue |
| `pages/ModulesPage.tsx:87` | `modules.subtitle` / `modules.subtitleAdmin` | blue |
| `pages/PlaylistsPage.tsx:83` | `playlists.subtitle` | blue |
| `pages/UsersPage.tsx:144` | `admin.usersSubtitle` | blue |
| `pages/RequestsPage.tsx:127` | `admin.requestsSubtitle` / `…User` | blue |
| `pages/DictionariesPage.tsx:150` | `dictionaries.navHint` | blue |
| `pages/DictionariesPage.tsx:370` | `dictionaries.subtitle` / `…Statuses` | blue |
| `pages/StatusBulkPage.tsx:76` | `bulkStatus.subtitle` / `bulkVideo.subtitle` | blue |
| `gallery/AlbumsCut.tsx:152,184` · `gallery/GroupsCut.tsx:513` | `gallery.albumHint`, `gallery.mixedHint` | blue |

(`gallery/GroupsCut.tsx:414` passes a raw title as `subtitle` — not a hint, leave it.)

### 4c. The four the user named

| file:line | current | becomes |
|---|---|---|
| `pages/RolePage.tsx:253` | `<p className="mt-1 text-xs text-muted-foreground">{t('roles.permissionsHint')}</p>` under the `roles.permissions` `<h2>` | **blue icon beside the `<h2>`** |
| `pages/RolePage.tsx:359` | `<p className="mb-2 text-[11px] text-muted-foreground">{t('roles.adminSectionsHint')}</p>` under the `roles.adminSections` label | **blue + RED beside the label** (split; the "super-admin only" clause is critical) |
| `pages/AuditPage.tsx:152` | `PageHeader subtitle` | see 4b |
| `pages/TranslationsPage.tsx:62` | `PageHeader subtitle` | see 4b |

`pages/RolePage.tsx:267` `roles.superAdminHint` is a bordered callout inside a conditional (`locked ?`) — **stays prose** (rule 1).

### 4d. In-page prose blocks — the full pool

The narrow pattern `<p class="…text-(xs|[11px]|sm)…text-muted-foreground…">{t('…Hint|hint|Info|Note|Warn|subtitle')}</p>` matches **79 occurrences**. Notable ones located:

| file:line | key | verdict |
|---|---|---|
| `components/UploadLimitsCard.tsx:37` | `uploads.hint` | blue + RED (split) |
| `components/StorageCard.tsx:100,124,235,300,412` | `storage.hint`, `recalcHint`, `filesHint`, `requestHint`, `orphansHint` | blue; `orphansHint` → **RED** (cleanup deletes files) |
| `components/StorageAllocations.tsx:87` | `storage.allocationsHint` | blue |
| `components/VisibilityManager.tsx:191` | `visibility.manageHint` | blue |
| `components/PublicProfileCard.tsx:79,85` | `publicProfile.subtitle`, `enableHint` | blue; `enableHint` → consider **RED** (it publishes data) |
| `components/gallery/GroupsCut.tsx:502,503` | `gallery.bySourceHint`, `byProviderHint` | blue |
| `components/gallery/ModulesCut.tsx:64` | `gallery.byModuleHint` | blue |
| `components/gallery/AlbumsCut.tsx:166` | `gallery.albumsHint` | blue |
| `components/gallery/AlbumPicker.tsx:160` | `gallery.albumLockedMoveHint` | **RED** (the photo vanishes from view) |
| `components/gallery/GalleryMoveDialog.tsx:134` | `gallery.moveHint` | blue |
| `components/CustomFieldsEditor.tsx:131` | `customFields.editorHint` | blue |
| `components/GenreItemsManager.tsx:300` | `genres.newItemsHint` | blue |
| `components/NoteChannelsDialog.tsx:80,109` | `notes.browserHint`, `telegramHint` | blue |
| `components/NoteNotificationsDialog.tsx:48` | `notes.logHint` | blue |
| `components/StatusDialog.tsx:112,168` | `statuses.roleHint`, `isDefaultHint` | blue (`roleHint` is arguably rule 2 — it explains the control right above it) |
| `components/WebQuotaCard.tsx:51` | `web.quotaHint` | blue |
| `components/MatchPanel.tsx:92` | `matches.percentHint` | blue |
| `pages/UserPage.tsx:195,240,307,316,355,366` | `admin.storageHint`, `storage.quotaHint`, `admin.permissionsHint`, `admin.userModulesHint`, `admin.filesHint`, `admin.userRequestsHint` | blue |
| `pages/UsersPage.tsx:296` | `admin.userTableHint` | blue |
| `pages/SettingsPage.tsx:98,238,299` | `settings.defaultsHint`, `listsHint`, `mediaHint` | blue (section headers) |
| `pages/CredentialsPage.tsx:104,318` | `credentials.installationHint`, `usageHint` | blue |
| `pages/ModulePage.tsx:589,602` | `fields.requiredHint`, `fields.publicHint` | blue + RED (split) |
| `pages/ModulePage.tsx:320,335` | `admin.userModulesHint` | blue |
| `pages/PurgePage.tsx:588` | `purge.keepGalleryHint` | blue + RED (split) |
| `pages/DictionariesPage.tsx:384` | `dictionaries.sectionsHint` | blue |
| `pages/RolesPage.tsx:276` | `roles.addHint` | blue |
| `pages/MoviePage.tsx:333` | `parts.watchOrderNote` | blue |
| `pages/PlaylistPage.tsx:162` | `playlists.addHint` | blue |
| `components/BoardGameDetail.tsx:113,119` · `BookDetail.tsx:52,58` · `GameDetail.tsx:170,176,182` | `*.galleryHint`, `rulesHint`, `filesHint`, `notesHint`, `videosHint`, `docsHint` | blue (section captions) |

**STAY AS PROSE** (rules 1/2/4):

- `components/GalleryDownloadDialog.tsx:749` `gallery.estimateOver` — rendered `{!plan.fits && <span className="block text-xs text-destructive">}`. Conditional, state-driven, already red. **Do not hide.**
- `components/GalleryDownloadDialog.tsx:677` `gallery.castSearchNarrows` — appears only when a search term narrows the pool.
- `components/TranslateDialog.tsx:214` `translate.reviewWarn` — the one mode that overwrites text; it sits beside the toggle that arms it.
- `components/GalleryDownloadDialog.tsx:447,692,708` — `scopeOffHint`, `perActorHint`, `castSizeHint`: field-level "how to fill this in" inside a step.
- Every `*.lookupHint`, `*.urlHint`, `*.tagsDedupeHint`, `form.ge_urlHint`, `form.trailer_urlHint`, `games.hltbHint`, `cast.billingOrderHint`, `notes.tagsHint`, `profile.bioHint`, `playlists.songHint`, `games.franchiseAddHint` — rule-2 instructions under an input. If converted at all they should go through **`FieldLabel`'s existing `hint` prop** (which already produces an icon), not a new page-level one.
- `components/MatchPanel.tsx:47` / `pages/PeoplePage.tsx:50` `matches.needPublicHint` — empty state (rule 4).
- `pages/PublicProfilePage.tsx:120` `publicProfile.notFoundHint` — empty state.
- `pages/ModulePage.tsx:235` `modules.noAccessHint` — empty state.
- `pages/RolePage.tsx:267` `roles.superAdminHint` — conditional callout.
- `ui/step-section.tsx` `hint` (all `StepSection` call sites) — rule 2, §5's fix.
- `ui/tabs.tsx` `TabInfo` ×9 — borderline. They are standing descriptions (rule says convert) but they already carry an icon and sit at the top of a tab body where they read as a caption. **Recommend leaving them** and revisiting after the page-level pass; converting them is a separate, low-value change.

---

## 5. i18n audit compliance (`frontend/src/i18n/audit.py`)

Six checks. What matters here:

- **Check 1 (static `t('x')` missing from the locale)** — every new `*Warn` key must be added to **both** `ka.json` and `en.json`.
- **Check 3 (ka/en drift)** — one-sided keys are a failure. Both files currently hold **2464** keys.
- **Check 4 (key-like literal outside `t()`)** — **this is the trap.** If `InfoHint` took a `tKey="audit.subtitle"` prop, the literal would be scanned by `LIT_RE`. It happens to be excused (the `key not in ka` condition fails, since the key *is* in ka), but a **new** key referenced only from a map and never from `t()` would fire. **Therefore `InfoHint` must take already-translated `ReactNode`/`string`, exactly as `FieldHint` takes `hint?: string`. Never a key.**
- **Check 5 (interpolation mismatch)** — `web.pagesHint` carries `{{max}}` and is called at `components/WebImageDialog.tsx:380` as `t('web.pagesHint', { max: WEB_MAX_PAGES })`. When splitting, `{{max}}` must stay on the half that keeps that call. Splitting it wrong prints a literal "{{max}}" on screen.
- **Checks 2/6 (dynamic prefixes)** — not affected as long as the new keys are static.
- The audit does **not** flag unused keys, so a key that stops being passed to `t()` is not an error. Still, delete the fused originals once split, or they become drift.

**Locale files are 2-space JSON with CRLF.** CLAUDE.md: a Python round-trip must use `json.dumps(..., ensure_ascii=False, indent=2)` and write with `newline='\r\n'`, or the whole file shows as changed.

**The audit reports missing and one-sided keys, but NOT empty values.** `dictionaries.navHint` was an empty string in `ka` and stayed green. Check the new keys are non-empty in both files by hand.

New generic keys likely needed: `common.info`, `common.warning` (aria-labels for the two triggers).

---

## 6. Rules this work must not violate

- **`lib/layers.ts` is the only place a z-index is decided**, and Tailwind reads classes from source — `z-[110]` must be a literal, never templated.
- **Icon colour and motion are decided in `index.css` only.** Do not write a per-call-site hover colour. The blue is already free; the red is a component-class override of the base-layer default, which is the documented mechanism.
- **The lucide class is the icon id, not the React alias** — `AlertTriangle` → `lucide-triangle-alert`. Verify with `grep -oE 'createLucideIcon\("[a-z0-9-]+"' node_modules/lucide-react/dist/cjs/lucide-react.js`.
- **`<button type="button">`** — inside a form an untyped button submits.
- **A component that renders a portal must own both the state and the JSX** (the `GroupsCut` live bug). `InfoHint` is self-contained, so this holds by construction — but if a page hoists the open state, it must render the content in every return branch.
- **No underlines anywhere** — `grep -rn "underline" src` must stay clean.
- **Rounding**: `rounded-md` (= `var(--radius)` = 5px). `rounded-full` is reserved for the 13 documented avatar/switch/radio cases.
- **An empty hint renders no icon** (`lib/fields.ts:27-28`: "an empty tooltip is worse than no icon").
- **Georgian comments** in new files, matching the repo.

---

## 7. Open questions for the user

1. **Two icons or one?** "each showing its own independent text" reads as two adjacent icons (red then blue), each with its own tooltip. `FieldHint` today stacks both texts in one tooltip on one icon. Confirm before touching 179 call sites.
2. **Does the required-field marker change glyph?** Under the new rule a required field shows a red **triangle** instead of today's red `i`. That is 179 sites.
3. **`TabInfo` (9 sites)** — convert its dashed prose boxes to icons too, or leave them?
4. **Field-level hints under inputs** (`*.lookupHint`, `*.urlHint`, ~30 sites) — fold into `FieldLabel`'s existing `hint` icon, or leave as prose (they are rule-2 instructions)?
