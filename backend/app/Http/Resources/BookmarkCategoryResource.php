<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** ბუკმარკის კატეგორია — per-user ლექსიკონი (`bookmark_categories`) */
class BookmarkCategoryResource extends JsonResource
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
            'bookmarks_count' => $this->whenCounted('bookmarks'),
        ];
    }
}
