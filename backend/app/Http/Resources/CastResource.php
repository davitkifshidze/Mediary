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
            'character' => $this->whenPivotLoaded('castables', fn () => $this->pivot->character),
            'billing_order' => $this->whenPivotLoaded('castables', fn () => $this->pivot->billing_order),
        ];
    }
}
