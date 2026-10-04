<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Support\AuditSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **„ჟურნალის პარამეტრები" — რა იწერება** (Tasks §43.5).
 *
 * ⚠️ **`super_admin` და არა `admin_access:audit`**: გადამრთველი ყველა ანგარიშის
 * ჩაწერას ცვლის (ინსტალაციის პარამეტრია — `AdminInstallationController`-ის
 * წესი), ჟურნალის ნახვის უფლება კი ერთი სექციისაა.
 *
 * ⚠️ შენახვა `AppSettings::put()`-ით მიდის, ე.ი. თვითონ ცვლილება ჟურნალში
 * ჩანს („ვინ გამორთო დაჭერები"), თუ რედაქტირების ჩაწერა ჩართულია.
 */
class AdminAuditSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => AuditSettings::describe()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'off' => ['present', 'array'],
            // ⚠️ დაცული ტიპი (ჩატის წაშლა) ვერ გამოირთვება — 422 და არა ჩუმი გამოტოვება
            'off.*' => ['string', Rule::in(array_keys(AuditSettings::KINDS)), Rule::notIn(AuditSettings::PROTECTED)],
        ]);

        AuditSettings::save($data['off'], $request->user());

        return response()->json(['data' => AuditSettings::describe()]);
    }
}
