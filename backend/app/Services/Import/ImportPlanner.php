<?php

namespace App\Services\Import;

use App\Models\Book;
use App\Models\Game;
use App\Models\Movie;
use App\Models\User;
use App\Support\ImportSource;

/**
 * **FEAT-07 — „რა მოხდება, თუ ამ ფაილს დავაიმპორტებ".**
 *
 * ⚠️ **გეგმა გარე წყაროს არ ეკითხება და ეს მთავარი გადაწყვეტილებაა.**
 * 800-რიგიანი Letterboxd-ის ფაილი 800 TMDB-გამოძახება იქნებოდა **მხოლოდ
 * იმისთვის, რომ რიცხვი გვეჩვენებინა** — და მერე კიდევ იმდენივე იმპორტზე.
 * ამიტომ გეგმა მხოლოდ იმას აკეთებს, რაც უფასოა: კითხულობს, ალაგებს
 * სვეტებს და **ადგილობრივ** დუბლს ეძებს. გარე ძებნა ერთეულის ბიჯზეა,
 * სადაც `/sync`-ის პაუზაც მოქმედებს.
 *
 * ⚠️ **დუბლი მაინც თავიდან მოწმდება ჩაწერისას** (`RowImporter`): გეგმა
 * შეიძლება წუთებით ადრე აიგო, და „რამდენი დაემატა" მხოლოდ სერვერის
 * პასუხია — იგივე წესი, რითაც `/purge`-ის `plan()` და `run()` ერთ
 * query-ს იზიარებენ.
 */
class ImportPlanner
{
    public function __construct(private readonly CsvReader $reader) {}

    /**
     * @param  array<string, string>|null  $mapping  ჩვენი ველი → სვეტი (მომხმარებლის შესწორება)
     * @return array{source: ?string, module: ?string, headers: list<string>, mapping: array<string, string>, items: list<array<string, mixed>>, counts: array<string, int>, total: int, truncated: bool}
     */
    public function plan(User $user, $file, ?string $source = null, ?array $mapping = null): array
    {
        $read = $this->reader->read($file);
        $headers = $read['headers'];

        $source ??= ImportSource::detect($headers);

        if ($source === null) {
            return [
                'source' => null,
                'module' => null,
                'headers' => $headers,
                'mapping' => [],
                'items' => [],
                'counts' => ['new' => 0, 'duplicate' => 0, 'invalid' => 0],
                'total' => $read['total'],
                'truncated' => $read['truncated'],
            ];
        }

        $module = ImportSource::module($source);
        /* ⚠️ მომხმარებლის რუკა **ავსებს** და არ ცვლის: ის ჩვეულებრივ ერთ
           სვეტს ასწორებს, დანარჩენს კი ავტომატური ცნობა უკვე იპოვის. */
        $mapping = array_filter($mapping ?? []) + ImportSource::mapping($source, $headers);

        $items = [];
        foreach ($read['rows'] as $row) {
            $items[] = $this->item($user, $source, $module, $mapping, $row);
        }

        $counts = ['new' => 0, 'duplicate' => 0, 'invalid' => 0];
        foreach ($items as $item) {
            $counts[$item['state']]++;
        }

        return [
            'source' => $source,
            'module' => $module,
            'headers' => $headers,
            'mapping' => $mapping,
            'items' => $items,
            'counts' => $counts,
            'total' => $read['total'],
            'truncated' => $read['truncated'],
        ];
    }

    /**
     * ერთი რიგი — ნორმალიზებული ველები + გადაწყვეტილება.
     *
     * @return array<string, mixed>
     */
    private function item(User $user, string $source, string $module, array $mapping, array $row): array
    {
        $pick = fn (string $field) => isset($mapping[$field]) ? trim((string) ($row[$mapping[$field]] ?? '')) : '';

        $item = [
            'line' => (int) ($row['__line'] ?? 0),
            'title' => $pick('title'),
            'year' => $this->year($pick('year')),
            'imdb_id' => $this->imdb($pick('imdb_id')),
            'isbn' => $this->isbn($pick('isbn')),
            'author' => $pick('author') ?: null,
            'external_id' => $pick('external_id') ?: null,
            'rating' => ImportSource::rating($source, $pick('rating')),
            'status' => $this->status($source, $pick('shelf')),
            'done_at' => $pick('done_at') ?: null,
        ];

        $item['state'] = match (true) {
            // სათაურის გარეშე ვერცერთ წყაროზე ვერაფერს ვიპოვით (id-ც სათაურს ვერ ცვლის ანგარიშში)
            $item['title'] === '' && ! $item['imdb_id'] && ! $item['isbn'] => 'invalid',
            $this->duplicate($user, $module, $item) => 'duplicate',
            default => 'new',
        };

        return $item;
    }

    /**
     * უკვე მაქვს თუ არა.
     *
     * ⚠️ **ჯერ იდენტობა, მერე სათაური.** `imdb_id`/`isbn` ზუსტია, სათაური
     * კი ვარაუდი — ამიტომ სათაურით შედარება მხოლოდ მაშინ მუშაობს, როცა
     * id საერთოდ არ არის. სხვაგვარად ერთი და იგივე სახელის ორი ფილმი
     * ერთმანეთს „დუბლად" ჩათვლიდა.
     */
    private function duplicate(User $user, string $module, array $item): bool
    {
        $own = fn (string $model) => $model::withoutGlobalScope('owner')->where('user_id', $user->getKey());

        if ($module === 'movie') {
            if ($item['imdb_id']) {
                return $own(Movie::class)->where('imdb_id', $item['imdb_id'])->exists();
            }

            return $item['title'] !== '' && $own(Movie::class)
                ->when($item['year'], fn ($q, $year) => $q->where('year', $year))
                ->whereHas('translations', fn ($q) => $q->where('title', $item['title']))
                ->exists();
        }

        if ($module === 'book') {
            if ($item['isbn']) {
                return $own(Book::class)->where('isbn', $item['isbn'])->exists();
            }

            return $item['title'] !== '' && $own(Book::class)
                ->where(fn ($q) => $q->where('title_en', $item['title'])->orWhere('title_ka', $item['title']))
                ->when($item['author'], fn ($q, $a) => $q->where('author', $a))
                ->exists();
        }

        return $item['title'] !== '' && $own(Game::class)
            ->where(fn ($q) => $q->where('title_en', $item['title'])->orWhere('title_ka', $item['title']))
            ->exists();
    }

    /** `2009` — ზოგი ექსპორტი `2009-06-01`-საც წერს */
    private function year(string $raw): ?int
    {
        return preg_match('/(\d{4})/', $raw, $m) ? (int) $m[1] : null;
    }

    /** `tt0111161`; ყველაფერი დანარჩენი — `null` */
    private function imdb(string $raw): ?string
    {
        return preg_match('/^tt\d{5,}$/i', $raw) ? strtolower($raw) : null;
    }

    /**
     * ⚠️ **Goodreads ISBN-ს `="9780..."`-ად წერს.** ეს Excel-ის ხრიკია
     * (რომ ნომერმა ნულები არ დაკარგოს) და პირდაპირ წაკითხვისას ISBN
     * **არასდროს ემთხვეოდა** — ე.ი. ყველა წიგნი „ახალი" იქნებოდა და
     * ზუსტი ძებნის ნაცვლად სათაურით ძებნა მოხდებოდა.
     */
    private function isbn(string $raw): ?string
    {
        $clean = preg_replace('/[^0-9Xx]/', '', $raw) ?: '';

        return strlen($clean) >= 10 ? strtoupper($clean) : null;
    }

    /** Goodreads-ის თარო → წიგნის სტატუსი; სხვა წყაროზე — ფიქსირებული */
    private function status(string $source, string $shelf): ?string
    {
        $fixed = ImportSource::SOURCES[$source]['status'] ?? null;

        if ($fixed !== null) {
            return $fixed;
        }

        return ImportSource::SHELVES[mb_strtolower($shelf)] ?? null;
    }
}
