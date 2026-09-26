<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** მსუბუქი ვერსია ბადისთვის (სია) */
class MovieListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title_ka' => $this->title_ka,
            'title_en' => $this->title_en,
            'year' => $this->year,
            'rating' => $this->rating,
            'poster' => $this->poster_path ? asset('storage/'.$this->poster_path) : null,
            /* §6.4 — სტატუსი per-user ლექსიკონის რიგია, ე.ი. **ობიექტი** და არა
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
        ];
    }
}
