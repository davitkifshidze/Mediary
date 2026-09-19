<?php

namespace Tests\Feature;

use App\Http\Middleware\SetSecurityHeaders;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **უსაფრთხოების ჰედერები ყოველ პასუხზე (Tasks SEC-16).**
 *
 * ⚠️ ტესტი **ავტორიზაციის გარეშე** და **404-ზეც** ამოწმებს: `SetSecurityHeaders`
 * `append`-ითაა დარეგისტრირებული სწორედ იმიტომ, რომ ჯგუფის middleware
 * throttle/auth-ის უარყოფით პასუხებს ვერ ფარავს — ე.ი. „მხოლოდ 200-ზე მუშაობს"
 * ზუსტად ის ხარვეზია, რომლის დაჭერაც აქ გვინდა.
 */
class SecurityHeadersTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function pathProvider(): array
    {
        return [
            'health' => ['/api/health'],
            'unknown route' => ['/api/does-not-exist'],
            'auth required' => ['/api/movies'],
        ];
    }

    #[DataProvider('pathProvider')]
    public function test_every_response_carries_the_security_headers(string $path): void
    {
        $response = $this->getJson($path);

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('Content-Security-Policy', "frame-ancestors 'none'");
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    }

    /**
     * ⚠️ ფლეერისა და ლაითბოქსის ფუნქციები `Permissions-Policy`-ში **არ** უნდა იყოს:
     * `autoplay=()` ფლეერს გააჩუმებდა, `fullscreen=()` — ლაითბოქსს,
     * `clipboard-write=()` კი გასაღების კოპირებას (`SecretInput`).
     */
    public function test_the_permissions_policy_never_disables_a_live_feature(): void
    {
        $policy = $this->getJson('/api/health')->headers->get('Permissions-Policy');

        foreach (['autoplay', 'fullscreen', 'encrypted-media', 'picture-in-picture', 'clipboard-write', 'accelerometer'] as $feature) {
            $this->assertStringNotContainsString($feature, (string) $policy);
        }
    }

    /**
     * უკვე დაყენებულ ჰედერს middleware არ ცვლის — `SafeMime::response()` თავის
     * `nosniff`-ს თვითონ წერს და ორმაგი ჩაწერა მის გარანტიას გადაფარავდა.
     */
    public function test_an_already_set_header_is_left_alone(): void
    {
        $response = (new SetSecurityHeaders)->handle(
            Request::create('/api/health'),
            function () {
                $r = new Response('ok');
                $r->headers->set('Referrer-Policy', 'no-referrer');

                return $r;
            }
        );

        $this->assertSame('no-referrer', $response->headers->get('Referrer-Policy'));
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
    }
}
