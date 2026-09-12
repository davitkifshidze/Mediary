<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Audit\AuditLogger;
use Illuminate\Http\Request;

/**
 * **„რომელ სექციაში შევიდა" (Tasks §4.1)**.
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
 * გამეორების ჩახშობა `AuditLogger::visit()`-შია (ერთი წუთის ფანჯარა).
 */
class AuditController extends Controller
{
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
}
