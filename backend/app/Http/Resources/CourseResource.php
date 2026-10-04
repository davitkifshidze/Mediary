<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * კურსი (`course` მოდული, FEAT-25).
 *
 * ორენოვანი translation-ცხრილი განზრახ არ აქვს: სახელი ისე იწერება,
 * როგორც კურსს ჰქვია — მისი „ქართული ვერსია" არსად არსებობს (ბუკმარკისა
 * და სამაგიდო თამაშის იგივე გადაწყვეტილება).
 */
class CourseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'url' => $this->url,
            'platform' => $this->platform,
            'description' => $this->description,
            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => new CourseCategoryResource($this->category)),
            'tags' => $this->tags ?? [],
            // ⚠️ enum და არა ლექსიკონის რიგი — „მივატოვე" მეოთხე ფაქტია
            'status' => $this->status,
            'is_favorite' => $this->is_favorite,
            // ატვირთული ფოტო → /storage/…; თუ არაა — გვერდის og:image
            'image' => $this->thumbnail_path ?: $this->image_url,
            'started_at' => $this->started_at?->toDateString(),
            'finished_at' => $this->finished_at?->toDateString(),
            'files_count' => $this->whenCounted('files'),
            // 16.5 — საჯარო პროფილის წინაპირობა; default `private`
            'visibility' => $this->visibility,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
