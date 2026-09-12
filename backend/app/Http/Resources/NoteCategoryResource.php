<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** ჩანაწერის კატეგორია (`note_categories`) — per-user ლექსიკონი */
class NoteCategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'name_ka' => $this->name_ka,
            'name_en' => $this->name_en,
            'icon' => $this->icon,
            'sort_order' => $this->sort_order,
            'note_entries_count' => $this->whenCounted('noteEntries'),
        ];
    }
}
