<?php

namespace App\Services\Sync;

use App\Models\CastMember;
use App\Models\TvEpisode;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Model;
use Throwable;

/**
 * **ჩანაწერის ფაქტები გაშვებამდე და მის შემდეგ — „რა რით შეიცვალა".**
 *
 * ველებს ოთხი მწერალი ცვლის (`ItemSyncer`, `ItemTranslator`, `CastEnricher`,
 * `EpisodeSync`) და არცერთი ძველ მნიშვნელობას არ აბრუნებს — მხოლოდ შეცვლილი ველების
 * სახელებს. ძველი მნიშვნელობის გატარება ოთხივეს ყოველ `apply…`-ში ოთხ სხვადასხვა
 * ფორმას გააჩენდა; აქ ერთი გზაა: ჩანაწერი ერთხელ იკითხება გაშვებამდე, ერთხელ მის
 * შემდეგ, და სხვაობა თვითონ ამბობს, რა შეიცვალა და რით.
 *
 * ```php
 * $facts = SyncFacts::watch($record, SyncHistory::KIND_SYNC, $tracked);
 * $result = $syncer->sync($record, $options);
 * [$outcome, $details] = $facts->settle(SyncHistory::outcome($result));
 * ```
 *
 * ⚠️ **შედეგსაც ფაქტები აზუსტებს** (`settle()`): მწერალი „შეცვლილად" იმასაც აბრუნებს,
 * რაც იმავე მნიშვნელობით გადაიწერა („ყველაფრის გადაწერაზე" სათაური, აღწერა, ჟანრები და
 * მსახიობები ყოველთვის სიაშია) — ისტორიაში „განახლდა" მხოლოდ ის არის, რაც მართლა შეიცვალა.
 *
 * სამი სახის ფაქტი: **მნიშვნელობა** (ტექსტი, რიცხვი, თარიღი — „იყო → გახდა"), **სია**
 * (ჟანრები, მსახიობები — რა დაემატა, რა მოაკლდა; იდენტობა id-ით, რომ ქართული სახელის
 * გაჩენა „ერთი მოაკლდა, ერთი დაემატა" არ გამოვიდეს) და **ფაილი** (პოსტერი, ფოტო —
 * მხოლოდ ფაქტი: მისამართი ისტორიაში არ იწერება).
 *
 * ⚠️ **სიის ელემენტი id-თან ერთად ინახება და წაკითხვა `readable()`-ზე გადის**: მსახიობი,
 * რომელიც გაშვების შემდეგ ჩაიკეტა, ფილმის „მსახიობები: დაემატა …"-დან უნდა გაქრეს —
 * სახელი მარტო რომ ეწეროს, ისტორია ჩაკეტილის სახელს სამუდამოდ შეინახავდა და აჩვენებდა.
 *
 * ⚠️ **ისტორია ვერასდროს ტეხს სინქრონიზაციას** (`SyncHistory`-ის წესი): წაკითხვის
 * ჩავარდნა `report()`-ით ფიქსირდება და ერთეული მნიშვნელობების გარეშე იწერება.
 * ⚠️ ისტორიაში არჩაწერილ გაშვებაზე (ერთეულოვანი ღილაკი) ჩანაწერი საერთოდ არ იკითხება
 * (`$tracked = false`) — ზედმეტი მოთხოვნა არ ჩნდება.
 * ⚠️ გრძელი ტექსტი იჭრება (`TEXT_MAX`) — სრული ტექსტი ჩანაწერის გვერდზეა.
 */
final class SyncFacts
{
    /** ერთ მნიშვნელობაში მაქსიმუმ რამდენი სიმბოლო ინახება */
    public const TEXT_MAX = 1200;

    /** სიის ერთ მხარეს (დაემატა / მოაკლდა) მაქსიმუმ რამდენი სახელი */
    public const LIST_MAX = 40;

    private const VALUE = 'value';

    private const LIST = 'list';

    private const FILE = 'file';

    /**
     * @param  array<string, array{0: string, 1: mixed}>|null  $before  `null` — გაშვება ისტორიაში არ იწერება
     */
    private function __construct(
        private readonly Model $record,
        private readonly string $kind,
        private readonly ?array $before,
    ) {}

    /** გაშვებამდე: ჩანაწერის მდგომარეობის გადაღება */
    public static function watch(Model $record, string $kind, bool $tracked = true): self
    {
        return new self($record, $kind, $tracked ? self::safely(fn () => self::of($record, $kind)) : null);
    }

    /**
     * გაშვების შემდეგ: რა შეიცვალა და რით.
     *
     * @param  array<string, string>  $by  ველი → წყარო (`tmdb` · `gemini` · `review`) — თარგმანი
     * @return list<array<string, mixed>> შენახვის ფორმა: `[{field, from, to, by?} | {field, added: [{id, name}], removed: […]} | {field, file, replaced}]`
     */
    public function changes(array $by = []): array
    {
        if ($this->before === null) {
            return [];
        }

        $after = self::safely(fn () => self::of($this->record, $this->kind));

        return $after === null ? [] : self::between($this->before, $after, $by);
    }

    /**
     * გაშვების შემდეგ: **შედეგი ნამდვილი ცვლილებით დაზუსტებული** და რა რით შეიცვალა.
     *
     * მნიშვნელობისა და სიის კოდი „შეცვლილში" მხოლოდ მაშინ რჩება, თუ ფაქტი მართლა
     * შეიცვალა; თუ აღარაფერი დარჩა, ერთეული „უცვლელია". ⚠️ ფაილის კოდს (პოსტერი, ფოტო)
     * და კოდს, რომელსაც ფაქტი არ ეთანადება (`photos`, მსახიობის ჯგუფები), მწერლის
     * სიტყვა წყვეტს: ფაილი იმავე მისამართზეც იცვლება და მისამართის შედარება ამას ვერ ხედავს.
     *
     * @param  array{0: string, 1: list<string>, 2: ?string}  $outcome  `SyncHistory::outcome()` და მისი მსგავსები
     * @param  array<string, string>  $by  ველი → წყარო — თარგმანი
     * @return array{0: array{0: string, 1: list<string>, 2: ?string}, 1: list<array<string, mixed>>} შედეგი და მნიშვნელობები
     */
    public function settle(array $outcome, array $by = []): array
    {
        if ($this->before === null || $outcome[0] !== SyncHistory::UPDATED) {
            return [$outcome, []];
        }

        $after = self::safely(fn () => self::of($this->record, $this->kind));

        if ($after === null) {
            return [$outcome, []];
        }

        $details = self::between($this->before, $after, $by);
        $moved = array_column($details, 'field');

        $confirmed = array_values(array_filter($outcome[1], function (string $code) use ($after, $moved) {
            // `seasons:8` — რიცხვიანი კოდის ველი ორწერტილამდეა
            $field = explode(':', $code, 2)[0];
            $type = $after[$field][0] ?? null;

            return $type === null || $type === self::FILE || in_array($field, $moved, true);
        }));

        return $confirmed === [] && $details === []
            ? [[SyncHistory::UNCHANGED, [], null], []]
            : [[SyncHistory::UPDATED, $confirmed, null], $details];
    }

    /**
     * ჩანაწერის ფაქტები — გასაღები იგივე კოდია, რასაც მწერლები „შეცვლილში" აბრუნებენ
     * (`title_ka`, `genres`, `poster`…), ე.ი. გვერდი ორივეს ერთი წარწერით ხატავს.
     *
     * @return array<string, array{0: string, 1: mixed}>
     */
    public static function of(Model $record, string $kind): array
    {
        if ($record instanceof CastMember) {
            return self::actor($record);
        }

        return $kind === SyncHistory::KIND_EPISODES ? self::episodes($record) : self::media($record);
    }

    /**
     * ორი მდგომარეობის სხვაობა.
     *
     * @param  array<string, array{0: string, 1: mixed}>  $before
     * @param  array<string, array{0: string, 1: mixed}>  $after
     * @param  array<string, string>  $by
     * @return list<array<string, mixed>>
     */
    public static function between(array $before, array $after, array $by = []): array
    {
        $changes = [];

        foreach ($after as $field => [$type, $new]) {
            $old = $before[$field][1] ?? null;

            if ($type === self::LIST) {
                $old = is_array($old) ? $old : [];
                $added = self::entries(array_diff_key($new, $old));
                $removed = self::entries(array_diff_key($old, $new));

                if ($added !== [] || $removed !== []) {
                    $changes[] = ['field' => $field, 'added' => $added, 'removed' => $removed];
                }

                continue;
            }

            if ($old === $new) {
                continue;
            }

            $changes[] = $type === self::FILE
                // ⚠️ ფაილის მისამართი არ იწერება — მხოლოდ „ახალი ფაილი" და იყო თუ არა წინა
                ? ['field' => $field, 'file' => true, 'replaced' => $old !== null]
                // ⚠️ შედარება სრულ ტექსტზეა, იჭრება მხოლოდ ის, რაც ინახება
                : ['field' => $field, 'from' => self::cut($old), 'to' => self::cut($new)] + (isset($by[$field]) ? ['by' => (string) $by[$field]] : []);
        }

        return $changes;
    }

    /**
     * შენახული ცვლილებები → პასუხის ფორმა: სიაში მხოლოდ სახელები, **ჩაკეტილი (ამ სესიაში
     * დაუხსნელი) მსახიობის გარეშე**; სია, რომელშიც ამის შემდეგ აღარაფერი დარჩა, საერთოდ არ ჩანს.
     *
     * @param  list<array<string, mixed>>  $details  `changes()`-ის შენახული ფორმა
     * @param  list<int>  $hiddenActors  მნახველისთვის დამალული მსახიობების id-ები
     * @return list<array<string, mixed>> `[{field, from, to, by?} | {field, added: [name], removed: [name]} | {field, file, replaced}]`
     */
    public static function readable(array $details, array $hiddenActors = []): array
    {
        $out = [];

        foreach ($details as $detail) {
            if (! is_array($detail) || ! isset($detail['field'])) {
                continue;
            }

            if (! array_key_exists('added', $detail)) {
                $out[] = $detail;

                continue;
            }

            $hidden = $detail['field'] === 'cast' ? $hiddenActors : [];
            $added = self::names($detail['added'], $hidden);
            $removed = self::names($detail['removed'] ?? [], $hidden);

            if ($added !== [] || $removed !== []) {
                $out[] = ['field' => $detail['field'], 'added' => $added, 'removed' => $removed];
            }
        }

        return $out;
    }

    /**
     * სიის ელემენტები შენახვის ფორმით — id და სახელი, ზღვრით.
     *
     * @param  array<int|string, string>  $items  id → სახელი
     * @return list<array{id: int|string, name: string}>
     */
    private static function entries(array $items): array
    {
        $entries = [];

        foreach (array_slice($items, 0, self::LIST_MAX, true) as $id => $name) {
            $entries[] = ['id' => $id, 'name' => $name];
        }

        return $entries;
    }

    /**
     * შენახული ელემენტების სახელები, დამალული id-ების გარეშე.
     *
     * @param  list<int>  $hidden
     * @return list<string>
     */
    private static function names(mixed $entries, array $hidden): array
    {
        $names = [];

        foreach (is_array($entries) ? $entries : [] as $entry) {
            if (! is_array($entry) || ! isset($entry['name'])) {
                continue;
            }
            if ($hidden !== [] && in_array((int) ($entry['id'] ?? 0), $hidden, true)) {
                continue;
            }

            $names[] = (string) $entry['name'];
        }

        return $names;
    }

    /**
     * ფილმი · სერიალი · ანიმე — ყველაფერი, რასაც სინქრონიზაცია და თარგმანი ცვლის.
     *
     * @return array<string, array{0: string, 1: mixed}>
     */
    private static function media(Model $record): array
    {
        $facts = [
            'title_en' => self::value($record->title_en),
            'title_ka' => self::value($record->title_ka),
            'description_en' => self::value($record->description_en),
            'description_ka' => self::value($record->description_ka),
            'year' => self::value($record->year),
            'rating' => self::value($record->rating),
            'imdb' => self::value($record->imdb_id),
            'trailer' => self::value($record->trailer_url),
            // გამოსვლის თარიღი და TMDB-ის მდგომარეობა ერთი ფაქტია (`Upcoming::stamp()`)
            'release' => self::value(self::joined(self::day($record->release_date), $record->tmdb_status)),
        ];

        if (MediaDomain::isTv(MediaDomain::typeOf($record))) {
            $facts['seasons'] = self::value($record->seasons);
            $facts['episodes'] = self::value($record->episodes);
            $facts['next_air'] = self::value(self::joined(
                self::day($record->next_air_at),
                $record->next_season !== null ? 'S'.(int) $record->next_season.'E'.(int) $record->next_episode : null,
            ));
        } else {
            $facts['collection'] = self::value($record->collection_name);
        }

        $facts['genres'] = [self::LIST, $record->genres()->with('translations')->get()
            ->mapWithKeys(fn ($genre) => [(int) $genre->getKey() => (string) ($genre->name_ka ?: $genre->name_en)])
            ->all()];
        $facts['cast'] = [self::LIST, $record->cast()->with('translations')->get()
            ->mapWithKeys(fn ($member) => [(int) $member->getKey() => (string) ($member->name_ka ?: $member->name)])
            ->all()];
        $facts['poster'] = [self::FILE, self::blank($record->poster_path)];

        return $facts;
    }

    /**
     * მსახიობი — `CastEnricher`-ის ჯგუფების სვეტები (`details` · `biography` · `links` · `photo`).
     *
     * @return array<string, array{0: string, 1: mixed}>
     */
    private static function actor(CastMember $member): array
    {
        $links = [];
        foreach ((array) ($member->profile_links ?? []) as $network => $value) {
            $links[(string) $network] = $network.': '.(is_scalar($value) ? $value : '');
        }

        return [
            'name_ka' => self::value($member->name_ka),
            'birthday' => self::value(self::day($member->birthday)),
            'deathday' => self::value(self::day($member->deathday)),
            'place_of_birth' => self::value($member->place_of_birth),
            'known_for' => self::value($member->known_for),
            'imdb' => self::value($member->imdb_id),
            'biography' => self::value($member->biography),
            'biography_ka' => self::value($member->biography_ka),
            'homepage' => self::value($member->homepage),
            'profile_links' => [self::LIST, $links],
            'photo' => [self::FILE, self::blank($member->photo_path)],
        ];
    }

    /**
     * სეზონები და სერიები — რამდენია **ჩამოტვირთული** (ეპიზოდების ცხრილში): სერვისი
     * მხოლოდ ჯამს აბრუნებს და არ ამბობს, რამდენი იყო ახალი.
     *
     * @return array<string, array{0: string, 1: mixed}>
     */
    private static function episodes(Model $record): array
    {
        $tmdbId = (int) ($record->tmdb_id ?? 0);

        if ($tmdbId === 0) {
            return [];
        }

        $loaded = TvEpisode::query()->where('tmdb_series_id', $tmdbId);

        return [
            'seasons' => self::value((clone $loaded)->distinct()->count('season_number')),
            'episodes' => self::value($loaded->count()),
        ];
    }

    /** @return array{0: string, 1: ?string} */
    private static function value(mixed $value): array
    {
        return [self::VALUE, self::blank($value)];
    }

    /** შესანახი ტექსტი — `TEXT_MAX` სიმბოლომდე */
    private static function cut(mixed $text): ?string
    {
        if (! is_string($text)) {
            return null;
        }

        return mb_strlen($text) > self::TEXT_MAX ? mb_substr($text, 0, self::TEXT_MAX).'…' : $text;
    }

    /** ცარიელი და `null` ერთი და იგივეა — „ახლად შეივსო" სწორედ ამით ითქმება */
    private static function blank(mixed $value): ?string
    {
        if ($value === null || ! is_scalar($value)) {
            return null;
        }

        $text = trim((string) $value);

        return $text === '' ? null : $text;
    }

    private static function day(mixed $date): ?string
    {
        if ($date instanceof \DateTimeInterface) {
            return $date->format('Y-m-d');
        }

        return is_string($date) && $date !== '' ? substr($date, 0, 10) : null;
    }

    private static function joined(mixed ...$parts): ?string
    {
        $parts = array_values(array_filter(array_map(self::blank(...), $parts), fn (?string $part) => $part !== null));

        return $parts === [] ? null : implode(' · ', $parts);
    }

    /**
     * @template T
     *
     * @param  callable(): T  $read
     * @return T|null
     */
    private static function safely(callable $read): mixed
    {
        try {
            return $read();
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }
}
