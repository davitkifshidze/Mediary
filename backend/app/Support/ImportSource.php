<?php

namespace App\Support;

/**
 * **FEAT-07 — რომელი გარე სერვისის ფაილს ვცნობთ და როგორ.**
 *
 * ერთადერთი რუკა „წყარო → რომელი მოდულია, რომელი სვეტი რას ნიშნავს".
 * კითხულობს `ImportPlanner` (ამოცნობა + რუკა) და `RowImporter` (შექმნა).
 *
 * ⚠️ **ეს „ლინკების ბოტი" არ არის** (2026-09-05-ს სამუდამოდ მოხსნილი):
 * იქ აპი **თვითონ დაეძებდა** ყურების ბმულებს უცხო საიტებზე; აქ მომხმარებელი
 * თავისივე ექსპორტის ფაილს ტვირთავს და აპი მხოლოდ **კითხულობს**.
 *
 * ⚠️ **იდენტობა წყაროდან წყარომდე სხვადასხვაა და ზუსტად ეს განსაზღვრავს
 * შედეგის ხარისხს:**
 *  · IMDb — `Const` (`tt0111161`), ე.ი. **ზუსტი** დამთხვევა TMDB-ზე;
 *  · Letterboxd — მხოლოდ სათაური + წელი, ე.ი. **ძებნაა** და შეცდომაც
 *    შესაძლებელია (ამიტომ გეგმა ცხადად ამბობს, რა იპოვა);
 *  · Goodreads — ISBN (ზუსტი), სათაური/ავტორი — სათადარიგო;
 *  · Steam — `appid`, რომელსაც RAWG-ის უფასო API **პირდაპირ ვერ ეძებს**,
 *    ე.ი. იქაც სახელით ძებნაა.
 *
 * ⚠️ **სვეტების სახელები სიაა და არა ერთი სტრიქონი.** ერთი და იგივე
 * სერვისი წლების განმავლობაში სვეტს არქმევს („Date" → „Watched Date",
 * „ISBN" → „ISBN13"), ძველი ფაილი კი ხალხს კომპიუტერზე უდევს. მომხმარებლის
 * ხელით გადაბმა მაინც შესაძლებელია — რუკა მხოლოდ **შეთავაზებაა**.
 */
final class ImportSource
{
    /**
     * რამდენ რიგამდე იკითხება ერთი ფაილი.
     *
     * ⚠️ **ჭერი აუცილებელია და არა თავაზიანობა**: გეგმა მთელ სიას ერთ
     * პასუხში აბრუნებს (ფაილი სერვერზე არ ინახება), ე.ი. უსაზღვრო ფაილი
     * ერთდროულად მეხსიერებასაც და პასუხსაც გაბერავდა.
     */
    public const MAX_ROWS = 5000;

    /** ატვირთვის ჭერი კილობაიტებში — `php.ini`-ს საკუთარი ლიმიტი ამას ისედაც ჭრის */
    public const MAX_KB = 10240;

    /**
     * წყარო → აღწერა.
     *
     * `signature` — სათაურები, რომლებიც ამ ფორმატს ცალსახად ამოიცნობს;
     * `columns` — ჩვენი ველი → სვეტის შესაძლო სახელები (პირველი ემთხვევა);
     * `rating` — რამდენბალიანია შეფასება წყაროზე (1–10-ზე გადაყვანისთვის);
     * `status` — ფიქსირებული სტატუსი (ან `null`, როცა ფაილშივე წერია).
     *
     * @var array<string, array{module: string, label: string, signature: list<string>, columns: array<string, list<string>>, rating: int|null, status: string|null}>
     */
    public const SOURCES = [
        'letterboxd' => [
            'module' => 'movie',
            'label' => 'Letterboxd',
            'signature' => ['Letterboxd URI'],
            'columns' => [
                'title' => ['Name'],
                'year' => ['Year'],
                'rating' => ['Rating'],
                'done_at' => ['Watched Date', 'Date'],
            ],
            /* ⚠️ 0.5–5 ვარსკვლავი, ე.ი. **×2** — სხვაგვარად ხუთვარსკვლავიანი
               ფილმი ჩვენს ათბალიან შკალაზე „5"-ად ჩაიწერებოდა, ანუ საშუალოდ. */
            'rating' => 5,
            /* `watched.csv`/`ratings.csv` განსაზღვრებით **ნანახია** — Letterboxd
               სხვა სიას სხვა ფაილად აწვდის. */
            'status' => 'done',
        ],
        'imdb' => [
            'module' => 'movie',
            'label' => 'IMDb',
            'signature' => ['Const'],
            'columns' => [
                'imdb_id' => ['Const'],
                'title' => ['Title', 'Original Title'],
                'year' => ['Year'],
                'rating' => ['Your Rating'],
                'done_at' => ['Date Rated'],
            ],
            'rating' => 10,
            'status' => 'done',
        ],
        'goodreads' => [
            'module' => 'book',
            'label' => 'Goodreads',
            'signature' => ['Exclusive Shelf'],
            'columns' => [
                'isbn' => ['ISBN13', 'ISBN'],
                'title' => ['Title'],
                'author' => ['Author', 'Author l-f'],
                'year' => ['Original Publication Year', 'Year Published'],
                'rating' => ['My Rating'],
                'shelf' => ['Exclusive Shelf'],
                'done_at' => ['Date Read'],
            ],
            'rating' => 5,
            'status' => null,
        ],
        'steam' => [
            'module' => 'game',
            'label' => 'Steam',
            'signature' => ['appid'],
            'columns' => [
                'external_id' => ['appid', 'AppID'],
                'title' => ['name', 'Name'],
            ],
            'rating' => null,
            'status' => null,
        ],
    ];

    /**
     * Goodreads-ის თაროები → წიგნის სტატუსი.
     *
     * ⚠️ **`Book::STATUSES`-ის მნიშვნელობებია და არა როლები** — წიგნს
     * ლექსიკონი არ აქვს, მისი სტატუსი enum-ია (§6.4-ის ორმაგი მექანიზმი).
     */
    public const SHELVES = [
        'read' => 'read',
        'currently-reading' => 'reading',
        'to-read' => 'to_read',
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::SOURCES);
    }

    public static function has(string $source): bool
    {
        return isset(self::SOURCES[$source]);
    }

    public static function rule(): string
    {
        return 'in:'.implode(',', self::keys());
    }

    public static function module(string $source): string
    {
        return self::SOURCES[$source]['module'];
    }

    /** @return array<string, list<string>> */
    public static function columns(string $source): array
    {
        return self::SOURCES[$source]['columns'];
    }

    /**
     * ფაილის სათაურებიდან წყაროს ამოცნობა.
     *
     * ⚠️ **ხელმოწერა ერთი სვეტია და არა ყველა.** ექსპორტი წლიდან წლამდე
     * სვეტს ამატებს და აკლებს; ის ერთი, რომელიც არსად სხვაგან არ გვხვდება
     * (`Letterboxd URI`, `Const`, `Exclusive Shelf`, `appid`), საკმარისია
     * და სტაბილურიც.
     */
    public static function detect(array $headers): ?string
    {
        $lower = array_map(fn ($h) => mb_strtolower(trim((string) $h)), $headers);

        foreach (self::SOURCES as $key => $source) {
            foreach ($source['signature'] as $needle) {
                if (in_array(mb_strtolower($needle), $lower, true)) {
                    return $key;
                }
            }
        }

        return null;
    }

    /**
     * შეთავაზებული რუკა: ჩვენი ველი → ფაილის ნამდვილი სვეტი.
     *
     * @return array<string, string>
     */
    public static function mapping(string $source, array $headers): array
    {
        $byLower = [];
        foreach ($headers as $header) {
            $byLower[mb_strtolower(trim((string) $header))] = (string) $header;
        }

        $map = [];

        foreach (self::columns($source) as $field => $names) {
            foreach ($names as $name) {
                if (isset($byLower[mb_strtolower($name)])) {
                    $map[$field] = $byLower[mb_strtolower($name)];
                    break;
                }
            }
        }

        return $map;
    }

    /**
     * შეფასების გადაყვანა ჩვენს 1–10 შკალაზე.
     *
     * ⚠️ **ნული „შეფასების გარეშეა" და არა „ყველაზე ცუდი".** Goodreads
     * შეუფასებელ წიგნს `0`-ს წერს, ე.ი. პირდაპირ გადმოწერა მთელ
     * ბიბლიოთეკას ერთვარსკვლავიანად აქცევდა.
     */
    public static function rating(string $source, mixed $raw): ?float
    {
        $scale = self::SOURCES[$source]['rating'] ?? null;

        if ($scale === null || $raw === null || $raw === '' || ! is_numeric($raw)) {
            return null;
        }

        $value = (float) $raw;

        if ($value <= 0) {
            return null;
        }

        return round(min(10, $value * (10 / $scale)), 1);
    }
}
