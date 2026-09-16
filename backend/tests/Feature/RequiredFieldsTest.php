<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * ⚠️ **სტატუსი და „ტიპი" ყველა მოდულში სავალდებულოა** (მომხმარებლის გადაწყვეტილება).
 *
 * „ტიპს" ყოველ მოდულში სხვა სახელი ჰქვია — `type_id` (ვიდეო), `category_id`
 * (ჩანაწერი/ბუკმარკი), `genre_id` (წიგნი/სამაგიდო) და **pivot** `genre_ids` /
 * `genres` (თამაში, სიმღერა, ფილმი/სერიალი/ანიმე). ამ ტესტის აზრი ერთია: არცერთი
 * მოდული არ უნდა გამორჩეს, რადგან გამორჩენა **ჩუმია** — ჩანაწერი უბრალოდ
 * უსტატუსოდ შეინახება და „ორივემ ნახა", მასობრივი წაშლა და ფრანჩაიზის ბეჯი
 * მასზე დუმილით შეწყვეტს მუშაობას (იხ. `PublicDomain::isDone()`).
 */
class RequiredFieldsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'req',
            'username' => 'req',
            'email' => 'req@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::pluck('id')->all());
        $this->user = $this->user->refresh();
    }

    /** @return array<string, array{0: string, 1: array<string, mixed>, 2: array<int, string>}> */
    public static function modules(): array
    {
        return [
            'movie' => ['/api/movies', ['title_en' => 'X'], ['status', 'genres']],
            'series' => ['/api/series', ['title_en' => 'X'], ['status', 'genres']],
            'anime' => ['/api/anime', ['title_en' => 'X'], ['status', 'genres']],
            'video' => ['/api/videos', ['title' => 'X', 'url' => 'https://youtu.be/abc123'], ['status', 'type_id']],
            'song' => ['/api/songs', ['title' => 'X', 'url' => 'https://youtu.be/abc123', 'autofill' => 0], ['genre_ids']],
            'book' => ['/api/books', ['title_en' => 'X'], ['status', 'genre_id']],
            'board_game' => ['/api/board-games', ['title' => 'X'], ['status', 'genre_id']],
            'game' => ['/api/games', ['title_en' => 'X'], ['status', 'genre_ids']],
            'note' => ['/api/notes', ['title' => 'X'], ['status', 'category_id']],
            'bookmark' => ['/api/bookmarks', ['title' => 'X', 'url' => 'https://a.com', 'autofill' => 0], ['status', 'category_id']],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, string>  $expected
     */
    #[DataProvider('modules')]
    public function test_a_record_cannot_be_created_without_a_status_and_a_type(
        string $endpoint,
        array $payload,
        array $expected,
    ): void {
        $this->actingAs($this->user)
            ->postJson($endpoint, $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors($expected);
    }

    /**
     * ⚠️ რედაქტირებისას **ცარიელის გაგზავნაც** აკრძალულია, თორემ წესი მხოლოდ
     * შექმნაზე იმუშავებდა და არსებულ ჩანაწერს სტატუსი ერთი `PATCH`-ით მოეხსნებოდა.
     */
    public function test_an_existing_record_cannot_have_its_status_cleared(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson('/api/movies', ['title_en' => 'X', 'status' => 'undecided', 'genres' => ['Action']])
            ->assertStatus(201)
            ->json('data.id');

        $this->actingAs($this->user)
            ->patchJson("/api/movies/{$id}", ['status' => null])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status']);

        $this->actingAs($this->user)
            ->patchJson("/api/movies/{$id}", ['genres' => []])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['genres']);
    }

    /**
     * …მაგრამ ველის **საერთოდ არგაგზავნა** კანონიერია: ნაწილობრივი `PATCH`
     * ძველ მნიშვნელობას ტოვებს (ის უკვე შევსებულია, შექმნისას სავალდებულო იყო).
     */
    public function test_a_partial_update_without_the_field_is_allowed(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson('/api/movies', ['title_en' => 'X', 'status' => 'undecided', 'genres' => ['Action']])
            ->assertStatus(201)
            ->json('data.id');

        $this->actingAs($this->user)
            // ⚠️ სათაური აქაც იგზავნება — ფილმის ვალიდაცია ყოველ მოთხოვნაზე ერთ ენას ითხოვს
            ->patchJson("/api/movies/{$id}", ['title_en' => 'X', 'year' => 2001])
            ->assertOk()
            ->assertJsonPath('data.status.key', 'undecided');
    }
}
