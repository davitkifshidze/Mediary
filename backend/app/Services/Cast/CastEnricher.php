<?php

namespace App\Services\Cast;

use App\Models\CastMember;
use App\Services\Tmdb\TmdbClient;
use App\Support\Lang;
use App\Support\SourceLog;
use Throwable;

/**
 * **მსახიობის მონაცემების შევსება TMDB-დან (Tasks §8.1).**
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
 * მომხმარებელი ვერ მიხვდება, წყარომ დაკარგა თუ ჩვენ წავშალეთ.
 *
 * ⚠️ **ქართული ბიოგრაფია მხოლოდ მაშინ ინახება, თუ მართლა ქართულია** —
 * `Lang::georgian()`-ის არსებული წესი: TMDB უჩუმრად ორიგინალ ენაზე
 * ბრუნდება, ე.ი. „ka" პასუხი ხშირად იგივე ინგლისურია.
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

    public function __construct(private TmdbClient $tmdb) {}

    public function configured(): bool
    {
        return $this->tmdb->configured();
    }

    /**
     * მონაცემების განახლება.
     *
     * @return bool ჩაიწერა თუ არა რამე (წყაროს ჩავარდნა შეცდომა არაა)
     */
    public function sync(CastMember $member): bool
    {
        if (! $member->tmdb_person_id || ! $this->configured()) {
            return false;
        }

        try {
            $person = $this->tmdb->person($member->tmdb_person_id);
        } catch (Throwable $e) {
            // წყარო არ პასუხობს — გვერდი მაინც უნდა გაიხსნას (BGG-ის წესი),
            // მაგრამ მიზეზი ლოგში რჩება (აუდიტი §D)
            SourceLog::threw('tmdb', $e, ['person' => $member->tmdb_person_id]);

            return false;
        }

        if (! $person || empty($person['id'])) {
            return false;
        }

        $external = is_array($person['external_ids'] ?? null) ? $person['external_ids'] : [];

        $links = [];
        foreach ($external as $key => $value) {
            if (is_string($value) && trim($value) !== '') {
                $links[$key] = trim($value);
            }
        }

        $member->forceFill(array_filter([
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
        ], fn ($value) => $value !== null))
            // ⚠️ ეს **ყოველთვის** იწერება, თუნდაც წყარომ ცარიელი დააბრუნოს:
            // „ვცადეთ და არაფერი იყო" და „არასდროს გვიცდია" სხვადასხვა ფაქტია
            ->forceFill(['details_synced_at' => now()])
            ->save();

        $this->syncGeorgianBiography($member);

        return true;
    }

    /**
     * ქართული ბიოგრაფია — **ცალკე გამოძახება და ცალკე ცხრილი**.
     *
     * ⚠️ `cast_member_translations` მხოლოდ `name`-ს ინახავს, ე.ი. ბიოგრაფიას
     * ადგილი არ აქვს. ამიტომ ქართული ტექსტი **არ ინახება** — მხოლოდ სახელი
     * განახლდება, თუ TMDB-ს ქართული აქვს. ბიოგრაფიის ორენოვნება ცალკე
     * სქემას მოითხოვდა და §8 მას არ ითხოვს (წიგნების იგივე გადაწყვეტილება).
     */
    private function syncGeorgianBiography(CastMember $member): void
    {
        if ($member->name_ka) {
            return;
        }

        try {
            $ka = $this->tmdb->person($member->tmdb_person_id, 'ka');
        } catch (Throwable) {
            return;
        }

        $name = Lang::georgian($ka['name'] ?? null);

        if ($name) {
            $member->setTranslation('ka', $name);
        }
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
