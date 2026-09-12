<?php

namespace App\Http\Resources;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * სტატუსის ლექსიკონის ერთეული (Tasks §6.4).
 *
 * ⚠️ `role` **აუცილებლად გადის გარეთ**: ფრონტს სჭირდება, რომ „დასრულებული"
 * ბეჯი და „ორივემ ნანახი" სახელზე არ დაამყაროს — მომხმარებელს სტატუსი
 * ნებისმიერად გადაერქმევა.
 */
class StatusResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'module' => $this->module,
            'name_ka' => $this->name_ka,
            'name_en' => $this->name_en,
            'role' => $this->role,
            'icon' => $this->icon,
            'color' => $this->color,
            'is_default' => (bool) $this->is_default,
            'sort_order' => $this->sort_order,
            /* ⚠️ `withCount()` აქ ვერ გამოდგება: კავშირი დომენზეა დამოკიდებული
               (`statuses.module`), ე.ი. ცარიელ მოდელზე ვერ აიგება. მთვლელს
               კონტროლერი ერთი დაჯგუფებული query-თი ავსებს — და მხოლოდ
               ლექსიკონის სიაზე, ე.ი. ჩანაწერის შიგნით ეს ველი არ ჩნდება. */
            'records_count' => $this->when(
                isset($this->resource->records_count),
                fn () => (int) $this->resource->records_count,
            ),
        ];
    }

    /**
     * იგივე ფორმა **მასივად** — `PublicDomain::card()`-ს სჭირდება, რომელიც
     * ხელით აწყობილი ვიწრო მასივია და არა Resource.
     */
    public static function brief(?Model $status): ?array
    {
        return $status ? (new self($status))->resolve() : null;
    }
}
