<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\Series;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ჩემი ქულა პირდაპირ სიიდან — ერთი წესი ფილმზე, სერიალსა და ანიმეზე.**
 *
 * ⚠️ ყველა ტესტი სამივე მოდულზე გადის: ჩაწერა ერთ ადგილას წერია
 * (`MediaRatingController::rate`), მარშრუტი კი სამია.
 */
class MediaRatingTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('nino');
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());

        return $user->refresh();
    }

    /** @return array<string, array{class-string<Model>, string, string}> */
    public static function modules(): array
    {
        return [
            'movie' => [Movie::class, '/api/movies', 'movie'],
            'series' => [Series::class, '/api/series', 'series'],
            'anime' => [Anime::class, '/api/anime', 'anime'],
        ];
    }

    /** @param  class-string<Model>  $model */
    private function record(string $model, User $owner, array $attributes = []): Model
    {
        $record = $model::create(['user_id' => $owner->id, 'year' => 2010, ...$attributes]);
        $record->setTranslation('en', ['title' => 'Arrival']);

        return $record;
    }

    #[DataProvider('modules')]
    public function test_a_rating_is_saved_from_the_list_and_comes_back_in_the_record(string $model, string $uri): void
    {
        // TMDB-ის საშუალო ცალკე სვეტია და ხელუხლებელი რჩება
        $record = $this->record($model, $this->user, ['rating' => 7.9]);

        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => 8])
            ->assertOk()
            ->assertJsonPath('data.id', $record->id)
            ->assertJsonPath('data.my_rating', 8)
            ->assertJsonPath('data.title_en', 'Arrival');

        // წილადი მეათედამდე მრგვალდება, 10 ჭერია
        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => '7.46'])
            ->assertOk()
            ->assertJsonPath('data.my_rating', 7.5);

        $this->assertSame(7.5, $record->refresh()->my_rating);
        $this->assertEquals(7.9, (float) $record->rating);

        // სიაშიც იგივე ქულაა
        $this->actingAs($this->user)->getJson($uri)->assertOk()->assertJsonPath('data.0.my_rating', 7.5);
    }

    #[DataProvider('modules')]
    public function test_null_and_zero_clear_the_rating_but_a_missing_key_is_refused(string $model, string $uri): void
    {
        $record = $this->record($model, $this->user, ['my_rating' => 6]);

        // გასაღების გარეშე მოთხოვნა ქულას ჩუმად არ შლის
        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", [])->assertStatus(422);
        $this->assertSame(6.0, (float) $record->refresh()->my_rating);

        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => null])
            ->assertOk()
            ->assertJsonPath('data.my_rating', null);
        $this->assertNull($record->refresh()->my_rating);

        $record->update(['my_rating' => 6]);
        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => 0])
            ->assertOk()
            ->assertJsonPath('data.my_rating', null);
    }

    #[DataProvider('modules')]
    public function test_a_rating_outside_the_scale_is_refused(string $model, string $uri): void
    {
        $record = $this->record($model, $this->user, ['my_rating' => 6]);

        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => 11])->assertStatus(422);
        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => -1])->assertStatus(422);
        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => 'ბევრი'])->assertStatus(422);

        $this->assertSame(6.0, (float) $record->refresh()->my_rating);
    }

    #[DataProvider('modules')]
    public function test_another_accounts_record_is_not_found(string $model, string $uri): void
    {
        $record = $this->record($model, $this->makeUser('dato'), ['my_rating' => 6]);

        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => 9])->assertNotFound();

        $this->assertSame(6.0, (float) $model::withoutGlobalScopes()->findOrFail($record->id)->my_rating);
    }

    /** ქულის ჩაწერა რედაქტირებაა: მხოლოდ-ნახვის როლი ვერ ცვლის */
    #[DataProvider('modules')]
    public function test_a_view_only_role_cannot_rate(string $model, string $uri, string $module): void
    {
        Role::create(['key' => 'viewer', 'name_ka' => 'მნახველი', 'name_en' => 'Viewer', 'permissions' => [$module => ['view']]]);
        $this->user->assignRole('viewer')->save();
        $record = $this->record($model, $this->user->refresh(), ['my_rating' => 6]);

        $this->actingAs($this->user)->patchJson("{$uri}/{$record->id}/rating", ['my_rating' => 9])->assertForbidden();

        $this->assertSame(6.0, (float) $record->refresh()->my_rating);
    }
}
