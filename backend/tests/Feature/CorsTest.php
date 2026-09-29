<?php

namespace Tests\Feature;

use App\Support\LoopbackOrigin;
use Tests\TestCase;

/**
 * CORS — SPA-ს origin-ი და მისი loopback-ტყუპი (2026-09-28).
 *
 * ⚠️ ტყუპის გარეშე `127.0.0.1:5173`-დან გახსნილ აპს ბრაუზერი ყველა
 * პასუხს უბლოკავს და login „სერვერს ვერ დავუკავშირდი"-ს წერს, თუმცა
 * სერვერი მუშაობს — ეს ტესტი სწორედ ამის დაბრუნებას იჭერს.
 */
class CorsTest extends TestCase
{
    public function test_the_config_allows_the_loopback_twin_of_the_frontend(): void
    {
        // ⚠️ `.env`-ზე არ არის დამოკიდებული: რაც არ უნდა ეწეროს FRONTEND_URL-ში,
        // კონფიგი ზუსტად ამ ფუნქციის პასუხი უნდა იყოს
        $this->assertSame(
            LoopbackOrigin::withTwin((string) env('FRONTEND_URL', 'http://localhost:5173')),
            config('cors.allowed_origins'),
        );
    }

    public function test_every_allowed_origin_is_echoed_and_a_stranger_is_not(): void
    {
        foreach (config('cors.allowed_origins') as $origin) {
            $this->withHeaders(['Origin' => $origin])
                ->get('/sanctum/csrf-cookie')
                ->assertHeader('Access-Control-Allow-Origin', $origin)
                ->assertHeader('Access-Control-Allow-Credentials', 'true');
        }

        $stranger = $this->withHeaders(['Origin' => 'http://evil.example'])->get('/sanctum/csrf-cookie');

        $this->assertNotSame('http://evil.example', $stranger->headers->get('Access-Control-Allow-Origin'));
    }
}
