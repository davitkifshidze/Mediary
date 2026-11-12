<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\Concerns\HasRecordLock;
use App\Models\Concerns\HidesLockedRecords;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Person;
use App\Models\PersonalAlbum;
use App\Models\RecordLock;
use App\Models\Role;
use App\Models\Series;
use App\Models\User;
use App\Support\LockBook;
use App\Support\RecordLocks;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **„ჩაკეტილების" გვერდი და პაროლის ერთად მოხსნა.**
 *
 * ⚠️ მოწმდება: სია ყველა ტიპის ჩემს ლოკს აჩვენებს — დაუხსნელიდან მხოლოდ სახელი და
 * ლოკის ფაქტები; სხვისი ლოკი და ურნაში მყოფი ჩანაწერი არ ჩანს; ერთად მოხსნას
 * **ყოველთვის** ანგარიშის პაროლი სჭირდება, სესიაში გახსნილზეც, და არასწორი პაროლით
 * არაფერი იხსნება; მოხსნის შემდეგ ჩანაწერი სიებში ბრუნდება, ალბომის ფოტოები კი დაცული
 * დისკიდან ჩვეულებრივზე; „ისევ ჩაკეტვა" სესიაში გახსნილებს ხურავს; ყოველი ჩაკეტვადი
 * მოდელი გვერდის რეესტრშია.
 */
class RecordLockPageTest extends TestCase
{
    use RefreshDatabase;

    private User $nino;

    private User $dato;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->nino = $this->makeUser('nino');
        $this->dato = $this->makeUser('dato');
        $this->actingAs($this->nino);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    /** stateful მოთხოვნა — ზუსტად ისეთი, როგორსაც SPA აგზავნის (სესიით) */
    private function spa(?User $user = null)
    {
        return $this->actingAs($user ?? $this->nino)->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    private function movie(string $title, ?User $owner = null): Movie
    {
        $movie = Movie::create(['user_id' => ($owner ?? $this->nino)->id, 'year' => 2020, 'poster_path' => 'movies/p.jpg']);
        $movie->setTranslation('en', ['title' => $title, 'description' => "About {$title}"]);

        return $movie;
    }

    /** ჩაკეტვა მოდელით — სესიაში არავინ გახსნა */
    private function lock(Model $record, ?User $owner = null, ?string $hint = null): RecordLock
    {
        $lock = RecordLock::withoutGlobalScope('owner')->create([
            'user_id' => ($owner ?? $this->nino)->id,
            'lockable_type' => $record->getMorphClass(),
            'lockable_id' => $record->getKey(),
            'password_hash' => Hash::make('secret1'),
            'hint' => $hint,
        ]);
        RecordLocks::flush();

        return $lock;
    }

    public function test_the_page_lists_every_kind_of_lock_with_the_name_only(): void
    {
        $movie = $this->movie('Secret Diary');
        $series = Series::create(['user_id' => $this->nino->id, 'year' => 2019]);
        $series->setTranslation('en', ['title' => 'Quiet Show']);
        $actor = CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves']);
        $album = GalleryAlbum::create(['user_id' => $this->nino->id, 'name' => 'Trip', 'sort_order' => 1]);
        $person = Person::create(['user_id' => $this->nino->id, 'name' => 'Ana']);
        $personalAlbum = PersonalAlbum::create(['user_id' => $this->nino->id, 'name' => 'Summer']);

        $this->lock($movie, null, 'ზღვა');
        foreach ([$series, $actor, $album, $person, $personalAlbum] as $record) {
            $this->lock($record);
        }

        // სხვისი ლოკები (მათ შორის იმავე მსახიობზე) და ურნაში მყოფი ჩემი ჩანაწერი არ ჩანს
        $this->lock($this->movie('Foreign', $this->dato), $this->dato);
        $this->lock($actor, $this->dato);
        $trashed = $this->movie('Binned');
        $this->lock($trashed);
        $trashed->moveToTrash();

        $rows = $this->spa()->getJson('/api/locks')->assertOk()->json('data');

        $this->assertSame(
            ['movie', 'series', 'cast_member', 'gallery_album', 'personal', 'personal_album'],
            array_column($rows, 'type'),
        );
        $this->assertSame(['movie', 'series', 'cast', 'gallery', 'personal', 'personal'], array_column($rows, 'module'));
        $this->assertSame(['Secret Diary', 'Quiet Show', 'Keanu Reeves', 'Trip', 'Ana', 'Summer'], array_column($rows, 'title'));
        $this->assertSame([$movie->id, 'ზღვა', false], [$rows[0]['record_id'], $rows[0]['hint'], $rows[0]['unlocked']]);
        $this->assertNotNull($rows[0]['locked_at']);

        // დაუხსნელიდან მხოლოდ სახელი და ლოკის ფაქტები — არც პოსტერი, არც აღწერა, არც hash
        $this->assertSame(
            ['id', 'type', 'module', 'record_id', 'title', 'title_ka', 'hint', 'unlocked', 'locked_at'],
            array_keys($rows[0]),
        );
        $body = $this->spa()->getJson('/api/locks')->getContent();
        $this->assertStringNotContainsString('About Secret', $body);
        $this->assertStringNotContainsString('movies/p.jpg', $body);
        $this->assertStringNotContainsString('Foreign', $body);
        $this->assertStringNotContainsString('Binned', $body);

        // მეორე ანგარიში მხოლოდ თავის ორ ლოკს ხედავს (სერვისით — ტესტის სესია პირველი ანგარიშისაა)
        $this->actingAs($this->dato);
        RecordLocks::flush();
        $this->assertSame(['Foreign', 'Keanu Reeves'], array_column(LockBook::rows(), 'title'));
    }

    public function test_bulk_removal_always_needs_the_account_password_even_for_a_record_open_in_this_session(): void
    {
        $movie = $this->movie('Secret Diary');
        $lock = $this->lock($movie);

        // ამ სესიაში გახსნილი: ერთი ჩანაწერის კარი მასზე პაროლს აღარ ითხოვს, ერთად მოხსნა — ითხოვს
        $this->spa()->postJson("/api/media/movie/{$movie->id}/unlock", ['password' => 'secret1'])->assertOk();
        $this->assertTrue($this->spa()->getJson('/api/locks')->json('data.0.unlocked'));

        $this->spa()->postJson('/api/locks/remove', ['ids' => [$lock->id]])->assertStatus(422);
        $this->spa()->postJson('/api/locks/remove', ['ids' => [$lock->id], 'account_password' => 'wrong-password'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'account_password_wrong');
        $this->spa()->postJson('/api/locks/remove', ['ids' => [], 'account_password' => 'password'])->assertStatus(422);
        $this->assertSame(1, RecordLock::count());

        $this->spa()->postJson('/api/locks/remove', ['ids' => [$lock->id], 'account_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('removed', 1);

        $this->assertSame(0, RecordLock::count());
        $this->spa()->getJson('/api/locks')->assertJsonCount(0, 'data');
        // სესიის გარეშეც სიაშია — ჩანაწერი აღარ არის ჩაკეტილი
        $this->assertSame([$movie->id], array_column($this->actingAs($this->nino)->getJson('/api/movies')->json('data'), 'id'));
    }

    public function test_removal_covers_every_type_and_brings_album_photos_back_to_the_public_disk(): void
    {
        Storage::fake('public');
        Storage::fake('private');

        $movie = $this->movie('Secret Diary');
        $actor = CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves']);
        $person = Person::create(['user_id' => $this->nino->id, 'name' => 'Ana']);
        $album = GalleryAlbum::create(['user_id' => $this->nino->id, 'name' => 'Trip', 'sort_order' => 1]);
        $album->setPassword('secret1');
        Storage::disk('private')->put('gallery/locked/secret.jpg', 'x');
        $photo = GalleryImage::create([
            'user_id' => $this->nino->id, 'album_id' => $album->id, 'source' => 'tmdb', 'category' => 'backdrop',
            'path' => 'gallery/locked/secret.jpg', 'size' => 100,
        ]);

        $ids = [$this->lock($movie)->id, $this->lock($actor)->id, $this->lock($person)->id, RecordLock::where('lockable_type', 'gallery_album')->value('id')];
        // სხვისი ლოკის id ჩემს მოთხოვნაში არაფერს ხსნის
        $foreign = $this->lock($this->movie('Foreign', $this->dato), $this->dato);

        $this->spa()->postJson('/api/locks/remove', ['ids' => [...$ids, $foreign->id], 'account_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('removed', 4);

        $this->assertSame([$foreign->id], RecordLock::withoutGlobalScope('owner')->pluck('id')->all());
        $this->assertFalse($album->refresh()->isLocked());

        // ფოტო დაცული დისკიდან ჩვეულებრივზე დაბრუნდა
        $path = GalleryImage::withoutGlobalScopes()->findOrFail($photo->id)->path;
        $this->assertStringStartsWith('gallery/images/', $path);
        Storage::disk('public')->assertExists($path);
        Storage::disk('private')->assertMissing('gallery/locked/secret.jpg');
    }

    public function test_an_album_unlocked_in_bulk_can_be_locked_again(): void
    {
        Storage::fake('public');
        Storage::fake('private');

        $album = GalleryAlbum::create(['user_id' => $this->nino->id, 'name' => 'Trip', 'sort_order' => 1]);
        $album->setPassword('secret1');
        Storage::disk('private')->put('gallery/locked/secret.jpg', 'x');
        $photo = GalleryImage::create([
            'user_id' => $this->nino->id, 'album_id' => $album->id, 'source' => 'tmdb', 'category' => 'backdrop',
            'path' => 'gallery/locked/secret.jpg', 'size' => 100,
        ]);

        $this->spa()->postJson('/api/locks/remove', [
            'ids' => [RecordLock::where('lockable_type', 'gallery_album')->value('id')],
            'account_password' => 'password',
        ])->assertOk()->assertJsonPath('removed', 1);

        // მოხსნილი ლოკი კვალს არ ტოვებს: ახალი პაროლი ანგარიშის პაროლის გარეშე იდება
        $this->spa()->patchJson("/api/gallery/albums/{$album->id}", ['name' => 'Trip', 'password' => 'again-1'])
            ->assertOk()
            ->assertJsonPath('locked', true)
            ->assertJsonPath('unlocked', true);

        $this->assertTrue($album->refresh()->passwordMatches('again-1'));
        $this->spa()->getJson('/api/locks')->assertJsonCount(1, 'data')->assertJsonPath('data.0.type', 'gallery_album');

        // ფოტო ისევ დაცულ დისკზეა
        $path = GalleryImage::withoutGlobalScopes()->findOrFail($photo->id)->path;
        $this->assertStringStartsWith('gallery/locked/', $path);
        Storage::disk('private')->assertExists($path);
        Storage::disk('public')->assertMissing('gallery/images/secret.jpg');
    }

    public function test_removal_needs_the_update_permission_of_the_module(): void
    {
        $lock = $this->lock($this->movie('Secret Diary'));
        $role = Role::create(['key' => 'viewer', 'name_ka' => 'მკითხველი', 'name_en' => 'Viewer', 'permissions' => ['movie' => ['view']]]);
        $this->nino->forceFill(['role_id' => $role->id])->save();
        $this->nino->refresh();

        $this->spa()->postJson('/api/locks/remove', ['ids' => [$lock->id], 'account_password' => 'password'])
            ->assertStatus(403)
            ->assertJsonPath('permission', 'movie.update');
        $this->assertSame(1, RecordLock::count());
    }

    public function test_locking_everything_again_closes_what_this_session_opened(): void
    {
        $movie = $this->movie('Secret Diary');
        $other = $this->movie('Second Secret');
        $this->lock($movie);
        $this->lock($other);

        $this->spa()->postJson("/api/media/movie/{$movie->id}/unlock", ['password' => 'secret1'])->assertOk();
        $this->spa()->postJson("/api/media/movie/{$other->id}/unlock", ['password' => 'secret1'])->assertOk();
        $this->assertCount(2, $this->spa()->getJson('/api/movies')->json('data'));
        $this->assertSame([true, true], array_column($this->spa()->getJson('/api/locks')->json('data'), 'unlocked'));

        $this->spa()->postJson('/api/locks/relock')->assertNoContent();

        // პაროლები ადგილზეა, ჩანაწერები ისევ დამალულია
        $this->assertSame([false, false], array_column($this->spa()->getJson('/api/locks')->json('data'), 'unlocked'));
        $this->assertCount(0, $this->spa()->getJson('/api/movies')->json('data'));
        $this->assertSame(2, RecordLock::count());
    }

    /** ახალი ჩაკეტვადი მოდელი გვერდის რეესტრს არ უნდა გამოეპაროს */
    public function test_every_lockable_model_is_in_the_page_registry(): void
    {
        $lockable = [];

        foreach (glob(app_path('Models/*.php')) ?: [] as $file) {
            $class = 'App\\Models\\'.basename($file, '.php');
            $traits = class_uses_recursive($class);

            if (isset($traits[HasRecordLock::class]) || isset($traits[HidesLockedRecords::class])) {
                $lockable[] = $class;
            }
        }

        $this->assertGreaterThanOrEqual(7, count($lockable));
        $this->assertEqualsCanonicalizing($lockable, array_column(LockBook::TYPES, 'model'));

        // გასაღები ზუსტად ის morph-ალიასია, რომლითაც ლოკი ინახება
        foreach (LockBook::TYPES as $type => $meta) {
            $this->assertSame($type, (new $meta['model'])->getMorphClass());
        }
    }
}
