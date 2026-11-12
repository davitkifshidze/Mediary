<?php

namespace App\Http\Resources;

use App\Models\FranchisePart;
use App\Support\AppTime;
use App\Support\RecordLocks;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** მსუბუქი ვერსია ბადისთვის (სია) */
class MovieListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // ფრანჩაიზის დაუმატებელი ნაწილი — სიის ჯგუფში მკრთალი ბარათი და არა ჩანაწერი
        if ($this->resource instanceof FranchisePart) {
            return $this->ghost($this->resource);
        }

        // დამალული ჩანაწერი ბოქლომიანი ბარათია: სათაური და ლოკი, შიგთავსი არა
        if (RecordLocks::hiddenRecord($this->resource)) {
            return $this->resource->lockedCard();
        }

        return [
            'id' => $this->id,
            'title_ka' => $this->title_ka,
            'title_en' => $this->title_en,
            'year' => $this->year,
            'rating' => $this->rating,
            'my_rating' => $this->my_rating,
            'poster' => $this->poster_path ? asset('storage/'.$this->poster_path) : null,
            /* სტატუსი per-user ლექსიკონის რიგია, ე.ი. **ობიექტი** და არა
               სტრიქონი: მხოლოდ გასაღები უცხო პროფილზე წასაკითხი არ იქნებოდა
               (სახელი მფლობელის ლექსიკონშია), ორივეს ცალკე ველად დაბრუნება კი
               ერთსა და იმავე ფაქტს ორ ადგილას გაიმეორებდა. */
            'status' => StatusResource::brief($this->status),
            'is_favorite' => $this->is_favorite,
            'description_ka' => $this->description_ka,
            'description_en' => $this->description_en,
            'collection_id' => $this->tmdb_collection_id,
            'collection_name' => $this->collection_name,
            'franchise_next' => (bool) ($this->franchise_next ?? false),
            'genres' => GenreResource::collection($this->whenLoaded('genres')),
            'missing' => $this->missingFields(),
            // ლოკის ფაქტები — მხოლოდ მფლობელს (`RecordLocks::ownerState()`)
            ...RecordLocks::ownerState($this->resource),
        ];
    }

    /**
     * **ფრანჩაიზის დაუმატებელი ნაწილი** — იმავე ფორმის, რაც ბარათს სჭირდება, ოღონდ
     * `ghost`-ით: ჩანაწერი არ არის, ბარათი მკრთალია და „დამატებას" სთავაზობს.
     *
     * ⚠️ `id` უარყოფითია (TMDB-ის id მინუსით): ჩანაწერის id-ს ვერასდროს დაემთხვევა და
     * სიის გასაღებად გამოდგება.
     *
     * @return array<string, mixed>
     */
    private function ghost(FranchisePart $part): array
    {
        $date = $part->release_date?->format('Y-m-d');

        return [
            'id' => -$part->tmdb_id,
            'ghost' => true,
            'tmdb_id' => $part->tmdb_id,
            'title_ka' => null,
            'title_en' => $part->title,
            'year' => $part->year(),
            'release_date' => $date,
            // ჯერ არ გამოსულა (ან თარიღი არ აქვს — მხოლოდ გამოცხადდა)
            'released' => $date !== null && $date <= AppTime::now()->format('Y-m-d'),
            'rating' => $part->rating !== null ? (string) $part->rating : null,
            'my_rating' => null,
            'poster' => $part->posterUrl(),
            'status' => null,
            'is_favorite' => false,
            'description_ka' => null,
            'description_en' => $part->overview,
            'collection_id' => $part->tmdb_collection_id,
            'collection_name' => $part->collection_name,
            'franchise_next' => false,
            'genres' => [],
            'missing' => [],
        ];
    }
}
