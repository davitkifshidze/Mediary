<?php

namespace Tests\Feature;

use App\Models\BoardGameGenre;
use App\Models\BookGenre;
use App\Models\BookmarkCategory;
use App\Models\CourseCategory;
use App\Models\GameGenre;
use App\Models\Module;
use App\Models\PlaceCategory;
use App\Models\SongGenre;
use App\Models\Status;
use App\Models\User;
use App\Models\VideoType;
use App\Support\ShareDomain;
use App\Support\VideoUrl;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **გაზიარების ბმული — ეტაპი 2-ის რვა დომენი (Tasks §40.10).**
 *
 * ⚠️ ყოველი ნახვის ტესტი **შესულ უცხოზეც** ეშვება (§1.2-ის გაკვეთილი):
 * ლექსიკონის მოდელს `owner` scope აქვს, ე.ი. ანონიმურ ტესტზე ჟანრი ჩანს,
 * შესულ უცხოს კი — მის საკუთარ ლექსიკონზე მოჭრილი რელაცია ცარიელს აძლევდა.
 */
class ShareModulesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $viewer;

    /** დომენი → ლექსიკონის მოდელი */
    private const CLASSIFIERS = [
        'game' => GameGenre::class,
        'book' => BookGenre::class,
        'board_game' => BoardGameGenre::class,
        'place' => PlaceCategory::class,
        'video' => VideoType::class,
        'song' => SongGenre::class,
        'bookmark' => BookmarkCategory::class,
        'course' => CourseCategory::class,
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->owner = $this->makeUser('owner');
        $this->viewer = $this->makeUser('viewer');
    }

    public static function domains(): array
    {
        return array_map(fn (string $d) => [$d], array_combine(array_keys(self::CLASSIFIERS), array_keys(self::CLASSIFIERS)));
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', array_keys(self::CLASSIFIERS))->pluck('id')->all());

        // ⚠️ `refresh()` — კვოტა ბაზის ნაგულისხმევიდან მოდის, მეხსიერებაში კი `null` იქნებოდა (413)
        return $user->refresh();
    }

    /**
     * მინიმალური ჩანაწერი დომენში — სათაურით (და ვიდეოს/სიმღერის/ბუკმარკის ბმულით).
     *
     * @param  array<string, mixed>  $attrs
     */
    private function make(string $domain, User $user, string $title, array $attrs = []): Model
    {
        $model = ShareDomain::model($domain);
        $base = match ($domain) {
            'board_game' => ['title' => $title],
            'place' => ['name' => $title, 'status' => 'to_visit'],
            'game' => ['title_en' => $title, 'status' => 'to_play'],
            'book' => ['title_en' => $title, 'status' => 'to_read'],
            'course' => ['title' => $title, 'status' => 'to_take'],
            'video', 'song' => ['title' => $title, 'url' => 'https://www.youtube.com/watch?v='.substr(md5($title), 0, 11)],
            'bookmark' => ['title' => $title, 'url' => 'https://example.com/'.rawurlencode($title)],
        };

        /** @var Model $record */
        $record = new $model;
        $record->forceFill(['user_id' => $user->id, ...$base, ...$attrs]);

        if (in_array($domain, ['video', 'song'], true) && $record->url) {
            $parsed = VideoUrl::parse((string) $record->url);
            $record->forceFill(['platform' => $parsed['platform'], 'external_id' => $parsed['external_id'], 'embed_url' => $parsed['embed_url']]);
        }

        if ($domain === 'bookmark') {
            $record->applyUrl((string) $record->url);
        }

        $record->save();

        return $record->refresh();
    }

    /** ლექსიკონის ჩანაწერი მომხმარებელთან (იპოვის ან შექმნის) */
    private function entry(string $domain, User $user, string $nameEn, ?string $nameKa = null, ?string $icon = null): Model
    {
        $model = self::CLASSIFIERS[$domain];

        $found = $model::withoutGlobalScope('owner')->where('user_id', $user->id)->where('name_en', $nameEn)->first();

        if ($found) {
            return $found;
        }

        $entry = new $model;
        $entry->forceFill([
            'user_id' => $user->id,
            'key' => $model::makeKey($user->id, $nameEn),
            'name_ka' => $nameKa ?? $nameEn,
            'name_en' => $nameEn,
            'icon' => $icon,
            'sort_order' => 99,
        ])->save();

        return $entry;
    }

    /** ჩანაწერს კლასიფიკატორის ჩანაწერი მიაბა (სვეტი ან pivot) */
    private function classify(string $domain, Model $record, Model $entry): void
    {
        $shape = ShareDomain::classifierShape($domain);

        if ($shape['type'] === 'column') {
            $record->forceFill([$shape['column'] => $entry->id])->save();

            return;
        }

        DB::table($shape['table'])->insert([$shape['foreign'] => $record->id, $shape['related'] => $entry->id]);
    }

    private function link(array $domains, array $extra = []): string
    {
        $url = $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => $domains, ...$extra])
            ->assertCreated()
            ->json('data.url');

        Auth::forgetGuards();

        return basename((string) $url);
    }

    private function anonymous(string $uri): TestResponse
    {
        Auth::forgetGuards();

        return $this->getJson($uri);
    }

    private function add(string $token, string $domain, int $id, string $mode = 'default'): TestResponse
    {
        return $this->actingAs($this->viewer)->postJson("/api/shares/{$token}/item", [
            'domain' => $domain, 'id' => $id, 'status_mode' => $mode,
        ]);
    }

    /** მიმღების ერთადერთი ჩანაწერი ამ დომენში */
    private function mine(string $domain): Model
    {
        $model = ShareDomain::model($domain);

        return $model::withoutGlobalScopes()->where('user_id', $this->viewer->id)->latest('id')->firstOrFail();
    }

    /* ================= ნახვა ================= */

    #[DataProvider('domains')]
    public function test_every_domain_is_seen_with_its_classifier_by_both_strangers(string $domain): void
    {
        $a = $this->make($domain, $this->owner, 'Alpha');
        $this->make($domain, $this->owner, 'Beta');
        $drama = $this->entry($domain, $this->owner, 'Drama', 'დრამა');
        $this->classify($domain, $a, $drama);

        $token = $this->link([$domain => ['scope' => 'all']]);

        $this->anonymous("/api/public/shares/{$token}")
            ->assertOk()
            ->assertJsonPath('sections.0.domain', $domain)
            ->assertJsonPath('sections.0.count', 2);

        foreach (['anonymous', 'stranger'] as $who) {
            $res = $who === 'anonymous'
                ? $this->anonymous("/api/public/shares/{$token}/{$domain}")
                : $this->actingAs($this->viewer)->getJson("/api/public/shares/{$token}/{$domain}");

            $res->assertOk()->assertJsonPath('meta.total', 2);
            $card = collect($res->json('data'))->firstWhere('id', $a->id);

            $this->assertSame('Alpha', $card['title_en'] ?? $card['title_ka'] ?? null, "{$who}: სათაური");
            $this->assertSame('Drama', $card['genres'][0]['name_en'] ?? null, "{$who}: კლასიფიკატორი ბარათზე მოჭრილია");
            // ⚠️ `value` — **მფლობელის** ლექსიკონის id (ფილტრი სწორედ მას აბრუნებს)
            $this->assertSame((string) $drama->id, $card['genres'][0]['value'] ?? null);
            $this->assertSame([['value' => (string) $drama->id, 'name_ka' => 'დრამა', 'name_en' => 'Drama', 'count' => 1]], $res->json('genres'), "{$who}: ფასეტი");
        }
    }

    #[DataProvider('domains')]
    public function test_the_classifier_scope_and_filter_use_the_owners_ids(string $domain): void
    {
        $drama = $this->entry($domain, $this->owner, 'Drama');
        $comedy = $this->entry($domain, $this->owner, 'Comedy');
        $a = $this->make($domain, $this->owner, 'Alpha');
        $b = $this->make($domain, $this->owner, 'Beta');
        $this->classify($domain, $a, $drama);
        $this->classify($domain, $b, $comedy);

        $token = $this->link([$domain => ['scope' => 'genre', 'categories' => [$drama->id]]]);
        $ids = array_column($this->actingAs($this->viewer)->getJson("/api/public/shares/{$token}/{$domain}")->json('data'), 'id');
        $this->assertSame([$a->id], $ids);

        // სექციის შიგნით ფილტრი — იგივე id
        $all = $this->link([$domain => ['scope' => 'all']]);
        $filtered = array_column($this->actingAs($this->viewer)->getJson("/api/public/shares/{$all}/{$domain}?genre={$comedy->id}")->json('data'), 'id');
        $this->assertSame([$b->id], $filtered);

        // ⚠️ სხვისი id ჩუმად ვარდება — და თუ მეტი არაფერი დარჩა, 422 და არა „ყველაფერი"
        $foreign = $this->entry($domain, $this->viewer, 'Mystery');
        $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => [$domain => ['scope' => 'genre', 'categories' => [$foreign->id]]]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'share_scope_incomplete');
    }

    public function test_all_genres_at_once_works_on_a_pivot_classifier(): void
    {
        $action = $this->entry('game', $this->owner, 'Action');
        $rpg = $this->entry('game', $this->owner, 'RPG');
        $both = $this->make('game', $this->owner, 'Both');
        $one = $this->make('game', $this->owner, 'One');
        $this->classify('game', $both, $action);
        $this->classify('game', $both, $rpg);
        $this->classify('game', $one, $action);

        $any = $this->link(['game' => ['scope' => 'genre', 'categories' => [$action->id, $rpg->id], 'genre_mode' => 'any']]);
        $all = $this->link(['game' => ['scope' => 'genre', 'categories' => [$action->id, $rpg->id], 'genre_mode' => 'all']]);

        $this->assertEqualsCanonicalizing([$both->id, $one->id], array_column($this->anonymous("/api/public/shares/{$any}/game")->json('data'), 'id'));
        $this->assertSame([$both->id], array_column($this->anonymous("/api/public/shares/{$all}/game")->json('data'), 'id'));
    }

    public function test_status_scope_follows_each_domains_mechanism(): void
    {
        // enum — გასაღები კოდშია
        $done = $this->make('game', $this->owner, 'Done', ['status' => 'finished']);
        $this->make('game', $this->owner, 'Todo');
        $token = $this->link(['game' => ['scope' => 'status', 'statuses' => ['finished']]]);
        $this->assertSame([$done->id], array_column($this->anonymous("/api/public/shares/{$token}/game")->json('data'), 'id'));

        // ლექსიკონი — მფლობელის გასაღები
        Status::ensureDefaults($this->owner->id, 'video');
        $watched = $this->make('video', $this->owner, 'Seen');
        $watched->applyStatusKey('watched');
        $watched->save();
        $this->make('video', $this->owner, 'Fresh');
        $token = $this->link(['video' => ['scope' => 'status', 'statuses' => ['watched']]]);
        $this->assertSame([$watched->id], array_column($this->anonymous("/api/public/shares/{$token}/video")->json('data'), 'id'));

        // ⚠️ სტატუსის უქონელი დომენი — ნებისმიერი გასაღები უცნობია
        foreach (['song', 'board_game'] as $domain) {
            $this->actingAs($this->owner)
                ->postJson('/api/share-links', ['domains' => [$domain => ['scope' => 'status', 'statuses' => ['done']]]])
                ->assertStatus(422)
                ->assertJsonPath('message', 'invalid_status');
        }

        // enum-ის უცნობი გასაღები
        $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => ['book' => ['scope' => 'status', 'statuses' => ['watched']]]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'invalid_status');
    }

    public function test_favorite_ids_and_public_only_scopes(): void
    {
        $fav = $this->make('book', $this->owner, 'Fav', ['is_favorite' => true, 'visibility' => 'public']);
        $plain = $this->make('book', $this->owner, 'Plain');

        $favorite = $this->link(['book' => ['scope' => 'favorite']]);
        $this->assertSame([$fav->id], array_column($this->anonymous("/api/public/shares/{$favorite}/book")->json('data'), 'id'));

        $picked = $this->link(['book' => ['scope' => 'ids', 'ids' => [$plain->id]]]);
        $this->assertSame([$plain->id], array_column($this->anonymous("/api/public/shares/{$picked}/book")->json('data'), 'id'));

        $public = $this->link(['book' => ['scope' => 'all', 'public_only' => true]]);
        $this->assertSame([$fav->id], array_column($this->anonymous("/api/public/shares/{$public}/book")->json('data'), 'id'));
    }

    public function test_search_looks_in_each_domains_own_columns(): void
    {
        $this->make('song', $this->owner, 'Yesterday', ['artist' => 'The Beatles']);
        $this->make('song', $this->owner, 'Smells Like Teen Spirit', ['artist' => 'Nirvana']);
        $this->make('place', $this->owner, 'ნარიყალა', ['city' => 'თბილისი']);

        $songs = $this->link(['song' => ['scope' => 'all'], 'place' => ['scope' => 'all']]);

        $this->assertSame(['Yesterday'], array_column($this->anonymous("/api/public/shares/{$songs}/song?q=beatles")->json('data'), 'title_en'));
        $this->assertSame(['ნარიყალა'], array_column($this->anonymous("/api/public/shares/{$songs}/place?q=".rawurlencode('ნარი'))->json('data'), 'title_en'));
    }

    public function test_the_personal_rating_switch_hides_the_owners_rating(): void
    {
        $this->make('book', $this->owner, 'Rated', ['rating' => 9]);

        $shown = $this->link(['book' => ['scope' => 'all']]);
        $hidden = $this->link(['book' => ['scope' => 'all']], ['show_rating' => false]);

        $this->assertSame(9, $this->anonymous("/api/public/shares/{$shown}/book")->json('data.0.rating'));
        $this->assertArrayNotHasKey('rating', $this->anonymous("/api/public/shares/{$hidden}/book")->json('data.0'));
    }

    public function test_a_classifier_hidden_on_public_is_neither_on_the_card_nor_in_the_facet(): void
    {
        $book = $this->make('book', $this->owner, 'Hidden genre');
        $this->classify('book', $book, $this->entry('book', $this->owner, 'Drama'));

        $this->actingAs($this->owner)->putJson('/api/modules/book/fields', ['fields' => [
            'genre' => ['public' => false],
        ]])->assertOk();

        $token = $this->link(['book' => ['scope' => 'all']]);
        $res = $this->anonymous("/api/public/shares/{$token}/book")->assertOk();

        $this->assertArrayNotHasKey('genres', $res->json('data.0'));
        $this->assertSame([], $res->json('genres'));
    }

    public function test_the_picker_lists_only_the_owners_records(): void
    {
        $mine = $this->make('course', $this->owner, 'Laravel');
        $this->make('course', $this->viewer, 'Not mine');

        $this->actingAs($this->owner)->getJson('/api/share-links/records?domain=course')
            ->assertOk()
            ->assertJsonPath('data', [['id' => $mine->id, 'title_ka' => null, 'title_en' => 'Laravel', 'year' => null]]);

        // მოდული, რომელიც მფლობელს არ აქვს
        $this->actingAs($this->owner)->getJson('/api/share-links/records?domain=movie')
            ->assertStatus(422)
            ->assertJsonPath('message', 'share_domain_unavailable');
    }

    /* ================= დამატება ================= */

    #[DataProvider('domains')]
    public function test_adding_copies_the_facts_and_none_of_the_personal_fields(string $domain): void
    {
        $personal = array_filter([
            'is_favorite' => true,
            'rating' => ShareDomain::hasPersonalRating($domain) ? 8 : null,
            'visibility' => 'public',
        ], fn ($v) => $v !== null);

        $record = $this->make($domain, $this->owner, 'Original', $personal);
        // ⚠️ სახელი, რომელიც არცერთი ლექსიკონის ნაგულისხმევში არ არის — თორემ მიმღების ნაგულისხმევს დაემთხვეოდა
        $this->classify($domain, $record, $this->entry($domain, $this->owner, 'Zeta', 'ზეტა', 'Clapperboard'));

        $token = $this->link([$domain => ['scope' => 'all']]);
        $this->add($token, $domain, $record->id)->assertOk()->assertJson(['result' => 'added']);

        $copy = $this->mine($domain);
        $title = ShareDomain::titleOf($domain, $copy);

        $this->assertSame('Original', $title['title_en'] ?? $title['title_ka']);
        $this->assertFalse((bool) $copy->is_favorite, 'რჩეული გამზიარებლისაა');
        $this->assertSame('private', $copy->visibility, 'ხილვადობა მიმღებისაა');

        if (ShareDomain::hasPersonalRating($domain)) {
            $this->assertNull($copy->rating, 'შეფასება გამზიარებლის აზრია');
        }

        if ($copy->getAttribute('url') !== null || in_array($domain, ['video', 'song', 'bookmark'], true)) {
            $this->assertSame($record->url, $copy->url);
        }

        // ⚠️ კლასიფიკატორი **სახელით** — მიმღების ლექსიკონში, არა გამზიარებლის id
        $entries = ShareDomain::classifierEntries($copy->fresh(), $domain);
        $this->assertCount(1, $entries);
        $this->assertSame($this->viewer->id, (int) $entries->first()->user_id);
        $this->assertSame('Zeta', $entries->first()->name_en);
        $this->assertSame('ზეტა', $entries->first()->name_ka);
        $this->assertSame('Clapperboard', $entries->first()->icon);
    }

    public function test_the_classifier_reuses_the_recipients_entry_of_the_same_name(): void
    {
        $mineDrama = $this->entry('book', $this->viewer, 'drama ', 'სხვა');
        $before = BookGenre::withoutGlobalScope('owner')->where('user_id', $this->viewer->id)->count();

        $book = $this->make('book', $this->owner, 'Book');
        $this->classify('book', $book, $this->entry('book', $this->owner, 'Drama', 'დრამა'));

        $token = $this->link(['book' => ['scope' => 'all']]);
        $this->add($token, 'book', $book->id)->assertOk();

        $this->assertSame($mineDrama->id, (int) $this->mine('book')->genre_id, 'იმავე სახელის ჟანრი ხელახლა შეიქმნა');
        $this->assertSame($before, BookGenre::withoutGlobalScope('owner')->where('user_id', $this->viewer->id)->count());
    }

    public function test_enum_status_travels_by_key_with_the_owners_completion_date(): void
    {
        $game = $this->make('game', $this->owner, 'Finished', ['status' => 'finished', 'finished_at' => '2025-03-04']);
        $place = $this->make('place', $this->owner, 'Visited', ['status' => 'visited', 'visited_at' => '2024-07-01']);
        $course = $this->make('course', $this->owner, 'Done', ['status' => 'done', 'started_at' => '2024-01-02', 'finished_at' => '2024-02-03']);

        $token = $this->link(['game' => ['scope' => 'all'], 'place' => ['scope' => 'all'], 'course' => ['scope' => 'all']]);

        $this->add($token, 'game', $game->id, 'owner')->assertOk();
        $this->add($token, 'place', $place->id, 'owner')->assertOk();
        $this->add($token, 'course', $course->id, 'owner')->assertOk();

        $this->assertSame(['finished', '2025-03-04'], [$this->mine('game')->status, $this->mine('game')->finished_at?->toDateString()]);
        $this->assertSame(['visited', '2024-07-01'], [$this->mine('place')->status, $this->mine('place')->visited_at?->toDateString()]);
        $this->assertSame(['done', '2024-01-02', '2024-02-03'], [
            $this->mine('course')->status,
            $this->mine('course')->started_at?->toDateString(),
            $this->mine('course')->finished_at?->toDateString(),
        ]);
    }

    public function test_the_default_mode_gives_the_column_default_and_no_date(): void
    {
        $game = $this->make('game', $this->owner, 'Finished', ['status' => 'finished', 'finished_at' => '2025-03-04']);
        $token = $this->link(['game' => ['scope' => 'all']]);

        $this->add($token, 'game', $game->id)->assertOk();

        $this->assertSame('to_play', $this->mine('game')->status);
        $this->assertNull($this->mine('game')->finished_at);
    }

    public function test_dictionary_status_travels_by_role_and_never_the_playback_time(): void
    {
        Status::ensureDefaults($this->owner->id, 'video');
        Status::ensureDefaults($this->viewer->id, 'video');
        // ⚠️ მიმღების „ნანახი" გადარქმეულია — როლით უნდა მოიძებნოს, არა გასაღებით/სახელით
        Status::withoutGlobalScope('owner')->where('user_id', $this->viewer->id)->where('module', 'video')
            ->where('role', 'done')->update(['key' => 'seen_it', 'name_en' => 'Seen it', 'name_ka' => 'ვნახე']);

        $video = $this->make('video', $this->owner, 'Clip', ['watched_at' => '2024-05-05 10:00:00', 'watch_count' => 7]);
        $video->applyStatusKey('watched');
        $video->save();

        $token = $this->link(['video' => ['scope' => 'all']]);
        $this->add($token, 'video', $video->id, 'owner')->assertOk();

        $copy = $this->mine('video');
        $this->assertSame('seen_it', $copy->status?->key);
        $this->assertNull($copy->watched_at, 'დაკვრის დრო გამზიარებლისაა');
        $this->assertSame(0, (int) $copy->watch_count);
    }

    public function test_songs_and_board_games_have_no_status_mode(): void
    {
        $song = $this->make('song', $this->owner, 'Song');
        $token = $this->link(['song' => ['scope' => 'all']]);

        $this->actingAs($this->viewer)->postJson("/api/shares/{$token}/plan", ['domain' => 'song'])
            ->assertOk()
            ->assertJsonPath('status_modes', []);

        $this->add($token, 'song', $song->id, 'owner')->assertOk()->assertJson(['result' => 'added']);
    }

    public function test_a_shared_source_cover_is_referenced_and_an_upload_is_copied_on_the_recipients_quota(): void
    {
        Storage::disk('public')->put('games/covers/rawg-42.jpg', 'RAWG');
        Storage::disk('public')->put('games/covers/mine.jpg', 'MINE');
        Storage::disk('public')->put('gallery/images/still.jpg', 'STILL');

        $rawg = $this->make('game', $this->owner, 'Rawg', ['cover_path' => 'games/covers/rawg-42.jpg', 'cover_source' => 'rawg', 'rawg_id' => 42]);
        $upload = $this->make('game', $this->owner, 'Upload', ['cover_path' => 'games/covers/mine.jpg', 'cover_source' => 'upload']);
        // ⚠️ „მთავრად დაყენებული" გალერეის ფოტო — წყარო RAWG-ია, ფაილი კი გამზიარებლის გალერეისაა
        $gallery = $this->make('game', $this->owner, 'Gallery', ['cover_path' => 'gallery/images/still.jpg', 'cover_source' => 'rawg']);

        $token = $this->link(['game' => ['scope' => 'all']]);
        $before = (int) $this->viewer->fresh()->storage_used_bytes;

        $this->add($token, 'game', $rawg->id)->assertOk();
        $copy = $this->mine('game');
        $this->assertSame(['games/covers/rawg-42.jpg', 'rawg'], [$copy->cover_path, $copy->cover_source]);
        $this->assertSame($before, (int) $this->viewer->fresh()->storage_used_bytes, 'საერთო ფაილი კვოტაში არ ითვლება');

        $this->add($token, 'game', $upload->id)->assertOk();
        $copy = $this->mine('game');
        $this->assertNotSame('games/covers/mine.jpg', $copy->cover_path);
        $this->assertStringStartsWith('games/covers/', (string) $copy->cover_path);
        $this->assertSame('upload', $copy->cover_source);
        $this->assertSame('MINE', Storage::disk('public')->get($copy->cover_path));
        $this->assertSame($before + 4, (int) $this->viewer->fresh()->storage_used_bytes);

        $this->add($token, 'game', $gallery->id)->assertOk();
        $copy = $this->mine('game');
        $this->assertNotSame('gallery/images/still.jpg', $copy->cover_path, 'გალერეის ფაილი საერთო არაა');
        $this->assertSame('STILL', Storage::disk('public')->get($copy->cover_path));
    }

    public function test_a_video_link_is_rebuilt_by_our_own_allowlist(): void
    {
        $video = $this->make('video', $this->owner, 'Clip');
        // ⚠️ ძველი/ხელით შეცვლილი რიგი — სხვის `embed_url`-ს არ ვენდობით
        $video->forceFill(['embed_url' => 'https://evil.example/embed'])->save();

        $token = $this->link(['video' => ['scope' => 'all']]);
        $this->add($token, 'video', $video->id)->assertOk();

        $copy = $this->mine('video');
        $this->assertSame(VideoUrl::parse($video->url)['embed_url'], $copy->embed_url);
        $this->assertSame('youtube', $copy->platform);
    }

    /* ================= „უკვე გაქვს" ================= */

    public function test_already_have_follows_each_domains_identity_steps(): void
    {
        $cases = [
            // ISBN — Open Library-ის კოდის გარეშე
            ['book', ['isbn' => '9780000000001'], ['isbn' => '9780000000001', 'title_en' => 'Different']],
            // ქართული წიგნი — მხოლოდ სათაური + წელი
            ['book', ['title_ka' => 'ჯაყოს ხიზნები', 'year' => 1925], ['title_ka' => 'ჯაყოს  ხიზნები', 'year' => 1925, 'title_en' => null]],
            // თამაში — RAWG-ის კოდით
            ['game', ['rawg_id' => 7], ['rawg_id' => 7, 'title_en' => 'Other']],
            // ადგილი — სახელი + ქალაქი
            ['place', ['name' => 'ნარიყალა', 'city' => 'თბილისი'], ['name' => 'ნარიყალა', 'city' => 'თბილისი']],
            // ბუკმარკი — ბმული
            ['bookmark', ['url' => 'https://example.com/a'], ['url' => 'https://example.com/a', 'title' => 'Renamed']],
            // კურსი ბმულის გარეშე — სათაურით
            ['course', ['title' => 'Laravel'], ['title' => 'laravel']],
        ];

        foreach ($cases as $i => [$domain, $theirs, $mine]) {
            $record = $this->make($domain, $this->owner, 'Case '.$i, $theirs);
            $this->make($domain, $this->viewer, 'Mine '.$i, $mine);

            $token = $this->link([$domain => ['scope' => 'ids', 'ids' => [$record->id]]]);
            $state = $this->actingAs($this->viewer)->postJson("/api/shares/{$token}/plan", ['domain' => $domain])->json('items.0.state');

            $this->assertSame('have', $state, "შემთხვევა {$i} ({$domain})");
        }
    }

    public function test_a_same_title_with_a_different_link_is_not_the_same_video(): void
    {
        $video = $this->make('video', $this->owner, 'Same title');
        $this->make('video', $this->viewer, 'Same title', ['url' => 'https://vimeo.com/123']);

        $token = $this->link(['video' => ['scope' => 'all']]);
        $plan = $this->actingAs($this->viewer)->postJson("/api/shares/{$token}/plan", ['domain' => 'video'])->assertOk();

        $this->assertSame('new', collect($plan->json('items'))->firstWhere('id', $video->id)['state']);
    }

    public function test_a_trashed_copy_answers_409_with_its_id(): void
    {
        $game = $this->make('game', $this->owner, 'Game', ['rawg_id' => 9]);
        $binned = $this->make('game', $this->viewer, 'Game', ['rawg_id' => 9]);
        $this->actingAs($this->viewer);
        $binned->moveToTrash();

        $token = $this->link(['game' => ['scope' => 'all']]);

        $this->add($token, 'game', $game->id)
            ->assertStatus(409)
            ->assertJson(['message' => 'record_in_trash', 'domain' => 'game', 'id' => $binned->id]);
    }

    public function test_adding_counts_the_import_and_logs_the_source(): void
    {
        $bookmark = $this->make('bookmark', $this->owner, 'Docs');
        $token = $this->link(['bookmark' => ['scope' => 'all']]);

        $this->add($token, 'bookmark', $bookmark->id)->assertOk();

        $this->assertSame(1, (int) DB::table('share_links')->value('imports'));
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'import',
            'subject_type' => 'bookmark',
            'subject_label' => 'Docs',
        ]);
    }
}
