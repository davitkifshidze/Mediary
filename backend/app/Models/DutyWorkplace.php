<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **სამსახური მორიგეობის მოდულში (Tasks §34)** — „კლინიკა A“, „საავადმყოფო B“.
 *
 * ⚠️ **ლექსიკონი არ არის და `/dictionaries`-ში არ ჯდება** (გალერეის ალბომის
 * მიზეზი): სახელს შენ არქმევ და ის ერთენოვანია; თან სამსახურს თავისი ფერი,
 * მოკლე ასო, საათობრივი განაკვეთი და ტარიფების ცხრილი აქვს — ეს ყველაფერი
 * მორიგეობის გვერდის „სამსახურებში“ იმართება.
 *
 * ⚠️ **ურნაში კი კლასიფიკატორივით მიდის** (`DictionaryTrash`, სახე
 * `duty_workplace`): წაშლისას მორიგეობები სხვა სამსახურზე გადადის, უსამსახუროდ
 * რჩება ან თვითონაც ურნაში მიდის; რიგი იმახსოვრებს გადატანილებს, რომ აღდგენამ
 * მათი დაბრუნება შემოგთავაზოს.
 */
class DutyWorkplace extends Model
{
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'hourly_rate' => 'decimal:2',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
        'trash_meta' => 'array',
    ];

    public function rates(): HasMany
    {
        return $this->hasMany(DutyRate::class, 'workplace_id');
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(DutyShift::class, 'workplace_id');
    }

    /**
     * **ერთი სამსახური ავტომატურად** (§34.2) — მოდული მის გარეშე ცარიელი
     * კალენდარია. ზარმაცად, პირველ წაკითხვაზე (ლექსიკონების `ensureDefaults()`-ის
     * წესი): მოგვიანებით ჩართული მოდულიც იმავე გზას გადის.
     *
     * ⚠️ ურნაში მყოფიც ითვლება — თორემ „ყველა წავშალე“ ახალ სამსახურს ჩუმად
     * დაბადებდა. ⚠️ სახელი ინტერფეისის ენაზეა (`$locale`); მერე შენ არქმევ.
     */
    public static function ensureDefault(int $userId, string $locale = 'ka'): void
    {
        if (static::withoutGlobalScopes(['owner', 'trash'])->where('user_id', $userId)->exists()) {
            return;
        }

        static::withoutGlobalScope('owner')->create([
            'user_id' => $userId,
            'name' => $locale === 'en' ? 'Work' : 'სამსახური',
            'short' => $locale === 'en' ? 'W' : 'ს',
            'color' => '#2563eb',
            'sort_order' => 1,
        ]);
    }
}
