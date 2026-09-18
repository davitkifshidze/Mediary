<?php

namespace Tests\Feature;

use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ადმინის მომხმარებლების სია ანგარიშების რიცხვზე არ არის დამოკიდებული**
 * (Tasks PERF-14).
 *
 * ⚠️ `index()` თითო მომხმარებელზე `StorageMeter::files()`-ს იძახებდა — ~30
 * query, პლუს დისკის `size()` იმ რიგებზე, რომელთაც ზომა ჩაწერილი არ აქვთ.
 * PERF-01/PERF-04-მა იმავე endpoint-ს N+1 მოხსნა (`module_user`, `roles`),
 * ეს ბლოკი კი დარჩა: 3 ანგარიშზე ~100 query, 30-ზე ~1000.
 *
 * ⚠️ **ტესტი ორ განსხვავებულ რაოდენობას ადარებს და არა ერთ მუდმივას**
 * (PERF-04-ის ფორმა): დღევანდელი რიცხვი ყოველი ახალი ველით შეიცვლება, ხოლო
 * „N-ზე არ არის დამოკიდებული" ზუსტად ის ფაქტია, რომელზეც ტასკია.
 */
class AdminUserListTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->admin = User::factory()->create([
            'role_id' => Role::where('key', 'super_admin')->value('id'),
        ]);
    }

    public function test_the_user_list_does_not_query_per_user(): void
    {
        Storage::fake('public');

        $count = function (int $users): int {
            User::factory()->count($users)->create()->each(function (User $u) {
                // ⚠️ ატვირთვის მქონე ანგარიშები — თორემ `files()` ცარიელ
                // ინვენტარზე იაფი იქნებოდა და ტესტი უაზროდ გაივლიდა
                Movie::create([
                    'user_id' => $u->id,
                    'poster_path' => "movies/posters/{$u->id}.jpg",
                    'poster_source' => 'upload',
                ]);
            });

            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs(User::find($this->admin->id))->getJson('/api/admin/users')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $few = $count(3);
        $many = $count(20);

        $this->assertSame($few, $many, 'query-ების რაოდენობა ანგარიშების რიცხვს მიჰყვება');
    }

    /**
     * ⚠️ **რიცხვები არ დაიკარგა.** სიას `used`/`quota` სჭირდება და ისინი
     * დაქეშილი მრიცხველიდან მოდიან (`users.storage_used_bytes`), ე.ი. query-ს
     * საერთოდ არ აკეთებენ — მხოლოდ სრული ინვენტარი (`files`/`bytes`/`modules`)
     * გადავიდა `show()`-ზე, სადაც ის ისედაც იკითხება.
     */
    public function test_the_list_still_reports_the_quota_and_the_used_bytes(): void
    {
        $user = User::factory()->create([
            'storage_used_bytes' => 4_242,
            'storage_quota_bytes' => 10_000,
        ]);

        $row = collect(
            $this->actingAs($this->admin)->getJson('/api/admin/users')->assertOk()->json('data')
        )->firstWhere('id', $user->id);

        $this->assertSame(4_242, $row['storage']['used']);
        $this->assertSame(10_000, $row['storage']['quota']);
    }

    /** …ხოლო ერთი ანგარიშის გვერდზე სრული ინვენტარი ისევ ბრუნდება */
    public function test_the_detail_page_still_reports_the_full_inventory(): void
    {
        Storage::fake('public');

        $user = User::factory()->create();
        Movie::create([
            'user_id' => $user->id,
            'poster_path' => 'movies/posters/one.jpg',
            'poster_source' => 'upload',
        ]);

        $storage = $this->actingAs($this->admin)
            ->getJson("/api/admin/users/{$user->id}")
            ->assertOk()
            ->json('storage');

        $this->assertSame(1, $storage['files']);
        $this->assertArrayHasKey('modules', $storage);
    }
}
