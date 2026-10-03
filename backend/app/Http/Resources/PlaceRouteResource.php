<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** ადგილის შენახული მარშრუტი (Tasks §30.4) — გეომეტრია polyline-ად, კლიენტი შლის */
class PlaceRouteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'place_id' => $this->place_id,
            'name' => $this->name,
            'profile' => $this->profile,
            'distance_m' => (int) $this->distance_m,
            'duration_s' => (int) $this->duration_s,
            // ⚠️ `decimal` cast სტრიქონს აბრუნებს — Leaflet-ს რიცხვი უნდა
            'from_lat' => (float) $this->from_lat,
            'from_lng' => (float) $this->from_lng,
            'geometry' => $this->geometry,
            'chosen_at' => $this->chosen_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
