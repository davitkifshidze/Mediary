<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Trash\TrashBin;
use App\Support\AppSettings;
use App\Support\TrashDomain;
use App\Support\UserSettings;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * **ურნის ვადა თითო ანგარიშზე (Tasks §29, ეტაპი 6 — 29.6).**
 *
 * ⚠️ მოწმდება სამი რამ, რაც ჩუმად ტყდება: **გასუფთავება თითოეულს თავისი
 * ვადით წმენდს** (ერთი საერთო მუდმივა მოკლე ვადის პატრონს ძველს დაუტოვებდა,
 * გრძელისას კი ნაადრევად წაუშლიდა); **მნიშვნელობა იკვეცება** (`PUT
 * /auth/settings` ტიპს არ ამოწმებს); და **გაფრთხილება იმ მომენტზე ითვლის,
 * როცა გასუფთავება ნამდვილად გაეშვება** — და არა „ახლაზე".
 */
class TrashRetentionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        // ⚠️ დრო ცხადად — `nextPruneAt()` 03:30-ზე დგას, შუადღე კი მას ხვალ აყენებს
        Carbon::setTestNow(Carbon::parse('2026-09-28 12:00:00', config('app.timezone')));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function user(string $name, ?int $days = null): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->all());

        if ($days !== null) {
            $user->forceFill(['settings' => ['trashDays' => $days]])->save();
        }

        return $user->refresh();
    }

    /** ფილმი ურნაში — `$ago` წინ */
    private function trashed(User $owner, Carbon|string $ago): Movie
    {
        $movie = Movie::withoutGlobalScopes()->create(['user_id' => $owner->id, 'year' => 2001]);
        $movie->translations()->create(['locale' => 'en', 'title' => 'M'.$movie->id]);
        $movie->forceFill(['trashed_at' => is_string($ago) ? Carbon::parse($ago, config('app.timezone')) : $ago])->saveQuietly();

        return $movie;
    }

    private function exists(Movie $movie): bool
    {
        return Movie::withoutGlobalScopes()->whereKey($movie->id)->exists();
    }

    /** ⚠️ გასუფთავება თითოეულს თავისი ვადით წმენდს */
    public function test_prune_honours_each_accounts_own_retention(): void
    {
        $short = $this->user('short', 7);
        $plain = $this->user('plain');
        $long = $this->user('long', 60);

        $shortTen = $this->trashed($short, now()->subDays(10));
        $plainTen = $this->trashed($plain, now()->subDays(10));
        $plainForty = $this->trashed($plain, now()->subDays(40));
        $longForty = $this->trashed($long, now()->subDays(40));

        $this->artisan('trash:prune')->assertSuccessful();

        $this->assertFalse($this->exists($shortTen), '7 დღის ვადა — 10 დღის წინანდელი იშლება');
        $this->assertTrue($this->exists($plainTen), 'ნაგულისხმევი 30 — 10 დღის წინანდელი რჩება');
        $this->assertFalse($this->exists($plainForty), 'ნაგულისხმევი 30 — 40 დღის წინანდელი იშლება');
        $this->assertTrue($this->exists($longForty), '60 დღის ვადა — 40 დღის წინანდელი რჩება');
    }

    /** `--days` ყველას ერთ ვადას აძალებს — ხელით გაშვებისთვის */
    public function test_the_days_option_overrides_everyone(): void
    {
        $long = $this->user('long', 60);
        $movie = $this->trashed($long, now()->subDays(40));

        $this->artisan('trash:prune', ['--days' => 30])->assertSuccessful();

        $this->assertFalse($this->exists($movie));
    }

    /** ⚠️ მნიშვნელობა იკვეცება — ბლობი ტიპს არ ამოწმებს */
    public function test_the_setting_is_clamped(): void
    {
        $this->assertSame(TrashDomain::KEEP_DAYS, UserSettings::trashDays($this->user('none')));
        $this->assertSame(1, UserSettings::trashDays($this->user('zero', 0)));
        $this->assertSame(365, UserSettings::trashDays($this->user('huge', 9999)));

        $junk = $this->user('junk');
        $junk->forceFill(['settings' => ['trashDays' => 'soon']])->save();
        $this->assertSame(TrashDomain::KEEP_DAYS, UserSettings::trashDays($junk->refresh()));

        // ⚠️ ზედა ზღვარი ინსტალაციისაა — ნაგულისხმევიც მას ემორჩილება
        config(['mediary.trash.max_days' => 14]);
        $this->assertSame(14, UserSettings::trashDays($this->user('capped')));
        $this->assertSame(14, TrashDomain::defaultDays());
    }

    /** სია ანგარიშის ვადას ამბობს და დარჩენილ დღეებსაც მისით ითვლის */
    public function test_the_listing_uses_the_accounts_retention(): void
    {
        $me = $this->user('me', 7);
        $this->trashed($me, now()->subDays(2));

        $payload = $this->actingAs($me)->getJson('/api/trash')->assertOk()->json();

        $this->assertSame([7, 365], [$payload['keep_days'], $payload['max_days']]);
        $this->assertSame(5, $payload['data'][0]['items'][0]['expires_in_days']);
    }

    /**
     * ⚠️ **გაფრთხილება მომდევნო გასუფთავების მომენტზე ითვლის.** ახლა
     * 28-ის შუადღეა, გასუფთავება 29-ის 03:30-ზე გაეშვება; 24-ის შუაღამეს
     * წაშლილი 5-დღიანი ვადით სწორედ მაშინ წაიშლება, 6-დღიანით — არა.
     */
    public function test_the_preview_counts_what_the_next_prune_will_delete(): void
    {
        $me = $this->user('me');
        $this->trashed($me, '2026-09-24 00:00:00');
        $this->trashed($this->user('other', 1), '2026-09-01 00:00:00');

        $this->assertSame('2026-09-29 03:30', TrashBin::nextPruneAt()->format('Y-m-d H:i'));

        $this->actingAs($me)->getJson('/api/trash/retention?days=5')->assertOk()
            ->assertJsonPath('days', 5)
            ->assertJsonPath('saved_days', TrashDomain::KEEP_DAYS)
            ->assertJsonPath('expiring', 1);

        // ⚠️ სხვისი ურნა არ ითვლება
        $this->actingAs($me)->getJson('/api/trash/retention?days=6')->assertJsonPath('expiring', 0);

        // ვადის გარეშე — შენახული; დიაპაზონის გარეთ — ზღვარი
        $this->actingAs($me)->getJson('/api/trash/retention')->assertJsonPath('days', TrashDomain::KEEP_DAYS);
        $this->actingAs($me)->getJson('/api/trash/retention?days=0')->assertJsonPath('days', 1);
    }

    /**
     * **ზედა ზღვარს სუპერადმინი აწესებს** (Tasks §29.6 → §34.1) — ინსტალაციის
     * პარამეტრებში, და ის `config`-ს სჯობს. `null` ნაგულისხმევზე აბრუნებს.
     */
    public function test_a_super_admin_sets_the_ceiling_for_everyone(): void
    {
        $root = tap($this->user('root'), fn (User $u) => $u->assignRole('super_admin')->save())->refresh();
        $me = $this->user('me', 200);

        $this->actingAs($root)->putJson('/api/admin/settings/trash', ['max_days' => 60])
            ->assertOk()
            ->assertJsonPath('max_days', 60)
            ->assertJsonPath('default_max_days', 365);

        // ⚠️ უფრო გრძელი პირადი ვადა ზღვრამდე იკვეცება — ნაგულისხმევიც მას ემორჩილება
        $this->assertSame(60, UserSettings::trashDays($me));
        $this->actingAs($me)->getJson('/api/trash/retention')
            ->assertJsonPath('max_days', 60)
            ->assertJsonPath('days', 60);

        $this->actingAs($root)->putJson('/api/admin/settings/trash', ['max_days' => null])
            ->assertOk()
            ->assertJsonPath('max_days', 365);
        $this->assertFalse(AppSettings::has(TrashDomain::MAX_DAYS_SETTING));

        // ჭერი და ქვედა ზღვარი
        $this->actingAs($root)->putJson('/api/admin/settings/trash', ['max_days' => 0])->assertStatus(422);
        $this->actingAs($root)->putJson('/api/admin/settings/trash', ['max_days' => TrashDomain::MAX_DAYS_CEILING + 1])->assertStatus(422);
    }

    /** ⚠️ ყველა ანგარიშს ეხება — ჩვეულებრივ მომხმარებელს 403 */
    public function test_only_a_super_admin_changes_the_ceiling(): void
    {
        $this->actingAs($this->user('me'))->putJson('/api/admin/settings/trash', ['max_days' => 5])->assertStatus(403);

        $this->assertSame(365, TrashDomain::maxDays());
    }

    /** 03:30-ის შემდეგ მომდევნო გასუფთავება ხვალაა, მანამდე — დღეს */
    public function test_the_next_prune_is_today_before_the_hour_and_tomorrow_after(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-28 02:00:00', config('app.timezone')));
        $this->assertSame('2026-09-28 03:30', TrashBin::nextPruneAt()->format('Y-m-d H:i'));

        Carbon::setTestNow(Carbon::parse('2026-09-28 03:30:00', config('app.timezone')));
        $this->assertSame('2026-09-29 03:30', TrashBin::nextPruneAt()->format('Y-m-d H:i'));
    }
}
