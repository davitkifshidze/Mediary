<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * კურსის კატეგორია — **per-user მართვადი ლექსიკონი** (`bookmark_categories`-ის
 * ანალოგი). გლობალურ `genres`-თან საერთო არაფერი აქვს: ის TMDB-ის ფილმის
 * ჟანრებია და „პროგრამირება" იქ ფილმის ჟანრების არჩევანში გამოჩნდებოდა.
 *
 * ⚠️ კავშირი **ერთია** (`courses.category_id`) და არა pivot — კატეგორია
 * საქაღალდეა, დანარჩენ ჭრილს `tags` ფარავს (§13/§18-ის წესი).
 */
class CourseCategory extends Model
{
    use BelongsToUser;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი კატეგორიები (იგივე სია მიგრაციაშიც) */
    public const DEFAULTS = [
        ['key' => 'programming', 'name_ka' => 'პროგრამირება', 'name_en' => 'Programming'],
        ['key' => 'design', 'name_ka' => 'დიზაინი', 'name_en' => 'Design'],
        ['key' => 'business', 'name_ka' => 'ბიზნესი', 'name_en' => 'Business'],
        ['key' => 'language', 'name_ka' => 'ენები', 'name_en' => 'Languages'],
        ['key' => 'science', 'name_ka' => 'მეცნიერება', 'name_en' => 'Science'],
        ['key' => 'hobby', 'name_ka' => 'ჰობი', 'name_en' => 'Hobby'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    /** უსახელო გასაღების ნაცვალი — იხ. `HasDictionaryKey` */
    protected static function keyFallback(): string
    {
        return 'category';
    }

    public function courses(): HasMany
    {
        return $this->hasMany(Course::class, 'category_id');
    }

    /**
     * ამ user-ს ჯერ ერთი კატეგორიაც არ აქვს → დეფაულტები შეიქმნას.
     * ლენივი შევსება მიგრაციაზე საიმედოა: ახალი ანგარიშიც და მოდულის
     * მოგვიანებით ჩართვაც ერთსა და იმავე გზას გადის.
     */
    public static function ensureDefaults(int $userId): void
    {
        if (static::withoutGlobalScope('owner')->where('user_id', $userId)->exists()) {
            return;
        }

        foreach (static::DEFAULTS as $i => $category) {
            static::withoutGlobalScope('owner')->create($category + [
                'user_id' => $userId,
                'sort_order' => $i + 1,
            ]);
        }
    }
}
