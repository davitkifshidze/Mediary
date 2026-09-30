<?php

namespace Tests\Feature;

use App\Models\CustomRecord;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Module;
use App\Models\TrashedFile;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Support\PublicDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **პირადი მოდული გალერეაში, საჯარო პროფილზე და დამთხვევაში (Tasks §37.4).**
 *
 * ⚠️ სამივე ერთი ფაქტის შედეგია: პირადი ჩანაწერის morph-კლასი **მოდულის
 * გასაღებია** (`CustomRecord::getMorphClass()`). ამიტომ ფოტოს `imageable_type`,
 * ურნის `record_type` და საჯარო დომენი ერთსა და იმავე სტრიქონს ატარებს —
 * ტესტები სწორედ იმას იჭერს, სადაც `custom_record` ჩუმად გაიპარებოდა.
 */
class CustomModuleSharingTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $stranger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->owner = $this->makeUser('owner');
        $this->stranger = $this->makeUser('stranger');
    }

    /** ⚠️ გალერეის მოდული ცხადად ირთვება — `/gallery/*` `module:gallery`-ის მიღმაა */
    private function makeUser(string $name): User
    {
        $user = User::factory()->create(['username' => $name]);
        $user->modules()->syncWithoutDetaching([
            Module::where('key', 'gallery')->value('id') => ['enabled_at' => now()],
        ]);

        // ⚠️ ქარხანა კვოტას არ წერს — მეხსიერებაში `null`-ია და ატვირთვა 413
        return $user->refresh();
    }

    private function createModule(User $user, string $name = 'Recipes', array $extra = []): string
    {
        return $this->actingAs($user)->postJson('/api/modules', [
            'name_en' => $name,
            'icon' => 'Utensils',
            'color' => '#22c55e',
            'classification' => null,
            'statuses' => 'default',
            ...$extra,
        ])->assertCreated()->json('data.key');
    }

    private function record(User $user, string $key, array $attrs = []): CustomRecord
    {
        $id = $this->actingAs($user)->post("/api/custom/{$key}", [
            'title' => 'Pasta',
            'status' => 'planned',
            ...$attrs,
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.id');

        return CustomRecord::withoutGlobalScopes()->findOrFail($id);
    }

    /** ფოტო ჩანაწერზე — ფაილით დისკზე, რომ წაშლა შემოწმდეს */
    private function photo(CustomRecord $record, string $name = 'a'): GalleryImage
    {
        $path = "gallery/images/{$name}.jpg";
        Storage::disk('public')->put($path, str_repeat('x', 1024));

        return $record->galleryImages()->create([
            'user_id' => $record->user_id,
            'source' => 'wikimedia',
            'category' => 'backdrop',
            'path' => $path,
            'size' => 1024,
        ]);
    }

    /** საჯარო პროფილი + საჯარო მოდული — ორი ფენა სამიდან */
    private function publish(User $user, string $key): void
    {
        $user->forceFill(['profile_visibility' => 'public'])->save();
        $this->actingAs($user)->putJson("/api/modules/{$key}/public", ['is_public' => true])->assertOk();
    }

    private function makePublic(User $user, string $key, CustomRecord $record): void
    {
        $this->actingAs($user)
            ->patchJson("/api/visibility/{$key}/{$record->id}", ['visibility' => 'public'])
            ->assertOk();
    }

    /** ⚠️ `actingAs()` შემდეგ მოთხოვნებზეც რჩება — ანონიმური სტუმრისთვის გუარდები უნდა გასუფთავდეს */
    private function anonymous(): void
    {
        $this->app['auth']->forgetGuards();
    }

    /* ---------- გალერეა (`GalleryParent`) ---------- */

    public function test_a_photo_hangs_on_the_record_under_its_module_key(): void
    {
        $recipes = $this->createModule($this->owner);
        $gadgets = $this->createModule($this->owner, 'Gadgets');
        $pasta = $this->record($this->owner, $recipes);
        $phone = $this->record($this->owner, $gadgets, ['title' => 'Phone']);

        $image = $this->photo($pasta);
        $this->photo($phone, 'b');

        // ⚠️ ტიპი **მოდულის გასაღებია** და არა `custom_record`
        $this->assertSame($recipes, $image->fresh()->imageable_type);

        $this->actingAs($this->owner);

        $groups = $this->getJson('/api/gallery/groups?by=record&previews=1')->assertOk();
        $this->assertSame(1, $groups->json("facets.types.{$recipes}"));
        $this->assertSame(1, $groups->json("facets.types.{$gadgets}"));

        // ⚠️ ერთი ცხრილი, ორი მოდული — ჯგუფი მხოლოდ თავისი მოდულის ჩანაწერს ხედავს
        $only = collect($this->getJson("/api/gallery/groups?by=record&type={$recipes}")->assertOk()->json('groups'));
        $this->assertSame([$pasta->id], $only->pluck('id')->all());
        $this->assertSame(1, $only->first()['photos'], 'ცარიელი ინსტანციის morph-კლასი ჯგუფს „0 ფოტოს" ათქმევინებდა');

        $photos = $this->getJson("/api/gallery/photos?owner={$recipes}:{$pasta->id}")->assertOk();
        $this->assertCount(1, $photos->json('data'));
        $this->assertSame($recipes, $photos->json('data.0.owner.kind'));
        $this->assertSame('Pasta', $photos->json('data.0.owner.title'));
        $this->assertTrue($photos->json('data.0.supports_primary'));

        // ⚠️ სხვისი პირადი მოდული „არ არსებობს" — იგივე 422, რაც უცნობ გასაღებზე
        $this->actingAs($this->stranger)
            ->getJson("/api/gallery/photos?owner={$recipes}:{$pasta->id}")
            ->assertUnprocessable();
        $this->assertArrayNotHasKey(
            $recipes,
            $this->getJson('/api/gallery/groups?by=record&previews=0')->json('facets.types') ?? [],
        );
    }

    public function test_a_web_photo_imports_onto_the_record(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);

        Http::fake(['203.0.113.10/*' => Http::response(
            base64_decode('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='),
            200,
            ['Content-Type' => 'image/jpeg'],
        )]);

        $body = [
            'target' => $key,
            'id' => $pasta->id,
            'images' => [['original' => 'https://203.0.113.10/pasta.jpg', 'title' => 'Pasta', 'engine' => 'wikimedia']],
        ];

        $this->actingAs($this->owner)->postJson('/api/web/import', $body)->assertOk()->assertJsonPath('added', 1);

        $image = GalleryImage::withoutGlobalScopes()->firstOrFail();
        $this->assertSame($key, $image->imageable_type);
        $this->assertSame($pasta->id, (int) $image->imageable_id);

        // ⚠️ სხვის ჩანაწერზე — 422, ისევე როგორც უცნობ მოდულზე
        $this->actingAs($this->stranger)->postJson('/api/web/import', $body)->assertUnprocessable();
    }

    public function test_a_video_link_is_saved_on_the_record_and_named(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);

        $this->actingAs($this->owner)->postJson('/api/gallery/videos', [
            'target' => $key,
            'id' => $pasta->id,
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'title' => 'How to',
        ])->assertCreated();

        $video = $this->getJson('/api/gallery/videos')->assertOk()->json('data.0');
        $this->assertSame($key, $video['owner']['kind']);
        $this->assertSame('Pasta', $video['owner']['title']);
    }

    public function test_moving_a_photo_onto_the_record_and_making_it_main(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);

        Storage::disk('public')->put('gallery/images/loose.jpg', str_repeat('x', 1024));
        $loose = GalleryImage::create([
            'user_id' => $this->owner->id, 'source' => 'wikimedia', 'category' => 'backdrop',
            'path' => 'gallery/images/loose.jpg', 'size' => 1024,
        ]);

        $this->actingAs($this->owner)->postJson('/api/gallery/images/move', [
            'ids' => [$loose->id], 'target' => "{$key}:{$pasta->id}",
        ])->assertOk()->assertJsonPath('moved', 1);

        $this->postJson("/api/gallery/images/{$loose->id}/primary")->assertOk();
        $this->assertSame('gallery/images/loose.jpg', $pasta->fresh()->photo_path);

        // ⚠️ გალერეის ფაილი ერთხელ ითვლება — გალერეას ეწერება და არა მოდულს
        $meter = app(StorageMeter::class);
        $files = $meter->files($this->owner->fresh());
        $this->assertSame(1, $files->where('path', 'gallery/images/loose.jpg')->count());
        $this->assertSame(0, $meter->usedByModule($this->owner->fresh(), $key));

        // მოხსნა გალერეის ფაილს არც შლის და არც ურნაში აგზავნის — ის ფოტოს რიგისაა
        $this->post("/api/custom/{$key}/{$pasta->id}", ['_method' => 'PUT', 'remove_photo' => 1], ['Accept' => 'application/json'])
            ->assertOk();
        $this->assertNull($pasta->fresh()->photo_path);
        Storage::disk('public')->assertExists('gallery/images/loose.jpg');
        $this->assertSame(0, TrashedFile::withoutGlobalScopes()->count());
    }

    public function test_making_a_gallery_photo_main_sends_the_old_upload_to_the_trash(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key, [
            'photo' => UploadedFile::fake()->image('mine.jpg', 40, 40),
        ]);
        $upload = $pasta->photo_path;
        $image = $this->photo($pasta);

        $this->actingAs($this->owner)->postJson("/api/gallery/images/{$image->id}/primary")->assertOk();

        /* ⚠️ წყაროს სვეტის გარეშე მშობელზე ძველი ატვირთვა აქამდე უბრალოდ
           გადაიწერებოდა — ფაილი დისკზე ობლად, კვოტაში სამუდამოდ რჩებოდა. */
        $trashed = TrashedFile::withoutGlobalScopes()->where('kind', 'record_photo')->firstOrFail();
        $this->assertSame($upload, $trashed->path);
        $this->assertSame($key, $trashed->record_type);
        Storage::disk('public')->assertExists($upload);
    }

    /**
     * ⚠️ **ჩანაცვლებული ფოტო ურნაში მოდულით ჩანს და ბრუნდება.** სანამ morph-კლასი
     * `custom_record` იყო, ურნის ელემენტი `record_type = custom_record`-ით
     * იწერებოდა: უფლების ფილტრი მას ვერ ცნობდა (ე.ი. ურნაში არ ჩანდა), საცავი
     * კი არარსებულ მოდულს აწერდა.
     */
    public function test_a_replaced_photo_is_listed_in_the_trash_and_restores(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key, ['photo' => UploadedFile::fake()->image('a.jpg', 40, 40)]);
        $first = $pasta->photo_path;

        $this->post("/api/custom/{$key}/{$pasta->id}", [
            '_method' => 'PUT',
            'photo' => UploadedFile::fake()->image('b.jpg', 40, 40),
        ], ['Accept' => 'application/json'])->assertOk();

        $trashed = TrashedFile::withoutGlobalScopes()->where('kind', 'record_photo')->firstOrFail();
        $this->assertSame($key, $trashed->record_type);

        $group = collect($this->getJson('/api/trash')->assertOk()->json('data'))->firstWhere('kind', 'record_photo');
        $this->assertNotNull($group, 'ჩანაცვლებული ფოტო ურნაში უნდა ჩანდეს');
        $this->assertSame($trashed->id, $group['items'][0]['id']);

        // ⚠️ ორივე ფაილი მოდულის ლიმიტში ითვლება — ურნაში მყოფიც დისკზეა
        $meter = app(StorageMeter::class);
        $this->assertSame(2, $meter->files($this->owner->fresh(), $key)->where('module', $key)->count());

        $this->postJson("/api/trash/record_photo/{$trashed->id}/restore", ['replace' => true])->assertOk();
        $this->assertSame($first, $pasta->fresh()->photo_path);
    }

    public function test_deleting_the_record_for_good_removes_its_gallery(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);
        $image = $this->photo($pasta);
        GalleryVideo::create([
            'user_id' => $this->owner->id,
            'videoable_type' => $key,
            'videoable_id' => $pasta->id,
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'platform' => 'youtube',
        ]);

        CustomRecord::withoutGlobalScopes()->findOrFail($pasta->id)->delete();

        $this->assertNull(GalleryImage::withoutGlobalScopes()->find($image->id));
        $this->assertSame(0, GalleryVideo::withoutGlobalScopes()->count());
        Storage::disk('public')->assertMissing($image->path);
    }

    public function test_the_modules_cut_shows_the_records_main_photos(): void
    {
        $key = $this->createModule($this->owner);
        $this->record($this->owner, $key, ['photo' => UploadedFile::fake()->image('a.jpg', 40, 40)]);

        $groups = collect($this->actingAs($this->owner)->getJson('/api/gallery/groups?by=module')->assertOk()->json('groups'));
        $this->assertSame(1, $groups->firstWhere('module', $key)['photos'] ?? null);

        $photos = $this->getJson("/api/gallery/module-photos?module={$key}")->assertOk();
        $this->assertSame($key, $photos->json('data.0.owner.kind'));

        $this->assertNull(collect($this->actingAs($this->stranger)->getJson('/api/gallery/groups?by=module')->json('groups'))
            ->firstWhere('module', $key));
    }

    /* ---------- საჯარო პროფილი (`PublicDomain`) ---------- */

    public function test_a_public_module_and_record_show_on_the_profile(): void
    {
        $key = $this->createModule($this->owner);
        $public = $this->record($this->owner, $key, ['url' => 'https://example.org/pasta']);
        $this->record($this->owner, $key, ['title' => 'Secret']);
        $this->publish($this->owner, $key);
        $this->makePublic($this->owner, $key, $public);

        $this->anonymous();

        foreach ([null, $this->stranger] as $visitor) {
            $request = $visitor ? $this->actingAs($visitor) : $this;

            $profile = $request->getJson('/api/public/profiles/owner')->assertOk();
            $this->assertContains($key, $profile->json('domains'));
            $this->assertSame(1, $profile->json("counts.{$key}"));
            $this->assertSame('Recipes', $profile->json("modules.{$key}.name_en"));
            $this->assertSame($key, $profile->json("domain_modules.{$key}"));

            $cards = $request->getJson("/api/public/profiles/owner/{$key}")->assertOk()->json('data');
            $this->assertSame(['Pasta'], array_column($cards, 'title_en'), 'პირადი ჩანაწერი არ ჩანს');
            $this->assertSame('example.org', $cards[0]['subtitle']);
            $this->assertSame('https://example.org/pasta', $cards[0]['url']);
            $this->assertSame('planned', $cards[0]['status']['key']);
        }
    }

    public function test_a_private_module_stays_off_the_profile(): void
    {
        $key = $this->createModule($this->owner);
        $record = $this->record($this->owner, $key);
        $this->owner->forceFill(['profile_visibility' => 'public'])->save();
        $this->makePublic($this->owner, $key, $record);

        $this->anonymous();

        $this->assertNotContains($key, $this->getJson('/api/public/profiles/owner')->assertOk()->json('domains'));
        $this->getJson("/api/public/profiles/owner/{$key}")->assertNotFound();
    }

    public function test_hidden_fields_leave_the_public_card(): void
    {
        $key = $this->createModule($this->owner);
        $record = $this->record($this->owner, $key, [
            'url' => 'https://example.org/pasta',
            'photo' => UploadedFile::fake()->image('a.jpg', 40, 40),
        ]);
        $this->publish($this->owner, $key);
        $this->makePublic($this->owner, $key, $record);

        $this->actingAs($this->owner)->putJson("/api/modules/{$key}/fields", ['fields' => [
            'url' => ['public' => false],
            'photo' => ['public' => false],
        ]])->assertOk();

        $this->anonymous();

        $card = $this->getJson("/api/public/profiles/owner/{$key}")->assertOk()->json('data.0');
        // ⚠️ ჰოსტი ბმულიდან გამოდის — ბმულთან ერთად ისიც ქრება
        $this->assertArrayNotHasKey('url', $card);
        $this->assertArrayNotHasKey('subtitle', $card);
        $this->assertArrayNotHasKey('image', $card);
        $this->assertSame('Pasta', $card['title_en']);
    }

    public function test_the_visibility_manager_serves_only_the_owner(): void
    {
        $key = $this->createModule($this->owner);
        $other = $this->createModule($this->owner, 'Gadgets');
        $pasta = $this->record($this->owner, $key);
        $this->record($this->owner, $other, ['title' => 'Phone']);

        $list = $this->actingAs($this->owner)->getJson("/api/visibility/{$key}")->assertOk();
        // ⚠️ ერთი ცხრილი, ორი მოდული — სია მხოლოდ ამ მოდულისაა
        $this->assertSame(['Pasta'], array_column($list->json('data'), 'title_en'));
        $this->assertSame(1, $list->json('meta.private'));

        $this->patchJson("/api/visibility/{$key}", ['visibility' => 'public', 'all' => true])
            ->assertOk()
            ->assertJsonPath('updated', 1);
        $this->assertSame('private', CustomRecord::withoutGlobalScopes()->where('module', $other)->value('visibility'));

        // ⚠️ სხვისი პირადი მოდული 404-ია და არა 403 — `module_disabled` არსებობას ამხელდა
        $this->actingAs($this->stranger)->getJson("/api/visibility/{$key}")->assertNotFound();
        $this->patchJson("/api/visibility/{$key}/{$pasta->id}", ['visibility' => 'private'])->assertNotFound();
        $this->assertSame('public', $pasta->fresh()->visibility);
    }

    public function test_a_private_module_is_shareable_on_the_modules_list(): void
    {
        $key = $this->createModule($this->owner);

        $module = collect($this->actingAs($this->owner)->getJson('/api/modules')->assertOk()->json('data'))
            ->firstWhere('key', $key);

        $this->assertTrue($module['shareable']);
        $this->assertSame([$key], PublicDomain::forModule($key));
    }

    public function test_the_public_gallery_shows_the_records_photos(): void
    {
        $key = $this->createModule($this->owner);
        $pasta = $this->record($this->owner, $key);
        $this->photo($pasta);
        $hidden = $this->record($this->owner, $key, ['title' => 'Secret']);
        $this->photo($hidden, 'b');
        $this->publish($this->owner, $key);
        $this->makePublic($this->owner, $key, $pasta);
        // ⚠️ საჯარო გალერეას თავისი ფენა აქვს — გალერეის მოდულიც საჯარო უნდა იყოს
        $this->putJson('/api/modules/gallery/public', ['is_public' => true])->assertOk();

        $this->anonymous();

        foreach ([null, $this->stranger] as $visitor) {
            $request = $visitor ? $this->actingAs($visitor) : $this;

            $groups = collect($request->getJson('/api/public/profiles/owner/gallery-groups?by=record&previews=0')
                ->assertOk()->json('groups'));
            $this->assertSame([$pasta->id], $groups->where('kind', $key)->pluck('id')->values()->all());

            $photos = $request->getJson("/api/public/profiles/owner/gallery-photos?owner={$key}:{$pasta->id}")->assertOk();
            $this->assertCount(1, $photos->json('data'));

            // პირადი ჩანაწერის ფოტო — 404, ისევე როგორც პირადი ფილმისა
            $request->getJson("/api/public/profiles/owner/gallery-photos?owner={$key}:{$hidden->id}")->assertNotFound();
        }
    }

    /* ---------- დამთხვევები ---------- */

    /**
     * ⚠️ **ორი ადამიანის პირადი მოდული სხვადასხვა გასაღებითაა**, ე.ი. დომენ-დომენ
     * შედარებაში ისინი ვერასდროს შეხვდებოდნენ — `custom` ფსევდო-დომენი მათ
     * ერთიანებს და იდენტობა ბმულია.
     */
    public function test_two_peoples_private_modules_match_by_link(): void
    {
        $mine = $this->createModule($this->owner);
        $theirs = $this->createModule($this->stranger, 'Cooking');
        $this->assertNotSame($mine, $theirs);

        $a = $this->record($this->owner, $mine, ['url' => 'https://example.org/pasta', 'status' => 'done']);
        $b = $this->record($this->stranger, $theirs, ['url' => 'https://example.org/pasta', 'status' => 'done']);
        // ბმულის გარეშე ჩანაწერი დამთხვევაში არ მონაწილეობს
        $noLink = $this->record($this->owner, $mine, ['title' => 'Soup']);
        $noLinkToo = $this->record($this->stranger, $theirs, ['title' => 'Soup']);

        foreach ([[$this->owner, $mine, [$a, $noLink]], [$this->stranger, $theirs, [$b, $noLinkToo]]] as [$user, $key, $records]) {
            $this->publish($user, $key);
            foreach ($records as $record) {
                $this->makePublic($user, $key, $record);
            }
        }

        $summary = $this->actingAs($this->owner)->getJson('/api/matches/stranger')->assertOk();
        $row = collect($summary->json('domains'))->firstWhere('domain', PublicDomain::CUSTOM);

        $this->assertNotNull($row, 'პირადი მოდულები `custom`-ად უნდა შეხვდნენ ერთმანეთს');
        $this->assertSame(1, $row['shared']);
        $this->assertSame(1, $row['mine']);
        $this->assertSame(1, $row['both_done']);

        $items = $this->getJson('/api/matches/stranger/custom')->assertOk()->json('data');
        $this->assertCount(1, $items);
        $this->assertSame('https://example.org/pasta', $items[0]['url']);
        // ბარათი მეორე მხარისაა, ჩემი სტატუსი კი `mine`-შია
        $this->assertSame($theirs, $items[0]['module']);
        $this->assertSame($a->id, $items[0]['mine']['id']);
        $this->assertSame('done', $items[0]['mine']['status']['role']);
        $this->assertTrue($items[0]['both_done']);
    }

    public function test_a_module_that_is_not_public_does_not_match(): void
    {
        $mine = $this->createModule($this->owner);
        $theirs = $this->createModule($this->stranger, 'Cooking');
        $a = $this->record($this->owner, $mine, ['url' => 'https://example.org/pasta']);
        $b = $this->record($this->stranger, $theirs, ['url' => 'https://example.org/pasta']);

        $this->publish($this->owner, $mine);
        $this->makePublic($this->owner, $mine, $a);
        // მეორე მხარეს ჩანაწერი საჯაროა, მოდული კი — არა
        $this->stranger->forceFill(['profile_visibility' => 'public'])->save();
        $this->makePublic($this->stranger, $theirs, $b);

        $domains = collect($this->actingAs($this->owner)->getJson('/api/matches/stranger')->assertOk()->json('domains'));

        $this->assertNull($domains->firstWhere('domain', PublicDomain::CUSTOM));
        $this->getJson('/api/matches/stranger/custom')->assertNotFound();
    }
}
