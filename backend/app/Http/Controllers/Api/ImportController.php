<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Services\Import\ImportException;
use App\Services\Import\ImportPlanner;
use App\Services\Import\MediaryImporter;
use App\Services\Import\MediaryPackage;
use App\Support\ImportSource;
use App\Support\UploadLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * **იმპორტი მხოლოდ შენი მონაცემის ფაილებიდან.**
 *
 * Mediary-ის საკუთარი ექსპორტი — მოდულის JSON/CSV ან „ჩემი სრული ექსპორტის"
 * ZIP — **დამატების** რეჟიმით: ახალი ემატება, არსებული გამოტოვდება.
 * Letterboxd/IMDb/Goodreads/Steam-ის იმპორტი წაშლილია — ის
 * TMDB-ზე, Open Library-სა და RAWG-ზე ეძებდა („სხვა საიტებიდან არ მინდა").
 *
 * სამი ბიჯი, `/purge`-ისა და `/sync`-ის ფორმით: **გეგმა** (ფაილი → დროებითი
 * ასლი + „დაემატება N, გამოტოვდება M"), **ერთეული** (თითო ჩანაწერი — თითო
 * მოკლე მოთხოვნა, რიგში) და **გაუქმება** (დროებითი ასლის წაშლა).
 *
 * ⚠️ **ჩანაცვლება აქ არ არის** — მხოლოდ სუპერადმინს, ცხრილზე ან ბაზაზე,
 * უსაფრთხოების ასლით (`DatabaseImportController`).
 *
 * ⚠️ **სერვისები მეთოდით და არა კონსტრუქტორით** — კონტროლერი მარშრუტზე
 * ინახება, `MediaryFiles` კი ჩანაწერის მდგომარეობას ატარებს.
 */
class ImportController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** რა ფაილს ვიღებთ — ფორმას ზღვრებისა და ფორმატების დახატვა სჭირდება */
    public function sources(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => array_map(fn (string $key) => [
                'key' => $key,
                'label' => ImportSource::SOURCES[$key]['label'],
                'formats' => ImportSource::SOURCES[$key]['formats'],
            ], ImportSource::keys()),
            'max_rows' => ImportSource::MAX_ROWS,
            // ზღვარი KB-ში — PHP-ის ჭერით (`effectiveKb()`)
            'limits' => [
                'file' => UploadLimits::effectiveKb('import', $user),
                'archive' => UploadLimits::effectiveKb('import_archive', $user),
            ],
        ]);
    }

    /**
     * ფაილი → დროებითი ასლი + გეგმა.
     *
     * ⚠️ **ფორმატი შიგთავსიდან მოწმდება** (`UploadLimits::rule()` — `mimes:`),
     * ZIP-ს კი თავისი, დიდი ზღვარი აქვს (`import_archive`).
     */
    public function plan(Request $request, MediaryPackage $package, ImportPlanner $planner): JsonResponse
    {
        $file = $request->file('file');
        $kind = $file && strtolower($file->getClientOriginalExtension()) === 'zip' ? 'import_archive' : 'import';

        $data = $request->validate([
            'file' => ['required', ...UploadLimits::rule($kind, $request->user())],
            // CSV-ის ორაზროვნებაზე (სერიალი · ანიმე) — „წაიკითხე როგორც …"
            'module' => ['nullable', 'string', 'max:40'],
        ]);

        try {
            $meta = $package->stage($request->user(), $data['file'], $data['module'] ?? null);
        } catch (ImportException $e) {
            return response()->json(['message' => $e->getMessage(), ...$e->context], $e->status);
        }

        return response()->json($planner->plan($request->user(), $meta));
    }

    /**
     * ერთი ჩანაწერი.
     *
     * ⚠️ **წვდომა და უფლება იმპორტერში მოწმდება** (`MediaryTargets`) — მოდული
     * ფაილის შიგთავსიდან ირკვევა და არა მისამართიდან.
     */
    public function item(Request $request, MediaryImporter $importer): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'regex:/^[A-Za-z0-9]{40}$/'],
            'module' => ['required', 'string', 'max:40'],
            'index' => ['required', 'integer', 'min:0', 'max:'.ImportSource::MAX_ROWS],
        ]);

        try {
            $result = $importer->import($request->user(), $data['token'], $data['module'], (int) $data['index']);
        } catch (ImportException $e) {
            return response()->json(['message' => $e->getMessage()], $e->status);
        }

        if ($result['ok'] && ! $result['skipped']) {
            /* ⚠️ ჩანაწერის შექმნას `AuditObserver` ისედაც წერს — აქ მხოლოდ **წყარო**
               ემატება: „ეს ფილმი ფაილიდან შემოვიდა" ის ფაქტია, რომელიც მოდელის
               ივენთმა არ იცის. */
            $this->audit->log(AuditLog::ACTION_IMPORT, [
                'module' => $result['module'],
                'subject_type' => $result['module'],
                'subject_id' => $result['id'],
                'subject_label' => $result['title'],
                'new_values' => ['source' => 'mediary'],
            ]);
        }

        return response()->json($result);
    }

    /** დროებითი ასლის წაშლა — გაუქმება ან დასრულება */
    public function discard(Request $request, MediaryPackage $package, string $token): JsonResponse
    {
        $package->discard($request->user(), $token);

        return response()->json(null, 204);
    }
}
