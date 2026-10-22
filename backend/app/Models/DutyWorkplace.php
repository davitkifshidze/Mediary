<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Support\AppTime;
use App\Support\DutyPeriod;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **სამსახური მორიგეობის მოდულში** — „კლინიკა A“, „საავადმყოფო B“.
 *
 * ⚠️ **ლექსიკონი არ არის და `/dictionaries`-ში არ ჯდება** (გალერეის ალბომის
 * მიზეზი): სახელს შენ არქმევ და ის ერთენოვანია; თან სამსახურს თავისი ფერი,
 * მოკლე ასო, საათობრივი განაკვეთი და ტარიფების ცხრილი აქვს — ეს ყველაფერი
 * მორიგეობის გვერდის „სამსახურებში“ იმართება.
 *
 * ⚠️ **ანაზღაურება ან მორიგეობაზეა, ან საათზე** (SPA-ს გადამრთველი): პირველზე
 * ტარიფები (`rates`), მეორეზე მხოლოდ საათობრივი (`hourly_rate`). სქემა ორივეს
 * იტევს და `DutyPay`-ში ტიპის ტარიფი იმარჯვებს — ამიტომ ფორმა ერთს მეორის
 * ჩართვისას ასუფთავებს, რომ საათობრივი უჩუმრად არ „დაიკარგოს".
 * ⚠️ **ანაზღაურების პერიოდი სამსახურისაა** (`period` — წესების ისტორია
 * `[{since, day}]`, `DutyPeriod`): 112 1-დან, კლინიკა 5-დან მომდევნო თვის
 * 4-მდე. ცარიელი — კალენდარული თვე. დღის შეცვლა (`setPeriodDay()`) ამ
 * სამსახურის მორიგეობებიან პერიოდზე მომდევნოდან მოქმედებს.
 * ⚠️ **ნაგულისხმევი ტიპი და დაწყების დრო** (`default_type_id`,
 * `default_start_time`) — სამსახურის არჩევისას ფორმა მათ თვითონ ავსებს
 * („112 · 24 სთ · 09:00“).
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
        'default_type_id' => 'integer',
        'period' => 'array',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
        'trash_meta' => 'array',
    ];

    /** @return list<array{since: ?string, day: int}> */
    public function periodRules(): array
    {
        return DutyPeriod::serialize(is_array($this->period) ? $this->period : []);
    }

    /** დღეს მოქმედი „პერიოდის პირველი დღე“ */
    public function periodDay(): int
    {
        return DutyPeriod::dayAt(AppTime::now(), $this->periodRules());
    }

    /** @return array{since: string, day: int}|null მომავალი ცვლილება — „5-დან, 1 ნოემბრიდან“ */
    public function periodPending(): ?array
    {
        $today = AppTime::now()->toDateString();

        return collect($this->periodRules())->first(fn (array $rule) => $rule['since'] !== null && $rule['since'] > $today);
    }

    /** ახალი პირველი დღე — ამ სამსახურის მორიგეობებიან პერიოდზე მომდევნოდან (`DutyPeriod::withDay()`) */
    public function setPeriodDay(int $day): void
    {
        $this->period = DutyPeriod::withDay(
            $this->periodRules(),
            $day,
            AppTime::now(),
            fn (string $before) => DutyShift::withoutGlobalScope('owner')
                ->where('user_id', $this->user_id)
                ->where('workplace_id', $this->id)
                ->where('date', '<', $before)
                ->exists(),
        );
        $this->save();
    }

    public function rates(): HasMany
    {
        return $this->hasMany(DutyRate::class, 'workplace_id');
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(DutyShift::class, 'workplace_id');
    }

    /**
     * **ერთი სამსახური ავტომატურად** — მოდული მის გარეშე ცარიელი
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
            // პალიტრის პირველი ფერი (`DUTY_COLORS`, SPA) — თემის ცვლადად იხატება
            'color' => '#2a78d6',
            'sort_order' => 1,
        ]);
    }
}
