<?php

namespace Tests\Feature;

use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Series;
use App\Models\User;
use App\Services\Users\AccountEraser;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ფილმის, სერიალისა და ანიმეს ჩაკეტვა (Tasks §35.4–35.6, Q9).**
 *
 * დამალული (ჩაკეტილი და ამ სესიაში დაუხსნელი) ჩანაწერი სიაში, ძებნასა და
 * გალერეაში არ ჩანს, ფილტრში „ჩაკეტილები" — ბოქლომიანი ბარათია, გვერდი —
 * ბარათი, ყველა სხვა კარი 423. გახსნილი სესიაში ჩვეულებრივია; ჯამები, საჯარო,
 * გაზიარება და ექსპორტი კი **ყველა** ჩაკეტილს ტოვებს, სესიის მიუხედავად.
 */
class RecordLockTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create(['name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password']);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime', 'gallery'])->pluck('id')->all());
        $this->user->refresh();

        $this->actingAs($this->user);
    }

    /** stateful მოთხოვნა — ზუსტად ისეთი, როგორსაც SPA აგზავნის (სესიით) */
    private function spa()
    {
        return $this->actingAs($this->user)->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    private function movie(string $title, array $extra = []): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => 2020, 'poster_path' => 'movies/p.jpg', ...$extra]);
        $movie->setTranslation('en', ['title' => $title, 'description' => "About {$title}"]);

        return $movie;
    }

    /** ჩაკეტვა მოდელით — სესიაში არავინ გახსნა (ე.ი. „შემდეგი სესია") */
    private function lock(Movie|Series $record, string $password = 'secret1'): RecordLock
    {
        return RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $record->getMorphClass(),
            'lockable_id' => $record->getKey(),
            'password_hash' => Hash::make($password),
            'hint' => 'ზღვა',
        ]);
    }

    /** @return list<int> */
    private function listed(string $query = ''): array
    {
        return array_column($this->getJson('/api/movies'.$query)->assertOk()->json('data'), 'id');
    }

    public function test_a_hidden_movie_leaves_the_list_and_search_and_stays_a_padlock_card(): void
    {
        $open = $this->movie('Arrival');
        $hidden = $this->movie('Secret Diary');
        $this->lock($hidden);

        $this->assertSame([$open->id], $this->listed());
        $this->assertStringNotContainsString('Secret Diary', $this->getJson('/api/search?q=Secret')->getContent());

        // ფილტრი „ჩაკეტილები" — მხოლოდ ბოქლომიანი ბარათი: სათაური და ლოკი, შიგთავსი არა
        $card = $this->getJson('/api/movies?locked=1')->assertOk()->assertJsonCount(1, 'data')->json('data.0');
        $this->assertSame($hidden->id, $card['id']);
        $this->assertSame('Secret Diary', $card['title_en']);
        $this->assertTrue($card['hidden']);
        $this->assertTrue($card['locked']);
        $this->assertFalse($card['unlocked']);
        $this->assertSame('ზღვა', $card['lock_hint']);
        $this->assertArrayNotHasKey('poster', $card);
        $this->assertArrayNotHasKey('description_en', $card);

        // გვერდი — იგივე ბარათი
        $this->getJson("/api/movies/{$hidden->id}")
            ->assertOk()
            ->assertJsonPath('data.hidden', true)
            ->assertJsonMissingPath('data.poster');
    }

    /** ⚠️ დამალულზე ყველა სხვა კარი 423-ია — ჯერ გახსნა */
    public function test_every_other_door_of_a_hidden_movie_is_423(): void
    {
        $hidden = $this->movie('Secret Diary');
        $this->lock($hidden);

        $this->putJson("/api/movies/{$hidden->id}", ['title_en' => 'X'])->assertStatus(423)->assertJsonPath('message', 'record_locked');
        $this->deleteJson("/api/movies/{$hidden->id}")->assertStatus(423);
        $this->patchJson("/api/movies/{$hidden->id}/favorite", ['is_favorite' => true])->assertStatus(423);
        $this->getJson("/api/movies/{$hidden->id}/collection")->assertStatus(423);

        $this->assertNull(Movie::withoutGlobalScopes()->find($hidden->id)->trashed_at);
    }

    public function test_locking_unlocking_and_locking_again_in_one_session(): void
    {
        $movie = $this->movie('Secret Diary');

        // ჩაკეტვა — დამდებს სესიაში ღიად რჩება
        $this->spa()->putJson("/api/media/movie/{$movie->id}/lock", ['password' => 'secret1', 'hint' => 'ზღვა'])
            ->assertOk()
            ->assertJsonPath('data.locked', true)
            ->assertJsonPath('data.unlocked', true);
        $this->assertSame([$movie->id], $this->listed());

        // ისევ ჩაკეტვა — სიიდან ქრება
        $this->postJson("/api/media/movie/{$movie->id}/lock")->assertOk()->assertJsonPath('data.hidden', true);
        $this->assertSame([], $this->listed());

        $this->postJson("/api/media/movie/{$movie->id}/unlock", ['password' => 'wrong'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'record_password_wrong');

        $this->postJson("/api/media/movie/{$movie->id}/unlock", ['password' => 'secret1'])
            ->assertOk()
            ->assertJsonPath('data.unlocked', true)
            ->assertJsonPath('data.title_en', 'Secret Diary');

        // გახსნილი ჩვეულებრივია — სიაში, გვერდზე და რედაქტირებაში
        $this->assertSame([$movie->id], $this->listed());
        $this->getJson("/api/movies/{$movie->id}")->assertOk()->assertJsonPath('data.description_en', 'About Secret Diary');
        $this->patchJson("/api/movies/{$movie->id}/favorite", ['is_favorite' => true])->assertOk();
    }

    /** სხვისი ჩანაწერის ჩაკეტვა/გახსნა 404-ია — „ეს ჩანაწერი არსებობს" თვითონაც ინფორმაციაა */
    public function test_someone_elses_movie_is_a_404(): void
    {
        $movie = $this->movie('Secret Diary');

        $other = User::create(['name' => 'gio', 'username' => 'gio', 'email' => 'gio@example.com', 'password' => 'password']);
        $other->modules()->sync(Module::whereIn('key', ['movie'])->pluck('id')->all());

        $this->actingAs($other->refresh())->putJson("/api/media/movie/{$movie->id}/lock", ['password' => 'mine1'])->assertNotFound();
        $this->assertSame(0, RecordLock::withoutGlobalScopes()->count());
    }

    /** 10 არასწორი ცდა → 15 წუთი ბლოკი (ალბომის წესი) */
    public function test_wrong_passwords_block_the_movie(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);

        $movie = $this->movie('Secret Diary');
        $this->lock($movie);

        for ($i = 0; $i < RecordLock::MAX_UNLOCK_ATTEMPTS; $i++) {
            $this->spa()->postJson("/api/media/movie/{$movie->id}/unlock", ['password' => 'wrong'])->assertStatus(422);
        }

        $this->postJson("/api/media/movie/{$movie->id}/unlock", ['password' => 'secret1'])
            ->assertStatus(423)
            ->assertJsonPath('message', 'record_temporarily_locked');
    }

    /** ⚠️ ჯამი, ექსპორტი და „რა ვნახო დღეს" ჩაკეტილს არ ითვლის — გახსნილსაც */
    public function test_totals_export_and_random_pick_skip_every_locked_movie(): void
    {
        $this->movie('Arrival');
        $locked = $this->movie('Secret Diary');
        $this->lock($locked);

        // გახსნილიც კი — ჯამები სესიაზე არ „ხტება"
        $this->spa()->postJson("/api/media/movie/{$locked->id}/unlock", ['password' => 'secret1'])->assertOk();
        $this->assertContains($locked->id, $this->listed());

        $card = collect($this->getJson('/api/dashboard')->assertOk()->json('data'))->firstWhere('key', 'movie');
        $this->assertSame(1, $card['count']);

        $json = $this->get('/api/export/movie?format=json')->assertOk()->streamedContent();
        $this->assertStringContainsString('Arrival', $json);
        $this->assertStringNotContainsString('Secret Diary', $json);

        for ($i = 0; $i < 5; $i++) {
            $picked = array_column($this->getJson('/api/movies?pick=random&count=5')->assertOk()->json('data'), 'id');
            $this->assertNotContains($locked->id, $picked);
        }
    }

    /** საჯარო პროფილი ჩაკეტილს არასდროს აჩვენებს — მფლობელის სესიაში გახსნილსაც */
    public function test_a_locked_public_movie_is_never_public(): void
    {
        config(['mediary.public_profiles' => true]);
        $this->user->forceFill(['profile_visibility' => 'public'])->save();
        $this->user->modules()->syncWithoutDetaching([Module::where('key', 'movie')->value('id') => ['is_public' => true]]);

        $this->movie('Arrival', ['visibility' => 'public']);
        $locked = $this->movie('Secret Diary', ['visibility' => 'public']);
        $this->lock($locked);
        $this->spa()->postJson("/api/media/movie/{$locked->id}/unlock", ['password' => 'secret1'])->assertOk();

        $titles = array_column($this->getJson('/api/public/profiles/nino/movie')->assertOk()->json('data'), 'title_en');
        $this->assertSame(['Arrival'], $titles);
    }

    /** დამალული ჩანაწერის ფოტოები გალერეის სიაშიც არ ჩანს */
    public function test_photos_of_a_hidden_movie_leave_the_gallery(): void
    {
        $open = $this->movie('Arrival');
        $hidden = $this->movie('Secret Diary');
        $this->lock($hidden);

        $images = [];
        foreach ([$open, $hidden] as $movie) {
            $images[] = GalleryImage::create([
                'user_id' => $this->user->id, 'imageable_type' => 'movie', 'imageable_id' => $movie->id,
                'source' => 'tmdb', 'category' => 'backdrop', 'path' => "gallery/images/{$movie->id}.jpg", 'size' => 10,
            ])->id;
        }

        $this->assertSame([$images[0]], array_column($this->getJson('/api/gallery/photos')->assertOk()->json('data'), 'id'));
    }

    /**
     * ურნა: გახსნილი იშლება (ურნაში), დამალული ურნაში ბოქლომიანია, სამუდამოდ არ
     * იშლება (423), აღდგენა კი ჩაკეტილს აბრუნებს.
     */
    public function test_the_trash_keeps_a_hidden_movie_locked(): void
    {
        $movie = $this->movie('Secret Diary');
        $this->lock($movie);

        $this->spa()->postJson("/api/media/movie/{$movie->id}/unlock", ['password' => 'secret1'])->assertOk();
        $this->deleteJson("/api/movies/{$movie->id}")->assertSuccessful();

        // შემდეგი სესია — ჩანაწერი ისევ დამალულია
        $this->flushSession();

        $group = collect($this->getJson('/api/trash')->assertOk()->json('data'))->firstWhere('kind', 'movie');
        $item = collect($group['items'] ?? [])->firstWhere('id', $movie->id);
        $this->assertNotNull($item);
        $this->assertTrue($item['locked']);

        $this->deleteJson("/api/trash/movie/{$movie->id}")->assertStatus(423);
        $this->deleteJson('/api/trash', ['confirm' => 'DELETE'])->assertOk();
        $this->assertNotNull(Movie::withoutGlobalScopes()->find($movie->id));

        $this->postJson("/api/trash/movie/{$movie->id}/restore")->assertOk();
        $this->assertSame([], $this->listed());
        $this->assertSame([$movie->id], array_column($this->getJson('/api/movies?locked=1')->json('data'), 'id'));
    }

    /** ⚠️ ანგარიშის წაშლა ჩაკეტილსაც შლის — მოდელით, ფაილებიანად */
    public function test_erasing_the_account_removes_hidden_movies_with_their_files(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('movies/secret.jpg', 'x');

        $movie = $this->movie('Secret Diary', ['poster_path' => 'movies/secret.jpg', 'poster_source' => 'upload']);
        $this->lock($movie);

        app(AccountEraser::class)->erase($this->user);

        $this->assertNull(Movie::withoutGlobalScopes()->find($movie->id));
        $this->assertSame(0, RecordLock::withoutGlobalScopes()->count());
        Storage::disk('public')->assertMissing('movies/secret.jpg');
    }

    /** სერიალიც იგივე მექანიზმია — იგივე კარები `/media/series/{id}` */
    public function test_series_use_the_same_lock(): void
    {
        $series = Series::create(['user_id' => $this->user->id, 'year' => 2010]);
        $series->setTranslation('en', ['title' => 'Hidden Show']);
        $this->lock($series);

        $this->assertSame([], array_column($this->getJson('/api/series')->assertOk()->json('data'), 'id'));
        $this->getJson("/api/series/{$series->id}")->assertOk()->assertJsonPath('data.hidden', true);
        $this->spa()->postJson("/api/media/series/{$series->id}/unlock", ['password' => 'secret1'])->assertOk();
        $this->assertSame([$series->id], array_column($this->getJson('/api/series')->json('data'), 'id'));
    }
}
