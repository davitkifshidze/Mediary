<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasDictionaryKey;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ჩანაწერის კატეგორია — „რას ეხება".
 *
 * **per-user მართვადი ლექსიკონი**, ზუსტად ისე, როგორც `book_genres` /
 * `board_game_genres`. გლობალურ `genres`-ს აქაც განზრახ არ ვიყენებთ: ის
 * TMDB-ის ფილმის ჟანრებია და „დოკუმენტები" იქ ფილმის არჩევანშიც გამოჩნდებოდა.
 */
class NoteCategory extends Model
{
    /**
     * ⚠️ **ურნა** — წაშლა რიგს ურნაში აგზავნის
     * (`DictionaryTrash::trash()`); `trash_meta` იმახსოვრებს გადატანილ
     * ჩანაწერებს, რომ აღდგენამ მათი დაბრუნება შემოგთავაზოს.
     */
    use BelongsToUser, HasTrash;

    /** უნიკალური `key` ერთ ალგორითმზეა (`DictionaryKey`) */
    use HasDictionaryKey;

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
        'trash_meta' => 'array',
        'sort_order' => 'integer',
    ];

    /** უსახელო გასაღების ნაცვალი — იხ. `HasDictionaryKey` */
    protected static function keyFallback(): string
    {
        return 'category';
    }

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
        // ⚠️ ურნაში მყოფიც — სხვაგვარად ნაგულისხმევები იმავე გასაღებით ჩაიწერებოდა და ინდექსი დაიძვრებოდა
        if (static::withoutGlobalScopes(['owner', 'trash'])->where('user_id', $userId)->exists()) {
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
