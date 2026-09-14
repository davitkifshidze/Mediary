<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Module;
use App\Models\User;
use App\Support\AuditRegistry;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **აუდიტ-ლოგის გვერდი (Tasks §4.4) და გასუფთავება (§4.7)**.
 *
 * ⚠️ **ყველაფრის ერთ პასუხში დაბრუნება არ არის ვარიანტი** (§4.1-ის ცხადი
 * გაფრთხილება): ლოგი სამუდამოდ ინახება და თვეში ათასობით რიგით იზრდება,
 * ე.ი. სია **ყოველთვის** გვერდებზეა და ფილტრები ინდექსებზე დგას.
 *
 * ⚠️ **წაშლა შეუქცევადია** და `confirm: "DELETE"`-ს ითხოვს — `purge`-ის
 * იგივე წესი. სამი ჭრილი ერთდროულად მოქმედებს (ვისი · რა პერიოდის · რა
 * მოქმედების), ზუსტად ისე, როგორც §4.7 ითხოვს.
 *
 * ⚠️ **`plan` და `run` ერთსა და იმავე query-ს იყენებს** (`filtered()`) —
 * თორემ „რამდენი წაიშლება" და „რამდენი წაიშალა" ერთმანეთს აცდებოდა.
 * `PurgeService`-ის მე-2 წესის იგივე გამოყენებაა.
 */
class AdminAuditController extends Controller
{
    private const CONFIRM_WORD = 'DELETE';

    /**
     * **„მოდულის გარეშე" ჭრილი (ეტაპი 10).**
     *
     * შესვლას, გასვლასა და რეგისტრაციას `module` არ აქვთ, ე.ი. `whereIn`-ით
     * მათამდე ფილტრით ვერასდროს მიხვიდოდი და ბარათების ჯამიც „ყველას"
     * ვერასდროს გაუტოლდებოდა. ერთი დაცული გასაღები ამას ასწორებს.
     *
     * ⚠️ **მოდულის ნამდვილ key-ს ვერ დაემთხვევა** — `modules.key` ყოველთვის
     * სექციის სახელია (`movie`, `song`…), `PSEUDO_MODULES` კი ხუთი ცნობილი
     * მნიშვნელობაა; არცერთი არ არის `none`.
     */
    private const MODULE_NONE = 'none';

    /** სია — გვერდებით, ფილტრებით და diff-ისთვის საჭირო ორივე მხარით */
    public function index(Request $request)
    {
        $page = $this->filtered($request)
            ->with('user:id,name,username,avatar_path')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return response()->json([
            'data' => $page->getCollection()->map(fn (AuditLog $log) => $this->payload($log))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /**
     * ფილტრების ლექსიკონები — მომხმარებლები, მოდულები, მოქმედებები.
     *
     * ⚠️ **მოდულების სია `modules`-ს + ფსევდო-მოდულებს აერთებს**: ლოგში
     * ისეთი ჭრილებიც ხვდება, რომელთაც `modules` რიგი არ აქვთ (ანგარიში,
     * ადმინის ზონა, ჩატი, გლობალური ლექსიკონები) — თუ სიაში არ იქნება,
     * იმ რიგებამდე ფილტრით ვერასდროს მიხვალ.
     */
    public function meta()
    {
        return response()->json([
            'actions' => AuditLog::ACTIONS,
            'protected_actions' => AuditLog::PROTECTED_ACTIONS,
            'modules' => [
                ...Module::orderBy('id')->get(['key', 'name_ka', 'name_en'])
                    ->map(fn (Module $m) => [
                        'key' => $m->key,
                        'name_ka' => $m->name_ka,
                        'name_en' => $m->name_en,
                    ])->all(),
                ...array_map(fn (string $key) => [
                    'key' => $key,
                    'name_ka' => null,
                    'name_en' => null,
                ], [...AuditRegistry::PSEUDO_MODULES, self::MODULE_NONE]),
            ],
            'users' => User::orderBy('name')->get(['id', 'name', 'username'])->all(),
        ]);
    }

    /**
     * **ჭრილების მთვლელები (ეტაპი 10)** — რამდენი რიგი აქვს თითო მოდულს
     * და თითო მოქმედებას *მიმდინარე ფილტრში*.
     *
     * ⚠️ **თითოეული ჭრილი საკუთარ თავს არ ითვლის** (`except`): მოდულების
     * რიცხვები მოდულის ფილტრის **გარეშე** ითვლება, მოქმედებებისა კი —
     * მოქმედების გარეშე. სწორედ ეს ხდის ბარათის რიცხვს პატიოსანს: ის
     * ზუსტად ის რაოდენობაა, რასაც იმ ბარათზე დაჭერით მიიღებ. თუ ჭრილი
     * საკუთარ თავსაც გაიტარებდა, არჩეულის გარდა ყველა ბარათი ნულზე
     * ჩამოვიდოდა და „სხვაგან რა დევს" კითხვას ვეღარავინ უპასუხებდა.
     *
     * ⚠️ **სიაც და მთვლელებიც ერთსა და იმავე `filtered()`-ზე დგას** —
     * `GalleryController::sourceQuery()`-ის იგივე წესი: „ბარათზე 40 წერია,
     * შიგნით 37-ია" ვერ მოხდება.
     *
     * ⚠️ **`GET`** — `plan`-ის იგივე მიზეზი: POST-ს `EnsureAdminAccess`
     * `create`-ად წაიკითხავდა და მხოლოდ-ნახვის როლი ცრუ 403-ს მიიღებდა.
     */
    public function summary(Request $request)
    {
        return response()->json([
            'total' => $this->filtered($request)->count(),
            'modules' => $this->facet($this->filtered($request, ['module']), 'module'),
            'actions' => $this->facet($this->filtered($request, ['action']), 'action'),
        ]);
    }

    /**
     * ერთი სვეტის დაჯგუფება — `[{key, total}]`.
     *
     * ⚠️ ცარიელი `module` (შესვლა, გასვლა, რეგისტრაცია) **ცალკე ჭრილია და
     * არა ნაგავი** — `none`-ად ბრუნდება, ე.ი. ბარათებით მიღწევადია.
     *
     * @param  'module'|'action'  $column
     * @return list<array{key: string, total: int}>
     */
    private function facet(Builder $query, string $column): array
    {
        return $query->toBase()
            ->selectRaw($column.' as facet_key, count(*) as total')
            ->groupBy($column)
            ->get()
            ->map(fn ($row) => [
                // ⚠️ ცარიელი მოდული `none`-ად ბრუნდება და არა `null`-ად:
                // რომელ გასაღებზეც აჭერ, იმავეთი ფილტრავ — ორი ლექსიკონი
                // ფრონტსა და backend-ს შორის იმავე დღეს გაშორდებოდა
                'key' => $row->facet_key === null ? self::MODULE_NONE : (string) $row->facet_key,
                'total' => (int) $row->total,
            ])
            ->all();
    }

    /**
     * გასუფთავების **გეგმა** (§4.7) — რამდენი რიგი მოხვდება ფილტრში.
     *
     * ⚠️ დაცული მოქმედებები (`chat_delete`) აქვე იჭრება, ე.ი. ნაჩვენები
     * რიცხვი ნამდვილად წასაშლელთა რაოდენობაა და არა „ფილტრში მოხვედრილთა".
     */
    public function plan(Request $request)
    {
        $query = $this->filtered($request)->cleanable();

        return response()->json([
            'total' => $query->count(),
            // რამდენი გადარჩება დაცვის გამო — ცხადად ითქმის, თორემ
            // „ვირჩევ 100-ს, იშლება 97" აუხსნელი დარჩებოდა
            'protected' => $this->filtered($request)
                ->whereIn('action', AuditLog::PROTECTED_ACTIONS)->count(),
        ]);
    }

    /**
     * გასუფთავება (§4.7) — მონიშნულები (`ids`) ან **მთელი ფილტრი**.
     *
     * ⚠️ `ids` და ფილტრი ერთმანეთს არ ცვლის: მონიშვნა ყოველთვის
     * გაფილტრულის შიგნითაა, ე.ი. ორივე ერთდროულად მოქმედებს და
     * შემთხვევით უფრო ფართო წაშლა შეუძლებელია.
     */
    public function destroy(Request $request)
    {
        $request->validate([
            'confirm' => ['required', 'string', Rule::in([self::CONFIRM_WORD])],
            'ids' => ['nullable', 'array'],
            'ids.*' => ['integer'],
        ]);

        $query = $this->filtered($request)->cleanable();

        $ids = array_filter((array) $request->input('ids', []));
        if ($ids !== []) {
            $query->whereIn('id', $ids);
        }

        return response()->json(['deleted' => $query->delete()]);
    }

    /**
     * ფილტრი — ერთი წყარო სიისთვის, გეგმისთვისაც და წაშლისთვისაც.
     *
     * ⚠️ თარიღები **მთელ დღეს მოიცავს**: `to=2026-09-10` იმ დღის 23:59-საც
     * ნიშნავს, თორემ „დღევანდელი ლოგი" ყოველთვის ცარიელი იქნებოდა.
     *
     * ⚠️ `$except` მხოლოდ `summary()`-სთვისაა (ეტაპი 10) — სიას, გეგმასა და
     * წაშლას **ყოველთვის სრული** ფილტრი ეხება.
     *
     * @param  list<string>  $except  რომელი ჭრილი გამოტოვდეს (`module`/`action`)
     */
    private function filtered(Request $request, array $except = []): Builder
    {
        $query = AuditLog::query();

        if ($userId = $request->integer('user_id')) {
            $query->where('user_id', $userId);
        }

        if (! in_array('module', $except, true) && ($modules = $this->slugList($request->query('module')))) {
            // ⚠️ `none` = „მოდულის გარეშე" (შესვლა/გასვლა/რეგისტრაცია) და
            // `whereIn`-ში `null` ვერ მოხვდება — ამიტომ ცალკე `orWhereNull`
            $keys = array_values(array_diff($modules, [self::MODULE_NONE]));
            $withoutModule = in_array(self::MODULE_NONE, $modules, true);

            $query->where(function (Builder $sub) use ($keys, $withoutModule) {
                if ($keys !== []) {
                    $sub->whereIn('module', $keys);
                }
                if ($withoutModule) {
                    $sub->orWhereNull('module');
                }
            });
        }

        if (! in_array('action', $except, true) && ($actions = $this->slugList($request->query('action')))) {
            $query->whereIn('action', $actions);
        }

        if ($type = $request->query('subject_type')) {
            $query->where('subject_type', $type);
            if ($id = $request->integer('subject_id')) {
                $query->where('subject_id', $id);
            }
        }

        if ($from = $request->query('from')) {
            $query->where('created_at', '>=', $from.' 00:00:00');
        }

        if ($to = $request->query('to')) {
            $query->where('created_at', '<=', $to.' 23:59:59');
        }

        if ($q = trim((string) $request->query('q'))) {
            $like = '%'.$q.'%';
            $query->where(fn (Builder $sub) => $sub
                ->where('subject_label', 'like', $like)
                ->orWhere('route', 'like', $like)
                ->orWhere('user_label', 'like', $like));
        }

        return $query;
    }

    /** ერთი რიგის ფორმა — სიაშიც და diff-ის ხედშიც იგივე */
    private function payload(AuditLog $log): array
    {
        return [
            'id' => $log->id,
            'action' => $log->action,
            'module' => $log->module,
            'user' => $log->user ? [
                'id' => $log->user->id,
                'name' => $log->user->name,
                'username' => $log->user->username,
            ] : null,
            // ⚠️ ანგარიშის წაშლის შემდეგ `user` ცარიელია, `user_label` კი — არა
            'user_label' => $log->user_label,
            'subject' => $log->subject_type ? [
                'type' => $log->subject_type,
                'id' => $log->subject_id,
                'label' => $log->subject_label,
            ] : null,
            'method' => $log->method,
            'route' => $log->route,
            'ip' => $log->ip,
            'user_agent' => $log->user_agent,
            'old_values' => $log->old_values,
            'new_values' => $log->new_values,
            'context' => $log->context,
            // ლოგის რიგი აღარ იშლება ჩვეულებრივი გზით — UI-ს ეს უნდა იცოდეს
            'is_protected' => in_array($log->action, AuditLog::PROTECTED_ACTIONS, true),
            'created_at' => $log->created_at?->toIso8601String(),
        ];
    }
}
