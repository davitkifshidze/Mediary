<?php

namespace App\Services\Books;

use App\Support\SourceLog;
use Illuminate\Http\Client\Response;
use Throwable;

/**
 * Open Library — წიგნების გამამდიდრებელი წყარო (Tasks §12).
 *
 * ორი უფასო ვარიანტიდან (Open Library / Google Books) **Open Library** ავირჩიე:
 * კლავიშს საერთოდ არ ითხოვს, ე.ი. TMDB-ისგან განსხვავებით `.env`-ში არაფერი
 * ემატება და ახალ მანქანაზე ისე მუშაობს, როგორც არის.
 *
 * ⚠️ Windows-ის cURL-ს CA bundle არ აქვს → `verify` ხელით (იგივე წესი, რაც
 * `TmdbClient`-ზე). ⚠️ Open Library **ორ სახეობას** აბრუნებს: `work`
 * (ნაწარმოები) და `edition` (გამოცემა). ISBN, გვერდები და გამომცემელი მხოლოდ
 * გამოცემაზეა, ამიტომ ძებნის შედეგში ორივეს ვიღებთ და დეტალებზე გამოცემას
 * ვეკითხებით.
 */
class OpenLibraryClient
{
    private const BASE = 'https://openlibrary.org';

    private const COVERS = 'https://covers.openlibrary.org/b';

    /** ბოლო გამოძახებამ ქსელის დონეზე ჩაიჭრა თუ არა */
    private bool $failed = false;

    /** ისეთი წყაროა, კლავიშს რომ არ ითხოვს — მაგრამ ინტერფეისს ერთი კითხვა აქვს */
    public function configured(): bool
    {
        return true;
    }

    /**
     * ბოლო გამოძახება **წყაროს ჩავარდნა** იყო (და არა უბრალოდ უშედეგო ძებნა).
     *
     * ⚠️ **ეს ორი სრულიად სხვადასხვა ფაქტია და მათი გაერთიანება შეცდომაა**
     * (`BggClient::blocked()`-ის ზუსტი პრეცედენტი): „ვერაფერი ვიპოვე"
     * ნიშნავს, რომ ასეთი წიგნი არ არსებობს, „წყარო არ პასუხობს" კი —
     * რომ ხელახლა უნდა სცადო ან ხელით შეავსო.
     */
    public function blocked(): bool
    {
        return $this->failed;
    }

    /**
     * სათაურით/ავტორით ძებნა — არჩევანის სია (TMDB-ის `candidates()`-ის ანალოგი).
     * ავტომატურად არაფერს ვამთხვევთ: ერთნაირსახელიან წიგნებზე შეცდომა ძალიან იოლია.
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $query, int $limit = 10): array
    {
        $res = $this->get(self::BASE.'/search.json', [
            'q' => $query,
            'limit' => max(1, min($limit, 25)),
            // მხოლოდ საჭირო ველები — პასუხი სხვა შემთხვევაში ასობით კილობაიტია
            'fields' => 'key,title,author_name,first_publish_year,isbn,number_of_pages_median,'
                .'publisher,language,cover_i,subject,edition_key',
        ]);

        if (! $res?->successful()) {
            return [];
        }

        return array_map(fn (array $doc) => $this->fromSearchDoc($doc), $res->json('docs') ?? []);
    }

    /** ISBN-ით პირდაპირ — ერთი ზუსტი შედეგი ან null */
    public function byIsbn(string $isbn): ?array
    {
        $isbn = preg_replace('/[^0-9Xx]/', '', $isbn) ?: '';

        if ($isbn === '') {
            return null;
        }

        $res = $this->get(self::BASE."/isbn/{$isbn}.json");

        if (! $res?->successful()) {
            return null;
        }

        return $this->fromEdition($res->json() ?? [], $isbn);
    }

    /**
     * ერთი კანდიდატის სრული დრაფტი. `key` არის ან `/works/OL…W`, ან
     * `/books/OL…M` (გამოცემა) — ორივეს ვიღებთ, რომ ფორმის შევსება
     * ერთი გამოძახებით მოხდეს.
     */
    public function details(string $key): ?array
    {
        $key = '/'.trim($key, '/');

        $res = $this->get(self::BASE."{$key}.json");

        if (! $res?->successful()) {
            return null;
        }

        $data = $res->json() ?? [];

        if (str_starts_with($key, '/books/')) {
            return $this->fromEdition($data, null);
        }

        // ნაწარმოებზე ISBN/გვერდები არ არის — პირველი გამოცემით ვავსებთ
        // **მხოლოდ ცარიელ** ველებს (ნაწარმოების სათაური უფრო სანდოა)
        $draft = $this->fromWork($data);

        if ($edition = $this->firstEdition($key)) {
            foreach ($draft as $field => $value) {
                if ($value === null || $value === [] || $value === '') {
                    $draft[$field] = $edition[$field] ?? $value;
                }
            }
            // `key` ყოველთვის ნაწარმოებისა რჩება — ის არის სტაბილური იდენტიფიკატორი
            $draft['key'] = ltrim((string) ($data['key'] ?? ''), '/');
        }

        return $draft;
    }

    /** ყდის ბაიტები — `MediaDownloader::contents()`-ის ანალოგი, ჩაწერის გარეშე */
    public function cover(int|string $id, string $type = 'id', string $size = 'L'): ?string
    {
        $res = $this->get(self::COVERS."/{$type}/{$id}-{$size}.jpg");

        // Open Library ცარიელ 1×1-ს აბრუნებს, როცა ყდა არაა
        return $res?->successful() && strlen($res->body()) > 1000 ? $res->body() : null;
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ერთი გამოძახება — **ქსელის ჩავარდნა გამონაკლისი არ არის**.
     *
     * ⚠️ ამ კლასს try/catch საერთოდ არ ჰქონდა, ე.ი. `cURL error 28`
     * (openlibrary.org-ის timeout, ცოცხალი შეცდომა 2026-09-14) კონტროლერიდან
     * **500-ით** გადიოდა და ეკრანზე გამონაკლისის ტექსტით აიცემბოდა.
     * რაც მყისი წყაროს ჩავარდნამ **წიგნის დამატება არ უნდა შეაჩეროს**
     * (`LinkMetadata`/`BggClient`-ის წესი) — ხელით შევსება ყოველთვის ოპციაა.
     */
    private function get(string $url, array $query = []): ?Response
    {
        try {
            $res = $this->http()->get($url, $query);
        } catch (Throwable $e) {
            $this->failed = true;

            return SourceLog::threw('openlibrary', $e, ['url' => $url]);
        }

        // 5xx-იც წყაროს ჩავარდნაა და არა „ასეთი წიგნი არ არსებობს"
        $this->failed = $res->serverError();

        if (! $res->successful()) {
            SourceLog::status('openlibrary', $res->status(), $res->body(), ['url' => $url]);
        }

        return $res;
    }

    private function http()
    {
        return SourceLog::request(20)
            ->withHeaders(['User-Agent' => 'Mediary/1.0 (personal library)']);
    }

    /** ერთი გამოცემა ნაწარმოებიდან — გვერდები/ISBN/გამომცემელი მხოლოდ იქაა */
    private function firstEdition(string $workKey): ?array
    {
        $res = $this->get(self::BASE."{$workKey}/editions.json", ['limit' => 1]);

        if (! $res?->successful()) {
            return null;
        }

        $entry = ($res->json('entries') ?? [])[0] ?? null;

        return $entry ? $this->fromEdition($entry, null) : null;
    }

    /** @return array<string, mixed> */
    private function fromSearchDoc(array $doc): array
    {
        return [
            'key' => ltrim((string) ($doc['key'] ?? ''), '/'),
            'title' => $doc['title'] ?? null,
            'author' => ($doc['author_name'] ?? [])[0] ?? null,
            'year' => isset($doc['first_publish_year']) ? (int) $doc['first_publish_year'] : null,
            'isbn' => ($doc['isbn'] ?? [])[0] ?? null,
            'pages' => isset($doc['number_of_pages_median']) ? (int) $doc['number_of_pages_median'] : null,
            'publisher' => ($doc['publisher'] ?? [])[0] ?? null,
            'language' => $this->language(($doc['language'] ?? [])[0] ?? null),
            'cover_id' => isset($doc['cover_i']) ? (int) $doc['cover_i'] : null,
            'description' => null,
            'subjects' => array_slice($doc['subject'] ?? [], 0, 8),
        ];
    }

    /** @return array<string, mixed> */
    private function fromWork(array $work): array
    {
        return [
            'key' => ltrim((string) ($work['key'] ?? ''), '/'),
            'title' => $work['title'] ?? null,
            'author' => null,
            'year' => null,
            'isbn' => null,
            'pages' => null,
            'publisher' => null,
            'language' => null,
            'cover_id' => ($work['covers'] ?? [])[0] ?? null,
            'description' => $this->text($work['description'] ?? null),
            'subjects' => array_slice($work['subjects'] ?? [], 0, 8),
        ];
    }

    /** @return array<string, mixed> */
    private function fromEdition(array $edition, ?string $isbn): array
    {
        $year = null;
        if (preg_match('/\d{4}/', (string) ($edition['publish_date'] ?? ''), $m)) {
            $year = (int) $m[0];
        }

        return [
            'key' => ltrim((string) ($edition['key'] ?? ''), '/'),
            'title' => $edition['title'] ?? null,
            'author' => null,   // გამოცემაზე ავტორი მხოლოდ ბმულია — ცალკე რექვესთი ღირს
            'year' => $year,
            'isbn' => $isbn
                ?: (($edition['isbn_13'] ?? [])[0] ?? (($edition['isbn_10'] ?? [])[0] ?? null)),
            'pages' => isset($edition['number_of_pages']) ? (int) $edition['number_of_pages'] : null,
            'publisher' => ($edition['publishers'] ?? [])[0] ?? null,
            'language' => $this->language(($edition['languages'] ?? [])[0]['key'] ?? null),
            'cover_id' => ($edition['covers'] ?? [])[0] ?? null,
            'description' => $this->text($edition['description'] ?? null),
            'subjects' => array_slice($edition['subjects'] ?? [], 0, 8),
        ];
    }

    /** Open Library-ს ტექსტი ხან სტრიქონია, ხან `{type, value}` */
    private function text(mixed $value): ?string
    {
        if (is_array($value)) {
            $value = $value['value'] ?? null;
        }

        return is_string($value) && $value !== '' ? $value : null;
    }

    /** `/languages/geo` → `ka` (ISO 639-2 → 639-1, მხოლოდ ის, რაც გვხვდება) */
    private function language(?string $value): ?string
    {
        if (! $value) {
            return null;
        }

        $code = strtolower(basename($value));

        return match ($code) {
            'geo', 'kat', 'ka' => 'ka',
            'eng', 'en' => 'en',
            'rus', 'ru' => 'ru',
            'ger', 'deu', 'de' => 'de',
            'fre', 'fra', 'fr' => 'fr',
            default => mb_substr($code, 0, 10),
        };
    }
}
