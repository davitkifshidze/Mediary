<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Services\Backup\BackupRunner;
use App\Services\Backup\DatabaseImporter;
use App\Services\Import\ImportException;
use App\Support\UploadLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * **ბაზის JSON-ის ZIP-ით ცხრილების ჩანაცვლება** (მხოლოდ სუპერადმინი).
 *
 * ორი ბიჯი: **ატვირთვა** (რა ცხრილებია არქივში) და **ჩანაცვლება** (არჩეული
 * ცხრილები, აკრეფილი `REPLACE`-ით — `/backups`-ის `RESTORE`-ის წესი).
 * `.sql`/`.gz` ასლის ატვირთვა და ერთი ცხრილის აღდგენა იმავე ჩანართშია
 * (`DatabaseBackupController`) — აქ მხოლოდ ის ემატება, რაც აკლდა: „ბაზის"
 * ექსპორტის JSON-ის ZIP-ის უკან შემოტანა.
 *
 * ⚠️ **უსაფრთხოების ასლი ჯერ, ჩავარდნაზე — უარი**;
 * ⚠️ **ლოგი დესტრუქციულ ნაბიჯამდე** — ჩანაცვლება `audit_logs`-საც შეიძლება შეეხოს.
 */
class DatabaseImportController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function inspect(Request $request, DatabaseImporter $importer): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', ...UploadLimits::rule('import_archive', $request->user())],
        ]);

        try {
            return response()->json($importer->stage($request->user(), $data['file']));
        } catch (ImportException $e) {
            return response()->json(['message' => $e->getMessage(), ...$e->context], $e->status);
        }
    }

    public function replace(Request $request, DatabaseImporter $importer, BackupRunner $runner, string $token): JsonResponse
    {
        $data = $request->validate([
            'tables' => ['required', 'array', 'min:1', 'max:500'],
            'tables.*' => ['string', 'max:64', 'distinct'],
            'confirm' => ['required', 'string', 'in:REPLACE'],
        ]);

        $tables = array_values($data['tables']);

        try {
            // ⚠️ ჯერ შემოწმება — უცნობ ან აკრძალულ ცხრილზე ასლი ტყუილად არ იქმნება
            $importer->check($request->user(), $token, $tables);
        } catch (ImportException $e) {
            return response()->json(['message' => $e->getMessage(), ...$e->context], $e->status);
        }

        /* ⚠️ **უსაფრთხოების ასლი ჯერ, და ჩავარდნაზე უარი** — შეუქცევადი ოპერაცია
           იმ ასლის გარეშე, რომელიც მას შექცევადს ხდის, არ იწყება. */
        $safety = $runner->safetyDump($request->user(), 'auto: before JSON replace '.implode(', ', array_slice($tables, 0, 10)));
        abort_unless($safety, 500, 'safety_backup_failed');

        $this->audit->log(AuditLog::ACTION_IMPORT, [
            'module' => 'database',
            'subject_type' => 'database_backup',
            'subject_id' => $safety->id,
            'subject_label' => 'replace: '.implode(', ', array_slice($tables, 0, 10)),
            'new_values' => ['mode' => 'replace', 'format' => 'json', 'tables' => $tables],
        ]);

        try {
            $result = $importer->replace($request->user(), $token, $tables);
        } catch (ImportException $e) {
            return response()->json(['message' => $e->getMessage(), ...$e->context, 'safety_backup_id' => $safety->id], $e->status);
        }

        $importer->discard($request->user(), $token);

        return response()->json([
            'data' => $result,
            'safety_backup_id' => $safety->id,
            // ფაილები ბაზას არ მიჰყვება — კვოტის მრიცხველი თავიდან უნდა დაითვალოს
            'meta' => ['recalculate_storage' => true],
        ]);
    }

    public function discard(Request $request, DatabaseImporter $importer, string $token): JsonResponse
    {
        $importer->discard($request->user(), $token);

        return response()->json(null, 204);
    }
}
