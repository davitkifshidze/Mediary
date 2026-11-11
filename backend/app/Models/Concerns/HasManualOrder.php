<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;

/**
 * **ხელით დალაგება** — ჩანაწერის ადგილი მფლობელის რიგში (`sort_order`).
 *
 * „ხელით" სიის დალაგების ერთ-ერთი ვარიანტია: ბუკმარკები, ჩანაწერები და
 * სიმღერები გადათრევით ლაგდება, რიგი კი ამ სვეტში ინახება.
 *
 * ⚠️ **ახალი ჩანაწერი რიგის თავში ხვდება**: მფლობელის უმცირეს მნიშვნელობაზე
 * ერთით ნაკლებს იღებს (სვეტი ნიშნიანია — უარყოფითიც დასაშვებია). ასე ყოველი
 * ჩანაწერის მნიშვნელობა **განსხვავებულია**, გადალაგება კი სწორედ ამას
 * ეყრდნობა (`ReordersRecords`). მინიმუმი ურნაში მყოფ ჩანაწერებსაც ითვლის:
 * აღდგენილი ჩანაწერი თავის ადგილს უბრუნდება და იქ სხვა არ უნდა დახვდეს.
 *
 * ⚠️ ცხადად მოცემული მნიშვნელობა (იმპორტი) არ იცვლება.
 */
trait HasManualOrder
{
    protected static function bootHasManualOrder(): void
    {
        static::creating(function ($model) {
            if ($model->sort_order) {
                return;
            }

            // ⚠️ `user_id`-ს `BelongsToUser` იმავე მოვლენაზე ავსებს — რიგი გარანტირებული არ არის
            $owner = $model->user_id ?: Auth::id();
            if (! $owner) {
                return;
            }

            $min = static::withoutGlobalScopes()->where('user_id', $owner)->min('sort_order');
            $model->sort_order = min((int) $min, 0) - 1;
        });
    }

    /** ხელით დალაგებული რიგი; ერთნაირ მნიშვნელობებს შორის ახალი ჯერ */
    public function scopeManualOrder(Builder $query): Builder
    {
        return $query
            ->orderBy($this->qualifyColumn('sort_order'))
            ->orderByDesc($this->qualifyColumn('id'));
    }
}
