<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **მორიგეობის ტიპი (Tasks §34)** — „8 სთ“ · „12 სთ“ · „24 სთ“ და შენი.
 *
 * ⚠️ **კლასიფიკატორია** (`/dictionaries`, `bookmark_categories`-ის შაბლონი):
 * ორენოვანი სახელი, რადგან სამი ნაგულისხმევი კოდიდან მოდის; წაშლა —
 * გადატანა/უტიპოდ დატოვება/ჩანაწერებით, ურნაში (`DictionaryTrash`, `duty_type`).
 * უტიპო მორიგეობა „ქასთომ საათებია“ — საათები და თანხა მასზევე წერია.
 */
class DutyShiftType extends Model
{
    use BelongsToUser, HasTrash;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი ტიპები (Q8 — 8, 12 და 24 საათი) */
    public const DEFAULTS = [
        ['key' => 'h8', 'name_ka' => '8 სთ', 'name_en' => '8 h', 'hours' => 8, 'icon' => 'Sun'],
        ['key' => 'h12', 'name_ka' => '12 სთ', 'name_en' => '12 h', 'hours' => 12, 'icon' => 'Sunset'],
        ['key' => 'h24', 'name_ka' => '24 სთ', 'name_en' => '24 h', 'hours' => 24, 'icon' => 'Moon'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'hours' => 'decimal:1',
        'sort_order' => 'integer',
        'trash_meta' => 'array',
    ];

    protected static function keyFallback(): string
    {
        return 'type';
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(DutyShift::class, 'type_id');
    }

    public function rates(): HasMany
    {
        return $this->hasMany(DutyRate::class, 'type_id');
    }

    /** ლენივი შევსება — მოდულის მოგვიანებით ჩართვაც ერთსა და იმავე გზას გადის */
    public static function ensureDefaults(int $userId): void
    {
        // ⚠️ ურნაში მყოფიც (Tasks §29) — სხვაგვარად ნაგულისხმევები იმავე გასაღებით ჩაიწერებოდა და ინდექსი დაიძვრებოდა
        if (static::withoutGlobalScopes(['owner', 'trash'])->where('user_id', $userId)->exists()) {
            return;
        }

        foreach (static::DEFAULTS as $i => $type) {
            static::withoutGlobalScope('owner')->create($type + [
                'user_id' => $userId,
                'sort_order' => $i + 1,
            ]);
        }
    }
}
