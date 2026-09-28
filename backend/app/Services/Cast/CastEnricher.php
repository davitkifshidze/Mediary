<?php

namespace App\Services\Cast;

use App\Models\CastMember;
use App\Services\Media\MediaDownloader;
use App\Services\Tmdb\TmdbClient;
use App\Support\AppTime;
use App\Support\Lang;
use App\Support\SourceLog;
use App\Support\StorageFolder;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * **მსახიობის მონაცემების შევსება TMDB-დან (Tasks §8.1 → §39).**
 *
 * ერთი გამოძახება (`/person/{id}?append_to_response=external_ids`) ავსებს
 * ბიოგრაფიას, დაბადების თარიღს, IMDb-ის id-სა და სოციალურ ბმულებს — ე.ი.
 * სწორედ იმას, რაც „მსახიობის შიდა გვერდს" გვერდად აქცევს.
 *
 * ⚠️ **ეს გლობალურ ლექსიკონში წერს** (`cast_members`), ე.ი. ერთხელ
 * შევსებული ყველა ანგარიშისთვისაა — ზუსტად ისე, როგორც სახელი და სქესი.
 * არაფერი per-user აქ არ იწერება.
 *
 * ⚠️ **ცარიელი ველი არსებულს არ შლის.** TMDB ზოგჯერ ნაწილობრივ პასუხობს
 * (განსაკუთრებით `ka`-ზე), და „ჰქონდა და აღარ აქვს" ყველაზე ცუდი შედეგია:
 * მომხმარებელი ვერ მიხვდება, წყარომ დაკარგა თუ ჩვენ წავშალეთ. მასობრივ
 * განახლებაზე (§39.4) ეს კიდევ უფრო მძიმეა — ერთი ანგარიშის გაშვება
 * ყველას ლექსიკონს ეხება.
 *
 * ## ველების არჩევა (§39.2)
 *
 * ⚠️ **არჩევანი ამ მეთოდის პარამეტრია და არა მეორე ასლი.** ცალკე ღილაკიც
 * (`POST /cast/{id}/resync`) და მასობრივი რიგიც (`POST /cast/sync/{id}`)
 * ერთსა და იმავე `run()`-ს იძახებს — მხოლოდ ჯგუფების სია განსხვავდება.
 * ორი ასლი ერთ დღეს ერთ სვეტს დაავიწყდებოდა.
 *
 * ⚠️ **TMDB-ს მაინც ერთხელ ვეკითხებით**: `/person/{id}` ყველა ფაქტს ერთ
 * პასუხში აბრუნებს, ე.ი. არჩევანი წყვეტს, **რა ჩაიწეროს**, და არა რამდენი
 * მოთხოვნა წავიდეს. ქართული სახელი (მეორე მოთხოვნა) მხოლოდ მაშინ მიდის,
 * თუ „პირადი მონაცემები" არჩეულია და სახელი ჯერ არ გვაქვს.
 */
class CastEnricher
{
    /**
     * ⚠️ TMDB-ის `external_ids`-ის ის გასაღებები, რომლებსაც ინტერფეისი ხატავს.
     * სია **მხოლოდ ფილტრია** — რაც არ იცნობა, `profile_links`-ში მაინც
     * ინახება, ე.ი. ხვალინდელი ქსელი ჩუმად არ იკარგება.
     */
    public const KNOWN_LINKS = [
        'imdb_id',
        'instagram_id',
        'twitter_id',
        'facebook_id',
        'tiktok_id',
        'youtube_id',
        'wikidata_id',
    ];

    /* ---------- რა განახლდეს (§39.2) ---------- */

    /** თარიღები, დაბადების ადგილი, IMDb, „ცნობილია", პოპულარობა, სქესი + ქართული სახელი */
    public const FIELD_DETAILS = 'details';

    /** ბიოგრაფია (ინგლისური — ქართულს TMDB თითქმის არასდროს აბრუნებს, იხ. ქვემოთ) */
    public const FIELD_BIOGRAPHY = 'biography';

    /** სოციალური ბმულები (`profile_links`) და ოფიციალური საიტი */
    public const FIELD_LINKS = 'links';

    /** პროფილის ფოტო — ჩამოიტვირთება, თუ არ აქვს (ან `overwritePhoto`-ზე — ყოველთვის) */
    public const FIELD_PHOTO = 'photo';

    public const FIELDS = [self::FIELD_DETAILS, self::FIELD_BIOGRAPHY, self::FIELD_LINKS, self::FIELD_PHOTO];

    /**
     * ცალკე ღილაკის ისტორიული ნაკრები — **ფოტოს გარეშე**.
     *
     * ⚠️ ღილაკი ფოტოს არასდროს ეხებოდა (ის მხოლოდ ჩანაწერზე მიბმისას
     * ჩამოდიოდა); ქცევის ჩუმად შეცვლა აქ არავის უთხოვია.
     */
    public const DEFAULT_FIELDS = [self::FIELD_DETAILS, self::FIELD_BIOGRAPHY, self::FIELD_LINKS];

    /** ფაქტების ჯგუფები — მათზე დგას `details_synced_at` (ფოტო ფაქტი არაა) */
    private const FACT_FIELDS = [self::FIELD_DETAILS, self::FIELD_BIOGRAPHY, self::FIELD_LINKS];

    /** რომელი ჯგუფი რომელ სვეტებს წერს */
    private const COLUMNS = [
        self::FIELD_DETAILS => ['imdb_id', 'birthday', 'deathday', 'place_of_birth', 'known_for', 'popularity', 'gender'],
        self::FIELD_BIOGRAPHY => ['biography'],
        self::FIELD_LINKS => ['homepage', 'profile_links'],
    ];

    /**
     * ⚠️ **პოპულარობა „ცვლილებად" არ ითვლება.** TMDB მას ყოველდღე ითვლის,
     * ე.ი. თითქმის ყოველი გაშვება „განახლდა"-ს იტყოდა და შედეგის შეჯამება
     * („განახლდა 300, უცვლელი 0") ყოველთვის ტყუილი იქნებოდა. იწერება —
     * უბრალოდ ჯამს არ ცვლის.
     */
    private const NOISY_COLUMNS = ['popularity'];

    /* ---------- შედეგი (§39.6) ---------- */

    /** TMDB-მა უპასუხა და რაღაც მართლა შეიცვალა (ან ფოტო ჩამოვიდა) */
    public const UPDATED = 'updated';

    /** TMDB-მა უპასუხა, მაგრამ ყველაფერი უკვე ისე იყო */
    public const UNCHANGED = 'unchanged';

    /**
     * TMDB-მ ეს პიროვნება არ იცის (404) ან ცარიელი უპასუხა.
     *
     * ⚠️ **`details_synced_at` აქაც იწერება** (§39.4): „ვკითხეთ და არაფერი
     * იყო" და „არასდროს გვიკითხავს" სხვადასხვა ფაქტია — უამისოდ „ვისაც
     * ჯერ არ განახლებია" იგივე მსახიობებს უსასრულოდ ჩაყრიდა რიგში.
     */
    public const EMPTY = 'tmdb_empty';

    /** TMDB-ის id არ აქვს — კითხვა შეუძლებელია (გეგმა მათ რიგში არ სვამს) */
    public const NO_ID = 'no_tmdb_id';

    /**
     * წყარო არ პასუხობს (ქსელი, 5xx, 401) — **ჩავარდნაა** და არა გამოტოვება.
     *
     * ⚠️ `details_synced_at` აქ **არ** იწერება: ეს დროებითია, და ნიშანი
     * მსახიობს „ვისაც ჯერ არ განახლებია"-დან ჩუმად ამოაგდებდა.
     */
    public const FAILED = 'failed';

    /** ბოლო ჩავარდნის მანქანური კოდი — `run()` მხოლოდ `FAILED`-ს ამბობს */
    private ?string $lastError = null;

    public function __construct(
        private TmdbClient $tmdb,
        private MediaDownloader $media,
    ) {}

    public function configured(): bool
    {
        return $this->tmdb->configured();
    }

    public function lastError(): ?string
    {
        return $this->lastError;
    }

    /**
     * **ცალკე ღილაკი** (მსახიობის გვერდი) — ისტორიული ფორმა.
     *
     * @return bool TMDB-მა უპასუხა თუ არა (ცვლილება არ მოითხოვება)
     */
    public function sync(CastMember $member): bool
    {
        return in_array($this->run($member), [self::UPDATED, self::UNCHANGED], true);
    }

    /**
     * მონაცემების განახლება — არჩეული ჯგუფებით.
     *
     * @param  list<string>  $fields  `FIELDS`-ის ქვესიმრავლე
     * @return string ერთ-ერთი `UPDATED` · `UNCHANGED` · `EMPTY` · `NO_ID` · `FAILED`
     */
    public function run(CastMember $member, array $fields = self::DEFAULT_FIELDS, bool $overwritePhoto = false): string
    {
        $this->lastError = null;
        $fields = array_values(array_intersect(self::FIELDS, $fields));

        if (! $member->tmdb_person_id) {
            return self::NO_ID;
        }

        if (! $this->configured()) {
            $this->lastError = 'credential_missing';

            return self::FAILED;
        }

        if (! $fields) {
            return self::UNCHANGED;
        }

        try {
            $person = $this->tmdb->person($member->tmdb_person_id);
        } catch (RequestException $e) {
            /* ⚠️ **404 წყაროს პასუხია და არა მისი ჩავარდნა** — TMDB-მ თქვა,
               რომ ასეთ პიროვნებას არ იცნობს (წაშლილი ან გაერთიანებული
               ჩანაწერი). სწორედ ეს უნდა დაინიშნოს `EMPTY`-ად, თორემ
               „ვისაც ჯერ არ განახლებია" მას ყოველ ჯერზე ჩაყრიდა რიგში. */
            if ($e->response?->status() !== 404) {
                return $this->failed($member, $e);
            }

            $person = null;
        } catch (Throwable $e) {
            return $this->failed($member, $e);
        }

        $factsAsked = array_intersect($fields, self::FACT_FIELDS) !== [];

        if (! $person || empty($person['id'])) {
            if ($factsAsked) {
                $member->forceFill(['details_synced_at' => AppTime::now()])->save();
            }

            return self::EMPTY;
        }

        $values = $this->values($person, $member);
        $wanted = [];

        foreach ($fields as $field) {
            foreach (self::COLUMNS[$field] ?? [] as $column) {
                $wanted[$column] = $values[$column] ?? null;
            }
        }

        // ⚠️ `array_filter` — ცარიელი პასუხი არსებულ მნიშვნელობას არ შლის (§39.4)
        $member->forceFill(array_filter($wanted, fn ($value) => $value !== null));

        $changed = array_diff(array_keys($member->getDirty()), self::NOISY_COLUMNS);

        $photo = in_array(self::FIELD_PHOTO, $fields, true)
            && $this->photo($member, $person['profile_path'] ?? null, $overwritePhoto);

        if ($factsAsked) {
            // ⚠️ **ყოველთვის** იწერება, თუნდაც ყველაფერი უცვლელი იყოს:
            // „ბოლოს როდის ვკითხეთ" სწორედ ამაზე დგას („N დღეზე ადრე")
            $member->forceFill(['details_synced_at' => AppTime::now()]);
        }

        if ($member->isDirty()) {
            $member->save();
        }

        $name = in_array(self::FIELD_DETAILS, $fields, true) && $this->syncGeorgianName($member);

        return $changed || $photo || $name ? self::UPDATED : self::UNCHANGED;
    }

    /**
     * პასუხის ყველა სვეტი — ჯგუფებად დაჭრა `run()`-შია.
     *
     * @return array<string, mixed>
     */
    private function values(array $person, CastMember $member): array
    {
        $external = is_array($person['external_ids'] ?? null) ? $person['external_ids'] : [];

        $links = [];
        foreach ($external as $key => $value) {
            if (is_string($value) && trim($value) !== '') {
                $links[$key] = trim($value);
            }
        }

        return [
            'imdb_id' => $this->text($external['imdb_id'] ?? null, 20),
            'birthday' => $this->date($person['birthday'] ?? null),
            'deathday' => $this->date($person['deathday'] ?? null),
            'place_of_birth' => $this->text($person['place_of_birth'] ?? null, 255),
            'biography' => $this->text($person['biography'] ?? null, 10000),
            'known_for' => $this->text($person['known_for_department'] ?? null, 60),
            'popularity' => isset($person['popularity']) ? (float) $person['popularity'] : null,
            'homepage' => $this->text($person['homepage'] ?? null, 500),
            'profile_links' => $links ?: null,
            // ⚠️ სქესს მხოლოდ მაშინ ვწერთ, თუ ჯერ არ ვიცით — ჩვენი შევსებული
            // (`credits`-იდან) იმავე TMDB-ის რიცხვია და გადაწერას აზრი არ აქვს
            'gender' => $member->gender === null && isset($person['gender'])
                ? (int) $person['gender']
                : null,
        ];
    }

    /**
     * **პროფილის ფოტო** (§39.2) — იმავე პასუხის `profile_path`-იდან, ე.ი.
     * TMDB-ის API-ს მეორედ არ ეკითხებით (სურათი CDN-იდან მოდის).
     *
     * ⚠️ **ფაილი საერთოა** (`cast/photos/<personId>.jpg`) და კვოტაში არ
     * ითვლება (19.4/B) — იგივე წესი, რაც სინქრონსა და ხელით მიბმას აქვს.
     * ⚠️ „აკლია" ნიშნავს „ბილიკი არ არის **ან ფაილი დისკზე აღარაა**" —
     * `ItemSyncer::needsPhoto()`-ის წესი: ხელით წაშლილი ფაილიც დაკარგულია.
     */
    private function photo(CastMember $member, ?string $profilePath, bool $overwrite): bool
    {
        if (! is_string($profilePath) || $profilePath === '') {
            return false;
        }

        if (! $overwrite && $member->photo_path
            && Storage::disk(StorageFolder::diskFor((string) $member->photo_path))->exists($member->photo_path)) {
            return false;
        }

        $path = $this->media->profile($profilePath, (int) $member->tmdb_person_id);

        if (! $path) {
            return false;
        }

        $member->photo_path = $path;

        return true;
    }

    /**
     * ქართული **სახელი** — ცალკე გამოძახება და ცალკე ცხრილი.
     *
     * ⚠️ **ქართული ბიოგრაფია არ ინახება და ეს არჩევანია, არა გამოტოვება**:
     * `cast_member_translations` მხოლოდ `name`-ს ინახავს, TMDB კი ქართულ
     * ბიოგრაფიას პრაქტიკულად არასდროს აბრუნებს (წიგნების იგივე
     * გადაწყვეტილება). ამ მეთოდს ადრე `syncGeorgianBiography` ერქვა — და
     * სწორედ ამ სახელმა შეაცდინა §39.2-ის ფორმულირება.
     *
     * @return bool ახალი სახელი ჩაიწერა თუ არა
     */
    private function syncGeorgianName(CastMember $member): bool
    {
        if ($member->name_ka) {
            return false;
        }

        try {
            $ka = $this->tmdb->person($member->tmdb_person_id, 'ka');
        } catch (Throwable) {
            return false;
        }

        $name = Lang::georgian($ka['name'] ?? null);

        if (! $name) {
            return false;
        }

        $member->setTranslation('ka', $name);

        return true;
    }

    /** წყარო არ პასუხობს — მიზეზი ლოგში რჩება (აუდიტი §D) */
    private function failed(CastMember $member, Throwable $e): string
    {
        SourceLog::threw('tmdb', $e, ['person' => $member->tmdb_person_id]);
        $this->lastError = 'tmdb_unavailable';

        return self::FAILED;
    }

    private function text(mixed $value, int $max): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : mb_substr($value, 0, $max);
    }

    /** TMDB ზოგჯერ ცარიელ სტრიქონს აბრუნებს თარიღის ნაცვლად */
    private function date(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($value))
            ? trim($value)
            : null;
    }
}
