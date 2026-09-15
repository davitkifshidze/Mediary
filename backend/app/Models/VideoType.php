<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
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
    use BelongsToUser;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი ტიპები (5.1) */
    public const DEFAULTS = [
        ['key' => 'info', 'name_ka' => 'ინფორმაციული', 'name_en' => 'Informational', 'icon' => 'BookOpen'],
        ['key' => 'fun', 'name_ka' => 'გასართობი', 'name_en' => 'Entertainment', 'icon' => 'Clapperboard'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
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
        if (static::withoutGlobalScope('owner')->where('user_id', $userId)->exists()) {
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
