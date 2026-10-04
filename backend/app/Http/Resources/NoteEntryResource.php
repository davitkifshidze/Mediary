<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ჩანაწერი (`note` მოდული, Tasks §13).
 *
 * სათაური ერთენოვანია — §13 ორ ენას არ ითხოვს და ეს user-ის საკუთარი
 * ტექსტია და არა კატალოგის (ვიდეოსა და სიმღერის იგივე წესი).
 */
class NoteEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,

            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => new NoteCategoryResource($this->category)),
            'tags' => $this->tags ?? [],
            'links' => $this->links ?? [],

            'due_at' => $this->due_at?->toIso8601String(),
            /* §6.4 — სტატუსი per-user ლექსიკონის რიგია, ე.ი. **ობიექტი** და არა
               სტრიქონი: მხოლოდ გასაღები უცხო პროფილზე წასაკითხი არ იქნებოდა
               (სახელი მფლობელის ლექსიკონშია), ორივეს ცალკე ველად დაბრუნება კი
               ერთსა და იმავე ფაქტს ორ ადგილას გაიმეორებდა. */
            'status' => StatusResource::brief($this->status),
            'is_favorite' => $this->is_favorite,

            // ⚠️ §13 — აქ პირადი დოკუმენტებია: `private` მკაცრი წესია და
            // საჯარო პროფილზე მოდული საერთოდ არ ჩანს (16.1)
            'visibility' => $this->visibility,

            'files_count' => $this->whenCounted('files'),
            'reminders_count' => $this->whenCounted('reminders'),
            'reminders' => NoteReminderResource::collection($this->whenLoaded('reminders')),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
