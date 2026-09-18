<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Support\AlbumLock;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **Tasks §7.4/§7.5/§7.11/§7.12 — საჯარო გალერეა და ჩაკეტილი ალბომი.**
 *
 * ორი წესი, რომელსაც ეს ფაილი იჭერს და რომელთა დარღვევაც **ჩუმია**:
 *
 * ⚠️ ფოტო საჯაროდ ჩანს მხოლოდ იმიტომ, რომ **მისი ჩანაწერი** საჯაროა —
 * ფოტოს საკუთარი `visibility` სვეტი არ აქვს და არც უნდა ჰქონდეს. ე.ი.
 * ჩანაწერის დამალვა ფოტოსაც მალავს; მეორე წყარო ამ ფაქტს გააშორებდა.
 *
 * ⚠️ `AlbumLock`-ის global scope `Auth::id()`-ს კითხულობს, ე.ი. **ანონიმზე
 * ის საერთოდ არ მუშაობს**. სანამ საჯაროდ გალერეიდან არაფერი იკითხებოდა,
 * ეს უვნებელი იყო; ამ ჩანართმა ის კარი გააღო — და პასუხი
 * `AlbumLock::hiddenIdsFor($owner->id)`-ია.
 */
class PublicGalleryTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->alice = User::create([
            'name' => 'alice',
            'username' => 'alice',
            'email' => 'alice@example.com',
            'password' => 'password',
        ]);

        // ⚠️ `profile_visibility` mass-assignable არაა — `forceFill` იგივე გზაა,
        // რასაც `PublicProfileTest` იყენებს
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();

        $ids = Module::whereIn('key', ['movie', 'gallery'])
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now(), 'is_public' => true]])
            ->all();
        $this->alice->modules()->sync($ids);
        $this->alice->refresh();
    }

    private function movie(string $visibility): Movie
    {
        return Movie::create([
            'user_id' => $this->alice->id,
            'year' => 2020,
            'visibility' => $visibility,
        ]);
    }

    private function photo(?Movie $parent, string $path, ?int $albumId = null): GalleryImage
    {
        return GalleryImage::create([
            'user_id' => $this->alice->id,
            'imageable_type' => $parent ? 'movie' : null,
            'imageable_id' => $parent?->id,
            'album_id' => $albumId,
            'path' => $path,
            'size' => 10,
            'width' => 100,
            'height' => 50,
        ]);
    }

    private function lockedPublicAlbum(string $password = 'secret1'): GalleryAlbum
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->alice->id,
            'name' => 'ჩაკეტილი',
            'sort_order' => 1,
            'visibility' => 'public',
            'password_hash' => Hash::make($password),
        ]);

        // სტატიკური მემო ერთ პროცესში ცოცხლობს — ახალი ლოკი უნდა დაინახოს
        AlbumLock::flush();

        return $album;
    }

    /**
     * **stateful ანონიმური მნახველი** — ე.ი. ბრაუზერი, და არა სკრიპტი.
     *
     * ⚠️ `/api`-ს სესია მხოლოდ stateful წყაროდან აქვს (Sanctum-ის cookie
     * რეჟიმი), ჩაკეტილი ალბომის „გახსნილობა" კი სწორედ სესიაშია — ამიტომ
     * უბრალო `postJson()` ახლა 409-ია (BUG-02) და გახსნას `Referer` სჭირდება.
     */
    private function spa(): self
    {
        return $this->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    /** ფოტო მშობლის ხილვადობას იმემკვიდრებს — არც მეტს, არც ნაკლებს */
    public function test_only_photos_of_public_records_are_shown(): void
    {
        $this->photo($this->movie('public'), 'gallery/images/open.jpg');
        $this->photo($this->movie('private'), 'gallery/images/hidden.jpg');

        $response = $this->getJson('/api/public/profiles/alice/gallery-photos')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
        $this->assertStringContainsString('open.jpg', $response->getContent());
        $this->assertStringNotContainsString('hidden.jpg', $response->getContent());
    }

    /**
     * **უმშობლო ფოტო მხოლოდ საჯარო ალბომით ჩანს (§7.5).**
     *
     * ⚠️ ეს ერთადერთი გამონაკლისია: მემკვიდრეობით მას არაფერი მოსდის.
     */
    public function test_a_parentless_photo_needs_a_public_album(): void
    {
        $private = GalleryAlbum::create(['user_id' => $this->alice->id, 'name' => 'პირადი', 'sort_order' => 1]);
        $public = GalleryAlbum::create([
            'user_id' => $this->alice->id, 'name' => 'საჯარო', 'sort_order' => 2, 'visibility' => 'public',
        ]);

        $this->photo(null, 'gallery/images/loose.jpg');
        $this->photo(null, 'gallery/images/in-private.jpg', $private->id);
        $this->photo(null, 'gallery/images/in-public.jpg', $public->id);

        $body = $this->getJson('/api/public/profiles/alice/gallery-photos')->assertOk()->getContent();

        $this->assertStringContainsString('in-public.jpg', $body);
        $this->assertStringNotContainsString('loose.jpg', $body);
        $this->assertStringNotContainsString('in-private.jpg', $body);
    }

    /**
     * **ჩაკეტილი ალბომი: რიგი ჩანს, ბილიკი არა (§7.11) — ანონიმზეც (§7.12).**
     *
     * ⚠️ სწორედ ეს ერთი ტესტი იჭერს „`Auth::id()` ანონიმზე ცარიელია"
     * ხაფანგს: ლოკს რომ მფლობელის id ცხადად არ გადასცემოდა, ეს პასუხი
     * ნამდვილ ბილიკს დააბრუნებდა.
     */
    public function test_a_locked_album_is_stripped_even_for_a_stranger(): void
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->alice->id,
            'name' => 'ჩაკეტილი',
            'sort_order' => 1,
            'visibility' => 'public',
            'password_hash' => Hash::make('secret1'),
        ]);
        AlbumLock::flush();

        $this->photo(null, 'gallery/locked/secret.jpg', $album->id);

        $response = $this->getJson('/api/public/profiles/alice/gallery-photos')->assertOk();

        $this->assertSame(1, $response->json('meta.total'), 'რიგი ჩანს — ბადე ბლარიან ფილას ხატავს');
        $this->assertTrue($response->json('data.0.locked'));
        $this->assertArrayNotHasKey('path', $response->json('data.0'));
        $this->assertStringNotContainsString('secret.jpg', $response->getContent());
    }

    /** არასწორი პაროლი — 422, და ბილიკი ისევ არ გამოდის */
    public function test_the_public_unlock_needs_the_right_password(): void
    {
        $album = $this->lockedPublicAlbum();

        $this->spa()
            ->postJson("/api/public/profiles/alice/albums/{$album->id}/unlock", ['password' => 'wrong'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'album_password_wrong');
    }

    /**
     * **სწორი პაროლი ხსნის და ფოტოც მაშინვე გამოდის** (Tasks BUG-02).
     *
     * ⚠️ ერთ ტესტში ორი მოთხოვნაა განზრახ: „გავხსენი" მხოლოდ მაშინ ნიშნავს
     * რამეს, თუ მომდევნო კითხვა ნამდვილ `path`-ს აბრუნებს. სესია ტესტებში
     * `array` დრაივერზეა, მაგრამ ერთი ტესტის შიგნით ინახება — `spa()`-ის
     * `Referer` კი ყველა შემდეგ მოთხოვნას stateful-ად ტოვებს.
     */
    public function test_the_public_unlock_opens_the_album(): void
    {
        $album = $this->lockedPublicAlbum();
        $this->photo(null, 'gallery/locked/secret.jpg', $album->id);

        $spa = $this->spa();

        $spa->postJson("/api/public/profiles/alice/albums/{$album->id}/unlock", ['password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('unlocked', true);

        $photos = $spa->getJson('/api/public/profiles/alice/gallery-photos')
            ->assertOk()
            ->assertJsonPath('data.0.locked', false);

        // სწორედ ეს იყო გატეხილი: „გავხსენი" მოდიოდა, რიგი კი გაშიშვლებული რჩებოდა
        $this->assertArrayHasKey('path', $photos->json('data.0'));
    }

    /**
     * **სესიის გარეშე პაროლი საერთოდ არ იცდება** (Tasks BUG-02).
     *
     * ⚠️ ორი სხვადასხვა ხვრელია და ორივეს ეს ერთი მცველი ხურავს: პასუხი
     * `unlocked: true`-ს ამბობდა, ალბომი კი ჩაკეტილი რჩებოდა (შედეგის
     * შესანახი სესია არ არსებობდა), და სწორედ იმიტომ, რომ შესანახი
     * არაფერი იყო, endpoint ქუქის გარეშე მომუშავე **პაროლის ორაკულად**
     * გამოდგებოდა — IP-ის როტაცია მის ერთადერთ დაცვას (throttle) არიდებს.
     *
     * ⚠️ `Hash::check`-ის არგაშვება ტესტდება და არა მხოლოდ სტატუსი:
     * 409-ის დაბრუნება პაროლის შემოწმების **შემდეგ** იმავე ორაკულს
     * დატოვებდა — უბრალოდ სხვა კოდით.
     */
    public function test_the_public_unlock_without_a_session_never_checks_the_password(): void
    {
        $album = $this->lockedPublicAlbum();

        Hash::spy();

        $this->postJson("/api/public/profiles/alice/albums/{$album->id}/unlock", ['password' => 'secret1'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'session_required');

        Hash::shouldNotHaveReceived('check');
    }

    /**
     * ⚠️ **პირადი ალბომის პაროლი საჯარო კარიდან საერთოდ არ იცდება** — თორემ
     * ეს endpoint სხვისი დამალული ალბომის გამოცნობის გზა გახდებოდა.
     */
    public function test_a_private_album_is_not_reachable_from_the_public_door(): void
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->alice->id,
            'name' => 'პირადი',
            'sort_order' => 1,
            'password_hash' => Hash::make('secret1'),
        ]);
        AlbumLock::flush();

        $this->postJson("/api/public/profiles/alice/albums/{$album->id}/unlock", ['password' => 'secret1'])
            ->assertStatus(404);
    }

    /**
     * **საჯარო ფოტოს ფაილი გამოდის** (Tasks DEBT-03) —
     * `GET /public/profiles/{u}/gallery-photos/{image}/file`.
     *
     * ⚠️ ეს **ერთადერთი ავტორიზაციის გარეშე მარშრუტია, რომელიც ფაილს
     * აბრუნებს**, ე.ი. მისი სამივე მცველი (პროფილი → მოდული → ჩანაწერი)
     * უტესტოდ იდგა. ოთხივე ქვემოთა ტესტი სწორედ იმ ხვრელებს ხურავს,
     * რომლებიც ჩუმად იხსნება: ჩავარდნა აქ 404-ის ნაცვლად **200-ია**.
     */
    public function test_a_public_photo_is_served_from_the_file_route(): void
    {
        Storage::fake('public');

        $image = $this->photo($this->movie('public'), 'gallery/images/open.jpg');
        Storage::disk('public')->put('gallery/images/open.jpg', 'jpeg-bytes');

        $response = $this->get("/api/public/profiles/alice/gallery-photos/{$image->id}/file")->assertOk();

        $this->assertSame('jpeg-bytes', $response->streamedContent());
    }

    /**
     * **ჩაკეტილი ალბომის ფაილი პაროლამდე 404-ია, შემდეგ — 200.**
     *
     * ⚠️ ფაილი **პირად დისკზეა** (`gallery/locked`, §7.9) — სწორედ ამიტომ
     * არსებობს ეს მარშრუტი: `/storage/*` იქ ვერ წვდება. ე.ი. ტესტი ერთსა
     * და იმავე ბილიკს ორჯერ ითხოვს და მხოლოდ სესიის მდგომარეობა იცვლება.
     *
     * ⚠️ 404 და არა 423: აქ ბაიტები გამოდის ან არა — „ეს ფოტო არსებობს"
     * თვითონაც ინფორმაციაა, და სიის endpoint უკვე ამბობს `locked: true`-ს.
     */
    public function test_a_locked_albums_file_is_404_until_the_password_is_given(): void
    {
        Storage::fake('private');

        $album = $this->lockedPublicAlbum();
        $image = $this->photo(null, 'gallery/locked/secret.jpg', $album->id);
        Storage::disk('private')->put('gallery/locked/secret.jpg', 'locked-bytes');

        $spa = $this->spa();

        $spa->get("/api/public/profiles/alice/gallery-photos/{$image->id}/file")->assertStatus(404);

        $spa->postJson("/api/public/profiles/alice/albums/{$album->id}/unlock", ['password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('unlocked', true);

        $response = $spa->get("/api/public/profiles/alice/gallery-photos/{$image->id}/file")->assertOk();

        $this->assertSame('locked-bytes', $response->streamedContent());

        /* ⚠️ **და არსად არ იკეშება** (Tasks GAP-08): ფაილი აქ მხოლოდ იმიტომ
           გამოვიდა, რომ პაროლი ამ სესიაში შეიყვანეს — შუამავალი მას სხვას
           მიაწვდიდა, ბრაუზერის კეში კი პაროლის მოხსნის შემდეგაც გახსნიდა. */
        $cache = (string) $response->headers->get('Cache-Control');
        $this->assertStringContainsString('no-store', $cache);
        $this->assertStringContainsString('private', $cache);
    }

    /**
     * ⚠️ **ჩვეულებრივი საჯარო ფოტო კი იკეშება** — თორემ „უსაფრთხოება" მთელ
     * გალერეას ნელს ხდიდა. სწორედ ეს წყვილი ამბობს, რომ `no-store` **ჩაკეტვის**
     * შედეგია და არა ამ მარშრუტის მუდმივი თვისება.
     */
    public function test_an_ordinary_public_photo_is_still_cacheable(): void
    {
        Storage::fake('public');

        $image = $this->photo($this->movie('public'), 'gallery/images/open.jpg');
        Storage::disk('public')->put('gallery/images/open.jpg', 'jpeg-bytes');

        $cache = (string) $this->get("/api/public/profiles/alice/gallery-photos/{$image->id}/file")
            ->assertOk()
            ->headers->get('Cache-Control');

        $this->assertStringNotContainsString('no-store', $cache);
    }

    /**
     * **სხვისი ფოტოს id ალისის მისამართზე — 404.**
     *
     * ⚠️ `{image}` მხოლოდ რიცხვია და მოდელი როუტში **განზრახ არ იბმება**
     * (`EnsureRecordOwnership` ანონიმს მფლობელად ვერ ჩათვლის), ე.ი.
     * „ეს ფოტო ამ პროფილისაა" ერთადერთი შემოწმებაა — და ის
     * `PublicGallery::visible()`-შია. ბობის პროფილიც საჯაროა, ე.ი. ტესტი
     * ნამდვილად კვეთს პროფილებს და არა უბრალოდ „დამალულ მონაცემს".
     */
    public function test_another_profiles_photo_is_404_on_alices_file_route(): void
    {
        Storage::fake('public');

        $bob = User::create([
            'name' => 'bob', 'username' => 'bob', 'email' => 'bob@example.com', 'password' => 'password',
        ]);
        $bob->forceFill(['profile_visibility' => 'public'])->save();

        $movie = Movie::create(['user_id' => $bob->id, 'year' => 2021, 'visibility' => 'public']);
        $image = GalleryImage::create([
            'user_id' => $bob->id,
            'imageable_type' => 'movie',
            'imageable_id' => $movie->id,
            'path' => 'gallery/images/bob.jpg',
            'size' => 10,
        ]);
        Storage::disk('public')->put('gallery/images/bob.jpg', 'bob-bytes');

        $this->get("/api/public/profiles/alice/gallery-photos/{$image->id}/file")->assertStatus(404);
    }

    /**
     * ერთი გადამრთველი მთელ მექანიზმს თიშავს — ფაილის მარშრუტსაც.
     *
     * ⚠️ `PUBLIC_PROFILES=false` `resolve()`-ს `null`-ს აბრუნებინებს, ე.ი.
     * ეს ტესტი იმას იჭერს, რომ ახალი endpoint **პროფილს ჭეშმარიტად
     * `resolve()`-ით პოულობს** და არა პირდაპირი `User::where(...)`-ით.
     */
    public function test_the_file_route_is_404_when_public_profiles_are_off(): void
    {
        Storage::fake('public');

        $image = $this->photo($this->movie('public'), 'gallery/images/open.jpg');
        Storage::disk('public')->put('gallery/images/open.jpg', 'jpeg-bytes');

        config(['mediary.public_profiles' => false]);

        $this->get("/api/public/profiles/alice/gallery-photos/{$image->id}/file")->assertStatus(404);
    }

    /** გალერეის მოდული საჯარო არაა → ჩანართიც არ არსებობს */
    public function test_the_gallery_tab_needs_the_module_to_be_public(): void
    {
        $id = Module::where('key', 'gallery')->value('id');
        $this->alice->modules()->syncWithoutDetaching([$id => ['is_public' => false]]);

        $this->getJson('/api/public/profiles/alice/gallery-photos')->assertStatus(404);
    }

    /**
     * **საჯარო გალერეა ჩანაწერების რიცხვზე არ არის დამოკიდებული** (Tasks PERF-02).
     *
     * ⚠️ `publicCastIds()` ყოველ საჯარო ჩანაწერზე ცალკე `$record->cast()->pluck()`-ს
     * უშვებდა. გაზომილი გასწორებამდე: 5 ფილმზე 16 query, 25-ზე 36, 60-ზე 71 —
     * ე.ი. 500 საჯარო ფილმზე ~500 query **ერთ ანონიმურ გახსნაზე**.
     *
     * ⚠️ **და ეს `auth:sanctum`-ის გარეთაა** — ერთადერთი დომენური endpoint,
     * რომელსაც ავტორიზაციის გარეშე გამოიძახებ. ე.ი. წრფივი ზრდა აქ არა
     * მხოლოდ ნელი გვერდია, არამედ იაფი DoS-ვექტორიც.
     *
     * ⚠️ **გაზომვამდე ერთი „გასათბობი" მოთხოვნა ხდება.** პირველი გამოძახება
     * ერთჯერად query-ებსაც აკეთებს (მოდულების კეში), ე.ი. მის გარეშე ტესტი
     * ორ სხვადასხვა რამეს ადარებდა და ცრუ განსხვავებას აჩვენებდა.
     */
    public function test_the_public_gallery_does_not_query_per_record(): void
    {
        $cast = CastMember::create(['name' => 'Somebody']);
        $made = 0;

        $count = function (int $target) use ($cast, &$made): int {
            while ($made < $target) {
                $made++;
                $movie = $this->movie('public');
                $movie->cast()->attach($cast->id, ['billing_order' => 1]);
                $this->photo($movie, "gallery/images/perf{$made}.jpg");
            }

            $this->getJson('/api/public/profiles/alice/gallery-photos')->assertOk();  // გასათბობი

            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/public/profiles/alice/gallery-photos')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $few = $count(4);
        $many = $count(30);

        $this->assertSame($few, $many, 'query-ების რაოდენობა ჩანაწერების რიცხვს მიჰყვება');
    }
}
