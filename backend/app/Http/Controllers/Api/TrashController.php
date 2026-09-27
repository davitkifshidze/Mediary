<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Trash\TrashBin;
use App\Support\TrashDomain;
use Illuminate\Http\Request;

/**
 * **ურნა (FEAT-11 → Tasks §29).**
 *
 * `GET /api/trash` · `POST /api/trash/{kind}/{id}/restore` (აღდგენა) ·
 * `DELETE /api/trash/{kind}/{id}` (ახლავე წაშლა) · `GET /api/trash/{kind}/{id}/file`
 * (ესკიზი) · `DELETE /api/trash` (დაცლა, ტიპიზებული `DELETE`-ით).
 *
 * ⚠️ **ლოგიკა `TrashBin`-შია** — კონტროლერი მხოლოდ ვალიდაციას აკეთებს.
 * ურნა ახლა ჩანაწერებსაც, რიგიან ფაილებსაც და `trashed_files`-საც ფარავს,
 * ხოლო იგივე წესები გასუფთავების ბრძანებასაც სჭირდება.
 *
 * ⚠️ **მარშრუტის პარამეტრს ისტორიულად `domain` ჰქვია** — ახლა ის ურნის
 * ნებისმიერი სახეა (`TrashDomain::kinds()`); სახელის შეცვლა SPA-ს და
 * ძველ ბმულებს გატეხდა, ფაქტს კი არაფერს შეცვლიდა.
 *
 * ⚠️ **`module:`/`permission:` middleware განზრახ არ ადევს** — `@type`
 * პარამეტრს **`type`** ჰქვია და აქ სხვაა; უფლებას `TrashBin` ცხადად
 * ამოწმებს (`VisibilityController::guard()`-ის იგივე გზა).
 */
class TrashController extends Controller
{
    public function __construct(private TrashBin $bin) {}

    public function index(Request $request)
    {
        return response()->json($this->bin->listing($request->user()));
    }

    /**
     * აღდგენა — საჭიროებისას მშობელ ჩანაწერთან ერთად (29.5).
     *
     * `records: true` — კლასიფიკატორის რიგზე წაშლამ გადატანილი ჩანაწერებიც
     * ბრუნდება (Tasks §29, ეტაპი 3).
     */
    public function restore(Request $request, string $domain, int $id)
    {
        $data = $request->validate([
            'records' => ['nullable', 'boolean'],
            // ეტაპი 4 — მთავარი ფოტო/ავატარი დაკავებულ სვეტში: ახლანდელი ურნაში გადავა
            'replace' => ['nullable', 'boolean'],
        ]);

        return response()->json($this->bin->restore(
            $request->user(),
            $domain,
            $id,
            (bool) ($data['records'] ?? false),
            (bool) ($data['replace'] ?? false),
        ));
    }

    /** ახლავე წაშლა — ნამდვილად */
    public function destroy(Request $request, string $domain, int $id)
    {
        $this->bin->destroy($request->user(), $domain, $id);

        return response()->noContent();
    }

    /** ურნაში მყოფი ფაილის ესკიზი — პირად დისკზეც */
    public function file(Request $request, string $domain, int $id)
    {
        return $this->bin->file($request->user(), $domain, $id);
    }

    /**
     * ურნის დაცლა.
     *
     * ⚠️ **ტიპიზებული `DELETE` სავალდებულოა** — ეს ერთადერთი ღილაკია,
     * რომელიც ერთ დაჭერაზე ბევრ ელემენტს შეუქცევადად შლის.
     */
    public function empty(Request $request)
    {
        $data = $request->validate([
            'confirm' => ['required', 'string', 'in:DELETE'],
            'domain' => ['nullable', 'string', TrashDomain::rule()],
        ]);

        return response()->json(['deleted' => $this->bin->empty($request->user(), $data['domain'] ?? null)]);
    }
}
