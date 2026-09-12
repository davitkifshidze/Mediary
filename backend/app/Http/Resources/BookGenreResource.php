<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookGenreResource extends JsonResource
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
            'books_count' => $this->whenCounted('books'),
        ];
    }
}
