<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class VideoTypeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'name_ka' => $this->name_ka,
            'name_en' => $this->name_en,
            'icon' => $this->icon,
            // ბეჯის ფერი (`c1…c12` ან `#rrggbb`), `null` — ნაცრისფერი
            'color' => $this->color,
            'sort_order' => $this->sort_order,
            'videos_count' => $this->whenCounted('videos'),
            // კურსში მცხოვრები ვიდეოები ამ ტიპით — სიაში არ ჩანს, წაშლის ფანჯარა კი ცალკე ითვლის
            'lessons_count' => $this->whenCounted('lessons'),
        ];
    }
}
