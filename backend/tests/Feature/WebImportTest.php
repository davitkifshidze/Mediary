<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * ვებიდან ნაპოვნი ფოტოს ჩამოტვირთვა (Tasks §7.6.5).
 *
 * ⚠️ აქ ის იმოწმება, რაც ჩუმად ტყდება: კვოტა (ეს **შენი** ატვირთვაა და არა
 * TMDB-ის საზიარო ფაილი), ესკიზზე გადასვლა მკვდარ `original`-ზე, დუბლის
 * მოჭრა და 403-ის HTML-ის „ფოტოდ" შენახვის აკრძალვა.
 */
class WebImportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->user = User::create([
            'name' => 'imp',
            'username' => 'imp',
            'email' => 'imp@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['gallery', 'movie'])->pluck('id')->all());
        $this->user->refresh();
    }

    private function jpeg(): string
    {
        // პატარა ნამდვილი JPEG — `Content-Type`-ს ისედაც ვამოწმებთ
        return base64_decode('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==');
    }

    private function actor(): CastMember
    {
        return CastMember::create(['name' => 'Keanu Reeves', 'slug' => 'keanu-reeves']);
    }

    /** ⚠️ ჩამოტვირთული ფოტო **კვოტას ეხება** — TMDB-ის საზიარო ფაილისგან განსხვავებით */
    public function test_an_imported_photo_counts_against_the_quota(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $before = $this->user->fresh()->storage_used_bytes;

        $res = $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'cast_member',
            'id' => $this->actor()->id,
            'images' => [[
                'original' => 'https://example.com/keanu.jpg',
                'thumbnail' => 'https://example.com/keanu-t.jpg',
                'link' => 'https://example.com/page',
                'title' => 'Keanu',
                'engine' => 'google_images_light',
                'width' => 800,
                'height' => 600,
            ]],
        ])->assertOk();

        $this->assertSame(1, $res->json('added'));

        $image = GalleryImage::withoutGlobalScope('owner')->firstOrFail();
        $this->assertSame('actor', $image->category);
        // §7.6.5 — წყარო engine-იანია, რომ მერე გაფილტვრა შეიძლებოდეს
        $this->assertSame('serpapi:google_images_light', $image->source);
        $this->assertSame('https://example.com/keanu.jpg', $image->remote_path);
        $this->assertSame('https://example.com/page', $image->source_url);
        $this->assertFalse((bool) $image->is_thumbnail);
        $this->assertSame(800, $image->width);

        Storage::disk('public')->assertExists($image->path);
        $this->assertSame($before + $image->size, $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **მკვდარი `original` ნორმაა** (hotlink-ის დაცვა) — ესკიზი ჩამოიწერება
     * სათადარიგოდ და ცხადად აღინიშნება, რომ ესკიზია.
     */
    public function test_a_dead_original_falls_back_to_the_thumbnail_and_says_so(): void
    {
        Http::fake([
            'example.com/big.jpg' => Http::response('nope', 403),
            'example.com/small.jpg' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg']),
        ]);

        $res = $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'cast_member',
            'id' => $this->actor()->id,
            'images' => [[
                'original' => 'https://example.com/big.jpg',
                'thumbnail' => 'https://example.com/small.jpg',
                'engine' => 'yandex_images',
                'width' => 1200,
                'height' => 900,
            ]],
        ])->assertOk();

        $this->assertSame(1, $res->json('added'));
        $this->assertSame(1, $res->json('thumbnails'));

        $image = GalleryImage::withoutGlobalScope('owner')->firstOrFail();
        $this->assertTrue((bool) $image->is_thumbnail);
        // ვინაობა ისევ ორიგინალია — დუბლის გასაღები ის არის
        $this->assertSame('https://example.com/big.jpg', $image->remote_path);
        // ⚠️ ზომები ორიგინალისაა და ესკიზს არ ეხება → არ ვწერთ ცრუ რიცხვს
        $this->assertNull($image->width);
    }

    /** ⚠️ 403-ის HTML „ფოტოდ" არ ინახება — `content-type` წყვეტს */
    public function test_a_non_image_response_is_never_stored(): void
    {
        Http::fake(['example.com/*' => Http::response('<html>403</html>', 200, ['Content-Type' => 'text/html'])]);

        $res = $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'cast_member',
            'id' => $this->actor()->id,
            'images' => [['original' => 'https://example.com/a.jpg', 'engine' => 'google_images_light']],
        ])->assertOk();

        $this->assertSame(0, $res->json('added'));
        $this->assertSame(1, $res->json('failed'));
        $this->assertSame(0, GalleryImage::withoutGlobalScope('owner')->count());
    }

    /** ხელახლა გაშვება იმავე ფოტოს არ ამატებს */
    public function test_the_same_original_is_not_imported_twice(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $actor = $this->actor();
        $payload = [
            'target' => 'cast_member',
            'id' => $actor->id,
            'images' => [['original' => 'https://example.com/a.jpg', 'engine' => 'google_images_light']],
        ];

        $this->actingAs($this->user)->postJson('/api/web/import', $payload)->assertOk();
        $second = $this->actingAs($this->user)->postJson('/api/web/import', $payload)->assertOk();

        $this->assertSame(0, $second->json('added'));
        $this->assertSame(1, $second->json('skipped'));
        $this->assertSame(1, GalleryImage::withoutGlobalScope('owner')->count());
    }

    /**
     * ⚠️ **კვოტის ამოწურვა 413-ია** (`storage_quota_exceeded`-ის წესი) და უკვე
     * ჩამოტვირთული **რჩება** — ნახევარი პარტიის უკან დაბრუნება ტრაფიკს
     * ორმაგად დახარჯავდა.
     */
    public function test_running_out_of_quota_returns_413_and_keeps_what_was_saved(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        // ერთ ფოტოზე ოდნავ მეტი ადგილი — მეორეზე ამოიწურება
        $this->user->forceFill([
            'storage_quota_bytes' => strlen($this->jpeg()) + 10,
            'storage_used_bytes' => 0,
        ])->save();

        $res = $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'cast_member',
            'id' => $this->actor()->id,
            'images' => [
                ['original' => 'https://example.com/a.jpg', 'engine' => 'google_images_light'],
                ['original' => 'https://example.com/b.jpg', 'engine' => 'google_images_light'],
            ],
        ])->assertStatus(413);

        $this->assertSame(1, $res->json('added'));
        $this->assertTrue($res->json('quota_exceeded'));
        $this->assertSame(1, GalleryImage::withoutGlobalScope('owner')->count());
    }

    /** ფოტოს წაშლა კვოტას ათავისუფლებს (`StoredFile`-ის hook) */
    public function test_deleting_an_imported_photo_releases_the_quota(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'cast_member',
            'id' => $this->actor()->id,
            'images' => [['original' => 'https://example.com/a.jpg', 'engine' => 'google_images_light']],
        ])->assertOk();

        $image = GalleryImage::withoutGlobalScope('owner')->firstOrFail();
        $used = $this->user->fresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);

        $image->delete();

        $this->assertSame($used - $image->size, $this->user->fresh()->storage_used_bytes);
        Storage::disk('public')->assertMissing($image->path);
    }

    /** სხვისი ჩანაწერი — 404, არა 403 („არსებობს" თვითონ ინფორმაციაა) */
    public function test_another_users_record_is_a_404(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $other = User::create([
            'name' => 'other', 'username' => 'other',
            'email' => 'other@example.com', 'password' => 'password',
        ]);
        $movie = Movie::withoutGlobalScope('owner')->create(['user_id' => $other->id, 'slug' => 'x', 'year' => 2020]);

        $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'movie',
            'id' => $movie->id,
            'images' => [['original' => 'https://example.com/a.jpg', 'engine' => 'google_images_light']],
        ])->assertStatus(404);
    }

    /** მოდულის გარეშე — 403 (`module_disabled`), მარშრუტი ჯგუფის გარეთაა */
    public function test_the_target_module_must_be_enabled(): void
    {
        $this->user->modules()->sync(Module::where('key', 'gallery')->pluck('id')->all());

        $movie = Movie::withoutGlobalScope('owner')->create(['user_id' => $this->user->id, 'slug' => 'y', 'year' => 2020]);

        $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'movie',
            'id' => $movie->id,
            'images' => [['original' => 'https://example.com/a.jpg', 'engine' => 'google_images_light']],
        ])->assertStatus(403);
    }

    /** უცნობი დომენი 422-ია და არა ჩუმად გამოტოვებული */
    public function test_an_unknown_target_is_rejected(): void
    {
        $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'bookmark',
            'id' => 1,
            'images' => [['original' => 'https://example.com/a.jpg']],
        ])->assertStatus(422);
    }

    /**
     * ⚠️ **წყაროს ტექსტს ფრონტი ვერ კარნახობს** — უცნობი engine `web`-ად
     * იწერება, თორემ სვეტში ნებისმიერი სტრიქონი მოხვდებოდა და „საიდან მოვიდა"
     * ფილტრი უაზრო გახდებოდა.
     */
    public function test_the_source_label_is_ours_not_the_clients(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'cast_member',
            'id' => $this->actor()->id,
            'images' => [['original' => 'https://example.com/a.jpg', 'engine' => 'evil_engine']],
        ])->assertOk();

        $this->assertSame('web', GalleryImage::withoutGlobalScope('owner')->firstOrFail()->source);
    }

    /* ============================================================
       §8.4 — განაწილება მსახიობებზე
       ============================================================ */

    /**
     * **„ამ მსახიობებზე დაანაწილოს; ვინც ვერ გაირკვა — ფილმზე" (§8.4).**
     *
     * ⚠️ წესი **სერვერზეა ერთხელ**: ერთნაირად მუშაობს ყველა გამომძახებელზე,
     * ტესტდება და ქართულ სახელსაც იმავე ადგილას ამოწმებს. ფრონტში ჩაწერილი
     * იგივე ლოგიკა ერთ დღეს გაშორდებოდა.
     *
     * ⚠️ **ნაგულისხმევი ყოველთვის ჩანაწერია** — სახის ამოცნობა არ არსებობს,
     * ე.ი. ბუნდოვანი ფოტო ფილმზე ჯდება და არა შემთხვევით მსახიობზე.
     */
    public function test_import_distributes_photos_between_actors_and_falls_back_to_the_record(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 550, 'year' => 1999]);
        $keanu = $this->actor();
        $helena = CastMember::create(['name' => 'Helena Bonham Carter']);
        $helena->setTranslation('ka', 'ჰელენა ბონემ კარტერი');

        $res = $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'movie',
            'id' => $movie->id,
            'distribute' => [$keanu->id, $helena->id],
            'images' => [
                // 1. სათაურში გვარი წერია → Keanu
                ['original' => 'https://example.com/1.jpg', 'title' => 'Keanu Reeves on set'],
                // 2. ქართული სახელი — იმავე წესით უნდა დაიჭიროს
                ['original' => 'https://example.com/2.jpg', 'title' => 'ჰელენა ბონემ კარტერი პრემიერაზე'],
                // 3. ბმულში გვარი — სათაური ცარიელია
                ['original' => 'https://example.com/3.jpg', 'link' => 'https://example.com/reeves/photo'],
                // 4. ვერაფერი გაირკვა → ფილმზე
                ['original' => 'https://example.com/4.jpg', 'title' => 'Fight Club still'],
            ],
        ])->assertOk();

        $this->assertSame(4, $res->json('added'));

        $assigned = $res->json('assigned');
        $this->assertSame(2, $assigned['cast_member:'.$keanu->id]);
        $this->assertSame(1, $assigned['cast_member:'.$helena->id]);
        $this->assertSame(1, $assigned['movie:'.$movie->id]);

        // ⚠️ მსახიობის ფოტო **მსახიობზეა** და არა ფილმზე — მისი გვერდიც იმავეს აჩვენებს
        $this->assertSame(2, $keanu->galleryImages()->withoutGlobalScope('owner')->count());
        $this->assertSame('actor', $keanu->galleryImages()->withoutGlobalScope('owner')->first()->category);
        $this->assertSame(1, $movie->galleryImages()->withoutGlobalScope('owner')->count());
        $this->assertSame('backdrop', $movie->galleryImages()->withoutGlobalScope('owner')->first()->category);
    }

    /** ხელით მითითებული სამიზნე ავტომატიკას აჯობებს — ვარაუდი განაჩენი არაა */
    public function test_a_manual_target_overrides_the_name_guess(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 550, 'year' => 1999]);
        $keanu = $this->actor();
        $helena = CastMember::create(['name' => 'Helena Bonham Carter']);

        $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'movie',
            'id' => $movie->id,
            'distribute' => [$keanu->id, $helena->id],
            'images' => [
                // სათაური Keanu-ს ეძახის, ხელით კი Helena-ზეა მიბმული
                ['original' => 'https://example.com/1.jpg', 'title' => 'Keanu Reeves', 'target_id' => $helena->id],
            ],
        ])->assertOk();

        $this->assertSame(0, $keanu->galleryImages()->withoutGlobalScope('owner')->count());
        $this->assertSame(1, $helena->galleryImages()->withoutGlobalScope('owner')->count());
    }

    /** განაწილების გარეშე ყველაფერი ჩანაწერზე ჯდება — ძველი ქცევა უცვლელია */
    public function test_without_distribution_everything_lands_on_the_record(): void
    {
        Http::fake(['example.com/*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 550, 'year' => 1999]);
        $this->actor();

        $this->actingAs($this->user)->postJson('/api/web/import', [
            'target' => 'movie',
            'id' => $movie->id,
            'images' => [['original' => 'https://example.com/1.jpg', 'title' => 'Keanu Reeves']],
        ])->assertOk()->assertJsonPath('added', 1);

        $this->assertSame(1, $movie->galleryImages()->withoutGlobalScope('owner')->count());
        $this->assertSame(0, CastMember::first()->galleryImages()->withoutGlobalScope('owner')->count());
    }
}
