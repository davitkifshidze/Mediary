<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Support\ExportDomain;
use App\Support\PublicDomain;
use App\Support\Rating;
use App\Support\ShareDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **„ჩემი ქულა" — ვარსკვლავები, მეათედები, „4.6 / 10"** (Tasks §9).
 *
 * ⚠️ რა მოწმდება: წილადი ქულა ისე ინახება და ბრუნდება, როგორც აკრიფე
 * (sqlite-ზეც — integer-აფინური სვეტი REAL-ს ინახავს); მთელი ქულა JSON-ში
 * `int`-ია და არა `7.0`; 10 ჭერია; ცარიელი და 0 ქულის წაშლაა; ფილმზე
 * `my_rating` TMDB-ის `rating`-ისგან ცალკეა (Q1) და ექსპორტშიც, საჯარო
 * ბარათშიც და გაზიარების გადამრთველშიც სწორედ ის იგულისხმება.
 */
class RatingTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'rita',
            'username' => 'rita',
            'email' => 'rita@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['book', 'movie'])->pluck('id')->all());
        $this->user->refresh();
    }

    private function bookPayload(array $extra = []): array
    {
        return [
            'title_en' => 'Dune',
            'status' => 'to_read',
            'genre_id' => $this->actingAs($this->user)->getJson('/api/book-genres')->json('data.0.id'),
            ...$extra,
        ];
    }

    public function test_a_fractional_rating_is_stored_and_returned_as_typed(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson('/api/books', $this->bookPayload(['rating' => 4.6]))
            ->assertStatus(201)
            ->assertJsonPath('data.rating', 4.6)
            ->json('data.id');

        // ბაზაშიც მეათედით — sqlite-ის integer-აფინური სვეტი REAL-ს ინახავს
        $this->assertEquals(4.6, (float) DB::table('books')->where('id', $id)->value('rating'));
        $this->assertSame(4.6, Book::findOrFail($id)->rating);
    }

    public function test_a_whole_rating_is_an_integer_in_json(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/books', $this->bookPayload(['rating' => 7]))
            ->assertStatus(201)
            ->assertJsonPath('data.rating', 7);

        // "7.0" სტრიქონადაც მთელ რიცხვად ბრუნდება
        $this->actingAs($this->user)
            ->postJson('/api/books', $this->bookPayload(['rating' => '7.0']))
            ->assertStatus(201)
            ->assertJsonPath('data.rating', 7);
    }

    public function test_ten_is_the_ceiling_and_more_precision_is_rounded_to_tenths(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/books', $this->bookPayload(['rating' => 10]))
            ->assertStatus(201)
            ->assertJsonPath('data.rating', 10);

        $this->actingAs($this->user)
            ->postJson('/api/books', $this->bookPayload(['rating' => 10.1]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rating']);

        $this->actingAs($this->user)
            ->postJson('/api/books', $this->bookPayload(['rating' => 4.66]))
            ->assertStatus(201)
            ->assertJsonPath('data.rating', 4.7);
    }

    /** ცარიელი სტრიქონი და 0 — ქულის წაშლაა (`ImportSource::rating()`-ის იგივე წესი) */
    public function test_empty_and_zero_clear_the_rating(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson('/api/books', $this->bookPayload(['rating' => 8.5]))
            ->json('data.id');

        $this->actingAs($this->user)
            ->putJson("/api/books/{$id}", $this->bookPayload(['rating' => '']))
            ->assertOk()
            ->assertJsonPath('data.rating', null);

        $this->actingAs($this->user)
            ->putJson("/api/books/{$id}", $this->bookPayload(['rating' => 0]))
            ->assertOk()
            ->assertJsonPath('data.rating', null);

        $this->assertNull(Book::findOrFail($id)->rating);
    }

    /** Q1 — ფილმზე ორი სვეტია: `rating` TMDB-ის საშუალო, `my_rating` ჩემი */
    public function test_a_movie_keeps_tmdb_average_apart_from_my_rating(): void
    {
        $res = $this->actingAs($this->user)->postJson('/api/movies', [
            'title_en' => 'Alien',
            'year' => 1979,
            'rating' => 8.5,
            'my_rating' => 4.6,
            'status' => 'undecided',
            'genres' => ['Horror'],
        ])->assertStatus(201);

        $res->assertJsonPath('data.rating', '8.5')
            ->assertJsonPath('data.my_rating', 4.6);

        $id = $res->json('data.id');

        // სია იმავე ორ ველს აბრუნებს
        $row = collect($this->actingAs($this->user)->getJson('/api/movies')->json('data'))->firstWhere('id', $id);
        $this->assertSame('8.5', $row['rating']);
        $this->assertSame(4.6, $row['my_rating']);

        // ჩემი ქულის წაშლა TMDB-ის საშუალოს არ ეხება
        $this->actingAs($this->user)
            ->putJson("/api/movies/{$id}", ['title_en' => 'Alien', 'my_rating' => '', 'status' => 'undecided', 'genres' => ['Horror']])
            ->assertOk()
            ->assertJsonPath('data.my_rating', null)
            ->assertJsonPath('data.rating', '8.5');

        $this->actingAs($this->user)
            ->postJson('/api/movies', ['title_en' => 'Bad', 'my_rating' => 11, 'status' => 'undecided', 'genres' => ['Horror']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['my_rating']);
    }

    public function test_the_personal_column_is_known_per_domain(): void
    {
        $this->assertSame('my_rating', Rating::column('movie'));
        $this->assertSame('my_rating', Rating::column('series'));
        $this->assertSame('my_rating', Rating::column('anime'));
        $this->assertSame('rating', Rating::column('book'));
        $this->assertSame('rating', Rating::column('place'));

        foreach (['movie', 'series', 'anime'] as $domain) {
            $this->assertContains('my_rating', ExportDomain::fields($domain), "{$domain} ექსპორტში `my_rating` არ არის");
            $this->assertTrue(ShareDomain::hasPersonalRating($domain));
            $this->assertSame('my_rating', ShareDomain::personalRatingKey($domain));
        }
    }

    /** საჯარო ბარათი ორივე ქულას ატარებს და კატალოგის `rating` ველის დამალვა ორივეს მალავს */
    public function test_the_public_card_carries_both_ratings_and_hides_them_together(): void
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'rating' => 8.5, 'my_rating' => 4.6]);
        $movie->setTranslation('en', ['title' => 'Alien']);
        $movie = $movie->refresh();

        $card = PublicDomain::card('movie', $movie, []);
        $this->assertSame('8.5', $card['rating']);
        $this->assertSame(4.6, $card['my_rating']);

        $hidden = PublicDomain::card('movie', $movie, ['rating']);
        $this->assertArrayNotHasKey('rating', $hidden);
        $this->assertArrayNotHasKey('my_rating', $hidden);
    }
}
