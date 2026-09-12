<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * წიგნის ჟანრი — **per-user მართვადი ლექსიკონი** (`song_genres`-ის ანალოგი).
 *
 * ⚠️ გლობალურ `genres`-ს განზრახ არ ვიყენებთ: ის TMDB-ის ფილმის ჟანრებია და
 * „ბიოგრაფია" იქ ფილმის ჟანრების არჩევანშიც გამოჩნდებოდა.
 */
class BookGenre extends Model
{
    use BelongsToUser;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი ჟანრები (იგივე სია მიგრაციაშიც) */
    public const DEFAULTS = [
        ['key' => 'fiction', 'name_ka' => 'მხატვრული', 'name_en' => 'Fiction'],
        ['key' => 'non-fiction', 'name_ka' => 'არამხატვრული', 'name_en' => 'Non-fiction'],
        ['key' => 'fantasy', 'name_ka' => 'ფენტეზი', 'name_en' => 'Fantasy'],
        ['key' => 'sci-fi', 'name_ka' => 'სამეცნიერო ფანტასტიკა', 'name_en' => 'Science fiction'],
        ['key' => 'detective', 'name_ka' => 'დეტექტივი', 'name_en' => 'Detective'],
        ['key' => 'history', 'name_ka' => 'ისტორია', 'name_en' => 'History'],
        ['key' => 'biography', 'name_ka' => 'ბიოგრაფია', 'name_en' => 'Biography'],
        ['key' => 'psychology', 'name_ka' => 'ფსიქოლოგია', 'name_en' => 'Psychology'],
        ['key' => 'business', 'name_ka' => 'ბიზნესი', 'name_en' => 'Business'],
        ['key' => 'tech', 'name_ka' => 'ტექნოლოგიები', 'name_en' => 'Technology'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function books(): HasMany
    {
        return $this->hasMany(Book::class, 'genre_id');
    }

    /**
     * ამ user-ს ჯერ ერთი ჟანრიც არ აქვს → დეფაულტები შეიქმნას.
     * ლენივი შევსება მიგრაციაზე საიმედოა: ახალი ანგარიშიც და მოდულის
     * მოგვიანებით ჩართვაც ერთსა და იმავე გზას გადის.
     */
    public static function ensureDefaults(int $userId): void
    {
        if (static::withoutGlobalScope('owner')->where('user_id', $userId)->exists()) {
            return;
        }

        foreach (static::DEFAULTS as $i => $genre) {
            static::withoutGlobalScope('owner')->create($genre + [
                'user_id' => $userId,
                'sort_order' => $i + 1,
            ]);
        }
    }

    /** სახელიდან უნიკალური key — ლათინური slug, ქართულ სახელზეც მუშაობს */
    public static function makeKey(int $userId, string $name): string
    {
        $base = Str::slug($name) ?: 'genre';
        $key = $base;
        $n = 2;

        while (static::withoutGlobalScope('owner')->where('user_id', $userId)->where('key', $key)->exists()) {
            $key = "{$base}-{$n}";
            $n++;
        }

        return mb_substr($key, 0, 60);
    }
}
