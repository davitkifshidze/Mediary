<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * **მომხმარებლის მოწოდებული URL-ის უსაფრთხო ჩამოტვირთვა** (აუდიტი 2026-09-14, §A2/§A3).
 *
 * პროექტში ორი ადგილია, სადაც სერვერი **მომხმარებლის ნაკარნახევ** მისამართს
 * თვითონ ხსნის: ბუკმარკის მეტამონაცემი (`LinkMetadata`) და ვებიდან ნაპოვნი
 * ფოტოს ჩამოტვირთვა (`WebImageImporter`). ორივეს ორი ერთი და იგივე ხარვეზი
 * ჰქონდა, და სწორედ ამიტომ არის ეს **ერთი** კლასი და არა ორი შესწორება:
 *
 * ⚠️ **SSRF.** `'url'` ვალიდაცია `http://127.0.0.1:3306`-ს ან
 * `http://169.254.169.254/`-ს (cloud-ის მეტამონაცემები) სრულიად თავისუფლად
 * უშვებდა, redirect-ები კი ჩართული იყო — ე.ი. სერვერი შიდა ქსელის
 * სკანერად გამოდგებოდა. „ვიპოვე" და „ვერ ვიპოვე" სხვადასხვა პასუხია,
 * ე.ი. დახურული პორტი ღიასგან გასარჩევი იყო.
 *
 * ⚠️ **ზომის ჭერი ტყუილი იყო.** ორივე ადგილას `$res->body()` მთელ პასუხს
 * **უკვე** მეხსიერებაში კითხულობდა და ჭერი ამის **შემდეგ** მოწმდებოდა.
 * `LinkMetadata`-ის დოკბლოკი კი ამტკიცებდა, რომ „ერთი უზარმაზარი გვერდი
 * `artisan serve`-ს არ დაბლოკავს" — კოდი ამას არ აკეთებდა.
 *
 * სამი გადაწყვეტილება, რომელიც ადვილი დასარღვევია:
 *
 * ⚠️ **redirect-ებს **ხელით** ვყვებით** (`allow_redirects => false` + ციკლი).
 * Guzzle-ის ავტომატური გაყოლა ნიშნავდა, რომ **მხოლოდ პირველი** ჰოსტი
 * შემოწმდებოდა და `example.com/r` → `127.0.0.1` მთელ დაცვას გვერდს აუვლიდა.
 * ხელით ციკლი თითოეულ ნახტომს ერთსა და იმავე ფილტრში ატარებს.
 *
 * ⚠️ **IP მიბმულია (`CURLOPT_RESOLVE`)** და არა მხოლოდ შემოწმებული.
 * შემოწმებასა და რექვესთს შორის DNS შეიძლება **სხვა** პასუხს დააბრუნებს
 * (DNS rebinding) — ე.ი. „შევამოწმე და მერე წავედი" თავისთავად ხვრელია.
 * TLS-ის სერტიფიკატი ჰოსტის სახელზე მაინც მოწმდება, ე.ი. მიბმა https-ს არ ტეხს.
 *
 * ⚠️ **სხეული ნაკადით იკითხება** და არა ერთი `body()`-ით: ჭერზე კითხვა
 * უბრალოდ **ჩერდება**. `Content-Length` ცალკე მოწმდება (თუ სერვერმა
 * მოგვცა), მაგრამ მასზე დაყრდნობა არ შეიძლება — ის შეიძლება არ იყოს
 * ან მტყუანი იყოს.
 *
 * ⚠️ **ლოკალური ქსელი გამორთვადია და არა მუდმივად აკრძალული**
 * (`SAFE_HTTP_ALLOW_PRIVATE=true`): პირად ინსტალაციაზე `192.168.x.x`-ზე
 * მდგარი გვერდის ჩაბუკმარკება ლეგიტიმურია. ნაგულისხმევი კი **უსაფრთხოა**,
 * და დაბლოკვა ლოგში ცხადად იწერება — თორემ „რატომ არ მუშაობს" უპასუხოდ
 * დარჩებოდა (იგივე წესი, რაც წყაროების ჩუმ ჩავარდნებს სჭირდება).
 */
class SafeHttp
{
    /** რამდენ redirect-ს ვყვებით — მეტი მარყუჟის ნიშანია */
    public const MAX_REDIRECTS = 4;

    /** ერთი წაკითხვის ნაჭერი ნაკადიდან */
    private const CHUNK = 16384;

    /**
     * ⚠️ მხოლოდ ეს ორი სქემა. `file://`, `gopher://`, `ftp://` და დანარჩენი
     * curl-ის პროტოკოლები აქ არაფერს აკეთებს, ლოკალურ ფაილს კი კითხულობს.
     */
    private const SCHEMES = ['http', 'https'];

    /**
     * ჩამოტვირთვა ჭერით. **ჩავარდნა ნორმალური შედეგია** — გამომძახებლები
     * ცარიელ პასუხს აბრუნებენ და არა 5xx-ს (`LinkMetadata`-ის არსებული წესი).
     *
     * @param  array<string, string>  $headers
     * @return array{body: string, mime: ?string, status: int, url: string, truncated: bool}|null
     */
    public function fetch(string $url, int $maxBytes, array $headers = [], int $timeout = 15): ?array
    {
        $current = $url;

        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            $target = $this->resolve($current);

            if ($target === null) {
                return null;
            }

            try {
                $res = Http::timeout($timeout)
                    ->withHeaders($headers)
                    ->withOptions([
                        // ⚠️ Windows-ის cURL-ს CA bundle არ აქვს (პროექტის არსებული წესი)
                        'verify' => storage_path('cacert.pem'),
                        // ⚠️ ნახტომებს თვითონ ვყვებით — იხ. კლასის შენიშვნა
                        'allow_redirects' => false,
                        // ⚠️ სხეული ნაკადად რჩება და მეხსიერებაში არ ჩამოიღვრება
                        'stream' => true,
                        // ⚠️ DNS მიბმულია შემოწმებულ მისამართზე (rebinding)
                        'curl' => [CURLOPT_RESOLVE => [$target['resolve']]],
                    ])
                    ->get($target['url']);
            } catch (Throwable) {
                return null;
            }

            $status = $res->status();

            if ($status >= 300 && $status < 400) {
                $location = $res->header('Location');

                if ($location === '' || $location === null) {
                    return null;
                }

                // ფარდობითი Location — ბოლო მისამართს ვეყრდნობით
                $current = $this->absolute($target['url'], $location);

                continue;
            }

            if ($status < 200 || $status >= 300) {
                return null;
            }

            $body = $this->read($res, $maxBytes);

            if ($body === null) {
                return null;
            }

            return [
                'body' => $body['body'],
                'mime' => $this->mime($res->header('Content-Type')),
                'status' => $status,
                // ⚠️ **საბოლოო** მისამართი და არა საწყისი: ფარდობითი ბმულების
                // (og:image, favicon) გაშლა სწორედ მისგან უნდა ხდებოდეს
                'url' => $target['url'],
                'truncated' => $body['truncated'],
            ];
        }

        return null;
    }

    /** URL ვარგისია და მისამართი დაშვებულია? (ვალიდაციისთვის — ჩამოტვირთვის გარეშე) */
    public function allowed(string $url): bool
    {
        return $this->resolve($url) !== null;
    }

    /* ---------- შიგნეული ---------- */

    /**
     * URL → სქემის/ჰოსტის შემოწმება + DNS + IP-ის ფილტრი.
     *
     * @return array{url: string, resolve: string}|null
     */
    private function resolve(string $url): ?array
    {
        $parts = parse_url($url);

        if (! is_array($parts)) {
            return null;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = (string) ($parts['host'] ?? '');

        if (! in_array($scheme, self::SCHEMES, true) || $host === '') {
            return $this->blocked($url, 'scheme_or_host');
        }

        // ⚠️ **`user:pass@` არ დაიშვება**: `http://evil.com@127.0.0.1/` ადამიანს
        // ერთ ჰოსტს აჩვენებს და სხვას ხსნის — კლასიკური შენიღბვა
        if (isset($parts['user']) || isset($parts['pass'])) {
            return $this->blocked($url, 'userinfo');
        }

        $port = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));

        $ips = $this->addresses($host);

        if ($ips === []) {
            return $this->blocked($url, 'dns');
        }

        /* ⚠️ **ყველა მისამართი უნდა იყოს დაშვებული და არა ერთი.** ჰოსტს
           შეიძლება ორივე ჰქონდეს — საჯაროც და 127.0.0.1-იც; „ერთი კარგი
           საკმარისია" ზუსტად იმას ნიშნავდა, რომ curl-ს მეორე შეერჩია. */
        foreach ($ips as $ip) {
            if (! $this->addressAllowed($ip)) {
                return $this->blocked($url, 'private_address:'.$ip);
            }
        }

        // IPv4-ს უპირატესობა აქვს — `CURLOPT_RESOLVE` მასზე ყველგან ერთნაირად მუშაობს
        $pinned = $this->preferIpv4($ips);

        return [
            'url' => $url,
            'resolve' => "{$host}:{$port}:{$pinned}",
        ];
    }

    /**
     * ჰოსტის მისამართები. IP-ლიტერალი თვითონვე პასუხია.
     *
     * @return list<string>
     */
    private function addresses(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [$host];
        }

        // IPv6 ლიტერალი კვადრატულ ფრჩხილებში
        $unwrapped = trim($host, '[]');
        if ($host !== $unwrapped && filter_var($unwrapped, FILTER_VALIDATE_IP)) {
            return [$unwrapped];
        }

        $ips = @gethostbynamel($host) ?: [];

        try {
            foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $row) {
                if (! empty($row['ipv6'])) {
                    $ips[] = $row['ipv6'];
                }
            }
        } catch (Throwable) {
            // AAAA-ს წაკითხვა ზოგ სისტემაზე ვერ ხერხდება — IPv4-ის პასუხი საკმარისია
        }

        return array_values(array_unique($ips));
    }

    /**
     * ⚠️ **PHP-ის საკუთარი ფილტრი და არა ხელით დაწერილი დიაპაზონები.**
     * `NO_PRIV_RANGE` ფარავს 10/8-ს, 172.16/12-ს, 192.168/16-ს და `fc00::/7`-ს,
     * `NO_RES_RANGE` კი 127/8-ს, 169.254/16-ს (cloud-ის მეტამონაცემები),
     * 0/8-ს, 240/4-ს, `::1`-ს და `fe80::/10`-ს. ხელით სია ერთ დიაპაზონს
     * აუცილებლად გამოტოვებდა.
     */
    private function addressAllowed(string $ip): bool
    {
        if (config('mediary.safe_http.allow_private')) {
            return (bool) filter_var($ip, FILTER_VALIDATE_IP);
        }

        return (bool) filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        );
    }

    /** @param  list<string>  $ips */
    private function preferIpv4(array $ips): string
    {
        foreach ($ips as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                return $ip;
            }
        }

        return $ips[0];
    }

    /**
     * სხეულის წაკითხვა **ჭერამდე**: ნაკადს ვკითხულობთ ნაჭრებად და ლიმიტზე
     * ვჩერდებით. ეს არის ის, რასაც ორივე გამომძახებლის კომენტარი ჰპირდებოდა
     * და არცერთი არ აკეთებდა.
     *
     * @return array{body: string, truncated: bool}|null
     */
    private function read($res, int $maxBytes): ?array
    {
        // სერვერმა თუ ცხადად თქვა, რომ დიდია — არც დავიწყოთ
        $declared = (int) $res->header('Content-Length');
        if ($declared > 0 && $declared > $maxBytes) {
            return null;
        }

        try {
            $stream = $res->toPsrResponse()->getBody();

            /* ⚠️ **გადახვევა აუცილებელია.** ძველი კოდი `body()`-ს იძახებდა,
               რომელიც შიგნიდან თვითონ ახვევდა ნაკადს — ე.ი. მისი ხელით
               კითხვისას ეს ვალდებულება ჩვენზე გადმოვიდა. ნამდვილ პასუხზე
               ეს არაფერს აკეთებს (მაჩვენებელი ისედაც ნულზეა), `Http::fake()`
               კი **ერთსა და იმავე** ობიექტს აბრუნებს ყოველ გამოძახებაზე —
               გადახვევის გარეშე მეორე სურათი ცარიელი მოდიოდა. */
            if ($stream->isSeekable()) {
                $stream->rewind();
            }

            $body = '';

            while (! $stream->eof() && strlen($body) < $maxBytes) {
                $chunk = $stream->read(min(self::CHUNK, $maxBytes - strlen($body) + 1));

                if ($chunk === '') {
                    break;
                }

                $body .= $chunk;
            }

            // ⚠️ **ერთი ბაიტით მეტს განზრახ ვკითხულობთ**: ასე ვიგებთ, შეწყდა
            // თუ დასრულდა. ესკიზისთვის ეს სხვაობა მნიშვნელოვანია — მოჭრილი
            // სურათი გატეხილი ფაილია და შენახვა არ შეიძლება.
            $truncated = strlen($body) > $maxBytes;

            /* ⚠️ **`close()` განზრახ არ იძახება.** ნაკადს Guzzle თვითონ ხურავს
               დესტრუქტორში, `fetch()`-ის დასრულებისთანავე — ჩვენ კი ცოცხალი
               ობიექტის დახურვა `Http::fake()`-ს (რომელიც ერთ პასუხს იზიარებს)
               მომდევნო გამოძახებისთვის გამოუსადეგარს გახდიდა. */

            return ['body' => substr($body, 0, $maxBytes), 'truncated' => $truncated];
        } catch (Throwable) {
            return null;
        }
    }

    /** ფარდობითი `Location` → აბსოლუტური */
    private function absolute(string $base, string $location): string
    {
        if (preg_match('~^https?://~i', $location)) {
            return $location;
        }

        $parts = parse_url($base);
        $root = ($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? '')
            .(isset($parts['port']) ? ':'.$parts['port'] : '');

        if (str_starts_with($location, '/')) {
            return $root.$location;
        }

        $path = $parts['path'] ?? '/';

        return $root.rtrim(substr($path, 0, (int) strrpos($path, '/') + 1), '/').'/'.$location;
    }

    private function mime(?string $header): ?string
    {
        if (! $header) {
            return null;
        }

        return strtolower(trim(explode(';', $header)[0])) ?: null;
    }

    /**
     * ⚠️ **დაბლოკვა ლოგში იწერება.** ეს ერთადერთი გზაა იმის გასაგებად,
     * რატომ „არ მუშაობს" ლოკალური ქსელის ბმული — ჩუმი `null` მომხმარებელს
     * ცარიელ ფორმას აჩვენებდა ყოველგვარი მინიშნების გარეშე.
     */
    private function blocked(string $url, string $reason): ?array
    {
        Log::warning('safe-http blocked', ['url' => mb_substr($url, 0, 300), 'reason' => $reason]);

        return null;
    }
}
