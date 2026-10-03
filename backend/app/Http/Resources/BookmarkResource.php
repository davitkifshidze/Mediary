<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ბუკმარკი (`bookmark` მოდული, Tasks §18).
 *
 * ორენოვანი translation-ცხრილი განზრახ არ აქვს: სათაური თვითონ გვერდიდან
 * მოდის ისე, როგორც იქ წერია — მისი „ქართული ვერსია" არსად არსებობს
 * (ბორდგეიმის იგივე გადაწყვეტილება).
 */
class BookmarkResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // Tasks §10 — სიაში პატარა მრიცხველი; მხოლოდ `withCount('visits')`-იან კითხვაზე
            'visits_count' => $this->whenCounted('visits'),
            'title' => $this->title,
            'url' => $this->url,
            'domain' => $this->domain,
            'description' => $this->description,
            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => new BookmarkCategoryResource($this->category)),
            'tags' => $this->tags ?? [],
            // Tasks §36.3 — დამატებითი ბმულები (`Bookmark::normalizeLinks()`-ის ფორმა)
            'links' => $this->links ?? [],
            // ატვირთული ფოტო → /storage/…; თუ არაა — გვერდის og:image
            'image' => $this->thumbnail_path ?: $this->image_url,
            'favicon_url' => $this->favicon_url,
            /* Tasks §36.4 — ჩემი ფოტოები (`bookmark_files`) და ვებიდან მოტანილი
               (`gallery_images`) — ორი ცალკე ფაქტი, მხოლოდ `withCount`-იან კითხვაზე */
            'files_count' => $this->whenCounted('files'),
            'photos_count' => $this->whenCounted('galleryImages'),
            /* §6.4 — სტატუსი per-user ლექსიკონის რიგია, ე.ი. **ობიექტი** და არა
               სტრიქონი: მხოლოდ გასაღები უცხო პროფილზე წასაკითხი არ იქნებოდა
               (სახელი მფლობელის ლექსიკონშია), ორივეს ცალკე ველად დაბრუნება კი
               ერთსა და იმავე ფაქტს ორ ადგილას გაიმეორებდა. */
            'status' => StatusResource::brief($this->status),
            'is_favorite' => $this->is_favorite,
            'visit_count' => $this->visit_count,
            'visited_at' => $this->visited_at?->toIso8601String(),
            // 16.5 — საჯარო პროფილის წინაპირობა; default `private`
            'visibility' => $this->visibility,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
