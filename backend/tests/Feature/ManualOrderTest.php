<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Module;
use App\Models\NoteEntry;
use App\Models\Role;
use App\Models\Song;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ხელით დალაგება** — ბუკმარკები, ჩანაწერები, სიმღერები.
 *
 * „ხელით" სიის დალაგების ერთ-ერთი ვარიანტია (`?sort=manual`); რიგს
 * `POST …/reorder {ids}` ინახავს.
 *
 * ⚠️ მოწმდება სამივე მოდულზე ერთი და იგივე: რიგი ინახება; ახალი ჩანაწერი
 * თავში ხვდება; სხვა ანგარიშის id იგნორირდება და მისი ჩანაწერი არ იცვლება;
 * ურნიდან აღდგენილი თავის ადგილს უბრუნდება; ნაწილის გადალაგება დანარჩენს
 * ადგილს არ უცვლის; გადალაგება `updated_at`-ს არ ეხება და `update` უფლებას
 * ითხოვს.
 */
class ManualOrderTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('bela');
    }

    /** @return array<string, array{class-string<Model>, string, string}> */
    public static function modules(): array
    {
        return [
            'bookmarks' => [Bookmark::class, 'bookmarks', 'bookmark'],
            'notes' => [NoteEntry::class, 'notes', 'note'],
            'songs' => [Song::class, 'songs', 'song'],
        ];
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['bookmark', 'note', 'song'])->pluck('id')->all());

        return $user->refresh();
    }

    /**
     * @param  class-string<Model>  $model
     */
    private function record(string $model, string $title, ?User $owner = null): Model
    {
        $base = ['user_id' => ($owner ?? $this->user)->id, 'title' => $title];

        return $model::create(match ($model) {
            Bookmark::class => [...$base, 'url' => 'http://203.0.113.10/'.$title, 'domain' => '203.0.113.10'],
            Song::class => [...$base, 'url' => 'https://youtu.be/'.$title],
            default => $base,
        });
    }

    /** სია „ხელით" დალაგებით — სათაურების რიგი */
    private function titles(string $path, ?User $as = null): array
    {
        return $this->actingAs($as ?? $this->user)
            ->getJson("/api/{$path}?sort=manual&per_page=500")
            ->assertOk()
            ->json('data.*.title');
    }

    private function reorder(string $path, array $ids, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->user)->postJson("/api/{$path}/reorder", ['ids' => $ids]);
    }

    /** ახალი ჩანაწერი რიგის თავში ხვდება — სხვა არაფერი ინაცვლებს */
    #[DataProvider('modules')]
    public function test_a_new_record_goes_to_the_top(string $model, string $path): void
    {
        $this->record($model, 'first');
        $this->record($model, 'second');
        $this->record($model, 'third');

        $this->assertSame(['third', 'second', 'first'], $this->titles($path));

        // ყოველს თავისი, განსხვავებული ადგილი აქვს — გადალაგება ამას ეყრდნობა
        $orders = $model::query()->pluck('sort_order');
        $this->assertCount(3, $orders->unique());
    }

    /** გადათრევით დალაგებული რიგი ინახება */
    #[DataProvider('modules')]
    public function test_the_order_is_saved(string $model, string $path): void
    {
        $a = $this->record($model, 'a');
        $b = $this->record($model, 'b');
        $c = $this->record($model, 'c');

        $this->reorder($path, [$a->id, $c->id, $b->id])
            ->assertOk()
            ->assertExactJson(['ids' => [$a->id, $c->id, $b->id]]);

        $this->assertSame(['a', 'c', 'b'], $this->titles($path));

        // შემდეგი ახალი ჩანაწერი ისევ თავში ხვდება
        $this->record($model, 'd');
        $this->assertSame(['d', 'a', 'c', 'b'], $this->titles($path));
    }

    /** სხვა ანგარიშის id იგნორირდება: მისი ჩანაწერი ადგილს არ იცვლის, ჩემი რიგი კი ინახება */
    #[DataProvider('modules')]
    public function test_another_accounts_id_is_ignored(string $model, string $path): void
    {
        $other = $this->makeUser('gio');
        $theirs = $this->record($model, 'theirs', $other);
        $theirsToo = $this->record($model, 'theirs-too', $other);
        $before = DB::table((new $model)->getTable())->whereIn('id', [$theirs->id, $theirsToo->id])->pluck('sort_order', 'id')->all();

        $a = $this->record($model, 'a');
        $b = $this->record($model, 'b');

        $this->reorder($path, [$theirs->id, $a->id, $theirsToo->id, $b->id, 999999])
            ->assertOk()
            ->assertExactJson(['ids' => [$a->id, $b->id]]);

        $this->assertSame(['a', 'b'], $this->titles($path));
        $this->assertSame(
            $before,
            DB::table((new $model)->getTable())->whereIn('id', [$theirs->id, $theirsToo->id])->pluck('sort_order', 'id')->all(),
        );
        $this->assertSame(['theirs-too', 'theirs'], $this->titles($path, $other));
    }

    /** ურნიდან აღდგენილი ჩანაწერი თავის ადგილს უბრუნდება */
    #[DataProvider('modules')]
    public function test_a_restored_record_returns_to_its_place(string $model, string $path): void
    {
        $a = $this->record($model, 'a');
        $b = $this->record($model, 'b');
        $c = $this->record($model, 'c');
        $this->reorder($path, [$a->id, $b->id, $c->id])->assertOk();

        $this->actingAs($this->user);
        $b->moveToTrash();
        $this->assertSame(['a', 'c'], $this->titles($path));

        // ურნაში ყოფნისას რიგი იცვლება და ახალიც ემატება — აღდგენილი მაინც შუაში ბრუნდება
        $this->reorder($path, [$c->id, $a->id, $b->id])->assertOk()->assertExactJson(['ids' => [$c->id, $a->id]]);
        $this->reorder($path, [$a->id, $c->id])->assertOk();
        $this->record($model, 'd');

        $model::withoutGlobalScopes()->findOrFail($b->id)->restoreFromTrash();

        $this->assertSame(['d', 'a', 'b', 'c'], $this->titles($path));
    }

    /** ფილტრით ნაჩვენები ნაწილის გადალაგება დანარჩენს ადგილს არ უცვლის */
    #[DataProvider('modules')]
    public function test_reordering_a_part_keeps_the_rest_in_place(string $model, string $path): void
    {
        $records = [];
        foreach (['e', 'd', 'c', 'b', 'a'] as $title) {
            $records[$title] = $this->record($model, $title);
        }
        $this->assertSame(['a', 'b', 'c', 'd', 'e'], $this->titles($path));

        // მხოლოდ b და d (ვთქვათ, ერთი კატეგორია) იცვლის ადგილს ერთმანეთში
        $this->reorder($path, [$records['d']->id, $records['b']->id])->assertOk();

        $this->assertSame(['a', 'd', 'c', 'b', 'e'], $this->titles($path));
    }

    /** გადალაგება ჩანაწერის რედაქტირება არ არის — `updated_at` არ იცვლება */
    #[DataProvider('modules')]
    public function test_reordering_does_not_touch_updated_at(string $model, string $path): void
    {
        $a = $this->record($model, 'a');
        $b = $this->record($model, 'b');
        $table = (new $model)->getTable();
        DB::table($table)->update(['updated_at' => '2026-01-01 10:00:00']);

        $this->reorder($path, [$a->id, $b->id])->assertOk();

        $this->assertSame(['2026-01-01 10:00:00'], DB::table($table)->distinct()->pluck('updated_at')->all());
    }

    /** ძველი მონაცემი ერთნაირი მნიშვნელობებით (ყველა 0) მაინც ლაგდება */
    #[DataProvider('modules')]
    public function test_legacy_rows_with_equal_values_can_be_ordered(string $model, string $path): void
    {
        $a = $this->record($model, 'a');
        $b = $this->record($model, 'b');
        $c = $this->record($model, 'c');
        DB::table((new $model)->getTable())->update(['sort_order' => 0]);

        $this->reorder($path, [$b->id, $a->id, $c->id])->assertOk();

        $this->assertSame(['b', 'a', 'c'], $this->titles($path));
    }

    /** `POST …/reorder` რედაქტირების უფლებაა და არა დამატების */
    #[DataProvider('modules')]
    public function test_reordering_needs_the_update_permission(string $model, string $path, string $module): void
    {
        $a = $this->record($model, 'a');
        $b = $this->record($model, 'b');

        $role = fn (string $key, array $actions) => Role::create([
            'key' => $key, 'name_ka' => $key, 'name_en' => $key, 'permissions' => [$module => $actions],
        ]);

        $this->user->forceFill(['role_id' => $role('adder', ['view', 'create'])->id])->save();
        $this->reorder($path, [$a->id, $b->id], $this->user->refresh())->assertForbidden();
        $this->assertSame(['b', 'a'], $this->titles($path));

        $this->user->forceFill(['role_id' => $role('editor', ['view', 'update'])->id])->save();
        $this->reorder($path, [$a->id, $b->id], $this->user->refresh())->assertOk();
        $this->assertSame(['a', 'b'], $this->titles($path));
    }

    /** ერთი მოთხოვნა — სიის ერთი გვერდი (500) */
    public function test_one_request_takes_at_most_one_page(): void
    {
        $this->reorder('bookmarks', range(1, 501))->assertStatus(422)->assertJsonValidationErrors('ids');
        $this->reorder('bookmarks', [])->assertOk()->assertExactJson(['ids' => []]);
        $this->reorder('bookmarks', ['x'])->assertStatus(422);
    }

    /** საწყისი ნუმერაცია: მფლობელის ჩანაწერები ახალი-ჯერ რიგით, ურნაში მყოფიც */
    public function test_the_migration_numbers_existing_records_newest_first(): void
    {
        $other = $this->makeUser('gio');
        $a = $this->record(Bookmark::class, 'a');
        $b = $this->record(Bookmark::class, 'b');
        $theirs = $this->record(Bookmark::class, 'theirs', $other);
        $c = $this->record(Bookmark::class, 'c');
        $this->actingAs($this->user);
        $b->moveToTrash();
        DB::table('bookmarks')->update(['sort_order' => 0]);

        (require database_path('migrations/2026_11_12_000001_number_manual_order.php'))->up();

        $this->assertSame(
            [$c->id => 1, $b->id => 2, $a->id => 3, $theirs->id => 1],
            DB::table('bookmarks')->orderBy('user_id')->orderBy('sort_order')->pluck('sort_order', 'id')->map(fn ($v) => (int) $v)->all(),
        );
    }
}
