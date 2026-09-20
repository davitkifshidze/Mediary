<?php

namespace App\Models\Concerns;

use App\Support\PublicDomain;

/**
 * **„როდის დავასრულე" — enum-სტატუსიანი მოდულების ერთადერთი მწერალი (FEAT-21).**
 *
 * ლექსიკონიან ექვს დომენს ეს უკვე აქვს: `HasStatus::applyStatus()` `done`
 * როლზე `statusDoneColumn()`-ს ავსებს და უკან დაბრუნებაზე წმენდს. enum-იან
 * სამს (`book` · `game` · `board_game`) ასეთი საერთო წერტილი **არ ჰქონდა** —
 * სტატუსს სამივე კონტროლერი სამ ადგილას წერს (`store`, `update` და
 * `PATCH .../status`), ე.ი. თარიღის ხელით ჩაწერა იმავე დღეს დაშორდებოდა
 * ერთმანეთს. ამიტომ წერტილი **მოდელის `saving` მოვლენაა**: სტატუსი
 * საიდანაც არ უნდა მოვიდეს (ფორმა, იმპორტი, ლექსიკონის გადატანა), თარიღი
 * მასთან შეთანხმებული რჩება.
 *
 * ⚠️ **„გაკეთებულის" განსაზღვრება აქ არ იწერება** — `PublicDomain::MATCH`-ს
 * ეკითხება (`book` → `read`, `game` → `finished`, `board_game` → `owned`).
 * მეორე სია ზუსტად ის იქნებოდა, რაც ერთ დღეს მატჩინგს და სტატისტიკას
 * სხვადასხვა პასუხს გააცემინებდა.
 *
 * ⚠️ **უკვე ჩაწერილი თარიღი არ გადაიწერება** (`?:`-ის ნაცვლად `??`):
 * „წავიკითხე" სტატუსზე დარჩენილი წიგნის ყოველი შენახვა თარიღს დღევანდელზე
 * გადაწევდა და „წელს რამდენი წავიკითხე" ყოველ რედაქტირებაზე შეიცვლებოდა.
 *
 * ⚠️ **უკან დაბრუნება თარიღს შლის.** უამისოდ სტატისტიკა დაუსრულებელ
 * ჩანაწერს სამუდამოდ ჩათვლიდა — `Course::syncProgress()`-ის იგივე წესი.
 *
 * ⚠️ **`saveQuietly()` მოვლენებს არ ისვრის, და ეს სასურველია**: კალათაში
 * გადატანა (`HasTrash`) სწორედ ჩუმად ინახავს, ე.ი. წაშლა-აღდგენა
 * დასრულების თარიღს არ ეხება.
 */
trait TracksCompletion
{
    protected static function bootTracksCompletion(): void
    {
        static::saving(fn ($model) => $model->syncCompletedAt());
    }

    /**
     * რომელი სვეტი ინახავს ფაქტს.
     *
     * ⚠️ ბორდგეიმზე ეს `acquired_at`-ია და არა `finished_at`: მისი
     * „გაკეთებული" `owned`-ია, ე.ი. თარიღი შეძენას ნიშნავს. სვეტს იმას
     * უნდა ერქვას, რასაც ინახავს.
     */
    abstract public function completionColumn(): string;

    /** დომენის გასაღები `PublicDomain::MATCH`-ში */
    abstract public function completionDomain(): string;

    public function syncCompletedAt(): void
    {
        $column = $this->completionColumn();
        $done = PublicDomain::doneStatus($this->completionDomain());

        $this->{$column} = $done !== null && $this->status === $done
            ? ($this->{$column} ?? now()->toDateString())
            : null;
    }
}
