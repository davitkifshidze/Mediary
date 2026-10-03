<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ციტატები ჩანიშვნებისგან ცალკე** (Tasks §23.2) — სია `quotes_count`-საც ამბობს.
 */
class BookNoteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $user = User::create([
            'name' => 'nino',
            'username' => 'nino',
            'email' => 'nino@example.com',
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::where('key', 'book')->pluck('id')->all());
        $this->actingAs($user->refresh());
    }

    public function test_the_list_counts_quotes_separately_from_notes(): void
    {
        $id = $this->postJson('/api/books', ['title_en' => 'Dune', 'status' => 'to_read', 'format' => 'print', 'genre_id' => $this->getJson('/api/book-genres')->json('data.0.id')])
            ->assertCreated()
            ->json('data.id');

        $this->postJson("/api/books/{$id}/notes", ['body' => 'ჩანიშვნა'])->assertCreated();
        $this->postJson("/api/books/{$id}/notes", ['body' => 'ციტატა ერთი', 'is_quote' => true, 'page' => 12])->assertCreated();
        $this->postJson("/api/books/{$id}/notes", ['body' => 'ციტატა ორი', 'is_quote' => true])->assertCreated();

        $this->getJson('/api/books')
            ->assertOk()
            ->assertJsonPath('data.0.notes_count', 3)
            ->assertJsonPath('data.0.quotes_count', 2);

        $this->getJson("/api/books/{$id}/notes?quotes=1")->assertOk()->assertJsonCount(2, 'data');
    }

    /** გვერდი დიაპაზონშია — 0 და ზედმეტად დიდი 422-ია */
    public function test_the_page_must_be_a_positive_number(): void
    {
        $id = $this->postJson('/api/books', ['title_en' => 'Dune', 'status' => 'to_read', 'format' => 'print', 'genre_id' => $this->getJson('/api/book-genres')->json('data.0.id')])
            ->assertCreated()
            ->json('data.id');

        $this->postJson("/api/books/{$id}/notes", ['body' => 'x', 'is_quote' => true, 'page' => 0])->assertStatus(422);
        $this->postJson("/api/books/{$id}/notes", ['body' => 'x', 'is_quote' => true, 'page' => 100001])->assertStatus(422);
    }
}
