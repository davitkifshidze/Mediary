<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Services\Backup\DatabaseExporter;
use App\Support\ModuleTables;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * **„ბაზა" — მთლიანი ბაზის ან არჩეული ცხრილების ექსპორტი**.
 *
 * ⚠️ **მხოლოდ `super_admin`** — ბაზა ყველა ანგარიშია (ჰეშირებული პაროლები,
 * დაშიფრული გასაღებები, პირადი ჩატები); `/backups`-ის იგივე მსჯელობა. სხვა
 * მომხმარებელი მხოლოდ საკუთარ მონაცემს იღებს („ჩემი სრული ექსპორტი").
 *
 * ⚠️ **ცხრილის სახელს სერვერი ამოწმებს სქემით** — უცნობი სახელი 422-ია.
 * ⚠️ `requires`-ის ავტომატური მონიშვნა ფანჯრისაა; სერვერი იმას აგზავნის, რაც
 * მოითხოვე (`closure=1` — საჭიროებებსაც თვითონ უმატებს).
 * ⚠️ ყოველი ექსპორტი ჟურნალში იწერება (`export`, `kind: database`).
 */
class DatabaseExportController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** ცხრილები: პატრონი (მოდული · საერთო · სისტემა), რიგები, ზომა, საჭიროებები */
    public function tables(DatabaseExporter $exporter): JsonResponse
    {
        return response()->json([
            'data' => $exporter->tables(),
            'modules' => array_keys(ModuleTables::MODULES),
            'sql_available' => $exporter->sqlAvailable(),
        ]);
    }

    public function export(Request $request, DatabaseExporter $exporter): BinaryFileResponse|JsonResponse
    {
        $data = $request->validate([
            'tables' => ['required', 'array', 'min:1', 'max:500'],
            'tables.*' => ['string', 'max:64'],
            'format' => ['required', Rule::in(['json', 'sql'])],
            'closure' => ['nullable', 'boolean'],
        ]);

        $tables = $request->boolean('closure') ? ModuleTables::closure($data['tables']) : $data['tables'];

        if ($data['format'] === 'sql' && ! $exporter->sqlAvailable()) {
            return response()->json(['message' => 'mysqldump_unavailable'], 503);
        }

        try {
            $path = $data['format'] === 'sql' ? $exporter->sql($tables) : $exporter->zip($tables);
        } catch (RuntimeException $e) {
            $code = $e->getMessage() === 'unknown_table' ? 422 : 500;

            return response()->json(['message' => $e->getMessage() === 'unknown_table' ? 'unknown_table' : 'export_failed'], $code);
        }

        $this->audit->log(AuditLog::ACTION_EXPORT, [
            'module' => 'database',
            'subject_label' => 'database',
            'new_values' => ['kind' => 'database', 'format' => $data['format'], 'tables' => count($tables)],
        ]);

        $name = 'mediary-database-'.now()->format('Y-m-d-His').($data['format'] === 'sql' ? '.sql.gz' : '.zip');

        return response()->download($path, $name, [
            'Content-Type' => $data['format'] === 'sql' ? 'application/gzip' : 'application/zip',
            'X-Content-Type-Options' => 'nosniff',
        ])->deleteFileAfterSend();
    }
}
