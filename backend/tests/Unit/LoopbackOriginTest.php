<?php

namespace Tests\Unit;

use App\Support\LoopbackOrigin;
use PHPUnit\Framework\TestCase;

/**
 * `localhost` ↔ `127.0.0.1` — SPA-ს origin-ის loopback-ტყუპი CORS-ისთვის.
 */
class LoopbackOriginTest extends TestCase
{
    public function test_localhost_gets_its_ipv4_twin(): void
    {
        $this->assertSame(
            ['http://localhost:5173', 'http://127.0.0.1:5173'],
            LoopbackOrigin::withTwin('http://localhost:5173'),
        );
    }

    public function test_ipv4_loopback_gets_localhost(): void
    {
        $this->assertSame(
            ['https://127.0.0.1', 'https://localhost'],
            LoopbackOrigin::withTwin('https://127.0.0.1'),
        );
    }

    public function test_a_real_host_gets_no_twin(): void
    {
        $this->assertSame(['http://mediary.local'], LoopbackOrigin::withTwin('http://mediary.local'));
        $this->assertSame(['https://example.com'], LoopbackOrigin::withTwin('https://example.com'));
        // ⚠️ `localhost`-ით დაწყებული ჰოსტი loopback არ არის
        $this->assertSame(['http://localhost.example.com'], LoopbackOrigin::withTwin('http://localhost.example.com'));
    }

    public function test_an_unparsable_value_is_left_alone(): void
    {
        $this->assertSame([''], LoopbackOrigin::withTwin(''));
    }
}
