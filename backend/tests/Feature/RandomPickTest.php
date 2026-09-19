<?php

namespace Tests\Feature;

use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
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
                ->assertJsonPath('data.title_en', 'Unseen');
        }
    }

    /** ცხადად არჩეული სექცია ნაგულისხმევზე მაღლა დგას */
    public function test_an_explicit_status_beats_the_default(): void
    {
        $this->movie('Unseen', 'to_watch');
        $this->movie('Seen', 'watched');

        $this->getJson('/api/movies?pick=random&status=watched')
            ->assertOk()
            ->assertJsonPath('data.title_en', 'Seen');
    }

    /** ფილტრი ისევე მოქმედებს, როგორც სიაზე */
    public function test_the_filters_apply(): void
    {
        $this->movie('Old', 'to_watch', ['year' => 1990]);
        $this->movie('New', 'to_watch', ['year' => 2024]);

        $this->getJson('/api/movies?pick=random&year_min=2000')
            ->assertOk()
            ->assertJsonPath('data.title_en', 'New');
    }

    /** ⚠️ ცარიელი შედეგი `null`-ია და არა 404 — მდგომარეობაა და არა შეცდომა */
    public function test_an_empty_scope_answers_null(): void
    {
        $this->movie('Seen', 'watched');

        $this->getJson('/api/movies?pick=random')
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    /** არჩევანი მართლა შემთხვევითია და არა „პირველი" */
    public function test_the_choice_really_varies(): void
    {
        foreach (range(1, 8) as $i) {
            $this->movie("Film {$i}", 'to_watch');
        }

        $seen = [];

        for ($i = 0; $i < 25; $i++) {
            $seen[] = $this->getJson('/api/movies?pick=random')->json('data.title_en');
        }

        $this->assertGreaterThan(1, count(array_unique($seen)));
    }

    /** სამივე მედია-დომენს აქვს */
    public function test_series_and_anime_answer_too(): void
    {
        Status::ensureDefaults($this->user->id, 'series');
        Status::ensureDefaults($this->user->id, 'anime');

        $this->getJson('/api/series?pick=random')->assertOk()->assertJsonPath('data', null);
        $this->getJson('/api/anime?pick=random')->assertOk()->assertJsonPath('data', null);
    }
}
