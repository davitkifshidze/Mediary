<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\User;
use App\Models\Video;
use Database\Seeders\GenresSeeder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **`mediary:seed-demo`** (Tasks FEAT-02).
 *
 * ⚠️ SEC-01-მდე „სწრაფი აწყობა" კომიტებულ პროდ-dump-ს ეყრდნობოდა; მისი
 * ამოღების შემდეგ ახალი კლონი **სრულიად ცარიელ** აპს იღებდა. ეს ბრძანება
 * იმავე შედეგს იძლევა პერსონალური მონაცემის გარეშე.
 */
class SeedDemoCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->seed(GenresSeeder::class);
    }

    /** ცარიელი ბაზა → სამუშაო აპი */
    public function test_it_fills_every_module(): void
    {
        $this->artisan('mediary:seed-demo')->assertSuccessful();

        $demo = User::where('email', 'demo@example.com')->firstOrFail();

        // ⚠️ `owner` scope CLI-ს გარეთ `Auth::id()`-ს კითხულობს — აქ ცხადად ვთიშავთ
        $this->assertSame(3, Movie::withoutGlobalScope('owner')->where('user_id', $demo->id)->count());
        $this->assertSame(2, Video::withoutGlobalScope('owner')->where('user_id', $demo->id)->count());
        $this->assertSame(1, NoteEntry::withoutGlobalScope('owner')->where('user_id', $demo->id)->count());
        $this->assertSame(1, Bookmark::withoutGlobalScope('owner')->where('user_id', $demo->id)->count());

        // ყველა აქტიური მოდული ჩართულია, თორემ სექციები საიდბარში არ გამოჩნდება
        $this->assertSame(
            Module::where('is_active', true)->count(),
            $demo->modules()->count(),
        );
    }

    /**
     * ⚠️ **სავალდებულო ველები შევსებულია** — ე.ი. ჩანაწერები იმ წესს
     * ემორჩილება, რასაც ფორმები (2026-09-16: სტატუსი და „ტიპი"
     * სავალდებულოა). უამისოდ დემო-მონაცემი ისეთ მდგომარეობას აჩვენებდა,
     * რომელსაც აპი აღარ უშვებს.
     */
    public function test_seeded_records_satisfy_the_required_fields(): void
    {
        $this->artisan('mediary:seed-demo')->assertSuccessful();

        foreach (Movie::withoutGlobalScope('owner')->get() as $movie) {
            $this->assertNotNull($movie->status_id, 'ფილმს სტატუსი აკლია');
            $this->assertNotEmpty($movie->genres, 'ფილმს ჟანრი აკლია');
            $this->assertNotEmpty($movie->title_en);
            $this->assertNotEmpty($movie->title_ka);
        }

        foreach (Video::withoutGlobalScope('owner')->get() as $video) {
            $this->assertNotNull($video->status_id);
            $this->assertNotNull($video->type_id, 'ვიდეოს ტიპი აკლია');
        }
    }

    /**
     * ⚠️ **ხელახლა გაშვება დუბლიკატებს არ ქმნის.** ბრძანება იმას სჭირდება,
     * ვინც ახალ მოდულს ამატებს — ე.ი. ის მრავალჯერ გაეშვება.
     */
    public function test_running_it_twice_adds_nothing(): void
    {
        $this->artisan('mediary:seed-demo')->assertSuccessful();
        $before = Movie::withoutGlobalScope('owner')->count();

        $this->artisan('mediary:seed-demo')->assertSuccessful();

        $this->assertSame($before, Movie::withoutGlobalScope('owner')->count());
        $this->assertSame(1, User::where('email', 'demo@example.com')->count());
    }

    /**
     * ⚠️ **პერსონალური მონაცემი არსად**: ელფოსტა `example.com`-ზეა
     * (RFC 2606) — სწორედ ეს განასხვავებს მას იმ dump-ისგან, რომელიც
     * SEC-01-მა ამოიღო.
     */
    public function test_the_demo_account_carries_no_real_identity(): void
    {
        $this->artisan('mediary:seed-demo')->assertSuccessful();

        $demo = User::where('username', 'demo')->firstOrFail();

        $this->assertStringEndsWith('@example.com', $demo->email);
        $this->assertFalse($demo->isSuperAdmin(), 'დემო-ანგარიში სუპერ-ადმინი არ უნდა იყოს');
    }
}
