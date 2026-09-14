<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **აუდიტ-ლოგი (Tasks §4)**.
 *
 * აქ ის მოთხოვნებია მიმაგრებული, რომელთა დარღვევაც **ჩუმია** — კოდი
 * იმუშავებს, ლოგი კი ან არ ჩაიწერება, ან არასწორს ჩაწერს:
 *  · ჩაწერა observer-იდან მოდის, ე.ი. ერთი კონტროლერიც არ უნდა იცოდეს მასზე;
 *  · `update` **ძველსაც და ახალსაც** ინახავს, ერთი და იმავე გასაღებებით;
 *  · წაშლილის ლოგი ჩანაწერს გადაარჩენს (§4.2);
 *  · პაროლი ლოგში არასდროს ხვდება;
 *  · გასუფთავება `confirm`-ს ითხოვს და დაცულ რიგებს ვერ ეხება (§4.7).
 */
class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('alice');
        $this->admin = $this->makeUser('admin');
        $this->admin->assignRole('super_admin')->save();
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);

        $user->modules()->sync(
            Module::pluck('id')->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])->all()
        );

        return $user->refresh();
    }

    /** დამატება/რედაქტირება/წაშლა ავტომატურად იწერება — კონტროლერის კოდის გარეშე */
    public function test_model_changes_are_logged_with_both_sides(): void
    {
        $this->actingAs($this->user);

        $movie = Movie::create(['year' => 2021]);
        $movie->applyStatusKey('to_watch');
        $movie->save();
        // სათაური `movie_translations`-შია — ე.ი. ცალკე მოდელი, ცალკე ლოგი
        $movie->setTranslation('ka', ['title' => 'დიუნა']);

        $created = AuditLog::where('action', AuditLog::ACTION_CREATE)
            ->where('subject_type', 'movie')->where('subject_id', $movie->id)->first();

        $this->assertNotNull($created, 'დამატება ლოგში არ ჩაიწერა');
        $this->assertSame('movie', $created->module);
        $this->assertSame($this->user->id, $created->user_id);

        // ორენოვანი ტექსტიც იწერება და სახელიც ჩანს
        $translation = AuditLog::where('subject_type', 'movie_translation')
            ->where('action', AuditLog::ACTION_CREATE)->first();
        $this->assertSame('დიუნა', $translation->subject_label);
        $this->assertSame('movie', $translation->module);

        $movie->applyStatusKey('watched');
        $movie->save();

        $updated = AuditLog::where('action', AuditLog::ACTION_UPDATE)
            ->where('subject_type', 'movie')->where('subject_id', $movie->id)->latest('id')->first();

        // ⚠️ ორივე მხარე ერთი და იმავე გასაღებით — სწორედ ეს არის §4.1-ის
        // „ძველი და ახალი გვერდიგვერდ"
        $this->assertSame('to_watch', $updated->old_values['status']);
        $this->assertSame('watched', $updated->new_values['status']);
        $this->assertArrayNotHasKey('updated_at', $updated->new_values);

        $id = $movie->id;
        // ხელახლა წაკითხული ჩანაწერი თარგმანებით მოდის (`$with`), ე.ი. სახელიც ჩაიწერება
        Movie::find($id)->delete();

        $deleted = AuditLog::where('action', AuditLog::ACTION_DELETE)
            ->where('subject_type', 'movie')->where('subject_id', $id)->first();

        // §4.2 — ლოგმა ჩანაწერს უნდა გადაარჩინოს, ე.ი. შიგთავსიც უნდა ჰქონდეს
        $this->assertNull(Movie::find($id));
        $this->assertSame('watched', $deleted->old_values['status']);
        $this->assertSame('დიუნა', $deleted->subject_label);
    }

    /** ⚠️ მხოლოდ `updated_at`-ის შეხება ცარიელ „რედაქტირებას" არ ბადებს */
    public function test_touch_only_change_is_not_logged(): void
    {
        $this->actingAs($this->user);

        $movie = Movie::create(['title_ka' => 'ფილმი']);
        $before = AuditLog::where('action', AuditLog::ACTION_UPDATE)->count();

        $movie->touch();

        $this->assertSame($before, AuditLog::where('action', AuditLog::ACTION_UPDATE)->count());
    }

    /** ⚠️ პაროლის ჰეში ლოგში არასდროს ხვდება — ლოგი ადმინს უჩანს */
    public function test_password_never_reaches_the_log(): void
    {
        $this->actingAs($this->user);

        $this->user->update(['password' => 'another-secret', 'name' => 'ალისა']);

        $log = AuditLog::where('action', AuditLog::ACTION_UPDATE)
            ->where('subject_type', 'user')->latest('id')->first();

        $this->assertArrayNotHasKey('password', $log->new_values);
        $this->assertArrayNotHasKey('password', $log->old_values ?? []);
        $this->assertSame('ალისა', $log->new_values['name']);
    }

    /** შესვლა/გასვლა მოდელის მოვლენა არ არის და ცხადად იწერება */
    public function test_login_and_logout_are_logged(): void
    {
        // ⚠️ `withSession()` — login/logout სესიას ატრიალებს, ტესტის რექვესთს კი
        // session store მხოლოდ ცხადად ეძლევა (Sanctum-ის stateful კარიბჭე
        // Origin/Referer-ს იყურება, რაც ტესტში არ არსებობს)
        $this->withHeader('Referer', 'http://localhost')
            ->post('/api/auth/login', ['login' => 'alice', 'password' => 'password'])
            ->assertOk();

        $this->assertSame(1, AuditLog::where('action', AuditLog::ACTION_LOGIN)->count());

        $this->withHeader('Referer', 'http://localhost')->post('/api/auth/logout')->assertNoContent();

        $logout = AuditLog::where('action', AuditLog::ACTION_LOGOUT)->first();
        // ⚠️ სესიის გაუქმებამდე იწერება, თორემ „ვინ გავიდა" დაიკარგებოდა
        $this->assertSame($this->user->id, $logout->user_id);
    }

    /** სექციაში შესვლა (§4.1) — გამეორება ერთი წუთის ფანჯარაში იკარგება */
    public function test_visits_are_logged_once_per_minute(): void
    {
        $this->actingAs($this->user);

        $this->postJson('/api/audit/visit', ['path' => '/books'])->assertNoContent();
        $this->postJson('/api/audit/visit', ['path' => '/books'])->assertNoContent();

        $visits = AuditLog::where('action', AuditLog::ACTION_VISIT)->get();

        $this->assertCount(1, $visits);
        $this->assertSame('books', $visits->first()->route);
        // მოდული `modules.route_base`-იდან იგება და არა ხელით სიიდან
        $this->assertSame('book', $visits->first()->module);
    }

    /** ლოგის სექცია ადმინისაა; ჩვეულებრივი მომხმარებელი 403-ს იღებს */
    public function test_the_log_page_is_admin_only(): void
    {
        $this->actingAs($this->user)->getJson('/api/admin/audit')->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/admin/audit')->assertOk();
    }

    /** ფილტრები (§4.4) — მომხმარებელი × მოდული × მოქმედება, ერთდროულად */
    public function test_filters_narrow_the_list(): void
    {
        $this->actingAs($this->user);
        Movie::create(['title_ka' => 'ფილმი']);

        $this->actingAs($this->admin);

        $all = $this->getJson('/api/admin/audit')->json('meta.total');
        $mine = $this->getJson('/api/admin/audit?user_id='.$this->user->id.'&module=movie&action=create')
            ->json();

        $this->assertGreaterThan(0, $all);
        $this->assertSame(1, $mine['meta']['total']);
        $this->assertSame('create', $mine['data'][0]['action']);
    }

    /**
     * გასუფთავება (§4.7) — `confirm` სავალდებულოა და დაცული რიგები რჩება.
     */
    public function test_cleanup_requires_confirmation_and_spares_protected_rows(): void
    {
        $this->actingAs($this->user);
        Movie::create(['title_ka' => 'ფილმი']);

        // §4.6-ის რიგი — გასუფთავებას არ უნდა დაემორჩილოს
        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => AuditLog::ACTION_CHAT_DELETE,
            'module' => 'chat',
            'created_at' => now(),
        ]);

        $this->actingAs($this->admin);

        // დადასტურების გარეშე — 422
        $this->deleteJson('/api/admin/audit')->assertStatus(422);

        $plan = $this->getJson('/api/admin/audit/plan')->json();
        $this->assertSame(1, $plan['protected']);

        $deleted = $this->deleteJson('/api/admin/audit', ['confirm' => 'DELETE'])->json('deleted');

        $this->assertSame($plan['total'], $deleted);
        $this->assertSame(1, AuditLog::where('action', AuditLog::ACTION_CHAT_DELETE)->count());
    }

    /** მონიშნული რიგები (§4.7) — წაშლა ყოველთვის გაფილტრულის შიგნითაა */
    public function test_cleanup_can_target_selected_rows(): void
    {
        $this->actingAs($this->user);
        Movie::create(['title_ka' => 'ფილმი']);
        Movie::create(['title_ka' => 'მეორე']);

        $this->actingAs($this->admin);

        $ids = AuditLog::where('action', AuditLog::ACTION_CREATE)->pluck('id')->take(1)->all();
        $before = AuditLog::count();

        $deleted = $this->deleteJson('/api/admin/audit', ['confirm' => 'DELETE', 'ids' => $ids])
            ->json('deleted');

        $this->assertSame(1, $deleted);
        $this->assertSame($before - 1, AuditLog::count());
    }

    /**
     * **ჭრილების მთვლელები (ეტაპი 10)** — ბარათი/ტაბი იმ რიცხვს უნდა
     * აჩვენებდეს, რასაც მასზე დაჭერით მიიღებ.
     *
     * ⚠️ **მთავარი წესი: ჭრილი საკუთარ თავს არ ითვლის.** არჩეული მოდულით
     * დაფილტრულ პასუხშიც დანარჩენი მოდულების რიცხვები უნდა ჩანდეს,
     * თორემ არჩევის შემდეგ ყველა სხვა ბარათი ნულზე ჩამოვიდოდა და
     * „სხვაგან რა დევს" კითხვას ვეღარავინ უპასუხებდა.
     */
    public function test_summary_counts_every_cut_without_counting_itself(): void
    {
        $this->actingAs($this->user);
        Movie::create(['title_ka' => 'ფილმი']);
        Movie::create(['title_ka' => 'მეორე']);

        // სხვა მოდულის რიგი — ხელით, რომ ორი ჭრილი მაინც იყოს
        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => AuditLog::ACTION_CHAT_DELETE,
            'module' => 'chat',
            'created_at' => now(),
        ]);

        $this->actingAs($this->admin);

        $all = $this->getJson('/api/admin/audit/summary')->json();
        $modules = collect($all['modules'])->pluck('total', 'key');

        $this->assertSame(2, $modules['movie']);
        $this->assertSame(1, $modules['chat']);

        // მოდულზე გაფილტრულში მოქმედებები ვიწროვდება…
        $filtered = $this->getJson('/api/admin/audit/summary?module=movie')->json();
        $actions = collect($filtered['actions'])->pluck('total', 'key');
        $this->assertSame(2, $actions[AuditLog::ACTION_CREATE]);
        $this->assertArrayNotHasKey(AuditLog::ACTION_CHAT_DELETE, $actions->all());

        // …მოდულების რიცხვები კი უცვლელი რჩება (ჭრილი საკუთარ თავს არ ითვლის)
        $stillThere = collect($filtered['modules'])->pluck('total', 'key');
        $this->assertSame(2, $stillThere['movie']);
        $this->assertSame(1, $stillThere['chat']);

        $this->assertSame(2, $this->getJson('/api/admin/audit?module=movie')->json('meta.total'));
        $this->assertSame(2, $filtered['total']);
    }

    /**
     * **„მოდულის გარეშე" ჭრილი** — შესვლას/გასვლას `module` არ აქვს, ე.ი.
     * `whereIn`-ით მათამდე ფილტრით ვერასდროს მიხვიდოდი და ბარათების ჯამი
     * „ყველას" ვერასდროს გაუტოლდებოდა.
     */
    public function test_rows_without_a_module_are_their_own_cut(): void
    {
        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => AuditLog::ACTION_LOGIN,
            'module' => null,
            'created_at' => now(),
        ]);

        $this->actingAs($this->user);
        Movie::create(['title_ka' => 'ფილმი']);

        $this->actingAs($this->admin);

        $modules = collect($this->getJson('/api/admin/audit/summary')->json('modules'))
            ->pluck('total', 'key');

        $this->assertSame(1, $modules['none']);
        $this->assertSame(1, $modules['movie']);

        $rows = $this->getJson('/api/admin/audit?module=none')->json();
        $this->assertSame(1, $rows['meta']['total']);
        $this->assertNull($rows['data'][0]['module']);

        // ორი ჭრილი ერთად — `none` სხვა მოდულს არ თიშავს
        $this->assertSame(2, $this->getJson('/api/admin/audit?module=none,movie')->json('meta.total'));
    }

    /** მთვლელებიც ადმინის ზონაშია — `admin_access:audit`-ის მიღმა */
    public function test_the_summary_is_admin_only(): void
    {
        $this->actingAs($this->user)->getJson('/api/admin/audit/summary')->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/admin/audit/summary')->assertOk();
    }
}
