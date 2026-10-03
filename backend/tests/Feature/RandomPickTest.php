<?php

namespace Tests\Feature;

use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use App\Models\Video;
use Database\Seeders\GenresSeeder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **„რა ვნახო დღეს" — `?pick=random` (FEAT-20).**
 */
class RandomPickTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->seed(GenresSeeder::class);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->actingAs($this->user);

        Status::ensureDefaults($this->user->id, 'movie');
    }

    private function movie(string $title, string $status, array $extra = []): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, ...$extra]);
        $movie->applyStatusKey($status);
        $movie->save();
        $movie->setTranslation('en', ['title' => $title]);

        return $movie;
    }

    /**
     * **ნაგულისხმევად მხოლოდ `todo` როლი.**
     *
     * ⚠️ როლი და არა გასაღები (§6.4): სტატუსი per-user ლექსიკონია, ე.ი.
     * ტესტი სახელს გადაარქმევს და მაინც უნდა მუშაობდეს.
     */
    public function test_by_default_only_what_has_not_been_started(): void
    {
        $this->movie('Unseen', 'to_watch');
        $this->movie('Seen', 'watched');

        Status::where('user_id', $this->user->id)->where('key', 'to_watch')
            ->update(['name_ka' => 'სხვა სახელი', 'name_en' => 'Renamed']);

        for ($i = 0; $i < 12; $i++) {
            $this->getJson('/api/movies?pick=random')
                ->assertOk()
                ->assertJsonPath('data.0.title_en', 'Unseen');
        }
    }

    /** ცხადად არჩეული სექცია ნაგულისხმევზე მაღლა დგას */
    public function test_an_explicit_status_beats_the_default(): void
    {
        $this->movie('Unseen', 'to_watch');
        $this->movie('Seen', 'watched');

        $this->getJson('/api/movies?pick=random&status=watched')
            ->assertOk()
            ->assertJsonPath('data.0.title_en', 'Seen');
    }

    /** ფილტრი ისევე მოქმედებს, როგორც სიაზე */
    public function test_the_filters_apply(): void
    {
        $this->movie('Old', 'to_watch', ['year' => 1990]);
        $this->movie('New', 'to_watch', ['year' => 2024]);

        $this->getJson('/api/movies?pick=random&year_min=2000')
            ->assertOk()
            ->assertJsonPath('data.0.title_en', 'New');
    }

    /** ⚠️ ცარიელი შედეგი ცარიელი სიაა და არა 404 — მდგომარეობაა და არა შეცდომა (§17.5: `data: []`) */
    public function test_an_empty_scope_answers_an_empty_list(): void
    {
        $this->movie('Seen', 'watched');

        $this->getJson('/api/movies?pick=random')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /** არჩევანი მართლა შემთხვევითია და არა „პირველი" */
    public function test_the_choice_really_varies(): void
    {
        foreach (range(1, 8) as $i) {
            $this->movie("Film {$i}", 'to_watch');
        }

        $seen = [];

        for ($i = 0; $i < 25; $i++) {
            $seen[] = $this->getJson('/api/movies?pick=random')->json('data.0.title_en');
        }

        $this->assertGreaterThan(1, count(array_unique($seen)));
    }

    /**
     * Tasks §6.5 — **„სხვა" უკვე ნაჩვენებს არ იმეორებს**: `exclude[]` სიიდან
     * გამორიცხავს; როცა ყველა ამოიწურა — `null`.
     */
    public function test_excluded_records_are_never_picked(): void
    {
        $a = $this->movie('A', 'to_watch');
        $b = $this->movie('B', 'to_watch');

        for ($i = 0; $i < 10; $i++) {
            $this->getJson('/api/movies?pick=random&exclude[]='.$a->id)
                ->assertOk()
                ->assertJsonPath('data.0.id', $b->id);
        }

        $this->getJson("/api/movies?pick=random&exclude[]={$a->id}&exclude[]={$b->id}")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /**
     * Tasks §17.5 — **`count` რამდენიმე ბარათს აბრუნებს** (1–5), განმეორების გარეშე;
     * ზღვარზე მეტი ჭერზე იჭრება, ნაკლული სია იმდენია, რამდენიც არის.
     */
    public function test_count_returns_a_batch_without_repeats(): void
    {
        foreach (range(1, 8) as $i) {
            $this->movie("Film {$i}", 'to_watch');
        }

        $ids = $this->getJson('/api/movies?pick=random&count=3')->assertOk()->assertJsonCount(3, 'data')->json('data.*.id');
        $this->assertCount(3, array_unique($ids));

        $this->getJson('/api/movies?pick=random&count=99')->assertOk()->assertJsonCount(5, 'data');
        $this->getJson('/api/movies?pick=random&count=0')->assertOk()->assertJsonCount(1, 'data');

        $this->movie('Only', 'watched');
        $this->getJson('/api/movies?pick=random&count=4&status=watched')->assertOk()->assertJsonCount(1, 'data');
    }

    /**
     * Tasks §17.5 — **რამდენიმე სტატუსი** `status[]` მასივით (დიალოგის ჩიპები);
     * მძიმით გამოყოფილი ფორმაც მუშაობს, ნაგულისხმევი `todo`-როლი კი იხსნება.
     */
    public function test_several_statuses_widen_the_scope(): void
    {
        $this->movie('Unseen', 'to_watch');
        $this->movie('Seen', 'watched');
        $this->movie('Now', 'watching');

        for ($i = 0; $i < 10; $i++) {
            $titles = $this->getJson('/api/movies?pick=random&count=5&status[]=watched&status[]=watching')
                ->assertOk()
                ->assertJsonCount(2, 'data')
                ->json('data.*.title_en');
            sort($titles);
            $this->assertSame(['Now', 'Seen'], $titles);
        }

        $this->getJson('/api/movies?pick=random&count=5&status=watched,watching')->assertOk()->assertJsonCount(2, 'data');
    }

    /** Tasks §17 (Q4) — **ვიდეოებზეც** იგივე `pick=random`, `count`, `exclude`, ნაგულისხმევი `todo` */
    public function test_videos_answer_too(): void
    {
        Status::ensureDefaults($this->user->id, 'video');
        $todo = Status::where('user_id', $this->user->id)->where('module', 'video')->where('role', 'todo')->firstOrFail();
        $done = Status::where('user_id', $this->user->id)->where('module', 'video')->where('role', 'done')->firstOrFail();

        $a = Video::create(['user_id' => $this->user->id, 'title' => 'Fresh', 'url' => 'https://example.com/a', 'platform' => 'other', 'status_id' => $todo->id]);
        $b = Video::create(['user_id' => $this->user->id, 'title' => 'Also fresh', 'url' => 'https://example.com/b', 'platform' => 'other', 'status_id' => $todo->id]);
        Video::create(['user_id' => $this->user->id, 'title' => 'Watched', 'url' => 'https://example.com/c', 'platform' => 'other', 'status_id' => $done->id]);

        $ids = $this->getJson('/api/videos?pick=random&count=5')->assertOk()->assertJsonCount(2, 'data')->json('data.*.id');
        sort($ids);
        $this->assertSame([$a->id, $b->id], $ids);

        $this->getJson("/api/videos?pick=random&exclude[]={$a->id}")->assertOk()->assertJsonPath('data.0.id', $b->id);
        $this->getJson('/api/videos?pick=random&status='.$done->key)->assertOk()->assertJsonPath('data.0.title', 'Watched');
    }

    /** სამივე მედია-დომენს აქვს */
    public function test_series_and_anime_answer_too(): void
    {
        Status::ensureDefaults($this->user->id, 'series');
        Status::ensureDefaults($this->user->id, 'anime');

        $this->getJson('/api/series?pick=random')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/anime?pick=random')->assertOk()->assertJsonCount(0, 'data');
    }
}
