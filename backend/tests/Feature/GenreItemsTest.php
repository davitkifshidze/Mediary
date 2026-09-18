<?php

namespace Tests\Feature;

use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **`GET|POST /genres/{genre}/items`** (Tasks DEBT-14).
 *
 * ⚠️ ეს endpoint **ჟანრის ბარათიდან ცვლის ჩანაწერების მიბმებს** — ე.ი.
 * ერთი მოთხოვნით მთელი ბიბლიოთეკის გადაწერა შეუძლია (`all=1` + `replace`),
 * და აუდიტამდე მას არცერთი ტესტი არ ეხებოდა.
 *
 * ⚠️ ოთხი მოქმედება ოთხ სხვადასხვა რამეს ნიშნავს და სწორედ მათი აღრევაა
 * საშიში: `move` ჩანაწერის **დანარჩენ** ჟანრებს ტოვებს, `replace` კი ყველას
 * ცვლის — ეს კონტროლერშიც ცხადად წერია.
 */
class GenreItemsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Genre $action;

    private Genre $drama;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'gia',
            'username' => 'gia',
            'email' => 'gia@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());
        $this->user->refresh();

        $this->action = Genre::firstOrCreate(['slug' => 'action']);
        $this->action->setTranslation('en', 'Action');
        $this->drama = Genre::firstOrCreate(['slug' => 'drama']);
        $this->drama->setTranslation('en', 'Drama');
    }

    private function movie(string $title, array $genres = []): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => 2020]);
        $movie->setTranslation('en', ['title' => $title]);

        if ($genres) {
            $movie->genres()->sync($genres);
        }

        return $movie->refresh();
    }

    public function test_the_list_returns_the_records_of_this_genre_only(): void
    {
        $mine = $this->movie('Action one', [$this->action->id]);
        $this->movie('Drama one', [$this->drama->id]);

        $this->actingAs($this->user)->getJson("/api/genres/{$this->action->id}/items")
            ->assertOk()
            ->assertJsonPath('movies_count', 1)
            ->assertJsonPath('movies.0.id', $mine->id)
            // სამივე დომენი ერთ პასუხშია — ცარიელიც ცხადად ჩანს
            ->assertJsonPath('series_count', 0)
            ->assertJsonPath('animes_count', 0);
    }

    public function test_attach_and_detach_change_only_the_named_records(): void
    {
        $one = $this->movie('One');
        $two = $this->movie('Two');

        $this->actingAs($this->user)
            ->postJson("/api/genres/{$this->action->id}/items", [
                'type' => 'movie',
                'action' => 'attach',
                'ids' => [$one->id],
            ])
            ->assertOk()
            ->assertJsonPath('affected', 1);

        $this->assertTrue($one->fresh()->genres->contains($this->action->id));
        $this->assertFalse($two->fresh()->genres->contains($this->action->id));

        $this->actingAs($this->user)
            ->postJson("/api/genres/{$this->action->id}/items", [
                'type' => 'movie',
                'action' => 'detach',
                'ids' => [$one->id],
            ])
            ->assertOk();

        $this->assertFalse($one->fresh()->genres->contains($this->action->id));
    }

    /**
     * ⚠️ **`move` და `replace` სხვადასხვა რამეა** და ეს განსხვავება
     * კონტროლერის ერთადერთი ნამდვილი გადაწყვეტილებაა: პირველი ჩანაწერის
     * დანარჩენ ჟანრებს **ტოვებს**, მეორე — ყველას ცვლის.
     */
    public function test_move_keeps_the_other_genres_and_replace_does_not(): void
    {
        $moved = $this->movie('Moved', [$this->action->id, $this->drama->id]);
        $replaced = $this->movie('Replaced', [$this->action->id, $this->drama->id]);

        $this->actingAs($this->user)
            ->postJson("/api/genres/{$this->action->id}/items", [
                'type' => 'movie',
                'action' => 'move',
                'ids' => [$moved->id],
                'target_genre_id' => $this->drama->id,
            ])
            ->assertOk();

        $slugs = $moved->fresh()->genres->pluck('slug')->all();
        $this->assertSame(['drama'], $slugs);

        $third = Genre::firstOrCreate(['slug' => 'comedy']);

        $this->actingAs($this->user)
            ->postJson("/api/genres/{$this->action->id}/items", [
                'type' => 'movie',
                'action' => 'replace',
                'ids' => [$replaced->id],
                'target_genre_id' => $third->id,
            ])
            ->assertOk();

        // ⚠️ `drama`-ც წაიშალა — `replace` ყველა ჟანრს ცვლის
        $this->assertSame(['comedy'], $replaced->fresh()->genres->pluck('slug')->all());
    }

    /** ⚠️ `move`/`replace` სამიზნე ჟანრის გარეშე **მანქანური კოდია** */
    public function test_move_without_a_valid_target_is_a_422(): void
    {
        $movie = $this->movie('One', [$this->action->id]);

        $this->actingAs($this->user)
            ->postJson("/api/genres/{$this->action->id}/items", [
                'type' => 'movie',
                'action' => 'move',
                'ids' => [$movie->id],
            ])
            ->assertStatus(422)
            ->assertJson(['message' => 'invalid_target_genre']);

        // საკუთარ თავზე გადატანაც უარყოფილია
        $this->actingAs($this->user)
            ->postJson("/api/genres/{$this->action->id}/items", [
                'type' => 'movie',
                'action' => 'move',
                'ids' => [$movie->id],
                'target_genre_id' => $this->action->id,
            ])
            ->assertStatus(422)
            ->assertJson(['message' => 'invalid_target_genre']);

        $this->assertTrue($movie->fresh()->genres->contains($this->action->id));
    }

    /**
     * ⚠️ **სხვისი ჩანაწერი აქ არ ჩანს და არც იცვლება**: `all=1` ჟანრის
     * ყველა ჩანაწერს ეხება, ე.ი. `owner` სქოუპის გარეშე ერთი დაჭერა სხვისი
     * ბიბლიოთეკის ჟანრებს გადაწერდა.
     */
    public function test_another_users_records_are_untouched(): void
    {
        $other = User::create([
            'name' => 'nino',
            'username' => 'nino',
            'email' => 'nino@example.com',
            'password' => 'password',
        ]);

        $theirs = Movie::create(['user_id' => $other->id, 'year' => 2020]);
        $theirs->genres()->sync([$this->action->id]);

        $mine = $this->movie('Mine', [$this->action->id]);

        $this->actingAs($this->user)->getJson("/api/genres/{$this->action->id}/items")
            ->assertOk()
            ->assertJsonPath('movies_count', 1)
            ->assertJsonPath('movies.0.id', $mine->id);

        $this->actingAs($this->user)
            ->postJson("/api/genres/{$this->action->id}/items", [
                'type' => 'movie',
                'action' => 'detach',
                'all' => true,
            ])
            ->assertOk();

        $this->assertTrue($theirs->fresh()->genres->contains($this->action->id));
        $this->assertFalse($mine->fresh()->genres->contains($this->action->id));
    }
}
