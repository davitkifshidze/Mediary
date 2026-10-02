<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\AuditLog;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\Series;
use App\Models\Status;
use App\Models\User;
use App\Support\NotificationType;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ბმულიდან საკუთარ ბიბლიოთეკაში დამატება (Tasks §40.8).**
 *
 * ⚠️ სტატუსი **როლით** გადმოდის და არა გასაღებით/სახელით — FEAT-07-ის ტესტის
 * წესი: მიმღების ლექსიკონი აქ განზრახ გადარქმეულია, თორემ ტესტი იმიტომაც
 * გაივლიდა, რომ ორივეს ერთი და იგივე ნაგულისხმევი ლექსიკონი აქვს.
 */
class ShareImportTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $viewer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->owner = $this->makeUser('owner');
        $this->viewer = $this->makeUser('viewer');
        $this->giveCredential($this->viewer, 'tmdb');

        Http::fake([
            'api.themoviedb.org/3/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/*/aggregate_credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/*/videos*' => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => fn ($request) => Http::response([
                'id' => (int) basename(parse_url($request->url(), PHP_URL_PATH)),
                'title' => 'TMDB Title',
                'overview' => 'From TMDB.',
                'genres' => [],
            ]),
            'api.themoviedb.org/3/tv/*' => Http::response(['id' => 1399, 'name' => 'TMDB Show', 'genres' => []]),
            '*' => Http::response([], 404),
        ]);
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());

        return $user->refresh();
    }

    private function movie(User $user, string $title, array $attrs = [], ?string $status = null): Movie
    {
        $movie = Movie::create(['user_id' => $user->id]);
        // ⚠️ `forceFill` — `is_favorite`/`poster_*` შეიძლება `fillable`-ში არ იყოს და ჩუმად დაიკარგებოდა
        $movie->forceFill($attrs)->save();
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        if ($status !== null) {
            Status::ensureDefaults($user->id, 'movie');
            $movie->applyStatusKey($status);
            $movie->save();
        }

        return $movie->refresh();
    }

    /** ბმული მფლობელის სახელით — აბრუნებს ტოკენს */
    private function link(array $domains, array $extra = []): string
    {
        $url = $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => $domains, ...$extra])
            ->assertCreated()
            ->json('data.url');

        Auth::forgetGuards();

        return basename((string) $url);
    }

    private function add(string $token, int $id, string $domain = 'movie', string $mode = 'default')
    {
        return $this->actingAs($this->viewer)->postJson("/api/shares/{$token}/item", [
            'domain' => $domain, 'id' => $id, 'status_mode' => $mode,
        ]);
    }

    /* ================= გეგმა ================= */

    public function test_the_plan_marks_new_have_and_trash_without_asking_tmdb(): void
    {
        $new = $this->movie($this->owner, 'New', ['tmdb_id' => 3]);
        $have = $this->movie($this->owner, 'Have', ['tmdb_id' => 1]);
        $trash = $this->movie($this->owner, 'Trash', ['tmdb_id' => 2]);

        $mine = $this->movie($this->viewer, 'Mine', ['tmdb_id' => 1]);
        $binned = $this->movie($this->viewer, 'Binned', ['tmdb_id' => 2]);
        $this->actingAs($this->viewer);
        $binned->moveToTrash();

        $token = $this->link(['movie' => ['scope' => 'all']]);

        $res = $this->actingAs($this->viewer)
            ->postJson("/api/shares/{$token}/plan", ['domain' => 'movie'])
            ->assertOk();

        $res->assertJson(['counts' => ['new' => 1, 'have' => 1, 'trash' => 1]]);
        $states = collect($res->json('items'))->pluck('state', 'id')->all();
        $this->assertSame('new', $states[$new->id]);
        $this->assertSame('have', $states[$have->id]);
        $this->assertSame('trash', $states[$trash->id]);
        $this->assertSame($mine->id, collect($res->json('items'))->firstWhere('id', $have->id)['mine_id']);

        // მხოლოდ არჩეული ბარათები
        $only = $this->actingAs($this->viewer)
            ->postJson("/api/shares/{$token}/plan", ['domain' => 'movie', 'ids' => [$new->id]])
            ->json('items');
        $this->assertSame([$new->id], array_column($only, 'id'));

        Http::assertNothingSent();
    }

    /** სათაური + წელი — კოდის გარეშე შეყვანილზე (რეგისტრი და ჰარი არ ითვლება) */
    public function test_a_hand_entered_record_matches_by_title_and_year(): void
    {
        $this->movie($this->owner, 'Home Movie', ['year' => 2001]);
        $this->movie($this->viewer, 'home   MOVIE', ['year' => 2001]);

        $token = $this->link(['movie' => ['scope' => 'all']]);

        $this->actingAs($this->viewer)
            ->postJson("/api/shares/{$token}/plan", ['domain' => 'movie'])
            ->assertJson(['counts' => ['new' => 0, 'have' => 1]]);
    }

    public function test_my_own_link_cannot_be_added_from(): void
    {
        $movie = $this->movie($this->owner, 'Mine', ['tmdb_id' => 5]);
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $this->actingAs($this->owner)->postJson("/api/shares/{$token}/plan", ['domain' => 'movie'])
            ->assertStatus(409)->assertJson(['message' => 'share_own_link']);
        $this->actingAs($this->owner)->postJson("/api/shares/{$token}/item", ['domain' => 'movie', 'id' => $movie->id])
            ->assertStatus(409)->assertJson(['message' => 'share_own_link']);
    }

    public function test_adding_needs_a_session(): void
    {
        $movie = $this->movie($this->owner, 'X', ['tmdb_id' => 5]);
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $this->postJson("/api/shares/{$token}/plan", ['domain' => 'movie'])->assertStatus(401);
        $this->postJson("/api/shares/{$token}/item", ['domain' => 'movie', 'id' => $movie->id])->assertStatus(401);
    }

    /* ================= დამატება ================= */

    /** ⚠️ Q49 — მხოლოდ „რა ფილმია": TMDB-დან თავიდან ივსება, გამზიარებლის პირადი ნაწილი არ გადმოდის */
    public function test_a_tmdb_record_is_refilled_from_tmdb_and_the_private_part_stays(): void
    {
        $theirs = $this->movie($this->owner, 'Owner Typed Title', ['tmdb_id' => 603, 'is_favorite' => true]);
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $res = $this->add($token, $theirs->id)->assertOk()->assertJson(['ok' => true, 'result' => 'added', 'partial' => false]);

        $copy = Movie::withoutGlobalScopes()->findOrFail($res->json('id'));
        $this->assertSame($this->viewer->id, (int) $copy->user_id);
        $this->assertSame(603, (int) $copy->tmdb_id);
        $this->assertSame('TMDB Title', $copy->title_en);
        $this->assertFalse((bool) $copy->is_favorite, 'გამზიარებლის „რჩეული" გადმოვიდა');
    }

    /** გასაღების გარეშე — ჩანაწერი მაინც იქმნება, სათაურითა და ჟანრებით, `partial`-ით */
    public function test_without_a_tmdb_key_the_record_is_still_added_with_its_title(): void
    {
        $this->takeCredential($this->viewer, 'tmdb');
        $genre = Genre::create(['slug' => 'drama']);
        $theirs = $this->movie($this->owner, 'Keyless', ['tmdb_id' => 77]);
        $theirs->genres()->attach($genre->id);

        $token = $this->link(['movie' => ['scope' => 'all']]);
        $res = $this->add($token, $theirs->id)->assertOk()->assertJson(['result' => 'added', 'partial' => true]);

        $copy = Movie::withoutGlobalScopes()->findOrFail($res->json('id'));
        $this->assertSame('Keyless', $copy->title_en);
        $this->assertSame(['drama'], $copy->genres()->pluck('slug')->all());
        $this->assertSame('partial', $copy->sync_status);
    }

    public function test_an_added_record_is_logged_counted_and_notifies_the_owner_once_a_day(): void
    {
        $a = $this->movie($this->owner, 'A', ['tmdb_id' => 11]);
        $b = $this->movie($this->owner, 'B', ['tmdb_id' => 12]);
        $token = $this->link(['movie' => ['scope' => 'all']], ['name' => 'For Nino']);

        $this->add($token, $a->id)->assertOk();
        $this->add($token, $b->id)->assertOk();

        $log = AuditLog::where('action', AuditLog::ACTION_IMPORT)->latest('id')->first();
        $this->assertSame('share', $log->new_values['source']);
        $this->assertSame('owner', $log->new_values['owner']);

        $this->assertSame(2, (int) DB::table('share_links')->value('imports'));
        $this->assertSame(2, (int) DB::table('share_link_imports')->where('user_id', $this->viewer->id)->value('added'));

        $this->assertSame(1, $this->owner->notifications()->where('type', NotificationType::SHARE_IMPORTED)->count(),
            'რიგი თითო ჩანაწერზე შეტყობინებას წერს');

        // მფლობელის სია „ვინ დაიმატა"-ს აჩვენებს
        $importers = $this->actingAs($this->owner)->getJson('/api/share-links')->json('data.0.importers');
        $this->assertSame('viewer', $importers[0]['username']);
        $this->assertSame(2, $importers[0]['added']);
    }

    /** ⚠️ კლიენტს ვენდობით იმაში, რას ითხოვს, და არა იმაში, რა არის ბმულში */
    public function test_a_record_outside_the_scope_is_404(): void
    {
        $fav = $this->movie($this->owner, 'Fav', ['tmdb_id' => 21, 'is_favorite' => true]);
        $other = $this->movie($this->owner, 'Other', ['tmdb_id' => 22]);
        $token = $this->link(['movie' => ['scope' => 'favorite']]);

        $this->add($token, $other->id)->assertStatus(404)->assertJson(['message' => 'share_record_not_found']);
        $this->add($token, $fav->id)->assertOk();
    }

    public function test_duplicates_are_never_multiplied_and_the_trash_is_named(): void
    {
        $theirs = $this->movie($this->owner, 'Twice', ['tmdb_id' => 31]);
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $first = $this->add($token, $theirs->id)->assertOk()->json('id');
        $this->add($token, $theirs->id)->assertOk()->assertJson(['result' => 'have', 'id' => $first]);
        $this->assertSame(1, Movie::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());

        $this->actingAs($this->viewer);
        Movie::withoutGlobalScopes()->findOrFail($first)->moveToTrash();

        $this->add($token, $theirs->id)->assertStatus(409)->assertJson(['message' => 'record_in_trash', 'id' => $first]);
        $this->assertSame(1, Movie::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
    }

    public function test_the_module_and_the_create_right_are_required(): void
    {
        $theirs = $this->movie($this->owner, 'X', ['tmdb_id' => 41]);
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $role = Role::create([
            'key' => 'looker', 'name_ka' => 'მაყურებელი', 'name_en' => 'Looker',
            'permissions' => ['movie' => ['view']],
        ]);
        $this->viewer->forceFill(['role_id' => $role->id])->save();
        $this->add($token, $theirs->id)->assertStatus(403)->assertJson(['message' => 'forbidden']);

        $this->viewer->forceFill(['role_id' => Role::where('key', 'user')->value('id')])->save();
        $this->viewer->modules()->detach(Module::where('key', 'movie')->value('id'));
        $this->actingAs($this->viewer->refresh())
            ->postJson("/api/shares/{$token}/item", ['domain' => 'movie', 'id' => $theirs->id])
            ->assertStatus(403)->assertJson(['message' => 'module_disabled']);

        $this->assertSame(0, Movie::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
    }

    /** ⚠️ Q48 — როლით და გამზიარებლის თარიღით; მიმღების ლექსიკონი გადარქმეულია */
    public function test_the_owners_status_travels_by_role_with_its_date(): void
    {
        $theirs = $this->movie($this->owner, 'Seen', ['tmdb_id' => 51], 'watched');
        $theirs->forceFill(['watched_at' => '2020-05-01 20:00:00'])->saveQuietly();

        Status::ensureDefaults($this->viewer->id, 'movie');
        Status::withoutGlobalScope('owner')
            ->where('user_id', $this->viewer->id)->where('module', 'movie')->where('role', 'done')
            ->update(['key' => 'seen', 'name_ka' => 'ვნახე', 'name_en' => 'Seen it']);

        $token = $this->link(['movie' => ['scope' => 'all']]);
        $id = $this->add($token, $theirs->id, 'movie', 'owner')->assertOk()->json('id');

        $copy = Movie::withoutGlobalScopes()->findOrFail($id);
        $this->assertSame('seen', $copy->status?->key);
        $this->assertSame('2020-05-01', $copy->watched_at?->toDateString());
        // ⚠️ ყურების ჟურნალი იმავე თარიღით — და არა „დღეს"
        $logged = DB::table('media_watches')->where('watchable_type', 'movie')->where('watchable_id', $id)->value('watched_at');
        $this->assertNotNull($logged, 'ყურების ჟურნალში რიგი არ ჩაიწერა');
        $this->assertSame('2020-05-01', substr((string) $logged, 0, 10));
    }

    public function test_the_default_mode_uses_my_default_status(): void
    {
        $theirs = $this->movie($this->owner, 'Seen', ['tmdb_id' => 52], 'watched');
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $id = $this->add($token, $theirs->id)->assertOk()->json('id');

        $copy = Movie::withoutGlobalScopes()->findOrFail($id);
        $this->assertTrue((bool) $copy->status?->is_default);
        $this->assertNull($copy->watched_at);
    }

    public function test_the_owners_status_cannot_be_taken_when_the_link_hides_it(): void
    {
        $theirs = $this->movie($this->owner, 'Hidden', ['tmdb_id' => 53], 'watched');
        $token = $this->link(['movie' => ['scope' => 'all']], ['show_status' => false]);

        $this->add($token, $theirs->id, 'movie', 'owner')
            ->assertStatus(422)->assertJson(['message' => 'share_status_hidden']);
    }

    /** ხელით შეყვანილი — ტექსტი, წელი, ჟანრები და პოსტერი (მიმღების კვოტით) */
    public function test_a_hand_entered_record_copies_its_text_genres_and_poster(): void
    {
        Storage::disk('public')->put('movies/posters/own.jpg', str_repeat('x', 1000));
        $genre = Genre::create(['slug' => 'drama']);

        $theirs = Movie::create(['user_id' => $this->owner->id]);
        $theirs->forceFill(['year' => 2001, 'poster_path' => 'movies/posters/own.jpg', 'poster_source' => 'upload'])->save();
        $theirs->translations()->create(['locale' => 'en', 'title' => 'Home Movie', 'description' => 'Ours.', 'source' => 'manual']);
        $theirs->translations()->create(['locale' => 'ka', 'title' => 'სახლის ფილმი']);
        $theirs->genres()->attach($genre->id);

        $usedBefore = (int) $this->viewer->refresh()->storage_used_bytes;
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $res = $this->add($token, $theirs->id)->assertOk()->assertJson(['result' => 'added', 'poster_skipped' => null]);

        $copy = Movie::withoutGlobalScopes()->findOrFail($res->json('id'));
        $this->assertSame('Home Movie', $copy->title_en);
        $this->assertSame('სახლის ფილმი', $copy->title_ka);
        $this->assertSame('Ours.', $copy->description_en);
        $this->assertSame(2001, (int) $copy->year);
        $this->assertSame(['drama'], $copy->genres()->pluck('slug')->all());

        // ⚠️ ფაილი კოპირდება — გამზიარებლის წაშლა მიმღების პოსტერს არ ტეხს
        $this->assertNotSame('movies/posters/own.jpg', $copy->poster_path);
        $this->assertSame('upload', $copy->poster_source);
        Storage::disk('public')->assertExists($copy->poster_path);
        $this->assertSame($usedBefore + 1000, (int) $this->viewer->refresh()->storage_used_bytes);
    }

    public function test_a_full_quota_adds_the_record_without_its_poster(): void
    {
        Storage::disk('public')->put('movies/posters/big.jpg', str_repeat('x', 5000));
        $theirs = Movie::create(['user_id' => $this->owner->id]);
        $theirs->forceFill(['poster_path' => 'movies/posters/big.jpg', 'poster_source' => 'upload'])->save();
        $theirs->translations()->create(['locale' => 'en', 'title' => 'Big Poster']);

        $this->viewer->forceFill(['storage_quota_bytes' => 10])->save();
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $res = $this->add($token, $theirs->id)->assertOk()
            ->assertJson(['result' => 'added', 'poster_skipped' => 'storage_quota_exceeded']);

        $copy = Movie::withoutGlobalScopes()->findOrFail($res->json('id'));
        $this->assertSame('Big Poster', $copy->title_en);
        $this->assertNull($copy->poster_path);
    }

    public function test_series_and_anime_can_be_added_too(): void
    {
        $series = Series::create(['user_id' => $this->owner->id, 'tmdb_id' => 1399]);
        $series->translations()->create(['locale' => 'en', 'title' => 'S']);
        $anime = Anime::create(['user_id' => $this->owner->id, 'tmdb_id' => 1400]);
        $anime->translations()->create(['locale' => 'en', 'title' => 'A']);

        $token = $this->link(['series' => ['scope' => 'all'], 'anime' => ['scope' => 'all']]);

        $this->add($token, $series->id, 'series')->assertOk()->assertJson(['result' => 'added']);
        $this->add($token, $anime->id, 'anime')->assertOk()->assertJson(['result' => 'added']);
        $this->assertSame(1, Series::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
        $this->assertSame(1, Anime::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
    }

    public function test_an_expired_link_cannot_be_added_from(): void
    {
        $theirs = $this->movie($this->owner, 'X', ['tmdb_id' => 61]);
        $token = $this->link(['movie' => ['scope' => 'all']]);
        DB::table('share_links')->update(['expires_at' => now()->subMinute()]);

        $this->add($token, $theirs->id)->assertStatus(410)->assertJson(['message' => 'share_expired']);
    }

    /** §40.6 — მოდულის უქონელს გვერდი მოთხოვნის ღილაკს აჩვენებს */
    public function test_the_head_says_which_sections_can_take_records(): void
    {
        $this->movie($this->owner, 'X', ['tmdb_id' => 71]);
        $token = $this->link(['movie' => ['scope' => 'all']]);

        $this->viewer->modules()->detach(Module::where('key', 'movie')->value('id'));
        $viewer = $this->viewer->refresh();

        $this->actingAs($viewer)->getJson("/api/public/shares/{$token}")
            ->assertOk()
            ->assertJsonPath('viewer.sections.movie', ['enabled' => false, 'can_create' => false, 'requested' => false]);

        $this->actingAs($viewer)->postJson('/api/requests/module', ['module_key' => 'movie'])->assertSuccessful();

        $this->actingAs($viewer)->getJson("/api/public/shares/{$token}")
            ->assertJsonPath('viewer.sections.movie.requested', true);
    }
}
