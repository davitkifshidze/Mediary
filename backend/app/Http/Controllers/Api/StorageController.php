<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Illuminate\Http\Request;

/**
 * საცავის მდგომარეობა (Tasks 17.1/17.3).
 *
 * მოდულებად დაშლა დისკს კითხავს, ამიტომ ცალკე endpoint-ია და არა
 * `GET /auth/me`-ს ნაწილი (იქ მხოლოდ დაქეშილი ჯამი მიდის).
 */
class StorageController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function show(Request $request)
    {
        return response()->json($this->meter->usage($request->user(), withModules: true));
    }

    /**
     * **§17.2 — ლიმიტების გადანაწილება მოდულებზე.**
     *
     * ⚠️ `PUT` და არა `POST`: არსებულ მდგომარეობას ვცვლით. `null` მნიშვნელობა
     * ლიმიტს **ხსნის** (მოდული საერთო აუზში ბრუნდება) — 0 კი „ატვირთვა
     * აკრძალულია"-ს ნიშნავს, ე.ი. ორი სხვადასხვა ბრძანებაა.
     *
     * ჯამის შემოწმებას `StorageMeter::setAllocations()` აკეთებს (422
     * `allocation_exceeds_quota`), რომ წესი ერთ ადგილას იყოს.
     */
    public function setAllocations(Request $request)
    {
        $data = $request->validate([
            'allocations' => ['present', 'array'],
            'allocations.*' => ['nullable', 'integer', 'min:0'],
        ]);

        $this->meter->setAllocations($request->user(), $data['allocations']);

        return response()->json($this->meter->usage($request->user()->refresh(), withModules: true));
    }

    /**
     * სრული გადათვლა დისკიდან — მაშინ, როცა მრიცხველი ეჭვქვეშაა
     * (ხელით წაშლილი ფაილი, მიგრაციის შემდეგ პირველი გაშვება).
     */
    public function recalculate(Request $request)
    {
        $this->meter->recalculate($request->user());

        return response()->json($this->meter->usage($request->user()->refresh(), withModules: true));
    }

    /**
     * 17.5 — ატვირთვების **მედია-ბიბლიოთეკა**: ყველა ფაილი ერთად (ფრონტზე
     * სქროლით, ფილტრებით და ძებნით). ადმინის ხედი (`/users/{id}`) იმავე
     * `StorageMeter::files()`-იდან იკვებება, ე.ი. ორი სხვადასხვა სია ვერ გაჩნდება.
     *
     * default-ად **ყველა** ბრუნდება (592 ფაილიც ~100 KB JSON-ია); `limit`
     * მხოლოდ უსაფრთხოების ჭერია, რომ ათასობით ფაილზე პასუხი არ გაიბეროს.
     */
    public function files(Request $request)
    {
        $limit = max(1, min((int) $request->integer('limit', 2000), 5000));
        $files = $this->meter->files($request->user())->sortByDesc('size')->values();

        return response()->json([
            'files' => $files->take($limit)->values()->all(),
            'total' => $files->count(),
            'bytes' => (int) $files->sum('size'),
            // მოდულებად ჯამი — ფილტრის ჩიპებს რიცხვები სჭირდება
            'modules' => $files->groupBy('module')->map(fn ($g) => [
                'files' => $g->count(),
                'bytes' => (int) $g->sum('size'),
            ])->all(),
        ]);
    }

    /**
     * ატვირთული ფაილების წაშლა. `path`-ს ვალიდაციას **`StorageMeter` აკეთებს**
     * (ეძებს user-ის `files()`-ში), ამიტომ სხვისი გზა 404-ია.
     *
     * §6.2 — ბიბლიოთეკამ „მონიშნულების წაშლა" და „ყველას წაშლა" მიიღო, ე.ი.
     * იმავე endpoint-ს ახლა `paths[]`-იც მოსდის. ⚠️ **ცალკე bulk-endpoint
     * განზრახ არ გაჩნდა**: წესი („მხოლოდ ის, რაც `files()`-შია") ერთ ადგილას
     * უნდა იყოს, თორემ ორი გზა ერთ დღეს დაშორდებოდა ერთმანეთს.
     *
     * ⚠️ **`all` ცხადი დროშაა** და არა „ცარიელი `paths`" — გამორჩენილი
     * მონიშვნა ვერასდროს გადაიქცევა „ყველაფერში" (`PurgeService`-ის წესი).
     */
    public function destroyFile(Request $request)
    {
        $data = $request->validate([
            'path' => ['nullable', 'string', 'max:2048'],
            'paths' => ['nullable', 'array', 'max:5000'],
            'paths.*' => ['string', 'max:2048'],
            'all' => ['nullable', 'boolean'],
        ]);

        $user = $request->user();
        $paths = $this->pickPaths($data, $user);

        if ($paths === []) {
            return response()->json(['message' => 'nothing_selected'], 422);
        }

        $result = $this->meter->deleteOwnFiles($user, $paths);

        if (! $result['files']) {
            return response()->json(['message' => 'file_not_found'], 404);
        }

        /* ⚠️ **ჯამი ფესვშივე რჩება** (`used`/`quota`/`modules`) და არქვემოთ,
           `storage` გასაღების ქვეშ: ერთი ფაილის წაშლა ამ ფორმას აბრუნებდა და
           მისი გადატანა ფრონტისა და ტესტების ჩუმი გატეხვა იყო. ახალი ორი
           რიცხვი მას **ემატება**. */
        return response()->json([
            ...$this->meter->usage($user->refresh(), withModules: true),
            'deleted' => $result['files'],
            'freed' => $result['bytes'],
        ]);
    }

    /**
     * **§6.2 — მონიშნულების/ყველას ჩამოტვირთვა ერთ zip-ად.**
     *
     * ⚠️ **`POST` და არა `GET`**: მონიშვნა ასეულ გზას შეიძლება შეიცავდეს და
     * query-string-ს ეს არ ჯდება. `EnsureModulePermission` აქ არ ერევა —
     * `/storage/*` მოდულის ჯგუფში არ არის.
     *
     * არქივს `StorageMeter::archiveOwnFiles()` აწყობს, ე.ი. „რომელი დისკიდან"
     * ისევ `StorageFolder`-ის საქმეა და აქ დისკის სახელი არ იწერება.
     */
    public function downloadFiles(Request $request)
    {
        $data = $request->validate([
            'paths' => ['nullable', 'array', 'max:5000'],
            'paths.*' => ['string', 'max:2048'],
            'all' => ['nullable', 'boolean'],
        ]);

        $user = $request->user();
        $paths = $this->pickPaths($data, $user);

        if ($paths === []) {
            return response()->json(['message' => 'nothing_selected'], 422);
        }

        $zip = $this->meter->archiveOwnFiles($user, $paths);

        if (! $zip) {
            return response()->json(['message' => 'file_not_found'], 404);
        }

        return response()->download($zip, 'mediary-files-'.now()->format('Y-m-d').'.zip', [
            'Content-Type' => 'application/zip',
        ])->deleteFileAfterSend();
    }

    /**
     * `path` / `paths[]` / `all` → გზების სია.
     *
     * @param  array<string, mixed>  $data
     * @return list<string>
     */
    private function pickPaths(array $data, User $user): array
    {
        if ($data['all'] ?? false) {
            return $this->meter->files($user)->pluck('path')->all();
        }

        return array_values(array_filter(array_map(
            'strval',
            $data['paths'] ?? array_filter([$data['path'] ?? null]),
        )));
    }

    /**
     * 17.5 — ობოლი ფაილები. **გლობალური** ოპერაციაა (ბაზაში არ-მოხსენიებულ
     * ფაილს მფლობელი აღარ აქვს), ამიტომ route `super_admin`-ითაა შემოსაზღვრული.
     */
    public function orphans()
    {
        $orphans = $this->meter->orphans();

        return response()->json([
            'files' => $orphans->take(100)->values()->all(),
            'total' => $orphans->count(),
            'bytes' => (int) $orphans->sum('size'),
        ]);
    }

    public function cleanOrphans(Request $request)
    {
        $result = $this->meter->cleanOrphans();

        return response()->json([
            ...$result,
            'storage' => $this->meter->usage($request->user()),
        ]);
    }
}
