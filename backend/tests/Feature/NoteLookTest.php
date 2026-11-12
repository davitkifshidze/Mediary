<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\NoteEntry;
use App\Models\TrashedFile;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ჩანაწერის იერი** — საკუთარი აიქონი, ფონის ფერი და მთავარი ფოტო.
 *
 * ⚠️ მოწმდება ის, რაც ჩუმად ტყდება: ფოტო პრივატულ დისკზეა და `/storage`-ით არ
 * იხსნება; სხვა ანგარიში და სტუმარი მას ვერ კითხულობს; კვოტა ატვირთვაზე იზრდება
 * და საბოლოო წაშლაზე ბრუნდება; შეცვლილი და მოშორებული ფოტო ურნაში მიდის;
 * ფაილების ბიბლიოთეკა და „ობოლი ფაილების" სია ახალ სვეტს იცნობს.
 */
class NoteLookTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('private');
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('nino');
        $this->actingAs($this->user);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['note'])->pluck('id')->all());

        // ⚠️ კვოტა მეხსიერებაში `null`-ია, სანამ რიგი თავიდან არ წაიკითხება — ატვირთვა 413-ს მიიღებდა
        return $user->refresh();
    }

    /** @param  array<string, mixed>  $extra */
    private function note(array $extra = []): NoteEntry
    {
        $id = $this->postJson('/api/notes', [
            'title' => 'მანქანის დაზღვევა',
            'status' => 'open',
            'category_id' => $this->getJson('/api/note-categories')->json('data.0.id'),
            ...$extra,
        ])->assertStatus(201)->json('data.id');

        return NoteEntry::findOrFail($id);
    }

    private function upload(NoteEntry $note, string $name = 'cover.png')
    {
        return $this->post("/api/notes/{$note->id}", [
            '_method' => 'PATCH',
            'photo' => UploadedFile::fake()->image($name, 40, 40),
        ], ['Accept' => 'application/json']);
    }

    public function test_an_icon_and_a_colour_are_saved_and_cleared(): void
    {
        $note = $this->note(['icon' => 'Car', 'color' => 'c7']);

        $this->getJson("/api/notes/{$note->id}")
            ->assertOk()
            ->assertJsonPath('data.icon', 'Car')
            ->assertJsonPath('data.color', 'c7')
            ->assertJsonPath('data.photo_url', null);

        // სია იმავეს აბრუნებს — ბარათი მეორე მოთხოვნის გარეშე იხატება
        $this->getJson('/api/notes')->assertOk()->assertJsonPath('data.0.icon', 'Car')->assertJsonPath('data.0.color', 'c7');

        $this->patchJson("/api/notes/{$note->id}", ['color' => '#2f6b8f'])->assertOk()->assertJsonPath('data.color', '#2f6b8f')->assertJsonPath('data.icon', 'Car');
        $this->patchJson("/api/notes/{$note->id}", ['icon' => null, 'color' => null])->assertOk()->assertJsonPath('data.icon', null)->assertJsonPath('data.color', null);

        // ფერი მხოლოდ პალიტრის გასაღები ან `#rrggbb`
        $this->patchJson("/api/notes/{$note->id}", ['color' => 'red'])->assertStatus(422)->assertJsonValidationErrors('color');
        $this->patchJson("/api/notes/{$note->id}", ['color' => 'c13'])->assertStatus(422);
    }

    public function test_the_photo_lives_on_the_private_disk_and_is_served_only_to_its_owner(): void
    {
        $note = $this->note();
        $before = (int) $this->user->fresh()->storage_used_bytes;

        $url = $this->upload($note)->assertOk()->json('data.photo_url');
        $note->refresh();

        $this->assertStringStartsWith('notes/photos/', $note->photo_path);
        Storage::disk('private')->assertExists($note->photo_path);
        Storage::disk('public')->assertMissing($note->photo_path);
        $this->assertGreaterThan($before, (int) $this->user->fresh()->storage_used_bytes);

        // რესურსი API-ს გზას აბრუნებს (ფაილთან ერთად ცვლადი `v`-ით) და არა დისკის ბილიკს
        $this->assertMatchesRegularExpression("#^/notes/{$note->id}/photo\\?v=[0-9a-f]{8}$#", $url);
        $this->assertStringNotContainsString($note->photo_path, json_encode($this->getJson("/api/notes/{$note->id}")->json()));

        $this->get("/api/notes/{$note->id}/photo")->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');

        // სხვა ანგარიში — 404; სტუმარი — 401
        $this->actingAs($this->makeUser('otar'))->getJson("/api/notes/{$note->id}/photo")->assertNotFound();
        Auth::forgetGuards();
        $this->getJson("/api/notes/{$note->id}/photo")->assertUnauthorized();
    }

    public function test_a_note_without_a_photo_answers_404_and_only_an_image_is_accepted(): void
    {
        $note = $this->note();

        $this->getJson("/api/notes/{$note->id}/photo")->assertNotFound();

        $this->post("/api/notes/{$note->id}", [
            '_method' => 'PATCH',
            'photo' => UploadedFile::fake()->create('script.php', 4, 'text/x-php'),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('photo');

        $this->assertNull($note->fresh()->photo_path);
    }

    public function test_replacing_or_removing_the_photo_sends_the_old_file_to_the_trash(): void
    {
        $note = $this->note();
        $this->upload($note, 'first.png')->assertOk();
        $first = $note->fresh()->photo_path;

        $second = $this->upload($note, 'second.png')->assertOk()->json('data.photo_url');
        $note->refresh();
        $this->assertNotSame($first, $note->photo_path);
        $this->assertStringNotContainsString(substr(md5($first), 0, 8), $second);

        // ძველი ფაილი ურნაშია — დისკზე და კვოტაში ჯერ კიდევ არის
        $trashed = TrashedFile::where('user_id', $this->user->id)->where('kind', 'record_photo')->get();
        $this->assertSame([$first], $trashed->pluck('path')->all());
        $this->assertSame('photo_path', $trashed[0]->slot);
        Storage::disk('private')->assertExists($first);

        $current = $note->photo_path;
        $this->patchJson("/api/notes/{$note->id}", ['remove_photo' => true])->assertOk()->assertJsonPath('data.photo_url', null);
        $this->assertNull($note->fresh()->photo_path);
        $this->assertEqualsCanonicalizing([$first, $current], TrashedFile::where('kind', 'record_photo')->pluck('path')->all());
        Storage::disk('private')->assertExists($current);

        // დანარჩენი ველები ხელუხლებელია
        $this->assertSame('მანქანის დაზღვევა', $note->fresh()->title);

        // ურნიდან ფოტო იმავე ჩანაწერს უბრუნდება
        $row = TrashedFile::where('path', $current)->firstOrFail();
        $this->assertSame('note', $row->record_type);
        $this->postJson("/api/trash/record_photo/{$row->id}/restore")->assertSuccessful();
        $this->assertSame($current, $note->fresh()->photo_path);
        $this->assertSame([$first], TrashedFile::where('kind', 'record_photo')->pluck('path')->all());
    }

    public function test_the_final_delete_removes_the_file_and_gives_the_quota_back(): void
    {
        $note = $this->note();
        $empty = (int) $this->user->fresh()->storage_used_bytes;
        $this->upload($note)->assertOk();
        $path = $note->fresh()->photo_path;

        // ურნა: ფაილი და კვოტა ადგილზეა
        $this->deleteJson("/api/notes/{$note->id}")->assertNoContent();
        Storage::disk('private')->assertExists($path);
        $this->assertGreaterThan($empty, (int) $this->user->fresh()->storage_used_bytes);

        NoteEntry::withoutGlobalScopes()->findOrFail($note->id)->delete();
        Storage::disk('private')->assertMissing($path);
        $this->assertSame($empty, (int) $this->user->fresh()->storage_used_bytes);
    }

    public function test_the_file_library_and_the_orphan_sweep_know_the_photo(): void
    {
        $note = $this->note();
        $this->upload($note)->assertOk();
        $path = $note->fresh()->photo_path;
        $meter = app(StorageMeter::class);

        $files = collect($meter->files($this->user))->where('module', 'note')->values();
        $this->assertSame(['primary'], $files->pluck('kind')->all());
        $this->assertSame([$path], $files->pluck('path')->all());
        $this->assertSame(['note', $note->id], [$files[0]['owner_type'], $files[0]['owner_id']]);

        // ⚠️ აქ არყოფნა ნიშნავს, რომ ადმინის „ობოლი ფაილების გასუფთავება" ფოტოს წაშლიდა
        $referenced = (new \ReflectionMethod($meter, 'referencedPaths'))->invoke($meter);
        $this->assertArrayHasKey($path, $referenced);
    }
}
