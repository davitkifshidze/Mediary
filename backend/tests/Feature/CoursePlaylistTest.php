<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\User;
use App\Models\UserCredential;
use App\Services\Links\LinkResolver;
use App\Services\Video\YtDlp;
use App\Support\CredentialProviders;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **კურსის YouTube-ის ფლეილისტი.**
 *
 * ⚠️ `Http::fake()` **ერთი სტაბია** (CLAUDE.md: მეორე გამოძახება არაფერს ცვლის) —
 * ერთი closure პასუხობს `playlists`/`playlistItems`/`videos`/oEmbed-ს მისამართით.
 * ⚠️ `yt-dlp` ტესტებში არ არსებობს (`YTDLP_BINARY`); გასაღების გარეშე ყალბი
 * `YtDlp` ჩაისმება კონტეინერში.
 */
class CoursePlaylistTest extends TestCase
{
    use RefreshDatabase;

    private const LIST = 'PLillGF-RfqbbiTGgA77tGO426V3hRF9iE';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->actingAs($this->user);

        Http::fake(function (Request $request) {
            $url = $request->url();

            return match (true) {
                str_contains($url, '/youtube/v3/playlists') => Http::response(['items' => [['snippet' => [
                    'title' => 'Laravel from scratch',
                    'description' => 'Thirty lessons.',
                    'channelTitle' => 'Laracasts',
                    'thumbnails' => ['high' => ['url' => 'https://i.ytimg.com/vi/aaaaaaaaaa1/hqdefault.jpg']],
                ]]]]),
                // ორი გვერდი: პირველზე — ორი ვიდეო და დახურული, მეორეზე — ერთი
                str_contains($url, '/youtube/v3/playlistItems') && str_contains($url, 'pageToken=next') => Http::response([
                    'items' => [$this->item('aaaaaaaaaa3', 'Three')],
                ]),
                str_contains($url, '/youtube/v3/playlistItems') => Http::response([
                    'items' => [
                        $this->item('aaaaaaaaaa1', 'One'),
                        ['snippet' => ['title' => 'Private video'], 'contentDetails' => ['videoId' => 'aaaaaaaaaa9']],
                        $this->item('aaaaaaaaaa2', 'Two'),
                    ],
                    'nextPageToken' => 'next',
                ]),
                str_contains($url, '/youtube/v3/videos') => Http::response(['items' => [
                    ['id' => 'aaaaaaaaaa1', 'contentDetails' => ['duration' => 'PT10M']],
                    ['id' => 'aaaaaaaaaa2', 'contentDetails' => ['duration' => 'PT1H2M3S']],
                    ['id' => 'aaaaaaaaaa3', 'contentDetails' => ['duration' => 'PT45S']],
                ]]),
                default => Http::response('', 404),
            };
        });
    }

    private function item(string $id, string $title): array
    {
        return [
            'snippet' => ['title' => $title],
            'contentDetails' => ['videoId' => $id, 'videoPublishedAt' => '2024-05-01T10:00:00Z'],
        ];
    }

    private function course(string $url): Course
    {
        CourseCategory::ensureDefaults($this->user->id);
        $course = Course::create([
            'user_id' => $this->user->id,
            'title' => 'Laravel',
            'status' => 'taking',
            'category_id' => CourseCategory::where('user_id', $this->user->id)->value('id'),
        ]);
        $course->applyUrl($url);
        $course->save();

        return $course;
    }

    private function giveKey(): void
    {
        UserCredential::create(['user_id' => $this->user->id, 'provider' => CredentialProviders::YOUTUBE, 'credentials' => ['key' => 'yt-key']]);
    }

    private function fakeYtDlp(?array $answer): void
    {
        $this->app->instance(YtDlp::class, new class($answer) extends YtDlp
        {
            public function __construct(private ?array $answer) {}

            public function available(): bool
            {
                return true;
            }

            public function playlist(string $url): ?array
            {
                return $this->answer;
            }
        });
    }

    /** გასაღებით: Data API, ორი გვერდი, ხანგრძლივობა, დახურული ვიდეო გამოტოვდება, ქეში */
    public function test_with_a_key_the_data_api_lists_every_video_with_its_duration(): void
    {
        $this->giveKey();
        $course = $this->course('https://www.youtube.com/playlist?list='.self::LIST);

        $list = $this->getJson("/api/courses/{$course->id}/playlist")->assertOk()->json('playlist');

        $this->assertSame(self::LIST, $list['id']);
        $this->assertSame('Laravel from scratch', $list['title']);
        $this->assertSame('Laracasts', $list['channel']);
        $this->assertSame('youtube_api', $list['source']);
        $this->assertSame(3, $list['count']);
        $this->assertSame(['One', 'Two', 'Three'], array_column($list['items'], 'title'));
        $this->assertSame([1, 2, 3], array_column($list['items'], 'position'));
        $this->assertSame([600, 3723, 45], array_column($list['items'], 'duration'));
        $this->assertSame(600 + 3723 + 45, $list['total_duration']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/aaaaaaaaaa2', $list['items'][1]['embed_url']);
        $this->assertSame('https://i.ytimg.com/vi/aaaaaaaaaa2/mqdefault.jpg', $list['items'][1]['thumbnail']);
        $this->assertSame('2024-05-01', $list['items'][0]['published_at']);

        // ⚠️ გასაღები ჰედერშია და არა მისამართში
        Http::assertSent(fn (Request $r) => $r->hasHeader('X-goog-api-key', 'yt-key') && ! str_contains($r->url(), 'yt-key'));

        // 24 სთ ქეში — მეორე გახსნა წყაროს აღარ მიმართავს; „განახლება" — მიმართავს
        $sent = count(Http::recorded());
        $this->getJson("/api/courses/{$course->id}/playlist")->assertOk();
        $this->assertCount($sent, Http::recorded());
        $this->getJson("/api/courses/{$course->id}/playlist?refresh=1")->assertOk();
        $this->assertGreaterThan($sent, count(Http::recorded()));
    }

    /** გასაღების გარეშე: `yt-dlp --flat-playlist` (ყალბი) */
    public function test_without_a_key_yt_dlp_answers(): void
    {
        $this->fakeYtDlp([
            'title' => 'From yt-dlp',
            'description' => null,
            'channel' => 'Somebody',
            'thumbnail' => null,
            'entries' => [
                ['id' => 'bbbbbbbbbb1', 'title' => 'First', 'duration' => 100],
                ['id' => 'bbbbbbbbbb2', 'title' => '[Deleted video]', 'duration' => null],
                ['id' => 'bbbbbbbbbb3', 'title' => 'Second', 'duration' => null],
            ],
        ]);
        $course = $this->course('https://www.youtube.com/watch?v=bbbbbbbbbb1&list='.self::LIST);

        $list = $this->getJson("/api/courses/{$course->id}/playlist")->assertOk()->json('playlist');

        $this->assertSame('ytdlp', $list['source']);
        $this->assertSame(['First', 'Second'], array_column($list['items'], 'title'));
        $this->assertSame(100, $list['total_duration']);
        // სიის ესკიზი არ მოვიდა — პირველი ვიდეოსი
        $this->assertSame('https://i.ytimg.com/vi/bbbbbbbbbb1/hqdefault.jpg', $list['thumbnail']);
        Http::assertNothingSent();
    }

    public function test_states_without_a_playlist_a_source_or_an_answer(): void
    {
        // ფლეილისტი არ არის — `null`, შეცდომა არა
        $plain = $this->course('https://www.udemy.com/course/laravel/');
        $this->getJson("/api/courses/{$plain->id}/playlist")->assertOk()->assertJsonPath('playlist', null);

        // არც გასაღები, არც yt-dlp — „ჩაწერე გასაღები"
        $course = $this->course('https://www.youtube.com/playlist?list='.self::LIST);
        $this->getJson("/api/courses/{$course->id}/playlist")
            ->assertStatus(409)
            ->assertJsonPath('message', 'credential_missing')
            ->assertJsonPath('provider', CredentialProviders::YOUTUBE);

        // წყარომ ვერ უპასუხა — 503
        $this->fakeYtDlp(null);
        $this->getJson("/api/courses/{$course->id}/playlist")->assertStatus(503)->assertJsonPath('message', 'youtube_unavailable');
    }

    public function test_another_accounts_course_is_a_404(): void
    {
        $course = $this->course('https://www.youtube.com/playlist?list='.self::LIST);

        $this->actingAs(User::factory()->create()->assignRole('super_admin'));
        $this->getJson("/api/courses/{$course->id}/playlist")->assertNotFound();
    }

    /** ფორმის probe და შენახვის ავტოშევსება: სათაური, აღწერა, ფოტო ფლეილისტიდან */
    public function test_the_form_probe_and_autofill_read_the_playlist(): void
    {
        $this->giveKey();

        $meta = app(LinkResolver::class)->resolve('https://www.youtube.com/playlist?list='.self::LIST);
        $this->assertSame('playlist', $meta['kind']);
        $this->assertSame('Laravel from scratch', $meta['title']);
        $this->assertSame('Thirty lessons.', $meta['description']);
        $this->assertSame('https://i.ytimg.com/vi/aaaaaaaaaa1/hqdefault.jpg', $meta['image_url']);
        $this->assertSame('Laracasts', $meta['author']);

        // შენახვისას ცარიელი ველები (აღწერა, ფოტო) ფლეილისტიდან ივსება; შენი სათაური რჩება
        CourseCategory::ensureDefaults($this->user->id);
        $created = $this->postJson('/api/courses', [
            'title' => 'Mine',
            'url' => 'https://www.youtube.com/playlist?list='.self::LIST,
            'status' => 'to_take',
            'category_id' => CourseCategory::where('user_id', $this->user->id)->value('id'),
        ])->assertStatus(201);

        $created->assertJsonPath('data.title', 'Mine');
        $this->assertSame('Thirty lessons.', Course::findOrFail($created->json('data.id'))->description);
        $this->assertSame('https://i.ytimg.com/vi/aaaaaaaaaa1/hqdefault.jpg', Course::findOrFail($created->json('data.id'))->image_url);
    }
}
