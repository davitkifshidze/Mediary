<?php

namespace App\Services\BoardGames;

use App\Support\SafeHttp;
use App\Support\SourceLog;
use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * ქართული ბორდგეიმ-მაღაზიები — corners.ge და puzz.ge (Tasks §7.2).
 *
 * ⚠️ **ეს სქრეიპინგია და არა API.** არც ერთ მაღაზიას საძიებო API არ აქვს,
 * ე.ი. ერთადერთი წყარო თვითონ საძიებო გვერდის მარკაპია. აქედან ორი წესი
 * გამომდინარეობს და ორივე ამ ფაილშივე სრულდება:
 *
 * 1. **მარკაპის ცვლილება ჩუმად უნდა ჩავარდეს.** ვერ ვიპოვეთ ფასი → `price: null`
 *    („ფასი უცნობია"), ვერ გავხსენით გვერდი → `ok: false` ამ მაღაზიაზე. არც
 *    ერთი შემთხვევა 500 არაა — მაღაზიის გაფუჭება user-ის ჩანაწერის დამატებას
 *    ვერ შეაჩერებს (იგივე წესი, რაც `LinkMetadata`-ს და `BggClient`-ს აქვს).
 * 2. **„ვერაფერი ვიპოვე" და „მაღაზია მიუწვდომელია" ორი სხვადასხვა
 *    მდგომარეობაა** — ამიტომ პასუხში `sources[]` ცალკე წერს თითო მაღაზიის
 *    `ok`/`count`-ს და ცარიელი სია ჩუმად „ასეთი თამაში არ იყიდება"-დ არ
 *    ითარგმნება (`bgg_unavailable`-ის ზუსტი პრეცედენტი).
 *
 * ⚠️ **HTML არასდროს ინახება** (`VideoUrl`-ის წესი) — პასუხიდან მხოლოდ
 * ტექსტური ველები და URL-ები გამოდის, მარკაპი რექვესთთან ერთად ქრება.
 *
 * ⚠️ **ფასი ჩანაწერს არ ეკუთვნის, მაღაზიის ბმულს ეკუთვნის** — ამიტომ ერთეული
 * `board_games.links[]`-ის ფორმაზეა (`label`/`url`/`price`/`currency`) და არა
 * ჩანაწერის სვეტზე: ორი მაღაზია ერთ სვეტში ვერ ჩაეტევა.
 */
class GeorgianShops
{
    /**
     * მაღაზიები. ⚠️ **სულ ეს ორი (ჯერჯერობით)** — §7.2-ის პირდაპირი მითითება.
     * მესამის დამატება ერთი რიგია აქ + ერთი `parse<Shop>()` მეთოდი.
     *
     * @var array<string, array{name: string, base: string, search: string}>
     */
    public const SHOPS = [
        'corners' => [
            'name' => 'Corners',
            'base' => 'https://corners.ge',
            'search' => 'https://corners.ge/?post_type=product&s={query}',
        ],
        'puzz' => [
            'name' => 'Puzz',
            'base' => 'https://puzz.ge',
            'search' => 'https://puzz.ge/index.php?route=product/search&search={query}&description=true',
        ],
    ];

    /** თითო მაღაზიიდან რამდენი შედეგი — არჩევანის სია და არა კატალოგი */
    private const LIMIT = 8;

    /**
     * პასუხის ჭერი. საძიებო გვერდი ~0.5 MB-ია; ამაზე დიდი მთელ HTML-ს
     * მეხსიერებაში აიღებდა და `php artisan serve`-ს (ერთი რექვესთი ერთდროულად)
     * დაბლოკავდა.
     *
     * ⚠️ **2026-09-19-მდე ეს ჭერი ტყუილი იყო** (Tasks DEBT-23): `$res->body()`
     * მთელ პასუხს **უკვე** მეხსიერებაში კითხულობდა და `substr()` მხოლოდ
     * ამის შემდეგ ჭრიდა — ზუსტად ის, რაც `LinkMetadata`-ზე §A3-ში გასწორდა.
     * ახლა კითხვა ნაკადურია (`SafeHttp::readCapped()`).
     */
    private const MAX_BYTES = 2_000_000;

    /**
     * ერთი და იმავე შეკითხვის პასუხი. კვოტა აქ არ იხარჯება (უფასო სქრეიპინგია),
     * მაგრამ ფორმის რედაქტირებისას ერთი და იგივე სახელი რამდენჯერმე იძებნება —
     * ქეში მაღაზიას ზედმეტი დარტყმისგან იცავს. ⚠️ **ჩავარდნა არ ქეშირდება**,
     * თორემ ერთი წამიერი ქსელის შეცდომა 15 წუთით „მიუწვდომელს" დააფიქსირებდა.
     */
    private const CACHE_MINUTES = 15;

    /**
     * ძებნა მაღაზიებში.
     *
     * @param  list<string>  $only  მხოლოდ ეს მაღაზიები (ცარიელი = ყველა)
     * @return array{offers: list<array<string, mixed>>, sources: list<array<string, mixed>>}
     */
    public function search(string $query, array $only = []): array
    {
        $query = trim($query);
        $keys = array_values(array_filter(
            array_keys(self::SHOPS),
            fn (string $key) => ! $only || in_array($key, $only, true),
        ));

        $offers = [];
        $sources = [];

        foreach ($keys as $key) {
            $shop = self::SHOPS[$key];
            $url = str_replace('{query}', rawurlencode($query), $shop['search']);
            $html = $query === '' ? null : $this->fetch($url);

            $found = $html === null ? [] : $this->parse($key, $html);

            foreach ($found as $offer) {
                $offers[] = $offer;
            }

            $sources[] = [
                'key' => $key,
                'name' => $shop['name'],
                'url' => $url,
                // ⚠️ `ok: false` = გვერდი არ გაიხსნა; `ok: true, count: 0` = ვერაფერი ვიპოვეთ
                'ok' => $html !== null,
                'count' => count($found),
            ];
        }

        return ['offers' => $offers, 'sources' => $sources];
    }

    /* ---------- ქსელი ---------- */

    /** გვერდის HTML, ან `null` თუ არ გაიხსნა (ჩუმი ჩავარდნა) */
    private function fetch(string $url): ?string
    {
        $cached = Cache::get($this->cacheKey($url));

        if (is_string($cached)) {
            return $cached;
        }

        try {
            // ⚠️ `stream => true` — სხეული ნაკადად რჩება და `readCapped()` მას
            // ჭერზე წყვეტს; ამის გარეშე Guzzle მთელს ისედაც ჩამოიღვრიდა
            $res = SourceLog::request(20, ['allow_redirects' => true, 'stream' => true])
                // ბოტად აღქმული რექვესთი 403-ს იღებს; ბრაუზერული UA ამას ხსნის
                ->withHeaders([
                    'User-Agent' => 'Mozilla/5.0 (compatible; Mediary/1.0; +personal library)',
                    'Accept' => 'text/html,application/xhtml+xml',
                ])
                ->get($url);
        } catch (Throwable $e) {
            return SourceLog::threw('shops', $e, ['url' => $url]);
        }

        if (! $res->successful()) {
            return SourceLog::status('shops', $res->status(), '', ['url' => $url]);
        }

        /* ⚠️ **SSRF-ის ფენა (DNS + IP-ის მიბმა) აქ არ გვჭირდება** — ჰოსტები
           ფიქსირებულია (`SHOPS`) და მომხმარებელი მათ ვერ კარნახობს; საჭიროა
           მხოლოდ ნაკადური ჭერი, ამიტომ `SafeHttp::fetch()`-ის ნაცვლად მისი
           **ეს** ნაწილი გამოიყენება. სრული `fetch()` ტესტებს ქსელზეც
           დამოკიდებულს გახდიდა (`Http::fake()` DNS-ს არ ცვლის). */
        $read = SafeHttp::readCapped($res, self::MAX_BYTES);

        if ($read === null) {
            return SourceLog::failed('shops', 'body_unreadable', ['url' => $url]);
        }

        $html = $read['body'];

        Cache::put($this->cacheKey($url), $html, now()->addMinutes(self::CACHE_MINUTES));

        return $html;
    }

    private function cacheKey(string $url): string
    {
        return 'ge_shops:'.sha1($url);
    }

    /* ---------- პარსინგი ---------- */

    /** @return list<array<string, mixed>> */
    private function parse(string $shop, string $html): array
    {
        $xpath = $this->xpath($html);

        if (! $xpath) {
            return [];
        }

        // ერთეულის კონტეინერი — WooCommerce-ზე `li.product`, OpenCart-ზე `div.product-layout`
        $selector = $shop === 'corners'
            ? $this->hasClass('product')
            : $this->hasClass('product-layout');

        $out = [];

        foreach ($xpath->query("//*[{$selector}]") ?: [] as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            $offer = $shop === 'corners'
                ? $this->corners($xpath, $node)
                : $this->puzz($xpath, $node);

            // ბმულისა და სახელის გარეშე ერთეული უსარგებლოა (და სავარაუდოდ სხვა ბლოკია)
            if (! $offer || ! $offer['url'] || ! $offer['title']) {
                continue;
            }

            $out[] = $offer + [
                'shop' => $shop,
                'shop_name' => self::SHOPS[$shop]['name'],
            ];

            if (count($out) >= self::LIMIT) {
                break;
            }
        }

        return $out;
    }

    /**
     * corners.ge — WooCommerce.
     *
     * ფასი: `.price` → ფასდაკლებისას `<del>` ძველი / `<ins>` ახალი, ორივე
     * `.woocommerce-Price-amount bdi`-ში, ვალუტა `.woocommerce-Price-currencySymbol`-ში.
     * ⚠️ სიაში ეს `span.price`-ია, ერთი პროდუქტის გვერდზე `p.price` — ამიტომ
     * სელექტორი **კლასზეა** და არა ტეგზე.
     *
     * @return array<string, mixed>|null
     */
    private function corners(DOMXPath $xpath, DOMElement $node): ?array
    {
        $link = $this->first($xpath, ".//a[{$this->hasClass('woocommerce-LoopProduct-link')}]", $node)
            ?? $this->first($xpath, './/a[@href]', $node);

        $price = $this->first($xpath, ".//*[{$this->hasClass('price')}]", $node);
        $new = $price ? $this->first($xpath, './/ins', $price) : null;
        $old = $price ? $this->first($xpath, './/del', $price) : null;

        return [
            'title' => $this->text($this->first($xpath, ".//*[{$this->hasClass('woocommerce-loop-product__title')}]", $node))
                ?? $this->text($this->first($xpath, './/h2|.//h3', $node)),
            'url' => $this->attr($link, 'href'),
            'image' => $this->image($xpath, $node),
            'price' => $this->money($this->text($new ?? $price)),
            'old_price' => $this->money($this->text($old)),
            'currency' => $this->currency($this->text($price)),
            'in_stock' => $this->stock($node, 'outofstock', 'instock'),
        ];
    }

    /**
     * puzz.ge — OpenCart.
     *
     * ⚠️ **ნამდვილი მარკაპი §7.2-ში აღწერილისგან განსხვავდება** (გადამოწმებულია
     * 2026-09-11): სიაში `div.price` → `span.price-normal`, ფასდაკლებით
     * `span.price-new` + `span.price-old`; `.product-price-*` ერთი პროდუქტის
     * გვერდის კლასებია. **ორივე ნაკრები მიიღება** — ერთი მათგანის გაქრობა
     * მეორეს არ უნდა წაიღოს.
     *
     * @return array<string, mixed>|null
     */
    private function puzz(DOMXPath $xpath, DOMElement $node): ?array
    {
        $name = $this->first($xpath, ".//*[{$this->hasClass('name')}]//a", $node)
            ?? $this->first($xpath, './/a[@href]', $node);

        $price = $this->first($xpath, ".//*[{$this->hasClass('price')}]", $node);
        $new = $price ? $this->firstOfClasses($xpath, $price, ['price-new', 'product-price-new']) : null;
        $old = $price ? $this->firstOfClasses($xpath, $price, ['price-old', 'product-price-old']) : null;
        $plain = $price ? $this->firstOfClasses($xpath, $price, ['price-normal', 'product-price']) : null;

        return [
            'title' => $this->text($name),
            'url' => $this->attr($name, 'href'),
            'image' => $this->image($xpath, $node),
            'price' => $this->money($this->text($new ?? $plain ?? $price)),
            'old_price' => $this->money($this->text($old)),
            'currency' => $this->currency($this->text($price)),
            'in_stock' => $this->stock($node, 'out-of-stock', 'in-stock'),
        ];
    }

    /* ---------- დამხმარეები ---------- */

    private function xpath(string $html): ?DOMXPath
    {
        try {
            // ⚠️ libxml-ის შეცდომები გლობალურია — ვთიშავთ, რომ warning არ გაჟონოს
            // (`BggClient`-ის იგივე ხერხი). მაღაზიის HTML ყოველთვის „ბინძურია".
            $previous = libxml_use_internal_errors(true);
            $doc = new DOMDocument;
            $ok = $doc->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NOWARNING | LIBXML_NOERROR);
            libxml_clear_errors();
            libxml_use_internal_errors($previous);

            return $ok ? new DOMXPath($doc) : null;
        } catch (Throwable) {
            return null;
        }
    }

    /** `class`-ის ზუსტი სიტყვით შემოწმება — `contains(@class,'price')` „price-old"-საც დაიჭერდა */
    private function hasClass(string $class): string
    {
        return "contains(concat(' ', normalize-space(@class), ' '), ' {$class} ')";
    }

    /** პირველი კვანძი რამდენიმე კლასიდან — რომელიც ადრე მოიძებნა */
    private function firstOfClasses(DOMXPath $xpath, DOMNode $context, array $classes): ?DOMNode
    {
        foreach ($classes as $class) {
            if ($node = $this->first($xpath, ".//*[{$this->hasClass($class)}]", $context)) {
                return $node;
            }
        }

        return null;
    }

    private function first(DOMXPath $xpath, string $query, ?DOMNode $context = null): ?DOMNode
    {
        $found = $context ? $xpath->query($query, $context) : $xpath->query($query);

        return $found && $found->length ? $found->item(0) : null;
    }

    private function text(?DOMNode $node): ?string
    {
        if (! $node) {
            return null;
        }

        // &nbsp; ვიწრო სივრცეა და `trim()` მას ვერ ხედავს
        $text = trim(preg_replace('/\s+/u', ' ', str_replace("\u{a0}", ' ', $node->textContent)) ?? '');

        return $text !== '' ? mb_substr($text, 0, 255) : null;
    }

    private function attr(?DOMNode $node, string $name): ?string
    {
        if (! $node instanceof DOMElement) {
            return null;
        }

        $value = trim($node->getAttribute($name));

        return $value !== '' ? mb_substr($value, 0, 1000) : null;
    }

    /**
     * ფოტო. ⚠️ puzz.ge-ზე `src` base64 placeholder-ია და ნამდვილი URL
     * `data-src`-შია (lazyload) — ე.ი. `src`-ის პირდაპირ აღება ყველა ერთეულს
     * ერთსა და იმავე ნაცრისფერ კვადრატს მისცემდა.
     */
    private function image(DOMXPath $xpath, DOMElement $node): ?string
    {
        $img = $this->first($xpath, './/img', $node);

        foreach (['data-src', 'src', 'data-original'] as $attr) {
            $value = $this->attr($img, $attr);

            if ($value && ! str_starts_with($value, 'data:')) {
                return $value;
            }
        }

        return null;
    }

    /** „50.00 ₾" → `50.0`; ვერ ამოვიცანით → `null` („ფასი უცნობია") */
    private function money(?string $text): ?float
    {
        if (! $text || ! preg_match('/(\d[\d\s\x{a0}.,]*)/u', $text, $m)) {
            return null;
        }

        $raw = preg_replace('/[\s\x{a0}]/u', '', $m[1]) ?? '';

        // ათასების გამყოფი: „1,250.00" → „1250.00", „1.250,00" → „1250.00"
        if (preg_match('/[.,]\d{3}(?:[.,]|$)/', $raw)) {
            $raw = preg_replace('/[.,](?=\d{3}(?:[.,]|$))/', '', $raw) ?? $raw;
        }

        $raw = str_replace(',', '.', $raw);

        if (! is_numeric($raw)) {
            return null;
        }

        $value = round((float) $raw, 2);

        // 0.00 = ფასი გვერდზე არ წერია (corners.ge ამოწურულ საქონელს ასე ხატავს)
        return $value > 0 ? $value : null;
    }

    private function currency(?string $text): ?string
    {
        if (! $text) {
            return null;
        }

        return match (true) {
            str_contains($text, '₾'), str_contains($text, 'GEL'), str_contains($text, 'ლარ') => 'GEL',
            str_contains($text, '$'), str_contains($text, 'USD') => 'USD',
            str_contains($text, '€'), str_contains($text, 'EUR') => 'EUR',
            default => null,
        };
    }

    /** მარაგი — `null` ნიშნავს „არ წერია" და არა „არ არის" */
    private function stock(DOMElement $node, string $outClass, string $inClass): ?bool
    {
        $class = ' '.preg_replace('/\s+/', ' ', $node->getAttribute('class')).' ';

        return match (true) {
            str_contains($class, " {$outClass} ") => false,
            str_contains($class, " {$inClass} ") => true,
            default => null,
        };
    }
}
