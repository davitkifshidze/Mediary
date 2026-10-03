<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **წიგნის ფაილის მიმაგრება — სახე გაფართოებით** (Tasks §23.1).
 *
 * ⚠️ `kind` აღარ არის სავალდებულო: ერთ ზონაში ჩაგდებული `epub` წიგნია,
 * `docx` — დოკუმენტი, `jpg` — ფოტო; თითოეული თავისი საქაღალდითა და ლიმიტით
 * ინახება. ცხადად მოწოდებული `kind` ძველებურად მოქმედებს.
 */
class BookFileTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'lali',
            'username' => 'lali',
            'email' => 'lali@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::where('key', 'book')->pluck('id')->all());
        $this->actingAs($this->user->refresh());
    }

    private function makeBook(): int
    {
        return $this->postJson('/api/books', ['title_en' => 'Dune', 'status' => 'to_read', 'format' => 'print', 'genre_id' => $this->getJson('/api/book-genres')->json('data.0.id')])
            ->assertCreated()
            ->json('data.id');
    }

    public function test_the_kind_is_inferred_from_the_extension_when_not_given(): void
    {
        $id = $this->makeBook();

        $rows = $this->postJson("/api/books/{$id}/files", [
            'files' => [
                UploadedFile::fake()->create('dune.epub', 300, 'application/epub+zip'),
                UploadedFile::fake()->create('notes.docx', 200, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
                UploadedFile::fake()->image('cover.jpg'),
            ],
        ])->assertCreated()->json('data');

        $byName = collect($rows)->keyBy('original_name');

        $this->assertSame('book', $byName['dune.epub']['kind']);
        $this->assertStringStartsWith('books/files/ebooks/', $byName['dune.epub']['url']);
        $this->assertSame('doc', $byName['notes.docx']['kind']);
        $this->assertStringStartsWith('books/files/docs/', $byName['notes.docx']['url']);
        $this->assertSame('image', $byName['cover.jpg']['kind']);
        $this->assertStringStartsWith('books/files/images/', $byName['cover.jpg']['url']);
    }

    /** ცხადი `kind` ისევ მოქმედებს — ფოტოების ბლოკი მას აგზავნის */
    public function test_an_explicit_kind_still_wins(): void
    {
        $id = $this->makeBook();

        $this->postJson("/api/books/{$id}/files", [
            'kind' => 'image',
            'files' => [UploadedFile::fake()->image('photo.png')],
        ])->assertCreated()->assertJsonPath('data.0.kind', 'image');
    }

    /** სახის ლიმიტი თითო ფაილზე მოწმდება — უცხო ფორმატი 422-ია */
    public function test_a_file_outside_every_allowed_format_is_rejected(): void
    {
        $id = $this->makeBook();

        $this->postJson("/api/books/{$id}/files", [
            'files' => [UploadedFile::fake()->create('virus.exe', 10, 'application/octet-stream')],
        ])->assertStatus(422);

        $this->assertSame(0, $this->user->books()->first()->files()->count());
    }
}
