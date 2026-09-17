<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Services\Modules\CustomFieldService;
use App\Support\CustomFields;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * **მორგებული ველები (Tasks §6, ფაზა 3 · `DECISIONS.md` §2).**
 *
 * ორი წყვილი endpoint-ია და ორივე განზრახ **ერთია რვავე მოდულზე**:
 *  · განსაზღვრებები — `GET|PUT /api/modules/{key}/custom-fields`;
 *  · მნიშვნელობები — `GET|PUT /api/custom-fields/{module}/{id}`
 *    (იგივე ნიმუში, რაც `/visibility/{domain}/{id}`-ს აქვს).
 *
 * ⚠️ **რვა კონტროლერი განზრახ არ იწერება**, თუმცა ცხრილი თითოა: ცხრილს
 * სვეტების სახელები აქვს და ის მართლა სექციისაა, ლოგიკა კი ერთი და იგივეა —
 * რვა ასლი დროთა განმავლობაში ერთმანეთს დაშორდებოდა.
 *
 * ⚠️ **`PUT` და არა `POST`** — `EnsureModulePermission` POST-იდან `create`-ს
 * გამოიყვანდა და მხოლოდ რედაქტირების უფლების მქონე user-ს ცრუ 403 დაუბრუნდებოდა.
 *
 * ⚠️ **მფლობელობა ცხადად მოწმდება**: ჩანაწერი მოდელით იძებნება (`BelongsToUser`-ის
 * `owner` scope-ით), ე.ი. სხვისი ჩანაწერის id **404-ია**.
 */
class CustomFieldController extends Controller
{
    public function __construct(private CustomFieldService $custom) {}

    /** ამ მოდულის მორგებული ველების განსაზღვრებები */
    public function index(Request $request, string $key)
    {
        $this->guardModule($request, $key);

        return response()->json(['fields' => $this->custom->definitions($request->user(), $key)]);
    }

    /**
     * განსაზღვრებების ჩაწერა — **მთელი სია**.
     *
     * ⚠️ სიიდან ამოღებული ველი იშლება **მნიშვნელობებთან ერთად** (იხ.
     * `CustomFieldService::saveDefinitions()`), თორემ ბაზაში მუდამ დარჩებოდა
     * რიგები, რომლებსაც აღარაფერი კითხულობს.
     */
    public function update(Request $request, string $key)
    {
        $this->guardModule($request, $key);

        $data = $request->validate([
            'fields' => ['present', 'array', 'max:'.CustomFieldService::MAX_FIELDS],
            // key-ის გარეშე მოსული ველი ახალია — key სახელიდან იქმნება
            'fields.*.key' => ['nullable', 'string', 'max:60'],
            'fields.*.type' => ['required', Rule::in(CustomFields::TYPES)],
            'fields.*.label_ka' => ['nullable', 'string', 'max:120'],
            'fields.*.label_en' => ['nullable', 'string', 'max:120'],
            'fields.*.placeholder_ka' => ['nullable', 'string', 'max:120'],
            'fields.*.placeholder_en' => ['nullable', 'string', 'max:120'],
            'fields.*.enabled' => ['nullable', 'boolean'],
            'fields.*.required' => ['nullable', 'boolean'],
            'fields.*.sort_order' => ['nullable', 'integer', 'min:0', 'max:999'],
        ]);

        // ⚠️ ტიპის შეცვლა/წაშლა ატვირთულ ფაილსაც იტანს (§6 ფაზა 4b) — ამას
        // `saveDefinitions()` აკეთებს, რომ კვოტა და დისკი ერთ ადგილას დარჩეს

        return response()->json([
            'fields' => $this->custom->saveDefinitions($request->user(), $key, $data['fields']),
        ]);
    }

    /** ერთი ჩანაწერის მნიშვნელობები */
    public function values(Request $request, string $module, int $id)
    {
        $this->guardRecord($request, $module, $id);

        return response()->json([
            'values' => $this->custom->values($request->user(), $module, $id),
        ]);
    }

    /**
     * მნიშვნელობების ჩაწერა.
     *
     * ⚠️ **ტიპებს აქ არ ვამოწმებთ ველ-ველად** — ის განსაზღვრებიდან იცის
     * სერვისმა და შეუსაბამო მნიშვნელობა ჩუმად აგდებულია. ვალიდაციის
     * გამეორება აქ ორ წყაროს შექმნიდა.
     */
    public function setValues(Request $request, string $module, int $id)
    {
        $this->guardRecord($request, $module, $id);

        $data = $request->validate(['values' => ['present', 'array']]);

        return response()->json([
            'values' => $this->custom->setValues($request->user(), $module, $id, $data['values']),
        ]);
    }

    /* ---------- §6 ფაზა 4b — `ფაილი` ტიპი (🔗 §17) ---------- */

    /**
     * ატვირთვა ერთ ველზე.
     *
     * ⚠️ **ცალკე endpoint და არა მნიშვნელობების `PUT`.** ორი მიზეზი: multipart
     * ვერ ჩაჯდება იმავე JSON სხეულში, და — რაც უფრო მნიშვნელოვანია — ბარათი
     * მთელ მონახაზს აგზავნის, ე.ი. ჩვეულებრივი „შენახვა" ატვირთულ ფაილს
     * ცარიელ მნიშვნელობად წაიკითხავდა და ჩუმად წაშლიდა.
     *
     * ⚠️ **კვოტა `storeUpload()`-შია** (§17-ის ცენტრალური წესი): ლიმიტის
     * ამოწურვაზე პასუხი 413-ია და არა 422 — ანგარიშისაზეც (`storage_quota_exceeded`)
     * და მოდულისაზეც (`module_quota_exceeded`, §17.2), რადგან საქაღალდე
     * მოდულის თავის ფესვშია.
     */
    public function storeFile(Request $request, string $module, int $id)
    {
        $this->guardRecord($request, $module, $id);

        $rules = ['file', 'max:'.CustomFields::FILE_MAX_KB, 'mimes:'.CustomFields::FILE_MIMES];

        $data = $request->validate([
            'key' => ['required', 'string', 'max:60'],
            // §7.3 — ერთი ფაილი ან პარტია. ⚠️ **ძველი `file` ველი შენარჩუნებულია**,
            // რომ ერთფაილიანი გამომძახებელი არ გატყდეს
            'file' => ['required_without:files', ...$rules],
            'files' => ['required_without:file', 'array', 'max:'.CustomFields::FILE_MAX_COUNT],
            'files.*' => $rules,
        ]);

        // ⚠️ არა-`file` ველზე ატვირთვა **422-ია და არა ჩუმი იგნორი**: ბაიტები
        // უკვე მოვიდა და „წარმატება" ისეთ რამეს დაპირდებოდა, რაც არ მოხდა
        abort_unless(
            $this->custom->typeOf($request->user(), $module, $data['key']) === 'file',
            422,
        );

        $files = $request->hasFile('files') ? $request->file('files') : [$request->file('file')];
        $value = null;

        foreach ($files as $file) {
            $value = $this->custom->storeFile($request->user(), $module, $id, $data['key'], $file);

            /* ⚠️ **ჭერზე 422 და არა ჩუმი გაჩერება.** პარტიის შუაში ამოწურვა
               იმას ნიშნავს, რომ ნაწილი აიტვირთა — სწორედ ამიტომ ბრუნდება
               მიმდინარე სია პასუხში (გალერეის იგივე ქცევა კვოტის ამოწურვაზე). */
            if ($value === null) {
                return response()->json([
                    'message' => 'custom_field_file_limit',
                    'max' => CustomFields::FILE_MAX_COUNT,
                    'value' => $this->custom->values($request->user(), $module, $id)[$data['key']] ?? [],
                ], 422);
            }
        }

        return response()->json(['value' => $value], 201);
    }

    /**
     * **ფაილის გაცემა.** ერთადერთი გზა, რომლითაც მორგებული ველის ატვირთვა
     * გარეთ გადის — `notes/fields` პრივატულ დისკზეა (§17.5), დანარჩენი კი
     * იმიტომ გადის აქედან, რომ ორი განსხვავებული ქცევა ფრონტზე `if`-ს
     * დაბადებდა და ერთ დღეს პრივატულიც `/storage/*`-ზე გავიდოდა.
     *
     * ⚠️ **მფლობელობა ცხადად მოწმდება** (`guardRecord` + `user_id`) და პასუხი
     * **404-ია და არა 403** — „ეს ჩანაწერი არსებობს" თვითონაც ინფორმაციაა.
     */
    public function showFile(Request $request, string $module, int $id, string $key, ?int $file = null)
    {
        $this->guardRecord($request, $module, $id);

        $row = DB::table(CustomFields::table($module))
            ->where('user_id', $request->user()->getKey())
            ->where('record_id', $id)
            ->where('field_key', $key)
            ->whereNotNull('value_path')
            // §7.3 — ⚠️ id-ის გარეშე **პირველი** გაიცემა: ძველი ერთფაილიანი
            // მისამართი (`…/file/{key}`) ისევ უნდა მუშაობდეს
            ->when($file !== null, fn ($q) => $q->where('id', $file))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->first();

        abort_unless($row, 404);

        $disk = Storage::disk(StorageFolder::diskFor((string) $row->value_path));

        abort_unless($disk->fileExists($row->value_path), 404);

        /* სურათი/PDF ბარათშივე უნდა გაიხსნას; ჩამოტვირთვას ფრონტი blob-იდან აწყობს.
           ⚠️ **`inline` მხოლოდ სკრიპტის არშემსრულებელ ტიპებზე** (Tasks SEC-08) და
           MIME **ფაილიდან**, და არა `value_mime`-იდან: ის სვეტი კლიენტის ნათქვამს
           ატარებდა, ე.ი. `.html`-ად ატვირთული ფაილი აპის origin-ზე იხატებოდა.
           ⚠️ მფლობელობის შემოწმება ამას არ ხსნიდა — იგივე რიგი ადმინის
           ფაილ-ბიბლიოთეკაშიც ჩანს (SEC-04-ის შაბლონი). */
        return SafeMime::response($disk, $row->value_path, $row->value_name);
    }

    /**
     * ფაილის მოშორება — რიგიც იშლება, რადგან `file` ველზე ფაილი *არის* მნიშვნელობა.
     *
     * ⚠️ **`{file}` არჩევითია** (§7.3): მითითებით ერთი ფაილი, მის გარეშე —
     * ველის ყველა ფაილი. ე.ი. ძველი ერთფაილიანი მისამართი ისევ იმას აკეთებს,
     * რასაც აკეთებდა.
     */
    public function destroyFile(Request $request, string $module, int $id, string $key, ?int $file = null)
    {
        $this->guardRecord($request, $module, $id);

        abort_unless($this->custom->clearFile($request->user(), $module, $id, $key, $file), 404);

        return response()->noContent();
    }

    /* ---------- დამხმარეები ---------- */

    private function guardModule(Request $request, string $key): void
    {
        abort_unless(CustomFields::supports($key), 404);

        Module::where('key', $key)->where('is_active', true)->firstOrFail();
        abort_unless($request->user()->hasModule($key), 403);
    }

    private function guardRecord(Request $request, string $module, int $id): void
    {
        $this->guardModule($request, $module);

        $model = CustomFields::model($module);
        // `owner` global scope-ის გამო სხვისი ჩანაწერი აქ **არ იძებნება**
        abort_unless($model && $model::whereKey($id)->exists(), 404);
    }
}
