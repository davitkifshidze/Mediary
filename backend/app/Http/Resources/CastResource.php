<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CastResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'name_ka' => $this->name_ka,
            'photo' => $this->photo_path ? asset('storage/'.$this->photo_path) : null,
            'gender' => $this->gender,
            'has_tmdb' => (bool) $this->tmdb_person_id,
            'character' => $this->whenPivotLoaded('castables', fn () => $this->pivot->character),
            'billing_order' => $this->whenPivotLoaded('castables', fn () => $this->pivot->billing_order),
            /* ეტაპი 1 — „ეს ბმული ხელით გაკეთდა" (`/sync` მას აღარ ხსნის). */
            'is_manual' => $this->whenPivotLoaded('castables', fn () => (bool) $this->pivot->is_manual),
            /* Tasks §16 — `is_hidden`: ჩანაწერის სიაში „დამალულის" დაკეცილ ჯგუფში
               იხატება; `is_edited`: როლი ან რიგი ხელით შეიცვალა. ⚠️ `is_removed` აქ
               **არ არის** — `cast()` წაშლილს საერთოდ არ აბრუნებს, ე.ი. ველი
               ყოველთვის `false` იქნებოდა. ⚠️ წაშლას **ორივე** სახის მსახიობზე
               აქვს აზრი: TMDB-იდან მოსულიც აღარ ბრუნდება (საფლავის ქვა). */
            'is_hidden' => $this->whenPivotLoaded('castables', fn () => (bool) $this->pivot->is_hidden),
            'is_edited' => $this->whenPivotLoaded('castables', fn () => (bool) $this->pivot->is_edited),
        ];
    }
}
