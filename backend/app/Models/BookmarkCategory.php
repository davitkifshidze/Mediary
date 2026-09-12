<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * ბუკმარკის კატეგორია — **per-user მართვადი ლექსიკონი** (`note_categories`-ის
 * ანალოგი). გლობალურ `genres`-თან საერთო არაფერი აქვს: ის TMDB-ის ფილმის
 * ჟანრებია და „ხელსაწყოები" იქ ფილმის ჟანრების არჩევანში გამოჩნდებოდა.
 *
 * ⚠️ კავშირი **ერთია** (`bookmarks.category_id`) და არა pivot — კატეგორია
 * საქაღალდეა, დანარჩენ ჭრილს `tags` ფარავს.
 */
class BookmarkCategory extends Model
{
    use BelongsToUser;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი კატეგორიები (იგივე სია მიგრაციაშიც) */
    public const DEFAULTS = [
        ['key' => 'reading', 'name_ka' => 'წასაკითხი', 'name_en' => 'Reading'],
        ['key' => 'work', 'name_ka' => 'სამსახური', 'name_en' => 'Work'],
        ['key' => 'learning', 'name_ka' => 'სასწავლო', 'name_en' => 'Learning'],
        ['key' => 'tools', 'name_ka' => 'ხელსაწყოები', 'name_en' => 'Tools'],
        ['key' => 'shopping', 'name_ka' => 'შოპინგი', 'name_en' => 'Shopping'],
        ['key' => 'entertainment', 'name_ka' => 'გასართობი', 'name_en' => 'Entertainment'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function bookmarks(): HasMany
    {
        return $this->hasMany(Bookmark::class, 'category_id');
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

    /** სახელიდან უნიკალური key — ლათინური slug, ქართულ სახელზეც მუშაობს */
    public static function makeKey(int $userId, string $name): string
    {
        $base = Str::slug($name) ?: 'category';
        $key = $base;
        $n = 2;

        while (static::withoutGlobalScope('owner')->where('user_id', $userId)->where('key', $key)->exists()) {
            $key = "{$base}-{$n}";
            $n++;
        }

        return mb_substr($key, 0, 60);
    }
}
