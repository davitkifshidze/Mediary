<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ჩანაწერი (`note` მოდული).
 *
 * სათაური ერთენოვანია — ეს user-ის საკუთარი
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

            /* იერი. ⚠️ ფოტო პრივატულ დისკზეა, ე.ი. აქ **API-ს გზაა** და არა `/storage/…`:
               SPA მას სესიით კითხულობს (`usePrivateFileUrl`). `v` ფაილთან ერთად იცვლება —
               სხვაგვარად შეცვლილი ფოტოს ნაცვლად ბრაუზერში წაკითხული ძველი დარჩებოდა. */
            'icon' => $this->icon,
            'color' => $this->color,
            'photo_url' => $this->photo_path ? "/notes/{$this->id}/photo?v=".substr(md5($this->photo_path), 0, 8) : null,

            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => new NoteCategoryResource($this->category)),
            'tags' => $this->tags ?? [],
            'links' => $this->links ?? [],

            /* სტატუსი per-user ლექსიკონის რიგია, ე.ი. **ობიექტი** და არა
               სტრიქონი: მხოლოდ გასაღები უცხო პროფილზე წასაკითხი არ იქნებოდა
               (სახელი მფლობელის ლექსიკონშია), ორივეს ცალკე ველად დაბრუნება კი
               ერთსა და იმავე ფაქტს ორ ადგილას გაიმეორებდა. */
            'status' => StatusResource::brief($this->status),
            'is_favorite' => $this->is_favorite,

            // ⚠️ აქ პირადი დოკუმენტებია: `private` მკაცრი წესია და
            // საჯარო პროფილზე მოდული საერთოდ არ ჩანს
            'visibility' => $this->visibility,

            'files_count' => $this->whenCounted('files'),
            'reminders_count' => $this->whenCounted('reminders'),
            'reminders' => NoteReminderResource::collection($this->whenLoaded('reminders')),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
