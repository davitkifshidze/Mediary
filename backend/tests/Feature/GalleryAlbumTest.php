<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use App\Support\AlbumLock;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **უკატეგორიო სექცია, ალბომები და ფოტოს გადატანა (Tasks §26)**, პლუს
 * „ჩანაწერს ვშლი — ფოტოები დამიტოვე" (§25.5).
 */
class GalleryAlbumTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'nino',
            'username' => 'nino',
            'email' => 'nino@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all());
        $this->user = $this->user->refresh();
    }

    private function makeMovie(string $title = 'Alien'): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => 1979]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie->refresh();
    }

    private function photo(?object $parent, string $path = 'gallery/images/a.jpg'): GalleryImage
    {
        Storage::disk('public')->put($path, 'x');

        return GalleryImage::create([
            'user_id' => $this->user->id,
            'imageable_type' => $parent ? $parent->getMorphClass() : null,
            'imageable_id' => $parent?->getKey(),
            'source' => 'tmdb',
            'category' => 'backdrop',
            'path' => $path,
            'size' => 100,
        ]);
    }

    /** უმშობლო ფოტო კანონიერია და „უკატეგორიოს" ჭრილში ჩანს */
    public function test_a_photo_can_live_without_a_parent(): void
    {
        Storage::fake('public');
        $loose = $this->photo(null);
        $this->photo($this->makeMovie(), 'gallery/images/b.jpg');

        $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?owner=none')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $loose->id)
            // ⚠️ უმშობლო ფოტოს `owner` **null**-ია და არა გამოტოვებული ველი
            ->assertJsonPath('data.0.owner', null);

        $this->actingAs($this->user)
            ->getJson('/api/gallery')
            ->assertOk()
            ->assertJsonPath('uncategorized', 1);
    }

    /**
     * გადატანის ორი ღერძი ცალ-ცალკე მუშაობს.
     *
     * ⚠️ **ალბომში ჩაგდება მშობელს არ ხსნის** — გასაღები რომ არ მოსულა,
     * ის ღერძი ხელუხლებელია. ამ ორის აღრევა ნიშნავდა, რომ ფოტოს
     * დახარისხება ჩუმად ფილმს მოაშორებდა.
     */
    public function test_moving_changes_only_the_axis_that_was_sent(): void
    {
        Storage::fake('public');
        $movie = $this->makeMovie();
        $image = $this->photo($movie);

        $album = $this->actingAs($this->user)
            ->postJson('/api/gallery/albums', ['name' => 'საყვარლები'])
            ->assertCreated()
            ->json();

        // მხოლოდ ალბომი
        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$image->id], 'album_id' => $album['id']])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $image->refresh();
        $this->assertSame($album['id'], $image->album_id);
        $this->assertSame('movie', $image->imageable_type);

        // მხოლოდ მშობელი — ალბომი რჩება
        $actor = CastMember::create(['name' => 'Sigourney']);
        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$image->id], 'target' => 'cast_member:'.$actor->id])
            ->assertOk();

        $image->refresh();
        $this->assertSame('cast_member', $image->imageable_type);
        $this->assertSame($album['id'], $image->album_id);

        // `none` — უკატეგორიოში
        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$image->id], 'target' => 'none'])
            ->assertOk();

        $this->assertNull($image->refresh()->imageable_type);
    }

    /**
     * SEC-07 — გალერეის `$actions` უფლების მქონე ანგარიში (მოდული ჩართული)
     * და მისი ერთი ფოტო, ფილმზე.
     *
     * @param  list<string>  $actions
     * @return array{0: User, 1: GalleryImage}
     */
    private function galleryRoleUser(string $key, array $actions): array
    {
        $role = Role::create([
            'key' => $key,
            'name_ka' => $key,
            'name_en' => $key,
            'permissions' => ['gallery' => $actions, 'movie' => ['view']],
        ]);

        $user = User::create([
            'name' => $key,
            'username' => $key,
            'email' => "{$key}@example.com",
            'password' => 'password',
        ]);
        $user->forceFill(['role_id' => $role->id])->save();
        $user->modules()->sync(Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all());

        Storage::disk('public')->put("gallery/images/{$key}.jpg", 'x');

        $image = GalleryImage::create([
            'user_id' => $user->id,
            'imageable_type' => null,
            'imageable_id' => null,
            'source' => 'tmdb',
            'category' => 'backdrop',
            'path' => "gallery/images/{$key}.jpg",
            'size' => 100,
        ]);

        return [$user->refresh(), $image];
    }

    /**
     * ⚠️ **SEC-07 (High, 2026-09-17).** გადატანა `POST`-ია და `create`-ად
     * იკითხებოდა: create-only როლი **არსებულ** ფოტოებს გადაიტანდა
     * (ჩაკეტილ ალბომში — ე.ი. დამალვა), update-only კი ცრუ 403-ს იღებდა.
     */
    public function test_a_create_only_role_cannot_move_photos(): void
    {
        Storage::fake('public');

        [$creator, $photo] = $this->galleryRoleUser('gallery-creator', ['view', 'create']);
        $movie = Movie::create(['user_id' => $creator->id, 'year' => 1986]);
        $photo->forceFill(['imageable_type' => 'movie', 'imageable_id' => $movie->id])->save();

        $this->actingAs($creator)
            ->postJson('/api/gallery/images/move', ['ids' => [$photo->id], 'target' => 'none'])
            ->assertForbidden()
            ->assertJson(['message' => 'forbidden_permission', 'permission' => 'gallery.update']);

        $this->assertSame('movie', $photo->refresh()->imageable_type);
    }

    /** SEC-07 — ⚠️ და update-only როლი (create-ის გარეშე) **გადაიტანს**, ცრუ 403-ის გარეშე */
    public function test_an_update_only_role_can_move_photos(): void
    {
        Storage::fake('public');

        [$editor, $editorsPhoto] = $this->galleryRoleUser('gallery-editor', ['view', 'update']);
        $movie = Movie::create(['user_id' => $editor->id, 'year' => 1986]);

        $this->actingAs($editor)
            ->postJson('/api/gallery/images/move', ['ids' => [$editorsPhoto->id], 'target' => 'movie:'.$movie->id])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame('movie', $editorsPhoto->refresh()->imageable_type);
    }

    /** სხვისი ფოტო უბრალოდ ვერ მოიძებნება — `owner` სკოუპი */
    public function test_moving_never_reaches_another_users_photo(): void
    {
        Storage::fake('public');
        $other = User::create([
            'name' => 'otto', 'username' => 'otto',
            'email' => 'otto@example.com', 'password' => 'password',
        ]);
        $theirs = GalleryImage::create([
            'user_id' => $other->id, 'imageable_type' => null, 'imageable_id' => null,
            'source' => 'upload', 'path' => 'gallery/images/x.jpg', 'size' => 10,
        ]);

        $album = $this->actingAs($this->user)
            ->postJson('/api/gallery/albums', ['name' => 'Mine'])->json();

        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$theirs->id], 'album_id' => $album['id']])
            ->assertOk()
            ->assertJsonPath('moved', 0);

        $this->assertNull($theirs->refresh()->album_id);
    }

    /**
     * ალბომის წაშლა **ფოტოებს არ შლის** — ისინი უკატეგორიოში ბრუნდება
     * (ან `move_to`-თი სხვა ალბომში).
     */
    public function test_deleting_an_album_keeps_its_photos(): void
    {
        Storage::fake('public');
        $image = $this->photo(null);

        $album = $this->actingAs($this->user)->postJson('/api/gallery/albums', ['name' => 'A'])->json();
        $target = $this->actingAs($this->user)->postJson('/api/gallery/albums', ['name' => 'B'])->json();

        $this->actingAs($this->user)
            ->postJson('/api/gallery/images/move', ['ids' => [$image->id], 'album_id' => $album['id']])
            ->assertOk();

        $this->actingAs($this->user)
            ->deleteJson('/api/gallery/albums/'.$album['id'], ['move_to' => $target['id']])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame($target['id'], $image->refresh()->album_id);
        $this->assertSame(1, GalleryImage::withoutGlobalScope('owner')->count());
        $this->assertSame(1, GalleryAlbum::withoutGlobalScope('owner')->count());
    }

    /**
     * §25.5 — „ჩანაწერს ვშლი, ფოტოები გალერეაში დამიტოვე".
     *
     * ⚠️ ფოტო **უკატეგორიო** ხდება და არა იშლება; მოცულობა კი არ
     * თავისუფლდება, რასაც გეგმაც ცხადად ამბობს.
     */
    public function test_purge_can_keep_a_records_photos_in_the_gallery(): void
    {
        Storage::fake('public');
        $this->user->assignRole('super_admin')->save();

        $movie = $this->makeMovie();
        $image = $this->photo($movie);

        $this->actingAs($this->user->refresh())
            ->postJson('/api/admin/purge/plan', [
                'target' => 'movie', 'mode' => 'all', 'keep_gallery' => true,
            ])
            ->assertOk()
            ->assertJsonPath('plan.photos', 0)
            ->assertJsonPath('plan.kept_photos', 1)
            // ადგილი არ თავისუფლდება — ფაილი დისკზე რჩება
            ->assertJsonPath('plan.bytes', 0);

        $this->actingAs($this->user)
            ->postJson('/api/admin/purge/item', [
                'target' => 'movie', 'id' => $movie->id,
                'keep_gallery' => true, 'confirm' => 'DELETE',
            ])
            ->assertOk();

        $this->assertSame(0, Movie::withoutGlobalScope('owner')->count());
        $kept = GalleryImage::withoutGlobalScope('owner')->find($image->id);
        $this->assertNotNull($kept, 'the photo must survive the record');
        $this->assertNull($kept->imageable_type);
    }

    /** ნაგულისხმევად ისევ იშლება — „დატოვება" ცხადი არჩევანია */
    public function test_without_the_flag_the_gallery_still_goes(): void
    {
        Storage::fake('public');
        $this->user->assignRole('super_admin')->save();

        $movie = $this->makeMovie();
        $image = $this->photo($movie);

        $this->actingAs($this->user->refresh())
            ->postJson('/api/admin/purge/item', [
                'target' => 'movie', 'id' => $movie->id, 'confirm' => 'DELETE',
            ])
            ->assertOk();

        $this->assertNull(GalleryImage::withoutGlobalScope('owner')->find($image->id));
    }

    /**
     * ⚠️ **„ალბომის გარეშე" ბარათი აღარ არსებობს** (შენი მითითება,
     * 2026-09-16). ჯგუფებში მხოლოდ ნამდვილი ალბომებია; უმშობლო ფოტო
     * კვლავ არსებობს და `owner=none`-ზე იკითხება — უბრალოდ ალბომებში
     * აღარ იხატება.
     */
    public function test_the_album_cut_holds_only_real_albums(): void
    {
        Storage::fake('public');
        $this->photo(null);
        $this->actingAs($this->user)->postJson('/api/gallery/albums', ['name' => 'A'])->assertCreated();
        $this->actingAs($this->user)->postJson('/api/gallery/albums', ['name' => 'B'])->assertCreated();

        $groups = $this->actingAs($this->user)
            ->getJson('/api/gallery/groups?by=album')
            ->assertOk()
            ->json('groups');

        $this->assertCount(2, $groups);
        $this->assertSame(['A', 'B'], array_column($groups, 'title'));
        $this->assertSame([], array_filter($groups, fn ($g) => $g['id'] === 0));

        // უმშობლო ფოტო კი ისევ თავის ადგილზეა
        $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?owner=none')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /**
     * „არეული" ხედი — **ალბომებში ჩალაგებული** ფოტოები.
     *
     * ⚠️ `owner=none` აქ არ გამოდგებოდა: ის სწორედ იმ „ალბომის გარეშე"
     * საქაღალდეს დააბრუნებდა, რომელიც მოვხსენით.
     */
    public function test_the_flat_album_view_lists_photos_that_are_in_an_album(): void
    {
        Storage::fake('public');
        $inside = $this->photo(null, 'gallery/images/in.jpg');
        $this->photo(null, 'gallery/images/out.jpg');

        $album = $this->actingAs($this->user)
            ->postJson('/api/gallery/albums', ['name' => 'A'])->json();
        $inside->update(['album_id' => $album['id']]);

        $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?album=any')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $inside->id);
    }

    /* ============================================================
       **ჩაკეტილი ალბომი (2026-09-16).**

       შენი პირობა: „თუ ჩაკეტილია და პაროლი ადევს, არცერთი ფოტო არ ჩანდეს
       და ვერც ინსპექტიდან ვერ შეძლო ნახვა". ე.ი. ამოწმებადი ფაქტი ერთია:
       **ფაილის გზა პასუხში არ მოდის** — არც სიაში, არც ესკიზში, არც
       სხვა ჭრილში.

       ⚠️ **`Referer` აუცილებელია**: `/api`-ს სესია მხოლოდ stateful
       მოთხოვნაზე აქვს (Sanctum-ის cookie რეჟიმი), ე.ი. ამ სათაურის
       გარეშე „გახსნილობას" შესანახი ადგილი არ ექნებოდა.
       ============================================================ */

    /**
     * stateful მოთხოვნა — ზუსტად ისეთი, როგორსაც SPA აგზავნის.
     *
     * ⚠️ **`withHeaders()` ტესტის დანარჩენ მოთხოვნებზეც რჩება** (ის
     * `defaultHeaders`-ში ჯდება), ე.ი. ერთხელ გაგზავნილი `Referer` ყველა
     * მომდევნო გამოძახებას stateful-ად აქცევს და `array` სესია მონაცემს
     * ინახავს. ამიტომ **ჩაკეტილი ალბომი პირდაპირ მოდელით იქმნება** და არა
     * API-ით: API-ით შექმნისას ის იმავე სესიაში ღია რჩება (განზრახ — შენ
     * ახლა დაადე პაროლი) და ტესტი „ჩაკეტილს" ვეღარასდროს შეამოწმებდა.
     */
    private function spa()
    {
        return $this->actingAs($this->user)->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    private function lockedAlbum(string $password = 'secret1'): GalleryAlbum
    {
        $album = GalleryAlbum::create([
            'user_id' => $this->user->id,
            'name' => 'პირადი',
            'password_hash' => Hash::make($password),
            'sort_order' => 1,
        ]);

        // სტატიკური მემო ერთ პროცესში ცოცხლობს — ახალი ლოკი უნდა დაინახოს
        AlbumLock::flush();

        return $album;
    }

    /** ჩაკეტილი ალბომის ფოტო არცერთი endpoint-იდან არ გამოდის */
    public function test_a_locked_album_never_leaks_a_photo_path(): void
    {
        Storage::fake('public');
        $album = $this->lockedAlbum();
        $image = $this->photo($this->makeMovie(), 'gallery/images/secret.jpg');
        $image->update(['album_id' => $album->id]);
        $open = $this->photo(null, 'gallery/images/open.jpg');

        // სია
        $this->actingAs($this->user)->getJson('/api/gallery/photos')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $open->id)
            ->assertDontSee('secret.jpg');

        // ჯგუფები — რიცხვი ჩანს, ესკიზი არა
        $groups = $this->actingAs($this->user)->getJson('/api/gallery/groups?by=album')
            ->assertOk()
            ->assertDontSee('secret.jpg')
            ->json();

        $locked = collect($groups['groups'])->firstWhere('id', $album->id);
        $this->assertTrue($locked['locked']);
        $this->assertSame(1, $locked['photos'], 'the count must stay honest');
        $this->assertArrayNotHasKey('album:'.$album->id, $groups['previews']);

        // უკატეგორიოს ჭრილი — ფოტო იქაც არ ჩნდება
        $this->actingAs($this->user)->getJson('/api/gallery/photos?owner=none')
            ->assertOk()
            ->assertDontSee('secret.jpg');

        // შეჯამება — ჩაკეტილი ფოტო რიცხვშიც აღარაა
        $this->actingAs($this->user)->getJson('/api/gallery')
            ->assertOk()
            ->assertJsonPath('photos', 1);
    }

    /**
     * პირდაპირ ალბომის გახსნა — **რიგები ჩანს, ბილიკი არა** (Tasks §7.11/§7.15).
     *
     * ⚠️ ადრე ეს 423 იყო. შენი მითითებით („ჩაკეტილ ფოტოებს ბლარიანი ფოტო
     * დაუდგეს") ის შეიცვალა: ბადემ უნდა დახატოს ბლარიანი ფილები და პაროლი
     * იკითხოს — ე.ი. რიგები საჭიროა. სამაგიეროდ **`url`/`path`/`source_url`
     * არცერთი არ მიდის**, ე.ი. ინსპექტორს ისევ საპოვნელი არაფერი აქვს.
     */
    public function test_a_locked_album_returns_rows_without_any_path(): void
    {
        Storage::fake('public');
        $album = $this->lockedAlbum();
        $this->photo($this->makeMovie(), 'gallery/images/secret.jpg')->update(['album_id' => $album->id]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/gallery/photos?owner=album:'.$album->id)
            ->assertOk()
            ->assertJsonPath('locked', true)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.locked', true);

        $this->assertStringNotContainsString('secret.jpg', $response->getContent());
        $this->assertArrayNotHasKey('url', $response->json('data.0'));
    }

    /** სწორი პაროლი ხსნის, არასწორი — 422 */
    public function test_the_password_decides(): void
    {
        Storage::fake('public');
        $album = $this->lockedAlbum('secret1');

        $this->spa()
            ->postJson('/api/gallery/albums/'.$album->id.'/unlock', ['password' => 'wrong'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'album_password_wrong');

        $this->spa()
            ->postJson('/api/gallery/albums/'.$album->id.'/unlock', ['password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('unlocked', true);
    }

    /**
     * გახსნილი სესია ფოტოებს ისევ ხედავს.
     *
     * ⚠️ სესია ტესტებში `array` დრაივერზეა, ე.ი. მოთხოვნებს შორის არ
     * გადადის — ამიტომ „გახსნილობა" `withSession()`-ით იდება: სწორედ ის
     * მდგომარეობა, რომელსაც `unlock` წერს.
     */
    public function test_an_unlocked_session_sees_the_photos(): void
    {
        Storage::fake('public');
        $album = $this->lockedAlbum();
        $image = $this->photo(null, 'gallery/images/secret.jpg');
        $image->update(['album_id' => $album->id]);

        $this->actingAs($this->user)
            ->withHeaders(['Referer' => 'http://localhost:5173'])
            ->withSession([AlbumLock::SESSION_KEY => [$album->id]])
            ->getJson('/api/gallery/photos?owner=album:'.$album->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $image->id);
    }

    /**
     * **ალბომის წაშლა ლოკის შემოვლა ვერ იქნება.**
     *
     * წაშლა ფოტოებს „უკატეგორიოში" აბრუნებს, ე.ი. უპაროლოდ დაშვებული
     * ერთი კლიკით გააშიშვლებდა იმას, რაც ეს-ესაა დამალე.
     */
    public function test_a_locked_album_cannot_be_deleted_without_unlocking(): void
    {
        Storage::fake('public');
        $album = $this->lockedAlbum();

        $this->actingAs($this->user)
            ->deleteJson('/api/gallery/albums/'.$album->id)
            ->assertStatus(423);

        $this->assertNotNull(GalleryAlbum::withoutGlobalScope('owner')->find($album->id));
    }

    /**
     * **პაროლის მოხსნა ანგარიშის პაროლს ითხოვს** (Tasks §7.8, შენი გადაწყვეტილება).
     *
     * ⚠️ ადრე ის ალბომის მოქმედ პაროლს ითხოვდა, ე.ი. „დამავიწყდა" ჩიხი იყო.
     * ანგარიშის პაროლი მფლობელობას ისევე ამტკიცებს და აღდგენასაც აძლევს გზას.
     */
    public function test_removing_the_password_needs_the_account_password(): void
    {
        Storage::fake('public');
        $album = $this->lockedAlbum('secret1');

        $this->actingAs($this->user)
            ->putJson('/api/gallery/albums/'.$album->id, ['remove_password' => true])
            ->assertStatus(422)
            ->assertJsonPath('message', 'account_password_wrong');

        // ალბომის საკუთარი პაროლი აქ **აღარ** გამოდგება
        $this->actingAs($this->user)
            ->putJson('/api/gallery/albums/'.$album->id, [
                'remove_password' => true, 'account_password' => 'secret1',
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'account_password_wrong');

        $this->actingAs($this->user)
            ->putJson('/api/gallery/albums/'.$album->id, [
                'remove_password' => true, 'account_password' => 'password',
            ])
            ->assertOk()
            ->assertJsonPath('locked', false);
    }

    /**
     * ⚠️ **ჩანაწერის წაშლა ჩაკეტილ ფოტოსაც შლის.** scope რომ აქაც
     * მოქმედებდეს, ფაილი დისკზე ობლად დარჩებოდა და კვოტას სამუდამოდ
     * დაიკავებდა — ლოკი დამალვაა და არა ხელშეუხებლობა.
     */
    public function test_deleting_the_record_still_deletes_a_locked_photo(): void
    {
        Storage::fake('public');
        $album = $this->lockedAlbum();
        $movie = $this->makeMovie();
        $image = $this->photo($movie, 'gallery/images/secret.jpg');
        $image->update(['album_id' => $album->id]);

        $movie->delete();

        $this->assertNull(
            GalleryImage::withoutGlobalScope('owner')->withoutGlobalScope('album_lock')->find($image->id),
        );
        Storage::disk('public')->assertMissing('gallery/images/secret.jpg');
    }
}
