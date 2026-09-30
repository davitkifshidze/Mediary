<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Support\DictionaryKey;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **პირადი მოდულის კლასიფიკატორი (Tasks §37)** — ჟანრი, ტიპი ან კატეგორია.
 *
 * ერთი ცხრილი ყველა პირად მოდულზე, მოდულის **გასაღებით** (`statuses`-ის
 * ფორმა: `module` სვეტი ჭრის). სამივე სახე ერთი და იგივე მექანიზმია —
 * განსხვავდება მხოლოდ ნაგულისხმევი სახელი, რომელსაც მფლობელი
 * `/modules/{key}`-ზე **ერთ ადგილას** უცვლის (Q30).
 *
 * ⚠️ **გასაღები მოდულის ფარგლებშია უნიკალური** (`unique(user_id, module, key)`),
 * ამიტომ `HasDictionaryKey` აქ არ გამოდგება — ის მხოლოდ ანგარიშზე ამოწმებს
 * და მეორე მოდულის იმავე სახელის რიგს „დაკავებულად" ჩათვლიდა.
 */
class CustomCategory extends Model
{
    /**
     * ⚠️ **ურნა (Tasks §29, ეტაპი 3)** — წაშლა რიგს ურნაში აგზავნის
     * (`DictionaryTrash::trash()`); `trash_meta` იმახსოვრებს გადატანილ
     * ჩანაწერებს, რომ აღდგენამ მათი დაბრუნება შემოგთავაზოს.
     */
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'trash_meta' => 'array',
        'sort_order' => 'integer',
    ];

    /** აუდიტის მოდული — რიგისაა და არა კლასის (`Status::auditModule()`-ის წესი) */
    public function auditModule(): string
    {
        return (string) $this->module;
    }

    public function records(): HasMany
    {
        return $this->hasMany(CustomRecord::class, 'category_id');
    }

    public function scopeForModule(Builder $query, string $key): Builder
    {
        return $query->where($query->getModel()->getTable().'.module', $key);
    }

    /**
     * სახელიდან უნიკალური გასაღები ამ მოდულის ფარგლებში.
     *
     * ⚠️ ურნაში მყოფი რიგიც დაკავებულია (Tasks §29) — ის თავის გასაღებს
     * უნიკალურ ინდექსში ინარჩუნებს.
     */
    public static function makeKey(int $userId, string $module, string $name): string
    {
        return DictionaryKey::make(
            $name,
            fn (string $key) => static::withoutGlobalScopes(['owner', 'trash'])
                ->where('user_id', $userId)
                ->where('module', $module)
                ->where('key', $key)
                ->exists(),
            'category',
        );
    }
}
