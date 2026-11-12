<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Bookmark;
use App\Models\BookmarkOwnField;
use App\Services\Audit\AuditLogger;
use App\Support\AuditRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * **ბუკმარკის საკუთარი ველები** — „სახელი → მნიშვნელობა" სია ერთ ჩანაწერზე.
 *
 * ⚠️ **სია მთლიანად იწერება** (`PUT`): რიგი სწორედ მასივის რიგია, ე.ი. ცალკე
 * „გადაალაგე" არ არსებობს. `id`-იანი რიგი ახლდება, უ`id`-ო — იქმნება,
 * სიაში არმყოფი — იშლება.
 * ⚠️ **მნიშვნელობა მხოლოდ მფლობელს უბრუნდება და მხოლოდ აქედან** — ბუკმარკის
 * რესურსი, სია, ძებნის შედეგი, საჯარო გვერდი და გაზიარება მას არ ატარებს.
 * ⚠️ **ჟურნალში ფაქტი და არა მნიშვნელობა**: იწერება ღია ველების სახელები და
 * საიდუმლოების რაოდენობა; საიდუმლო ველის სახელიც კი არ ჩანს.
 */
class BookmarkFieldController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    public function index(Bookmark $bookmark): JsonResponse
    {
        return response()->json(['data' => $this->payload($bookmark)]);
    }

    public function replace(Request $request, Bookmark $bookmark): JsonResponse
    {
        $data = $request->validate([
            'fields' => ['present', 'array', 'max:'.BookmarkOwnField::MAX],
            'fields.*.id' => ['nullable', 'integer'],
            'fields.*.label' => ['required', 'string', 'max:'.BookmarkOwnField::LABEL_MAX],
            'fields.*.value' => ['nullable', 'string', 'max:'.BookmarkOwnField::VALUE_MAX],
            'fields.*.is_secret' => ['nullable', 'boolean'],
        ]);

        DB::transaction(function () use ($bookmark, $data) {
            $existing = $bookmark->ownFields()->get()->keyBy('id');
            $kept = [];

            foreach (array_values($data['fields']) as $position => $row) {
                $field = $existing->get((int) ($row['id'] ?? 0))
                    ?? $bookmark->ownFields()->make(['user_id' => $bookmark->user_id]);

                $field->label = $row['label'];
                $field->is_secret = (bool) ($row['is_secret'] ?? false);
                $field->sort_order = $position;

                /* ⚠️ წაუკითხავი მნიშვნელობა (სხვა `APP_KEY`-ით დაშიფრული) ფანჯარაში
                   ცარიელად მიდის — მისი უკან „ცარიელად შენახვა" შიფრს სამუდამოდ წაშლიდა. */
                if (! ($field->exists && ! $field->isReadable() && ($row['value'] ?? null) === null)) {
                    $field->value = $row['value'] ?? null;
                }

                $field->save();
                $kept[] = $field->id;
            }

            $existing->except($kept)->each->delete();
        });

        $fields = $bookmark->ownFields()->get();

        $this->audit->log(AuditLog::ACTION_UPDATE, [
            'module' => 'bookmark',
            'subject_type' => AuditRegistry::typeFor($bookmark),
            'subject_id' => $bookmark->id,
            'subject_label' => $bookmark->title,
            'new_values' => [
                'own_fields' => $fields->where('is_secret', false)->pluck('label')->values()->all(),
                'secret_fields' => $fields->where('is_secret', true)->count(),
            ],
        ]);

        return response()->json(['data' => $this->payload($bookmark)]);
    }

    /** @return list<array{id: int, label: string, value: ?string, is_secret: bool, readable: bool}> */
    private function payload(Bookmark $bookmark): array
    {
        return $bookmark->ownFields()->get()->map(fn (BookmarkOwnField $field) => [
            'id' => $field->id,
            'label' => $field->label,
            'value' => $field->value,
            'is_secret' => $field->is_secret,
            // `false` — მნიშვნელობა ამ მანქანის გასაღებით არ იშიფრება
            'readable' => $field->isReadable(),
        ])->all();
    }
}
