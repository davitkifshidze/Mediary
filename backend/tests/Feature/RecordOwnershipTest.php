<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureRecordOwnership;
use App\Models\CastMember;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Models\VideoFile;
use App\Policies\OwnedRecordPolicy;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;

/**
 * **მფლობელობის მეორე ფენა (აუდიტი 2026-09-14, §A5).**
 *
 * ⚠️ **ტესტი middleware-ს პირდაპირ იძახებს და არა HTTP-ით — და ეს არსებითია.**
 * ჩვეულებრივ მოთხოვნაზე სხვისი ჩანაწერი ისედაც 404-ია, რადგან
 * `BelongsToUser`-ის global scope მას route-model binding-ზევე მალავს. ე.ი.
 * HTTP-ტესტი **ვერასდროს დაამტკიცებდა**, რომ მეორე ფენა მუშაობს — ის
 * პირველივეს პასუხს დაინახავდა და მწვანე იქნებოდა მაშინაც, როცა policy-ები
 * საერთოდ არ გამოიძახება (ზუსტად ის მდგომარეობა, რომელიც აუდიტმა იპოვა).
 * აქ მოდელი **ცხადად, scope-ის გარეშე** იტვირთება — ე.ი. ზუსტად ის
 * სიტუაცია, რომლისთვისაც ეს ფენა არსებობს.
 */
class RecordOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    /** middleware-ის გატარება მიბმული მოდელით — HTTP-ის სტეკის გარეშე */
    private function pass(User $actor, object $bound, string $method = 'GET'): bool
    {
        $request = Request::create('/api/test', $method);
        $request->setUserResolver(fn () => $actor);

        $route = new Route([$method], '/api/test', fn () => null);
        $route->parameters = ['record' => $bound];
        $request->setRouteResolver(fn () => $route);

        try {
            (new EnsureRecordOwnership)->handle($request, fn () => response()->noContent());
        } catch (NotFoundHttpException) {
            return false;
        }

        return true;
    }

    /* ================= policy-იანი მოდელი ================= */

    /**
     * **მთავარი წესი:** სხვისი ჩანაწერი არ გადის მაშინაც კი, როცა
     * `owner` scope-მა ის დააბრუნა.
     */
    public function test_another_users_record_is_refused_even_without_the_scope(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 2020]);

        $this->assertTrue($this->pass($this->alice, $movie));
        $this->assertFalse($this->pass($this->bob, $movie));
    }

    /** სამივე მოქმედება ერთნაირად იკეტება — GET, PATCH და DELETE */
    public function test_every_verb_is_covered(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 2020]);

        foreach (['GET', 'PATCH', 'DELETE'] as $method) {
            $this->assertFalse($this->pass($this->bob, $movie, $method), $method);
            $this->assertTrue($this->pass($this->alice, $movie, $method), $method);
        }
    }

    /**
     * ⚠️ **სუპერ-ადმინი გადის `Gate::before`-ით** და არა middleware-ის
     * ცალკე პირობით — თორემ წესი ორ ადგილას იქნებოდა ჩაწერილი.
     */
    public function test_a_super_admin_passes(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 2020]);

        $admin = $this->makeUser('root');
        $admin->assignRole('super_admin')->save();

        $this->assertTrue($this->pass($admin->refresh(), $movie));
    }

    /* ================= policy-ის გარეშე, მაგრამ მფლობელიანი ================= */

    /**
     * ⚠️ **სექციების ცხრილებს policy არ აქვთ და არც უნდა ჰქონდეთ** — ორმოცი
     * თითქმის ცარიელი ფაილი იქნებოდა. მათ `BelongsToUser` ამოწმებს, და
     * სწორედ იქ არის ხვრელი ყველაზე ნაკლებად შესამჩნევი.
     */
    public function test_a_section_file_without_a_policy_is_still_checked(): void
    {
        $this->assertNull(Gate::getPolicyFor(VideoFile::class), 'VideoFile-ს policy არ უნდა ჰქონდეს');

        $video = $this->alice->videos()->create([
            'title' => 'ვიდეო',
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'platform' => 'youtube',
            'external_id' => 'dQw4w9WgXcQ',
        ]);

        $file = VideoFile::create([
            'user_id' => $this->alice->id,
            'video_id' => $video->id,
            'kind' => 'doc',
            'path' => 'videos/files/docs/x.pdf',
            'size' => 10,
        ]);

        $this->assertTrue($this->pass($this->alice, $file));
        $this->assertFalse($this->pass($this->bob, $file));
    }

    /* ================= გამონაკლისები ================= */

    /**
     * ⚠️ **გლობალური ლექსიკონი ყველას ეკუთვნის.** მსახიობი ერთი რიგია ყველა
     * ანგარიშისთვის — მისი „მფლობელობაზე" შემოწმება მთელ `/cast/*`-ს დაკეტავდა.
     */
    public function test_a_global_dictionary_row_is_not_ownership_checked(): void
    {
        $cast = CastMember::create(['tmdb_person_id' => 1, 'name' => 'Keanu Reeves']);

        $this->assertTrue($this->pass($this->alice, $cast));
        $this->assertTrue($this->pass($this->bob, $cast));
    }

    /** არა-მოდელური პარამეტრი (`{type}`, `{domain}`) უბრალოდ გამოტოვებულია */
    public function test_plain_route_parameters_are_ignored(): void
    {
        $this->assertTrue($this->pass($this->alice, new \stdClass));
    }

    /* ================= HTTP-ის მხარე ================= */

    /**
     * ორმაგი ღობე ერთმანეთს არ ეწინააღმდეგება: ჩვეულებრივი მოთხოვნა
     * მფლობელისთვის ისევ მუშაობს.
     */
    public function test_the_owner_can_still_open_their_own_record(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 2020]);
        $movie->setTranslation('en', ['title' => 'Matrix']);

        $this->actingAs($this->alice)->getJson("/api/movies/{$movie->id}")->assertOk();
        // ⚠️ სხვისი ჩანაწერი **404-ია და არა 403** — „ეს ჩანაწერი არსებობს"
        // თვითონაც ინფორმაციაა (პროექტის არსებული წესი)
        $this->actingAs($this->bob)->getJson("/api/movies/{$movie->id}")->assertStatus(404);
    }

    /* ================= რეესტრის თანმიმდევრულობა ================= */

    /**
     * ⚠️ **ყველა policy საერთო ბაზისზე უნდა იდგეს.** თუ ვინმე დაწერს
     * policy-ს, რომელსაც, მაგალითად, `view` არ აქვს, `Gate::allows()`
     * false-ს დააბრუნებს და **მთელი მოდული ჩუმად 404 გახდება**. ეს
     * ტესტი ამ რისკს გაშვების დროიდან ტესტში გადმოაქვს.
     */
    public function test_every_policy_extends_the_shared_base(): void
    {
        $files = glob(app_path('Policies/*.php'));
        $this->assertNotEmpty($files);

        foreach ($files as $file) {
            $class = 'App\\Policies\\'.basename($file, '.php');

            if ($class === OwnedRecordPolicy::class) {
                continue;
            }

            $this->assertTrue(
                is_subclass_of($class, OwnedRecordPolicy::class),
                "{$class} არ ეყრდნობა OwnedRecordPolicy-ს",
            );

            foreach (['view', 'update', 'delete'] as $ability) {
                $this->assertTrue(method_exists($class, $ability), "{$class}::{$ability}()");
            }
        }
    }

    /**
     * ⚠️ **policy-ის მოდელი მართლა უნდა არსებობდეს.** Laravel policy-ს
     * სახელით პოულობს; შეცდომით დაწერილი `MovyPolicy` ჩუმად არასდროს
     * გამოიძახებოდა — ზუსტად ისეთივე უხილავი, როგორიც მთელი ეს ფენა იყო.
     */
    public function test_every_policy_matches_an_existing_model(): void
    {
        foreach (glob(app_path('Policies/*.php')) as $file) {
            $name = basename($file, '.php');

            if ($name === 'OwnedRecordPolicy') {
                continue;
            }

            $model = 'App\\Models\\'.preg_replace('/Policy$/', '', $name);

            $this->assertTrue(class_exists($model), "{$name} — {$model} არ არსებობს");
            $this->assertInstanceOf(
                OwnedRecordPolicy::class,
                Gate::getPolicyFor($model),
                "{$model}-ს policy არ ებმევა",
            );
        }
    }
}
