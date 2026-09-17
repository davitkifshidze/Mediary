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
        $album = GalleryAlbum::create([
            'user_id' => $this->alice->id,
            'name' => 'ჩაკეტილი',
            'sort_order' => 1,
            'visibility' => 'public',
            'password_hash' => Hash::make('secret1'),
        ]);
        AlbumLock::flush();

        $this->postJson("/api/public/profiles/alice/albums/{$album->id}/unlock", ['password' => 'wrong'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'album_password_wrong');
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
