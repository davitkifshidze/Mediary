# recon: backup-viewer — a table/record viewer and partial restore for database backups

Area key: `backup-viewer`. Date: 2026-09-16. Branch: `improve/gallery-and-bulk-delete`.
Everything below was read from the code and measured on the live MariaDB; nothing in `backend/` or `frontend/` was modified.

---

## 0. What exists today (all of it — reuse, do not re-invent)

| Piece | Path | Lines |
|---|---|---|
| Binary wrapper (dump / restore / gzip detect) | `backend/app/Services/Backup/DatabaseDumper.php` | 325 |
| Orchestrator (quota, status, safety dump, re-insert) | `backend/app/Services/Backup/BackupRunner.php` | 183 |
| Controller (`super_admin`, 7 endpoints) | `backend/app/Http/Controllers/Api/DatabaseBackupController.php` | 271 |
| Model (`StoredFile`, `stale()`, 4-state status) | `backend/app/Models/DatabaseBackup.php` | 92 |
| Migration | `backend/database/migrations/2026_09_15_000002_create_database_backups.php` | 62 |
| CLI (both paths) | `backend/app/Console/Commands/RunDatabaseBackupCommand.php` | 61 |
| Routes | `backend/routes/api.php` **L882–909** (`super_admin` + `prefix('admin')`) | — |
| Frontend page | `frontend/src/pages/BackupsPage.tsx` | 316 |
| Frontend API | `frontend/src/api/backups.ts` | 85 |
| Tests | `backend/tests/Feature/DatabaseBackupTest.php` (13 tests, `runFakeDump()` helper at L239) | 261 |
| Section colour/icon | `frontend/src/lib/toolSections.ts` **L76** — `backups: { color: 'var(--tool-backups)', icon: DatabaseBackup }` | — |
| i18n | `frontend/src/i18n/{ka,en}.json` → `backups.*` (**26 keys today**, both locales in sync) | — |

Routes today (`/api/admin/backups`, all `super_admin`):
`GET /`, `POST /`, `POST /import`, `GET /{backup}`, `GET /{backup}/download`, `POST /{backup}/restore`, `DELETE /{backup}`.
WARNING: `import` sits **above** `{backup}` on purpose (it is not numeric); any new non-numeric segment (`/tables`, `/peek`) must follow the same ordering rule, and `{backup}` already carries `whereNumber`.

### Exact mechanics that constrain everything below

**Dump** (`DatabaseDumper::dump()` L109–172). Args: `--host --port --user --default-character-set=utf8mb4 --single-transaction --routines --events --triggers --add-drop-table <db>`.

- No `--complete-insert`, no `--skip-extended-insert`, no `--hex-blob`, no `--no-create-info`, no `--tab`.
- Password via `MYSQL_PWD` env (L272–275), never argv.
- Output streams into `fopen($path,'wb')`; when compressing, `stream_filter_append($handle, 'zlib.deflate', STREAM_FILTER_WRITE, ['level' => 6, 'window' => 31])` — `window => 31` = 15+16 = gzip header (L150). WARNING: this is a **write filter on a plain handle**, i.e. the file is never opened with `gzopen` for writing; a reader must use `gzopen`/`gzgets`.
- Compression is decided **from the file name** (`BackupRunner::dump()` L42: `str_ends_with($backup->name, '.gz')`) — deliberately one source of that fact, no column. Any new reader must use the same test, not a new flag.
- `countTables()` (L305–324) re-opens the finished file and counts lines starting with `CREATE TABLE`. **This is the only thing that fills `database_backups.tables`.**

**`isGzip()`** (L230–249): reads 2 bytes, compares `bin2hex($magic) === '1f8b'`. The docblock records the live bug — `pint`'s `single_quote` fixer rewrote the double-quoted `\x1f\x8b` literal to single quotes, killing the escape, so it returned `false` forever. **Any new binary-literal comparison must go through `bin2hex()`.**

**Restore** (L181–223): `mysql --host --port --user --default-character-set=utf8mb4 <db>`, stdin = `gzopen()` or `fopen()` of the file, `$process->setInput($stream)`. There is no per-table anything — it is one pipe.

**`BackupRunner::restore()`** (L98–162), in order:

1. file-exists check → `failed: backup_file_missing`;
2. create a `mediary-before-restore-<Y-m-d-Hi>.sql` row and `dump()` it. WARNING: **if the safety dump is not `ready`, the restore never starts** (L128–136, `safety_backup_failed`);
3. snapshot `$safetyRow = $safety->fresh()->getAttributes()` and `$target = $backup->getAttributes()` **before** the restore;
4. `$this->dumper->restore($absolute)` inside try/catch;
5. `reinsert()` both rows — `DB::table('database_backups')->updateOrInsert(['id' => $row['id']], $row)` (L174–182), swallowing `Throwable` (the restored dump may predate the table). **Eloquent is deliberately not used** — it would wake `AuditObserver` and would not preserve `id` (the file on disk is named by that id through `StorageMeter`).

WARNING: **that is the concrete statement of "restore overwrites `database_backups` itself".** Only those two rows survive; every other backup row in the current DB is replaced by whatever the dump contains — including rows whose files still sit on disk under `backups/`, which then become orphans.

**Audit** (`DatabaseBackupController::restore()` L205–209): `ACTION_UPDATE`, `subject_type: 'database_backup'`, label `'restore: '.$name`, written **before** the status flip and before dispatch, because the restore overwrites `audit_logs` too.

**Background**: `BackgroundProcess::dispatch([PHP_BINARY, base_path('artisan'), 'backups:run', id, '--restore'])` → `start /B "" … > NUL 2>&1` on Windows (`BackgroundProcess.php` L26–38). A failed dispatch is **503 `background_unavailable`** and the row is rolled back (L218–222).

**Storage**: `StorageFolder::BACKUPS = 'backups'` (L122) and `PRIVATE_ROOTS = ['notes','chat','backups']` (L144) — private disk, not reachable through `/storage/*`. `StorageMeter::storeLocalFile(User, $absPath, $folder, $name)` (L1234) claims the quota then streams; `StoredFile` releases the **recorded** size on delete.

**Error codes** already in `frontend/src/lib/errors.ts::CODES`: `mysqldump_unavailable`, `background_unavailable`, `invalid_backup_file`. WARNING: `message` *is* the code (`['message' => 'mysqldump_unavailable']`); a separate `code` field would never be translated.

---

## 1. Can we list the tables **without** restoring? — YES, and `database_backups.tables` is NOT enough

`tables` is `unsignedInteger` (migration L47), cast `'integer'` (model L65), typed `tables: number | null` in `api/backups.ts` L21, rendered as `t('backups.tables', { n: b.tables })` at `BackupsPage.tsx` L202. **It is a count, not a list.** It is filled at dump time by `countTables()` scanning for `CREATE TABLE`, so an **imported** backup (`source: 'upload'`) has `tables = null` — `import()` never sets it (`DatabaseBackupController` L162–173).

### Measured: a full table index costs ~8 ms

Real `mediary` dump (`C:\xampp\mysql\dumps\2026-09-16_1000\mediary.sql`, 4,244,718 bytes SQL), gzipped at level 6 / window 31 exactly as the app does → **828,758 bytes** (matches the 810 kB in CLAUDE.md). PHP `gzopen` + `gzgets` over the whole file, three runs:

```
run0: 0.0083s  tables=83  approx_rows=14008  peak_mem=4,194,304
run1: 0.0078s  tables=83  approx_rows=14008  peak_mem=4,194,304
run2: 0.0078s  tables=83  approx_rows=14008  peak_mem=4,194,304
```

So: **83 table names, per-table byte size, per-table INSERT count and byte offsets, in 8 ms and 4 MB of RAM.** At 100× (424 MB SQL / ~83 MB gz) that is ~0.8 s and **the same memory** — see §2 for why memory does not grow.

### Dump layout (verified against `backend/mediary_backup.sql`, 3,027 lines, 4,035,546 bytes)

- Per table: a `-- Table structure for table` comment → `DROP TABLE IF EXISTS` → `CREATE TABLE` (multi-line) → `LOCK TABLES … WRITE;` → `INSERT INTO … VALUES (…),(…),…;` → `UNLOCK TABLES;`
- Tables are in **alphabetical order** (`anime_field_values`, `anime_translations`, `animes`, `approval_requests`, `audit_logs`, …) — *not* dependency order. FK checks are disabled in the header (`/*!40014 … FOREIGN_KEY_CHECKS=0 */`), which is what makes that legal.
- **51 `INSERT INTO` statements for 83 tables** — empty tables have none.
- 160 `LOCK`/`UNLOCK` lines (80 pairs).
- 0 triggers/routines in this database today (grep for `DELIMITER`/`CREATE … TRIGGER`/`CREATE … PROCEDURE` = 0), but the flags are on, so a future one would appear and a parser must not choke on `DELIMITER ;;`.

**Recommendation:** store the parsed list in a new nullable JSON column `database_backups.table_map` (name → `{rows_est, bytes, create_offset, insert_offsets[]}`), filled by a new `DatabaseDumper::indexTables()` that **replaces** `countTables()` (it already walks the same file — do not add a second pass), and lazily on first view for `source: 'upload'` rows. Keep `tables` as the count so nothing on the frontend breaks.

WARNING: offsets are only usable as "decompress this far", never as `gzseek` random access — see §2.

---

## 2. Reading one table's rows out of a `.sql.gz` — honest comparison

### (a) Stream the gz and parse that table's INSERT statements

**What it actually requires, in this dump:**

1. **Column names are not in the INSERT.** Verified: the statement begins `INSERT INTO ` + the backticked table name + ` VALUES (2,1,2026,'tt19838566',…)`. Without `--complete-insert`, a viewer that shows named columns **must also parse the `CREATE TABLE` block** above it and rely on positional order. That is a second parser (backtick-quoted names, `DEFAULT` expressions, `KEY`/`CONSTRAINT` lines to skip, generated columns).
2. **Tuple splitting is a real state machine.** Escapes mysqldump emits: `\0 \n \r \\ \' \" \Z`. The classic killer is an escaped backslash immediately before a genuine closing quote; a naive "unescaped quote" regex reads it as escaped and swallows the rest of the file. Also `,` and `)` appear freely inside strings (every Georgian description, every JSON column, every audit-log diff).
3. **Binary blobs are NOT a problem here** — measured: this schema has **zero** `blob` / `longblob` / `mediumblob` / `tinyblob` / `binary` / `varbinary` columns. Everything is `varchar` / `text` / `json` / `decimal` / `timestamp`. That removes the worst half of the usual objection. (WARNING: `cache.value` is `mediumtext` holding serialized PHP with arbitrary escapes — still text, still correctly escaped, but it is the ugliest string you will parse.)
4. **Statement size is bounded, dump size is not.** Largest line measured: **1,044,520 bytes** (`audit_logs`), then 1,013,601 (`cache`), 509,841 (`cast_members`), 353,923 (`movie_translations`). That is mysqldump's `net_buffer_length` default (1,046,528) doing its job: a statement never exceeds ~1 MB **no matter how big the table is**, so per-statement memory stays ~1 MB at any scale. This is the one genuinely good property of option (a).
5. **`gzseek()` is not random access.** zlib must inflate from byte 0 to reach an offset, so "jump to this table" costs a full decompress of everything before it. Paging *within* a table re-pays that on every request.

**Honest cost.** Today: any page of any table ≈ **10–15 ms** (8 ms scan + tuple parse of the matching statements). At 100×: ~0.8–1.2 s **per page request**, every time, because nothing can be indexed. Sorting by an arbitrary column, filtering, or `COUNT(*)` all require materialising the whole table in PHP — `audit_logs` at 100× is ~250,000 rows.

**Code cost:** a correct `SqlDumpReader` is realistically 250–350 lines (line reader + `CREATE TABLE` column parser + tuple state machine + unescape + type coercion), and it is the kind of code where a bug is *silent* — one wrong row rendered, not an exception. It needs its own unit-test file with adversarial fixtures (escaped backslash before a quote, `\n` inside a value, a JSON column with escaped Georgian, `NULL` vs the string `'NULL'`).

**Where it is nevertheless the right tool:** step 1 (the table index) and a **preview** of the first N rows. Both are single forward passes with a hard row cap.

### (b) Import into a scratch database and read normally

`CREATE DATABASE mediary_peek_<backup_id>` → pipe the same file through the existing `DatabaseDumper::restore()`-shaped call with the target `<db>` swapped → read through a runtime Laravel connection.

**Measured / derivable cost.** A full restore of this dump into a scratch database is **1.5 s** (CLAUDE.md's live §22 verification: 82 tables, 360 movies). At 100× that becomes roughly 2–4 minutes, dominated by InnoDB index builds — which is exactly why it must be the **same background job** pattern (`BackgroundProcess` → `backups:run … --peek`) with its own `status` column, not an inline request.

**Disk cost:** a second copy of the database on the MySQL datadir (~10–20 MB today, ~1–2 GB at 100×). It is **not** on the app's private disk, so `StorageMeter` does not and cannot see it — a real gap worth stating out loud: the quota would not know about it.

**Why it wins anyway:**

- Every subsequent question is a real SQL query: paging, sorting, `WHERE`, `COUNT(*)`, joins to show a movie's title next to its translations. `Controller::paginated()` (L60–81) works on it unchanged.
- **It is the only mechanism that makes §3 and §4 cheap.** Partial restore becomes `INSERT INTO mediary.t SELECT * FROM mediary_peek_7.t` — cross-database queries are native in MariaDB, so the record never round-trips through PHP and never has to be re-escaped.
- No SQL-literal parser exists in the codebase to maintain.

**Verified prerequisite — the MySQL user can do this.** Measured live:

```
VERSION() = 10.4.32-MariaDB
GRANT ALL PRIVILEGES ON *.* TO `root`@`localhost` WITH GRANT OPTION
GRANT PROXY ON ''@'%' TO 'root'@'localhost' WITH GRANT OPTION
```

So `CREATE DATABASE` / `DROP DATABASE` and cross-schema `INSERT … SELECT` all work as `root`@`127.0.0.1`, no password (`backend/.env`: `DB_DATABASE=mediary`, `DB_USERNAME=root`, `DB_PASSWORD=`).

**There is no existing scratch-database mechanism anywhere.** A grep for `CREATE DATABASE` / `createDatabase` / `scratch` over `backend/app`, `backend/config`, `backend/database` returns nothing. `config/database.php` defines `sqlite` / `mysql` / `mariadb` / `pgsql` / `sqlsrv` only; there is no second MySQL connection. Tests run on sqlite `:memory:` (`phpunit.xml`), where this whole feature is already switched off (`DatabaseDumper::available()` requires `driver() === 'mysql'`).

### Verdict

**Both, staged.** (a) for the table list and a capped preview — it is 8 ms and needs no new database. (b) for the real viewer and for every partial restore. Building (b) first and skipping (a) would mean a 1.5 s import just to answer "what tables are in this file", which is exactly the kind of cost the `/gallery` summary endpoint was created to avoid.

---

## 3. Restoring ONE table — mechanism and the FK hazard, measured on this schema

**Mechanism** (from the scratch DB): `START TRANSACTION` → `DELETE FROM mediary.t` → `INSERT INTO mediary.t SELECT * FROM peek.t` → `COMMIT`, with `FOREIGN_KEY_CHECKS` left **on**.

WARNING: `TRUNCATE` is unusable — InnoDB refuses `TRUNCATE` on a table referenced by a foreign key (errno 1701), and that is most of this schema.

**Live numbers for this database:** 83 tables, **119 foreign keys**, delete rules: **99 `CASCADE`, 20 `SET NULL`, 0 `RESTRICT`**. Referenced-table leaderboard:

| parent | incoming FKs |
|---|---|
| `users` | **61** |
| `statuses` | 6 |
| `games` | 5 |
| `songs` | 5 |
| `note_entries` | 4 |
| `genres`, `board_games`, `cast_members`, `videos`, `books` | 3 each |
| `modules`, `animes` | 2 each |

### What this schema specifically would break

1. **`users` is the doomsday table.** `DELETE FROM users` cascades down **61 foreign keys** — i.e. "restore just the users table" as delete+insert **deletes the entire library of every account** (movies, series, animes, videos, songs, books, games, board games, notes, bookmarks, gallery images, chat, credentials, backup rows) and then re-inserts only the `users` rows. The children are *not* brought back. This must be refused outright, or gated behind its own second typed word.
2. **`statuses` is the same trap one level down.** Six FKs point at it and they are `SET NULL` (verified: `animes_status_id_foreign … SET NULL`). Restoring `statuses` alone silently sets `status_id = NULL` on every record of the six status domains — and §6.4's rule is that `role` is what `MatchService`, `PurgeService` and the franchise badge read. The records survive but lose their status, which is exactly the silent failure this project fights.
3. **Inserting a child whose parent is gone is errno 1452.** Restoring `movies` from an older dump where `user_id = 5` or `status_id = 12` no longer exists fails the whole statement. Good (loud) — but the UI must translate it, not print `SQLSTATE[23000]`.
4. **Polymorphic references have NO foreign key at all, so nothing complains.** `gallery_images.imageable_type/_id`, `castables.castable_type/_id`, `genreables.genreable_type/_id`, `audit_logs.subject_type/_id` are plain columns. Restoring `gallery_images` alone happily recreates rows pointing at movie ids that were deleted — SQL accepts them and they render as broken cards. This is the most likely real-world damage and it is **invisible to the FK layer**. A "restore one table" feature must run its own post-check over those four tables and report dangling counts.
5. **Disk and quota drift.** Every `*_path` column restored re-introduces a reference to a file that may no longer exist (and conversely: the orphan scan would later delete files whose row the restore removed). `users.storage_used_bytes` will be wrong. The existing answer already exists and must be reused: `meta.recalculate_storage` in the response + `php artisan mediary:storage-recalc` (i18n key `backups.recalcHint` is already there).
6. **`gallery_albums` + `AlbumLock`.** Restoring `gallery_albums` alone can reinstate an old `password_hash` (photos become unreachable) or drop a new one (a locked album silently opens). Restoring `gallery_images` alone can move photos into a locked album. Both are quiet.
7. **`database_backups` itself must never be a restorable table** — it would delete the rows describing the files on disk, including the safety dump just taken.

**Practical rule for the design:** classify every table as `safe` / `warns` / `blocked` in one registry (the project's own pattern — `PurgeService::TARGET_MODES`, `AuditRegistry::MODELS`, `PublicDomain::DOMAINS`) and let `RegistryConsistencyTest` fail if a table exists in the schema and is missing from it. `blocked` = `users`, `database_backups`, `migrations`, `sessions`, `cache`, `jobs`; `warns` = anything with incoming FKs or a polymorphic child.

---

## 4. Restoring ONE record

**Identity = the table's primary key, and it is not always `id`.** Measured on the live schema — **every table has a primary key** (zero PK-less tables), but four are composite and two are non-integer:

| table | primary key |
|---|---|
| `castables` | `(cast_member_id, castable_id, castable_type)` |
| `genreables` | `(genre_id, genreable_id, genreable_type)` |
| `module_user` | `(user_id, module_id)` |
| `cache` | `key` (string) |
| `sessions` | `id` (string) |
| the other 78 | `id` (bigint) |

So the record identifier must be `array<string, scalar>` read from `information_schema`, never a bare `int $id`. `conversation_user`, `playlist_song`, `song_genre_song`, `game_genre_game` and `message_hides` all do have a plain `id` — verified.

**Conflict rule — the decisive one:**

- **Never `REPLACE INTO`.** `REPLACE` is a `DELETE` + `INSERT`, and the delete **fires `ON DELETE CASCADE`**. `REPLACE INTO users` would cascade-wipe that account's 61 child tables and then re-insert the user row. Same shape for `movies` (its translations, genreables, castables, gallery images and field values all cascade).
- Use `INSERT INTO mediary.t SELECT * FROM peek.t WHERE <pk> = …` **`ON DUPLICATE KEY UPDATE col = VALUES(col), …`** for every non-PK column. No delete, no cascade, and it covers both "the row is gone" and "the row changed" with one statement.
- The UI must still say which of the two happened — "re-created" and "overwritten" are different facts, and the second one loses whatever the current row holds. Show the old/new diff first; the audit log's existing diff modal (`AuditPage`) already knows how to render exactly that shape.

**Parent missing:** `movies.user_id = 5` with no user 5 → errno 1452, statement refused. The right answer is **refuse and name the parent**, never `SET FOREIGN_KEY_CHECKS = 0` for a single row — that writes an inconsistent database silently, which is the failure mode the whole project is written against. Offer "restore the parent first" as an explicit next step (the parent chain is derivable from `information_schema.KEY_COLUMN_USAGE`, 119 rows).

**Unique-index collisions are a second, separate conflict.** `ON DUPLICATE KEY UPDATE` also fires on *any* unique key, not just the PK — e.g. `unique(user_id, imdb_id)` on `movies`, `unique(user_id, module, key)` on `statuses`, `unique(record_id, field_key, sort_order)` on `<module>_field_values`. A restored record with a different `id` but the same unique tuple will silently **overwrite a different row than the one you selected**. Detect and report before writing.

---

## 5. Staged design

Every stage keeps the project's rules: `super_admin` only; a safety dump before any write; a typed word for anything destructive; the audit row **before** the destructive step; `message` *is* the code; a missing binary is a 503 state, not a crash; background work goes through `BackgroundProcess` with a `stale` guard.

### Stage 1 — "what is in this file" (no new database, ~8 ms)

- `DatabaseDumper::indexTables()` replacing `countTables()` — **one** pass, returns `['count' => int, 'map' => [name => ['rows_est','bytes','create_offset']]]`. Reuses the existing `gzopen`/`gzgets` loop and the `.gz`-from-name rule.
- New nullable JSON column `database_backups.table_map`; keep `tables` as the count. Filled in `BackupRunner::dump()` where `'tables' => $result['tables']` is written today (L61–69), and lazily on first view for `source: 'upload'` rows.
- `GET /api/admin/backups/{backup}/tables` → name, estimated rows, bytes, "empty". WARNING: register it **below** `/import` and keep `whereNumber('backup')`.
- UI: expand a row in `BackupsPage` into a `DataTable` (`components/ui/data-table.tsx` — client-side sort/search/paging, exactly its documented use: an already-loaded list).
- Read-only. Nothing can go wrong.

### Stage 2 — preview the first N rows (still no new database)

- A capped forward parse: `SqlDumpReader::preview($path, $table, $limit = 100)` — parse `CREATE TABLE` for column names, then read statements until `$limit` tuples.
- Its own unit-test file with adversarial fixtures (escaped backslash before a quote, `\n` inside a value, escaped Georgian in a JSON column, `NULL` vs `'NULL'`). This is the piece that fails *silently* if wrong.
- UI: "first 100 rows", labelled as a preview, not as the table.

### Stage 3 — the real viewer (scratch database, background)

- `backups:run {id} --peek` creates `mediary_peek_{id}`, imports, records `peek_status` / `peek_started_at` / `peek_database` on the row. Four states + `stale()` exactly like `status` today; a dispatch failure is 503 `background_unavailable` and no half-state.
- A runtime connection (`config(['database.connections.backup_peek' => [...mysql config, 'database' => $name]])`) — read-only queries through `Controller::paginated()`.
- Explicit "close the preview" → `DROP DATABASE`, plus an age-based sweep. The scratch copy is invisible to `StorageMeter`, which must be said out loud in the UI.
- New codes `peek_unavailable` / `peek_not_ready` go into `lib/errors.ts::CODES` **and** both locale files.

### Stage 4 — restore ONE table (destructive)

- Requires an open peek. Safety dump first — reuse `BackupRunner`'s existing block verbatim, do not write a second one. Audit row **before**. Typed confirmation: the **table's own name**, not `RESTORE` — typing a word you can copy off the button is weaker than typing the thing you are about to overwrite.
- One registry of `safe | warns | blocked` per table, pinned by `RegistryConsistencyTest`. `users`, `database_backups`, `migrations`, `sessions`, `cache`, `jobs` = blocked.
- The dialog must state, from `information_schema` rather than a hand-written list: how many rows will be deleted, how many inserted, which child tables cascade (with their row counts), which FKs are `SET NULL`, and which polymorphic tables will be checked afterwards.
- Response carries `meta.recalculate_storage = true` and the UI repeats the existing `backups.recalcHint`.

### Stage 5 — restore ONE record (destructive, smallest blast radius)

- PK read from `information_schema` (composite-aware). `INSERT … SELECT … ON DUPLICATE KEY UPDATE`, never `REPLACE`.
- Pre-flight: does the row exist now (→ show the old/new diff), do all FK parents exist (→ name the missing one and refuse), does any unique key collide with a *different* row (→ name it and refuse).
- Ordinary confirm dialog, no typed word — it is one row, the same weight as deleting one record in a module's own grid (§25.6's rule). The safety dump is still taken, because the write still lands in the live database.

---

## 6. Things this work must not break

- **Route order** in `routes/api.php` L902–908: non-numeric segments above `{backup}`; every `{backup}` keeps `whereNumber`.
- **`message` is the code**; every new code goes into `lib/errors.ts::CODES` *and* both locale files. `backups.*` has 26 keys today and both locales are in sync — `python frontend/src/i18n/audit.py` must stay green (it also checks interpolation placeholders: use `{{name}}`). Locale files are 2-space JSON with **CRLF**.
- **`bin2hex()` for any binary literal** — `pint`'s `single_quote` fixer already silently broke that comparison once.
- **Do not add a second external binary.** Compression stays a zlib stream filter; a scratch import reuses the `mysql` client already located by `DatabaseDumper::clientBinary()`.
- **Do not put the scratch database on the app disk or under `StorageFolder`** — it is not a file the quota can own, and pretending otherwise would make `StorageMeter::referencedPaths()` lie. Any new column whose name contains `path`, however, **must** be added to `referencedPaths()` or the orphan cleaner deletes live files (`RegistryConsistencyTest` enforces this by scanning the schema).
- **sqlite tests**: all of this is MySQL-only. New migrations with MySQL DDL need the `getDriverName() === 'mysql'` guard; tests keep using the `runFakeDump()` helper (`DatabaseBackupTest.php` L239) rather than a real mysqldump.
- **`DatabaseBackup` deliberately has no `BelongsToUser`** — do not add the `owner` scope while touching the model.
- Georgian docblocks on every new class and migration, matching the existing files.

---

## 7. Open questions for the user (design, not implementation)

1. Scratch database on or off: it is the only way to get a real viewer and cheap partial restore, and it costs a second copy of the data on the MySQL datadir that the storage quota cannot see. Acceptable?
2. Is a **preview** (stage 2, first ~100 rows, no scratch DB) enough, or is the full browsable/sortable viewer (stage 3) the actual request?
3. "Restore this table" on `users` can cascade-delete everything (61 FKs). Block it outright, or allow it behind a second typed word?
4. Typed confirmation for a single-table restore: the table's own name, or the existing `RESTORE`?
5. Restoring a record that still exists — overwrite silently after showing the diff, or require a second explicit "overwrite" choice?
