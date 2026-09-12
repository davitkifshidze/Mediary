<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * შეხსენება ჩანაწერზე (Tasks §13.2, გაფართოებული §5.5-ით).
 *
 * ექვსი რეჟიმი: **ერთჯერადი** კონკრეტულ დროზე და ხუთი პერიოდული —
 * ინტერვალი (ყოველ N წუთში), ყოველდღიური, ყოველკვირეული (**რამდენიმე დღე
 * ერთდროულად**), ყოველთვიური (თვის რიცხვი) და ყოველწლიური (თვე + რიცხვი).
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
 * ⚠️ **31 რიცხვი თებერვალში ბოლო დღეზე ჩამოდის** (`atDay()`), და არა
 * მარტის 3-ზე გადადის. „ყოველთვიურად 31-ში" ნიშნავს თვის ბოლოს — Carbon-ის
 * ნაგულისხმევი გადავსება (`Feb 31 → Mar 3`) აქ ჩუმად არასწორ თვეს აირჩევდა.
 *
 * ⚠️ **ჯერადობა (`repeat_count`) მხოლოდ `nextStateAfterSending()`-შია**
 * გათვალისწინებული — ე.ი. „ბოლო გასროლა" ერთ ადგილას წყდება. `null` =
 * უსასრულოდ.
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

    /** მიწოდების არხები (§13.3) — ბრაუზერი მთავარია და დამოკიდებულების გარეშე მუშაობს */
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

    protected $guarded = ['id'];

    protected $casts = [
        'remind_at' => 'datetime',
        'next_at' => 'datetime',
        'last_sent_at' => 'datetime',
        'interval_minutes' => 'integer',
        'weekdays' => 'array',
        'day_of_month' => 'integer',
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
     */
    public function computeNextAt(?CarbonInterface $from = null): ?Carbon
    {
        $from = ($from ? Carbon::instance($from) : now())->copy()->utc();

        return match ($this->mode) {
            // ერთჯერადი — თვითონ არჩეული აბსოლუტური მომენტი
            self::MODE_ONCE => $this->remind_at?->copy()->utc(),
            self::MODE_INTERVAL => $this->interval_minutes >= self::MIN_INTERVAL_MINUTES
                ? $from->copy()->addMinutes($this->interval_minutes)
                : null,
            self::MODE_DAILY => $this->nextClock($from, null),
            self::MODE_WEEKLY => $this->nextWeekly($from),
            self::MODE_MONTHLY => $this->nextByDate($from, null),
            self::MODE_YEARLY => $this->nextByDate($from, $this->month),
            default => null,
        };
    }

    /**
     * გასროლის შემდგომი მდგომარეობა — **სვეტები და არა შენახვა**.
     *
     * ⚠️ განზრახ არაფერს ინახავს: დისპეტჩერი ამ მასივს პირობით UPDATE-ში
     * წერს (`where next_at = ძველი`), რომ ორმა პარალელურმა გამომძახებელმა
     * ერთი და იგივე შეხსენება ორჯერ ვერ დაიჭიროს.
     *
     * ერთჯერადი აქვე ითიშება: მეორედ არასდროს უნდა გაისროლოს.
     *
     * @return array{next_at: Carbon|null, is_active: bool, last_sent_at: Carbon, sent_count: int}
     */
    public function nextStateAfterSending(CarbonInterface $sentAt): array
    {
        $sentCount = (int) $this->sent_count + 1;

        return [
            'next_at' => $this->exhaustedAfter($sentCount) ? null : $this->computeNextAt($sentAt),
            'is_active' => ! $this->exhaustedAfter($sentCount),
            'last_sent_at' => Carbon::instance($sentAt)->utc(),
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

    /**
     * კედლის საათის მომდევნო დადგომა user-ის სარტყელში → UTC.
     * `$weekday` null = ყოველდღიური; 0 = კვირა (Carbon-ის `dayOfWeek`).
     */
    private function nextClock(Carbon $from, ?int $weekday): ?Carbon
    {
        if (! $this->time_of_day) {
            return null;
        }

        [$hour, $minute] = $this->clock();

        $local = $from->copy()->setTimezone($this->zone())->setTime($hour, $minute, 0);

        if ($weekday !== null) {
            // მიმდინარე კვირის სასურველ დღეზე გადავდივართ, მერე საჭიროებისამებრ +1 კვირა
            $local->addDays((($weekday - $local->dayOfWeek) + 7) % 7);
        }

        // „ზუსტად ახლა" უკვე გავიდა — შემდეგ ჯერზე
        if ($local->lessThanOrEqualTo($from)) {
            $local->add($weekday === null ? '1 day' : '1 week');
        }

        return $local->copy()->utc();
    }

    /**
     * ყოველკვირეული — **რამდენიმე დღე ერთდროულად** (§5.5).
     *
     * ⚠️ ყოველ არჩეულ დღეზე ვითვლით კანდიდატს და **უახლოესს** ვირჩევთ.
     * ერთი არჩეული დღე ძველი ერთდღიანი ქცევის იდენტურია.
     */
    private function nextWeekly(Carbon $from): ?Carbon
    {
        $candidates = [];

        foreach ($this->selectedWeekdays() as $day) {
            if ($next = $this->nextClock($from, $day)) {
                $candidates[] = $next;
            }
        }

        if (! $candidates) {
            return null;
        }

        usort($candidates, fn (Carbon $a, Carbon $b) => $a->getTimestamp() <=> $b->getTimestamp());

        return $candidates[0];
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

    /**
     * ყოველთვიური (`$month = null`) და ყოველწლიური (`$month` = 1–12).
     *
     * ორი იტერაცია საკმარისია: თუ მიმდინარე პერიოდის მომენტი უკვე გავიდა,
     * მომდევნო პერიოდისა აუცილებლად მომავალშია.
     */
    private function nextByDate(Carbon $from, ?int $month): ?Carbon
    {
        if (! $this->time_of_day || ! $this->day_of_month) {
            return null;
        }

        if ($month !== null && ($month < 1 || $month > 12)) {
            return null;
        }

        $local = $from->copy()->setTimezone($this->zone());
        $year = $local->year;
        $periodMonth = $month ?? $local->month;

        for ($i = 0; $i < 2; $i++) {
            $candidate = $this->atDay($year, $periodMonth);

            if ($candidate->greaterThan($from)) {
                return $candidate->copy()->utc();
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

        return null;
    }

    /**
     * არჩეული რიცხვი მოცემულ თვეში, user-ის სარტყელში.
     *
     * ⚠️ **დღე თვის სიგრძეზე ჩამოდის**: „ყოველთვიურად 31-ში" თებერვალში
     * 28/29-ს ნიშნავს. Carbon-ის ნაგულისხმევი გადავსება (`Feb 31 → Mar 3`)
     * აქ ჩუმად სულ სხვა თვეს აირჩევდა.
     */
    private function atDay(int $year, int $month): Carbon
    {
        [$hour, $minute] = $this->clock();

        $date = Carbon::create($year, $month, 1, 0, 0, 0, $this->zone());

        return $date
            ->setDay(min((int) $this->day_of_month, $date->daysInMonth))
            ->setTime($hour, $minute, 0);
    }

    /** `HH:MM` → [საათი, წუთი] — ერთი პარსერი ყველა რეჟიმისთვის */
    private function clock(): array
    {
        [$hour, $minute] = array_pad(explode(':', (string) $this->time_of_day), 2, '0');

        return [(int) $hour, (int) $minute];
    }

    /** დაზიანებული/უცნობი სარტყელი მთელ დისპეტჩერს არ უნდა აგდებდეს */
    private function zone(): string
    {
        $tz = (string) ($this->timezone ?: 'UTC');

        return in_array($tz, timezone_identifiers_list(), true) ? $tz : 'UTC';
    }
}
