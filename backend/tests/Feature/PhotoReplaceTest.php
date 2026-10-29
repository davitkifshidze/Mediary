<?php

namespace Tests\Feature;

use App\Models\TrashedFile;
use App\Models\User;
use App\Support\StorageFolder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **მთავარი ფოტოს შეცვლა: ჯერ ახალი ფაილი, მერე ძველი ურნაში.**
 *
 * ⚠️ თუ ახალი ფაილი ვერ ჩაიწერა (413 — კვოტა), ძველი ცოცხალი რჩება და ურნაში
 * არ ხვდება: ურნის ვადის გასვლაზე ის დისკიდან წაიშლებოდა და ჩანაწერი გატყდებოდა.
 */
class PhotoReplaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_rejected_upload_leaves_the_current_avatar_live_and_out_of_the_trash(): void
    {
        Storage::fake('public');
        $user = User::create(['name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password']);

        $this->actingAs($user)
            ->post('/api/auth/profile', ['_method' => 'PATCH', 'avatar' => UploadedFile::fake()->image('a.jpg')], ['Accept' => 'application/json'])
            ->assertOk();
        $old = (string) $user->refresh()->avatar_path;
        $this->assertStringStartsWith(StorageFolder::AVATARS, $old);

        // კვოტა სავსეა — ახალი ფაილი 413-ით ვარდება
        $user->forceFill(['storage_quota_bytes' => 1, 'storage_used_bytes' => 1])->save();

        $this->actingAs($user->refresh())
            ->post('/api/auth/profile', ['_method' => 'PATCH', 'avatar' => UploadedFile::fake()->image('b.jpg')->size(10)], ['Accept' => 'application/json'])
            ->assertStatus(413);

        $this->assertSame($old, $user->refresh()->avatar_path);
        Storage::disk('public')->assertExists($old);
        $this->assertSame(0, TrashedFile::withoutGlobalScopes()->where('path', $old)->count());
    }
}
