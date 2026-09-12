<?php

namespace Tests\Feature;

use App\Models\SerpSearch;
use App\Models\User;
use App\Services\Serp\SerpApiClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * SerpApi — ერთი კლიენტი, ერთი მრიცხველი (Tasks §7.6).
 *
 * ⚠️ **აქ ის იმოწმება, რაც ფულს ღირს.** ბიუჯეტი 250 ძებნაა თვეში მთელ
 * ანგარიშზე, ე.ი. ყოველი ჩუმი ხარვეზი — ორმაგად გაშვებული რექვესთი, ქეშის
 * ატარება, ამოწურვის „ცარიელ სიად" წაკითხვა — პირდაპირ კვოტას ჭამს.
 * ყველა რექვესთი `Http::fake()`-ზეა: ტესტს ნამდვილი ძებნა არ უნდა დახარჯოს.
 */
class WebSearchTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.serpapi.key', 'test-key');
        config()->set('services.serpapi.monthly_limit', 250);

        $this->user = User::create([
            'name' => 'serp',
            'username' => 'serp',
            'email' => 'serp@example.com',
            'password' => 'password',
        ]);
    }

    /** @param  list<array<string, mixed>>  $images */
    private function fakeImages(array $images = [], int $left = 238): void
    {
        Http::fake([
            // უფასო წყაროც უნდა იყოს „მოჭერილი" — თორემ ტესტი ნამდვილ
            // Wikimedia-ს დაუძახებდა
            'commons.wikimedia.org/*' => Http::response(['query' => ['pages' => []]]),
            'serpapi.com/account*' => Http::response([
                'plan_name' => 'Free Plan',
                'searches_per_month' => 250,
                'this_month_usage' => 12,
                'total_searches_left' => $left,
                'account_rate_limit_per_hour' => 250,
                'plan_renewal_date' => now()->addMonth()->toDateString(),
            ]),
            'serpapi.com/search.json*' => Http::response(['images_results' => $images ?: [[
                'title' => 'Keanu',
                'original' => 'https://example.com/a.jpg',
                'thumbnail' => 'https://serpapi.example/a-thumb.jpg',
                'link' => 'https://example.com/page',
                'source' => 'Example',
                'original_width' => 800,
                'original_height' => 600,
            ]]]),
        ]);
    }

    /** ძებნა იხარჯება **ერთხელ**, ხოლო გამეორება ქეშიდან — უფასოდ (§7.6.1) */
    public function test_a_repeated_query_is_served_from_cache_and_spends_nothing(): void
    {
        $this->fakeImages();

        $first = $this->actingAs($this->user)
            ->getJson('/api/web/images?query=keanu&engines[]=google_images_light')
            ->assertOk();

        $this->assertSame(1, $first->json('spent'));
        $this->assertFalse($first->json('sources.0.cached'));
        $this->assertSame(1, SerpSearch::count());

        $second = $this->actingAs($this->user)
            ->getJson('/api/web/images?query=keanu&engines[]=google_images_light')
            ->assertOk();

        // ⚠️ ეს ტესტის გული: მეორე ძებნა **არც იხარჯება და არც რიგს წერს**
        $this->assertSame(0, $second->json('spent'));
        $this->assertTrue($second->json('sources.0.cached'));
        $this->assertSame(1, SerpSearch::count());
        $this->assertNotEmpty($second->json('items'));
    }

    /** ხარჯი ჩვენს მრიცხველშიც იწერება და **ვინ დახარჯა**-საც ინახავს */
    public function test_our_counter_records_who_spent_it(): void
    {
        $this->fakeImages();

        $this->actingAs($this->user)->getJson('/api/web/images?query=keanu&engines[]=google_images_light')->assertOk();

        $row = SerpSearch::firstOrFail();
        $this->assertSame($this->user->getKey(), $row->user_id);
        $this->assertSame('google_images_light', $row->engine);
        $this->assertSame('keanu', $row->query);
    }

    /**
     * ⚠️ **ლიმიტის ამოწურვა ≠ ცარიელი შედეგი** — 429 ცალკე მანქანური კოდით
     * (`bgg_unavailable`-ის ზუსტი წესი).
     */
    public function test_exhausted_quota_is_429_and_not_an_empty_list(): void
    {
        $this->fakeImages(left: 0);

        $this->actingAs($this->user)
            ->getJson('/api/web/images?query=keanu&engines[]=google_images_light')
            ->assertStatus(429)
            ->assertJsonPath('message', 'serpapi_quota_exceeded');

        // ამოწურვისას რექვესთი **საერთოდ არ გასულა**, ე.ი. ხარჯიც არ დაწერილა
        $this->assertSame(0, SerpSearch::count());
    }

    /** SerpApi-ის საათობრივი ჭერი (429) — იგივე მდგომარეობაა */
    public function test_a_429_from_serpapi_is_reported_as_quota(): void
    {
        Http::fake([
            'serpapi.com/account*' => Http::response([], 500),
            'serpapi.com/search.json*' => Http::response(['error' => 'rate limited'], 429),
        ]);

        $this->actingAs($this->user)
            ->getJson('/api/web/images?query=keanu&engines[]=google_images_light')
            ->assertStatus(429)
            ->assertJsonPath('message', 'serpapi_quota_exceeded');
    }

    /** გასაღების გარეშე **ფასიანი** წყარო სიაში არ ჩანს და ცხადად ამბობს ამას (§7.6.7) */
    public function test_without_a_key_the_paid_source_is_unavailable_not_empty(): void
    {
        config()->set('services.serpapi.key', null);

        $this->actingAs($this->user)
            ->getJson('/api/web/images?query=keanu&engines[]=google_images_light')
            ->assertStatus(503)
            ->assertJsonPath('message', 'serpapi_unavailable');

        $this->actingAs($this->user)
            ->getJson('/api/web/status')
            ->assertOk()
            ->assertJsonPath('configured', false);
    }

    /**
     * ⚠️ **გასაღების გარეშე ვებძებნა მთლიანად არ ქრება** (Tasks §7.5, წყარო „დ"):
     * უფასო კატალოგი სიაში რჩება და მუშაობს — ქრება მხოლოდ ტეგიანი ძებნა.
     */
    public function test_the_free_catalogue_works_without_any_key(): void
    {
        config()->set('services.serpapi.key', null);

        Http::fake(['commons.wikimedia.org/*' => Http::response(['query' => ['pages' => [
            '1' => [
                'title' => 'File:Keanu Reeves.jpg',
                'imageinfo' => [[
                    'url' => 'https://upload.wikimedia.org/keanu.jpg',
                    'thumburl' => 'https://upload.wikimedia.org/keanu-thumb.jpg',
                    'descriptionurl' => 'https://commons.wikimedia.org/wiki/File:Keanu_Reeves.jpg',
                    'mime' => 'image/jpeg',
                    'width' => 800,
                    'height' => 1200,
                    'extmetadata' => ['LicenseShortName' => ['value' => 'CC BY-SA 2.0']],
                ]],
            ],
        ]]])]);

        $res = $this->actingAs($this->user)
            ->getJson('/api/web/images?query=keanu&engines[]=wikimedia')
            ->assertOk();

        $this->assertCount(1, $res->json('items'));
        $this->assertSame('CC BY-SA 2.0', $res->json('items.0.license'));
        // ⚠️ უფასო წყარო **ხარჯს არ ზრდის** — არც `spent`, არც `serp_searches`
        $this->assertSame(0, $res->json('spent'));
        $this->assertSame(0, SerpSearch::count());

        // …და სიაშიც ჩანს, გასაღების გარეშეც
        $sources = $this->actingAs($this->user)->getJson('/api/web/status')->json('sources.images');
        $this->assertSame(['wikimedia'], array_column($sources, 'key'));
        $this->assertTrue($sources[0]['free']);
    }

    /**
     * ⚠️ **ნაგულისხმევი წყარო უფასოა** (§7.5-ის პირდაპირი მითითება) — თორემ
     * ერთი მსახიობის ფოტოძებნა 250-იან ბიუჯეტს ერთ საღამოში შეჭამდა.
     */
    public function test_the_default_source_is_the_free_one(): void
    {
        Http::fake([
            'serpapi.com/account*' => Http::response(['total_searches_left' => 100]),
            'commons.wikimedia.org/*' => Http::response(['query' => ['pages' => []]]),
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/web/images?query=keanu')->assertOk();

        $this->assertSame('wikimedia', $res->json('sources.0.engine'));
        $this->assertSame(0, $res->json('spent'));
        $this->assertSame(0, SerpSearch::count());
    }

    /**
     * ⚠️ **`GET /account` კვოტას არ ხარჯავს** — სტატუსის გვერდის გახსნა
     * მრიცხველს ვერ გაზრდის (§7.6.1).
     */
    public function test_the_status_page_does_not_spend_a_search(): void
    {
        $this->fakeImages();

        $this->actingAs($this->user)
            ->getJson('/api/web/status')
            ->assertOk()
            ->assertJsonPath('configured', true)
            ->assertJsonPath('remaining', 238)
            ->assertJsonPath('account.plan', 'Free Plan');

        $this->assertSame(0, SerpSearch::count());
    }

    /** ⚠️ **პასუხში გასაღები არასდროს ჩანს** — `status()` ვიწრო ხელით აწყობილი ფორმაა */
    public function test_the_status_never_leaks_the_api_key(): void
    {
        Http::fake([
            'serpapi.com/account*' => Http::response([
                'api_key' => 'test-key',
                'account_email' => 'someone@example.com',
                'plan_name' => 'Free Plan',
                'total_searches_left' => 5,
            ]),
        ]);

        $body = $this->actingAs($this->user)->getJson('/api/web/status')->assertOk()->content();

        $this->assertStringNotContainsString('test-key', $body);
        $this->assertStringNotContainsString('someone@example.com', $body);
    }

    /**
     * რამდენიმე engine ერთად (§7.6.4): თითო +1 ძებნაა, დუბლიკატი ერთდება და
     * ერთეული ინახავს **ყველა** წყაროს, რომელმაც ის მოიტანა.
     */
    public function test_several_engines_merge_duplicates_and_each_costs_one_search(): void
    {
        Http::fake([
            'serpapi.com/account*' => Http::response(['total_searches_left' => 100]),
            'serpapi.com/search.json*' => Http::response(['images_results' => [[
                'title' => 'Shared',
                'original' => 'https://example.com/same.jpg',
                'thumbnail' => 'https://t/1.jpg',
                'link' => 'https://example.com/p',
                'source' => 'Example',
            ]]]),
        ]);

        $res = $this->actingAs($this->user)
            ->getJson('/api/web/images?query=keanu&engines[]=google_images_light&engines[]=yandex_images')
            ->assertOk();

        // ორივე engine ცალკე ძებნაა — ქეშის გასაღები engine-ს შეიცავს
        $this->assertSame(2, $res->json('spent'));
        $this->assertSame(2, SerpSearch::count());

        // ერთი და იგივე ორიგინალი ორივემ მოიტანა → ერთი ერთეული, ორი წყარო
        $this->assertCount(1, $res->json('items'));
        $this->assertSame(
            ['google_images_light', 'yandex_images'],
            $res->json('items.0.engines'),
        );
    }

    /**
     * ⚠️ **„ვერაფერი ვიპოვა" ≠ „იპოვა, მაგრამ გამოუსადეგარი".** ცოცხალი
     * მიზეზი: `yandex_videos` ლინკისა და სათაურის გარეშე აბრუნებს რიგებს.
     */
    public function test_unusable_rows_are_counted_separately_from_no_results(): void
    {
        Http::fake([
            'serpapi.com/account*' => Http::response(['total_searches_left' => 100]),
            'serpapi.com/search.json*' => Http::response(['videos_results' => [
                ['position' => 1, 'thumbnail' => 'https://t/1.jpg', 'description' => 'no link at all'],
                ['position' => 2, 'thumbnail' => 'https://t/2.jpg', 'description' => 'neither here'],
            ]]),
        ]);

        $res = $this->actingAs($this->user)
            ->getJson('/api/web/videos?query=dune&engines[]=yandex_videos')
            ->assertOk();

        $this->assertSame([], $res->json('items'));
        $this->assertSame(0, $res->json('sources.0.count'));
        // ესაა განსხვავება: ნული ნაპოვნი, მაგრამ ორი გადაგდებული
        $this->assertSame(2, $res->json('sources.0.dropped'));
        $this->assertTrue($res->json('sources.0.ok'));
    }

    /** ერთი ვიდეოს დეტალები YouTube-ის გასაღების გარეშე (§7.6.3) */
    public function test_video_details_come_from_serpapi_without_a_youtube_key(): void
    {
        Http::fake([
            'serpapi.com/account*' => Http::response(['total_searches_left' => 100]),
            'serpapi.com/search.json*' => Http::response(['video_results' => [
                'title' => 'Dune: Part Two | Official Trailer',
                'description' => 'Long live the fighters',
                'channel' => ['name' => 'Warner Bros.'],
                'length' => '2:25',
                'views' => 12345,
                'thumbnail' => ['static' => 'https://i.ytimg.com/vi/Way9Dexny3w/hq.jpg'],
            ]]),
        ]);

        $this->actingAs($this->user)
            ->getJson('/api/web/video?url='.urlencode('https://www.youtube.com/watch?v=Way9Dexny3w'))
            ->assertOk()
            ->assertJsonPath('video.title', 'Dune: Part Two | Official Trailer')
            ->assertJsonPath('video.channel', 'Warner Bros.')
            // „2:25" → წამები: ვიდეოს მოდული წამებში ითვლის
            ->assertJsonPath('video.duration', 145)
            ->assertJsonPath('video.video_id', 'Way9Dexny3w');
    }

    /** YouTube-ის გარეთ ძებნის დახარჯვას აზრი არ აქვს — ცხადი უარი */
    public function test_a_non_youtube_url_is_refused_before_spending(): void
    {
        $this->fakeImages();

        $this->actingAs($this->user)
            ->getJson('/api/web/video?url='.urlencode('https://vimeo.com/12345'))
            ->assertStatus(422)
            ->assertJsonPath('message', 'not_youtube');

        $this->assertSame(0, SerpSearch::count());
    }

    /** უცნობი engine 422-ია და არა ჩუმად ნაგულისხმევზე გადაცემა */
    public function test_an_unknown_engine_is_rejected(): void
    {
        $this->fakeImages();

        $this->actingAs($this->user)
            ->getJson('/api/web/images?query=keanu&engines[]=bing_images')
            ->assertStatus(422);
    }

    /** ავტორიზაციის გარეშე ვერაფერი — კვოტა ანგარიშისაა და გარეთ არ გადის */
    public function test_the_endpoints_require_a_session(): void
    {
        $this->getJson('/api/web/status')->assertStatus(401);
        $this->getJson('/api/web/images?query=keanu&engines[]=google_images_light')->assertStatus(401);
    }

    /**
     * ⚠️ **ჩავარდნა არ ქეშირდება** — ერთი წამიერი შეცდომა 24 საათით
     * „მიუწვდომელს" რომ აფიქსირებდეს, მომდევნო ნამდვილი ძებნაც ვერ გავიდოდა.
     */
    public function test_a_failure_is_not_cached(): void
    {
        Cache::flush();

        $calls = 0;

        // ⚠️ `/account` ცალკე პასუხობს და **მუდმივად** — თორემ თანმიმდევრობის
        // რიგს ისიც ჭამს და ტესტი სულ სხვა რამეს ამოწმებს
        Http::fake([
            'serpapi.com/account*' => Http::response(['total_searches_left' => 100]),
            'serpapi.com/search.json*' => function () use (&$calls) {
                $calls++;

                // პირველი ცდა ჩავარდა, მეორემ იმუშავა
                return $calls === 1
                    ? Http::response([], 500)
                    : Http::response(['images_results' => [[
                        'original' => 'https://example.com/a.jpg',
                        'thumbnail' => 'https://t/a.jpg',
                        'link' => 'https://example.com/p',
                        'source' => 'Example',
                    ]]]);
            },
        ]);

        $client = app(SerpApiClient::class);

        $first = $client->images('google_images_light', 'keanu', 5);
        $this->assertFalse($first['ok']);
        // ჩავარდნა ხარჯად არ ჩაითვლება — SerpApi შეცდომას არ გვახარჯვინებს
        $this->assertSame(0, SerpSearch::count());

        $second = $client->images('google_images_light', 'keanu', 5);
        $this->assertTrue($second['ok'], 'ჩავარდნა დაქეშდა და მეორე ცდა ვეღარ გავიდა');
        $this->assertNotEmpty($second['items']);
        $this->assertSame(2, $calls);
    }
}
