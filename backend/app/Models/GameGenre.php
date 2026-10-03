<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use App\Models\Concerns\HasTrash;
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
    /**
     * ⚠️ **ურნა (Tasks §29, ეტაპი 3)** — წაშლა რიგს ურნაში აგზავნის
     * (`DictionaryTrash::trash()`); `trash_meta` იმახსოვრებს გადატანილ
     * ჩანაწერებს, რომ აღდგენამ მათი დაბრუნება შემოგთავაზოს.
     */
    use BelongsToUser, HasTrash;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /**
     * ახალ ანგარიშზე ავტომატურად შექმნილი ჟანრები (იგივე სია მიგრაციაშიც).
     * Tasks §24.3 — ხატულა (`ModuleIcon`-ის რუკიდან) და ფერი (`c1…c12`, `DictionaryColor`);
     * აქამდე ყველა ერთი `LayoutGrid`-ით ჩანდა.
     */
    public const DEFAULTS = [
        ['key' => 'action', 'name_ka' => 'მოქმედება', 'name_en' => 'Action', 'icon' => 'Zap', 'color' => 'c2'],
        ['key' => 'adventure', 'name_ka' => 'სათავგადასავლო', 'name_en' => 'Adventure', 'icon' => 'Compass', 'color' => 'c5'],
        ['key' => 'rpg', 'name_ka' => 'როლური (RPG)', 'name_en' => 'RPG', 'icon' => 'Swords', 'color' => 'c8'],
        ['key' => 'shooter', 'name_ka' => 'სროლა', 'name_en' => 'Shooter', 'icon' => 'Crosshair', 'color' => 'c1'],
        ['key' => 'strategy', 'name_ka' => 'სტრატეგია', 'name_en' => 'Strategy', 'icon' => 'Castle', 'color' => 'c7'],
        ['key' => 'simulation', 'name_ka' => 'სიმულატორი', 'name_en' => 'Simulation', 'icon' => 'Plane', 'color' => 'c6'],
        ['key' => 'puzzle', 'name_ka' => 'თავსატეხი', 'name_en' => 'Puzzle', 'icon' => 'Puzzle', 'color' => 'c3'],
        ['key' => 'platformer', 'name_ka' => 'პლატფორმერი', 'name_en' => 'Platformer', 'icon' => 'Footprints', 'color' => 'c4'],
        ['key' => 'racing', 'name_ka' => 'რბოლა', 'name_en' => 'Racing', 'icon' => 'Car', 'color' => 'c10'],
        ['key' => 'sports', 'name_ka' => 'სპორტი', 'name_en' => 'Sports', 'icon' => 'Trophy', 'color' => 'c11'],
        ['key' => 'fighting', 'name_ka' => 'ბრძოლა', 'name_en' => 'Fighting', 'icon' => 'Sword', 'color' => 'c9'],
        ['key' => 'horror', 'name_ka' => 'საშინელება', 'name_en' => 'Horror', 'icon' => 'Ghost', 'color' => 'c12'],
        ['key' => 'indie', 'name_ka' => 'ინდი', 'name_en' => 'Indie', 'icon' => 'Sparkles', 'color' => 'c6'],
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'trash_meta' => 'array',
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
        // ⚠️ ურნაში მყოფიც (Tasks §29) — სხვაგვარად ნაგულისხმევები იმავე გასაღებით ჩაიწერებოდა და ინდექსი დაიძვრებოდა
        if (static::withoutGlobalScopes(['owner', 'trash'])->where('user_id', $userId)->exists()) {
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
