<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Support\Redact;
use App\Support\SourceLog;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * **გასაღები არც პასუხში ჩანს და არც ლოგში** (Tasks SEC-14).
 *
 * ⚠️ **პრობლემა ჩვენი ტექსტი არ იყო — Guzzle-ისა იყო.** კავშირის ჩავარდნაზე
 * ის გამონაკლისს **სრულ URL-ს** უწერს (`… for https://api.themoviedb.org/3/…?api_key=…`),
 * `LookupController` კი მას პირდაპირ 502-ის `message`-ად აბრუნებდა და
 * `SourceLog::threw()` `sources.log`-ში წერდა. ე.ი. ერთი timeout საერთო
 * (`.env`) გასაღებს ნებისმიერ შესულ მომხმარებელს აჩვენებდა.
 *
 * ⚠️ ტესტი **სხეულს grep-ავს** და არა `message`-ის ტოლობას: სწორედ ის იყო
 * გასატეხი, რომ გასაღები პასუხში *სადმე* არ მოხვდეს.
 */
class SecretRedactionTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'tmdb-secret-abc123';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        config()->set('services.tmdb.key', self::KEY);

        $this->user = User::create([
            'name' => 'redact',
            'username' => 'redact',
            'email' => 'redact@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());
        $this->user->refresh();
    }

    /** Guzzle-ის სტილის ტექსტი — ზუსტად ის, რასაც `CurlFactory` აწყობს */
    private function guzzleStyleMessage(): string
    {
        return 'cURL error 28: Operation timed out for https://api.themoviedb.org/3/search/movie'
            .'?api_key='.self::KEY.'&query=matrix&language=en-US';
    }

    public function test_a_connection_failure_never_returns_the_api_key(): void
    {
        Http::fake(fn () => throw new ConnectionException($this->guzzleStyleMessage()));

        $response = $this->actingAs($this->user)
            ->postJson('/api/lookup/candidates', ['type' => 'movie', 'query' => 'matrix']);

        $response->assertStatus(502)->assertJson(['message' => 'tmdb_error']);
        $this->assertStringNotContainsString(self::KEY, $response->getContent());
    }

    public function test_a_connection_failure_never_returns_the_api_key_from_discover(): void
    {
        Http::fake(fn () => throw new ConnectionException($this->guzzleStyleMessage()));

        $response = $this->actingAs($this->user)
            ->getJson('/api/discover?type=movie&query=matrix');

        $response->assertStatus(502)->assertJson(['message' => 'tmdb_error']);
        $this->assertStringNotContainsString(self::KEY, $response->getContent());
    }

    public function test_the_source_log_masks_the_query(): void
    {
        $written = [];
        Log::shouldReceive('channel')->andReturnSelf();
        Log::shouldReceive('warning')->andReturnUsing(function (string $message, array $context = []) use (&$written) {
            $written[] = $message.' '.json_encode($context);
        });

        SourceLog::threw('tmdb', new ConnectionException($this->guzzleStyleMessage()), [
            'path' => '/3/search/movie?api_key='.self::KEY,
        ]);

        $line = implode("\n", $written);
        $this->assertStringNotContainsString(self::KEY, $line);
        $this->assertStringContainsString('api_key='.Redact::MASK, $line);
        // ⚠️ დიაგნოსტიკა უნდა დარჩეს — query მთლიანად არ იჭრება
        $this->assertStringContainsString('query=matrix', $line);
    }

    public function test_a_telegram_token_is_masked_in_a_path(): void
    {
        $text = 'cURL error 7 for https://api.telegram.org/bot123456:AAH-secret_Token/sendMessage';

        $this->assertStringNotContainsString('AAH-secret_Token', Redact::secrets($text));
        $this->assertStringContainsString('/bot'.Redact::MASK, Redact::secrets($text));
    }

    public function test_credentials_in_the_host_are_masked(): void
    {
        $this->assertSame(
            'https://'.Redact::MASK.'@example.com/x',
            Redact::secrets('https://user:pass@example.com/x'),
        );
    }

    public function test_an_ordinary_message_is_left_alone(): void
    {
        $text = 'HTTP 401: The API key is not found.';

        $this->assertSame($text, Redact::secrets($text));
    }
}
