<?php

namespace Tests\Feature;

use App\Models\Message;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ჩანაწერის გაზიარება ჩატში (FEAT-13).**
 *
 * ⚠️ **ორი ურთიერთსაპირისპირო ფაქტი იცავს ამ ფუნქციას:** გაზიარება
 * ხილვადობას **არ** ცვლის (პირადი ჩანაწერიდან მხოლოდ სათაური მიდის) —
 * და მაინც სასარგებლოა, რადგან „დაამატე ჩემთანაც" გლობალურ იდენტობაზე
 * დგას და არა ჩემი ბიბლიოთეკის ნომერზე.
 */
class ChatRecordTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private User $friend;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = $this->makeUser('sharer');
        $this->friend = $this->makeUser('reader');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);

        // ⚠️ ჩატში წერა ორივე პროფილის საჯაროობას ითხოვს (§16.3).
        // `create()`-ში ის არ გადის — სვეტი `fillable`-ში არაა.
        $user->forceFill(['profile_visibility' => 'public'])->save();
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    private function movie(string $title, int $tmdbId, string $visibility): Movie
    {
        $movie = Movie::create([
            'user_id' => $this->me->id,
            'tmdb_id' => $tmdbId,
            'year' => 1999,
            'visibility' => $visibility,
        ]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie->refresh();
    }

    /** საუბარი + გაგზავნილი ჩანაწერი */
    private function share(Movie $movie): array
    {
        $conversation = $this->actingAs($this->me)
            ->postJson("/api/chat/with/{$this->friend->username}")
            ->assertOk()
            ->json('id');

        $message = $this->actingAs($this->me)
            ->postJson("/api/chat/{$conversation}", [
                'domain' => 'movie',
                'record_id' => $movie->id,
            ])
            ->assertCreated()
            ->json('data');

        return [$conversation, $message];
    }

    /** ⚠️ პირადი ჩანაწერიდან მიმღებამდე **მხოლოდ სათაური** მიდის */
    public function test_a_private_record_shows_only_its_title(): void
    {
        $movie = $this->movie('Secret', 500, 'private');
        [$id] = $this->share($movie);

        $thread = $this->actingAs($this->friend)
            ->getJson("/api/chat/{$id}")
            ->assertOk()
            ->json('data');

        $shared = $thread[0]['record'];

        $this->assertSame('movie', $shared['domain']);
        $this->assertSame('Secret', $shared['title']);
        $this->assertNull($shared['card'], 'პირადი ჩანაწერის ბარათი გაჟონა');
        // იდენტობა მაინც მიდის — მის გარეშე „დამატება" ვერაფერს იპოვიდა
        $this->assertSame(500, $shared['identity']['tmdb_id']);
    }

    /** საჯარო ჩანაწერი სრული ბარათით ჩანს */
    public function test_a_public_record_shows_the_full_card(): void
    {
        $this->me->modules()->updateExistingPivot(
            Module::where('key', 'movie')->value('id'),
            ['is_public' => true],
        );

        $movie = $this->movie('Shared', 501, 'public');
        [$id] = $this->share($movie);

        $shared = $this->actingAs($this->friend)
            ->getJson("/api/chat/{$id}")
            ->assertOk()
            ->json('data.0.record');

        $this->assertNotNull($shared['card'], 'საჯარო ჩანაწერს ბარათი არ აქვს');
        $this->assertSame($movie->id, $shared['card']['id']);
    }

    /**
     * ⚠️ **ავტორი ყოველთვის ხედავს საკუთარ ბარათს** — მისივე ჩანაწერის
     * დამალვა თავისივე თავისგან უაზრობაა და გაგზავნის პასუხს გაატყუებდა.
     */
    public function test_the_author_always_sees_the_card(): void
    {
        $movie = $this->movie('Mine', 502, 'private');
        [, $message] = $this->share($movie);

        $this->assertNotNull($message['record']['card']);
    }

    /** „დაამატე ჩემთანაც" ქმნის ჩანაწერს მიმღების ბიბლიოთეკაში */
    public function test_saving_creates_the_record_in_my_library(): void
    {
        $movie = $this->movie('Copy me', 503, 'private');
        [, $message] = $this->share($movie);

        $this->actingAs($this->friend)
            ->postJson("/api/chat/messages/{$message['id']}/save")
            ->assertOk()
            ->assertJson(['created' => true, 'domain' => 'movie']);

        $this->assertDatabaseHas('movies', [
            'user_id' => $this->friend->id,
            'tmdb_id' => 503,
        ]);
    }

    /**
     * ⚠️ **მეორედ დამატება ახალ რიგს არ ქმნის.** დუბლიკატი უნიკალურობას
     * არ არღვევს (`imdb_id` per-user-ია), სამაგიეროდ მატჩინგი (§16.2)
     * ერთსა და იმავე ფილმს ორჯერ დაითვლიდა.
     */
    public function test_saving_twice_does_not_duplicate(): void
    {
        $movie = $this->movie('Once', 504, 'private');
        [, $message] = $this->share($movie);

        $this->actingAs($this->friend)->postJson("/api/chat/messages/{$message['id']}/save")->assertOk();
        $this->actingAs($this->friend)
            ->postJson("/api/chat/messages/{$message['id']}/save")
            ->assertOk()
            ->assertJson(['created' => false]);

        $this->assertSame(1, Movie::withoutGlobalScope('owner')->where('user_id', $this->friend->id)->count());
    }

    /** სხვისი ჩანაწერის გაზიარება შეუძლებელია — 404, და არა 403 */
    public function test_i_cannot_share_someone_elses_record(): void
    {
        $theirs = Movie::create(['user_id' => $this->friend->id, 'tmdb_id' => 505]);

        $conversation = $this->actingAs($this->me)
            ->postJson("/api/chat/with/{$this->friend->username}")
            ->json('id');

        $this->actingAs($this->me)
            ->postJson("/api/chat/{$conversation}", [
                'domain' => 'movie',
                'record_id' => $theirs->id,
            ])
            ->assertStatus(404);
    }

    /**
     * ⚠️ **ჩანიშვნა ვერ გაიზიარება** (§16.5) — მოდული პირად დოკუმენტებს
     * ინახავს და `PublicDomain::MATCH`-ში არასდროს ყოფილა; ვალიდაცია
     * ამიტომ თვითონვე კეტავს კარს.
     */
    public function test_a_note_cannot_be_shared(): void
    {
        $conversation = $this->actingAs($this->me)
            ->postJson("/api/chat/with/{$this->friend->username}")
            ->json('id');

        $this->actingAs($this->me)
            ->postJson("/api/chat/{$conversation}", ['domain' => 'note', 'record_id' => 1])
            ->assertStatus(422);
    }

    /** ჩვეულებრივი ტექსტი უცვლელად მუშაობს */
    public function test_plain_text_still_works(): void
    {
        $conversation = $this->actingAs($this->me)
            ->postJson("/api/chat/with/{$this->friend->username}")
            ->json('id');

        $this->actingAs($this->me)
            ->postJson("/api/chat/{$conversation}", ['body' => 'hello'])
            ->assertCreated()
            ->assertJsonPath('data.type', 'text')
            ->assertJsonPath('data.record', null);

        $this->assertSame(1, Message::count());
    }
}
