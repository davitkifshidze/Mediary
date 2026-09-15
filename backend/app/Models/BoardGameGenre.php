<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ბორდგეიმის ჟანრი — **per-user მართვადი ლექსიკონი** (`book_genres`-ის ანალოგი).
 *
 * ⚠️ გლობალურ `genres`-ს განზრახ არ ვიყენებთ: ის TMDB-ის ფილმის ჟანრებია და
 * „წვეულების" იქ ფილმის არჩევანშიც გამოჩნდებოდა.
 */
class BoardGameGenre extends Model
{
    use BelongsToUser;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი ჟანრები (იგივე სია მიგრაციაშიც) */
    public const DEFAULTS = [
        ['key' => 'strategy', 'name_ka' => 'სტრატეგიული', 'name_en' => 'Strategy'],
        ['key' => 'family', 'name_ka' => 'საოჯახო', 'name_en' => 'Family'],
        ['key' => 'party', 'name_ka' => 'წვეულების', 'name_en' => 'Party'],
        ['key' => 'cooperative', 'name_ka' => 'კოოპერაციული', 'name_en' => 'Cooperative'],
        ['key' => 'card', 'name_ka' => 'საბანქო', 'name_en' => 'Card game'],
        ['key' => 'abstract', 'name_ka' => 'აბსტრაქტული', 'name_en' => 'Abstract'],
        ['key' => 'thematic', 'name_ka' => 'თემატური', 'name_en' => 'Thematic'],
        ['key' => 'wargame', 'name_ka' => 'სამხედრო', 'name_en' => 'Wargame'],
        ['key' => 'childrens', 'name_ka' => 'საბავშვო', 'name_en' => "Children's"],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    /** უსახელო გასაღების ნაცვალი — იხ. `HasDictionaryKey` */
    protected static function keyFallback(): string
    {
        return 'genre';
    }

    public function boardGames(): HasMany
    {
        return $this->hasMany(BoardGame::class, 'genre_id');
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
}
