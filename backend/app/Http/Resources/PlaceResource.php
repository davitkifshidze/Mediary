<?php

namespace App\Http\Resources;

use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/**
 * ადგილი (`place` მოდული, FEAT-26).
 *
 * ორენოვანი translation-ცხრილი განზრახ არ აქვს: სახელი ისე იწერება,
 * როგორც ადგილს ჰქვია — Nominatim თვითონ აბრუნებს ლოკალიზებულ სახელს
 * (`accept-language`), ე.ი. მეორე ენის ცხრილი ცარიელი დარჩებოდა
 * (წიგნის/ბუკმარკის იგივე გადაწყვეტილება).
 */
class PlaceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'address' => $this->address,
            'city' => $this->city,
            'country' => $this->country,
            /* ⚠️ რიცხვად და არა სტრიქონად: `decimal` cast სტრიქონს აბრუნებს,
               ინტერფეისს კი რიცხვი სჭირდება (რუკის ბმული, ფორმატირება). */
            'lat' => $this->lat !== null ? (float) $this->lat : null,
            'lng' => $this->lng !== null ? (float) $this->lng : null,
            // §16.2-ის იდენტობა — ხელით შეყვანილს არ აქვს და მატჩინგში არ მონაწილეობს
            'osm_id' => $this->osm_id,
            'osm_type' => $this->osm_type,
            // გარე რუკის ბმული — ⚠️ რუკა თვითონ ამ ეტაპზე არ ემატება
            'map_url' => $this->mapUrl(),
            'description' => $this->description,
            'category_id' => $this->category_id,
            'category' => $this->whenLoaded('category', fn () => new PlaceCategoryResource($this->category)),
            'tags' => $this->tags ?? [],
            // ⚠️ enum და არა ლექსიკონის რიგი — ადგილს „მიმდინარე" არ აქვს
            'status' => $this->status,
            'rating' => $this->rating,
            'is_favorite' => $this->is_favorite,
            'visited_at' => $this->visited_at?->toDateString(),
            'photo' => $this->photo_path
                ? Storage::disk(StorageFolder::diskFor($this->photo_path))->url($this->photo_path)
                : null,
            'files_count' => $this->whenCounted('files'),
            // გალერეაში მოტანილი ფოტოები — სექციის ატვირთვებისგან ცალკე ფაქტია
            'photos_count' => $this->whenCounted('galleryImages'),
            // 16.5 — საჯარო პროფილის წინაპირობა; default `private`
            'visibility' => $this->visibility,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
