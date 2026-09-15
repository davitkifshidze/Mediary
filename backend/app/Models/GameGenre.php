<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * თამაშის ჟანრი — **per-user მართვადი ლექსიკონი** (`book_genres`-ის ანალოგი).
 *
 * ⚠️ გლობალურ `genres`-ს განზრახ არ ვიყენებთ, თუმცა 11.1 ასე წერდა: ის TMDB-ის
 * ფილმის ჟანრებია და „Shooter"/„RPG"/„Platformer" იქ **ფილმის** ჟანრების
 * არჩევანშიც გამოჩნდებოდა. per-user ლექსიკონის წესი 2026-09-03-ზე დაწესდა
 * (სიმღერები), 11.1 კი ერთი დღით ადრეა დაწერილი.
 *
 * ⚠️ კავშირი **მრავალი-მრავალთანაა** (`game_genre_game`) და არა `genre_id` —
 * თამაში ერთდროულად Action + RPG + Adventure-ია.
 */
class GameGenre extends Model
{
    use BelongsToUser;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი ჟანრები (იგივე სია მიგრაციაშიც) */
    public const DEFAULTS = [
        ['key' => 'action', 'name_ka' => 'მოქმედება', 'name_en' => 'Action'],
        ['key' => 'adventure', 'name_ka' => 'სათავგადასავლო', 'name_en' => 'Adventure'],
        ['key' => 'rpg', 'name_ka' => 'როლური (RPG)', 'name_en' => 'RPG'],
        ['key' => 'shooter', 'name_ka' => 'სროლა', 'name_en' => 'Shooter'],
        ['key' => 'strategy', 'name_ka' => 'სტრატეგია', 'name_en' => 'Strategy'],
        ['key' => 'simulation', 'name_ka' => 'სიმულატორი', 'name_en' => 'Simulation'],
        ['key' => 'puzzle', 'name_ka' => 'თავსატეხი', 'name_en' => 'Puzzle'],
        ['key' => 'platformer', 'name_ka' => 'პლატფორმერი', 'name_en' => 'Platformer'],
        ['key' => 'racing', 'name_ka' => 'რბოლა', 'name_en' => 'Racing'],
        ['key' => 'sports', 'name_ka' => 'სპორტი', 'name_en' => 'Sports'],
        ['key' => 'fighting', 'name_ka' => 'ბრძოლა', 'name_en' => 'Fighting'],
        ['key' => 'horror', 'name_ka' => 'საშინელება', 'name_en' => 'Horror'],
        ['key' => 'indie', 'name_ka' => 'ინდი', 'name_en' => 'Indie'],
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

    public function games(): BelongsToMany
    {
        return $this->belongsToMany(Game::class, 'game_genre_game', 'game_genre_id', 'game_id');
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
