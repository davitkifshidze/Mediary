<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\ApprovalRequest;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Genres\GenreRemover;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ჟანრის წაშლა სამივე TMDB-დომენს ხედავს** (Tasks BUG-19).
 *
 * ⚠️ `anime` §7.1-ის შემდეგ მესამე დომენია და `Genre::animes()` არსებობს,
 * მაგრამ `GenreRemover` მხოლოდ `movies`/`series`-ს ითვლიდა. შედეგი ორმხრივი
 * იყო და **ორივე ჩუმი**: მხოლოდ ანიმეზე გამოყენებული ჟანრი „უხმარად"
 * ითვლებოდა და დადასტურების გარეშე იშლებოდა, `reassign_to`-ზე კი ანიმეს
 * მიბმა `genreables`-ის კასკადით ქრებოდა და სამიზნეზე არ გადადიოდა.
 */
class GenreRemovalTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->admin = User::create([
            'name' => 'root',
            'username' => 'root',
            'email' => 'root@example.com',
            'password' => 'password',
        ]);
        $this->admin->assignRole('super_admin')->save();
        $this->admin->modules()->sync(Module::pluck('id')->all());
        $this->admin->refresh();
    }

    private function genre(string $slug): Genre
    {
        $genre = Genre::create(['slug' => $slug]);
        $genre->setTranslation('en', ucfirst($slug));

        return $genre->refresh();
    }

    private function anime(Genre $genre): Anime
    {
        $anime = Anime::create(['user_id' => $this->admin->id]);
        $anime->genres()->attach($genre->id);

        return $anime;
    }

    public function test_a_genre_used_only_by_anime_is_in_use(): void
    {
        $genre = $this->genre('mecha');
        $this->anime($genre);

        $result = app(GenreRemover::class)->remove($genre);

        $this->assertFalse($result['ok']);
        $this->assertSame('genre_in_use', $result['reason']);
        $this->assertSame(1, $result['animes_count']);
        $this->assertDatabaseHas('genres', ['id' => $genre->id]);
    }

    public function test_reassigning_moves_the_anime_links(): void
    {
        $from = $this->genre('mecha');
        $to = $this->genre('scifi');
        $anime = $this->anime($from);

        $result = app(GenreRemover::class)->remove($from, $to->id);

        $this->assertTrue($result['ok']);
        $this->assertTrue($anime->fresh()->genres->contains('id', $to->id));
        $this->assertDatabaseMissing('genres', ['id' => $from->id]);
    }

    /** ⚠️ ფილმიც უნდა გადავიდეს — ციკლმა ძველი ქცევა არ უნდა დაარღვიოს */
    public function test_reassigning_still_moves_movies(): void
    {
        $from = $this->genre('drama');
        $to = $this->genre('tragedy');
        $movie = Movie::create(['user_id' => $this->admin->id]);
        $movie->genres()->attach($from->id);

        $this->assertTrue(app(GenreRemover::class)->remove($from, $to->id)['ok']);
        $this->assertTrue($movie->fresh()->genres->contains('id', $to->id));
    }

    /** პასუხი სამივე რიცხვს ატარებს — ადმინი „0 ჩანაწერს" ვერ უნდა ხედავდეს */
    public function test_the_endpoint_reports_the_anime_count(): void
    {
        $genre = $this->genre('isekai');
        $this->anime($genre);

        $this->actingAs($this->admin)
            ->deleteJson("/api/genres/{$genre->id}")
            ->assertStatus(409)
            ->assertJson([
                'message' => 'genre_in_use',
                'movies_count' => 0,
                'series_count' => 0,
                'animes_count' => 1,
            ]);
    }

    /** არაადმინის მოთხოვნის payload-შიც — `/requests`-ზე ეს რიცხვი იხატება */
    public function test_the_approval_payload_carries_the_anime_count(): void
    {
        $user = User::create([
            'name' => 'kate',
            'username' => 'kate',
            'email' => 'kate@example.com',
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->all());
        $user->refresh();

        $genre = $this->genre('shonen');
        $anime = Anime::create(['user_id' => $user->id]);
        $anime->genres()->attach($genre->id);

        $this->actingAs($user)
            ->deleteJson("/api/genres/{$genre->id}")
            ->assertStatus(202);

        $payload = ApprovalRequest::first()->payload;
        $this->assertSame(1, $payload['animes_count']);
    }
}
