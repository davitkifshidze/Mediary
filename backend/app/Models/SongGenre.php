<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * მუსიკის ჟანრი — **per-user მართვადი ლექსიკონი** (`video_types`-ის ანალოგი).
 *
 * ⚠️ გლობალურ `genres`-ს განზრახ არ ვიყენებთ: ის TMDB-ის ფილმის ჟანრებია და
 * „როკი" იქ ფილმის ჟანრების არჩევანშიც გამოჩნდებოდა.
 *
 * ⚠️ კავშირი **მრავალი-მრავალთანაა** (`song_genre_song`) და არა `genre_id` —
 * `DECISIONS.md` §5-ის პასუხი 2026-09-06-ს.
 */
class SongGenre extends Model
{
    use BelongsToUser;

    /** §B3 — უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

    /** ახალ ანგარიშზე ავტომატურად შექმნილი ჟანრები (იგივე სია მიგრაციაშიც) */
    public const DEFAULTS = [
        ['key' => 'pop', 'name_ka' => 'პოპი', 'name_en' => 'Pop'],
        ['key' => 'rock', 'name_ka' => 'როკი', 'name_en' => 'Rock'],
        ['key' => 'hip-hop', 'name_ka' => 'ჰიპ-ჰოპი', 'name_en' => 'Hip-Hop'],
        ['key' => 'electronic', 'name_ka' => 'ელექტრონული', 'name_en' => 'Electronic'],
        ['key' => 'jazz', 'name_ka' => 'ჯაზი', 'name_en' => 'Jazz'],
        ['key' => 'classical', 'name_ka' => 'კლასიკური', 'name_en' => 'Classical'],
        ['key' => 'folk', 'name_ka' => 'ხალხური', 'name_en' => 'Folk'],
        ['key' => 'soundtrack', 'name_ka' => 'საუნდტრეკი', 'name_en' => 'Soundtrack'],
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

    public function songs(): BelongsToMany
    {
        return $this->belongsToMany(Song::class, 'song_genre_song', 'song_genre_id', 'song_id');
    }

    /**
     * ამ user-ს ჯერ ერთი ჟანრიც არ აქვს → დეფაულტები შეიქმნას.
     * ლენივი შევსება მიგრაციაზე უფრო საიმედოა: ახალი ანგარიშიც და
     * მოდულის მოგვიანებით ჩართვაც ერთსა და იმავე გზას გადის.
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
