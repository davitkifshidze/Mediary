<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Bookmark;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **FEAT-06 — საკუთარი მონაცემების ექსპორტი.**
 *
 * ორი რამ მოწმდება, რაც ამ ფუნქციას ან ღირებულს ხდის, ან საშიშს:
 * ფაილში **მხოლოდ ჩემი** ჩანაწერებია, და ფაილის აღება ლოგში იწერება.
 */
class ExportTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = $this->makeUser('mona', ['movie', 'bookmark']);
        $this->other = $this->makeUser('otar', ['movie', 'bookmark']);
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    private function movieFor(User $user, string $title): Movie
    {
        $movie = Movie::create(['user_id' => $user->id, 'year' => 2020]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie->refresh();
    }

    /**
     * ერთადერთი რამ, რაც ამ ფუნქციაში მართლა შეიძლება ცუდად წავიდეს.
     *
     * ⚠️ `owner` scope-ს ვერ დავენდობოდით: `RecordExporter` რიგის worker-იდანაც
     * შეიძლება გაშვებულიყო (სადაც `Auth::id()` ცარიელია) და მაშინ **ყველა**
     * ანგარიშის ჩანაწერი ერთ ფაილში მოხვდებოდა. ამიტომ ორივე ფორმატი ცალკე
     * მოწმდება — ისინი ერთ query-ს იზიარებენ, მაგრამ სწორედ ამიტომ ღირს
     * იმის დადასტურება, რომ ჭრილი მართლა ერთია.
     */
    public function test_the_export_contains_only_my_own_records(): void
    {
        $this->movieFor($this->me, 'Mine');
        $this->movieFor($this->other, 'Not mine');

        $json = $this->actingAs($this->me)->get('/api/export/movie?format=json')
            ->assertOk()->streamedContent();

        $this->assertStringContainsString('Mine', $json);
        $this->assertStringNotContainsString('Not mine', $json);
        $this->assertCount(1, json_decode($json, true)['records']);

        $csv = $this->actingAs($this->me)->get('/api/export/movie?format=csv')
            ->assertOk()->streamedContent();

        $this->assertStringContainsString('Mine', $csv);
        $this->assertStringNotContainsString('Not mine', $csv);
    }

    /** ჩამოტვირთვა ლოგში: ვინ, რომელი მოდული, რამდენი ჩანაწერი */
    public function test_the_export_is_written_to_the_audit_log(): void
    {
        $this->movieFor($this->me, 'Logged');

        $this->actingAs($this->me)->get('/api/export/movie?format=csv')->assertOk();

        $row = AuditLog::where('action', AuditLog::ACTION_EXPORT)->firstOrFail();

        $this->assertSame($this->me->id, $row->user_id);
        $this->assertSame('movie', $row->module);
        $this->assertSame('csv', $row->new_values['format']);
        $this->assertSame(1, $row->new_values['records']);
    }

    /**
     * CSV-ის ორი თვისება, რომელთა გარეშეც ფაილი გამოუსადეგარია.
     *
     * ⚠️ BOM — უამისოდ Excel მხედრულს ჯღაბნად ხსნის.
     * ⚠️ ფორმულის ესკეიპინგი — ბუკმარკის სათაური **უცხო გვერდიდან** მოდის
     * (`LinkMetadata`), ე.ი. `=`-ით დაწყებული ტექსტი ჩვენ არ დაგვიწერია.
     */
    public function test_csv_starts_with_a_bom_and_never_hands_excel_a_formula(): void
    {
        Bookmark::create([
            'user_id' => $this->me->id,
            'title' => '=HYPERLINK("http://evil.example","click")',
            'url' => 'https://example.com/a',
            'domain' => 'example.com',
        ]);

        $csv = $this->actingAs($this->me)->get('/api/export/bookmark?format=csv')
            ->assertOk()->streamedContent();

        $this->assertStringStartsWith("\u{FEFF}", $csv);
        // სათაურების ხაზი — ველების სია ფაილშივეა
        $this->assertStringContainsString('title', explode("\n", $csv)[0]);
        // უჯრა ტექსტად იხსნება და არა ფორმულად
        $this->assertStringContainsString("'=HYPERLINK", $csv);
        $this->assertStringNotContainsString(',=HYPERLINK', $csv);
    }

    /** უარყოფითი რიცხვი ესკეიპინგს **არ** უნდა შეეწიროს */
    public function test_a_negative_number_stays_a_number(): void
    {
        $movie = $this->movieFor($this->me, 'Cold');
        $movie->forceFill(['year' => -100])->save();

        $csv = $this->actingAs($this->me)->get('/api/export/movie?format=csv')
            ->assertOk()->streamedContent();

        $this->assertStringContainsString('-100', $csv);
        $this->assertStringNotContainsString("'-100", $csv);
    }

    /** გამორთული მოდული არც ექსპორტში ჩანს — იგივე წესი, რაც საიდბარსა და ძებნაში */
    public function test_a_module_i_do_not_have_is_refused(): void
    {
        $this->actingAs($this->me)->get('/api/export/song?format=json')->assertStatus(403);
        $this->actingAs($this->me)->get('/api/export/nothing')->assertStatus(404);
    }

    /** სია: მხოლოდ ჩემი მოდულები, ჩემივე რიცხვებით */
    public function test_the_index_lists_my_modules_with_their_counts(): void
    {
        $this->movieFor($this->me, 'One');
        $this->movieFor($this->me, 'Two');
        $this->movieFor($this->other, 'Theirs');

        $data = $this->actingAs($this->me)->getJson('/api/export')->assertOk()->json('data');
        $keys = array_column($data, 'key');

        $this->assertSame(['movie', 'bookmark'], $keys);
        $this->assertSame(2, $data[0]['count']);
    }
}
