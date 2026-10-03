<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlaceRouteResource;
use App\Models\Place;
use App\Models\PlaceRoute;
use App\Services\Places\RouteClient;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * ადგილის მარშრუტები (Tasks §30.3/§30.4).
 *
 * `POST /places/{place}/route` — **გამოთვლა** ჩემი მიმდინარე მდებარეობიდან,
 * ჩანაწერს არ ქმნის (Nominatim-ის `candidates`-ის იგივე ფორმა). დანარჩენი —
 * არჩეულის **შენახვა**, სია, გადარქმევა, წაშლა ურნაში.
 *
 * ⚠️ საწყისი წერტილი მოთხოვნაშია და არა ბაზაში: მომხმარებლის მდებარეობა
 * სერვერზე მხოლოდ შენახულ მარშრუტში რჩება და მხოლოდ მისი ნებით.
 * ⚠️ სხვისი ადგილი/მარშრუტი `owner` scope-ით 404-ია (`EnsureRecordOwnership`).
 */
class PlaceRouteController extends Controller
{
    public function __construct(private RouteClient $router) {}

    public function compute(Request $request, Place $place)
    {
        $data = $request->validate([
            'from_lat' => ['required', 'numeric', 'between:-90,90'],
            'from_lng' => ['required', 'numeric', 'between:-180,180'],
            'profile' => ['nullable', Rule::in(RouteClient::PROFILES)],
        ]);

        // ⚠️ კოორდინატის გარეშე რუკაც არ არის — ეს ჩანაწერის მდგომარეობაა და არა სერვერის ჩავარდნა
        if ($place->lat === null || $place->lng === null) {
            return response()->json(['message' => 'place_without_coordinates'], 422);
        }

        $profile = $data['profile'] ?? 'driving';
        $routes = $this->router->routes(
            (float) $data['from_lat'],
            (float) $data['from_lng'],
            (float) $place->lat,
            (float) $place->lng,
            $profile,
        );

        if ($routes === null) {
            return response()->json(['message' => 'routing_unavailable'], 503);
        }

        return response()->json(['data' => [
            'profile' => $profile,
            'from' => ['lat' => (float) $data['from_lat'], 'lng' => (float) $data['from_lng']],
            'to' => ['lat' => (float) $place->lat, 'lng' => (float) $place->lng],
            'routes' => $routes,
        ]]);
    }

    public function index(Place $place)
    {
        return PlaceRouteResource::collection($place->routes()->get());
    }

    public function store(Request $request, Place $place)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'profile' => ['required', Rule::in(RouteClient::PROFILES)],
            'distance_m' => ['required', 'integer', 'min:0'],
            'duration_s' => ['required', 'integer', 'min:0'],
            'from_lat' => ['required', 'numeric', 'between:-90,90'],
            'from_lng' => ['required', 'numeric', 'between:-180,180'],
            // polyline5 — 100 000 სიმბოლო ≈ 20 000 წერტილი; მეტი რუკისთვის უაზროა
            'geometry' => ['required', 'string', 'max:100000'],
        ]);

        $route = $place->routes()->create([
            ...$data,
            'user_id' => $request->user()->id,
            'chosen_at' => now(),
        ]);

        return (new PlaceRouteResource($route))->response()->setStatusCode(201);
    }

    public function update(Request $request, PlaceRoute $placeRoute)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:120']]);

        $placeRoute->fill($data)->save();

        return new PlaceRouteResource($placeRoute);
    }

    public function destroy(PlaceRoute $placeRoute)
    {
        // ⚠️ ურნა (Tasks §29) — `delete()` კი არა, `moveToTrash()`
        $placeRoute->moveToTrash();

        return response()->noContent();
    }
}
