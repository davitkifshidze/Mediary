<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Concerns\HasVisits;
use App\Models\Module;
use App\Models\Playlist;
use App\Models\RecordVisit;
use App\Models\Song;
use App\Models\User;
use App\Support\Visitable;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * **შესვლების მთვლელი და ჟურნალი** (Tasks §10, Q2).
 *
 * ⚠️ რა მოწმდება: შესვლა საათში ერთხელ ითვლება; სხვისი ჩანაწერი 404-ია;
 * გამორთული მოდული 403; ჟურნალი „ვინ · როდის · საიდან"-ს აბრუნებს; საჯარო
 * პროფილიდან ანონიმის შესვლა `source=public`-ით იწერება, მფლობელის
 * საკუთარი კი არა; ჩანაწერის საბოლოო წაშლა ჟურნალსაც შლის; სია
 * `visits_count`-ს ატარებს; ყველა ტიპის მოდელს `HasVisits` აქვს.
 */
class RecordVisitTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = $this->makeUser('vera', ['book', 'song']);
        $this->other = $this->makeUser('oto', ['book', 'song']);
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    private function book(User $owner): Book
    {
        $genre = $this->actingAs($owner)->getJson('/api/book-genres')->json('data.0.id');

        $id = $this->actingAs($owner)
            ->postJson('/api/books', ['title_en' => 'Dune', 'status' => 'to_read', 'genre_id' => $genre])
            ->assertStatus(201)
            ->json('data.id');

        return Book::withoutGlobalScope('owner')->findOrFail($id);
    }

    public function test_opening_a_record_counts_once_per_hour(): void
    {
        $book = $this->book($this->me);

        $this->actingAs($this->me)->postJson("/api/visits/book/{$book->id}")
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.mine', 1)
            ->assertJsonPath('data.entries.0.is_me', true)
            ->assertJsonPath('data.entries.0.source', 'library');

        // იმავე საათში მეორედ — არ იზრდება
        $this->actingAs($this->me)->postJson("/api/visits/book/{$book->id}")
            ->assertOk()
            ->assertJsonPath('data.count', 1);

        // საათის შემდეგ — ახალი შესვლა
        RecordVisit::query()->update(['visited_at' => Carbon::now()->subMinutes(61)]);

        $this->actingAs($this->me)->postJson("/api/visits/book/{$book->id}")
            ->assertOk()
            ->assertJsonPath('data.count', 2);

        $summary = $this->actingAs($this->me)->getJson("/api/visits/book/{$book->id}")->assertOk()->json('data');
        $this->assertSame(2, $summary['count']);
        $this->assertCount(2, $summary['entries']);
        $this->assertNotNull($summary['last_at']);
        $this->assertSame('vera', $summary['entries'][0]['viewer']['username']);
    }

    public function test_someone_elses_record_is_a_404_and_a_disabled_module_a_403(): void
    {
        $book = $this->book($this->other);

        $this->actingAs($this->me)->postJson("/api/visits/book/{$book->id}")->assertStatus(404);
        $this->actingAs($this->me)->getJson("/api/visits/book/{$book->id}")->assertStatus(404);

        // უცნობი ტიპი
        $this->actingAs($this->me)->postJson('/api/visits/widget/1')->assertStatus(404);

        $mine = $this->book($this->me);
        $this->me->modules()->sync(Module::where('key', 'song')->pluck('id')->all());
        $this->me->refresh();

        $this->actingAs($this->me)->postJson("/api/visits/book/{$mine->id}")
            ->assertStatus(403)
            ->assertJsonPath('message', 'module_not_enabled');
    }

    /** საჯარო პროფილიდან სხვისი შესვლა იწერება, მფლობელის საკუთარი — არა */
    public function test_a_public_playlist_view_is_logged_as_a_public_visit(): void
    {
        $this->me->forceFill(['profile_visibility' => 'public'])->save();
        $this->me->modules()->sync([
            Module::where('key', 'song')->value('id') => ['enabled_at' => now(), 'is_public' => true],
        ]);

        $song = Song::create([
            'user_id' => $this->me->id,
            'title' => 'Song',
            'url' => 'https://youtu.be/abcdefghijk',
            'platform' => 'youtube',
            'external_id' => 'abcdefghijk',
            'visibility' => 'public',
        ]);
        $playlist = Playlist::withoutGlobalScope('owner')->create(['user_id' => $this->me->id, 'name' => 'Mix', 'visibility' => 'public']);
        $playlist->songs()->attach($song->id, ['sort_order' => 1]);

        // ანონიმი
        $this->getJson("/api/public/profiles/vera/playlists/{$playlist->id}")->assertOk();
        // იგივე ანონიმი იმავე საათში — არ იზრდება
        $this->getJson("/api/public/profiles/vera/playlists/{$playlist->id}")->assertOk();
        // სხვა ანგარიში
        $this->actingAs($this->other)->getJson("/api/public/profiles/vera/playlists/{$playlist->id}")->assertOk();
        // მფლობელი თავის თავს არ ითვლის
        $this->actingAs($this->me)->getJson("/api/public/profiles/vera/playlists/{$playlist->id}")->assertOk();

        $visits = RecordVisit::query()->orderBy('id')->get();
        $this->assertCount(2, $visits);
        $this->assertNull($visits[0]->user_id);
        $this->assertSame('public', $visits[0]->source);
        $this->assertSame((int) $this->other->id, $visits[1]->user_id);
        $this->assertSame((int) $this->me->id, $visits[1]->owner_id);

        // მფლობელი ჟურნალში ანონიმსაც და „oto"-საც ხედავს
        $summary = $this->actingAs($this->me)->getJson("/api/visits/playlist/{$playlist->id}")->assertOk()->json('data');
        $this->assertSame(2, $summary['count']);
        $this->assertSame(0, $summary['mine']);
        $this->assertNull($summary['entries'][1]['viewer']);
        $this->assertSame('oto', $summary['entries'][0]['viewer']['username']);
    }

    public function test_deleting_the_record_for_good_removes_its_log_and_lists_carry_the_count(): void
    {
        $book = $this->book($this->me);
        $this->actingAs($this->me)->postJson("/api/visits/book/{$book->id}")->assertOk();

        $row = collect($this->actingAs($this->me)->getJson('/api/books')->json('data'))->firstWhere('id', $book->id);
        $this->assertSame(1, $row['visits_count']);

        $this->assertSame(1, RecordVisit::query()->count());

        // ურნაში გადატანა ჟურნალს ინარჩუნებს
        $book->moveToTrash();
        $this->assertSame(1, RecordVisit::query()->count());

        // საბოლოო წაშლა — ჟურნალიც ქრება (`HasVisits::deleting`)
        Book::withoutGlobalScopes(['owner', 'trash'])->findOrFail($book->id)->delete();
        $this->assertSame(0, RecordVisit::query()->count());
    }

    public function test_every_visitable_model_uses_the_trait(): void
    {
        foreach (Visitable::TYPES as $type => $model) {
            $this->assertContains(HasVisits::class, class_uses_recursive($model), "{$type} ({$model}) `HasVisits`-ის გარეშეა");
        }

        $this->assertSame('song', Visitable::module('playlist', new Playlist));
        $this->assertSame('book', Visitable::module('book', new Book));
    }
}
