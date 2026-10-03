<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ვიდეოს ტიპი (Tasks 5.1) — per-user მართვადი ლექსიკონი.
 *
 * ჟანრებისგან განსხვავებით ეს **არ არის** გლობალური: ტიპი ისეთივე პირადია,
 * როგორც თვითონ ვიდეო, ამიტომ `BelongsToUser`-ის `owner` scope-ზე გადის.
 */
class VideoType extends Model
{
    /**
     * ⚠️ **ურნა (Tasks §29, ეტაპი 3)** — წაშლა რიგს ურნაში აგზავნის
     * (`DictionaryTrash::trash()`); `trash_meta` იმახსოვრებს გადატანილ
     * ჩანაწერებს, რომ აღდგენამ მათი დაბრუნება შემოგთავაზოს.
     */
    use BelongsToUser, HasTrash;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /**
     * ახალ ანგარიშზე ავტომატურად შექმნილი ტიპები (5.1).
     * Tasks §19.2 — `color` სტატუსის პალიტრის გასაღებია (`lib/statusColor.ts`):
     * ინფორმაციული — ლურჯი, გასართობი — იისფერი.
     */
    public const DEFAULTS = [
        ['key' => 'info', 'name_ka' => 'ინფორმაციული', 'name_en' => 'Informational', 'icon' => 'BookOpen', 'color' => 'c7'],
        ['key' => 'fun', 'name_ka' => 'გასართობი', 'name_en' => 'Entertainment', 'icon' => 'Clapperboard', 'color' => 'c8'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'trash_meta' => 'array',
        'sort_order' => 'integer',
    ];

    /** უსახელო გასაღების ნაცვალი — იხ. `HasDictionaryKey` */
    protected static function keyFallback(): string
    {
        return 'type';
    }

    public function videos(): HasMany
    {
        return $this->hasMany(Video::class, 'type_id');
    }

    /**
     * ამ user-ს ჯერ ერთი ტიპიც არ აქვს → დეფაულტები შეიქმნას.
     * ლენივი შევსება მიგრაციაზე უფრო საიმედოა: ახალი ანგარიშიც და
     * მოდულის მოგვიანებით ჩართვაც ერთსა და იმავე გზას გადის.
     */
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
