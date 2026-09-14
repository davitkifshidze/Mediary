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
            /* ეტაპი 1 — „ეს ბმული ხელით გაკეთდა". ⚠️ ფრონტს ეს უნდა აცდეს,
               თორემ TMDB-იდან მოსული და ხელით დამატებული ერთნაირად გამოიყურებოდა,
               მაშინ როცა წაშლა მხოლოდ ხელით დამატებულს აქვს აზრი (სხვა `/sync`-ით დაბრუნდება). */
            'is_manual' => $this->whenPivotLoaded('castables', fn () => (bool) $this->pivot->is_manual),
        ];
    }
}
