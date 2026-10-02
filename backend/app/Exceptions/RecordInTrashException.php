<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;

/**
 * **„ეს ჩანაწერი უკვე ურნაშია" (Tasks §40.1ა).**
 *
 * დამატება იდენტობით (`tmdb_id`, `imdb_id`…) ეძებს დუბლიკატს და `trash`
 * scope ურნაში მყოფს უმალავდა — `unique(user_id, imdb_id)` კი ხედავდა. ასე
 * ურნაში მყოფი ფილმის ხელახლა დამატება 500 იყო (ნედლი SQL ტოსტში), ბაზაში
 * კი ნახევრად შექმნილი მეორე რიგი რჩებოდა. ახლა ეს ცხადი მდგომარეობაა —
 * **409 `record_in_trash`** + id, რომ ინტერფეისმა „აღდგენა" შესთავაზოს.
 *
 * ⚠️ **`Exception`-ს აფართოებს და არა `RuntimeException`-ს** — ჩატის
 * „დამიმატე" `RuntimeException`-ს 422-ად იჭერს, ეს კი იქიდან თავისი
 * `render()`-ით უნდა გავიდეს.
 */
class RecordInTrashException extends Exception
{
    public function __construct(public readonly string $domain, public readonly Model $record)
    {
        parent::__construct('record_in_trash');
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => 'record_in_trash',
            'domain' => $this->domain,
            'id' => $this->record->getKey(),
        ], 409);
    }
}
