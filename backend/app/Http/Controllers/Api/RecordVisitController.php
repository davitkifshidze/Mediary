<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RecordVisit;
use App\Services\Visits\RecordVisits;
use App\Support\CustomModules;
use App\Support\Visitable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * **„შევედი N-ჯერ" და ჟურნალი — ყველა მოდულზე** (Tasks §10.3).
 *
 * `POST /visits/{type}/{id}` — SPA-ს სიგნალი „დეტალი გაიხსნა" (გვერდის მაუნთი ან
 * მოდალის გახსნა); დედუპლიკაცია `RecordVisits`-შია. `GET` — რიცხვი და ბოლო 20.
 *
 * ⚠️ **`POST` არაფერს ქმნის ბიბლიოთეკაში** — მოდულის middleware-ის გარეთაა
 * (`AuditController::visit()`-ის იგივე მიზეზი: `EnsureModulePermission` POST-ს
 * `create`-ად წაიკითხავდა). მოდული აქვე მოწმდება `Visitable::module()`-ით:
 * ტიპი ყოველთვის მოდულის გასაღები არაა (`playlist`, `custom_record`).
 *
 * ⚠️ **სხვისი ჩანაწერი 404-ია** — `owner` scope-ი მას ვერ პოულობს, ზუსტად
 * როგორც ყველა სხვა route-bound მოდელზე.
 */
class RecordVisitController extends Controller
{
    public function __construct(private RecordVisits $visits) {}

    public function index(Request $request, string $type, int $id): JsonResponse
    {
        $record = $this->record($request, $type, $id);

        return response()->json(['data' => $this->visits->summary($record, $request->user())]);
    }

    public function store(Request $request, string $type, int $id): JsonResponse
    {
        $record = $this->record($request, $type, $id);

        $this->visits->record($record, $request->user(), RecordVisit::SOURCE_LIBRARY);

        return response()->json(['data' => $this->visits->summary($record, $request->user())]);
    }

    private function record(Request $request, string $type, int $id): Model
    {
        abort_unless(Visitable::has($type), 404, 'not_found');

        $record = Visitable::model($type)::query()->find($id);
        abort_unless($record, 404, 'not_found');

        $module = Visitable::module($type, $record);
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
