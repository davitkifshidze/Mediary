<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CustomCategory;
use App\Models\User;
use App\Services\Purge\PurgeService;
use App\Services\Storage\StorageMeter;
use App\Support\CustomModules;
use App\Support\MediaDomain;
use App\Support\Redact;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/**
 * მასობრივი წაშლა ადმინიდან (Tasks 20).
 *
 * ორნაბიჯიანია: `plan` აჩვენებს, **რა** წაიშლება (ჩანაწერი, ფოტო, მოცულობა),
 * `run` კი მოითხოვს ცხად დადასტურებას — `confirm = "DELETE"`. ერთი „დიახ"
 * განზრახ არ კმარა: ეს ერთადერთი endpoint-ია, რომელსაც ბიბლიოთეკის
 * წაშლა შეუძლია.
 *
 * `super_admin`-ზეა (route-ის ჯგუფი) და `user_id`-ით სხვისი ანგარიშსაც
 * ასუფთავებს — `PurgeService` სკოუპს ცხადად წერს, Auth-ს არ ეყრდნობა.
 */
class AdminPurgeController extends Controller
{
    public function __construct(
        private PurgeService $purge,
        private StorageMeter $meter,
    ) {}

    public function plan(Request $request)
    {
        $data = $this->validated($request);
        $user = $this->targetUser($request, $data);

        // ⚠️ Tasks §29.8 — `/purge` სამიზნე ანგარიშის ურნაში აგზავნის (Q39 — „ა")
        $plan = $this->purge->plan($user, $data, PurgeService::TO_TRASH);

        return response()->json([
            'plan' => $plan,
            // ერთეული = ერთი ჩანაწერი რიგში (20.2)
            'eta_seconds' => (int) ceil(count($plan['items']) * 60 / PurgeService::ITEMS_PER_MINUTE),
            'user' => ['id' => $user->id, 'display_name' => $user->display_name],
            'storage' => $this->meter->usage($user),
        ]);
    }

    /**
     * `ids` სკოუპის ამრჩევის სია (§25.2).
     *
     * ⚠️ **`GET`-ია და არა `POST`** — მხოლოდ კითხულობს. `POST`-ს ისედაც
     * `confirm`-ის ლოგიკასთან აურევდნენ, და ჩვენ აქ არაფერს ვშლით.
     *
     * ⚠️ **სია სამიზნე ანგარიშისაა** (`user_id`), და სწორედ ეს არის ამ
     * endpoint-ის აზრი — მოდულის თავისი `index()` ყოველთვის მოვალის
     * ჩანაწერებს აბრუნებს (`owner` სკოუპი), ე.ი. ადმინს სხვისი
     * ბიბლიოთეკის არჩევა იქიდან **შეუძლებელი** იყო.
     */
    public function records(Request $request)
    {
        $data = $request->validate([
            'target' => ['required', 'string', 'max:40'],
            'media_type' => ['nullable', MediaDomain::rule()],
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
        ]);

        $user = $this->targetUser($request, $data);
        $this->assertTarget($user, $data['target']);

        return response()->json([
            'items' => $this->purge->records($user, $data['target'], $data['media_type'] ?? null),
        ]);
    }

    public function run(Request $request)
    {
        $data = $this->validated($request, withConfirm: true);
        $user = $this->targetUser($request, $data);

        $result = $this->purge->run($user, $data, PurgeService::TO_TRASH);

        return response()->json([
            'result' => $result,
            'storage' => $this->meter->usage($user->refresh()),
        ]);
    }

    /**
     * რიგის ერთი ნაბიჯი (20.2) — ერთი ჩანაწერი, ერთი მოკლე რექვესთი.
     *
     * `mode`/სკოუპი აქ **არ მონაწილეობს**: id-ები `plan`-მა უკვე გამოთვალა და
     * user-მა დაადასტურა, ე.ი. ვალიდაცია მხოლოდ სამიზნესა და ანგარიშზეა.
     * per-item შეცდომა 200-ით ბრუნდება (`ok:false`), რომ ფრონტის ციკლი
     * ერთი ჩავარდნაზე არ გაწყდეს — იგივე წესი, რაც `/sync`-ზეა.
     */
    public function item(Request $request)
    {
        $data = $request->validate([
            'target' => ['required', 'string', 'max:40'],
            'media_type' => ['nullable', MediaDomain::rule()],
            'id' => ['required', 'integer'],
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            /* §25.5 — „ფოტოები გალერეაში დამიტოვე". ⚠️ რიგის **ყოველ** ნაბიჯს
               უნდა მოჰყვეს, თორემ პირველი ჩანაწერის ფოტოები დარჩებოდა და
               დანარჩენების — წაიშლებოდა. */
            'keep_gallery' => ['nullable', 'boolean'],
            // ⚠️ დადასტურება თითოეულ ნაბიჯზეც — ჩუმად ვერ გაეშვება
            'confirm' => ['required', 'in:DELETE'],
        ]);

        $user = $this->targetUser($request, $data);
        $this->assertTarget($user, $data['target']);

        try {
            $result = $this->purge->runOne($user, $data, (int) $data['id'], PurgeService::TO_TRASH);
        } catch (\Throwable $e) {
            Log::warning('purge item failed', [
                'user_id' => $user->getKey(),
                'target' => $data['target'],
                'id' => $data['id'],
                'error' => Redact::secrets($e->getMessage()),
            ]);

            return response()->json(['ok' => false, 'error' => Redact::secrets($e->getMessage())]);
        }

        return response()->json([
            'ok' => true,
            // ჩანაწერი უკვე აღარ იყო (სხვა სესიამ წაშალა) — რიგში „გამოტოვებული"
            'skipped' => $result['records'] === 0 && $result['photos'] === 0,
            'result' => $result,
            'storage' => $this->meter->usage($user->refresh()),
        ]);
    }

    private function validated(Request $request, bool $withConfirm = false): array
    {
        $rules = [
            // ⚠️ §37.5 — სია სამიზნე ანგარიშისაა (მისი პირადი მოდულებით), ქვემოთ მოწმდება
            'target' => ['required', 'string', 'max:40'],
            'mode' => ['required', Rule::in(PurgeService::MODES)],
            // `target = gallery`-ზე რომელ დომენის ჩანაწერებს ვასუფთავებთ
            'media_type' => ['nullable', MediaDomain::rule()],
            'ids' => ['nullable', 'array'],
            'ids.*' => ['integer'],
            'genres' => ['nullable', 'array'],
            'genres.*' => ['string'],
            // ⚠️ ლექსიკონი დომენზეა დამოკიდებული (ფილმი `watched`, წიგნი `read`,
            // ბორდგეიმი `owned`) — კონკრეტული სია ქვემოთ მოწმდება
            'status' => ['nullable', 'string'],
            'type_ids' => ['nullable', 'array'],
            'type_ids.*' => ['integer'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string'],
            'keep_favorites' => ['nullable', 'boolean'],
            // §25.5 — ფოტოები უკატეგორიოში გადადის და არა იშლება
            'keep_gallery' => ['nullable', 'boolean'],
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
        ];

        if ($withConfirm) {
            // ⚠️ ხელით ჩაწერილი დადასტურება (20.2) — ჩუმად ვერ გაეშვება
            $rules['confirm'] = ['required', 'in:DELETE'];
        }

        $data = $request->validate($rules);

        $this->assertTarget($this->targetUser($request, $data), $data['target']);

        // სკოუპის სავალდებულო პარამეტრები — ცარიელი ფილტრი „ყველად" არ იქცევა
        $missing = match ($data['mode']) {
            'ids' => empty($data['ids']),
            'genre' => empty($data['genres']),
            'status' => empty($data['status']),
            'type' => empty($data['type_ids']),
            'tag' => empty($data['tags']),
            default => false,
        };

        abort_if($missing, 422, 'scope_required');

        // რეჟიმი სამიზნეს უნდა შეესაბამებოდეს — ერთი წყარო `TARGET_MODES`,
        // იმავეს ხატავს ფრონტიც (`PURGE_TARGET_MODES`)
        abort_unless(
            in_array($data['mode'], PurgeService::modesFor($data['target']), true),
            422,
            'mode_not_supported_for_target',
        );

        // სტატუსი დომენის ლექსიკონიდან — თორემ `read` ფილმზეც გაივლიდა და
        // სკოუპი ჩუმად ცარიელი დარჩებოდა
        if ($data['mode'] === 'status') {
            $domain = $data['target'] === 'gallery' ? ($data['media_type'] ?? 'movie') : $data['target'];

            /* ⚠️ სია **სამიზნე ანგარიშისაა** და არა ჩემი (§6.4): სტატუსი
               per-user ლექსიკონია, ე.ი. მისი გადარქმეული „ნანახი" ჩემს
               ნაგულისხმევებთან შედარებისას ცრუ 422-ს მოგვცემდა. */
            $userId = isset($data['user_id'])
                ? (int) $data['user_id']
                : (int) $request->user()->id;

            abort_unless(
                in_array($data['status'], PurgeService::statusesFor($domain, $userId), true),
                422,
                'invalid_status',
            );
        }

        return $data;
    }

    /**
     * **სამიზნე ანგარიშის პირადი მოდულები (Tasks §37.5)** —
     * `GET /admin/purge/targets?user_id=`.
     *
     * ⚠️ ცალკე endpoint-ია, რადგან სხვისი პირადი მოდული ყველა ჩვეულებრივ კარზე
     * 404-ია (Q28) — `/modules` მხოლოდ **ჩემსას** აბრუნებს. აქ მხოლოდ ის ჩანს,
     * რაც სუპერადმინს Q41-ით ისედაც ეკუთვნის: სახელი, ხატულა, ფერი და
     * რომელი სკოუპები აქვს; ჩანაწერების შიგთავსი — არა.
     */
    public function targets(Request $request)
    {
        $data = $request->validate([
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
        ]);

        $user = $this->targetUser($request, $data);

        return response()->json([
            'items' => CustomModules::of($user)->values()->map(fn ($module) => [
                'key' => $module->key,
                'name_ka' => $module->name_ka,
                'name_en' => $module->name_en,
                'icon' => $module->icon,
                'color' => $module->color,
                'modes' => PurgeService::modesFor($module->key),
                /* `type` სკოუპის ჩამონათვალი — **სამიზნის** კლასიფიკატორი.
                   ⚠️ მოდულის თავისი `/custom/{key}/categories` მფლობელისაა და
                   ადმინს 404-ს უბრუნებს, ე.ი. სია მხოლოდ აქედან მოდის. */
                'categories' => CustomModules::classifies($module->key)
                    ? CustomCategory::withoutGlobalScope('owner')
                        ->where('user_id', $user->getKey())
                        ->where('module', $module->key)
                        ->orderBy('sort_order')
                        ->orderBy('id')
                        ->get(['id', 'name_ka', 'name_en', 'icon'])
                        ->all()
                    : [],
            ])->all(),
        ]);
    }

    /**
     * სამიზნე **ამ ანგარიშისაა** — საბაზისო მოდული ან მისი პირადი (§37.5).
     *
     * ⚠️ სხვა ანგარიშის პირადი გასაღები 422-ია — იგივე, რაც უცნობ სამიზნეზე:
     * „ასეთი მოდული სხვასთან არსებობს" არ ჟონავს.
     */
    private function assertTarget(User $user, string $target): void
    {
        if (! in_array($target, PurgeService::targets($user), true)) {
            abort(response()->json([
                'message' => 'invalid_target',
                'errors' => ['target' => ['invalid_target']],
            ], 422));
        }
    }

    private function targetUser(Request $request, array $data): User
    {
        return isset($data['user_id'])
            ? User::findOrFail($data['user_id'])
            : $request->user();
    }
}
