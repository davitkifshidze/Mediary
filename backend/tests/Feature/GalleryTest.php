<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\Song;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Tasks 10 — გალერეის მოდული: გეგმა/შეფასება, ჩანაწერის ფოტოები,
 * მსახიობების ფოტოები (ყველა/ქალი/კაცი/კონკრეტული), კვოტის ზღვარი,
 * წაშლა და „მთავარად დაყენება".
 */
class GalleryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        config(['services.tmdb.key' => 'test-key']);

        $this->user = User::create([
            'name' => 'gia',
            'username' => 'gia',
            'email' => 'gia@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(
            Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all()
        );
        $this->user = $this->user->refresh();
    }

    private function makeMovie(string $title, ?int $tmdbId = 550): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => $tmdbId, 'year' => 1999]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie->refresh();
    }

    /** ორი მსახიობი — ერთი ქალი, ერთი კაცი (TMDB-ის კოდირება: 1/2) */
    private function attachCast(Movie $movie): array
    {
        $female = CastMember::create(['tmdb_person_id' => 11, 'name' => 'Helena', 'gender' => 1]);
        $male = CastMember::create(['tmdb_person_id' => 22, 'name' => 'Edward', 'gender' => 2]);

        $movie->cast()->sync([
            $female->id => ['character' => 'Marla', 'billing_order' => 0],
            $male->id => ['character' => 'Narrator', 'billing_order' => 1],
        ]);

        return [$female, $male];
    }

    /** ერთი ფოტო პირდაპირ ბაზაში — ჩამოტვირთვის გარეშე (ჭრილების ტესტები) */
    private function image(Model $parent, string $category): GalleryImage
    {
        return $parent->galleryImages()->create([
            'user_id' => $this->user->id,
            'source' => 'tmdb',
            'category' => $category,
            'path' => 'gallery/images/'.uniqid().'.jpg',
            'size' => 1024,
        ]);
    }

    /**
     * TMDB-ისა და სურათების fake. ჩანაწერზე ორი backdrop და ერთი poster,
     * მსახიობზე პროფილები. „ბაიტები" კონტროლირებადი ზომისაა, რომ კვოტა
     * ზუსტად შევამოწმოთ.
     */
    private function fakeTmdb(int $imageBytes = 1024): void
    {
        Http::fake([
            'api.themoviedb.org/3/movie/*/images*' => Http::response([
                'backdrops' => [
                    ['file_path' => '/a.jpg', 'vote_average' => 5.0, 'width' => 1920, 'height' => 1080],
                    ['file_path' => '/b.jpg', 'vote_average' => 9.0, 'width' => 1280, 'height' => 720],
                ],
                'posters' => [['file_path' => '/p.jpg', 'vote_average' => 1.0, 'width' => 500, 'height' => 750]],
                'logos' => [],
            ]),
            'api.themoviedb.org/3/person/11/images*' => Http::response([
                'profiles' => [
                    ['file_path' => '/helena1.jpg', 'vote_average' => 8.0, 'width' => 600, 'height' => 900],
                    ['file_path' => '/helena2.jpg', 'vote_average' => 3.0, 'width' => 600, 'height' => 900],
                ],
            ]),
            'api.themoviedb.org/3/person/22/images*' => Http::response([
                'profiles' => [['file_path' => '/edward1.jpg', 'vote_average' => 7.0]],
            ]),
            'api.themoviedb.org/3/movie/*/credits*' => Http::response([
                'cast' => [
                    ['id' => 11, 'name' => 'Helena', 'gender' => 1, 'profile_path' => '/helena1.jpg'],
                    ['id' => 22, 'name' => 'Edward', 'gender' => 2, 'profile_path' => '/edward1.jpg'],
                ],
            ]),
            'image.tmdb.org/*' => Http::response(str_repeat('x', $imageBytes)),
        ]);
    }

    public function test_plan_estimates_size_and_counts_records_without_tmdb_id(): void
    {
        $this->makeMovie('With TMDB');
        $this->makeMovie('No TMDB', null);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', ['type' => 'movie', 'limit' => 10])
            ->assertOk()
            ->json();

        $this->assertSame(1, $body['count']);
        $this->assertSame(1, $body['skipped_without_tmdb']);
        /* ზედა ზღვარი: 10 ფოტო × w780-ის საშუალო; მსახიობები default-ად არ ჩამოდის.
           ⚠️ საშუალოები §8.2-ში გადაიზომა (w780 = 150 KiB) — რიცხვი აქ იმიტომ
           წერია ხელით, რომ ცხრილის ცვლილება ჩუმად არ გაიაროს. */
        $this->assertSame(10 * 150 * 1024, $body['estimated_bytes']);
        $this->assertTrue($body['fits']);
        $this->assertSame(['stills'], $body['options']['subjects']);
        $this->assertSame('none', $body['options']['cast']);
    }

    /**
     * **ჩანაწერის ტაბი მსახიობებს არ ეხება** (Tasks §3.1).
     *
     * ⚠️ ადრე ერთ გეგმაში ორივე ჯამდებოდა, ე.ი. „ფილმის ფოტოები" ჩუმად
     * მსახიობების ფოტოებსაც ნიშნავდა. ახლა `cast`-ის გამოგზავნაც კი
     * არაფერს ცვლის — ტაბის ჯამი და ჩამოტვირთვა ერთ რიცხვზე დგას.
     */
    public function test_record_plan_ignores_cast_options(): void
    {
        $movie = $this->makeMovie('With TMDB');
        $this->attachCast($movie);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'type' => 'movie',
                'limit' => 10,
                'cast' => 'all',
                'actors' => 5,
                'per_actor' => 2,
            ])
            ->assertOk()
            ->json();

        $this->assertSame('none', $body['options']['cast']);
        $this->assertSame(10 * 150 * 1024, $body['estimated_bytes']);
    }

    /** მსახიობების ტაბის შეფასება: მსახიობი × ფოტო მსახიობზე × პორტრეტის ზომა */
    public function test_actor_plan_estimate_follows_the_cast_size(): void
    {
        $movie = $this->makeMovie('With TMDB');
        $this->attachCast($movie);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'type' => 'movie',
                'cast' => 'all',
                'per_actor' => 2,
                'cast_size' => 'w185',
            ])
            ->assertOk()
            ->json();

        $this->assertSame(2, $body['count']);
        $this->assertSame('w185', $body['options']['cast_size']);
        $this->assertSame(2 * 2 * 25 * 1024, $body['estimated_bytes']);
    }

    /**
     * **„საიდან მოვიდა" ჭრილი** (§4.1): ერთ ჯგუფში ჩანაწერის საკუთარი
     * ფოტოებიც ითვლება და მისი მსახიობების პორტრეტებიც.
     *
     * ⚠️ მსახიობის ფოტოს მშობელი **მსახიობია** და არა ჩანაწერი, ე.ი.
     * „ფილმიდან მოვიდა თუ სერიალიდან" მხოლოდ იმით ითვლება, სად თამაშობს ის —
     * და ჯგუფის რიცხვი შიგთავსს უნდა ემთხვეოდეს.
     */
    public function test_source_groups_count_record_and_cast_photos(): void
    {
        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $this->image($movie, 'backdrop');
        $this->image($female, 'actor');
        $this->image($female, 'actor');

        $body = $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=source')
            ->assertOk()
            ->json();

        $this->assertSame('source', $body['by']);
        $this->assertCount(1, $body['groups']);
        $this->assertSame('movie', $body['groups'][0]['kind']);
        $this->assertSame('movie', $body['groups'][0]['from']);
        $this->assertSame(3, $body['groups'][0]['photos']);

        // შიგნით შესვლა იმავე რიცხვს უნდა აჩვენებდეს
        $photos = $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?from=movie&per_page=50')
            ->assertOk()
            ->json();

        $this->assertSame(3, $photos['meta']['total']);
    }

    /**
     * **ანიმეც ისევე მუშაობს, როგორც ფილმი და სერიალი** (§3-ის პირობა).
     *
     * ⚠️ ადრე `GalleryFetcher` `Movie|Series`-ს ითხოვდა და `instanceof Series`-ით
     * წყვეტდა, `/movie/*` იყოს თუ `/tv/*` — ე.ი. ანიმეზე ჩამოტვირთვა
     * **ტიპის შეცდომით ვარდებოდა**, გალერეა კი მოდულში ჩანდა.
     */
    public function test_anime_uses_the_tv_endpoints(): void
    {
        $this->user->modules()->syncWithoutDetaching(
            Module::where('key', 'anime')->pluck('id')->all()
        );

        Http::fake([
            'api.themoviedb.org/3/tv/*/images*' => Http::response([
                'backdrops' => [['file_path' => '/anime.jpg', 'vote_average' => 5.0]],
                'posters' => [],
            ]),
            'image.tmdb.org/*' => Http::response('xxxx'),
        ]);

        $anime = Anime::create(['user_id' => $this->user->id, 'tmdb_id' => 42, 'year' => 2001]);

        $body = $this->actingAs($this->user->refresh())
            ->postJson("/api/gallery/anime/{$anime->id}", ['subjects' => ['stills'], 'limit' => 5])
            ->assertOk()
            ->json();

        $this->assertSame(1, $body['added']);
        $this->assertSame(1, GalleryImage::where('imageable_type', 'anime')->count());

        // ბრტყელ სიაში მშობელი უნდა იცნობოდეს — ანიმე იქ არ ერია
        $photos = $this->actingAs($this->user)
            ->getJson("/api/gallery/photos?owner=anime:{$anime->id}")
            ->assertOk()
            ->json();

        $this->assertSame('anime', $photos['data'][0]['owner']['kind']);
    }

    /**
     * **ავზი სკოუპს მიჰყვება** (§3.2): ერთ ფილმზე მიბმული ტაბი მეორე
     * ფილმის მსახიობს ვერ აჩვენებს — სწორედ ეს ნიშნავს „ამ ჩანაწერის
     * მსახიობებს".
     */
    public function test_actor_plan_pool_is_limited_to_the_scoped_records(): void
    {
        $first = $this->makeMovie('Fight Club');
        [$female, $male] = $this->attachCast($first);

        $second = $this->makeMovie('Se7en');
        $other = CastMember::create(['tmdb_person_id' => 33, 'name' => 'Morgan', 'gender' => 2]);
        $second->cast()->sync([$other->id => ['billing_order' => 0]]);

        $scoped = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'type' => 'movie',
                'ids' => [$first->id],
                'cast' => 'all',
            ])
            ->assertOk()
            ->json();

        $this->assertEqualsCanonicalizing(
            [$female->id, $male->id],
            array_column($scoped['cast'], 'id'),
        );
        $this->assertSame(2, $scoped['count']);

        // სკოუპის გარეშე — მთელი დომენი
        $all = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', ['target' => 'actor', 'type' => 'movie', 'cast' => 'all'])
            ->assertOk()
            ->json();

        $this->assertSame(3, $all['count']);
    }

    /**
     * **მსახიობების სამიზნე** — ავზი მთელი ბიბლიოთეკიდან იკრიბება და სქესით
     * იჭრება; ერთეული რიგში **მსახიობია** და არა ჩანაწერი.
     */
    public function test_actor_plan_collects_library_cast_and_filters_by_gender(): void
    {
        $movie = $this->makeMovie('Fight Club');
        [$female, $male] = $this->attachCast($movie);

        // ბიბლიოთეკის გარეთ მყოფი მსახიობი ავზში არ უნდა მოხვდეს
        CastMember::create(['tmdb_person_id' => 99, 'name' => 'Stranger', 'gender' => 1]);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'cast' => 'female',
                'per_actor' => 4,
            ])
            ->assertOk()
            ->json();

        $this->assertSame('actor', $body['target']);
        $this->assertSame(1, $body['count']);
        $this->assertSame('actor', $body['items'][0]['type']);
        $this->assertSame($female->id, $body['items'][0]['id']);
        // შეფასება მხოლოდ მსახიობის ფოტოებზეა (ჩანაწერის ლიმიტს არ ითვლის)
        $this->assertSame(4 * 70 * 1024, $body['estimated_bytes']);
        // არჩევანის სია ორივე მსახიობს აჩვენებს, უცხოს კი არა
        $this->assertEqualsCanonicalizing(
            [$female->id, $male->id],
            array_column($body['cast'], 'id'),
        );
        $this->assertFalse($body['cast_truncated']);
    }

    /** „კონკრეტული მსახიობები" — ჭერს არ ექვემდებარება, ძებნა სახელზე მუშაობს */
    public function test_actor_plan_selected_ignores_actor_cap_and_supports_search(): void
    {
        $movie = $this->makeMovie('Fight Club');
        [$female, $male] = $this->attachCast($movie);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'cast' => 'selected',
                'cast_ids' => [$female->id, $male->id],
                // ⚠️ ჭერი 1-ია, მაგრამ ხელით მონიშნულს არ ეხება
                'actors' => 1,
            ])
            ->assertOk()
            ->json();

        $this->assertSame(2, $body['count']);

        $searched = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'cast' => 'all',
                'cast_q' => 'Edw',
            ])
            ->assertOk()
            ->json();

        $this->assertSame([$male->id], array_column($searched['cast'], 'id'));
        $this->assertSame(1, $searched['count']);
    }

    /**
     * TMDB-ის პირის id-ის გარეშე მსახიობი გალერეას ვერ მიიღებს — ჩუმად არ
     * ვაგდებთ, `skipped_without_tmdb`-ში ითვლება (როგორც ჩანაწერზე).
     */
    public function test_actor_plan_counts_cast_without_tmdb_id(): void
    {
        $movie = $this->makeMovie('Fight Club');
        $local = CastMember::create(['name' => 'Local Only']);
        $movie->cast()->sync([$local->id => ['billing_order' => 0]]);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', ['target' => 'actor', 'cast' => 'all'])
            ->assertOk()
            ->json();

        $this->assertSame(0, $body['count']);
        $this->assertSame(1, $body['skipped_without_tmdb']);
    }

    /** ჩანაწერის ფოტოები: ხმებით დალაგება, ლიმიტი და ხელახლა გაშვებაზე დუბლის გამოტოვება */
    public function test_fetch_downloads_record_images_and_skips_duplicates_on_rerun(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(2048);
        $movie = $this->makeMovie('Fight Club');

        $first = $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", ['subjects' => ['stills'], 'limit' => 2])
            ->assertOk()
            ->json();

        $this->assertSame(2, $first['added']);
        $this->assertSame(2 * 2048, $first['bytes']);
        $this->assertFalse($first['quota_exceeded']);

        $images = GalleryImage::withoutGlobalScope('owner')->orderBy('id')->get();
        $this->assertCount(2, $images);
        // ყველაზე მაღალი ხმა პირველი — /b.jpg (9.0) მერე /a.jpg (5.0)
        $this->assertSame('/b.jpg', $images[0]->remote_path);
        $this->assertSame('tmdb', $images[0]->source);
        $this->assertSame('backdrop', $images[0]->category);
        $this->assertSame('movie', $images[0]->imageable_type);
        $this->assertSame(1280, $images[0]->width);
        Storage::disk('public')->assertExists($images[0]->path);

        // მრიცხველი რეალურ ბაიტებს ითვლის
        $used = (int) $this->user->refresh()->storage_used_bytes;
        $this->assertSame(2 * 2048, $used);
        $this->assertSame($used, app(StorageMeter::class)->recalculate($this->user->refresh()));

        // ხელახლა, პოსტერებითაც: არსებული ორი გამოტოვდება, პოსტერი დაემატება
        $second = $this->actingAs($this->user->refresh())
            ->postJson("/api/gallery/movie/{$movie->id}", [
                'subjects' => ['stills', 'posters'],
                'limit' => 3,
            ])
            ->assertOk()
            ->json();

        $this->assertSame(1, $second['added']);
        $this->assertSame(2, $second['skipped']);
        $this->assertSame('poster', GalleryImage::withoutGlobalScope('owner')->latest('id')->first()->category);
    }

    /**
     * მსახიობების ფოტოები: მშობელი **მსახიობია** (ე.ი. მისივე გვერდზე ჩანს),
     * ფოტოს ჭერი მსახიობზე მუშაობს.
     */
    public function test_cast_photos_attach_to_the_actor(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(512);
        $movie = $this->makeMovie('Fight Club');
        [$female, $male] = $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", [
                'subjects' => [],
                'cast' => 'all',
                'per_actor' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('added', 2);

        $images = GalleryImage::withoutGlobalScope('owner')->get();
        $this->assertCount(2, $images);
        $this->assertSame(['cast_member'], $images->pluck('imageable_type')->unique()->values()->all());
        $this->assertEqualsCanonicalizing(
            [$female->id, $male->id],
            $images->pluck('imageable_id')->map(fn ($id) => (int) $id)->all(),
        );
        // ხმებით: /helena1.jpg (8.0) მოდის და არა /helena2.jpg (3.0)
        $this->assertSame('/helena1.jpg', $images->firstWhere('imageable_id', $female->id)->remote_path);
        $this->assertSame('actor', $images[0]->category);
    }

    /** „ქალი მსახიობები" — მხოლოდ `gender = 1` */
    public function test_cast_can_be_filtered_by_gender(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(256);
        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", [
                'subjects' => [],
                'cast' => 'female',
                'per_actor' => 2,
            ])
            ->assertOk()
            ->assertJsonPath('added', 2);

        $this->assertSame(
            [$female->id, $female->id],
            GalleryImage::withoutGlobalScope('owner')->pluck('imageable_id')->map(fn ($id) => (int) $id)->all(),
        );
    }

    /** სქესი ცარიელია (ძველი ჩანაწერი) → credits-ის ერთი რექვესთით ივსება */
    public function test_missing_gender_is_backfilled_from_credits(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(256);
        $movie = $this->makeMovie('Fight Club');
        [$female, $male] = $this->attachCast($movie);
        CastMember::whereKey([$female->id, $male->id])->update(['gender' => null]);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", [
                'subjects' => [],
                'cast' => 'male',
                'per_actor' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('added', 1);

        $this->assertSame(2, $male->refresh()->gender);
        $this->assertSame(1, $female->refresh()->gender);
        $this->assertSame(
            $male->id,
            (int) GalleryImage::withoutGlobalScope('owner')->firstOrFail()->imageable_id,
        );
    }

    /** „კონკრეტული მსახიობი" — მხოლოდ არჩეული id-ები */
    public function test_specific_cast_selection(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(256);
        $movie = $this->makeMovie('Fight Club');
        [, $male] = $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", [
                'subjects' => [],
                'cast' => 'selected',
                'cast_ids' => [$male->id],
                'per_actor' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('added', 1);

        $this->assertSame(
            $male->id,
            (int) GalleryImage::withoutGlobalScope('owner')->firstOrFail()->imageable_id,
        );
    }

    /** მსახიობის გვერდი: საკუთარი endpoint-ით ჩამოტვირთვა და ნახვა */
    public function test_actor_gallery_endpoints(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(256);
        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/cast/{$female->id}", ['per_actor' => 2])
            ->assertOk()
            ->assertJsonPath('added', 2);

        $this->actingAs($this->user)
            ->getJson("/api/gallery/cast/{$female->id}")
            ->assertOk()
            ->assertJsonCount(2, 'images')
            ->assertJsonPath('actor.gender', 1)
            ->assertJsonPath('bytes', 512);

        // მსახიობის ფოტო ჩანაწერის გვერდზეც ჩანს (მსახიობთა ჭრილში)
        $this->actingAs($this->user)
            ->getJson("/api/gallery/movie/{$movie->id}")
            ->assertOk()
            ->assertJsonCount(0, 'images')
            ->assertJsonCount(2, 'cast_images')
            ->assertJsonPath('cast_images.0.actor.name', 'Helena')
            ->assertJsonPath('cast.0.photos', 2);
    }

    /** კვოტის ამოწურვაზე ნაკადი **ჩერდება** და 413-ს აბრუნებს (Tasks 10 / 17.3) */
    public function test_quota_stops_the_flow_with_413(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(4096);
        $movie = $this->makeMovie('Fight Club');

        // ერთ ფოტოზე მეტი ვერ ჩაჯდება
        $this->user->forceFill(['storage_quota_bytes' => 5000])->save();

        $body = $this->actingAs($this->user->refresh())
            ->postJson("/api/gallery/movie/{$movie->id}", ['limit' => 3])
            ->assertStatus(413)
            ->assertJsonPath('message', 'storage_quota_exceeded')
            ->json();

        $this->assertSame(1, $body['added']);
        $this->assertTrue($body['quota_exceeded']);
        // ნახევრად ჩამოტვირთული ინახება — ჩუმად არ იშლება
        $this->assertSame(1, GalleryImage::withoutGlobalScope('owner')->count());
        $this->assertSame(4096, (int) $this->user->refresh()->storage_used_bytes);
    }

    /** სია, წაშლა და „მთავარად დაყენება" */
    public function test_list_set_primary_and_delete(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(1024);
        $movie = $this->makeMovie('Fight Club');

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", ['limit' => 2])
            ->assertOk();

        /* §8.3 — `GET /api/gallery` ახლა **შეჯამებაა** და აღარ არის
           „ჩანაწერების სია ჩამოსატვირთად": ხაზით გაყოფილი „მასობრივი
           ჩამოტვირთვის" ბლოკი მოიხსნა, ე.ი. იმ სიას გამომძახებელი აღარ ჰყავს. */
        $this->actingAs($this->user)
            ->getJson('/api/gallery')
            ->assertOk()
            ->assertJsonPath('photos', 2)
            ->assertJsonPath('bytes', 2048)
            ->assertJsonPath('records', 1)
            ->assertJsonPath('actors', 0)
            ->assertJsonPath('videos', 0);

        $images = $this->actingAs($this->user)
            ->getJson("/api/gallery/movie/{$movie->id}")
            ->assertOk()
            ->assertJsonCount(2, 'images')
            ->json('images');

        $id = $images[0]['id'];

        // მთავარად დაყენება: პოსტერი გალერეის ფაილზე მიდის, `poster_source` = tmdb
        // (თორემ 'upload' იმავე ფაილს კვოტაში მეორედ დათვლიდა)
        $this->actingAs($this->user)
            ->postJson("/api/gallery/images/{$id}/primary")
            ->assertOk()
            ->assertJsonPath('poster_path', $images[0]['url']);

        $movie->refresh();
        $this->assertSame('tmdb', $movie->poster_source);
        $this->assertSame(2048, (int) $this->user->refresh()->storage_used_bytes);

        // წაშლა: ფაილიც, კვოტაც და დაკიდებული პოსტერიც
        $this->actingAs($this->user)->deleteJson("/api/gallery/images/{$id}")->assertNoContent();

        $movie->refresh();
        $this->assertNull($movie->poster_path);
        $this->assertSame(1024, (int) $this->user->refresh()->storage_used_bytes);
        Storage::disk('public')->assertMissing($images[0]['url']);
    }

    /**
     * Tasks §3.2/§3.3/§3.7 — გალერეა ნამდვილი გვერდია: ჯგუფები და
     * გვერდებიანი ფოტოები.
     *
     * ⚠️ ეს ის ხვრელია, რომელიც „გალერეაში არაფერი არ მოდის"-ად ჩანდა:
     * ჩამოტვირთვა მუშაობდა, ფოტოს ჩვენება კი მხოლოდ ჩანაწერისა და
     * მსახიობის გვერდზე იყო.
     */
    public function test_groups_and_paginated_photos(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(512);
        $movie = $this->makeMovie('Fight Club');
        $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", ['limit' => 3, 'cast' => 'all', 'per_actor' => 2])
            ->assertOk();

        // ჩანაწერების ჭრილი — ჯგუფში ჩანაწერის საკუთარი ფოტოებია
        $groups = $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=record')
            ->assertOk()
            ->assertJsonPath('groups.0.kind', 'movie')
            ->json();

        $this->assertSame($movie->id, $groups['groups'][0]['id']);
        $this->assertNotEmpty($groups['previews']['movie:'.$movie->id]);

        // მსახიობების ჭრილი — ორი მსახიობი, თითო ორი ფოტოთი
        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=actor')
            ->assertOk()
            ->assertJsonCount(2, 'groups')
            ->assertJsonPath('groups.0.kind', 'actor')
            ->assertJsonPath('groups.0.photos', 2);

        /* ფილმზე შესვლა: საკუთარი 2 (`stills` — ნაგულისხმევი ნაკრები) +
           მსახიობების 3 = 5; გვერდზე 4 (§3.7) */
        $page = $this->actingAs($this->user)
            ->getJson("/api/gallery/photos?owner=movie:{$movie->id}&per_page=4")
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('meta.total', 5)
            ->assertJsonPath('meta.last_page', 2)
            ->json();

        $this->assertNotNull($page['data'][0]['owner']);

        // მსახიობების გარეშე — მხოლოდ ჩანაწერის ორი
        $this->actingAs($this->user)
            ->getJson("/api/gallery/photos?owner=movie:{$movie->id}&with_cast=0")
            ->assertOk()
            ->assertJsonPath('meta.total', 2);

        // ყველა ფოტო ერთად + კატეგორიით ფილტრი
        $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?per_page=100')
            ->assertOk()
            ->assertJsonPath('meta.total', 5);

        $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?category=actor&per_page=100')
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }

    /**
     * **ეტაპი 2 — „ფოტოიანი / უფოტო".**
     *
     * ⚠️ ჯგუფების სია ყოველთვის `has('galleryImages')`-ით იწყებოდა, ე.ი.
     * სწორედ ის ჩანაწერები არსად ჩანდა, რომლებისთვისაც ჩამოტვირთვა არსებობს
     * („რომელ ფილმს არ აქვს ფოტო" კითხვას გალერეაში პასუხი არ ჰქონდა).
     */
    public function test_records_cut_lists_records_without_photos(): void
    {
        $withPhoto = $this->makeMovie('Fight Club');
        $without = $this->makeMovie('Se7en', 807);
        $this->image($withPhoto, 'backdrop');

        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=record')
            ->assertOk()
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.id', $withPhoto->id);

        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=record&have=without')
            ->assertOk()
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.id', $without->id)
            ->assertJsonPath('groups.0.photos', 0);

        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=record&have=all')
            ->assertOk()
            ->assertJsonCount(2, 'groups');
    }

    /**
     * **ეტაპი 2 — ჟანრი/წელი/სტატუსი და შიდა დაჯგუფების საკვები.**
     *
     * ⚠️ სამივე ველი **ჯგუფშივე** ბრუნდება: სექციებად დაყოფა ფრონტზე ხდება
     * და თითო ბარათზე ცალკე მოთხოვნა ასჯერ გაიგზავნებოდა.
     */
    public function test_record_groups_filter_by_genre_year_and_status(): void
    {
        $drama = Genre::create(['slug' => 'drama']);
        $drama->translations()->create(['locale' => 'ka', 'name' => 'დრამა']);
        $drama->translations()->create(['locale' => 'en', 'name' => 'Drama']);

        $old = $this->makeMovie('Fight Club');          // year 1999
        $new = $this->makeMovie('Dune', 438631);
        $new->year = 2021;
        $new->save();

        $old->genres()->sync([$drama->id]);
        $this->image($old, 'backdrop');
        $this->image($new, 'backdrop');

        $old->applyStatusKey('watched');
        $old->save();

        // ჟანრი
        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=record&genre=drama')
            ->assertOk()
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.id', $old->id)
            ->assertJsonPath('groups.0.genres.0.slug', 'drama');

        // წელი
        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=record&year_min=2000')
            ->assertOk()
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.id', $new->id)
            ->assertJsonPath('groups.0.year', 2021);

        /* სტატუსი — ⚠️ **ობიექტია და არა სტრიქონი** (§6.4): სახელი
           მფლობელის ლექსიკონშია და გასაღები მარტო არაფერს ამბობს */
        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=record&status=watched')
            ->assertOk()
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.id', $old->id)
            ->assertJsonPath('groups.0.status.key', 'watched')
            ->assertJsonPath('groups.0.status.role', 'done');
    }

    /**
     * **ეტაპი 2 — მსახიობების ჭრილი დომენით.**
     *
     * შენი სიტყვები: „ფილმების გალერეა, სადაც უნდა იყოს როგორც ფილმები
     * ასევე მსახიობები შიგნით". ⚠️ ფოტო **მსახიობზეა** მიბმული (ერთი ფოტო
     * ორ ფილმზე არ დუბლირდება), ე.ი. „რომელი დომენისაა" მხოლოდ იმით
     * გამოითვლება, სად თამაშობს ეს ადამიანი.
     */
    public function test_actor_groups_can_be_cut_by_domain(): void
    {
        $this->user->modules()->syncWithoutDetaching(Module::where('key', 'anime')->pluck('id')->all());
        $this->user = $this->user->refresh();

        $movie = $this->makeMovie('Fight Club');
        [$female, $male] = $this->attachCast($movie);

        $anime = Anime::create(['user_id' => $this->user->id, 'tmdb_id' => 30, 'year' => 2016]);
        $anime->translations()->create(['locale' => 'en', 'title' => 'Your Name']);
        $other = CastMember::create(['tmdb_person_id' => 33, 'name' => 'Mone', 'gender' => 1]);
        $anime->cast()->sync([$other->id => ['billing_order' => 0]]);

        foreach ([$female, $male, $other] as $member) {
            $this->image($member, 'actor');
        }

        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=actor')
            ->assertOk()
            ->assertJsonCount(3, 'groups');

        $ids = collect(
            $this->actingAs($this->user)
                ->getJson('/api/gallery/groups?by=actor&from=movie')
                ->assertOk()
                ->assertJsonCount(2, 'groups')
                ->json('groups')
        )->pluck('id')->all();

        sort($ids);
        $this->assertSame([$female->id, $male->id], $ids);

        $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=actor&from=anime')
            ->assertOk()
            ->assertJsonCount(1, 'groups')
            ->assertJsonPath('groups.0.id', $other->id);
    }

    /**
     * Tasks §3.6 — რიცხვი სამიზნეზეა და **0 „არცერთს" ნიშნავს**.
     *
     * ⚠️ ადრე `clamp()` ნულს ნაგულისხმევზე აბრუნებდა, ე.ი. „მსახიობზე
     * არცერთი" ჩუმად სამ ფოტოდ იქცეოდა.
     */
    public function test_zero_means_none_per_target(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(256);
        $movie = $this->makeMovie('Fight Club');
        $this->attachCast($movie);

        // ფილმზე 2, მსახიობზე არცერთი
        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", ['limit' => 2, 'cast' => 'all', 'per_actor' => 0])
            ->assertOk()
            ->assertJsonPath('added', 2);

        $this->assertSame(0, GalleryImage::where('imageable_type', 'cast_member')->count());

        // მსახიობზე 1, ჩანაწერზე არცერთი
        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", ['limit' => 0, 'cast' => 'all', 'per_actor' => 1])
            ->assertOk()
            ->assertJsonPath('added', 2);

        $this->assertSame(2, GalleryImage::where('imageable_type', 'movie')->count());
        $this->assertSame(2, GalleryImage::where('imageable_type', 'cast_member')->count());
    }

    /** მსახიობის ფოტო მთავარად ვერ დაყენდება — `cast_members` გლობალური ლექსიკონია */
    public function test_actor_photo_cannot_become_primary(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(256);
        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/cast/{$female->id}", ['per_actor' => 1])
            ->assertOk();

        $image = GalleryImage::withoutGlobalScope('owner')->firstOrFail();

        $this->actingAs($this->user)
            ->postJson("/api/gallery/images/{$image->id}/primary")
            ->assertStatus(422)
            ->assertJsonPath('message', 'primary_not_supported_for_cast');
    }

    /* ============================================================
       Tasks §1.2 — ფოტო შენახვის გარეშე არ უნდა წაიშალოს
       ============================================================ */

    /**
     * ფორმის შენახვა `remove_poster`-ის გარეშე პოსტერს **არ ეხება**.
     *
     * ⚠️ ეს ის გარანტიაა, რომელსაც ფრონტი ეყრდნობა: ჯვარზე დაჭერა მხოლოდ
     * ნიშნავს „მოსახსნელად", ხოლო რეალურად `PUT` შლის. ტესტი მოდელის დონეზე
     * ამოწმებს, რომ ჩვეულებრივმა რედაქტირებამ (სათაურის შეცვლამ) პოსტერი
     * ჩუმად არ წაიღოს.
     */
    public function test_updating_a_record_without_the_remove_flag_keeps_the_poster(): void
    {
        Storage::fake('public');
        $movie = $this->makeMovie('Fight Club');
        $movie->forceFill(['poster_path' => 'movies/posters/fight-club.jpg', 'poster_source' => 'tmdb'])->save();

        $this->actingAs($this->user)
            ->putJson("/api/movies/{$movie->id}", ['title_en' => 'Fight Club (1999)'])
            ->assertOk();

        $this->assertSame('movies/posters/fight-club.jpg', $movie->refresh()->poster_path);
    }

    /**
     * „მთავარი" ფოტოს წაშლა ჩანაწერს პოსტერს **ასუფთავებს** და არა ტოვებს
     * გატეხილ ბმულს.
     *
     * ⚠️ სწორედ ეს კავშირია §1.2-ის მიზეზი: „მთავარად დაყენება" `poster_path`-ს
     * **გალერეის ფაილზე** უთითებს, ე.ი. ამ ფოტოს წაშლა ჩანაწერს მთავარ
     * სურათს აცლის. ინტერფეისი ამას ახლა ცხადად აფრთხილებს (ჩუმად ხდებოდა).
     */
    public function test_deleting_the_primary_photo_clears_the_records_poster(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(512);
        $movie = $this->makeMovie('Fight Club');

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", ['limit' => 1])
            ->assertOk();

        $image = GalleryImage::withoutGlobalScope('owner')->firstOrFail();

        $this->actingAs($this->user)
            ->postJson("/api/gallery/images/{$image->id}/primary")
            ->assertOk();
        $this->assertSame($image->path, $movie->refresh()->poster_path);

        $this->actingAs($this->user)
            ->deleteJson("/api/gallery/images/{$image->id}")
            ->assertNoContent();

        $movie->refresh();
        $this->assertNull($movie->poster_path);
        $this->assertNull($movie->poster_source);
    }

    /** მოდულის gate: გალერეა ჩართული, ფილმები არა → 403 */
    public function test_gallery_requires_the_media_module_too(): void
    {
        $this->user->modules()->sync(Module::where('key', 'gallery')->pluck('id')->all());

        /* ⚠️ **შემოწმება გეგმაზე გადავიდა** (§8.3): მოდულის ფესვი ახლა
           შეჯამებაა და ყველა დომენს ეხება, ე.ი. ერთი დომენის გამორთვა მას
           403-ს ვერ დააბრუნებინებს. ნამდვილი წესი უცვლელია: ჩამოტვირთვა
           მოითხოვს, რომ **მედია-მოდულიც** ჩართული იყოს. */
        $this->actingAs($this->user->refresh())
            ->postJson('/api/gallery/plan', ['type' => 'movie'])
            ->assertStatus(403)
            ->assertJsonPath('message', 'module_disabled');
    }

    /** ჩანაწერის წაშლა გალერეასაც შლის და კვოტას ათავისუფლებს */
    public function test_deleting_the_record_removes_its_gallery(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(1024);
        $movie = $this->makeMovie('Fight Club');

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", ['limit' => 2])
            ->assertOk();

        $this->actingAs($this->user->refresh())
            ->deleteJson("/api/movies/{$movie->id}")
            ->assertNoContent();

        $this->assertSame(0, GalleryImage::withoutGlobalScope('owner')->count());
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }

    /* ============================================================
       §8 — გალერეა 2.0
       ============================================================ */

    /**
     * **თითო სახეს თავისი რაოდენობა და ზომა (§8.2).**
     *
     * ⚠️ ეს ნამდვილი ბაგის ჩამკეტია: ერთი საერთო `limit` კანდიდატებს ჯერ
     * აერთიანებდა (ჯერ კადრები, მერე პოსტერები) და **მერე** ჭრიდა, ე.ი.
     * `limit = 2`-ზე ორივე ადგილს კადრი იკავებდა და **პოსტერი საერთოდ არ
     * ჩამოდიოდა**. ახლა ჭერი სახეობისაა.
     */
    public function test_each_subject_has_its_own_limit_and_size(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(1024);
        $movie = $this->makeMovie('Fight Club');

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", [
                'subjects' => ['stills', 'posters'],
                'limits' => ['stills' => 2, 'posters' => 1],
                'sizes' => ['stills' => 'w1280', 'posters' => 'w342'],
            ])
            ->assertOk()
            ->assertJsonPath('added', 3);

        $categories = $movie->galleryImages()->pluck('category')->sort()->values()->all();
        $this->assertSame(['backdrop', 'backdrop', 'poster'], $categories);

        // ⚠️ ზომა სახეობისაა — კადრი w1280-ით, პოსტერი w342-ით ჩამოვიდა
        Http::assertSent(fn ($request) => str_contains($request->url(), '/t/p/w1280/'));
        Http::assertSent(fn ($request) => str_contains($request->url(), '/t/p/w342/'));
    }

    /** ერთი საერთო `limit`/`size` ისევ მუშაობს — „ყველაფერი 20 ცალი" აზრიანი მოთხოვნაა */
    public function test_a_shared_limit_still_applies_to_every_chosen_subject(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(1024);
        $movie = $this->makeMovie('Fight Club');

        $this->actingAs($this->user)
            ->postJson("/api/gallery/movie/{$movie->id}", [
                'subjects' => ['stills', 'posters'],
                'limit' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('added', 2);

        $this->assertSame(
            ['backdrop', 'poster'],
            $movie->galleryImages()->pluck('category')->sort()->values()->all(),
        );
    }

    /**
     * **მსახიობის მეორე წყარო — `tagged_images` (§8.2).**
     *
     * ⚠️ ესაა პასუხი იმაზე, რომ „TMDB-ზე მსახიობს სამი ფოტო აქვს":
     * `profiles` მართლა მწირია, `tagged_images` კი ათეულობით კადრია იმ
     * ფილმებიდან, სადაც ის მონიშნულია. კატეგორია **TMDB-ისა რჩება**
     * (`poster`/`backdrop`), რომ მსახიობის გვერდზე პორტრეტი და კადრი
     * ერთმანეთისგან გაირჩეს.
     */
    public function test_tagged_images_are_a_second_actor_source(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(1024);
        Http::fake([
            'api.themoviedb.org/3/person/11/tagged_images*' => Http::response([
                'page' => 1,
                'total_pages' => 1,
                'results' => [
                    ['file_path' => '/tag1.jpg', 'image_type' => 'poster', 'media' => ['title' => 'Ghost']],
                    ['file_path' => '/tag2.jpg', 'image_type' => 'backdrop', 'media' => ['title' => 'Lucy']],
                ],
            ]),
        ]);

        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/cast/{$female->id}", [
                'cast_source' => 'tagged',
                'per_actor' => 2,
            ])
            ->assertOk()
            ->assertJsonPath('added', 2);

        $images = $female->galleryImages()->get();
        $this->assertEqualsCanonicalizing(['poster', 'backdrop'], $images->pluck('category')->all());
        // ⚠️ სახელში ფილმი წერია — „ეს რომელი ფილმიდანაა" პასუხი ამით არსებობს
        $this->assertEqualsCanonicalizing(['Ghost', 'Lucy'], $images->pluck('original_name')->all());
    }

    /** `both` — ჯერ პორტრეტები, დანარჩენი კადრებით ივსება */
    public function test_both_sources_prefer_portraits_first(): void
    {
        Storage::fake('public');
        $this->fakeTmdb(1024);
        Http::fake([
            'api.themoviedb.org/3/person/11/tagged_images*' => Http::response([
                'page' => 1,
                'total_pages' => 1,
                'results' => [['file_path' => '/tag1.jpg', 'image_type' => 'backdrop', 'media' => ['title' => 'Ghost']]],
            ]),
        ]);

        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson("/api/gallery/cast/{$female->id}", ['cast_source' => 'both', 'per_actor' => 3])
            ->assertOk()
            ->assertJsonPath('added', 3);

        // ორი პორტრეტი (`actor`) + ერთი კადრი
        $this->assertSame(2, $female->galleryImages()->where('category', 'actor')->count());
        $this->assertSame(1, $female->galleryImages()->where('category', 'backdrop')->count());
    }

    /**
     * **სკოუპის გამორთვა (§8.2)** — „ან ჩათიშო და ზოგადად მსახიობზე ჩამოწერ".
     *
     * ⚠️ ავზი მაინც **ჩემი ბიბლიოთეკაა** და არა TMDB-ის მთელი ლექსიკონი:
     * `cast_members` გლობალურია, ე.ი. უფილტრო სია სხვისი ჩანაწერების
     * მსახიობებსაც მოიცავდა.
     */
    public function test_actor_plan_scope_off_uses_the_whole_library(): void
    {
        $movie = $this->makeMovie('Fight Club');
        [$female, $male] = $this->attachCast($movie);

        // ბიბლიოთეკის გარეთ მყოფი — „ჩათიშულ" სკოუპშიც არ უნდა ჩანდეს
        CastMember::create(['tmdb_person_id' => 99, 'name' => 'Stranger', 'gender' => 1]);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'scope' => 'off',
                // ⚠️ სკოუპის ველები ჩუმად აღარ უნდა მუშაობდეს — „ჩათიშულია"
                'ids' => ['movie' => [999999]],
                'cast' => 'all',
                'per_actor' => 1,
            ])
            ->assertOk()
            ->json();

        $this->assertSame(2, $body['count']);
        $this->assertEqualsCanonicalizing(
            [$female->id, $male->id],
            array_column($body['items'], 'id'),
        );
    }

    /** „კონკრეტული ჩანაწერები" ცარიელ დომენზე **არაფერს** ნიშნავს და არა „ყველაფერს" */
    public function test_ids_scope_never_means_everything(): void
    {
        $this->makeMovie('One');
        $this->makeMovie('Two');

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', ['scope' => 'ids', 'types' => ['movie'], 'ids' => []])
            ->assertOk()
            ->json();

        $this->assertSame(0, $body['count']);
    }

    /** მრავალდომენიანი გეგმა — „ფილმებზე, სერიალებზე და ანიმეებზე ჯამში" (§8.2) */
    public function test_plan_covers_several_domains_at_once(): void
    {
        $this->user->modules()->syncWithoutDetaching(
            Module::whereIn('key', ['series', 'anime'])->pluck('id')->all()
        );
        $this->user = $this->user->refresh();

        $this->makeMovie('Movie');

        $anime = Anime::create(['user_id' => $this->user->id, 'tmdb_id' => 77, 'year' => 2020]);
        $anime->translations()->create(['locale' => 'en', 'title' => 'Anime']);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', ['types' => ['movie', 'anime'], 'limit' => 1])
            ->assertOk()
            ->json();

        $this->assertSame(2, $body['count']);
        $this->assertEqualsCanonicalizing(['movie', 'anime'], array_column($body['items'], 'type'));
        $this->assertEqualsCanonicalizing(['movie', 'anime'], $body['types']);
    }

    /** მულტი-სტატუსი და „ნებისმიერი ჟანრი" (§8.2) */
    public function test_multi_status_scope(): void
    {
        $a = $this->makeMovie('Watched');
        $a->applyStatusKey('watched');
        $a->save();
        $b = $this->makeMovie('To watch');
        $b->applyStatusKey('to_watch');
        $b->save();
        $c = $this->makeMovie('Undecided');

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'scope' => 'status',
                'statuses' => ['watched', 'to_watch'],
                'limit' => 1,
            ])
            ->assertOk()
            ->json();

        $this->assertSame(2, $body['count']);
        $this->assertEqualsCanonicalizing([$a->id, $b->id], array_column($body['items'], 'id'));
    }

    /**
     * **ვიდეო-ბმულები (§8.1)** — ჩამოტვირთვის გარეშე, ე.ი. კვოტაც არ იხარჯება.
     */
    public function test_gallery_videos_are_links_and_cost_no_quota(): void
    {
        $movie = $this->makeMovie('Fight Club');

        $created = $this->actingAs($this->user)
            ->postJson('/api/gallery/videos', [
                'target' => 'movie',
                'id' => $movie->id,
                'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'title' => 'Trailer',
                'engine' => 'youtube',
            ])
            ->assertCreated()
            ->json();

        // ⚠️ `platform`/`embed_url` **ჩვენ ვაწყობთ** — HTML არასდროს ინახება
        $this->assertSame('youtube', $created['video']['platform']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $created['video']['embed_url']);
        $this->assertSame('serpapi:youtube', $created['video']['source']);
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);

        // იმავე ბმულის ხელახლა შენახვა დუბლს არ ქმნის
        $this->actingAs($this->user)
            ->postJson('/api/gallery/videos', [
                'target' => 'movie',
                'id' => $movie->id,
                'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            ])
            ->assertOk()
            ->assertJsonPath('duplicate', true);

        $this->assertSame(1, GalleryVideo::withoutGlobalScope('owner')->count());

        // ჩანაწერის გვერდი მათ თან ატარებს
        $this->actingAs($this->user)
            ->getJson("/api/gallery/movie/{$movie->id}")
            ->assertOk()
            ->assertJsonCount(1, 'videos');

        // ⚠️ ჩანაწერის წაშლა ვიდეოებსაც შლის — SQL-კასკადი ივენთს არ ისვრის
        $this->actingAs($this->user)->deleteJson("/api/movies/{$movie->id}")->assertNoContent();
        $this->assertSame(0, GalleryVideo::withoutGlobalScope('owner')->count());
    }

    /** ვიდეო მსახიობზეც ეკიდება — სწორედ ესაა §8.4-ის „ვიდეო სერჩი მსახიობზე" */
    public function test_a_video_can_hang_on_an_actor(): void
    {
        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $this->actingAs($this->user)
            ->postJson('/api/gallery/videos', [
                'target' => 'cast_member',
                'id' => $female->id,
                'url' => 'https://vimeo.com/76979871',
                'title' => 'Interview',
            ])
            ->assertCreated()
            ->assertJsonPath('video.platform', 'vimeo');

        $this->actingAs($this->user)
            ->getJson("/api/gallery/cast/{$female->id}")
            ->assertOk()
            ->assertJsonCount(1, 'videos');

        $list = $this->actingAs($this->user)
            ->getJson('/api/gallery/videos?owner=actor:'.$female->id)
            ->assertOk()
            ->json();

        $this->assertSame(1, $list['meta']['total']);
        $this->assertSame('actor', $list['data'][0]['owner']['kind']);
        $this->assertSame('Helena', $list['data'][0]['owner']['title']);
    }

    /**
     * **წყაროს ჭრილი (§8.3)** — „TMDB-დან თუ ვებიდან".
     *
     * ⚠️ ეს `by=source`-ის დუბლი არ არის: იქ „ფილმიდან თუ სერიალიდან"
     * იკითხება, აქ კი „რომელმა წყარომ მოიტანა".
     */
    public function test_provider_groups_split_tmdb_from_web(): void
    {
        $movie = $this->makeMovie('Fight Club');

        $this->image($movie, 'backdrop');
        $web = $this->image($movie, 'backdrop');
        $web->forceFill(['source' => 'serpapi:google_images_light'])->save();

        $groups = $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=provider')
            ->assertOk()
            ->json('groups');

        $this->assertEqualsCanonicalizing(
            ['tmdb', 'serpapi:google_images_light'],
            array_column($groups, 'provider'),
        );

        // შიგნით შესვლა — იმავე რიცხვზე უნდა დგებოდეს
        $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?provider=serpapi:google_images_light')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    /**
     * **ჯგუფები აღარ შემოიფარგლება მედია-დომენებით (§8.3).**
     *
     * ⚠️ ეს ხვრელი იყო: სიმღერაზე ვებიდან ჩამოწერილი ფოტო `gallery_images`-ში
     * ჯდებოდა, მაგრამ ჯგუფებში მხოლოდ `MediaDomain::TYPES` იკითხებოდა —
     * ე.ი. ფოტო ბაზაში იყო და გალერეაში არსად ჩანდა.
     */
    public function test_record_groups_include_non_media_parents(): void
    {
        $this->user->modules()->syncWithoutDetaching(Module::where('key', 'song')->pluck('id')->all());
        $this->user = $this->user->refresh();

        $song = Song::create([
            'user_id' => $this->user->id,
            'title' => 'Bohemian Rhapsody',
            'url' => 'https://youtu.be/fJ9rUzIMcZQ',
        ]);
        $this->image($song, 'backdrop');

        $groups = $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=record')
            ->assertOk()
            ->json('groups');

        $this->assertSame('song', $groups[0]['kind']);
        $this->assertSame('Bohemian Rhapsody', $groups[0]['title']);

        // და შიგნითაც შედის — `owner` რეგექსი ყველა მშობელს იცნობს
        $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?owner=song:'.$song->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.owner.kind', 'song');
    }

    /**
     * **სხვა მოდულების ფოტოები (§8.3)** — ყდები და ატვირთულები, მხოლოდ კითხვადი.
     */
    public function test_module_photos_list_covers_other_modules(): void
    {
        $this->user->modules()->syncWithoutDetaching(Module::where('key', 'song')->pluck('id')->all());
        $this->user = $this->user->refresh();

        Song::create([
            'user_id' => $this->user->id,
            'title' => 'With cover',
            'url' => 'https://youtu.be/fJ9rUzIMcZQ',
            'thumbnail_path' => 'songs/thumbnails/a.jpg',
        ]);

        $groups = $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=module')
            ->assertOk()
            ->json('groups');

        $modules = array_column($groups, 'module');
        $this->assertContains('song', $modules);

        $body = $this->actingAs($this->user)
            ->getJson('/api/gallery/module-photos?module=song')
            ->assertOk()
            ->json();

        $this->assertSame(1, $body['meta']['total']);
        $this->assertSame('songs/thumbnails/a.jpg', $body['data'][0]['url']);
        $this->assertFalse($body['data'][0]['private']);
        $this->assertSame('With cover', $body['data'][0]['owner']['title']);
    }

    /**
     * **„არეული" რიგი მდგრადია (§8.3).**
     *
     * ⚠️ სიდის გარეშე მე-2 გვერდი პირველზე უკვე ნანახ ფოტოებს გამოიტანდა —
     * სწორედ ამიტომ არის `seed` პარამეტრი და არა უბრალოდ `ORDER BY RANDOM()`.
     */
    public function test_random_order_is_stable_for_one_seed(): void
    {
        $movie = $this->makeMovie('Fight Club');

        for ($i = 0; $i < 6; $i++) {
            $this->image($movie, 'backdrop');
        }

        $first = $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?sort=random&seed=42&per_page=6')
            ->assertOk()
            ->json('data.*.id');

        $again = $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?sort=random&seed=42&per_page=6')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame($first, $again);
        $this->assertCount(6, $first);
    }

    /** შეჯამება ქვე-მენიუსთვის — ერთი გამოძახება, სამი სიის ნაცვლად (§8.3) */
    public function test_summary_counts_photos_records_actors_and_videos(): void
    {
        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $this->image($movie, 'backdrop');
        $this->image($female, 'actor');

        $this->actingAs($this->user)
            ->postJson('/api/gallery/videos', [
                'target' => 'movie',
                'id' => $movie->id,
                'url' => 'https://youtu.be/dQw4w9WgXcQ',
            ])
            ->assertCreated();

        $this->actingAs($this->user)
            ->getJson('/api/gallery')
            ->assertOk()
            ->assertJsonPath('photos', 2)
            ->assertJsonPath('records', 1)
            ->assertJsonPath('actors', 1)
            ->assertJsonPath('videos', 1);
    }

    /**
     * **მონიშნული მსახიობი ავზის შევიწროებაზე არ იკარგება (§8.2).**
     *
     * ⚠️ ეს ნამდვილი ბაგის ჩამკეტია: „კონკრეტული" არჩევანი აქამდე **ავზიდან**
     * იფილტრებოდა, ავზი კი სახელით დალაგებული პირველი `CAST_POOL_LIMIT` რიგია
     * (და ძებნითაც ვიწროვდება). სამ ათას მსახიობიან ბიბლიოთეკაში ანბანით
     * გვიან მდგომი მონიშნული მსახიობი იქ არ მოხვდებოდა და ჩამოტვირთვა
     * **ჩუმად არაფერს იზამდა** — ზუსტად ეს ემართებოდა მსახიობის გვერდიდან
     * გახსნილ დიალოგს.
     */
    public function test_selected_actors_survive_a_narrowed_pool(): void
    {
        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'cast' => 'selected',
                'cast_ids' => [$female->id],
                // ძებნა ავზს ავიწროებს — მონიშნული მასში აღარ ხვდება
                'cast_q' => 'Edward',
                'per_actor' => 2,
            ])
            ->assertOk()
            ->json();

        // ავზი (პიქერის სია) მართლა შევიწროვდა…
        $this->assertSame(['Edward'], array_column($body['cast'], 'name'));
        // …მაგრამ მონიშნული მაინც ჩამოიწერება
        $this->assertSame(1, $body['count']);
        $this->assertSame($female->id, $body['items'][0]['id']);
    }

    /**
     * **„მსახიობი 0" — ნულს მიზეზი უნდა ჰქონდეს** (ეტაპი 4, 2026-09-13).
     *
     * ⚠️ ცოცხალი ხარვეზი ასე გამოიყურებოდა: მსახიობის გვერდიდან გახსნილ
     * ჩამოტვირთვაში „მსახიობი 0 × თითოზე 20 = 0 ფოტომდე" ეწერა. მიზეზი
     * `skip_with_photos`-ია — ვისაც ერთი ფოტო მაინც აქვს, გეგმიდან
     * ამოვარდება. ფრონტზე ჩამრთველი მიბმულ მსახიობზე **დამალულია**, ე.ი.
     * ფილტრი ისე მუშაობდა, რომ ეკრანზე კვალი არ რჩებოდა. ახლა გეგმა
     * ცხადად ამბობს, რამდენი მოიჭრა ამ მიზეზით.
     */
    public function test_the_plan_says_how_many_were_skipped_for_having_photos(): void
    {
        $movie = $this->makeMovie('Fight Club');
        [$female] = $this->attachCast($movie);
        $this->image($female, 'actor');

        $body = $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'cast' => 'selected',
                'cast_ids' => [$female->id],
                'skip_with_photos' => true,
                'per_actor' => 2,
            ])
            ->assertOk()
            ->json();

        $this->assertSame(0, $body['count']);
        $this->assertSame(1, $body['skipped_with_photos']);

        // ⚠️ ფილტრის გარეშე იგივე მსახიობი ისევ გეგმაშია — ე.ი. ნული
        // „არაფერი მოიძებნა" არასდროს ყოფილა
        $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', [
                'target' => 'actor',
                'cast' => 'selected',
                'cast_ids' => [$female->id],
                'skip_with_photos' => false,
                'per_actor' => 2,
            ])
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('skipped_with_photos', 0);
    }

    /** იგივე ჩანაწერების ტაბზე — „ყველას უკვე აქვს" ცარიელი სკოუპი არ არის */
    public function test_the_record_plan_counts_records_skipped_for_having_photos(): void
    {
        $movie = $this->makeMovie('Fight Club');
        $this->image($movie, 'backdrop');

        $this->actingAs($this->user)
            ->postJson('/api/gallery/plan', ['scope' => 'all', 'skip_with_photos' => true])
            ->assertOk()
            ->assertJsonPath('count', 0)
            ->assertJsonPath('skipped_with_photos', 1);
    }

    /**
     * **გეგმა `view` უფლებაა და არა `create` (Tasks GAP-04).**
     *
     * ⚠️ `POST /gallery/plan` არაფერს ინახავს — ის ითვლის, „რამდენ ფოტოს
     * ჩამოტვირთავს ეს მასშტაბი". POST-ის გამო კი `EnsureModulePermission`
     * მას **`create`**-ად კითხულობდა: view-only როლი გეგმას საერთოდ ვერ
     * ხედავდა, ხოლო როლი „ვცვლი, მაგრამ არ ვქმნი" ვერ ითვლიდა იმას, რისი
     * ჩამოტვირთვის უფლებაც ჰქონდა. იგივე წესი `GET /videos/bulk-preview`-ს
     * docblock-ში უკვე ეწერა.
     */
    public function test_a_view_only_role_can_ask_for_the_plan(): void
    {
        $this->makeMovie('Fight Club');

        $role = Role::create([
            'key' => 'viewer',
            'name_ka' => 'დამკვირვებელი',
            'name_en' => 'Viewer',
            'permissions' => ['movie' => ['view'], 'gallery' => ['view']],
        ]);
        $this->user->forceFill(['role_id' => $role->id])->save();
        $viewer = $this->user->refresh();

        $this->actingAs($viewer)
            ->postJson('/api/gallery/plan', ['scope' => 'all'])
            ->assertOk()
            ->assertJsonPath('count', 1);

        // ⚠️ ჩამოტვირთვა კი ისევ დახურულია — გეგმის გახსნა მას არ აღებს
        $this->actingAs($viewer)
            ->postJson('/api/gallery/movie/'.Movie::first()->id, [])
            ->assertStatus(403)
            ->assertJsonPath('message', 'forbidden_permission');
    }
}
