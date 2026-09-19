<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Support\TrashDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * **კალათა (FEAT-11).**
 *
 * `GET /api/trash` · `POST /api/trash/{domain}/{id}` (აღდგენა) ·
 * `DELETE /api/trash/{domain}/{id}` (ახლავე წაშლა) · `DELETE /api/trash`
 * (დაცლა, ტიპიზებული `DELETE`-ით).
 *
 * ⚠️ **ერთი კონტროლერი ათივე დომენზე** — `/visibility/{domain}` და
 * `/statuses/{domain}`-ის ფორმა. ათი თითქმის იდენტური endpoint სწორედ ის
 * დუბლირებაა, რომელსაც ამ პროექტში ყოველ ჯერზე რუკა ცვლის.
 *
 * ⚠️ **`module:`/`permission:` middleware განზრახ არ ადევს.** `@type`
 * პარამეტრს **`type`** ჰქვია და აქ `domain`-ია, ე.ი. middleware
 * ყოველთვის `movie`-ის უფლებას შეამოწმებდა; ორივე შემოწმება ცხადად
 * კონტროლერშია — `VisibilityController::guard()`-ის იგივე გზა.
 *
 * ⚠️ **აღდგენა `POST`-ია და არა `PATCH`.** `EnsureModulePermission` აქ
 * არ დგას, მაგრამ თუ ოდესმე დადგება, `POST`-ს `create`-ად წაიკითხავს —
 * ამიტომ მისი ბოლო სეგმენტი (`restore`) `UPDATE_ENDPOINTS`-შია.
 */
class TrashController extends Controller
{
    /**
     * კალათის შიგთავსი.
     *
     * ⚠️ **ერთი პასუხი ყველა დომენზე** — გვერდი ისედაც ყველას ერთად
     * ხატავს და ათი მოთხოვნა `throttle:api`-ს ერთ გახსნაზე ათით ხარჯავდა.
     */
    public function index(Request $request)
    {
        $data = $request->validate([
            'domain' => ['nullable', 'string', TrashDomain::rule()],
        ]);

        $user = $request->user();
        $modules = $this->modules($request);
        $groups = [];

        foreach ($modules as $module) {
            $domain = $module->key;

            if (isset($data['domain']) && $data['domain'] !== $domain) {
                continue;
            }

            $model = TrashDomain::model($domain);

            $items = $model::onlyTrashed()
                ->where('user_id', $user->getKey())
                ->orderByDesc('trashed_at')
                ->limit(self::PER_DOMAIN)
                ->get();

            $total = $model::onlyTrashed()->where('user_id', $user->getKey())->count();

            if ($total === 0) {
                continue;
            }

            $groups[] = [
                'domain' => $domain,
                'name_ka' => $module->name_ka,
                'name_en' => $module->name_en,
                'icon' => $module->icon,
                'color' => $module->color,
                'total' => $total,
                'items' => $items->map(fn (Model $record) => [
                    'id' => $record->getKey(),
                    'title' => $this->title($record),
                    'trashed_at' => $record->trashed_at?->toIso8601String(),
                    /* ⚠️ რჩება თუ არა დრო — სერვერი ითვლის, რადგან ვადა
                       `TrashDomain::KEEP_DAYS`-შია და კლიენტში მისი ასლი
                       პირველივე შეცვლაზე დაშორდებოდა. */
                    'expires_in_days' => max(0, TrashDomain::KEEP_DAYS - (int) $record->trashed_at?->diffInDays(now())),
                ])->all(),
            ];
        }

        return response()->json([
            'keep_days' => TrashDomain::KEEP_DAYS,
            'data' => $groups,
        ]);
    }

    /** აღდგენა */
    public function restore(Request $request, string $domain, int $id)
    {
        $record = $this->find($request, $domain, $id);

        if (! $record) {
            return response()->json(['message' => 'not_found'], 404);
        }

        // ⚠️ ჟურნალს `HasTrash` წერს — ათივე დომენი, ერთი ადგილი
        $record->restoreFromTrash();

        return response()->json(['restored' => true]);
    }

    /**
     * ახლავე წაშლა — ნამდვილად.
     *
     * ⚠️ **აქ `delete()`-ია და არა `moveToTrash()`** — ჩანაწერი უკვე
     * კალათაშია, ე.ი. მოვლენები უნდა გაისროლოს: ფაილები დისკიდან,
     * კვოტა, გალერეა და pivot-ები სწორედ ახლა თავისუფლდება.
     */
    public function destroy(Request $request, string $domain, int $id)
    {
        $record = $this->find($request, $domain, $id);

        if (! $record) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $record->delete();

        return response()->noContent();
    }

    /**
     * კალათის დაცლა.
     *
     * ⚠️ **ტიპიზებული `DELETE` სავალდებულოა** — ეს ერთადერთი ღილაკია,
     * რომელიც ერთ დაჭერაზე ბევრ ჩანაწერს შეუქცევადად შლის, ე.ი. იმავე
     * რიგშია, რაც `/purge` და ლექსიკონის „ჩანაწერებიც წაშალე".
     */
    public function empty(Request $request)
    {
        $data = $request->validate([
            'confirm' => ['required', 'string', 'in:DELETE'],
            'domain' => ['nullable', 'string', TrashDomain::rule()],
        ]);

        $user = $request->user();
        $deleted = 0;

        foreach ($this->modules($request) as $module) {
            $domain = $module->key;

            if (isset($data['domain']) && $data['domain'] !== $domain) {
                continue;
            }

            $model = TrashDomain::model($domain);

            /* ⚠️ `lazyById` და არა `get()`: ათასი ჩანაწერი მეხსიერებაში
               არ უნდა ჩაიტვირთოს — და არც `chunk()`, რომელიც offset-ით
               დადის და წაშლისას ყოველ მეორე გვერდს ჩუმად ტოვებს. */
            foreach ($model::onlyTrashed()->where('user_id', $user->getKey())->lazyById() as $record) {
                $record->delete();
                $deleted++;
            }
        }

        return response()->json(['deleted' => $deleted]);
    }

    /* ---------- დამხმარეები ---------- */

    /** თითო დომენზე რამდენი რიგი ჩანს */
    private const PER_DOMAIN = 50;

    /**
     * ჩართული, ნებადართული და კალათის მქონე მოდულები.
     *
     * ⚠️ **უფლება `delete`-ია და არა `view`.** კალათა წაშლილს აჩვენებს და
     * აღდგენასაც სთავაზობს — ორივე წაშლის უფლების გაგრძელებაა; მხოლოდ-ნახვის
     * როლს იქ ჩვენება არაფრის აქვს, რადგან მან წაშლა ვერც შეძლო.
     *
     * @return Collection<int, Module>
     */
    private function modules(Request $request)
    {
        $user = $request->user();

        return Module::where('is_active', true)
            ->whereIn('key', TrashDomain::domains())
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->filter(fn (Module $m) => $user->hasModule($m->key) && $user->hasPermission($m->key, 'delete'))
            ->values();
    }

    /**
     * ⚠️ **`EnsureRecordOwnership` აქ ვერ დაეხმარება** — ის route-ით
     * მიბმულ მოდელს ამოწმებს, აქ კი დომენი სტრიქონია და მოდელი ხელით
     * იძებნება. ამიტომ მფლობელი ცხადად მოწმდება და პასუხი **404**-ია
     * და არა 403 (პროექტის წესი: „ეს ჩანაწერი არსებობს" თვითონ ინფორმაციაა).
     */
    private function find(Request $request, string $domain, int $id): ?Model
    {
        if (! TrashDomain::has($domain)) {
            return null;
        }

        $user = $request->user();

        if (! $user->hasModule($domain) || ! $user->hasPermission($domain, 'delete')) {
            return null;
        }

        $model = TrashDomain::model($domain);

        return $model::onlyTrashed()
            ->where('user_id', $user->getKey())
            ->find($id);
    }

    /**
     * სათაური — ათი დომენი, სამი განსხვავებული სქემა.
     *
     * ⚠️ **სერვერი წყვეტს და არა კლიენტი** — ნაწილს `title` აქვს, ნაწილს
     * `title_ka`/`title_en` აქსესორები; ორივე მხარეს ჩაწერილი რუკა
     * პირველივე ახალ მოდულზე დაშორდებოდა (`/purge`-ის ჩანაწერების
     * ამომრჩევის იგივე წესი).
     */
    private function title(Model $record): string
    {
        foreach (['title_ka', 'title_en', 'title', 'name'] as $field) {
            $value = $record->getAttribute($field);

            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return '#'.$record->getKey();
    }
}
