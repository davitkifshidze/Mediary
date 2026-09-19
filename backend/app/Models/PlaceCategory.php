<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ადგილის კატეგორია — **per-user მართვადი ლექსიკონი**
 * (`bookmark_categories`/`course_categories`-ის ანალოგი).
 *
 * ⚠️ კავშირი **ერთია** (`places.category_id`) და არა pivot — კატეგორია
 * საქაღალდეა, დანარჩენ ჭრილს `tags` ფარავს.
 */
class PlaceCategory extends Model
{
    use BelongsToUser;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი კატეგორიები (იგივე სია მიგრაციაშიც) */
    public const DEFAULTS = [
        ['key' => 'restaurant', 'name_ka' => 'რესტორანი', 'name_en' => 'Restaurant'],
        ['key' => 'cafe', 'name_ka' => 'კაფე', 'name_en' => 'Cafe'],
        ['key' => 'museum', 'name_ka' => 'მუზეუმი', 'name_en' => 'Museum'],
        ['key' => 'nature', 'name_ka' => 'ბუნება', 'name_en' => 'Nature'],
        ['key' => 'city', 'name_ka' => 'ქალაქი', 'name_en' => 'City'],
        ['key' => 'hotel', 'name_ka' => 'სასტუმრო', 'name_en' => 'Hotel'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    protected static function keyFallback(): string
    {
        return 'category';
    }

    public function places(): HasMany
    {
        return $this->hasMany(Place::class, 'category_id');
    }

    /** ლენივი შევსება — მოდულის მოგვიანებით ჩართვაც ერთსა და იმავე გზას გადის */
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
