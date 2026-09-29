<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Support\AppSettings;
use App\Support\TrashDomain;
use App\Support\UploadLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * **ინსტალაციის პარამეტრების ჩაწერა (Tasks §34.1)** — მხოლოდ `super_admin`.
 *
 * ⚠️ **`super_admin` და არა `admin_access:`** — ორივე პარამეტრი **ყველა**
 * ანგარიშს ეხება (`admin/modules`-ისა და `admin/purge`-ის მსჯელობა): ერთი
 * სექციის უფლება ინსტალაციის წესს ვერ შეცვლის.
 *
 * ⚠️ **ჩაწერა მოდელით მიდის** (`AppSettings::put()`), ე.ი. `AuditObserver`
 * ცვლილებას `admin` ჭრილში წერს — „ვინ და როდის შეცვალა ლიმიტი".
 */
class AdminInstallationController extends Controller
{
    /**
     * **ატვირთვის ლიმიტები** (§34.2) — მხოლოდ მოსული სახეობები იცვლება.
     *
     * ⚠️ **ფორმატი სიიდან ირჩევა** (`UploadLimits::selectable()`): კატალოგის
     * გარეთ მდგომი — მათ შორის ყოველი აქტიური შიგთავსი (svg, html, js…) —
     * **422**-ია და არა ჩუმი გამოტოვება, თორემ რედაქტორი „შენახულია"-ს
     * იტყოდა იმაზე, რაც არ ჩაირთო.
     */
    public function updateUploads(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kinds' => ['required', 'array', 'min:1'],
            'kinds.*' => ['array'],
            'kinds.*.max_kb' => ['sometimes', 'integer', 'min:'.UploadLimits::MIN_KB, 'max:'.UploadLimits::CEILING_KB],
            // ⚠️ ცარიელი სია აკრძალულია — სახეობა, რომელიც არაფერს იღებს, ატვირთვის ღილაკს მთელ აპში ჩუმად ტეხს
            'kinds.*.formats' => ['sometimes', 'array', 'min:1'],
            'kinds.*.formats.*' => ['string', 'max:10'],
        ]);

        foreach ($data['kinds'] as $kind => $values) {
            if (! array_key_exists($kind, UploadLimits::KINDS)) {
                return response()->json(['message' => 'upload_kind_unknown', 'kind' => $kind], 422);
            }

            if (isset($values['formats']) && ! UploadLimits::isLocked($kind)) {
                $bad = UploadLimits::outside($kind, $values['formats']);

                if ($bad !== []) {
                    return response()->json([
                        'message' => 'upload_format_not_allowed',
                        'kind' => $kind,
                        'formats' => $bad,
                    ], 422);
                }
            }
        }

        UploadLimits::saveInstallation($data['kinds'], $request->user());

        return response()->json(['data' => [
            ...UploadLimits::all($request->user()),
            'can_edit' => true,
        ]]);
    }

    /**
     * **ურნის ზედა ზღვარი** (Tasks §29.6 → §34.1).
     *
     * ⚠️ `null` ან `config`-ის ტოლი რიცხვი — **ნაგულისხმევზე დაბრუნებაა** (რიგი
     * იშლება), ე.ი. `TRASH_MAX_DAYS`-ის შეცვლა `.env`-ში ისევ მოქმედებს, სანამ
     * სუპერადმინს საკუთარი რიცხვი არ დაუწერია.
     *
     * ⚠️ **გასუფთავების დრო (`prune_at`) განზრახ აქ არ არის** — ის 03:00-ის
     * ასლის **შემდეგ** უნდა იდგეს (ასლი წაშლამდე აიღება), ასლის დრო კი
     * `.env`-შია; ერთის ინტერფეისში გადატანა ამ რიგს დაარღვევინებდა.
     */
    public function updateTrash(Request $request): JsonResponse
    {
        $data = $request->validate([
            'max_days' => ['present', 'nullable', 'integer', 'min:'.TrashDomain::MIN_DAYS, 'max:'.TrashDomain::MAX_DAYS_CEILING],
        ]);

        $days = $data['max_days'];

        if ($days === null || (int) $days === TrashDomain::configMaxDays()) {
            AppSettings::forget(TrashDomain::MAX_DAYS_SETTING);
        } else {
            AppSettings::put(TrashDomain::MAX_DAYS_SETTING, (int) $days, $request->user());
        }

        return response()->json([
            'max_days' => TrashDomain::maxDays(),
            'default_max_days' => TrashDomain::configMaxDays(),
        ]);
    }
}
