<?php

namespace Tests\Feature;

use App\Support\SafeHttp;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **მომხმარებლის URL-ის უსაფრთხო ჩამოტვირთვა** (აუდიტი 2026-09-14, §A2/§A3).
 *
 * ⚠️ **ყველა მისამართი ლიტერალური IP-ია და ეს განზრახაა.** `SafeHttp` ჰოსტის
 * სახელს **ნამდვილად** ხსნის (DNS), ე.ი. `example.com`-ზე დაწერილი ტესტი
 * ქსელზე გახდებოდა დამოკიდებული — პროექტის ტესტები კი sqlite `:memory:`-ზეა
 * და ოფლაინაც უნდა გადიოდეს. `203.0.113.10` არის **RFC 5737**-ის საბუთების
 * დიაპაზონი: PHP-ის ფილტრი მას საჯაროდ თვლის, DNS კი საერთოდ არ ერევა.
 * `Http::fake()` რექვესთს ისედაც იჭერს და გარეთ არაფერი გადის.
 */
class SafeHttpTest extends TestCase
{
    private SafeHttp $http;

    protected function setUp(): void
    {
        parent::setUp();

        $this->http = new SafeHttp;
    }

    /* ================= §A2 — SSRF ================= */

    /**
     * **მთავარი წესი:** ლოკალური და დახურული ქსელი დაუშვებელია.
     *
     * ⚠️ `169.254.169.254` ცალკე იმსახურებს ხსენებას — ეს cloud-ის
     * მეტამონაცემების მისამართია და SSRF-ის კლასიკური სამიზნე.
     */
    public function test_private_and_reserved_addresses_are_blocked(): void
    {
        Http::fake();

        foreach ([
            'http://127.0.0.1/',
            'http://127.0.0.1:3306/',
            'http://localhost/',
            'http://10.0.0.1/',
            'http://192.168.1.1/admin',
            'http://172.16.0.5/',
            'http://169.254.169.254/latest/meta-data/',
            'http://[::1]/',
            'http://0.0.0.0/',
        ] as $url) {
            $this->assertNull($this->http->fetch($url, 1000), "დაუშვა: {$url}");
        }

        // ⚠️ **არცერთი რექვესთი არ გასულა** — შემოწმება ქსელამდეა და არა მის შემდეგ
        Http::assertNothingSent();
    }

    /** მხოლოდ `http`/`https` — `file://` ლოკალურ ფაილს კითხულობდა */
    public function test_only_http_schemes_are_allowed(): void
    {
        Http::fake();

        foreach ([
            'file:///etc/passwd',
            'file://C:/Windows/win.ini',
            'gopher://example.com/',
            'ftp://example.com/x',
            'not a url at all',
        ] as $url) {
            $this->assertNull($this->http->fetch($url, 1000), "დაუშვა: {$url}");
        }

        Http::assertNothingSent();
    }

    /**
     * ⚠️ `http://example.com@127.0.0.1/` ადამიანს **ერთ** ჰოსტს აჩვენებს და
     * სულ **სხვას** ხსნის — ე.ი. `user:pass@` ფორმა შენიღბვის საშუალებაა.
     */
    public function test_userinfo_in_the_url_is_rejected(): void
    {
        Http::fake();

        $this->assertNull($this->http->fetch('http://example.com@127.0.0.1/', 1000));
        $this->assertNull($this->http->fetch('http://user:pass@example.com/', 1000));

        Http::assertNothingSent();
    }

    /**
     * **redirect-ის ყოველი ნახტომი მოწმდება.**
     *
     * ⚠️ ეს არის ის, რის გამოც `allow_redirects` გამორთულია და ციკლი ხელითაა:
     * Guzzle-ის ავტომატური გაყოლისას **მხოლოდ პირველი** ჰოსტი შემოწმდებოდა
     * და `203.0.113.10` → `127.0.0.1` მთელ დაცვას გვერდს აუვლიდა.
     */
    public function test_a_redirect_into_the_private_network_is_blocked(): void
    {
        Http::fake([
            '203.0.113.10/*' => Http::response('', 302, ['Location' => 'http://127.0.0.1:3306/']),
            // თუ მეორე ნახტომი მაინც წავიდა, ეს პასუხი გაცემული იქნებოდა
            '127.0.0.1/*' => Http::response('secret', 200, ['Content-Type' => 'text/html']),
        ]);

        $this->assertNull($this->http->fetch('http://203.0.113.10/redirect', 1000));

        // პირველი გავიდა, მეორე — არა
        Http::assertSentCount(1);
    }

    /** ჩვეულებრივი redirect მუშაობს და **საბოლოო** მისამართს აბრუნებს */
    public function test_a_normal_redirect_is_followed(): void
    {
        Http::fake([
            '203.0.113.10/start' => Http::response('', 301, ['Location' => '/final']),
            '203.0.113.10/final' => Http::response('<html>ok</html>', 200, ['Content-Type' => 'text/html']),
        ]);

        $res = $this->http->fetch('http://203.0.113.10/start', 1000);

        $this->assertNotNull($res);
        $this->assertSame('<html>ok</html>', $res['body']);
        // ⚠️ ფარდობითი `og:image`-ის გასაშლელად სწორედ ეს მისამართია სწორი
        $this->assertSame('http://203.0.113.10/final', $res['url']);
    }

    /** მარყუჟი არ უნდა ჩამოეკიდოს — ნახტომებს ჭერი აქვს */
    public function test_a_redirect_loop_gives_up(): void
    {
        Http::fake([
            '203.0.113.10/*' => Http::response('', 302, ['Location' => 'http://203.0.113.10/loop']),
        ]);

        $this->assertNull($this->http->fetch('http://203.0.113.10/loop', 1000));

        Http::assertSentCount(SafeHttp::MAX_REDIRECTS + 1);
    }

    /* ================= §A3 — ზომის ჭერი ================= */

    /**
     * **ჭერზე კითხვა ჩერდება.** აქამდე `$res->body()` მთელ პასუხს კითხულობდა
     * და `substr()` მხოლოდ შემდეგ ჭრიდა — ე.ი. ჭერი არაფერს იცავდა.
     */
    public function test_the_body_is_cut_at_the_limit(): void
    {
        Http::fake([
            '203.0.113.10/*' => Http::response(str_repeat('a', 5000), 200, ['Content-Type' => 'text/html']),
        ]);

        $res = $this->http->fetch('http://203.0.113.10/big', 100);

        $this->assertNotNull($res);
        $this->assertSame(100, strlen($res['body']));
        // ⚠️ „მოიჭრა" ცალკე ფაქტია: ტექსტისთვის ეს ნორმაა, სურათისთვის — არა
        $this->assertTrue($res['truncated']);
    }

    /** ლიმიტში ჩატეული პასუხი მოჭრილად **არ** ითვლება */
    public function test_a_body_within_the_limit_is_not_marked_truncated(): void
    {
        Http::fake([
            '203.0.113.10/*' => Http::response('short', 200, ['Content-Type' => 'text/html']),
        ]);

        $res = $this->http->fetch('http://203.0.113.10/small', 100);

        $this->assertNotNull($res);
        $this->assertSame('short', $res['body']);
        $this->assertFalse($res['truncated']);
    }

    /** ცხადად გამოცხადებული დიდი `Content-Length` — არც დავიწყოთ */
    public function test_a_declared_oversized_body_is_refused_outright(): void
    {
        Http::fake([
            '203.0.113.10/*' => Http::response('x', 200, [
                'Content-Type' => 'image/jpeg',
                'Content-Length' => '999999999',
            ]),
        ]);

        $this->assertNull($this->http->fetch('http://203.0.113.10/huge.jpg', 1000));
    }

    /* ================= საერთო ქცევა ================= */

    /** `mime` სათაურიდან იკითხება და პარამეტრებს იშორებს */
    public function test_the_mime_type_is_normalised(): void
    {
        Http::fake([
            '203.0.113.10/*' => Http::response('x', 200, ['Content-Type' => 'TEXT/HTML; charset=UTF-8']),
        ]);

        $res = $this->http->fetch('http://203.0.113.10/a', 1000);

        $this->assertSame('text/html', $res['mime']);
    }

    /** წარუმატებელი სტატუსი `null`-ია და არა გამონაკლისი (გამომძახებლების წესი) */
    public function test_an_error_status_returns_null(): void
    {
        Http::fake(['203.0.113.10/*' => Http::response('nope', 404)]);

        $this->assertNull($this->http->fetch('http://203.0.113.10/missing', 1000));
    }

    /**
     * ⚠️ **ლოკალური ქსელი გამორთვადია და არა მუდმივად აკრძალული:** პირად
     * ინსტალაციაზე `192.168.x.x`-ზე მდგარი გვერდის ჩაბუკმარკება ლეგიტიმურია.
     */
    public function test_private_addresses_can_be_allowed_by_configuration(): void
    {
        config(['mediary.safe_http.allow_private' => true]);

        Http::fake(['127.0.0.1/*' => Http::response('home', 200, ['Content-Type' => 'text/html'])]);

        $res = $this->http->fetch('http://127.0.0.1/router', 1000);

        $this->assertNotNull($res);
        $this->assertSame('home', $res['body']);
    }
}
