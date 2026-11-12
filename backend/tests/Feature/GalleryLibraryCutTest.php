<?php

namespace Tests\Feature;

use App\Models\GalleryImage;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\Place;
use App\Models\PlaceFile;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **გალერეის „ბიბლიოთეკა" და „მოდულები"** — სათაური ყველა ტიპზე, მთავარი ფოტო
 * დასტისთვის, პირადი დისკის ესკიზი და ერთი ფაილი ერთხელ.
 */
class GalleryLibraryCutTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('private');
        $this->seed(ModulesSeeder::class);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->actingAs($this->user);
    }

    /** ადგილს მხოლოდ `name` აქვს — ბარათი `#1`-ს აღარ წერს, მთავარი ფოტო კი დასტას მიჰყვება */
    public function test_a_place_card_carries_its_name_and_its_main_photo(): void
    {
        $place = Place::create(['user_id' => $this->user->id, 'name' => 'ტოკიო ჰაუსი', 'photo_path' => 'places/photos/main.jpg']);

        $group = collect($this->getJson('/api/gallery/groups?by=record&type=place&have=all')->assertOk()->json('groups'))->firstWhere('id', $place->id);

        $this->assertSame('ტოკიო ჰაუსი', $group['title']);
        $this->assertSame('places/photos/main.jpg', $group['poster_path']);
        $this->assertSame(0, $group['photos']);

        // ფოტოს მფლობელის წარწერაც იმავე წესით იკითხება
        GalleryImage::create([
            'user_id' => $this->user->id, 'imageable_type' => 'place', 'imageable_id' => $place->id,
            'path' => 'gallery/images/p.jpg', 'size' => 10, 'source' => 'places', 'category' => 'backdrop',
        ]);
        $this->getJson('/api/gallery/photos')->assertOk()->assertJsonPath('data.0.owner.title', 'ტოკიო ჰაუსი');
    }

    /** „მოდულები": ერთი ფაილი ერთხელ ითვლება, გალერეიდან არჩეული მთავარი ფოტო — გალერეაში */
    public function test_the_modules_cut_counts_a_file_once(): void
    {
        // ატვირთული ფოტო, რომელიც მთავარ ფოტოდაც არის არჩეული — ერთი ფაილია
        $own = Place::create(['user_id' => $this->user->id, 'name' => 'A', 'photo_path' => 'places/files/images/a.jpg']);
        PlaceFile::create([
            'user_id' => $this->user->id, 'place_id' => $own->id, 'kind' => 'image',
            'path' => 'places/files/images/a.jpg', 'original_name' => 'a.jpg', 'size' => 100,
        ]);
        // მთავარი ფოტო გალერეიდან — ეს გალერეის ფოტოა და იქ ითვლება
        Place::create(['user_id' => $this->user->id, 'name' => 'B', 'photo_path' => 'gallery/images/g.jpg']);
        // ჩვეულებრივი მთავარი ფოტო
        Place::create(['user_id' => $this->user->id, 'name' => 'C', 'photo_path' => 'places/photos/c.jpg']);

        $group = collect($this->getJson('/api/gallery/groups?by=module')->assertOk()->json('groups'))->firstWhere('module', 'place');
        $this->assertSame(2, $group['photos']);
        $this->getJson('/api/gallery/module-photos?module=place')->assertOk()->assertJsonPath('meta.total', 2);
    }

    /** პირადი დისკის ფოტოს ესკიზი თავისი მარშრუტით მოდის — დასტა მას საკუთრების შემოწმებით კითხულობს */
    public function test_a_private_module_sends_previews_through_its_own_route(): void
    {
        $note = NoteEntry::create(['user_id' => $this->user->id, 'title' => 'ჩანაწერი']);
        $file = NoteEntryFile::create([
            'user_id' => $this->user->id, 'note_entry_id' => $note->id, 'kind' => 'image',
            'path' => 'notes/files/images/n.jpg', 'original_name' => 'n.jpg', 'size' => 50,
        ]);

        $group = collect($this->getJson('/api/gallery/groups?by=module')->assertOk()->json('groups'))->firstWhere('module', 'note');

        $this->assertTrue($group['private']);
        $this->assertSame(1, $group['photos']);
        $this->assertSame([['url' => '/note-files/'.$file->id, 'private' => true]], $group['previews']);
        // დისკის გზა გარეთ არ გადის
        $this->assertStringNotContainsString('notes/files', json_encode($group['previews']));
        $this->assertStringNotContainsString('notes\/files', $this->getJson('/api/gallery/module-photos?module=note')->assertOk()->getContent());
    }
}
