<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Support\CustomModules;
use App\Support\Openable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * **SPA-ს სიგნალები ჟურნალისთვის** — სექციაში შესვლა (Tasks §4.1), ჩანაწერის
 * გახსნა და დაჭერები/განახლება (Tasks §43).
 *
 * ⚠️ **სიგნალი ფრონტიდან მოდის და არა middleware-იდან, და ეს განზრახაა.**
 * აპლიკაცია SPA-ა: სექციაში შესვლა მარშრუტის შეცვლაა და არა HTTP
 * რექვესთი — ერთი გვერდი ხუთ GET-ს აგზავნის, ხოლო ბრაუზერის „უკან"
 * არცერთს. ყოველი GET-ის ლოგირება ორივე მხრიდან ცრუ სურათს დახატავდა
 * (ხმაური + გამოტოვებული შესვლები).
 *
 * ⚠️ **`POST`, მაგრამ არაფერს ქმნის მომხმარებლის ბიბლიოთეკაში** — მოდულის
 * middleware-ს გარეთაა, ე.ი. `EnsureModulePermission`-ის „POST = create"
 * წესს არ ხვდება და view-only მომხმარებელსაც ეწერება ლოგი.
 *
 * გამეორების ჩახშობა `AuditLogger`-შია (`visit` — ერთი წუთი იმავე გზაზე,
 * `open` — ერთი წუთი იმავე ჩანაწერზე); გამორთული ტიპი იქვე იგდება (§43.5).
 */
class AuditController extends Controller
{
    /** დაჭერის როლები — მხოლოდ ინტერაქტიული ელემენტი (Q10) */
    private const CLICK_ROLES = ['button', 'link', 'menuitem', 'tab', 'option', 'switch'];

    public function __construct(private AuditLogger $audit) {}

    public function visit(Request $request)
    {
        $data = $request->validate([
            'path' => ['required', 'string', 'max:400'],
            'module' => ['nullable', 'string', 'max:40'],
        ]);

        $this->audit->visit($data['path'], $data['module'] ?? null);

        return response()->noContent();
    }

    /**
     * **ჩანაწერის გახსნა** (Tasks §43, Q10) — ადრე `POST /visits/{type}/{id}` (§10).
     *
     * ⚠️ **სხვისი ჩანაწერი 404-ია** — `owner` scope-ი მას ვერ პოულობს, ზუსტად
     * როგორც ყველა სხვა route-bound მოდელზე; მოდული აქვე მოწმდება
     * `Openable::module()`-ით (ტიპი მოდულის გასაღები ყოველთვის არაა).
     */
    public function open(Request $request, string $type, int $id): Response
    {
        $this->audit->open($this->record($request, $type, $id));

        return response()->noContent();
    }

    /**
     * **დაჭერები და განახლება პაკეტად** (Tasks §43.4) — SPA ყოველ ~5 წამში და
     * გვერდის დატოვებისას აგზავნის, ≤ 50 თითო პაკეტში.
     *
     * ⚠️ ვალიდაცია **მხოლოდ ოთხ ველს** ტოვებს — ზედმეტი (მაგ. ველის მნიშვნელობა)
     * ჩაწერამდე ვერ აღწევს. უცნობი ტიპი 422-ია.
     */
    public function events(Request $request): JsonResponse
    {
        $data = $request->validate([
            'events' => ['required', 'array', 'min:1', 'max:50'],
            'events.*.action' => ['required', 'string', Rule::in(AuditLog::EVENT_ACTIONS)],
            'events.*.path' => ['required', 'string', 'max:400'],
            'events.*.label' => ['nullable', 'string', 'max:500'],
            'events.*.role' => ['nullable', 'string', Rule::in(self::CLICK_ROLES)],
        ]);

        return response()->json(['written' => $this->audit->events($data['events'])]);
    }

    private function record(Request $request, string $type, int $id): Model
    {
        abort_unless(Openable::has($type), 404, 'not_found');

        $record = Openable::model($type)::query()->find($id);
        abort_unless($record, 404, 'not_found');

        $module = Openable::module($type, $record);
        $user = $request->user();

        if (! $user->hasModule($module)) {
            // `EnsureModuleEnabled`-ის იგივე ენა: სხვისი პირადი მოდული 404, საკუთარი გამორთული 403
            if (CustomModules::isKey($module) && ! CustomModules::owns($user, $module)) {
                abort(404, 'not_found');
            }

            abort(403, 'module_not_enabled');
        }

        return $record;
    }
}
