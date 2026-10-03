<?php

namespace Tests\Feature;

use App\Services\Places\RouteClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **OSRM-ის კლიენტი** (Tasks §30.5).
 *
 * ⚠️ `Http::fake()` **ერთი stub-ით** და ცვლადი პასუხით — `Factory::fake()`
 * stub-ებს ამატებს და არა ცვლის (`PlaceModuleTest`-ის იგივე გაკვეთილი).
 */
class RouteClientTest extends TestCase
{
    use RefreshDatabase;

    private array $answer = [];

    private int $status = 200;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        Http::fake(['*' => fn () => Http::response($this->answer, $this->status)]);
    }

    /** OSRM-ის ერთი მარშრუტი */
    private function route(float $distance, float $duration, string $geometry = '_p~iF~ps|U_ulLnnqC', string $summary = 'Rustaveli Avenue'): array
    {
        return ['distance' => $distance, 'duration' => $duration, 'geometry' => $geometry, 'legs' => [['summary' => $summary]]];
    }

    public function test_routes_are_normalised_and_alternatives_are_kept(): void
    {
        $this->answer = ['code' => 'Ok', 'routes' => [$this->route(12345.6, 900.4), $this->route(13000, 1000, 'abc', '')]];

        $routes = app(RouteClient::class)->routes(41.7, 44.8, 41.71, 44.79, 'driving');

        $this->assertCount(2, $routes);
        $this->assertSame(['index' => 0, 'distance_m' => 12346, 'duration_s' => 900, 'geometry' => '_p~iF~ps|U_ulLnnqC', 'summary' => 'Rustaveli Avenue'], $routes[0]);
        // ცარიელი summary → null, ინდექსი რიგისაა
        $this->assertSame(1, $routes[1]['index']);
        $this->assertNull($routes[1]['summary']);

        // ⚠️ OSRM-ს `lng,lat` რიგით უნდა; ალტერნატივები და polyline ცხადადაა მოთხოვნილი
        Http::assertSent(fn ($r) => str_contains($r->url(), '/route/v1/driving/44.800000,41.700000;44.790000,41.710000')
            && str_contains($r->url(), 'alternatives=true')
            && str_contains($r->url(), 'geometries=polyline'));
    }

    public function test_a_successful_answer_is_cached_and_a_profile_change_is_not(): void
    {
        $this->answer = ['code' => 'Ok', 'routes' => [$this->route(100, 60)]];
        $client = app(RouteClient::class);

        $client->routes(41.7, 44.8, 41.71, 44.79, 'driving');
        $client->routes(41.70001, 44.80001, 41.71, 44.79, 'driving');
        Http::assertSentCount(1);

        $client->routes(41.7, 44.8, 41.71, 44.79, 'foot');
        Http::assertSentCount(2);
    }

    /** ⚠️ `NoRoute` 400-ით მოდის, მაგრამ სერვერი მუშაობს — ცარიელი სია და არა ჩავარდნა */
    public function test_no_route_is_an_empty_list_and_not_a_failure(): void
    {
        $this->status = 400;
        $this->answer = ['code' => 'NoRoute', 'message' => 'Impossible route between points'];
        $client = app(RouteClient::class);

        $this->assertSame([], $client->routes(41.7, 44.8, 0.0, 0.0));
        $this->assertFalse($client->blocked());
    }

    /** ⚠️ ჩავარდნა **არ** ქეშირდება — მომდევნო ცდა ისევ სერვერს ეკითხება */
    public function test_a_dead_server_blocks_the_client_and_is_not_cached(): void
    {
        $this->status = 500;
        $client = app(RouteClient::class);

        $this->assertNull($client->routes(41.7, 44.8, 41.71, 44.79));
        $this->assertTrue($client->blocked());

        $this->status = 200;
        $this->answer = ['code' => 'Ok', 'routes' => [$this->route(100, 60)]];

        $this->assertCount(1, $client->routes(41.7, 44.8, 41.71, 44.79));
        $this->assertFalse($client->blocked());
        Http::assertSentCount(2);
    }

    public function test_an_unknown_profile_falls_back_to_driving(): void
    {
        $this->answer = ['code' => 'Ok', 'routes' => []];

        app(RouteClient::class)->routes(41.7, 44.8, 41.71, 44.79, 'rocket');

        Http::assertSent(fn ($r) => str_contains($r->url(), '/route/v1/driving/'));
    }
}
