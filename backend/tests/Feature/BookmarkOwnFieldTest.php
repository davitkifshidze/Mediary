<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Bookmark;
use App\Models\BookmarkOwnField;
use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **ბუკმარკის საკუთარი ველები** — „სახელი → მნიშვნელობა" წყვილები ერთ ჩანაწერზე.
 *
 * ⚠️ მოწმდება ის, რაც ჩუმად გაჟონავდა: მნიშვნელობა ბაზაში ღიად არ დევს; ბუკმარკის
 * რესურსში, საჯარო გვერდზე, გაზიარებაში და ჟურნალში არ ჩანს; საიდუმლო ველი ძებნაში
 * არც სახელით მოიძებნება, არც მნიშვნელობით; ექსპორტი ღია მნიშვნელობით გადის და
 * იმპორტი მას თავიდან შიფრავს.
 */
class BookmarkOwnFieldTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('lina');
        $this->actingAs($this->user);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['bookmark'])->pluck('id')->all());

        return $user->refresh();
    }

    private function bookmark(string $title = 'მანქანის საბუთები'): Bookmark
    {
        $id = $this->postJson('/api/bookmarks', [
            'title' => $title,
            'url' => 'https://example.com/'.md5($title),
            'autofill' => 0,
            'status' => 'to_read',
            'category_id' => $this->getJson('/api/bookmark-categories')->json('data.0.id'),
        ])->assertStatus(201)->json('data.id');

        return Bookmark::findOrFail($id);
    }

    /** @param  list<array<string, mixed>>  $fields */
    private function save(Bookmark $bookmark, array $fields)
    {
        return $this->putJson("/api/bookmarks/{$bookmark->id}/fields", ['fields' => $fields]);
    }

    public function test_fields_are_saved_in_order_and_come_back_readable_while_the_database_holds_only_ciphertext(): void
    {
        $bookmark = $this->bookmark();

        $this->save($bookmark, [
            ['label' => 'ტექპასპორტი', 'value' => 'AB1234567'],
            ['label' => 'PIN', 'value' => '4821', 'is_secret' => true],
            ['label' => 'ცარიელი', 'value' => ''],
        ])->assertOk()->assertJsonCount(3, 'data');

        $data = $this->getJson("/api/bookmarks/{$bookmark->id}/fields")->assertOk()->json('data');
        $this->assertSame(['ტექპასპორტი', 'PIN', 'ცარიელი'], array_column($data, 'label'));
        $this->assertSame(['AB1234567', '4821', null], array_column($data, 'value'));
        $this->assertSame([false, true, false], array_column($data, 'is_secret'));
        $this->assertSame([true, true, true], array_column($data, 'readable'));

        // ⚠️ ბაზაში — მხოლოდ შიფრი, საიდუმლოც და ღიაც
        $stored = DB::table('bookmark_own_fields')->orderBy('sort_order')->pluck('value')->all();
        $this->assertStringNotContainsString('AB1234567', (string) $stored[0]);
        $this->assertStringNotContainsString('4821', (string) $stored[1]);
        $this->assertSame('AB1234567', Crypt::decryptString($stored[0]));
        $this->assertNull($stored[2]);

        // ბუკმარკის რესურსი ველებს არ ატარებს — არც ერთი, არც სია
        $show = json_encode($this->getJson("/api/bookmarks/{$bookmark->id}")->assertOk()->json());
        $list = json_encode($this->getJson('/api/bookmarks')->assertOk()->json());
        foreach ([$show, $list] as $body) {
            $this->assertStringNotContainsString('AB1234567', $body);
            $this->assertStringNotContainsString('4821', $body);
        }
    }

    public function test_saving_the_list_again_updates_reorders_and_removes(): void
    {
        $bookmark = $this->bookmark();
        [$a, $b, $c] = $this->save($bookmark, [
            ['label' => 'A', 'value' => '1'],
            ['label' => 'B', 'value' => '2'],
            ['label' => 'C', 'value' => '3'],
        ])->json('data');

        // C პირველი და გადარქმეული, A — შეცვლილი მნიშვნელობით, B — წაშლილი, D — ახალი
        $data = $this->save($bookmark, [
            ['id' => $c['id'], 'label' => 'C2', 'value' => '3'],
            ['id' => $a['id'], 'label' => 'A', 'value' => '10', 'is_secret' => true],
            ['label' => 'D', 'value' => '4'],
        ])->assertOk()->json('data');

        $this->assertSame(['C2', 'A', 'D'], array_column($data, 'label'));
        $this->assertSame(['3', '10', '4'], array_column($data, 'value'));
        $this->assertSame([$c['id'], $a['id']], [$data[0]['id'], $data[1]['id']]);
        $this->assertTrue($data[1]['is_secret']);
        $this->assertDatabaseMissing('bookmark_own_fields', ['id' => $b['id']]);

        // სხვა ბუკმარკის id აქ ახალ რიგად იწერება და იმას არ ეხება
        $other = $this->bookmark('სხვა');
        $foreign = $this->save($other, [['label' => 'მისი', 'value' => 'x']])->json('data.0.id');
        $this->save($bookmark, [['id' => $foreign, 'label' => 'ჩემი', 'value' => 'y']])->assertOk();
        $this->assertSame('მისი', BookmarkOwnField::findOrFail($foreign)->label);
        $this->assertSame(1, $bookmark->ownFields()->count());

        // ცარიელი სია ყველაფერს შლის
        $this->save($bookmark, [])->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame(0, $bookmark->ownFields()->count());
    }

    public function test_the_list_is_limited_and_a_field_needs_a_name(): void
    {
        $bookmark = $this->bookmark();

        $this->save($bookmark, array_map(fn (int $i) => ['label' => "F{$i}", 'value' => 'v'], range(1, BookmarkOwnField::MAX + 1)))
            ->assertStatus(422)->assertJsonValidationErrors('fields');
        $this->save($bookmark, [['label' => '  ', 'value' => 'v']])->assertStatus(422)->assertJsonValidationErrors('fields.0.label');
        $this->save($bookmark, [['label' => 'L', 'value' => str_repeat('x', BookmarkOwnField::VALUE_MAX + 1)]])
            ->assertStatus(422)->assertJsonValidationErrors('fields.0.value');
        $this->putJson("/api/bookmarks/{$bookmark->id}/fields", [])->assertStatus(422);

        $this->assertSame(0, $bookmark->ownFields()->count());
    }

    /** SPA-ს ზღვარი სერვერისას იმეორებს — რედაქტორი 21-ე რიგს არ ამატებს */
    public function test_the_spa_mirrors_the_limit(): void
    {
        $source = file_get_contents(base_path('../frontend/src/api/bookmarks.ts'));

        $this->assertSame(1, preg_match('/export const BOOKMARK_OWN_FIELDS_MAX = (\d+)/', $source, $m));
        $this->assertSame(BookmarkOwnField::MAX, (int) $m[1]);
    }

    public function test_another_account_gets_a_404(): void
    {
        $bookmark = $this->bookmark();
        $this->save($bookmark, [['label' => 'ნომერი', 'value' => 'AA-001-AA']])->assertOk();

        $this->actingAs($this->makeUser('otar'));

        $this->getJson("/api/bookmarks/{$bookmark->id}/fields")->assertNotFound();
        $this->save($bookmark, [])->assertNotFound();
        $this->assertSame(1, BookmarkOwnField::withoutGlobalScopes()->count());
    }

    public function test_the_list_search_finds_an_open_field_by_name_or_value_but_never_a_secret_one(): void
    {
        $car = $this->bookmark('მანქანა');
        $bank = $this->bookmark('ბანკი');
        $this->bookmark('ცარიელი');

        $this->save($car, [['label' => 'სახელმწიფო ნომერი', 'value' => 'QQ-777-QQ']]);
        $this->save($bank, [['label' => 'საიდუმლო კოდი', 'value' => 'ZZ-999-ZZ', 'is_secret' => true]]);

        $titles = fn (string $q) => array_column($this->getJson('/api/bookmarks?q='.rawurlencode($q))->assertOk()->json('data'), 'title');

        $this->assertSame(['მანქანა'], $titles('qq-777'));
        $this->assertSame(['მანქანა'], $titles('სახელმწიფო'));
        // საიდუმლო — არც მნიშვნელობით, არც სახელით
        $this->assertSame([], $titles('ZZ-999'));
        $this->assertSame([], $titles('საიდუმლო კოდი'));
        // ჩვეულებრივი ძებნა უცვლელია
        $this->assertSame(['ბანკი'], $titles('ბანკი'));
    }

    public function test_the_audit_log_names_open_fields_and_counts_secret_ones_without_any_value(): void
    {
        $bookmark = $this->bookmark();

        $this->save($bookmark, [
            ['label' => 'ტექპასპორტი', 'value' => 'AB1234567'],
            ['label' => 'ბარათის PIN', 'value' => '4821', 'is_secret' => true],
        ])->assertOk();

        $log = AuditLog::where('subject_type', 'bookmark')->where('action', AuditLog::ACTION_UPDATE)->latest('id')->firstOrFail();
        $this->assertSame($bookmark->id, (int) $log->subject_id);
        $this->assertSame(['own_fields' => ['ტექპასპორტი'], 'secret_fields' => 1], $log->new_values);

        // მთელ ჟურნალში არც მნიშვნელობაა და არც საიდუმლო ველის სახელი
        $all = AuditLog::all()->toJson(JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('AB1234567', $all);
        $this->assertStringNotContainsString('4821', $all);
        $this->assertStringNotContainsString('ბარათის PIN', $all);
    }

    public function test_fields_stay_in_the_trash_and_go_with_the_final_delete(): void
    {
        $bookmark = $this->bookmark();
        $this->save($bookmark, [['label' => 'ნომერი', 'value' => 'AA-001-AA']]);

        $this->deleteJson("/api/bookmarks/{$bookmark->id}")->assertSuccessful();
        $this->assertSame(1, BookmarkOwnField::withoutGlobalScopes()->count());

        Bookmark::withoutGlobalScopes()->findOrFail($bookmark->id)->delete();
        $this->assertSame(0, BookmarkOwnField::withoutGlobalScopes()->count());
    }

    public function test_a_value_encrypted_with_another_key_reads_as_empty_and_is_not_wiped_by_a_save(): void
    {
        $bookmark = $this->bookmark();
        $id = $this->save($bookmark, [['label' => 'ნომერი', 'value' => 'AA-001-AA']])->json('data.0.id');
        DB::table('bookmark_own_fields')->where('id', $id)->update(['value' => 'not-a-valid-ciphertext']);

        $data = $this->getJson("/api/bookmarks/{$bookmark->id}/fields")->assertOk()->json('data.0');
        $this->assertNull($data['value']);
        $this->assertFalse($data['readable']);

        // ფანჯარა ცარიელ მნიშვნელობას აბრუნებს — შიფრი ადგილზე რჩება
        $this->save($bookmark, [['id' => $id, 'label' => 'ახალი სახელი', 'value' => null]])->assertOk();
        $this->assertSame('not-a-valid-ciphertext', DB::table('bookmark_own_fields')->where('id', $id)->value('value'));
        $this->assertSame('ახალი სახელი', DB::table('bookmark_own_fields')->where('id', $id)->value('label'));

        // ახალი მნიშვნელობა კი იწერება
        $this->save($bookmark, [['id' => $id, 'label' => 'ახალი სახელი', 'value' => 'BB-002-BB']])->assertOk()->assertJsonPath('data.0.readable', true);
        $this->assertSame('BB-002-BB', BookmarkOwnField::findOrFail($id)->value);
    }

    public function test_the_export_carries_plain_values_and_the_import_encrypts_them_again(): void
    {
        $bookmark = $this->bookmark();
        $this->save($bookmark, [
            ['label' => 'ტექპასპორტი', 'value' => 'AB1234567'],
            ['label' => 'PIN', 'value' => '4821', 'is_secret' => true],
        ]);

        $json = $this->get('/api/export/bookmark?format=json')->assertOk()->streamedContent();
        $fields = json_decode($json, true)['records'][0]['own_fields'];
        $this->assertSame(['ტექპასპორტი', 'PIN'], array_column($fields, 'label'));
        $this->assertSame(['AB1234567', '4821'], array_column($fields, 'value'));
        $this->assertSame([false, true], array_column($fields, 'is_secret'));
        // შიდა რიცხვები არ გადის
        $this->assertArrayNotHasKey('id', $fields[0]);
        $this->assertArrayNotHasKey('bookmark_id', $fields[0]);
        $this->assertArrayNotHasKey('user_id', $fields[0]);

        $other = $this->makeUser('otar');
        $path = tempnam(sys_get_temp_dir(), 'mediary-test-');
        file_put_contents($path, $json);
        $plan = $this->actingAs($other)
            ->post('/api/import/plan', ['file' => new UploadedFile($path, 'mediary-bookmark-2026-11-12.json', null, null, true)])
            ->assertOk()->json();
        $source = collect($plan['modules'])->firstWhere('module', 'bookmark')['source'] ?? 'bookmark';
        $result = $this->postJson('/api/import/item', ['token' => $plan['token'], 'module' => $source, 'index' => 0])->assertOk()->json();
        $this->assertTrue($result['ok']);

        $copy = BookmarkOwnField::withoutGlobalScopes()->where('bookmark_id', $result['id'])->orderBy('sort_order')->get();
        $this->assertSame(['AB1234567', '4821'], $copy->pluck('value')->all());
        $this->assertSame([false, true], $copy->pluck('is_secret')->all());
        $this->assertSame([$other->id, $other->id], $copy->pluck('user_id')->map(fn ($id) => (int) $id)->all());
        $this->assertStringNotContainsString('AB1234567', (string) DB::table('bookmark_own_fields')->where('id', $copy[0]->id)->value('value'));
    }

    public function test_a_guest_never_sees_a_field_on_the_public_page_or_through_a_share_link(): void
    {
        $bookmark = $this->bookmark('საჯარო ბუკმარკი');
        $bookmark->forceFill(['visibility' => 'public'])->save();
        $this->save($bookmark, [
            ['label' => 'ღია ველი', 'value' => 'OPEN-VALUE-1'],
            ['label' => 'დახურული ველი', 'value' => 'SECRET-VALUE-2', 'is_secret' => true],
        ]);

        $this->user->forceFill(['profile_visibility' => 'public'])->save();
        $this->user->modules()->syncWithoutDetaching([Module::where('key', 'bookmark')->value('id') => ['is_public' => true]]);
        $url = $this->postJson('/api/share-links', ['domains' => ['bookmark' => ['scope' => 'ids', 'ids' => [$bookmark->id]]]])
            ->assertCreated()->json('data.url');
        $token = basename((string) $url);

        Auth::forgetGuards();

        $bodies = [
            $this->getJson('/api/public/profiles/lina/bookmark')->assertOk()->getContent(),
            $this->getJson("/api/public/profiles/lina/bookmark/{$bookmark->id}")->assertOk()->getContent(),
            $this->getJson("/api/public/shares/{$token}/bookmark")->assertOk()->getContent(),
            $this->getJson("/api/public/shares/{$token}/bookmark/{$bookmark->id}")->assertOk()->getContent(),
        ];

        foreach ($bodies as $body) {
            $this->assertStringContainsString('საჯარო ბუკმარკი', json_encode(json_decode($body), JSON_UNESCAPED_UNICODE));
            foreach (['OPEN-VALUE-1', 'SECRET-VALUE-2', 'ღია ველი', 'დახურული ველი', 'own_fields'] as $leak) {
                $this->assertStringNotContainsString($leak, json_encode(json_decode($body), JSON_UNESCAPED_UNICODE));
            }
        }

        // სტუმარს ველების მარშრუტი საერთოდ არ ეხსნება
        $this->getJson("/api/bookmarks/{$bookmark->id}/fields")->assertUnauthorized();
    }
}
