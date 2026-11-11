<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Status;
use App\Models\User;
use App\Support\StatusPalette;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **უფერო სტატუსი არ არსებობს.**
 *
 * მენიუს ქვეპუნქტის აიქონი ყოველთვის სტატუსის ფერითაა; ფერის გარეშე შექმნილი
 * სტატუსი ნაცრისფერი რჩებოდა. ახალს ფერი მოდელი აწერს, არსებულებს — მიგრაცია.
 */
class StatusAutoColorTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create(['name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password']);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'bookmark'])->pluck('id')->all());
        $this->user->refresh();
    }

    /** @return list<string|null> */
    private function colors(string $domain): array
    {
        return array_column($this->actingAs($this->user)->getJson("/api/statuses/{$domain}")->assertOk()->json('data'), 'color');
    }

    private function create(string $name, array $extra = []): array
    {
        return $this->actingAs($this->user)
            ->postJson('/api/statuses/movie', ['name_ka' => $name, 'name_en' => $name, 'role' => 'todo', ...$extra])
            ->assertStatus(201)
            ->json('data');
    }

    public function test_a_status_created_without_a_colour_takes_the_first_free_one(): void
    {
        $before = $this->colors('movie');
        $this->assertNotContains(null, $before, 'ნაგულისხმევ სტატუსებს ფერი ნაკრებიდან აქვთ');

        $first = $this->create('Abandoned');
        $second = $this->create('Someday');

        $expected = StatusPalette::firstFree($before);
        $this->assertSame($expected, $first['color']);
        $this->assertNotContains($first['color'], $before);
        // მეორე ახალი სტატუსი პირველის ფერს არ იმეორებს
        $this->assertNotSame($first['color'], $second['color']);
        $this->assertNotContains($second['color'], $before);

        // ფერი ბაზაშია — გადატვირთვაზე არ იცვლება
        $this->assertSame($first['color'], Status::withoutGlobalScopes()->find($first['id'])->color);
    }

    public function test_a_chosen_colour_is_kept(): void
    {
        $this->assertSame('#2f6b8f', $this->create('Mine', ['color' => '#2f6b8f'])['color']);
        $this->assertSame('c9', $this->create('Other', ['color' => 'c9'])['color']);
    }

    /** ფერი კლასიფიკატორზეა: ფილმების დაკავებული ფერი ბუკმარკებს არ ეხება */
    public function test_free_colours_are_counted_per_classifier(): void
    {
        $movieColors = $this->colors('movie');
        $bookmarkColors = $this->colors('bookmark');

        $created = $this->actingAs($this->user)
            ->postJson('/api/statuses/bookmark', ['name_ka' => 'Later', 'name_en' => 'Later', 'role' => 'todo'])
            ->assertStatus(201)
            ->json('data');

        $this->assertSame(StatusPalette::firstFree($bookmarkColors), $created['color']);
        // ფილმების სია არ შეცვლილა
        $this->assertSame($movieColors, $this->colors('movie'));
    }

    public function test_the_palette_wraps_around_once_every_colour_is_taken(): void
    {
        $this->assertSame('c1', StatusPalette::firstFree([]));
        $this->assertSame('c2', StatusPalette::firstFree(['c1', null, '#ffffff']));
        $this->assertSame('c1', StatusPalette::firstFree(['c2', 'c3']));
        // თორმეტივე დაკავებულია: მეცამეტე წრეზე მიდის და არა უფერო რჩება
        $this->assertSame('c1', StatusPalette::firstFree(StatusPalette::KEYS));
        $this->assertSame('c2', StatusPalette::firstFree([...StatusPalette::KEYS, 'c1']));
    }

    /** არსებული უფერო სტატუსები: მენიუს რიგით, პირველი თავისუფალი ფერი; არჩეული ხელუხლებელია */
    public function test_the_migration_colours_existing_statuses_without_touching_chosen_ones(): void
    {
        $row = fn (string $key, ?string $color, int $order, ?string $trashed = null) => [
            'user_id' => $this->user->id,
            'module' => 'movie',
            'key' => $key,
            'name_ka' => $key,
            'name_en' => $key,
            'role' => 'todo',
            'color' => $color,
            'sort_order' => $order,
            'trashed_at' => $trashed,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        DB::table('statuses')->insert([
            $row('chosen', 'c1', 0),
            $row('hex', '#123456', 1),
            $row('second', null, 3),
            $row('first', null, 2),
            // ურნაში მყოფიც იღებს ფერს — აღდგენილი ნაცრისფერი არ უნდა დაბრუნდეს
            $row('binned', null, 4, now()->toDateTimeString()),
        ]);

        (require database_path('migrations/2026_11_11_000001_fill_missing_status_colors.php'))->up();

        $colors = DB::table('statuses')->where('user_id', $this->user->id)->where('module', 'movie')->pluck('color', 'key');

        $this->assertSame('c1', $colors['chosen']);
        $this->assertSame('#123456', $colors['hex']);
        $this->assertSame('c2', $colors['first']);
        $this->assertSame('c3', $colors['second']);
        $this->assertSame('c4', $colors['binned']);
    }
}
