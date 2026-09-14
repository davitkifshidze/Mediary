<?php

namespace App\Services\BoardGames;

use Illuminate\Support\Facades\Http;
use SimpleXMLElement;
use Throwable;

/**
 * BoardGameGeek XML API 2 — ბორდგეიმების გამამდიდრებელი წყარო (Tasks §14).
 *
 * უფასოა და კლავიშს **არ ითხოვს** (როგორც Open Library წიგნებზე), ე.ი.
 * `.env`-ში არაფერი ემატება.
 *
 * ⚠️ **პასუხი XML-ია და არა JSON** — ერთადერთი ასეთი წყარო პროექტში.
 * პარსინგი `SimpleXML`-ითაა და **მთლიანად try/catch-შია**: გატეხილი XML
 * (BGG ხანდახან HTML-ის შეცდომას აბრუნებს) ჩვეულებრივი „ვერაფერი ვიპოვე"
 * უნდა იყოს და არა 500.
 *
 * ⚠️ **2026-09-04-ის მდგომარეობით BGG ამ მანქანიდან მიუწვდომელია:**
 * `boardgamegeek.com` Cloudflare-ის bot-challenge-ს („Just a moment…") აბრუნებს
 * 403-ით, XML API კი 401-ით — ე.ი. სერვერიდან გაკეთებული რექვესთი არ გადის.
 * ამიტომ „ვერაფერი ვიპოვე" და „წყარო მიუწვდომელია" **ცალ-ცალკეა** (`blocked()`):
 * ცარიელი სია ჩუმად რომ არ ეთარგმნა user-ს „ასეთი თამაში არ არსებობს"-ად.
 *
 * ⚠️ **`/search` მხოლოდ სახელს იძლევა.** ყველა დანარჩენი (მოთამაშეები,
 * სირთულე, რეიტინგი, ფოტო) `/thing?stats=1`-ზეა, ამიტომ სიაში ერთი
 * `/thing` გამოძახებით ვამდიდრებთ პირველ რამდენიმეს — თორემ არჩევანის
 * სიაში მხოლოდ სათაურები იქნებოდა და ერთნაირსახელიანებს ვერ გაარჩევდი.
 */
class BggClient
{
    private const BASE = 'https://boardgamegeek.com/xmlapi2';

    /** რამდენ კანდიდატს გავამდიდროთ დეტალებით — ერთი `/thing` რექვესთი */
    private const ENRICH = 8;

    /** ბოლო რექვესთის სტატუსი; `0` = ქსელის შეცდომა, `null` = ჯერ არ გვიცდია */
    private ?int $lastStatus = null;

    /** კლავიშს არ ითხოვს — ინტერფეისს კითხვა მაინც აქვს (TMDB-ის სიმეტრიით) */
    public function configured(): bool
    {
        return true;
    }

    /**
     * ბოლო რექვესთი **დაბლოკილი** იყო (და არა უბრალოდ უშედეგო).
     * 401/403 = Cloudflare-ის challenge, 429 = რეიტ-ლიმიტი, 0 = ქსელი.
     */
    public function blocked(): bool
    {
        return in_array($this->lastStatus, [0, 401, 403, 429, 503], true);
    }

    /**
     * სახელით ძებნა → არჩევანის სია. ავტომატურად არაფერს ვამთხვევთ:
     * BGG-ში ერთი და იმავე თამაშის ათი გამოცემაა.
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $query, int $limit = 10): array
    {
        $xml = $this->get('/search', ['query' => $query, 'type' => 'boardgame']);

        if (! $xml) {
            return [];
        }

        $ids = [];
        foreach ($xml->item ?? [] as $item) {
            $ids[] = (int) $item['id'];
            if (count($ids) >= max(1, min($limit, 25))) {
                break;
            }
        }

        if (! $ids) {
            return [];
        }

        // დეტალები ერთი რექვესთით — თითოზე ცალკე გამოძახება BGG-ს რეიტ-ლიმიტში ჩაგვაგდებდა
        $details = $this->things(array_slice($ids, 0, self::ENRICH));

        return array_values(array_map(
            fn (int $id) => $details[$id] ?? ['bgg_id' => $id, 'title' => null],
            $ids,
        ));
    }

    /** ერთი თამაშის სრული დრაფტი */
    public function details(int $bggId): ?array
    {
        return $this->things([$bggId])[$bggId] ?? null;
    }

    /** ფოტოს ბაიტები — ჩაწერის გარეშე (`MediaDownloader::contents()`-ის ანალოგი) */
    public function image(string $url): ?string
    {
        if (! preg_match('#^https?://#i', $url)) {
            return null;
        }

        try {
            $res = Http::timeout(20)
                // ⚠️ Windows-ის cURL-ს CA bundle არ აქვს (იხ. CLAUDE.md)
                ->withOptions(['verify' => storage_path('cacert.pem')])
                ->get($url);
        } catch (Throwable) {
            return null;
        }

        return $res->successful() && strlen($res->body()) > 1000 ? $res->body() : null;
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * `/thing?id=1,2,3&stats=1` — რამდენიმე თამაში ერთ რექვესთში.
     *
     * @return array<int, array<string, mixed>>
     */
    private function things(array $ids): array
    {
        if (! $ids) {
            return [];
        }

        $xml = $this->get('/thing', ['id' => implode(',', $ids), 'stats' => 1]);

        if (! $xml) {
            return [];
        }

        $out = [];
        foreach ($xml->item ?? [] as $item) {
            $draft = $this->fromItem($item);
            $out[$draft['bgg_id']] = $draft;
        }

        return $out;
    }

    private function get(string $path, array $query): ?SimpleXMLElement
    {
        try {
            $res = Http::timeout(25)
                ->withOptions(['verify' => storage_path('cacert.pem')])
                ->withHeaders(['User-Agent' => 'Mediary/1.0 (personal library)'])
                ->get(self::BASE.$path, $query);

            $this->lastStatus = $res->status();

            if (! $res->successful()) {
                return null;
            }

            // ⚠️ libxml-ის შეცდომები გლობალურია — ვთიშავთ, რომ warning არ გაჟონოს
            $previous = libxml_use_internal_errors(true);
            $xml = simplexml_load_string($res->body());
            libxml_clear_errors();
            libxml_use_internal_errors($previous);

            return $xml ?: null;
        } catch (Throwable) {
            $this->lastStatus = 0;

            return null;
        }
    }

    /** @return array<string, mixed> */
    private function fromItem(SimpleXMLElement $item): array
    {
        $stats = $item->statistics->ratings ?? null;

        return [
            'bgg_id' => (int) $item['id'],
            'title' => $this->primaryName($item),
            'description' => $this->description($item),
            'year' => $this->attr($item->yearpublished ?? null),
            'players_min' => $this->attr($item->minplayers ?? null),
            'players_max' => $this->attr($item->maxplayers ?? null),
            'age_min' => $this->attr($item->minage ?? null),
            'playtime_min' => $this->attr($item->minplaytime ?? null),
            'playtime_max' => $this->attr($item->maxplaytime ?? null),
            'complexity' => $stats ? $this->round($this->attr($stats->averageweight ?? null, true), 2) : null,
            'bgg_rating' => $stats ? $this->round($this->attr($stats->average ?? null, true), 1) : null,
            'image_url' => isset($item->image) ? (string) $item->image : null,
            // BGG-ის „link" ერთ კვანძში აერთიანებს კატეგორიას, დიზაინერს…
            'genre' => $this->links($item, 'boardgamecategory')[0] ?? null,
            'designer' => $this->links($item, 'boardgamedesigner')[0] ?? null,
            'publisher' => $this->links($item, 'boardgamepublisher')[0] ?? null,
        ];
    }

    /** BGG რამდენიმე სახელს აბრუნებს; `type="primary"` ერთია */
    private function primaryName(SimpleXMLElement $item): ?string
    {
        $fallback = null;

        foreach ($item->name ?? [] as $name) {
            $value = (string) $name['value'];
            if ((string) $name['type'] === 'primary') {
                return $value;
            }
            $fallback ??= $value;
        }

        return $fallback;
    }

    /** აღწერაში HTML-ის entity-ები და `<br/>`-ებია — ტექსტად ვაქცევთ */
    private function description(SimpleXMLElement $item): ?string
    {
        if (! isset($item->description)) {
            return null;
        }

        $text = html_entity_decode((string) $item->description, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim(preg_replace('/\n{3,}/', "\n\n", strip_tags($text)) ?? '');

        return $text !== '' ? mb_substr($text, 0, 20000) : null;
    }

    /** @return array<int, string> */
    private function links(SimpleXMLElement $item, string $type): array
    {
        $out = [];

        foreach ($item->link ?? [] as $link) {
            if ((string) $link['type'] === $type) {
                $out[] = (string) $link['value'];
            }
        }

        return $out;
    }

    private function attr(?SimpleXMLElement $node, bool $float = false): int|float|null
    {
        if (! $node || ! isset($node['value'])) {
            return null;
        }

        $value = (string) $node['value'];

        if ($value === '' || ! is_numeric($value)) {
            return null;
        }

        return $float ? (float) $value : (int) $value;
    }

    private function round(int|float|null $value, int $precision): ?float
    {
        return $value === null || $value <= 0 ? null : round((float) $value, $precision);
    }
}
