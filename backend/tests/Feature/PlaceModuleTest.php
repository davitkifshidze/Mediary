<?php

namespace Tests\Feature;

use App\Models\GalleryImage;
use App\Models\Place;
use App\Models\PlaceCategory;
use App\Models\User;
use App\Services\Places\NominatimClient;
use App\Services\Storage\StorageMeter;
use App\Support\PublicDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ადგილების მოდული (FEAT-26).**
 *
 * ⚠️ `Http::fake()` აუცილებელია: Nominatim გარე მისამართია და ტესტი
 * ოფლაინ უნდა მუშაობდეს. ⚠️ ქეშიც ისუფთავდება — `NominatimClient`
 * წარმატებულ პასუხს 24 საათით ინახავს, ე.ი. მეორე ტესტი პირველის
 * პასუხს დაინახავდა.
 */
class PlaceModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    /**
     * რას აბრუნებს Nominatim ამ ტესტში.
     *
     * ⚠️ **`Http::fake()` stub-ებს ამატებს და არა ცვლის** (`Factory::fake()`
     * ყოველ URL-ს `stubUrl()`-ით ამატებს და სიას არასდროს ასუფთავებს), ე.ი.
     * `setUp()`-ის `*` ყოველთვის იგებდა და ტესტის საკუთარი პასუხი ჩუმად
     * იგნორირდებოდა — ზუსტად ის ხაფანგი, რომელიც FEAT-10-მა დააფიქსირა.
     * ამიტომ stub **ერთია** და იცვლება მხოლოდ ის, რაც მის უკან დგას.
     */
    private array $answer = [];

    private int $answerStatus = 200;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Cache::flush();
        Http::fake(['*' => fn () => Http::response($this->answer, $this->answerStatus)]);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        // ⚠️ ქარხანა კვოტას არ წერს — მეხსიერებაში `null`-ია და ატვირთვა 413
        $this->user->refresh();
        $this->actingAs($this->user);
    }

    private function category(): PlaceCategory
    {
        PlaceCategory::ensureDefaults($this->user->id);

        return PlaceCategory::where('user_id', $this->user->id)->firstOrFail();
    }

    private function payload(array $extra = []): array
    {
        return [
            'name' => 'ვარძია',
            'status' => 'to_visit',
            'category_id' => $this->category()->id,
            ...$extra,
        ];
    }

    public function test_a_place_is_created_with_its_coordinates(): void
    {
        $this->postJson('/api/places', $this->payload([
            'lat' => 41.3811111,
            'lng' => 43.2847222,
            'country' => 'საქართველო',
        ]))
            ->assertStatus(201)
            // ⚠️ რიცხვად და არა სტრიქონად — `decimal` cast სტრიქონს აბრუნებს
            ->assertJsonPath('data.lat', 41.3811111)
            ->assertJsonPath('data.lng', 43.2847222)
            ->assertJsonPath('data.status', 'to_visit');
    }

    /** სტატუსიც და კატეგორიაც სავალდებულოა (2026-09-16-ის წესი) */
    public function test_status_and_category_are_required(): void
    {
        $this->postJson('/api/places', ['name' => 'x'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status', 'category_id']);
    }

    /**
     * ⚠️ **კოორდინატის საზღვრები ნამდვილია**: უამისოდ აკრეფის შეცდომა
     * („4142" ნაცვლად „41.42") ჩუმად ჩაიწერებოდა და ადგილი რუკიდან
     * გავარდებოდა.
     */
    public function test_a_coordinate_outside_the_globe_is_rejected(): void
    {
        $this->postJson('/api/places', $this->payload(['lat' => 4142, 'lng' => 43.2]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lat']);
    }

    /**
     * ⚠️ **ნული ნამდვილი კოორდინატია** (გრინვიჩი/ეკვატორი) — `?:`-ით
     * დაწერილი შევსება მას `null`-ად წაიკითხავდა და ადგილს კოორდინატს
     * ჩუმად წაართმევდა.
     */
    public function test_zero_is_a_real_coordinate(): void
    {
        $res = $this->postJson('/api/places', $this->payload(['lat' => 0, 'lng' => 0]))
            ->assertStatus(201);

        /* ⚠️ `assertJsonPath(…, 0.0)` აქ ცრუ წითელია: JSON-ში 0.0 მთელ 0-ად
           ბრუნდება, ე.ი. ტესტი ტიპს ამოწმებდა და არა ფაქტს. საკითხავი ისაა,
           რომ მნიშვნელობა **`null` არ არის**. */
        $this->assertNotNull($res->json('data.lat'));
        $this->assertSame(0.0, (float) $res->json('data.lat'));
        $this->assertSame(0.0, (float) $res->json('data.lng'));
    }

    /**
     * **„ვიყავი" თარიღს სვამს, უკან დაბრუნება კი — შლის.**
     *
     * ⚠️ ეს ტესტის მთავარი აზრია: `visited_at`-ს მხოლოდ `applyStatus()`
     * წერს, თორემ სტატისტიკა (FEAT-08/FEAT-21) სამუდამოდ ჩათვლიდა ადგილს,
     * სადაც მომხმარებელმა თქვა, რომ არ ყოფილა.
     */
    public function test_the_visit_date_follows_the_status(): void
    {
        $id = $this->postJson('/api/places', $this->payload())->json('data.id');

        $visited = $this->patchJson("/api/places/{$id}/status", ['status' => 'visited'])
            ->assertOk()
            ->assertJsonPath('data.status', 'visited');

        $this->assertNotNull($visited->json('data.visited_at'));

        $this->patchJson("/api/places/{$id}/status", ['status' => 'to_visit'])
            ->assertOk()
            ->assertJsonPath('data.visited_at', null);
    }

    /** ძველი ვიზიტიც ჩაიწერება — თარიღი ცხადად გადმოცემადია */
    public function test_an_explicit_visit_date_wins(): void
    {
        $id = $this->postJson('/api/places', $this->payload())->json('data.id');

        $this->patchJson("/api/places/{$id}/status", [
            'status' => 'visited',
            'visited_at' => '2019-07-14',
        ])
            ->assertOk()
            ->assertJsonPath('data.visited_at', '2019-07-14');
    }

    public function test_the_filters_narrow_the_list(): void
    {
        // ⚠️ ჯერ ნაგულისხმევები, მერე ახალი — თორემ `ensureDefaults()`
        // ვერაფერს შექმნიდა და ორივე ადგილი ერთ კატეგორიაში მოხვდებოდა
        $first = $this->category();

        $other = PlaceCategory::create([
            'user_id' => $this->user->id,
            'key' => 'other',
            'name_ka' => 'სხვა',
            'name_en' => 'Other',
            'sort_order' => 99,
        ]);

        $this->postJson('/api/places', $this->payload([
            'name' => 'ვარძია', 'category_id' => $first->id,
            'country' => 'საქართველო', 'tags' => ['ka', 'ისტორია'],
        ]))->assertStatus(201);
        $this->postJson('/api/places', $this->payload([
            'name' => 'Louvre', 'status' => 'visited', 'category_id' => $other->id,
            'country' => 'France', 'tags' => ['ka'],
        ]))->assertStatus(201);

        $this->getJson('/api/places?status=visited')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/places?category_id={$other->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/places?country=France')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/places?tag=ka')->assertOk()->assertJsonCount(2, 'data');
        // ⚠️ ტეგები AND-ით იკვეთება (ქვეყანა/კატეგორია კი OR-ით)
        $this->getJson('/api/places?tag=ka,%E1%83%98%E1%83%A1%E1%83%A2%E1%83%9D%E1%83%A0%E1%83%98%E1%83%90')
            ->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/places?q=Louvre')->assertOk()->assertJsonCount(1, 'data');
    }

    /** ქვეყნების სია ჩანაწერებიდან აგრეგირდება — ცალკე ლექსიკონი არ არსებობს */
    public function test_the_country_list_is_aggregated_from_the_records(): void
    {
        $this->postJson('/api/places', $this->payload(['country' => 'საქართველო']))->assertStatus(201);
        $this->postJson('/api/places', $this->payload(['name' => 'b', 'country' => 'საქართველო']))->assertStatus(201);
        $this->postJson('/api/places', $this->payload(['name' => 'c']))->assertStatus(201);

        $this->getJson('/api/places/countries')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'საქართველო')
            ->assertJsonPath('data.0.count', 2);
    }

    /**
     * **Nominatim-ის კანდიდატები.**
     *
     * ⚠️ `User-Agent` სავალდებულოა — მის გარეშე წყარო 403-ს აბრუნებს და
     * ჩუმად „მიუწვდომელი" ხდება.
     */
    public function test_nominatim_candidates_are_normalised(): void
    {
        $this->answer = [[
            'osm_id' => 26913474,
            'osm_type' => 'way',
            'name' => 'ვარძია',
            'display_name' => 'ვარძია, ასპინძის მუნიციპალიტეტი, საქართველო',
            'lat' => '41.3811111',
            'lon' => '43.2847222',
            'category' => 'historic',
            'type' => 'monastery',
            // ⚠️ ქალაქის ველი ერთი არ არის: `city`/`town`/`village`
            'address' => ['village' => 'ვარძია', 'country' => 'საქართველო'],
        ]];

        $this->postJson('/api/places/lookup/candidates', ['query' => 'ვარძია'])
            ->assertOk()
            ->assertJsonPath('results.0.osm_id', '26913474')
            ->assertJsonPath('results.0.city', 'ვარძია')
            ->assertJsonPath('results.0.country', 'საქართველო')
            ->assertJsonPath('results.0.lat', 41.3811111);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'nominatim')
            && $request->hasHeader('User-Agent', 'Mediary/1.0 (personal media library)'));
    }

    /**
     * ⚠️ **„წყარო არ პასუხობს" ≠ „ვერაფერი ვიპოვე"**: ცარიელი სია
     * „ასეთი ადგილი არ არსებობს"-ად იკითხება და ხელით შევსებას აჩერებს.
     */
    public function test_a_dead_source_is_503_and_not_an_empty_list(): void
    {
        $this->answerStatus = 500;

        $this->postJson('/api/places/lookup/candidates', ['query' => 'ვარძია'])
            ->assertStatus(503)
            ->assertJsonPath('message', 'nominatim_unavailable');
    }

    /** ⚠️ ჩავარდნა **არ** ქეშირდება — ერთი აციმციმებული წამი მთელ დღეს არ ღუპავს */
    public function test_a_failure_is_not_cached(): void
    {
        $this->answerStatus = 500;
        $this->postJson('/api/places/lookup/candidates', ['query' => 'ვარძია'])->assertStatus(503);

        $this->answerStatus = 200;
        $this->answer = [[
            'osm_id' => 1, 'osm_type' => 'node', 'name' => 'ვარძია',
            'display_name' => 'ვარძია', 'lat' => '41.0', 'lon' => '43.0',
        ]];

        $this->postJson('/api/places/lookup/candidates', ['query' => 'ვარძია'])
            ->assertOk()
            ->assertJsonCount(1, 'results');
    }

    /**
     * ⚠️ **`osm_id` მატჩინგის იდენტობაა** (§16.2), ხელით შეყვანილს კი არ
     * აქვს — ის შედარებაში უბრალოდ არ მონაწილეობს.
     */
    public function test_the_match_identity_is_the_osm_id(): void
    {
        $this->assertSame(['osm_id'], PublicDomain::MATCH['place']['columns']);
        $this->assertSame('visited', PublicDomain::MATCH['place']['done']);
    }

    /**
     * **ფოტო და ფაილები კვოტაზე გადიან და ჩანაწერთან ერთად თავისუფლდებიან.**
     *
     * ⚠️ **მოდელით ვშლით და არა endpoint-ით**: `PurgeService` სწორედ ასე
     * იქცევა (endpoint კალათაში აგზავნის), ე.ი. სწორედ ეს გზა უნდა
     * ათავისუფლებდეს დისკსა და კვოტას.
     */
    public function test_the_photo_and_files_are_released_with_the_place(): void
    {
        Storage::fake('public');

        $id = $this->postJson('/api/places', $this->payload([
            'photo' => UploadedFile::fake()->image('vardzia.jpg'),
        ]))->assertStatus(201)->json('data.id');

        $this->postJson("/api/places/{$id}/files", [
            'kind' => 'image',
            'files' => [UploadedFile::fake()->image('inside.jpg')],
        ])->assertStatus(201)->assertJsonPath('data.0.kind', 'image');

        $this->assertGreaterThan(0, (int) $this->user->fresh()->storage_used_bytes);

        Place::findOrFail($id)->delete();

        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
        $this->assertDatabaseCount('place_files', 0);
    }

    /** `DELETE /places/{id}` კალათაში აგზავნის და არაფერს ათავისუფლებს (FEAT-11) */
    public function test_deleting_moves_the_place_to_the_trash(): void
    {
        Storage::fake('public');

        $id = $this->postJson('/api/places', $this->payload([
            'photo' => UploadedFile::fake()->image('vardzia.jpg'),
        ]))->json('data.id');

        $before = (int) $this->user->fresh()->storage_used_bytes;

        $this->deleteJson("/api/places/{$id}")->assertNoContent();

        $this->getJson('/api/places')->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame($before, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * **ადგილი გალერეის მშობელია** — ვებიდან მოტანილი ფოტო მას ეკიდება
     * და ჩანაწერთან ერთად ქრება.
     */
    public function test_a_place_carries_gallery_photos(): void
    {
        Storage::fake('public');

        $place = Place::create($this->payload() + ['user_id' => $this->user->id]);

        GalleryImage::create([
            'user_id' => $this->user->id,
            'imageable_type' => 'place',
            'imageable_id' => $place->id,
            'source' => 'web',
            'category' => 'backdrop',
            'path' => 'gallery/images/p.jpg',
            'size' => 10,
        ]);

        $this->getJson("/api/places/{$place->id}")
            ->assertOk()
            ->assertJsonPath('data.photos_count', 1);

        $place->delete();

        $this->assertDatabaseCount('gallery_images', 0);
    }

    /** კატეგორიის წაშლა ადგილებს არ ღუპავს */
    public function test_deleting_a_category_moves_the_places(): void
    {
        $from = $this->category();
        $to = PlaceCategory::create([
            'user_id' => $this->user->id,
            'key' => 'target',
            'name_ka' => 'სამიზნე',
            'name_en' => 'Target',
            'sort_order' => 98,
        ]);

        $id = $this->postJson('/api/places', $this->payload(['category_id' => $from->id]))->json('data.id');

        $this->deleteJson("/api/place-categories/{$from->id}", ['move_to' => $to->id])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame($to->id, Place::findOrFail($id)->category_id);
    }

    /** ატვირთვა საცავის ბიბლიოთეკაში `place` მოდულად ჩანს */
    public function test_the_photo_appears_in_the_storage_library(): void
    {
        Storage::fake('public');

        $this->postJson('/api/places', $this->payload([
            'photo' => UploadedFile::fake()->image('vardzia.jpg'),
        ]))->assertStatus(201);

        $files = app(StorageMeter::class)->files($this->user->fresh());

        $this->assertTrue($files->contains(fn (array $f) => $f['module'] === 'place'));
    }

    /**
     * ⚠️ **წამში ერთი მოთხოვნა — Nominatim-ის ცხადი პოლიტიკაა.** ინტერვალი
     * ქეშშია, ე.ი. პარალელური გამომძახებელიც იცდის.
     */
    public function test_the_client_paces_itself(): void
    {
        $client = app(NominatimClient::class);
        $client->search('a');

        $this->assertNotNull(Cache::get('nominatim:last-call'));
    }
}
