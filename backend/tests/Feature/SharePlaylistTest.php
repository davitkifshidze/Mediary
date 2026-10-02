<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Playlist;
use App\Models\Song;
use App\Models\SongGenre;
use App\Models\User;
use App\Support\ShareDomain;
use App\Support\VideoUrl;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * **გაზიარების ბმული — პლეილისტები (Tasks §40.13, Q53 — „გ").**
 *
 * ⚠️ ნახვა **შესულ უცხოზეც** მოწმდება (§1.2/§33.3-ის გაკვეთილი): `Song`-ის
 * `owner` scope სიმღერების რიცხვს მის საკუთარზე ჭრიდა და ბარათი „0
 * სიმღერას" წერდა, ანონიმს კი — სწორ რიცხვს.
 */
class SharePlaylistTest extends TestCase
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
    }

    /** @param  list<string>  $modules */
    private function makeUser(string $name, array $modules = ['song']): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        // ⚠️ `refresh()` — კვოტა ბაზის ნაგულისხმევიდან მოდის (413-ის ხაფანგი)
        return $user->refresh();
    }

    /** @param  array<string, mixed>  $attrs */
    private function song(User $user, string $title, array $attrs = []): Song
    {
        $url = (string) ($attrs['url'] ?? 'https://www.youtube.com/watch?v='.substr(md5($title), 0, 11));
        $parsed = VideoUrl::parse($url);

        $song = new Song;
        $song->forceFill([
            'user_id' => $user->id,
            'title' => $title,
            'url' => $url,
            'platform' => $parsed['platform'],
            'external_id' => $parsed['external_id'],
            'embed_url' => $parsed['embed_url'],
            ...$attrs,
        ])->save();

        return $song->refresh();
    }

    /**
     * @param  list<Song>  $songs
     * @param  array<string, mixed>  $attrs
     */
    private function playlist(User $user, string $name, array $songs, array $attrs = []): Playlist
    {
        $playlist = new Playlist;
        $playlist->forceFill(['user_id' => $user->id, 'name' => $name, 'sort_order' => 1, ...$attrs])->save();

        foreach (array_values($songs) as $i => $song) {
            DB::table('playlist_song')->insert([
                'playlist_id' => $playlist->id,
                'song_id' => $song->id,
                'sort_order' => $i + 1,
            ]);
        }

        return $playlist->refresh();
    }

    private function link(array $domains): string
    {
        $url = $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => $domains])
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

    private function add(string $token, int $id, ?User $as = null): TestResponse
    {
        return $this->actingAs($as ?? $this->viewer)->postJson("/api/shares/{$token}/item", [
            'domain' => 'playlist', 'id' => $id, 'status_mode' => 'default',
        ]);
    }

    /** @return list<string> მიმღების პლეილისტის სიმღერების სათაურები, რიგით */
    private function titlesOf(Playlist $playlist): array
    {
        return DB::table('playlist_song')
            ->join('songs', 'songs.id', '=', 'playlist_song.song_id')
            ->where('playlist_song.playlist_id', $playlist->id)
            ->orderBy('playlist_song.sort_order')
            ->pluck('songs.title')
            ->all();
    }

    private function copyOf(Playlist $source): Playlist
    {
        return Playlist::withoutGlobalScopes()
            ->where('user_id', $this->viewer->id)
            ->where('copied_from_id', $source->id)
            ->firstOrFail();
    }

    /* ================= რეესტრი ================= */

    public function test_a_playlist_section_offers_only_all_and_specific(): void
    {
        $this->assertSame(['all', 'ids'], ShareDomain::modes('playlist'));
        $this->assertSame('song', ShareDomain::module('playlist'));
        $this->assertContains('playlist', ShareDomain::availableFor($this->owner));

        // სიმღერების მოდულის გარეშე — პლეილისტიც არ ზიარდება
        $this->assertNotContains('playlist', ShareDomain::availableFor($this->makeUser('nomusic', ['movie'])));
    }

    /* ================= ნახვა ================= */

    public function test_cards_carry_the_owners_song_count_for_both_strangers(): void
    {
        $a = $this->song($this->owner, 'A', ['visibility' => 'public']);
        $b = $this->song($this->owner, 'B');
        $foreign = $this->song($this->viewer, 'Foreign');
        $list = $this->playlist($this->owner, 'Road trip', [$a, $b]);

        // ⚠️ pivot-ში ხელით ჩაწერილი სხვისი სიმღერა არც ჩანს და არც ითვლება
        DB::table('playlist_song')->insert(['playlist_id' => $list->id, 'song_id' => $foreign->id, 'sort_order' => 9]);

        $token = $this->link(['playlist' => ['scope' => 'all']]);

        $this->anonymous("/api/public/shares/{$token}")
            ->assertOk()
            ->assertJsonPath('sections.0.domain', 'playlist')
            ->assertJsonPath('sections.0.count', 1)
            ->assertJsonPath('modules.song.icon', Module::where('key', 'song')->value('icon'));

        foreach (['anonymous', 'stranger'] as $who) {
            $res = $who === 'anonymous'
                ? $this->anonymous("/api/public/shares/{$token}/playlist")
                : $this->actingAs($this->viewer)->getJson("/api/public/shares/{$token}/playlist");

            $res->assertOk()
                ->assertJsonPath('data.0.title_en', 'Road trip')
                ->assertJsonPath('data.0.songs_count', 2)
                ->assertJsonPath('genres', []);

            $this->assertArrayNotHasKey('genres', $res->json('data.0'), "{$who}: პლეილისტს კლასიფიკატორი არ აქვს");
        }
    }

    public function test_the_playlist_lists_every_song_in_order_and_nothing_outside_the_link(): void
    {
        $a = $this->song($this->owner, 'A', ['year' => 2001]);
        $b = $this->song($this->owner, 'B');
        $foreign = $this->song($this->viewer, 'Foreign');
        $inLink = $this->playlist($this->owner, 'In', [$b, $a]);
        $outside = $this->playlist($this->owner, 'Out', [$a]);
        DB::table('playlist_song')->insert(['playlist_id' => $inLink->id, 'song_id' => $foreign->id, 'sort_order' => 9]);

        // მიმღებს „A" უკვე აქვს — იგივე ბმულით
        $mine = $this->song($this->viewer, 'My A', ['url' => $a->url]);

        $token = $this->link(['playlist' => ['scope' => 'ids', 'ids' => [$inLink->id]]]);

        $anon = $this->anonymous("/api/public/shares/{$token}/playlists/{$inLink->id}")->assertOk();
        // ⚠️ პირადი სიმღერაც ჩანს (ბმული თანხმობაა), სხვისი — არა
        $this->assertSame(['B', 'A'], array_column($anon->json('data'), 'title_en'));
        $anon->assertJsonPath('playlist.title_en', 'In')
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.1.year', 2001);
        $this->assertArrayNotHasKey('in_library', $anon->json('data.0'), 'ანონიმს „უკვე გაქვს" არ ეწერება');

        $this->actingAs($this->viewer)
            ->getJson("/api/public/shares/{$token}/playlists/{$inLink->id}")
            ->assertOk()
            ->assertJsonPath('data.0.in_library', null)
            ->assertJsonPath('data.1.in_library.id', $mine->id);

        // ბმულის გარეთ მყოფი პლეილისტი არ არსებობს
        $this->anonymous("/api/public/shares/{$token}/playlists/{$outside->id}")
            ->assertNotFound()
            ->assertJsonPath('message', 'share_record_not_found');
    }

    public function test_the_owners_hidden_song_fields_stay_hidden_inside(): void
    {
        $song = $this->song($this->owner, 'A', ['year' => 1999]);
        $list = $this->playlist($this->owner, 'Mix', [$song]);

        $this->actingAs($this->owner)
            ->putJson('/api/modules/song/fields', ['fields' => ['year' => ['public' => false]]])
            ->assertOk();

        $token = $this->link(['playlist' => ['scope' => 'all']]);

        $card = $this->anonymous("/api/public/shares/{$token}/playlists/{$list->id}")->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('year', $card);
    }

    /* ================= ფარგლები ================= */

    public function test_favorite_genre_and_status_do_not_exist_on_playlists(): void
    {
        foreach ([
            ['scope' => 'favorite'],
            ['scope' => 'genre', 'categories' => [1]],
            ['scope' => 'status', 'statuses' => ['done']],
        ] as $spec) {
            $this->actingAs($this->owner)
                ->postJson('/api/share-links', ['domains' => ['playlist' => $spec]])
                ->assertStatus(422)
                ->assertJsonPath('message', 'share_scope_unsupported')
                ->assertJsonPath('domain', 'playlist');
        }
    }

    public function test_specific_and_public_only_scopes(): void
    {
        $mine = $this->playlist($this->owner, 'Mine', []);
        $public = $this->playlist($this->owner, 'Shown', [], ['visibility' => 'public']);
        $theirs = $this->playlist($this->viewer, 'Theirs', []);

        // სხვისი id ჩუმად ვარდება; მხოლოდ სხვისი — „არაფერია" და არა „ყველა"
        $token = $this->link(['playlist' => ['scope' => 'ids', 'ids' => [$mine->id, $theirs->id]]]);
        $this->assertSame([$mine->id], array_column($this->anonymous("/api/public/shares/{$token}/playlist")->json('data'), 'id'));

        $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => ['playlist' => ['scope' => 'ids', 'ids' => [$theirs->id]]]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'share_scope_incomplete');

        $token = $this->link(['playlist' => ['scope' => 'all', 'public_only' => true]]);
        $this->assertSame([$public->id], array_column($this->anonymous("/api/public/shares/{$token}/playlist")->json('data'), 'id'));

        // შექმნის ფანჯრის რიცხვი — პირადი პლეილისტიც ითვლება
        $this->actingAs($this->owner)
            ->getJson('/api/share-links/preview?'.http_build_query(['domains' => ['playlist' => ['scope' => 'all', 'public_only' => 0]]]))
            ->assertOk()
            ->assertJsonPath('domains.playlist.total', 2)
            ->assertJsonPath('domains.playlist.private', 1);

        // „კონკრეტული" პიქერი იგივე endpoint-ითაა
        $this->actingAs($this->owner)
            ->getJson('/api/share-links/records?domain=playlist')
            ->assertOk()
            ->assertJsonPath('data.0.title_en', 'Shown');
    }

    public function test_an_owner_without_the_song_module_cannot_share_playlists(): void
    {
        $owner = $this->makeUser('moviefan', ['movie']);

        $this->actingAs($owner)
            ->postJson('/api/share-links', ['domains' => ['playlist' => ['scope' => 'all']]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'share_domain_unavailable');
    }

    /* ================= დამატება ================= */

    public function test_adding_copies_the_playlist_with_its_songs_in_order(): void
    {
        $a = $this->song($this->owner, 'A', ['artist' => 'Nino']);
        $b = $this->song($this->owner, 'B');
        $c = $this->song($this->owner, 'C');

        $rock = new SongGenre;
        $rock->forceFill(['user_id' => $this->owner->id, 'key' => 'rock-x', 'name_ka' => 'როკი', 'name_en' => 'Rock', 'sort_order' => 1])->save();
        DB::table('song_genre_song')->insert(['song_id' => $b->id, 'song_genre_id' => $rock->id]);

        $source = $this->playlist($this->owner, 'Road trip', [$c, $a, $b]);

        // მიმღებს „A" უკვე აქვს — ხელახლა არ დაემატება, პლეილისტში კი ჩაჯდება
        $existing = $this->song($this->viewer, 'My A', ['url' => $a->url]);

        $token = $this->link(['playlist' => ['scope' => 'all']]);

        $this->actingAs($this->viewer)
            ->postJson("/api/shares/{$token}/plan", ['domain' => 'playlist'])
            ->assertOk()
            ->assertJsonPath('items.0.state', 'new')
            ->assertJsonPath('items.0.title_en', 'Road trip')
            ->assertJsonPath('status_modes', []);

        $this->add($token, $source->id)
            ->assertOk()
            ->assertJsonPath('result', 'added')
            ->assertJsonPath('songs_added', 2);

        $copy = $this->copyOf($source);
        $this->assertSame('Road trip', $copy->name);
        $this->assertSame(['C', 'My A', 'B'], $this->titlesOf($copy));
        $this->assertSame(3, Song::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
        $this->assertContains((int) $existing->id, DB::table('playlist_song')->where('playlist_id', $copy->id)->pluck('song_id')->map(fn ($id) => (int) $id)->all());

        // ჟანრი სახელით — მიმღების ლექსიკონში
        $copiedB = Song::withoutGlobalScopes()->where('user_id', $this->viewer->id)->where('title', 'B')->firstOrFail();
        $this->assertSame(['Rock'], $copiedB->genres()->withoutGlobalScope('owner')->pluck('name_en')->all());

        // ჟურნალი — წყარო და ახალი სიმღერების რიცხვი
        $log = AuditLog::where('action', AuditLog::ACTION_IMPORT)->latest('id')->first();
        $this->assertSame('playlist', $log->subject_type);
        $this->assertSame('share', $log->new_values['source']);
        $this->assertSame(2, $log->new_values['songs_added']);
        $this->assertSame(1, (int) DB::table('share_links')->value('imports'));

        // განმეორებით — „უკვე გაქვს", ახალი პლეილისტი არ იქმნება
        $this->actingAs($this->viewer)
            ->postJson("/api/shares/{$token}/plan", ['domain' => 'playlist'])
            ->assertJsonPath('items.0.state', 'have')
            ->assertJsonPath('items.0.mine_id', $copy->id);
        $this->add($token, $source->id)->assertOk()->assertJsonPath('result', 'have');
        $this->assertSame(1, Playlist::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
    }

    public function test_a_copy_in_the_trash_is_offered_for_restore(): void
    {
        $source = $this->playlist($this->owner, 'Mix', [$this->song($this->owner, 'A')]);
        $token = $this->link(['playlist' => ['scope' => 'all']]);

        $this->add($token, $source->id)->assertOk();
        $copy = $this->copyOf($source);
        $copy->moveToTrash();

        $this->actingAs($this->viewer)
            ->postJson("/api/shares/{$token}/plan", ['domain' => 'playlist'])
            ->assertJsonPath('items.0.state', 'trash');

        $this->add($token, $source->id)
            ->assertStatus(409)
            ->assertJsonPath('message', 'record_in_trash')
            ->assertJsonPath('domain', 'playlist')
            ->assertJsonPath('id', $copy->id);
    }

    public function test_the_copy_takes_a_free_name(): void
    {
        $road = $this->playlist($this->owner, 'Road trip', []);
        $duo = $this->playlist($this->owner, 'Duo', []);
        // ⚠️ MySQL-ის კოლაცია რეგისტრს არ არჩევს — „road trip" იგივე სახელია
        $this->playlist($this->viewer, 'road trip', []);
        // ორივე დაკავებულია (ერთი ურნაშიც — სახელს მაინც იკავებს) — მრიცხველი
        $this->playlist($this->viewer, 'Duo', []);
        $this->playlist($this->viewer, 'duo (@OWNER)', [])->moveToTrash();

        $token = $this->link(['playlist' => ['scope' => 'all']]);

        $this->add($token, $road->id)->assertOk();
        $this->assertSame('Road trip (@owner)', $this->copyOf($road)->name);

        $this->add($token, $duo->id)->assertOk();
        $this->assertSame('Duo (@owner) 2', $this->copyOf($duo)->name);
    }

    public function test_a_song_the_owner_saved_twice_lands_once(): void
    {
        $a = $this->song($this->owner, 'A');
        $twin = $this->song($this->owner, 'A again', ['url' => $a->url]);
        $source = $this->playlist($this->owner, 'Mix', [$a, $twin]);

        $token = $this->link(['playlist' => ['scope' => 'all']]);
        $this->add($token, $source->id)->assertOk()->assertJsonPath('songs_added', 1);

        $this->assertSame(['A'], $this->titlesOf($this->copyOf($source)));
        $this->assertSame(1, Song::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
    }

    public function test_a_song_in_my_trash_is_reused_not_duplicated(): void
    {
        $a = $this->song($this->owner, 'A');
        $b = $this->song($this->owner, 'B');
        $source = $this->playlist($this->owner, 'Mix', [$a, $b]);

        $trashed = $this->song($this->viewer, 'Old A', ['url' => $a->url]);
        $trashed->moveToTrash();

        $token = $this->link(['playlist' => ['scope' => 'all']]);
        $this->add($token, $source->id)->assertOk()->assertJsonPath('songs_added', 1);

        // ⚠️ ურნაში მყოფი ერთვება — აღდგენისას პლეილისტში დაბრუნდება
        $ids = DB::table('playlist_song')->where('playlist_id', $this->copyOf($source)->id)->orderBy('sort_order')->pluck('song_id')->map(fn ($id) => (int) $id)->all();
        $this->assertSame((int) $trashed->id, $ids[0]);
        $this->assertSame(2, Song::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
    }

    public function test_adding_needs_the_song_module(): void
    {
        $source = $this->playlist($this->owner, 'Mix', []);
        $token = $this->link(['playlist' => ['scope' => 'all']]);

        $this->add($token, $source->id, $this->makeUser('nomusic', ['movie']))
            ->assertForbidden()
            ->assertJsonPath('message', 'module_disabled');
    }
}
