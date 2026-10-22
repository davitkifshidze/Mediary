<?php

namespace Tests\Feature;

use App\Models\GalleryImage;
use App\Models\Place;
use App\Models\PlaceCategory;
use App\Models\User;
use App\Models\UserCredential;
use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\SafeHttp;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ადგილის ძებნა წყაროების ჯაჭვით, ბმული, უკუ-გეოკოდირება, შენახვა.**
 *
 * ⚠️ `Http::fake()` **ერთი closure-ია** (CLAUDE.md: მეორე `fake()` არაფერს ცვლის) —
 * მისამართით პასუხობს Google-ს, SerpApi-ს, Serper-ს, Nominatim-ს და ფოტოს ჰოსტს.
 * ⚠️ ფოტოს ჰოსტი ლიტერალური IP-ია (`203.0.113.10`, RFC 5737) — `SafeHttp` DNS-ს
 * ნამდვილად ხსნის (`WebImportTest`-ის წესი).
 */
class PlaceLookupTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private int $serpStatus = 200;

    private array $serpAnswer = [];

    private array $serperAnswer = [];

    private array $nominatim = [];

    private int $nominatimStatus = 200;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Cache::flush();

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->user->refresh();
        $this->actingAs($this->user);

        $this->nominatim = [[
            'osm_id' => 1, 'osm_type' => 'node', 'lat' => '41.7000', 'lon' => '44.8000',
            'name' => 'OSM place', 'display_name' => 'OSM place, თბილისი, საქართველო',
            'category' => 'amenity', 'type' => 'restaurant',
            'address' => ['city' => 'თბილისი', 'country' => 'საქართველო'],
        ]];

        Http::fake(function (Request $request) {
            $url = $request->url();

            return match (true) {
                str_contains($url, 'places:autocomplete') => Http::response(['suggestions' => [[
                    'placePrediction' => [
                        'placeId' => 'ChIJpictogram0001',
                        'text' => ['text' => 'პიქტოგრამა, თბილისი'],
                        'structuredFormat' => ['mainText' => ['text' => 'პიქტოგრამა'], 'secondaryText' => ['text' => 'კოსტავას ქ., თბილისი']],
                    ],
                ]]]),
                str_contains($url, 'places:searchText') => Http::response(['places' => [$this->googlePlace()]]),
                str_contains($url, '/photos/') => Http::response(['photoUri' => 'https://203.0.113.10/google-photo.jpg']),
                str_contains($url, 'places.googleapis.com/v1/places/') => Http::response($this->googlePlace()),
                str_contains($url, 'serpapi.com') => Http::response($this->serpAnswer, $this->serpStatus),
                str_contains($url, 'google.serper.dev/places') => Http::response(['places' => $this->serperAnswer]),
                str_contains($url, 'nominatim.openstreetmap.org/reverse') => Http::response([
                    'osm_id' => 9, 'osm_type' => 'way', 'lat' => '41.7151', 'lon' => '44.8271', 'name' => '',
                    'display_name' => 'კოსტავას ქ. 12, თბილისი, საქართველო',
                    'address' => ['city' => 'თბილისი', 'country' => 'საქართველო'],
                ]),
                str_contains($url, 'nominatim.openstreetmap.org') => Http::response($this->nominatim, $this->nominatimStatus),
                str_contains($url, '203.0.113.10') => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg']),
                default => Http::response('', 404),
            };
        });
    }

    private function googlePlace(): array
    {
        return [
            'id' => 'ChIJpictogram0001',
            'displayName' => ['text' => 'პიქტოგრამა'],
            'formattedAddress' => 'კოსტავას ქ. 12, თბილისი 0108, საქართველო',
            'location' => ['latitude' => 41.7151, 'longitude' => 44.8271],
            'primaryTypeDisplayName' => ['text' => 'რესტორანი'],
            'rating' => 4.6,
            'userRatingCount' => 1234,
            'nationalPhoneNumber' => '032 222 22 22',
            'websiteUri' => 'https://pictogram.ge',
            'regularOpeningHours' => ['weekdayDescriptions' => ['ორშაბათი: 11:00–23:00', 'სამშაბათი: 11:00–23:00']],
            'addressComponents' => [
                ['longText' => 'თბილისი', 'types' => ['locality', 'political']],
                ['longText' => 'საქართველო', 'types' => ['country', 'political']],
            ],
            'googleMapsUri' => 'https://maps.google.com/?cid=1',
            'photos' => [['name' => 'places/ChIJpictogram0001/photos/AbC1'], ['name' => 'places/ChIJpictogram0001/photos/AbC2']],
        ];
    }

    private function serpRow(array $extra = []): array
    {
        return [
            'title' => 'პიქტოგრამა',
            'place_id' => 'serp-1',
            'address' => 'კოსტავას ქ. 12, თბილისი',
            'gps_coordinates' => ['latitude' => 41.7152, 'longitude' => 44.8272],
            'type' => 'Restaurant',
            'rating' => 4.5,
            'reviews' => 980,
            'phone' => '+995 32 222 22 22',
            'website' => 'https://pictogram.ge',
            'operating_hours' => ['monday' => '11 AM–11 PM'],
            'thumbnail' => 'https://lh5.googleusercontent.com/p/AF1QipABC=w80-h106-k-no',
            ...$extra,
        ];
    }

    /** მოკლე ბმულის გაშლა ქსელის გარეშე — `unfold()` ამ მისამართს „იპოვის" (`null` — ჯაჭვი გაწყდა) */
    private function unfoldsTo(?string $target): void
    {
        $this->app->instance(SafeHttp::class, new class($target) extends SafeHttp
        {
            public function __construct(private readonly ?string $target) {}

            public function unfold(string $url, callable $wanted, int $timeout = 15): ?string
            {
                return $this->target !== null && $wanted($this->target) ? $this->target : null;
            }
        });
    }

    private function key(string $provider): void
    {
        UserCredential::create(['user_id' => $this->user->id, 'provider' => $provider, 'credentials' => ['key' => "{$provider}-key"]]);
        // ⚠️ მეხსიერება პროცესშია — წინა მოთხოვნის „გასაღები არ არის" არ უნდა დარჩეს
        CredentialStore::forget();
    }

    private function jpeg(): string
    {
        return base64_decode('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==');
    }

    /** გასაღების გარეშე: Nominatim, საქართველოს მიკერძოებით და ფორმის ქალაქით */
    public function test_without_keys_nominatim_answers_with_a_georgian_bias_and_the_form_city(): void
    {
        $this->postJson('/api/places/lookup/candidates', ['query' => 'პიქტოგრამა', 'city' => 'თბილისი'])
            ->assertOk()
            ->assertJsonPath('source', 'nominatim')
            ->assertJsonPath('live', false)
            ->assertJsonPath('results.0.source', 'nominatim')
            ->assertJsonPath('results.0.source_id', 'node:1')
            ->assertJsonPath('results.0.city', 'თბილისი');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'nominatim.openstreetmap.org/search')
            && $r['q'] === 'პიქტოგრამა, თბილისი'
            && $r['viewbox'] === '40.0,43.6,46.75,41.0'
            && (string) $r['bounded'] === '0');
    }

    /** წერისას შემოთავაზება მხოლოდ Google-ით; გასაღების გარეშე ქსელში არაფერი მიდის */
    public function test_live_suggestions_need_the_google_key(): void
    {
        $this->postJson('/api/places/lookup/candidates', ['query' => 'პიქტ', 'live' => true])
            ->assertOk()
            ->assertJsonPath('live', false)
            ->assertJsonCount(0, 'results');
        Http::assertNothingSent();

        $this->key(CredentialProviders::GOOGLE_MAPS);
        $this->postJson('/api/places/lookup/candidates', ['query' => 'პიქტ', 'live' => true, 'session' => 'sess-1'])
            ->assertOk()
            ->assertJsonPath('live', true)
            ->assertJsonPath('results.0.source', 'google')
            ->assertJsonPath('results.0.source_id', 'ChIJpictogram0001')
            ->assertJsonPath('results.0.name', 'პიქტოგრამა')
            ->assertJsonPath('results.0.address', 'კოსტავას ქ., თბილისი');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'places:autocomplete')
            && $r->hasHeader('X-Goog-Api-Key', 'google_maps-key')
            && $r['sessionToken'] === 'sess-1'
            && ! str_contains($r->url(), 'google_maps-key'));
    }

    /** Google პირველია და ყველაფერს აბრუნებს; SerpApi-ს აღარ მიმართავს */
    public function test_google_comes_first_and_returns_everything(): void
    {
        $this->key(CredentialProviders::GOOGLE_MAPS);
        $this->key(CredentialProviders::SERPAPI);

        $this->postJson('/api/places/lookup/candidates', ['query' => 'პიქტოგრამა'])
            ->assertOk()
            ->assertJsonPath('source', 'google')
            ->assertJsonPath('live', true)
            ->assertJsonPath('results.0.name', 'პიქტოგრამა')
            ->assertJsonPath('results.0.city', 'თბილისი')
            ->assertJsonPath('results.0.country', 'საქართველო')
            ->assertJsonPath('results.0.kind', 'რესტორანი')
            ->assertJsonPath('results.0.rating', 4.6)
            ->assertJsonPath('results.0.rating_count', 1234)
            ->assertJsonPath('results.0.phone', '032 222 22 22')
            ->assertJsonPath('results.0.website', 'https://pictogram.ge')
            ->assertJsonPath('results.0.hours.0', 'ორშაბათი: 11:00–23:00');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'places:searchText') && $r->hasHeader('X-Goog-FieldMask'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'serpapi.com'));
    }

    /** SerpApi ჩავარდა → Serper; შემდეგ SerpApi-ის ნორმალიზება (საათები, დიდი ფოტო) */
    public function test_a_failing_source_hands_over_to_the_next_one(): void
    {
        $this->key(CredentialProviders::SERPAPI);
        $this->key(CredentialProviders::SERPER);

        $this->serpStatus = 500;
        $this->serperAnswer = [[
            'title' => 'პიქტოგრამა', 'cid' => '777', 'address' => 'კოსტავას ქ. 12', 'latitude' => 41.7151, 'longitude' => 44.8271,
            'category' => 'Restaurant', 'rating' => 4.4, 'ratingCount' => 50, 'phoneNumber' => '032 2', 'website' => 'https://p.ge',
        ]];

        $this->postJson('/api/places/lookup/candidates', ['query' => 'პიქტოგრამა'])
            ->assertOk()
            ->assertJsonPath('source', 'serper')
            ->assertJsonPath('results.0.source_id', '777')
            ->assertJsonPath('results.0.rating_count', 50);

        $this->serpStatus = 200;
        $this->serpAnswer = ['local_results' => [$this->serpRow()]];

        $this->postJson('/api/places/lookup/candidates', ['query' => 'სახინკლე'])
            ->assertOk()
            ->assertJsonPath('source', 'serpapi')
            ->assertJsonPath('results.0.hours.0', 'ორშაბათი: 11 AM–11 PM')
            ->assertJsonPath('results.0.photo', 'https://lh5.googleusercontent.com/p/AF1QipABC=w1600-h1200-k-no')
            ->assertJsonPath('results.0.rating_count', 980);
    }

    /** გასაღებიანმა წყარომ ვერაფერი იპოვა — Nominatim (უფასო) მაინც სცდის; ყველა ჩავარდა — 503 */
    public function test_an_empty_keyed_answer_still_tries_nominatim_and_a_dead_chain_is_503(): void
    {
        $this->key(CredentialProviders::SERPAPI);
        $this->serpAnswer = ['local_results' => []];

        $this->postJson('/api/places/lookup/candidates', ['query' => 'ვარძია'])
            ->assertOk()
            ->assertJsonPath('source', 'nominatim')
            ->assertJsonPath('results.0.name', 'OSM place');

        // ყველა წყარო ჩავარდა — „არ პასუხობს" (503) და არა ცარიელი სია
        $this->serpStatus = 500;
        $this->nominatimStatus = 500;
        $this->postJson('/api/places/lookup/candidates', ['query' => 'სხვა ადგილი'])
            ->assertStatus(503)
            ->assertJsonPath('message', 'places_unavailable');
    }

    /** არჩეულის დეტალები: Google-ის ფოტოები (გასაღები ჰედერში); SerpApi-ს ქალაქი — კოორდინატიდან */
    public function test_details_bring_the_photos_and_the_city(): void
    {
        $this->key(CredentialProviders::GOOGLE_MAPS);

        $this->postJson('/api/places/lookup', ['source' => 'google', 'source_id' => 'ChIJpictogram0001', 'session' => 's'])
            ->assertOk()
            ->assertJsonPath('draft.name', 'პიქტოგრამა')
            ->assertJsonPath('draft.photo', 'https://203.0.113.10/google-photo.jpg')
            ->assertJsonCount(2, 'draft.photos');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/photos/AbC1/media')
            && str_contains($r->url(), 'skipHttpRedirect=true')
            && $r->hasHeader('X-Goog-Api-Key', 'google_maps-key')
            && ! str_contains($r->url(), 'google_maps-key'));

        $this->key(CredentialProviders::SERPAPI);
        $this->serpAnswer = ['local_results' => [$this->serpRow()]];

        $this->postJson('/api/places/lookup', ['source' => 'serpapi', 'source_id' => 'serp-1', 'query' => 'პიქტოგრამა'])
            ->assertOk()
            ->assertJsonPath('draft.phone', '+995 32 222 22 22')
            ->assertJsonPath('draft.city', 'თბილისი')
            ->assertJsonPath('draft.country', 'საქართველო');
    }

    /** Google Maps-ის ბმული: გასაღების გარეშე სახელი + წერტილი + Nominatim-ის მისამართი */
    public function test_a_maps_link_fills_the_form_even_without_keys(): void
    {
        $this->postJson('/api/places/lookup/link', [
            'url' => 'https://www.google.com/maps/place/Pictogram/@41.71,44.82,17z/data=!3d41.7151!4d44.8271',
        ])
            ->assertOk()
            ->assertJsonPath('draft.name', 'Pictogram')
            ->assertJsonPath('draft.lat', 41.7151)
            ->assertJsonPath('draft.lng', 44.8271)
            ->assertJsonPath('draft.city', 'თბილისი')
            ->assertJsonPath('draft.address', 'კოსტავას ქ. 12, თბილისი, საქართველო');

        $this->postJson('/api/places/lookup/link', ['url' => 'https://example.com/somewhere'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'map_link_unreadable');
    }

    /** გასაღების გარეშე პასუხი ამბობს `live: false` — ფოტოების ამრჩევი ამაზე წერს მინიშნებას */
    public function test_a_draft_says_whether_the_google_key_is_there(): void
    {
        $url = ['url' => 'https://www.google.com/maps/place/Pictogram/@41.71,44.82,17z/data=!3d41.7151!4d44.8271'];

        $this->postJson('/api/places/lookup/link', $url)->assertOk()->assertJsonPath('live', false);

        $this->key(CredentialProviders::GOOGLE_MAPS);
        $this->postJson('/api/places/lookup/link', $url)->assertOk()->assertJsonPath('live', true);
    }

    /** მოკლე ბმული `SafeHttp`-ით იშლება; სახელით ნაპოვნი, წერტილთან ახლოს მდგომი ადგილი ირჩევა */
    public function test_a_short_link_is_unfolded_and_matched_to_the_nearest_result(): void
    {
        $this->unfoldsTo('https://consent.google.com/ml?continue='.urlencode('https://www.google.com/maps/place/Pictogram/@41.715,44.827,17z/data=!3d41.7151!4d44.8271'));

        $this->key(CredentialProviders::SERPAPI);
        $this->serpAnswer = ['local_results' => [
            $this->serpRow(['title' => 'Far away', 'place_id' => 'far', 'gps_coordinates' => ['latitude' => 42.2, 'longitude' => 43.0]]),
            $this->serpRow(),
        ]];

        $this->postJson('/api/places/lookup/link', ['url' => 'https://maps.app.goo.gl/AbCdEf123'])
            ->assertOk()
            ->assertJsonPath('draft.source', 'serpapi')
            ->assertJsonPath('draft.source_id', 'serp-1')
            ->assertJsonPath('draft.phone', '+995 32 222 22 22');
    }

    /**
     * **ბმულში Google-ის ID-ია → ზუსტი ობიექტი**: CID (FTID-დან) SerpApi-ს
     * `data_cid`-ით, სახელით ძებნისა და „უახლოესის" გარეშე; ერთი პასუხის
     * `images` ფოტოების ამრჩევს რამდენიმე ფოტოს აძლევს (დიდი ზომით).
     *
     * ⚠️ 429-ის „sorry" გვერდი ბმულს აღარ კარგავს — `continue`-დან იკითხება.
     */
    public function test_a_link_with_a_google_id_asks_for_that_exact_place(): void
    {
        $this->unfoldsTo('https://www.google.com/sorry/index?continue='.urlencode(
            'https://www.google.com/maps/place/31+Atoneli+St/data=!4m7!3m6!1s0x40440ce731f82b1d:0x9e4f761a61b9ff48!8m2!3d41.7005149!4d44.8017788!16s%2Fg%2F11bw4n4hy5'
        ).'&q=EgQ');
        $this->key(CredentialProviders::SERPAPI);
        $this->serpAnswer = ['place_results' => $this->serpRow([
            'title' => 'Pictograma',
            'place_id' => 'ChIJexact',
            'type' => ['Georgian restaurant', 'Restaurant'],
            'operating_hours' => null,
            'hours' => [['monday' => '11 AM–11 PM'], ['tuesday' => 'Closed']],
            'images' => [
                ['title' => 'All', 'thumbnail' => 'https://lh5.googleusercontent.com/p/AF1QipABC=w447-h298-k-no'],
                ['title' => 'Menu', 'thumbnail' => 'https://lh5.googleusercontent.com/p/AF1QipMENU=w447-h298-k-no'],
            ],
        ])];

        $this->postJson('/api/places/lookup/link', ['url' => 'https://maps.app.goo.gl/FhvBRiHwZmeqbWo6A'])
            ->assertOk()
            ->assertJsonPath('draft.source', 'serpapi')
            ->assertJsonPath('draft.name', 'Pictograma')
            ->assertJsonPath('draft.kind', 'Georgian restaurant')
            ->assertJsonPath('draft.hours', ['ორშაბათი: 11 AM–11 PM', 'სამშაბათი: Closed'])
            // ესკიზი და სიის პირველი ერთი ფაილია — ერთხელ
            ->assertJsonPath('draft.photos', [
                'https://lh5.googleusercontent.com/p/AF1QipABC=w1600-h1200-k-no',
                'https://lh5.googleusercontent.com/p/AF1QipMENU=w1600-h1200-k-no',
            ])
            ->assertJsonPath('draft.photo', 'https://lh5.googleusercontent.com/p/AF1QipABC=w1600-h1200-k-no');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'serpapi.com')
            && ($r['data_cid'] ?? null) === '11407466236833562440' && ! isset($r['q']));
    }

    /** `place_id` + Google-ის გასაღები → Google-ის დეტალები პირდაპირ (6 ფოტომდე) */
    public function test_a_place_id_link_goes_straight_to_google_details(): void
    {
        $this->key(CredentialProviders::GOOGLE_MAPS);

        $this->postJson('/api/places/lookup/link', ['url' => 'https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJpictogram0001'])
            ->assertOk()
            ->assertJsonPath('draft.source', 'google')
            ->assertJsonPath('draft.name', 'პიქტოგრამა')
            ->assertJsonCount(2, 'draft.photos');

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'places.googleapis.com/v1/places/ChIJpictogram0001'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'places:searchText'));
    }

    /** მოკლე ბმულის ჯაჭვი გაწყდა — 422, და არა 500 */
    public function test_a_short_link_that_does_not_unfold_is_unreadable(): void
    {
        $this->unfoldsTo(null);

        $this->postJson('/api/places/lookup/link', ['url' => 'https://maps.app.goo.gl/AbCdEf123'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'map_link_unreadable');
    }

    /** პინის გადათრევა → მისამართი */
    public function test_reverse_geocoding(): void
    {
        $this->postJson('/api/places/lookup/reverse', ['lat' => 41.7151, 'lng' => 44.8271])
            ->assertOk()
            ->assertJsonPath('address.city', 'თბილისი')
            ->assertJsonPath('address.country', 'საქართველო');

        $this->postJson('/api/places/lookup/reverse', ['lat' => 95, 'lng' => 44.8])->assertStatus(422);
    }

    /** შენახვა: წყაროს ინფო ცალკე სვეტებში, ფოტოები — გალერეაში, პირველი — მთავარი */
    public function test_saving_keeps_the_source_details_and_brings_the_photos_into_the_gallery(): void
    {
        PlaceCategory::ensureDefaults($this->user->id);
        $category = PlaceCategory::where('user_id', $this->user->id)->firstOrFail();

        $payload = [
            'name' => 'პიქტოგრამა',
            'status' => 'to_visit',
            'category_id' => $category->id,
            'phone' => '032 222 22 22',
            'website' => 'https://pictogram.ge',
            'opening_hours' => ['ორშაბათი: 11:00–23:00', ' ', 'სამშაბათი: 11:00–23:00'],
            'source_rating' => 4.6,
            'source_rating_count' => 1234,
            'gallery_urls' => ['https://203.0.113.10/a.jpg', 'https://203.0.113.10/b.jpg'],
        ];

        $id = $this->postJson('/api/places', $payload)
            ->assertStatus(201)
            ->assertJsonPath('data.phone', '032 222 22 22')
            ->assertJsonPath('data.website', 'https://pictogram.ge')
            ->assertJsonPath('data.opening_hours', ['ორშაბათი: 11:00–23:00', 'სამშაბათი: 11:00–23:00'])
            ->assertJsonPath('data.source_rating', 4.6)
            ->assertJsonPath('data.source_rating_count', 1234)
            ->json('data.id');

        $place = Place::findOrFail($id);
        $images = GalleryImage::where('imageable_id', $id)->where('imageable_type', $place->getMorphClass())->orderBy('id')->get();
        $this->assertCount(2, $images);
        // ფოტო არ იყო — პირველი ჩამოსული მთავარი გახდა
        $this->assertSame($images->first()->path, $place->photo_path);

        $this->postJson('/api/places', [...$payload, 'website' => 'not a url'])->assertStatus(422);
        $this->postJson('/api/places', [...$payload, 'source_rating' => 6])->assertStatus(422);
        $this->postJson('/api/places', [...$payload, 'gallery_urls' => array_fill(0, 11, 'https://203.0.113.10/x.jpg')])->assertStatus(422);
    }
}
