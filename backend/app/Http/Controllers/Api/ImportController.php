<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Services\Import\ImportPlanner;
use App\Services\Import\RowImporter;
use App\Support\ImportSource;
use Illuminate\Http\Request;

/**
 * **FEAT-07 — გარე სერვისის CSV → ბიბლიოთეკა.**
 *
 * ორი ბიჯი, ზუსტად `/purge`-ისა და `/sync`-ის ფორმით: **გეგმა** (რამდენი
 * ახალი / უკვე მაქვს / ვერ წაიკითხა) და **ერთეული** (თითო რიგი — თითო
 * მოკლე რექვესთი, რიგში).
 *
 * ⚠️ **ფაილი მხოლოდ გეგმის დროს იტვირთება და არსად არ ინახება.** გეგმა
 * სრულ, უკვე ნორმალიზებულ სიას აბრუნებს, ე.ი. ერთეულის ბიჯს ფაილი აღარ
 * სჭირდება: არც დროებითი საქაღალდე, არც კვოტა, არც გასუფთავების ვადა.
 * რუკის შეცვლა ფაილის თავიდან გაგზავნაა — ის ბრაუზერში ისედაც ხელთაა.
 *
 * ⚠️ **უფლება ცხადად მოწმდება და არა middleware-ით.** მოდული **ფაილის
 * შიგთავსიდან** ირკვევა და არა მისამართიდან, ე.ი. `permission:@type`-ს
 * წასაკითხი არაფერი აქვს. ამიტომ `plan` თვითონ ითხოვს `view`-ს
 * („რა მოხდებოდა" კითხვაა) და `item` — `create`-ს.
 */
class ImportController extends Controller
{
    public function __construct(
        private readonly ImportPlanner $planner,
        private readonly RowImporter $importer,
        private readonly AuditLogger $audit,
    ) {}

    /** რა წყაროებს ვცნობთ — ფორმას სიის დახატვა სჭირდება */
    public function sources()
    {
        return response()->json([
            'data' => array_map(fn (string $key) => [
                'key' => $key,
                'label' => ImportSource::SOURCES[$key]['label'],
                'module' => ImportSource::SOURCES[$key]['module'],
                'columns' => array_keys(ImportSource::columns($key)),
            ], ImportSource::keys()),
            'max_rows' => ImportSource::MAX_ROWS,
        ]);
    }

    /**
     * ფაილი → გეგმა.
     *
     * ⚠️ **`mimes:csv,txt` და არა `text/csv`-ის ნდობა.** Laravel ტიპს
     * **შიგთავსიდან** კითხულობს (`finfo`), კლიენტის განაცხადს კი არა —
     * ზუსტად ის წესი, რომლითაც SEC-05-ის შემდეგ `svg` აიკრძალა. CSV
     * თვითონ ინერტულია, მაგრამ ფაილს მაინც არავინ ასრულებს: ის
     * იკითხება და გვერდით აღარ ინახება.
     */
    public function plan(Request $request)
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:'.ImportSource::MAX_KB],
            'source' => ['nullable', ImportSource::rule()],
            'mapping' => ['nullable', 'array'],
            'mapping.*' => ['nullable', 'string', 'max:200'],
        ]);

        $plan = $this->planner->plan(
            $request->user(),
            $data['file'],
            $data['source'] ?? null,
            $data['mapping'] ?? null,
        );

        if ($plan['source'] === null) {
            /* ⚠️ „ფორმატი ვერ ვიცანი" **422-ია და არა ცარიელი გეგმა**:
               ცარიელი სია ეკრანზე „ფაილი ცარიელია"-დ იკითხება და
               მომხმარებელი სხვა ფაილს ეძებს იმის ნაცვლად, რომ წყარო
               ხელით აირჩიოს. სათაურები პასუხშია, რომ არჩევა შეძლოს. */
            return response()->json([
                'message' => 'import_source_unknown',
                'headers' => $plan['headers'],
                'sources' => ImportSource::keys(),
            ], 422);
        }

        $this->guard($request, $plan['module'], 'view');

        return response()->json($plan);
    }

    /**
     * ერთი რიგის იმპორტი.
     *
     * ⚠️ **პასუხი არასდროს 5xx-ია.** ერთი ვერნაპოვნი ფილმი რიგს არ უნდა
     * აჩერებდეს — `ok: false` + მიზეზი ზუსტად ის ფორმაა, რომლითაც
     * `/sync` და `/purge`-ის ერთეულები პასუხობენ, და რომელსაც რიგი
     * „ჩავარდნილად" ხატავს გაჩერების გარეშე.
     */
    public function item(Request $request)
    {
        $data = $request->validate([
            'source' => ['required', ImportSource::rule()],
            'row' => ['required', 'array'],
            'row.title' => ['nullable', 'string', 'max:500'],
            'row.year' => ['nullable', 'integer'],
            'row.imdb_id' => ['nullable', 'string', 'max:20'],
            'row.isbn' => ['nullable', 'string', 'max:20'],
            'row.author' => ['nullable', 'string', 'max:300'],
            'row.external_id' => ['nullable', 'string', 'max:50'],
            'row.rating' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'row.status' => ['nullable', 'string', 'max:30'],
            'row.done_at' => ['nullable', 'string', 'max:40'],
        ]);

        $module = ImportSource::module($data['source']);
        $this->guard($request, $module, 'create');

        $row = $data['row'] + [
            'title' => '', 'year' => null, 'imdb_id' => null, 'isbn' => null,
            'author' => null, 'external_id' => null, 'rating' => null,
            'status' => null, 'done_at' => null,
        ];

        $result = $this->importer->import($request->user(), $data['source'], $row);

        if ($result['ok'] && ! $result['skipped']) {
            /* ⚠️ ცალკე `ACTION_*` არ იბადება: ჩანაწერის შექმნას
               `AuditObserver` ისედაც წერს. აქ მხოლოდ **წყარო** ემატება —
               „ეს ფილმი Letterboxd-იდან შემოვიდა" ის ფაქტია, რომელსაც
               მოდელის ივენთი ვერ იცის. */
            $this->audit->log(AuditLog::ACTION_IMPORT, [
                'module' => $module,
                'subject_type' => $module,
                'subject_id' => $result['id'],
                'subject_label' => $result['title'],
                'new_values' => ['source' => $data['source']],
            ]);
        }

        return response()->json($result);
    }

    /**
     * მოდულზე წვდომა + უფლება.
     *
     * ⚠️ **`module:`/`permission:` middleware აქ ვერ დაეწერებოდა** —
     * მოდული **ფაილის შიგთავსიდან** ირკვევა (ან სხეულის `source`-იდან) და
     * არა მისამართიდან, ე.ი. `@type`-ს წასაკითხი არაფერი აქვს.
     * `VisibilityController::guard()`-ის იგივე ცხადი ორი შემოწმება.
     */
    private function guard(Request $request, string $module, string $action): void
    {
        $user = $request->user();

        abort_unless($user->hasModule($module), 403, 'module_disabled');
        abort_unless($user->hasPermission($module, $action), 403, 'forbidden');
    }
}
