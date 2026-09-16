# chat-parity — recon (2026-09-16)

Scope: what the chat feature is TODAY, and what each of the user's 12 asks costs.
Everything below was read from source, not from CLAUDE.md.

---

## 1. What exists today (inventory)

### 1.1 Schema — 5 tables, 3 migrations

`backend/database/migrations/2026_09_06_000001_create_chat_tables.php`

| table | columns |
|---|---|
| `conversations` | `id`, `last_message_at` (nullable dateTime, indexed), timestamps |
| `conversation_user` | `id`, `conversation_id` FK cascade, `user_id` FK cascade, **`last_read_at`** (nullable dateTime), timestamps; `unique(conversation_id,user_id)`, `index(user_id,conversation_id)` |
| `messages` | `id`, `conversation_id` FK cascade, `user_id` FK cascade, `type` varchar(20) default `text`, `body` text nullable, `attachment_path`, `attachment_name`, `attachment_mime` varchar(120), `attachment_size` unsignedBigInteger, timestamps; `index(conversation_id,id)` |
| `user_blocks` | `user_id`, `blocked_user_id` (FK users), `unique(user_id,blocked_user_id)` |

`2026_09_10_000002_add_message_removal.php` adds `messages.removed_at`, `removed_by` (FK users nullOnDelete), `removed_scope` (later dropped), `index(conversation_id, removed_at)`.

`2026_09_14_000002_split_message_self_removal.php` creates **`message_hides`** (`message_id`, `user_id`, `hidden_at`, `unique(message_id,user_id)`, `index(user_id,message_id)`) and drops `removed_scope` on MySQL only.

**The load-bearing precedent for every new per-viewer fact is that last migration's own docblock:**
"ცხრილი და არა ორი სვეტი. ორი სვეტი (`hidden_by_a`/`hidden_by_b`) „მონაწილე ზუსტად ორია"-ს ჩააკერებდა სქემაში."

Any new "what *I* call you / what *I* see" fact must obey it. See §3.2 (nicknames).

DB charset is `utf8mb4` / `utf8mb4_unicode_ci` (`backend/config/database.php:56`), so emoji in `messages.body` already store correctly — no schema work for emoji text.

### 1.2 Models

- `backend/app/Models/Conversation.php` (52 lines) — `participants()` belongsToMany with `withPivot('last_read_at')`, `messages()`, `lastMessage()`, `has(int $userId)`, `otherThan(int $userId)`. **No `BelongsToUser`** — access is participation, checked explicitly.
- `backend/app/Models/Message.php` (87) — `TYPES = ['text','emoji','gif','image','video','file']`, `MEDIA_TYPES = ['image','video','file']`, `REMOVAL_SCOPES = ['self','both']`, `hides()` hasMany, **`scopeVisibleTo(Builder, int $userId)`** (`whereNull('removed_at')` + `whereDoesntHave('hides', user)`), `attachmentDeleted()`, `conversation()`, `author()`.
- `backend/app/Models/MessageHide.php` (43) — `$timestamps = false`, deliberately no `BelongsToUser`.
- `backend/app/Models/UserBlock.php` (20).

### 1.3 `backend/app/Services/Chat/ChatService.php` (288 lines)

`between()` · `send()` · `deleteAttachment()` · `deleteMessage()` · `markRead()` · **`unreadCounts()`** · `block()`/`unblock()`/`blockedBetween()`/`iBlocked()` · **`guard()`** (the single gate: not-self → 422 `cannot_chat_with_self`; both profiles public → 409 `profile_not_public`; block in either direction → 403 `chat_blocked`) · `resolve(username)` · `fail(code, status)`.

`unreadCounts()` is a raw `DB::table('messages')` query joining `conversation_user`, excluding own messages, `whereNull('messages.removed_at')`, `whereNotExists` over `message_hides`, and comparing `created_at > last_read_at`. **It is the only place unread is computed** — the sidebar badge and the conversation list both come from it. Mute must be applied here or nowhere.

### 1.4 `backend/app/Http/Controllers/Api/ChatController.php` (338 lines)

| method | route | notes |
|---|---|---|
| `index` | `GET /api/chat` | list + `unread_total`; last message is `visibleTo($me)` |
| `unread` | `GET /api/chat/unread` | just the number (30 s poll) |
| `open` | `POST /api/chat/with/{username}` | |
| `messages` | `GET /api/chat/{conversation}` | `paginate(min(max(per_page,1),100))`, default 50, `orderByDesc('id')`; **also calls `markRead()`** |
| `send` | `POST /api/chat/{conversation}` | one endpoint; the presence of `file` picks the branch |
| `file` | `GET /api/chat/files/{message}` | the ONLY way a private chat file leaves the server; `inline` disposition |
| `deleteFile` | `DELETE /api/chat/files/{message}` | |
| `deleteMessage` | `DELETE /api/chat/messages/{message}` | `scope` required; writes `AuditLog::ACTION_CHAT_DELETE` |
| `read` | `PATCH /api/chat/{conversation}/read` | |
| `block` | `PUT /api/chat/block/{username}` | |

Private: **`payload(Message $m, int $meId)`** (line 295) — the single message shape: `id, type, body, mine, attachment{url,name,mime,size}, attachment_deleted, attachment_name, created_at`. **Every new per-message fact (reactions, pinned) goes here and only here.**

Routes: `backend/routes/api.php:752–767`, inside `auth:sanctum`, deliberately **no `module:`/`permission:` middleware** (chat is not a module). The ordering rule is already written there: `/chat/unread`, `/chat/with`, `/chat/files`, `/chat/messages` must stay **above** `/chat/{conversation}`.

### 1.5 Storage rules already in force

- `StorageFolder::PRIVATE_ROOTS = ['notes','chat','backups']` (`backend/app/Support/StorageFolder.php:144`).
- `StorageFolder::chatFiles(string $type)` (line 317) → `CHAT_IMAGES` / `CHAT_VIDEOS` / `CHAT_DOCS`.
- `StorageMeter::referencedPaths()` contains `'messages.attachment_path'` (line 1008) — without it the admin orphan cleanup would delete live chat files.
- `StorageMeter::deleteResolved()` has a `message` branch (line 738) that clears the columns and releases the recorded `attachment_size`; the storage module key is the pseudo-module **`chat`** (line 476).
- Upload caps come from `UploadLimits` (`image` 8 MB, `video` 100 MB, `doc` 20 MB) via `UploadLimits::rule()` / `effectiveKb()`; chat deliberately does **not** restrict document mimes (`ChatController` lines 180–183).

### 1.6 Frontend

- `frontend/src/api/chat.ts` (179) — `MESSAGE_TYPES`, `MEDIA_TYPES`, `ChatAttachment`/`ChatMessage`/`ChatConversation`/`ChatThread`, `attachmentUrl()`, `fetchConversations`, `fetchChatUnread`, `openConversation`, `fetchThread(id, page=1)`, `sendMessage`, `sendAttachment`, `deleteAttachment`, `deleteMessage`, `mediaTypeOf`, `markThreadRead`, `setBlocked`.
- `frontend/src/pages/ChatPage.tsx` (527) — `ChatPage` (list + thread grid), `ConversationRow`, `Thread`, `DeleteButton`, `Bubble`, `Notice`. Polls: thread 5 s, list 15 s.
- Consumers: `components/Sidebar.tsx` (`fetchChatUnread`, 30 s, line 229) and `pages/PublicProfilePage.tsx` (`openConversation`, line 47).
- `lib/toolSections.ts:69` — `chat: { color: 'var(--tool-chat)', icon: MessageSquare }`.
- i18n `chat.*` exists in both locales (34 keys), including an unused `chat.write` and the full `chat.type.{text,emoji,gif,image,video,file}` map.

### 1.7 Tests

`backend/tests/Feature/ChatTest.php` — 17 tests: creation, unread, outsider 404, the public-profile gate, self-chat, blocking both ways, list shape, private media + sender quota, attachment delete, text-still-sends-when-quota-full, self-hide isolation, double-hide, hidden≠unread, authorship for `both`, `scope` required, removed≠unread.

No frontend chat test exists.

---

## 2. Live defects and dead code found while reading (not on the user's list, but cheap and relevant)

1. **The SPA can never read past the newest 50 messages.** `ChatPage.tsx:169` calls `fetchThread(id)` with the default page; `meta.last_page` is returned by the API and never used. There is no "load older" control anywhere. *This is the hidden prerequisite for search-in-chat and for "jump to a pinned message".*
2. **Auto-scroll yanks the reader down.** `ChatPage.tsx:176-178` — `useEffect(() => bottom.current?.scrollIntoView({block:'end'}), [thread.data?.data.length])`. Two problems: (a) with `placeholderData: keepPreviousData`, switching to another conversation whose page has the **same length** does not re-fire the effect, so you can land mid-thread; (b) the 5 s poll grows the length, so an incoming message scrolls you to the bottom even while you are reading history.
3. **`markThreadRead()` in `api/chat.ts:171` has zero callers** — `ChatController::messages()` already marks read on every GET. Dead export (and the `PATCH /chat/{id}/read` route is therefore unused by the SPA).
4. **"Seen" is one line away and not shipped.** `conversation_user.last_read_at` exists for both sides but is never returned to the client. The other participant's `last_read_at` would give Messenger's read receipt for free.
5. **Message types `emoji` and `gif` are validated (`ChatController:163`) and translated (`chat.type.*`) but nothing in the UI ever sends them.**
6. Chat is deliberately **absent from `Services/Search/GlobalSearch`** (0 hits for `Message::class`). Correct — private messages must not surface in the cross-module search — and a per-conversation search must stay separate from it.

---

## 3. The 12 asks — status and mechanism

| # | ask | status |
|---|---|---|
| 1 | chat media | **EXISTS** |
| 2 | file/video/photo upload | **EXISTS** |
| 3 | go to the other person's profile | **EXISTS** (`ChatPage.tsx:263`) |
| 4 | open at the last message (auto-scroll) | **PARTIAL** (buggy — §2.2) |
| 5 | emoji | **PARTIAL** (types + i18n exist, no picker; utf8mb4 already fine) |
| 6 | mute / unmute | **MISSING** |
| 7 | search inside a chat | **MISSING** |
| 8 | pin messages | **MISSING** |
| 9 | pinned list | **MISSING** |
| 10 | chat themes | **MISSING** |
| 11 | reactions ("ემოკი") | **MISSING** |
| 12 | nicknames | **MISSING** |

### 3.1 Mute — `conversation_user.muted_at` + `muted_until` (columns, NOT a settings JSON)

**Recommendation: two real columns on the pivot, not a JSON blob.**

Reason, in the repo's own terms: mute must be **queried**, not merely displayed. `ChatService::unreadCounts()` is a raw `DB::table()` join and the header badge sums its result. A mute stored inside a JSON blob cannot take part in that query without driver-divergent JSON SQL, and the project has already been bitten by exactly that class of bug (`GlobalSearch::jsonLike()`'s "the number of backslashes depends on the engine" — one pattern working on MySQL and silently failing on the sqlite test DB). `bookmarks.domain` is the same precedent: "`domain` is a column, not an accessor. Grouping and filtering happen on it, which SQL cannot do without a column."

Two columns rather than one, because there are two facts and no sentinel is acceptable:
- `muted_at` nullable dateTime — `NULL` = not muted.
- `muted_until` nullable dateTime — `NULL` **while `muted_at` is set** = muted indefinitely.

Predicate in exactly one place (e.g. `ChatService::mutedExpression()`): `muted_at IS NOT NULL AND (muted_until IS NULL OR muted_until > now())`. A single `muted_until` column would force "forever" to be a sentinel date (`9999-12-31`), which the repo refuses on principle (the review mode's "a marker like NO_CHANGE would eventually land in somebody's synopsis").

Where it applies:
- `GET /chat/unread` (`ChatController::unread`) — **muted conversations are excluded from the badge sum.** That is the entire user-visible effect, since there are no push notifications here.
- `GET /chat` — the per-row `unread` count **stays honest** (Messenger shows it too) and the row gains `"muted": true` so the SPA can dim it and draw a crossed bell. This is the repo's own "the counts stay honest" rule from the locked-album work.
- Endpoint: `PUT /api/chat/{conversation}/mute` with `{ muted: bool, until?: iso8601|null }`. **PUT/PATCH, not POST** — the standing rule about `EnsureModulePermission` deriving `create` from POST (chat carries no such middleware today, but `PATCH /chat/{id}/read` already follows the convention and consistency costs nothing).

Cost: 1 migration, ~15 lines in `ChatService`, 2 lines inside `unreadCounts()`, 1 endpoint, 1 button + a duration dropdown in `ChatPage`, ~6 i18n keys ×2.

### 3.2 Nicknames — its own table, `conversation_nicknames`

**Recommendation: `conversation_nicknames (id, conversation_id, user_id /* whose view */, target_user_id, nickname varchar(60), timestamps)` with `unique(conversation_id, user_id, target_user_id)`.**

This is *literally* the `message_hides` decision repeated. A nickname is a per-viewer fact about *another participant*. Putting it on `conversation_user` (my pivot row → "the name I gave the other guy") only works because there are exactly two participants — the assumption the schema deliberately refuses to bake in (see the 2026-09-14 migration docblock quoted in §1.1, and the original migration's "participants live in a pivot and not in `user_one_id`/`user_two_id`").

- Read path: `ChatController::index()` and `messages()` already call `PublicProfileService::header($other)` (which returns `username`, `display_name`, `avatar_path`, `bio`, `joined_at`). The nickname overrides `display_name` **inside the chat only**, and the payload should carry **both** (`display_name` + `nickname`), so the UI can show "ნინო (Nino Q.)" and a stranger's real identity is never lost.
- Endpoint: `PUT /api/chat/{conversation}/nickname/{username}` body `{ nickname: string|null }`; `null` deletes the row (the repo's "an empty value deletes the row" rule from custom fields).
- Validation `max:60`. It is display-only — **never** searchable and never global.
- One helper, `chatDisplayName(profile)`, used by `ConversationRow`, the thread header and the message author; three call sites deciding independently is how the two names drift.

Cost: 1 migration + 1 model, ~20 lines of controller, 1 modal reusing `ModalShell`, ~5 i18n keys ×2.

### 3.3 Themes — `conversations.theme` varchar(32) nullable

**Recommendation: one column on `conversations` (shared by both sides), a fixed key list, never a client-supplied hex.**

- Messenger/Instagram themes are shared, not per-viewer. One column, no table.
- The value is a **key** (`'default'|'ocean'|'sunset'|…`) validated against a PHP constant `Conversation::THEMES`, mirrored in TS as `as const satisfies` — the same mirroring pattern `PURGE_TARGET_MODES` uses so `tsc` fails when the two maps drift.
- The colours live in the SPA (a `Record<ThemeKey, {bubble, accent}>`) and travel to the DOM as **inline CSS variables**, never as a class — the repo's hard rule ("Tailwind cannot generate a class from a hex"), already implemented twice: `modAccent()` in `lib/modules.tsx` and `toolAccent()` in `lib/toolSections.ts`. Copy that mechanism; do not invent a third.
- Do **not** accept a free hex: it would need validation, contrast checking in both themes, and it cannot become a Tailwind class anyway.
- Endpoint: `PUT /api/chat/{conversation}/theme` `{ theme: string|null }`.
- ⚠️ A dark-theme variant is mandatory — `index.css` already keeps a separate dark set for `--tool-*`; a single light-tuned palette would be an ink blot in dark mode (the §23 lesson, verbatim).

Cost: 1 migration, 1 endpoint, ~40 lines of colour map + the bubble classes in `ChatPage`, ~10 i18n keys ×2 (theme names).

### 3.4 Pins — `messages.pinned_at` + `pinned_by`, mirroring `removed_at`/`removed_by`

- Migration: `messages.pinned_at` timestamp nullable, `pinned_by` FK users nullOnDelete, `index(conversation_id, pinned_at)` — the exact shape of the 2026-09-10 removal migration, so the casts and queries look the same.
- Pinning is **conversation-wide** (both sides see the pin — Messenger's semantics), so it belongs on `messages`, not on a per-viewer table.
- `ChatService::pin(Message, User, bool)`: participation is checked in the controller; **either** participant may pin — unlike `both`-delete, which needs authorship, because pinning is not destructive.
- Cap: `Message::MAX_PINS` (suggest 25) enforced in `ChatService`, 422 `too_many_pins`. ⚠️ **That code must be added to `frontend/src/lib/errors.ts`'s `CODES` array and to `errors.*` in BOTH locales**, or the toast shows the raw string (the repo's explicit rule).
- Pins list: `GET /api/chat/{conversation}/pins` — `->visibleTo($me->id)->whereNotNull('pinned_at')->orderByDesc('pinned_at')`. **Reusing `scopeVisibleTo` is what makes "I hid it / the author removed it for both" auto-unpin with no second write.**
- Payload: add `pinned_at` (and `pinned_by`) to `ChatController::payload()`. `payload()` is the one place the list, the send response and the pins endpoint all share.
- Endpoint: `PATCH /api/chat/messages/{message}/pin` `{ pinned: bool }`, declared next to `DELETE /chat/messages/{message}`, i.e. above `/chat/{conversation}`.
- Jumping from the pins list to the message needs §3.5's `around_id` primitive.

### 3.5 Search inside a chat (and the missing pagination primitive)

**`GET /api/chat/{conversation}/search?q=&per_page=`**

Reuse, do not re-invent:
- `Message::scopeVisibleTo($me->id)` — a message I hid must not be findable.
- **`App\Support\Snippet::around($text, $term)`** (`backend/app/Support/Snippet.php`, `WORDS = 7`, `SIDE_MAX_CHARS = 140`) — already `mb_*`-safe and already deliberately does *not* trim to a word boundary next to the match, so "ინ" inside "ინფორმაცია" still shows.
- The LIKE-escaping rule. ⚠️ `GlobalSearch::escape()` (line 709) and `GlobalSearch::like()` (line 669) are **`private`**. Extract them into `App\Support\Like::escape()/wrap()` and have `GlobalSearch` delegate — a second copy is exactly the duplication `DictionaryKey` and `SourceLog::request()` were created to kill. Escaping `\ % _` matters as much here: searching "50%" must not return the whole thread.
- Highlighting is the **client's** job via the already-unit-tested `frontend/src/lib/searchResults.ts::highlightParts()` (line 30) — `toLowerCase()` + `indexOf`, never a RegExp, so a query containing `(` is not read as a pattern. The server returns plain text (the project's hard rule: raw HTML is never sent).
- Search `body` **and** `attachment_name` (Messenger finds files by name).
- FULLTEXT stays unused (sqlite tests have none; the project's standing rule).

**The prerequisite nobody asked for but everything needs:** the thread endpoint must gain a cursor mode.
- `GET /chat/{conversation}?before_id=<id>` → the 50 messages older than that id (the "load older" button).
- `GET /chat/{conversation}?around_id=<id>` → ~25 either side (jump from a search result or a pin).
- Keep the page-numbered mode for backward compatibility; the `min(max(...,1),100)` clamp stays (the §B4 rule — `Query\Builder::limit()` silently ignores a negative value).
- ⚠️ `around_id` must **not** call `markRead()` — jumping into history is not "I read everything".

### 3.6 Reactions — `message_reactions`

`message_reactions (id, message_id FK cascade, user_id FK cascade, emoji varchar(32), created_at)`.

**Unique key: `unique(message_id, user_id)` — one reaction per person per message.**
Rationale: that is Messenger's and Instagram's semantics (the two the user named), it makes "remove my reaction" a single `DELETE` and the aggregate render trivial. The brief suggested `unique(message_id,user_id,emoji)` (Slack semantics, several per person); widening later is a safe additive migration (drop the 2-column unique, add the 3-column one), narrowing later is not. Start narrow.

- `emoji` is **varchar(32)**, not varchar(4): one ZWJ sequence such as 👨‍👩‍👧‍👦 is 25 bytes / 7 code points.
- Validate against a constant `Message::REACTIONS` (the 7 quick ones: 👍 ❤️ 😂 😮 😢 🙏 😡) with `Rule::in()`. An unvalidated `emoji` column is a free-text field. If free choice is wanted later, validate `grapheme_strlen() <= 2` instead — never leave it unbounded.
- Endpoint: `PUT /api/chat/messages/{message}/reaction` `{ emoji: string|null }` — `updateOrCreate` on `(message_id, user_id)`, `null` deletes. One endpoint for set/change/clear.
- Payload: `payload()` gains `reactions: [{emoji, count, mine}]`.
- ⚠️ **N+1 trap:** `payload()` runs per message, so `ChatController::messages()` must add `->with('reactions')` (and `index()`'s last-message load too), or a 50-message page fires 50 extra queries.
- Reacting must obey `guard()` (blocked → 403), so route it through `ChatService`, not straight from the controller.
- Audit: reactions are high-volume and cosmetic — do **not** add `MessageReaction` to `AuditRegistry::MODELS` (it would bury the log; `AuditRegistry` already maps `Conversation`/`Message`/`UserBlock` → `chat` at lines 166–168). Say so explicitly in the docblock, because `RegistryConsistencyTest` only enforces the *module* direction, not every model.

### 3.7 Emoji picker — the dependency question

`frontend/package.json` today has **no** emoji package. Relevant existing deps: `@radix-ui/react-popover` (already used by `Header.tsx`, `ui/action-menu.tsx`, `ui/date-picker.tsx`), `lucide-react`, `framer-motion`.

Candidates (these are the published figures and **must be verified locally with `npm i --no-save` + `npm run build` before committing** — the repo measured `react-aria-components` at a real **+49 kB gzip** and rejected `dnd-kit` over ~40 kB):

| library | shape | approximate cost |
|---|---|---|
| `emoji-picker-react` v4 | all-in-one component, emoji data bundled | **~100–110 kB gzip** — roughly two `dnd-kit`s; hard to justify against this repo's own precedent |
| `emoji-mart` + `@emoji-mart/react` + `@emoji-mart/data` | data is a separate ~800 kB JSON (~180 kB gzip) loaded async | ~16 kB gzip of code + a large async data fetch |
| `frimousse` | headless, tiny code | small code, but it **fetches emojibase data from a CDN at runtime** — an external network dependency for a self-hosted personal app, and no emoji at all offline |

**Recommendation: no dependency.** Build `frontend/src/components/ui/emoji-picker.tsx` on the `@radix-ui/react-popover` already in the tree, with a curated list of ~150–200 emoji in 6–8 categories in `frontend/src/lib/emoji.ts` as a plain `as const` array. Honest accounting of what that costs the user:

- A curated list is **not** searchable by name unless each entry carries keywords; 200 entries × 3 keywords is ~6 kB of source, ~2 kB gzip — cheaper than any library by an order of magnitude.
- It will **not** have skin-tone variants, the full ~3,700-emoji set, or a "frequently used" row unless written by hand (frequently-used is ~15 lines on `localStorage`).
- Rendering uses the OS font; nothing is downloaded. Windows/Android/iOS all render the common set.
- The picker must use `LAYER_POPUP` (`z-[100]`, `frontend/src/lib/layers.ts`) — a popover opened from inside a modal or over the player is exactly the bug that file exists for.
- ⚠️ The i18n audit (`python frontend/src/i18n/audit.py`) flags key-like literals outside `t()` and dynamic-prefix gaps. Category names are 8 keys per locale; **the emoji characters themselves must not become i18n keys.**

Separately and for free: the **reaction bar** (§3.6) is 7 fixed emoji and needs no picker at all — ship reactions before the picker.

---

## 4. Cost ranking (stage the backlog in this order)

**Tier 0 — one afternoon each, no schema**

1. **Auto-scroll, properly** (§2.2). Track `atBottom` on the scroll container; scroll instantly on mount and on conversation change (`behavior:'instant'`), and on new messages only when already at the bottom; otherwise show a "new messages ↓" pill. ~40 lines in `ChatPage.tsx`, 2 i18n keys ×2.
2. **Profile link** — already done (`ChatPage.tsx:263`). Optionally point the avatar in `ConversationRow` at the same target. ~0.
3. **Emoji in the composer** — the dependency-free picker (§3.7) + `lib/emoji.ts`. No backend change at all: `body` is already utf8mb4 and `type:'emoji'` is already validated. ~1 day including the curated list.
4. **Delete the dead `markThreadRead` export** (§2.3) and decide whether `PATCH /chat/{id}/read` stays (it should — a future "mark unread" needs it).
5. **"Seen"** (§2.4) — expose the other side's `last_read_at` in `index()`/`messages()` and draw a tick under my last bubble. Zero schema.

**Tier 1 — small schema, one column or one flag**

6. **Mute** — 2 columns on `conversation_user`, 1 endpoint, `unreadCounts()` touched in one place (§3.1).
7. **Themes** — 1 column on `conversations`, a colour map copied from `toolSections.ts`'s mechanism, dark variants mandatory (§3.3).
8. **Pins + pinned list** — 2 columns on `messages`, 2 endpoints, `payload()` + a sticky strip. *The "jump to pin" half is blocked on Tier 2's cursor* (§3.4).

**Tier 2 — real work**

9. **The cursor primitive** (`before_id` / `around_id`) + a "load older" control. Unblocks 8, 10 and 11, and fixes the fact that history older than 50 messages is currently unreachable (§3.5).
10. **Search inside a chat** — needs the `App\Support\Like` extraction, `Snippet` reuse, a results panel and the jump (§3.5).
11. **Reactions** — new table, aggregation in `payload()`, eager loading, a hover bar + the picker; the most UI surface of the lot (§3.6).

**Tier 3 — cheap schema, awkward UX**

12. **Nicknames** — new table (§3.2). Small code, but every place that renders a name has to choose between nickname and `display_name`, and that answer must be written once (a `chatDisplayName()` helper), not at each call site.

---

## 5. Rules this work must not break

- Route ordering in `backend/routes/api.php`: anything new on `/chat/...` with a literal second segment (`pins`, `search`, `mute`, `theme`, `nickname`) must be declared **above** `GET|POST /chat/{conversation}`, and message-scoped routes above it too. The file already says so in a comment.
- Every new machine error code (`too_many_pins`, …) goes into `frontend/src/lib/errors.ts`'s `CODES` **and** `errors.*` in both `ka.json` and `en.json`, or the toast shows the raw string.
- Every new i18n key exists in **both** locales; run `python frontend/src/i18n/audit.py`. Locale files are 2-space JSON with **CRLF** — write with `newline='\r\n'`, or the whole file shows as changed.
- New docblocks and comments in Georgian (the repo's working language).
- MySQL-only DDL (`dropColumn` where an FK names it, `ALTER … MODIFY`) must be wrapped in `getDriverName() === 'mysql'` — tests run on sqlite `:memory:`.
- Never name a column `hidden`/`visible`/`casts`/`attributes` — those are protected `Model` properties.
- `Conversation`/`Message` are deliberately skipped by `EnsureRecordOwnership` (`backend/app/Http/Middleware/EnsureRecordOwnership.php:48`) because access is **participation**; every new chat endpoint must therefore check `$conversation->has($me->id)` itself and answer **404, not 403**.
- Anything that creates a message or acts inside a conversation goes through `ChatService::guard()` — one gate, checked on open *and* on send, because a check passed once is not a permanent permission.
- A new per-viewer fact is a **table**, not a pair of columns (the `message_hides` precedent).
- Any new chat upload path must live under `chat/` (`PRIVATE_ROOTS`) and be listed in `StorageMeter::referencedPaths()`, or the admin's orphan cleanup deletes it.
