<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\AppTime;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * შეხსენება ჩანაწერზე (Tasks §13.2 → §5.5 → **ეტაპი 7**).
 *
 * ექვსი რეჟიმი: **ერთჯერადი** კონკრეტულ დროზე და ხუთი პერიოდული —
 * ინტერვალი (ყოველ N წუთში), ყოველდღიური, ყოველკვირეული (**რამდენიმე დღე
 * ერთდროულად**), ყოველთვიური (**რამდენიმე რიცხვი**) და ყოველწლიური
 * (თვე + რიცხვები). ყველა პერიოდულს შეიძლება **დღეში რამდენიმე დრო**
 * ჰქონდეს, და ყველას — **მოქმედების ფანჯარა** (`starts_at`/`ends_at`).
 * ⚠️ §13.2-ის მოთხოვნით პერიოდი **ველია და არა ჩაშენებული კონსტანტა**:
 * `interval_minutes` ნებისმიერი რიცხვია და არა 10/15/20-ის სია.
 *
 * ⚠️ **დროის ერთადერთი წყარო `next_at`-ია** (UTC). დისპეტჩერი მხოლოდ მას
 * ეკითხება, `computeNextAt()` კი ერთადერთი ადგილია, სადაც ის ითვლება —
 * ორი განსხვავებული ფორმულა ერთსა და იმავე შეხსენებას ორჯერ გაუშვებდა.
 *
 * ⚠️ **სასაათე სარტყელი ჩანაწერზეა.** აპლიკაცია UTC-ზე მუშაობს
 * (`config/app.php`), user კი არა — „ყოველ დღე 09:00" სარტყლის გარეშე
 * თბილისში 13:00-ზე გაისროდა. `once` აბსოლუტურ მომენტს ინახავს და
 * სარტყელი მას არ სჭირდება; დანარჩენები კი კედლის საათს ინახავენ,
 * ე.ი. `timezone`-ის გარეშე აზრი არ აქვთ.
 *
 * ⚠️ **ფანჯარა კი აბსოლუტურია** (`starts_at`/`ends_at`, UTC) — `next_at`-საც
 * UTC აქვს, ე.ი. შედარება პირდაპირია და კედლის საათის მეორე მათემატიკა
 * არსად ჩნდება. ფანჯარა **ყველა რეჟიმს ეხება**, `once`-საც: „ამ
 * დიაპაზონში" საზღვარია და არა კიდევ ერთი რეჟიმი.
 *
 * ⚠️ **31 რიცხვი თებერვალში ბოლო დღეზე ჩამოდის** (`atDay()`), და არა
 * მარტის 3-ზე გადადის. „ყოველთვიურად 31-ში" ნიშნავს თვის ბოლოს — Carbon-ის
 * ნაგულისხმევი გადავსება (`Feb 31 → Mar 3`) აქ ჩუმად არასწორ თვეს აირჩევდა.
 *
 * ⚠️ **ჯერადობა (`repeat_count`) მხოლოდ `exhaustedAfter()`-შია**
 * გათვალისწინებული — ე.ი. „ბოლო გასროლა" ერთ ადგილას წყდება. `null` =
 * უსასრულოდ.
 *
 * ⚠️ **ყველა სია ერთი წესით ნორმალიზდება** (`clocks()`, `selectedWeekdays()`,
 * `selectedDays()`): დუბლიკატის, დიაპაზონს გარეთ მნიშვნელობისა და რიგის
 * საკითხი მოდელში წყდება — ვალიდაცია მხოლოდ შესვლისას ამოწმებს, ბაზაში კი
 * ძველი (ან ხელით ჩაწერილი) რიგიც შეიძლება იდოს.
 */
class NoteReminder extends Model
{
    use BelongsToUser;

    public const MODE_ONCE = 'once';

    public const MODE_INTERVAL = 'interval';

    public const MODE_DAILY = 'daily';

    public const MODE_WEEKLY = 'weekly';

    public const MODE_MONTHLY = 'monthly';

    public const MODE_YEARLY = 'yearly';

    public const MODES = [
        self::MODE_ONCE,
        self::MODE_INTERVAL,
        self::MODE_DAILY,
        self::MODE_WEEKLY,
        self::MODE_MONTHLY,
        self::MODE_YEARLY,
    ];

    /** რეჟიმები, რომლებსაც კედლის საათი (და ე.ი. სარტყელი) სჭირდებათ */
    public const CLOCK_MODES = [
        self::MODE_DAILY,
        self::MODE_WEEKLY,
        self::MODE_MONTHLY,
        self::MODE_YEARLY,
    ];

    /** რეჟიმები, რომლებსაც თვის რიცხვი სჭირდებათ */
    public const DAY_OF_MONTH_MODES = [
        self::MODE_MONTHLY,
        self::MODE_YEARLY,
    ];

    /**
     * მიწოდების არხები.
     *
     * ⚠️ **`email` ამოღებულია (Tasks §8.2, 2026-09-11, შენი მითითებით:
     * „არ გვინდა").** მიზეზი ცხადია: SMTP ამ პროექტს არ აქვს
     * (`MAIL_MAILER=log`), ე.ი. არხი „მუშაობდა" მხოლოდ იმით, რომ წერილს
     * ლოგში აგდებდა — მომხმარებელი კი ფიქრობდა, რომ შეხსენება გაიგზავნა.
     * მისი ადგილი **ჟურნალმა** დაიკავა: ყოველი გასროლა `note_notifications`-ში
     * იწერება და აპლიკაციაშივე იკითხება (`GET /api/note-notifications`).
     */
    public const CHANNELS = ['browser', 'telegram'];

    /** უსასრულო ციკლისგან დაცვა: 1 წუთზე ხშირად შეხსენება არ იგზავნება */
    public const MIN_INTERVAL_MINUTES = 1;

    /** დღეში რამდენ დროზე შეიძლება გაისროლოს (ეტაპი 7) */
    public const MAX_TIMES_PER_DAY = 24;

    protected $guarded = ['id'];

    /**
     * **მომხმარებლისგან მოსული აბსოლუტური მომენტები (Tasks §8).**
     *
     * ⚠️ **ეს სამი ველი ერთადერთია, სადაც Carbon **ჩვენს ზონაში არ** მოდის:**
     * SPA მათ ISO-8601-ად აგზავნის ცხადი წანაცვლებით
     * (`2026-10-01T00:00:00+00:00`). Eloquent კი ჩაწერისას ზონას **არ**
     * გარდაქმნის — ის სტრიქონს მნიშვნელობის *საკუთარი* ზონის კედლის
     * საათით ბეჭდავს, წაკითხვისას კი აპლიკაციის ზონით კითხულობს. ე.ი.
     * `Asia/Tbilisi`-ზე ეს წყვილი ოთხსაათიან შეცდომას აბრუნებდა თითოეულ
     * round-trip-ზე — ფანჯარა 20:00-ზე იხსნებოდა 00:00-ის ნაცვლად.
     *
     * ⚠️ დანარჩენი დროშტამპები (`next_at`, `last_sent_at`, `created_at`…)
     * `now()`-იდან ან `AppTime::at()`-იდან მოდიან, ე.ი. უკვე შენახვის
     * ზონაშია და მუტატორი არ სჭირდებათ.
     *
     * ⚠️ `times_of_day` **კედლის საათია** და აქ არ არის — მას თავისი
     * `timezone` სვეტი აქვს და კონვერტაცია მისთვის ორმაგი წანაცვლება იქნებოდა.
     */
    protected function remindAt(): Attribute
    {
        return self::momentAttribute();
    }

    protected function startsAt(): Attribute
    {
        return self::momentAttribute();
    }

    protected function endsAt(): Attribute
    {
        return self::momentAttribute();
    }

    private static function momentAttribute(): Attribute
    {
        return Attribute::make(
            set: fn ($value) => $value === null || $value === ''
                ? null
                : AppTime::at(Carbon::parse($value)),
        );
    }

    protected $casts = [
        'remind_at' => 'datetime',
        // ⚠️ ფანჯარა აბსოლუტური მომენტია — `next_at`-ის მსგავსად; შედარება პირდაპირია
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'next_at' => 'datetime',
        'last_sent_at' => 'datetime',
        'interval_minutes' => 'integer',
        'weekdays' => 'array',
        // ⚠️ ეტაპი 7 — ორივე **სიაა**: დღეში რამდენიმე დრო, თვეში რამდენიმე რიცხვი
        'times_of_day' => 'array',
        'days_of_month' => 'array',
        'month' => 'integer',
        'repeat_count' => 'integer',
        'sent_count' => 'integer',
        'is_active' => 'boolean',
        'channels' => 'array',
    ];

    public function noteEntry(): BelongsTo
    {
        return $this->belongsTo(NoteEntry::class);
    }

    /* ---------- დროის გამოთვლა ---------- */

    /**
     * მომდევნო გასროლის მომენტი UTC-ში, ან `null` — თუ აღარ ისროლებს.
     *
     * `$from` = საიდან ვითვლით (შენახვისას „ახლა", გასროლის შემდეგ — გასროლის დრო).
     *
     * ⚠️ **ფანჯარა აქვეა და არა დისპეტჩერში.** გამოთვლა ერთადერთი ადგილია,
     * სადაც „როდის გაისვრის" წყდება; ფილტრი გამგზავნში რომ დაწერილიყო,
     * `next_at` ისეთ მომენტს აჩვენებდა, რომელზეც სინამდვილეში არაფერი მოხდება.
     */
    public function computeNextAt(?CarbonInterface $from = null): ?Carbon
    {
        /* ⚠️ **შენახვის ზონა აპლიკაციისაა და არა ჩაბეტონებული UTC** (Tasks §8):
           Eloquent ჩაწერისას ზონას არ გარდაქმნის, წაკითხვისას კი აპლიკაციის
           ზონით კითხულობს — ე.ი. `->utc()` `Asia/Tbilisi`-ზე 4-საათიან
           წანაცვლებას დაბადებდა. შედარებას ეს არ ცვლის (ინსტანტი იგივეა). */
        $from = AppTime::at($from ?: now())->copy();

        $opensAt = AppTime::at($this->starts_at);
        // ფანჯრის გახსნამდე ათვლა არ დაწყებულა — ე.ი. ვითვლით გახსნის მომენტიდან
        $opening = $opensAt && $from->lessThan($opensAt);

        if ($opening) {
            $from = $opensAt->copy();
        }

        $next = match ($this->mode) {
            // ერთჯერადი — თვითონ არჩეული აბსოლუტური მომენტი
            self::MODE_ONCE => AppTime::at($this->remind_at),
            // ⚠️ ფანჯრის გახსნა **თვითონაა** პირველი გასროლა: „09:00-დან 18:00-მდე
            // ყოველ 15 წუთში" 09:15-ზე კი არ უნდა დაიწყოს, 09:00-ზე.
            self::MODE_INTERVAL => $this->nextInterval($from, $opening),
            self::MODE_DAILY => $this->earliest($this->clockCandidates($from, null)),
            self::MODE_WEEKLY => $this->nextWeekly($from),
            self::MODE_MONTHLY => $this->nextByDate($from, null),
            self::MODE_YEARLY => $this->nextByDate($from, $this->month),
            default => null,
        };

        return $next && $this->withinWindow($next) ? $next : null;
    }

    /**
     * გასროლის შემდგომი მდგომარეობა — **სვეტები და არა შენახვა**.
     *
     * ⚠️ განზრახ არაფერს ინახავს: დისპეტჩერი ამ მასივს პირობით UPDATE-ში
     * წერს (`where next_at = ძველი`), რომ ორმა პარალელურმა გამომძახებელმა
     * ერთი და იგივე შეხსენება ორჯერ ვერ დაიჭიროს.
     *
     * ⚠️ **„აღარ ისვრის" = „აღარაა აქტიური"** — ერთი წესი სამივე მიზეზზე:
     * ერთჯერადი, ამოწურული ჯერადობა და **დამთავრებული ფანჯარა**. სამივე
     * ცალკე რომ შემოწმებულიყო, ერთი მათგანი დაავიწყდებოდა და სიაში
     * სამუდამოდ „აქტიური" შეხსენება იდგებოდა, რომელიც არასდროს გაისვრის.
     *
     * @return array{next_at: Carbon|null, is_active: bool, last_sent_at: Carbon, sent_count: int}
     */
    public function nextStateAfterSending(CarbonInterface $sentAt): array
    {
        $sentCount = (int) $this->sent_count + 1;
        $next = $this->exhaustedAfter($sentCount) ? null : $this->computeNextAt($sentAt);

        return [
            'next_at' => $next,
            'is_active' => $next !== null,
            'last_sent_at' => AppTime::at($sentAt),
            'sent_count' => $sentCount,
        ];
    }

    /**
     * ეს იყო ბოლო გასროლა?
     *
     * ⚠️ **ჯერადობა ერთ ადგილას წყდება** (§5.5) — `once` ყოველთვის ერთჯერადია,
     * `repeat_count` კი ნებისმიერ პერიოდულს აჩერებს. `null` და `0` = უსასრულოდ,
     * ე.ი. ძველი (ჯერადობამდელი) შეხსენებების ქცევა უცვლელია.
     */
    private function exhaustedAfter(int $sentCount): bool
    {
        return $this->mode === self::MODE_ONCE
            || ($this->repeat_count > 0 && $sentCount >= $this->repeat_count);
    }

    /** მომენტი ფანჯარაშია? (ორივე ბოლო არასავალდებულოა) */
    private function withinWindow(Carbon $moment): bool
    {
        if ($this->starts_at && $moment->lessThan($this->starts_at)) {
            return false;
        }

        return ! ($this->ends_at && $moment->greaterThan($this->ends_at));
    }

    /** ინტერვალი: ფანჯრის გახსნაზე — ზუსტად გახსნის მომენტი, სხვაგვარად +N წუთი */
    private function nextInterval(Carbon $from, bool $opening): ?Carbon
    {
        if ($this->interval_minutes < self::MIN_INTERVAL_MINUTES) {
            return null;
        }

        return $opening ? $from->copy() : $from->copy()->addMinutes($this->interval_minutes);
    }

    /**
     * ყოველკვირეული — **რამდენიმე დღე × რამდენიმე დრო**.
     *
     * ⚠️ ყოველ არჩეულ წყვილზე ვითვლით კანდიდატს და **უახლოესს** ვირჩევთ.
     * ერთი დღე + ერთი დრო ძველი ქცევის იდენტურია.
     */
    private function nextWeekly(Carbon $from): ?Carbon
    {
        $candidates = [];

        foreach ($this->selectedWeekdays() as $day) {
            $candidates = array_merge($candidates, $this->clockCandidates($from, $day));
        }

        return $this->earliest($candidates);
    }

    /**
     * კედლის საათების მომდევნო დადგომა user-ის სარტყელში → UTC.
     * `$weekday` null = ყოველდღიური; 0 = კვირა (Carbon-ის `dayOfWeek`).
     *
     * @return Carbon[]
     */
    private function clockCandidates(Carbon $from, ?int $weekday): array
    {
        $candidates = [];

        foreach ($this->clocks() as [$hour, $minute]) {
            $local = $from->copy()->setTimezone($this->zone())->setTime($hour, $minute, 0);

            if ($weekday !== null) {
                // მიმდინარე კვირის სასურველ დღეზე გადავდივართ, მერე საჭიროებისამებრ +1 კვირა
                $local->addDays((($weekday - $local->dayOfWeek) + 7) % 7);
            }

            // „ზუსტად ახლა" უკვე გავიდა — შემდეგ ჯერზე
            if ($local->lessThanOrEqualTo($from)) {
                $local->add($weekday === null ? '1 day' : '1 week');
            }

            $candidates[] = AppTime::at($local);
        }

        return $candidates;
    }

    /**
     * ყოველთვიური (`$month = null`) და ყოველწლიური (`$month` = 1–12),
     * **რამდენიმე რიცხვზე და რამდენიმე დროზე ერთდროულად**.
     *
     * ორი იტერაცია ერთ წყვილზე საკმარისია: თუ მიმდინარე პერიოდის მომენტი
     * უკვე გავიდა, მომდევნო პერიოდისა აუცილებლად მომავალშია.
     */
    private function nextByDate(Carbon $from, ?int $month): ?Carbon
    {
        if ($month !== null && ($month < 1 || $month > 12)) {
            return null;
        }

        $local = $from->copy()->setTimezone($this->zone());
        $candidates = [];

        foreach ($this->selectedDays() as $day) {
            foreach ($this->clocks() as [$hour, $minute]) {
                $year = $local->year;
                $periodMonth = $month ?? $local->month;

                for ($i = 0; $i < 2; $i++) {
                    $candidate = $this->atDay($year, $periodMonth, $day, $hour, $minute);

                    if ($candidate->greaterThan($from)) {
                        $candidates[] = AppTime::at($candidate);

                        break;
                    }

                    if ($month === null) {
                        $periodMonth++;

                        if ($periodMonth > 12) {
                            $periodMonth = 1;
                            $year++;
                        }
                    } else {
                        $year++;
                    }
                }
            }
        }

        return $this->earliest($candidates);
    }

    /**
     * არჩეული რიცხვი მოცემულ თვეში, user-ის სარტყელში.
     *
     * ⚠️ **დღე თვის სიგრძეზე ჩამოდის**: „ყოველთვიურად 31-ში" თებერვალში
     * 28/29-ს ნიშნავს. Carbon-ის ნაგულისხმევი გადავსება (`Feb 31 → Mar 3`)
     * აქ ჩუმად სულ სხვა თვეს აირჩევდა.
     */
    private function atDay(int $year, int $month, int $day, int $hour, int $minute): Carbon
    {
        $date = Carbon::create($year, $month, 1, 0, 0, 0, $this->zone());

        return $date
            ->setDay(min($day, $date->daysInMonth))
            ->setTime($hour, $minute, 0);
    }

    /** უახლოესი კანდიდატი — ერთი პასუხი ოთხივე პერიოდულ რეჟიმზე */
    private function earliest(array $candidates): ?Carbon
    {
        if (! $candidates) {
            return null;
        }

        usort($candidates, fn (Carbon $a, Carbon $b) => $a->getTimestamp() <=> $b->getTimestamp());

        return $candidates[0];
    }

    /**
     * ნორმალიზებული კედლის საათები — `[[საათი, წუთი], …]`, დალაგებული.
     *
     * ⚠️ ერთადერთი პარსერი ყველა რეჟიმისთვის. გასაღებით დედუპლიკაცია
     * იმიტომაა, რომ „9:00" და „09:00" ერთი და იგივე დროა და ორ გასროლას
     * არ უნდა ნიშნავდეს.
     */
    private function clocks(): array
    {
        $clocks = [];

        foreach ((array) ($this->times_of_day ?? []) as $raw) {
            [$hour, $minute] = array_pad(explode(':', (string) $raw), 2, '0');
            $hour = (int) $hour;
            $minute = (int) $minute;

            if ($hour < 0 || $hour > 23 || $minute < 0 || $minute > 59) {
                continue;
            }

            $clocks[sprintf('%02d:%02d', $hour, $minute)] = [$hour, $minute];
        }

        ksort($clocks);

        return array_values($clocks);
    }

    /** ნორმალიზებული 0–6 სია, დუბლიკატებისა და ნაგვის გარეშე */
    private function selectedWeekdays(): array
    {
        $days = array_map('intval', (array) ($this->weekdays ?? []));
        // ⚠️ `array_filter` callback-ით — უკალბაქოდ 0 (კვირა) ჩუმად ამოვარდებოდა
        $days = array_values(array_unique(array_filter($days, fn (int $d) => $d >= 0 && $d <= 6)));
        sort($days);

        return $days;
    }

    /** ნორმალიზებული 1–31 სია (თვის რიცხვები) */
    private function selectedDays(): array
    {
        $days = array_map('intval', (array) ($this->days_of_month ?? []));
        $days = array_values(array_unique(array_filter($days, fn (int $d) => $d >= 1 && $d <= 31)));
        sort($days);

        return $days;
    }

    /** დაზიანებული/უცნობი სარტყელი მთელ დისპეტჩერს არ უნდა აგდებდეს */
    private function zone(): string
    {
        $tz = (string) ($this->timezone ?: 'UTC');

        return in_array($tz, timezone_identifiers_list(), true) ? $tz : 'UTC';
    }
}
