<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DatabaseBackup;
use App\Services\Audit\AuditLogger;
use App\Services\Backup\DatabaseDumper;
use App\Services\Storage\StorageMeter;
use App\Support\BackgroundProcess;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * **ბაზის დამპი ადმინიდან** (Tasks §22).
 *
 * ⚠️ **`super_admin`-ზეა და არა `admin_access:`-ზე.** დამპი მთელი ბაზაა —
 * ყველა ანგარიშის ყველა ჩანაწერი, ჰეშირებული პაროლები, პირადი ჩატები —
 * ე.ი. მისი ჩამოტვირთვა ერთი სექციის უფლება ვერ იქნება. ეს ზუსტად ის
 * მსჯელობაა, რის გამოც `admin/purge` და `admin/modules` `super_admin`-ზე
 * დარჩა.
 *
 * ⚠️ **აღდგენა აკრეფილ სიტყვას ითხოვს** (`RESTORE`) — `/purge`-ის წესი.
 * ერთი ღილაკი, რომელიც მთელ ბიბლიოთეკას ცვლის, დაუცველი ვერ დარჩება.
 */
class DatabaseBackupController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    public function index(Request $request, DatabaseDumper $dumper): JsonResponse
    {
        $backups = DatabaseBackup::with('user:id,name,username')
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        return response()->json([
            'data' => $backups->map(fn (DatabaseBackup $b) => $this->row($b))->all(),
            'meta' => [
                // ⚠️ „ინსტრუმენტი არ მაქვს" ინტერფეისმა უნდა თქვას და არა
                // ღილაკის ჩავარდნით აღმოაჩინოს (`ytdlp_unavailable`-ის წესი)
                'available' => $dumper->available(),
                'restore_available' => $dumper->restoreAvailable(),
                'driver' => $dumper->driver(),
                'database' => (string) config('database.connections.'.config('database.default').'.database'),
                'max_upload_kb' => UploadLimits::effectiveKb('doc'),
            ],
        ]);
    }

    /** ახალი დამპის დაწყება (ფონურად) */
    public function store(Request $request, DatabaseDumper $dumper, BackgroundProcess $process): JsonResponse
    {
        $data = $request->validate([
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
            'compress' => ['sometimes', 'boolean'],
        ]);

        if (! $dumper->available()) {
            /* ⚠️ **`message` თვითონ არის კოდი** — ამ პროექტის წესი
               (`bgg_unavailable`/`ytdlp_unavailable`): `lib/errors.ts`
               ზუსტად `message`-ს ადარებს `CODES`-ს, ე.ი. ცალკე `code`
               ველი ჩუმად უპასუხოდ დარჩებოდა. */
            return response()->json(['message' => 'mysqldump_unavailable'], 503);
        }

        // ნაგულისხმევად შეკუმშული: 4 მბ SQL ~600 კბ-ია, ე.ი. კვოტაც ზოგავს
        $compress = (bool) ($data['compress'] ?? true);

        $backup = DatabaseBackup::create([
            'user_id' => $request->user()->id,
            'name' => 'mediary-'.now()->format('Y-m-d-Hi').'.sql'.($compress ? '.gz' : ''),
            'status' => DatabaseBackup::STATUS_RUNNING,
            'driver' => $dumper->driver(),
            'source' => DatabaseBackup::SOURCE_DUMP,
            'note' => $data['note'] ?? null,
            'started_at' => now(),
        ]);

        /* ⚠️ **გაშვება ვერ მოხერხდა → ჩანაწერი მაშინვე იშლება.** დაწერილი,
           მაგრამ არასდროს გაშვებული რიგი „მიმდინარეობს"-ად გამოჩნდებოდა და
           სამუდამოდ 0%-ზე იდგებოდა — ზუსტად ის, რაც `download_status`-მა
           გვასწავლა (§B1). */
        if (! $process->dispatch([PHP_BINARY, base_path('artisan'), 'backups:run', (string) $backup->id])) {
            $backup->delete();

            return response()->json(['message' => 'background_unavailable'], 503);
        }

        $this->audit->log(AuditLog::ACTION_CREATE, [
            'subject_type' => 'database_backup',
            'subject_id' => $backup->id,
            'subject_label' => $backup->name,
        ]);

        return response()->json(['data' => $this->row($backup)], 201);
    }

    /** ერთი ჩანაწერი — SPA-ს გამოკითხვისთვის, სანამ `running`-ია */
    public function show(DatabaseBackup $backup): JsonResponse
    {
        return response()->json(['data' => $this->row($backup)]);
    }

    /**
     * ფაილის ჩამოტვირთვა.
     *
     * ⚠️ **ერთადერთი გზა, რითაც დამპი სერვერიდან გადის.** საქაღალდე
     * `backups/` **პრივატულ დისკზეა** (`StorageFolder::PRIVATE_ROOTS`),
     * ე.ი. `/storage/*` მას ვერ ხედავს — სხვაგვარად მთელი ბაზა ბმულის
     * მცოდნე ნებისმიერისთვის ღია იქნებოდა.
     */
    public function download(DatabaseBackup $backup): StreamedResponse
    {
        abort_if($backup->status !== DatabaseBackup::STATUS_READY || ! $backup->path, 404);

        $disk = Storage::disk(StorageFolder::diskFor($backup->path));

        abort_unless($disk->exists($backup->path), 404);

        $this->audit->log(AuditLog::ACTION_VISIT, [
            'subject_type' => 'database_backup',
            'subject_id' => $backup->id,
            'subject_label' => 'download: '.$backup->name,
        ]);

        return $disk->download($backup->path, $backup->name ?: 'backup.sql');
    }

    /**
     * სხვა კომპიუტერიდან მოტანილი ფაილის ატვირთვა (§22.6).
     *
     * ⚠️ **ატვირთვა და აღდგენა ორი ნაბიჯია და განზრახ.** ერთ მოძრაობად
     * გაერთიანება ნიშნავდა, რომ შემთხვევით არჩეული ფაილი მთელ ბაზას
     * ჩაანაცვლებდა — აღდგენას თავისი, აკრეფილი დასტური აქვს.
     */
    public function import(Request $request, StorageMeter $meter): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:'.UploadLimits::effectiveKb('doc')],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $file = $request->file('file');
        $name = (string) $file->getClientOriginalName();

        /* ⚠️ MIME-ით შემოწმება აქ არ გამოდგება: `.sql` ფაილს ბრაუზერები
           ხან `text/plain`-ად, ხან `application/octet-stream`-ად აგზავნიან,
           `.gz` კი მესამენაირად. ამიტომ სახელის დაბოლოებას ვამოწმებთ —
           შიგთავსს ისედაც `mysql` განსჯის აღდგენისას. */
        if (! preg_match('/\.(sql|sql\.gz|gz)$/i', $name)) {
            return response()->json(['message' => 'invalid_backup_file'], 422);
        }

        $path = $meter->storeUpload($request->user(), $file, StorageFolder::BACKUPS);

        $backup = DatabaseBackup::create([
            'user_id' => $request->user()->id,
            'path' => $path,
            'name' => $name,
            'size' => (int) $file->getSize(),
            'status' => DatabaseBackup::STATUS_READY,
            'driver' => 'mysql',
            'source' => DatabaseBackup::SOURCE_UPLOAD,
            'note' => $request->input('note'),
            'started_at' => now(),
            'finished_at' => now(),
        ]);

        $this->audit->log(AuditLog::ACTION_CREATE, [
            'subject_type' => 'database_backup',
            'subject_id' => $backup->id,
            'subject_label' => 'import: '.$name,
        ]);

        return response()->json(['data' => $this->row($backup)], 201);
    }

    /**
     * აღდგენა — **დესტრუქციული ოპერაცია**.
     *
     * ⚠️ დასტური აკრეფილი სიტყვაა (`/purge`-ის წესი), და პასუხი ცხადად
     * ამბობს, რომ ფაილები დისკზე ბაზას არ მიჰყვება: აღდგენილი
     * `storage_used_bytes` შეიძლება რეალობას აცდეს, ე.ი.
     * `mediary:storage-recalc` აუცილებელია.
     */
    public function restore(Request $request, DatabaseBackup $backup, DatabaseDumper $dumper, BackgroundProcess $process): JsonResponse
    {
        $request->validate(['confirm' => ['required', 'string', 'in:RESTORE']]);

        if (! $dumper->restoreAvailable()) {
            return response()->json(['message' => 'mysqldump_unavailable'], 503);
        }

        abort_if($backup->status !== DatabaseBackup::STATUS_READY || ! $backup->path, 404);

        /* ⚠️ ლოგი **დაწყებამდე**: აღდგენა თვითონ `audit_logs`-საც ჩაანაცვლებს,
           ე.ი. შემდეგ ჩაწერილი რიგი დამპის შიგთავსში ვერ იარსებებდა. ასე
           „ვინ დაიწყო" ორივე ბაზაში რჩება — ამ ერთის დამპშიც. */
        $this->audit->log(AuditLog::ACTION_UPDATE, [
            'subject_type' => 'database_backup',
            'subject_id' => $backup->id,
            'subject_label' => 'restore: '.$backup->name,
        ]);

        $backup->forceFill([
            'status' => DatabaseBackup::STATUS_RUNNING,
            'error' => null,
            'started_at' => now(),
            'finished_at' => null,
        ])->save();

        if (! $process->dispatch([PHP_BINARY, base_path('artisan'), 'backups:run', (string) $backup->id, '--restore'])) {
            $backup->forceFill(['status' => DatabaseBackup::STATUS_READY])->save();

            return response()->json(['message' => 'background_unavailable'], 503);
        }

        return response()->json([
            'data' => $this->row($backup->fresh()),
            'meta' => ['recalculate_storage' => true],
        ]);
    }

    public function destroy(DatabaseBackup $backup): JsonResponse
    {
        $label = $backup->name;
        $id = $backup->id;

        // ⚠️ **მოდელით და არა query-ით**: `StoredFile` ფაილს დისკიდან შლის
        // და ჩაწერილ ბაიტებს კვოტიდან ათავისუფლებს
        $backup->delete();

        $this->audit->log(AuditLog::ACTION_DELETE, [
            'subject_type' => 'database_backup',
            'subject_id' => $id,
            'subject_label' => $label,
        ]);

        return response()->json(['deleted' => true]);
    }

    /** @return array<string, mixed> */
    private function row(DatabaseBackup $backup): array
    {
        return [
            'id' => $backup->id,
            'name' => $backup->name,
            'size' => (int) $backup->size,
            // ⚠️ მიტოვებული `running` ცალკე ფაქტია: „მიმდინარეობს" და
            // „პროცესი მოკვდა" სხვადასხვა ღილაკს ითხოვს (§7.1-ის წესი)
            'status' => $backup->status,
            'stale' => $backup->stale(),
            'error' => $backup->error,
            'driver' => $backup->driver,
            'tables' => $backup->tables,
            'note' => $backup->note,
            'source' => $backup->source,
            'user' => $backup->relationLoaded('user') && $backup->user
                ? ['id' => $backup->user->id, 'name' => $backup->user->name, 'username' => $backup->user->username]
                : null,
            'created_at' => $backup->created_at?->toIso8601String(),
            'finished_at' => $backup->finished_at?->toIso8601String(),
        ];
    }
}
