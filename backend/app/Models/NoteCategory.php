<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * ჩანაწერის კატეგორია — „რას ეხება" (Tasks §13.1).
 *
 * **per-user მართვადი ლექსიკონი**, ზუსტად ისე, როგორც `book_genres` /
 * `board_game_genres`. გლობალურ `genres`-ს აქაც განზრახ არ ვიყენებთ: ის
 * TMDB-ის ფილმის ჟანრებია და „დოკუმენტები" იქ ფილმის არჩევანშიც გამოჩნდებოდა.
 */
class NoteCategory extends Model
{
    use BelongsToUser;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი კატეგორიები (იგივე სია მიგრაციაშიც) */
    public const DEFAULTS = [
        ['key' => 'documents', 'name_ka' => 'დოკუმენტები', 'name_en' => 'Documents', 'icon' => 'FileText'],
        ['key' => 'instructions', 'name_ka' => 'ინსტრუქციები', 'name_en' => 'Instructions', 'icon' => 'ListChecks'],
        ['key' => 'ideas', 'name_ka' => 'იდეები', 'name_en' => 'Ideas', 'icon' => 'Lightbulb'],
        ['key' => 'work', 'name_ka' => 'სამსახური', 'name_en' => 'Work', 'icon' => 'Briefcase'],
        ['key' => 'personal', 'name_ka' => 'პირადი', 'name_en' => 'Personal', 'icon' => 'User'],
        ['key' => 'shopping', 'name_ka' => 'შესყიდვები', 'name_en' => 'Shopping', 'icon' => 'ShoppingCart'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function noteEntries(): HasMany
    {
        return $this->hasMany(NoteEntry::class, 'category_id');
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
