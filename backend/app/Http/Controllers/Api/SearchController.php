<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Search\GlobalSearch;
use Illuminate\Http\Request;

/**
 * **ჯვარედინი ძებნა (აუდიტი 2026-09-14, §D6)** — `GET /api/search?q=`.
 *
 * ⚠️ **მოდულის ჯგუფის გარეთ დგას განზრახ.** ძებნა ერთ მოდულს არ ეკუთვნის —
 * ის ყველა **ჩართულზე** გადის, ხოლო „რომელია ჩართული" გადაწყვეტილებას
 * `GlobalSearch` იღებს (`$user->hasModule()`). `module:` middleware აქ ერთ
 * კონკრეტულ მოდულს მოითხოვდა და კითხვას აზრს დაუკარგავდა — იგივე მიზეზი,
 * რის გამოც `/web/*` და `/translations/summary` ჯგუფებს გარეთ არიან.
 *
 * ⚠️ **`GET` და არა `POST`** — ძებნა კითხვაა; `EnsureModulePermission` POST-ს
 * `create`-ად წაიკითხავდა (`GET /board-games/shops`-ის იგივე მიზეზი).
 */
class SearchController extends Controller
{
    public function index(Request $request, GlobalSearch $search)
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'max:200'],
            'per_module' => ['nullable', 'integer', 'min:1', 'max:'.GlobalSearch::PER_MODULE_MAX],
            // ⚠️ ერთი დომენის ღრმა დათვალიერება — გვერდის „მეტის ჩვენება"
            'domain' => ['nullable', 'string', 'max:40'],
        ]);

        return response()->json($search->search(
            $request->user(),
            $data['q'],
            (int) ($data['per_module'] ?? GlobalSearch::PER_MODULE),
            $data['domain'] ?? null,
        ));
    }
}
