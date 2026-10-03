<?php

namespace Tests\Feature;

use App\Models\Place;
use App\Models\PlaceRoute;
use App\Models\User;
use App\Support\TrashDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **ადგილის მარშრუტები — გამოთვლა და შენახვა** (Tasks §30.5).
 *
 * ⚠️ OSRM გარე მისამართია — `Http::fake()` ერთი stub-ით, ქეში ყოველ ტესტზე
 * სუფთავდება (კლიენტი წარმატებას 10 წუთით ინახავს).
 */
class PlaceRouteTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private array $answer = [];

    private int $status = 200;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Cache::flush();
        Http::fake(['*' => fn () => Http::response($this->answer, $this->status)]);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->user->refresh();
        $this->actingAs($this->user);

        $this->answer = ['code' => 'Ok', 'routes' => [
            ['distance' => 12345.6, 'duration' => 900.4, 'geometry' => '_p~iF~ps|U_ulLnnqC', 'legs' => [['summary' => 'Rustaveli Avenue']]],
            ['distance' => 13000, 'duration' => 1000, 'geometry' => 'abc', 'legs' => [['summary' => '']]],
        ]];
    }

    private function place(User $owner, array $extra = []): Place
    {
        return Place::create(['user_id' => $owner->id, 'name' => 'ვარძია', 'lat' => 41.38, 'lng' => 43.28, ...$extra]);
    }

    private function routePayload(array $extra = []): array
    {
        return [
            'name' => 'სახლიდან',
            'profile' => 'driving',
            'distance_m' => 12346,
            'duration_s' => 900,
            'from_lat' => 41.7,
            'from_lng' => 44.8,
            'geometry' => '_p~iF~ps|U_ulLnnqC',
            ...$extra,
        ];
    }

    public function test_a_route_is_computed_from_my_position_with_alternatives(): void
    {
        $place = $this->place($this->user);

        $this->postJson("/api/places/{$place->id}/route", ['from_lat' => 41.7, 'from_lng' => 44.8, 'profile' => 'foot'])
            ->assertOk()
            ->assertJsonPath('data.profile', 'foot')
            ->assertJsonPath('data.to.lat', 41.38)
            ->assertJsonPath('data.from.lng', 44.8)
            ->assertJsonCount(2, 'data.routes')
            ->assertJsonPath('data.routes.0.distance_m', 12346)
            ->assertJsonPath('data.routes.0.summary', 'Rustaveli Avenue')
            ->assertJsonPath('data.routes.1.summary', null);

        // ჩანაწერი არ შექმნილა — გამოთვლა მხოლოდ პასუხია
        $this->assertSame(0, PlaceRoute::withoutGlobalScopes()->count());
        Http::assertSent(fn ($r) => str_contains($r->url(), '/route/v1/foot/44.800000,41.700000;43.280000,41.380000'));
    }

    public function test_a_dead_router_is_503_and_not_an_empty_list(): void
    {
        $this->status = 500;
        $place = $this->place($this->user);

        $this->postJson("/api/places/{$place->id}/route", ['from_lat' => 41.7, 'from_lng' => 44.8])
            ->assertStatus(503)
            ->assertJsonPath('message', 'routing_unavailable');
    }

    public function test_a_place_without_coordinates_cannot_be_routed(): void
    {
        $place = $this->place($this->user, ['lat' => null, 'lng' => null]);

        $this->postJson("/api/places/{$place->id}/route", ['from_lat' => 41.7, 'from_lng' => 44.8])
            ->assertStatus(422)
            ->assertJsonPath('message', 'place_without_coordinates');
    }

    public function test_the_origin_and_the_profile_are_validated(): void
    {
        $place = $this->place($this->user);

        $this->postJson("/api/places/{$place->id}/route", ['from_lat' => 95, 'from_lng' => 44.8])->assertStatus(422);
        $this->postJson("/api/places/{$place->id}/route", ['from_lat' => 41.7, 'from_lng' => 44.8, 'profile' => 'rocket'])->assertStatus(422);
        $this->postJson("/api/places/{$place->id}/route", ['from_lng' => 44.8])->assertStatus(422);
    }

    public function test_a_chosen_route_is_saved_listed_renamed_and_trashed(): void
    {
        $place = $this->place($this->user);

        $id = $this->postJson("/api/places/{$place->id}/routes", $this->routePayload())
            ->assertStatus(201)
            ->assertJsonPath('data.name', 'სახლიდან')
            ->assertJsonPath('data.distance_m', 12346)
            ->assertJsonPath('data.from_lat', 41.7)
            ->json('data.id');

        $this->assertNotNull(PlaceRoute::find($id)->chosen_at);

        $this->getJson("/api/places/{$place->id}/routes")->assertOk()->assertJsonCount(1, 'data');

        $this->patchJson("/api/place-routes/{$id}", ['name' => 'სამსახურიდან'])
            ->assertOk()
            ->assertJsonPath('data.name', 'სამსახურიდან');

        $this->deleteJson("/api/place-routes/{$id}")->assertNoContent();

        // ურნაშია და არა წაშლილი; სიიდან კი გაქრა
        $this->getJson("/api/places/{$place->id}/routes")->assertOk()->assertJsonCount(0, 'data');
        $this->assertNotNull(PlaceRoute::withoutGlobalScope('trash')->find($id)->trashed_at);
        $this->assertContains('place_route', TrashDomain::kinds());
    }

    public function test_a_saved_route_is_validated(): void
    {
        $place = $this->place($this->user);

        $this->postJson("/api/places/{$place->id}/routes", $this->routePayload(['profile' => 'rocket']))->assertStatus(422);
        $this->postJson("/api/places/{$place->id}/routes", $this->routePayload(['geometry' => '']))->assertStatus(422);
        $this->postJson("/api/places/{$place->id}/routes", $this->routePayload(['name' => str_repeat('ა', 121)]))->assertStatus(422);
    }

    /** ⚠️ სხვისი ადგილი და მარშრუტი **404-ია და არა 403** — `owner` scope */
    public function test_another_users_place_and_route_are_404(): void
    {
        $other = User::factory()->create();
        $place = $this->place($other);
        $route = PlaceRoute::create([...$this->routePayload(), 'user_id' => $other->id, 'place_id' => $place->id]);

        $this->postJson("/api/places/{$place->id}/route", ['from_lat' => 41.7, 'from_lng' => 44.8])->assertNotFound();
        $this->getJson("/api/places/{$place->id}/routes")->assertNotFound();
        $this->postJson("/api/places/{$place->id}/routes", $this->routePayload())->assertNotFound();
        $this->patchJson("/api/place-routes/{$route->id}", ['name' => 'x'])->assertNotFound();
        $this->deleteJson("/api/place-routes/{$route->id}")->assertNotFound();
    }

    /** მშობლის საბოლოო წაშლა მარშრუტებსაც შლის — ურნაში მყოფსაც */
    public function test_routes_vanish_with_the_place(): void
    {
        $place = $this->place($this->user);
        $kept = PlaceRoute::create([...$this->routePayload(), 'user_id' => $this->user->id, 'place_id' => $place->id]);
        $trashed = PlaceRoute::create([...$this->routePayload(), 'user_id' => $this->user->id, 'place_id' => $place->id]);
        $trashed->moveToTrash();

        $place->delete();

        $this->assertSame(0, PlaceRoute::withoutGlobalScopes()->whereIn('id', [$kept->id, $trashed->id])->count());
    }
}
