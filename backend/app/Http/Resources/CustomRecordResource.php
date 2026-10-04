<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **ინტერფეისიდან შექმნილი მოდულის ჩანაწერი (Tasks §37).**
 *
 * ⚠️ დამატებითი ველების მნიშვნელობები აქ **არ** მოდის — ისინი თავის
 * endpoint-ზეა (`GET /custom-fields/{module}/{id}`), ზუსტად ისე, როგორც
 * ყველა საბაზისო მოდულზე: სია ათეულობით ჩანაწერია და თითოს ველების
 * ჩატვირთვა ყოველ გვერდზე N+1 იქნებოდა.
 */
class CustomRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'module' => $this->module,
            'title' => $this->title,
            'description' => $this->description,
            'url' => $this->url,
            'domain' => $this->domain(),
            // `VideoUrl`-ით ამოცნობილი ბმული — ფლეერში დასაკრავად (37.5); `null` = უბრალო ბმული
            'platform' => $this->platform,
            'embed_url' => $this->embed_url,
            // ატვირთული ფოტო → /storage/…; თუ არაა — გვერდის og:image (დაშორებული)
            'photo_path' => $this->photo_path,
            'image_url' => $this->image_url,
            'image' => $this->photo_path ?: $this->image_url,
            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => $this->category ? new CustomCategoryResource($this->category) : null),
            'tags' => $this->tags ?? [],
            // §6.4 — ობიექტი და არა სტრიქონი (`BookmarkResource`-ის წესი)
            'status' => StatusResource::brief($this->status),
            'is_favorite' => (bool) $this->is_favorite,
            'finished_at' => $this->finished_at?->toIso8601String(),
            'visibility' => $this->visibility,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
