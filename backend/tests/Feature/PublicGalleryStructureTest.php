<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use App\Support\AlbumLock;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * **Tasks §32 — საჯარო გალერეა მფლობელის სტრუქტურით.**
 *
 * შენი სიტყვები: „გალერეაში იგივე სტრუქტურით ჩანდეს — ფაილებით,
 * ჩანართებითა და ალბომებით, როგორც რეალურადაა".
 *
 * ⚠️ **ამ ფაილის მთავარი კითხვა: ჭრილი გაერთიანებას ხომ არ ჭრის?**
 * ფოტო საჯაროდ სამი გზით ჩანს (ჩანაწერი · მსახიობი · ალბომი). საჯარო
 * ალბომში შეიძლება იდოს **პირადი** ფილმის კადრი — „ყველა ფოტოში" ის
 * კანონიერია, „ბიბლიოთეკაში" კი პირადი ფილმის ჯგუფს გააჩენდა, მისი
 * სათაურით. ეს ჩუმი გაჟონვაა: პასუხი 200-ია და ყველაფერი „მუშაობს".
 *
 * ⚠️ **ყოველი საჯარო-გზის ტესტი ანონიმურად და შესული უცხოთი** (§1.2-ის
 * წესი): ანონიმზე `owner` scope ცარიელია და ხარვეზს ვერ ხედავს.
 */
class PublicGalleryStructureTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->alice = User::create([
            'name' => 'alice', 'username' => 'alice', 'email' => 'alice@example.com', 'password' => 'password',
        ]);
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();

        $ids = Module::whereIn('key', ['movie', 'series', 'gallery'])
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now(), 'is_public' => true]])
            ->all();
        $this->alice->modules()->sync($ids);
        $this->alice->refresh();
    }

    private function movie(string $title, string $visibility): Movie
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 2020, 'visibility' => $visibility]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie;
    }

    private function photo(string $type, ?int $id, string $path, ?int $albumId = null, string $category = 'backdrop'): GalleryImage
    {
        return GalleryImage::create([
            'user_id' => $this->alice->id,
            'imageable_type' => $id ? $type : null,
            'imageable_id' => $id,
            'album_id' => $albumId,
            'category' => $category,
            'path' => $path,
            'size' => 10,
            'width' => 100,
            'height' => 50,
        ]);
    }

    private function album(string $name, string $visibility = 'public', ?string $password = null): GalleryAlbum
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->alice->id,
            'name' => $name,
            'sort_order' => 1,
            'visibility' => $visibility,
            'password_hash' => $password ? Hash::make($password) : null,
        ]);
        AlbumLock::flush();

        return $album;
    }

    private function actorIn(Movie $movie, string $name, int $gender = CastMember::GENDER_MALE): CastMember
    {
        $actor = CastMember::create(['name' => $name, 'gender' => $gender]);
        $movie->cast()->attach($actor->id, ['billing_order' => 0]);

        return $actor;
    }

    private function stranger(): User
    {
        $bob = User::create([
            'name' => 'bob', 'username' => 'bob', 'email' => 'bob@example.com', 'password' => 'password',
        ]);
        $bob->forceFill(['profile_visibility' => 'public'])->save();

        return $bob;
    }

    /** stateful მნახველი — ალბომის გახსნა სესიაშია (BUG-02) */
    private function spa(): self
    {
        return $this->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    /* ---------- ბიბლიოთეკა ---------- */

    /**
     * **ბიბლიოთეკა მხოლოდ საჯარო ჩანაწერებს ჯგუფავს** — და პირადი ფილმის
     * სათაური პასუხში არსად ჩანს, თუნდაც მისი კადრი საჯარო ალბომში იდოს.
     */
    public function test_the_library_never_groups_a_private_record(): void
    {
        $open = $this->movie('Open Film', 'public');
        $secret = $this->movie('Secret Film', 'private');
        $album = $this->album('Holiday');

        $this->photo('movie', $open->id, 'gallery/images/open-1.jpg');
        $this->photo('movie', $open->id, 'gallery/images/open-2.jpg');
        // ⚠️ კანონიერად საჯაროა — ოღონდ ალბომით და არა ფილმით
        $this->photo('movie', $secret->id, 'gallery/images/secret.jpg', $album->id);

        foreach ([null, $this->stranger()] as $viewer) {
            $request = $viewer ? $this->actingAs($viewer) : $this;

            $response = $request->getJson('/api/public/profiles/alice/gallery-groups?by=record')->assertOk();

            $this->assertSame(1, count($response->json('groups')));
            $this->assertSame('Open Film', $response->json('groups.0.title'));
            $this->assertSame(2, $response->json('groups.0.photos'));
            $this->assertSame(['movie' => 1, 'all' => 1], $response->json('facets.types'));
            $this->assertStringNotContainsString('Secret Film', $response->getContent());
        }
    }

    /**
     * **ფოტო სამი გზით ჩანს და ჭრილი გზას ირჩევს** — `parent=record` ალბომით
     * ხილულ პირად კადრს არ აჩვენებს, `album=any` — აჩვენებს, ხოლო რიგს ვისიაც
     * არის (`owner`) მხოლოდ საჯარო მშობელზე ეწერება.
     */
    public function test_each_cut_reads_its_own_visibility_rule(): void
    {
        $open = $this->movie('Open Film', 'public');
        $secret = $this->movie('Secret Film', 'private');
        $album = $this->album('Holiday');

        $this->photo('movie', $open->id, 'gallery/images/open.jpg');
        $this->photo('movie', $secret->id, 'gallery/images/secret.jpg', $album->id);

        $all = $this->getJson('/api/public/profiles/alice/gallery-photos')->assertOk();
        $this->assertSame(2, $all->json('meta.total'));
        $this->assertStringNotContainsString('Secret Film', $all->getContent());

        $rows = collect($all->json('data'))->keyBy('path');
        $this->assertSame('Open Film', $rows['gallery/images/open.jpg']['owner']['title']);
        // ⚠️ პირადი მშობლის სახელი ალბომით არ ჟონავს
        $this->assertNull($rows['gallery/images/secret.jpg']['owner']);

        $records = $this->getJson('/api/public/profiles/alice/gallery-photos?parent=record')->assertOk();
        $this->assertSame(['gallery/images/open.jpg'], collect($records->json('data'))->pluck('path')->all());

        $albums = $this->getJson('/api/public/profiles/alice/gallery-photos?album=any')->assertOk();
        $this->assertSame(['gallery/images/secret.jpg'], collect($albums->json('data'))->pluck('path')->all());
    }

    /**
     * **ჩანაწერის ჯგუფი — მხოლოდ მისი საკუთარი ფოტოები**, ე.ი. „ჯგუფში 1,
     * შიგნით 1". პირადი ფილმის ჯგუფი 404-ია — „არსებობს, უბრალოდ პირადია"
     * თვითონაც ინფორმაციაა.
     */
    public function test_a_record_group_holds_exactly_its_own_photos(): void
    {
        $open = $this->movie('Open Film', 'public');
        $secret = $this->movie('Secret Film', 'private');
        $actor = $this->actorIn($open, 'Somebody');

        $this->photo('movie', $open->id, 'gallery/images/still.jpg');
        $this->photo('cast_member', $actor->id, 'gallery/images/portrait.jpg', null, 'actor');
        $this->photo('movie', $secret->id, 'gallery/images/secret.jpg');

        $group = $this->getJson("/api/public/profiles/alice/gallery-photos?owner=movie:{$open->id}")->assertOk();
        $this->assertSame(['gallery/images/still.jpg'], collect($group->json('data'))->pluck('path')->all());

        $this->getJson("/api/public/profiles/alice/gallery-photos?owner=movie:{$secret->id}")->assertStatus(404);
        $this->getJson('/api/public/profiles/alice/gallery-photos?owner=movie:999999')->assertStatus(404);
    }

    /* ---------- მსახიობები ---------- */

    /**
     * **მსახიობის ჯგუფი მხოლოდ საჯარო ჩანაწერიდან იბადება** — და `from` მას
     * ერთ დომენზე ჭრის. პირად ფილმში მოთამაშის ჯგუფი 404-ია.
     */
    public function test_actor_groups_come_from_public_records_only(): void
    {
        $open = $this->movie('Open Film', 'public');
        $secret = $this->movie('Secret Film', 'private');

        $star = $this->actorIn($open, 'Star', CastMember::GENDER_FEMALE);
        $hidden = $this->actorIn($secret, 'Hidden Person');

        $this->photo('cast_member', $star->id, 'gallery/images/star.jpg', null, 'actor');
        $this->photo('cast_member', $hidden->id, 'gallery/images/hidden.jpg', null, 'actor');

        foreach ([null, $this->stranger()] as $viewer) {
            $request = $viewer ? $this->actingAs($viewer) : $this;

            $groups = $request->getJson('/api/public/profiles/alice/gallery-groups?by=actor')->assertOk();

            $this->assertSame([$star->id], collect($groups->json('groups'))->pluck('id')->all());
            $this->assertSame(['all' => 1, 'female' => 1, 'male' => 0], $groups->json('facets.gender'));
            $this->assertStringNotContainsString('Hidden Person', $groups->getContent());
        }

        // სერიალების მსახიობებში ფილმის ვარსკვლავი არ ზის
        $this->assertSame([], $this->getJson('/api/public/profiles/alice/gallery-groups?by=actor&from=series')
            ->assertOk()
            ->json('groups'));

        $this->getJson("/api/public/profiles/alice/gallery-photos?owner=actor:{$hidden->id}")->assertStatus(404);
        $this->getJson("/api/public/profiles/alice/gallery-photos?owner=actor:{$star->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    /**
     * **`parent=actor&from=…`** — „არეული" ხედი მსახიობების ჩანართში ზუსტად
     * დასტების სკოუპია: ამ დომენის საჯარო ჩანაწერების მსახიობები.
     */
    public function test_the_actor_flat_view_matches_the_actor_groups(): void
    {
        $open = $this->movie('Open Film', 'public');
        $star = $this->actorIn($open, 'Star');
        $this->photo('cast_member', $star->id, 'gallery/images/star.jpg', null, 'actor');
        $this->photo('movie', $open->id, 'gallery/images/still.jpg');

        $flat = $this->getJson('/api/public/profiles/alice/gallery-photos?parent=actor&from=movie')->assertOk();
        $this->assertSame(['gallery/images/star.jpg'], collect($flat->json('data'))->pluck('path')->all());
        $this->assertSame('Star', $flat->json('data.0.owner.title'));

        $this->assertSame(0, $this->getJson('/api/public/profiles/alice/gallery-photos?parent=actor&from=series')
            ->assertOk()
            ->json('meta.total'));
    }

    /* ---------- ალბომები ---------- */

    /**
     * **ალბომების ჭრილი: მხოლოდ საჯარო და არაცარიელი ალბომები; ჩაკეტილს —
     * არც ერთი ესკიზი.** ერთი ესკიზიც ბილიკს გამოიტანდა და ბლარის მოხსნა
     * devtools-ში ერთი კლიკი იქნებოდა.
     */
    public function test_album_groups_hide_private_empty_and_locked_previews(): void
    {
        $holiday = $this->album('Holiday');
        $locked = $this->album('Diary', 'public', 'secret1');
        $private = $this->album('Private Stuff', 'private');
        $this->album('Empty Folder');

        $this->photo('movie', null, 'gallery/images/beach.jpg', $holiday->id);
        $this->photo('movie', null, 'gallery/images/sunset.jpg', $holiday->id);
        $this->photo('movie', null, 'gallery/locked/page.jpg', $locked->id);
        $this->photo('movie', null, 'gallery/images/private.jpg', $private->id);

        foreach ([null, $this->stranger()] as $viewer) {
            $request = $viewer ? $this->actingAs($viewer) : $this;

            $response = $request->getJson('/api/public/profiles/alice/gallery-groups?by=album')->assertOk();
            $groups = collect($response->json('groups'))->keyBy('title');

            $this->assertSame(['Holiday', 'Diary'], $groups->keys()->all());
            $this->assertSame(2, $groups['Holiday']['photos']);
            $this->assertSame(1, $groups['Diary']['photos'], 'ჩაკეტილის რიცხვი ჩანს — ფოტოს ის არ ამხელს');
            $this->assertTrue($groups['Diary']['locked']);
            $this->assertFalse($groups['Diary']['unlocked']);

            $this->assertCount(2, $response->json('previews.album:'.$holiday->id));
            $this->assertNull($response->json('previews.album:'.$locked->id));
            $this->assertStringNotContainsString('page.jpg', $response->getContent());
            $this->assertStringNotContainsString('Private Stuff', $response->getContent());
        }
    }

    /**
     * **ჩანაწერის ფოტო ჩაკეტილ ალბომში: ითვლება, მაგრამ ესკიზად არ გამოდის.**
     *
     * ⚠️ ალბომის ჭრილში ჩაკეტილს ესკიზი ისედაც არ ეთხოვება; ეს ტესტი იმ
     * გზას იჭერს, სადაც ჩაკეტილი ფოტო **სხვა ჯგუფის** — ფილმის — ესკიზში
     * შეიძლება ჩაძვრეს: ბილიკი პასუხში მოხვდებოდა და ბლარი ფარდა იქნებოდა.
     */
    public function test_a_records_photo_in_a_locked_album_is_counted_but_never_previewed(): void
    {
        $open = $this->movie('Open Film', 'public');
        $locked = $this->album('Diary', 'private', 'secret1');

        $this->photo('movie', $open->id, 'gallery/images/visible.jpg');
        $this->photo('movie', $open->id, 'gallery/locked/secret-still.jpg', $locked->id);

        $response = $this->getJson('/api/public/profiles/alice/gallery-groups?by=record')->assertOk();

        $this->assertSame(2, $response->json('groups.0.photos'), 'ჩაკეტილიც ითვლება — ბადე მას დაბლარულად ხატავს');
        $this->assertSame(['gallery/images/visible.jpg'], $response->json('previews.movie:'.$open->id));
        $this->assertStringNotContainsString('secret-still', $response->getContent());

        // შიგნით: ორივე რიგი, ჩაკეტილი — ბილიკის გარეშე
        $inside = $this->getJson("/api/public/profiles/alice/gallery-photos?owner=movie:{$open->id}")->assertOk();
        $this->assertSame(2, $inside->json('meta.total'));
        $this->assertStringNotContainsString('secret-still', $inside->getContent());
    }

    /**
     * **გახსნილი ალბომის ესკიზი საჯარო ფაილის მარშრუტზეა** — არასდროს
     * `/gallery/images/{id}/file`-ზე, რომელიც `auth:sanctum`-ის უკანაა და
     * უცხოსთვის 404 იქნებოდა (`GalleryImage::servedUrl()`-ის ხაფანგი).
     */
    public function test_an_unlocked_albums_previews_use_the_public_file_route(): void
    {
        $locked = $this->album('Diary', 'public', 'secret1');
        $image = $this->photo('movie', null, 'gallery/locked/page.jpg', $locked->id);

        $spa = $this->spa();
        $spa->postJson("/api/public/profiles/alice/albums/{$locked->id}/unlock", ['password' => 'secret1'])->assertOk();

        $response = $spa->getJson('/api/public/profiles/alice/gallery-groups?by=album')->assertOk();

        $this->assertTrue($response->json('groups.0.unlocked'));
        $this->assertSame(
            [['url' => "/public/profiles/alice/gallery-photos/{$image->id}/file", 'private' => true]],
            $response->json('previews.album:'.$locked->id),
        );
        $this->assertStringNotContainsString('/gallery/images/', $response->getContent());
    }

    /**
     * **ერთი ალბომის გვერდი ამბობს, ჩაკეტილია თუ არა** — თორემ ბადე
     * „პაროლის შეყვანის" ღილაკს ვერ დახატავდა. პირადი ალბომი 404-ია.
     */
    public function test_an_album_page_states_its_lock(): void
    {
        $locked = $this->album('Diary', 'public', 'secret1');
        $private = $this->album('Private Stuff', 'private');
        $this->photo('movie', null, 'gallery/locked/page.jpg', $locked->id);
        $this->photo('movie', null, 'gallery/images/private.jpg', $private->id);

        $page = $this->getJson("/api/public/profiles/alice/gallery-photos?owner=album:{$locked->id}")->assertOk();

        $this->assertSame(['id' => $locked->id, 'name' => 'Diary', 'description' => null, 'locked' => true, 'unlocked' => false], $page->json('album'));
        $this->assertTrue($page->json('data.0.locked'));
        $this->assertArrayNotHasKey('path', $page->json('data.0'));

        $this->getJson("/api/public/profiles/alice/gallery-photos?owner=album:{$private->id}")->assertStatus(404);
    }

    /* ---------- ფილტრები ---------- */

    /**
     * **ურთიერთგამომრიცხავი ფილტრი 422-ია და არა ჩუმი არჩევანი.**
     * `parent=actor&type=movie` ორ სხვადასხვა კითხვას სვამს — ერთ-ერთის
     * უხმაუროდ გადაგდება „ფილტრი, რომელიც არაფერს აკეთებს" იქნებოდა.
     */
    public function test_contradictory_filters_are_rejected(): void
    {
        foreach ([
            'parent=actor&type=movie',
            'parent=record&from=movie',
            'type=movie',
            'album=any&parent=record',
            'owner=movie:1&parent=record',
            'owner=album:1&album=any',
            'owner=note:1',
        ] as $query) {
            $this->getJson('/api/public/profiles/alice/gallery-photos?'.$query)->assertStatus(422);
        }
    }

    /**
     * **`per_page` ქვემოდანაც იჭრება** (§B4) — ეს ავტორიზაციის გარეშე
     * endpoint-ებია, ე.ი. `?per_page=-1` მთელ გალერეას ერთ პასუხში აბრუნებდა.
     */
    public function test_per_page_is_clamped_from_below(): void
    {
        $open = $this->movie('Open Film', 'public');
        $this->photo('movie', $open->id, 'gallery/images/a.jpg');
        $this->photo('movie', $open->id, 'gallery/images/b.jpg');
        GalleryVideo::create([
            'user_id' => $this->alice->id, 'videoable_type' => 'movie', 'videoable_id' => $open->id,
            'url' => 'https://youtu.be/one', 'platform' => 'youtube',
        ]);

        $this->getJson('/api/public/profiles/alice/gallery-photos?per_page=-1')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 1)
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/public/profiles/alice/gallery-videos?per_page=-1')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 1);
    }

    /**
     * **„არეული" გვერდებს შორის მდგრადია** — მეორე გვერდი პირველზე ნანახს
     * არ იმეორებს (`GallerySort`-ის სიდი).
     */
    public function test_shuffled_pages_never_repeat_each_other(): void
    {
        $open = $this->movie('Open Film', 'public');
        foreach (range(1, 6) as $i) {
            $this->photo('movie', $open->id, "gallery/images/p{$i}.jpg");
        }

        $first = $this->getJson('/api/public/profiles/alice/gallery-photos?sort=random&seed=7&per_page=3&page=1')->json('data');
        $second = $this->getJson('/api/public/profiles/alice/gallery-photos?sort=random&seed=7&per_page=3&page=2')->json('data');

        $ids = [...array_column($first, 'id'), ...array_column($second, 'id')];
        $this->assertCount(6, array_unique($ids));
    }

    /* ---------- ვიდეოები ---------- */

    /**
     * **ვიდეო-ბმული მშობლის ხილვადობას იმემკვიდრებს** — ფოტოს იგივე წესი — და
     * ვიწრო ფორმით მოდის: `source`/`source_url` (სად იპოვა ძებნამ) უცხოს
     * საქმე არ არის.
     */
    public function test_videos_follow_their_parents_visibility(): void
    {
        $open = $this->movie('Open Film', 'public');
        $secret = $this->movie('Secret Film', 'private');
        $star = $this->actorIn($open, 'Star');

        GalleryVideo::create([
            'user_id' => $this->alice->id, 'videoable_type' => 'movie', 'videoable_id' => $open->id,
            'url' => 'https://www.youtube.com/watch?v=aaa', 'platform' => 'youtube',
            'embed_url' => 'https://www.youtube.com/embed/aaa', 'title' => 'Trailer',
            'source' => 'serpapi:youtube', 'source_url' => 'https://example.com/where-it-was-found',
        ]);
        GalleryVideo::create([
            'user_id' => $this->alice->id, 'videoable_type' => 'cast_member', 'videoable_id' => $star->id,
            'url' => 'https://www.youtube.com/watch?v=bbb', 'platform' => 'youtube', 'title' => 'Interview',
        ]);
        GalleryVideo::create([
            'user_id' => $this->alice->id, 'videoable_type' => 'movie', 'videoable_id' => $secret->id,
            'url' => 'https://www.youtube.com/watch?v=ccc', 'platform' => 'youtube', 'title' => 'Secret clip',
        ]);

        foreach ([null, $this->stranger()] as $viewer) {
            $request = $viewer ? $this->actingAs($viewer) : $this;

            $response = $request->getJson('/api/public/profiles/alice/gallery-videos')->assertOk();
            $rows = collect($response->json('data'))->keyBy('title');

            $this->assertSame(['Interview', 'Trailer'], $rows->keys()->all());
            $this->assertSame('Open Film', $rows['Trailer']['owner']['title']);
            $this->assertSame('actor', $rows['Interview']['owner']['kind']);
            $this->assertArrayNotHasKey('source_url', $rows['Trailer']);
            $this->assertArrayNotHasKey('source', $rows['Trailer']);
            $this->assertStringNotContainsString('Secret', $response->getContent());
        }
    }

    /* ---------- შეჯამება ---------- */

    /**
     * **ბარათის რიცხვი ზუსტად იმდენია, რამდენსაც ჭრილი ხატავს.**
     * ორი ფორმულა ერთ დღეს „ბარათზე 12, შიგნით 11"-ს დაწერდა.
     */
    public function test_the_summary_counts_match_every_cut(): void
    {
        $open = $this->movie('Open Film', 'public');
        $series = Series::create(['user_id' => $this->alice->id, 'visibility' => 'public']);
        $series->setTranslation('en', ['title' => 'Open Show']);
        $star = $this->actorIn($open, 'Star');
        $album = $this->album('Holiday');

        $this->photo('movie', $open->id, 'gallery/images/still.jpg');
        $this->photo('movie', $open->id, 'gallery/images/poster.jpg', null, 'poster');
        $this->photo('series', $series->id, 'gallery/images/show.jpg');
        $this->photo('cast_member', $star->id, 'gallery/images/star.jpg', null, 'actor');
        $this->photo('movie', null, 'gallery/images/loose.jpg', $album->id);
        /* ⚠️ პირადი ფილმის კადრი საჯარო ალბომში: „ყველა ფოტოში" ითვლება,
           „ბიბლიოთეკის" ჯგუფად კი — არა (მისი ფილმი პირადია) */
        $secret = $this->movie('Secret Film', 'private');
        $this->photo('movie', $secret->id, 'gallery/images/secret.jpg', $album->id);
        GalleryVideo::create([
            'user_id' => $this->alice->id, 'videoable_type' => 'movie', 'videoable_id' => $open->id,
            'url' => 'https://youtu.be/one', 'platform' => 'youtube',
        ]);

        $summary = $this->getJson('/api/public/profiles/alice/gallery-summary')->assertOk();

        $this->assertSame(
            $this->getJson('/api/public/profiles/alice/gallery-photos')->json('meta.total'),
            $summary->json('photos'),
        );
        $this->assertSame(6, $summary->json('photos'));
        $this->assertSame(count($this->getJson('/api/public/profiles/alice/gallery-groups?by=record')->json('groups')), $summary->json('records'));
        $this->assertSame(2, $summary->json('records'));
        $this->assertSame(1, $summary->json('actors'));
        $this->assertSame(count($this->getJson('/api/public/profiles/alice/gallery-groups?by=album')->json('groups')), $summary->json('albums'));
        $this->assertSame(1, $summary->json('videos'));
        $this->assertSame(['actor' => 1, 'backdrop' => 4, 'poster' => 1], collect($summary->json('categories'))->sortKeys()->all());
    }

    /**
     * **მფლობელის მიერ საჯაროდ დამალული ველი ჯგუფზეც არ ჩანს** — ჯგუფის
     * სათაური და წელი `PublicDomain::card()`-იდან მოდის, ე.ი. `{domain}`
     * ჩანართის იგივე წესი.
     */
    public function test_a_field_the_owner_hid_stays_hidden_on_the_group(): void
    {
        $open = $this->movie('Open Film', 'public');
        $this->photo('movie', $open->id, 'gallery/images/still.jpg');

        $this->assertSame(2020, $this->getJson('/api/public/profiles/alice/gallery-groups?by=record')->json('groups.0.year'));

        $this->actingAs($this->alice)
            ->putJson('/api/modules/movie/fields', ['fields' => ['year' => ['public' => false]]])
            ->assertOk();

        $this->assertNull($this->getJson('/api/public/profiles/alice/gallery-groups?by=record')->json('groups.0.year'));
    }

    /* ---------- საერთო მცველები ---------- */

    /** გალერეის მოდული საჯარო არაა → არცერთი ახალი endpoint არ არსებობს */
    public function test_every_gallery_endpoint_needs_the_public_gallery_module(): void
    {
        $id = Module::where('key', 'gallery')->value('id');
        $this->alice->modules()->syncWithoutDetaching([$id => ['is_public' => false]]);

        foreach (['gallery-summary', 'gallery-groups', 'gallery-videos', 'gallery-photos'] as $path) {
            $this->getJson("/api/public/profiles/alice/{$path}")->assertStatus(404);
        }
    }

    /**
     * **ესკიზები ერთი query-ითაა და არა ჯგუფ-ჯგუფ** (Tasks PERF-02-ის წესი).
     *
     * ⚠️ ეს endpoint ავტორიზაციის გარეთაა: ჯგუფზე თითო query ხუთასფილმიან
     * პროფილზე ანონიმურ ნახვას ას ოცამდე query-ად აქცევდა.
     *
     * ⚠️ **ბაზისი ნულზე მეტი უნდა იყოს** — ორი ნული ერთმანეთს ცარიელად
     * დაემთხვეოდა (PERF-15-ის გაკვეთილი). და გაზომვამდე გასათბობი
     * მოთხოვნაა: memo მოთხოვნის ფარგლებშია, ე.ი. გაზომილი პასუხი ყველაფერს
     * თავიდან ითვლის.
     */
    public function test_group_previews_do_not_query_per_group(): void
    {
        $made = 0;

        $count = function (int $target) use (&$made): int {
            while ($made < $target) {
                $made++;
                $movie = $this->movie("Film {$made}", 'public');
                $actor = $this->actorIn($movie, "Actor {$made}");
                $this->photo('movie', $movie->id, "gallery/images/m{$made}.jpg");
                $this->photo('cast_member', $actor->id, "gallery/images/a{$made}.jpg", null, 'actor');
            }

            $total = 0;

            foreach (['record', 'actor'] as $by) {
                $this->getJson("/api/public/profiles/alice/gallery-groups?by={$by}")->assertOk();  // გასათბობი

                DB::flushQueryLog();
                DB::enableQueryLog();
                $this->getJson("/api/public/profiles/alice/gallery-groups?by={$by}")->assertOk();
                $total += count(DB::getQueryLog());
                DB::disableQueryLog();
            }

            return $total;
        };

        $few = $count(3);
        $many = $count(20);

        $this->assertGreaterThan(0, $few);
        $this->assertSame($few, $many, 'query-ების რაოდენობა ჯგუფების რიცხვს მიჰყვება');
    }
}
