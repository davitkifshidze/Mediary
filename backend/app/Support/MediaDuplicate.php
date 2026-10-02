<?php

namespace App\Support;

use App\Exceptions\RecordInTrashException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;
use Throwable;

/**
 * **დუბლიკატის ძებნა დამატებისას — ურნიანად (Tasks §40.1ა).**
 *
 * ⚠️ **`trash` scope აქ განზრახ გამორთულია.** უნიკალურობის ინდექსი
 * (`unique(user_id, imdb_id)`) ურნაში მყოფ რიგს ხედავს, ამიტომ „უკვე გაქვს?"
 * კითხვაც ურნაში უნდა იხედებოდეს — თორემ ჩანაწერი იქმნებოდა და შენახვა
 * ინდექსზე ვარდებოდა (500). ურნაში მყოფი ცხადად ბრუნდება
 * `RecordInTrashException`-ად (409) და **ახალი რიგი არ იქმნება**.
 *
 * ⚠️ მფლობელი ცხადია (`withoutGlobalScope('owner')` + `user_id`) — იმპორტი
 * და ჩატი სხვისი სესიიდანაც შეიძლება ეძახდეს (`SharedRecord::copyTo()`).
 */
final class MediaDuplicate
{
    /**
     * მომხმარებლის ჩანაწერი ამ იდენტობით — ცოცხალი ბრუნდება, ურნაში
     * მყოფი `RecordInTrashException`-ს ისვრის, არცერთი — `null`.
     *
     * @param  class-string<Model>  $model
     * @param  array<string, mixed>  $identity
     *
     * @throws RecordInTrashException
     */
    public static function find(string $domain, string $model, int $userId, array $identity): ?Model
    {
        $found = $model::withoutGlobalScopes(['owner', 'trash'])
            ->where('user_id', $userId)
            ->where($identity)
            ->first();

        if ($found && $found->trashed_at !== null) {
            throw new RecordInTrashException($domain, $found);
        }

        return $found;
    }

    /**
     * გამდიდრებამ ჩანაწერს `imdb_id` მიაწერა და შენახვა უნიკალურობაზე
     * ჩავარდა: ეს ნიშნავს, რომ იგივე ფილმი სხვა `tmdb_id`-ით (ან ხელით
     * შეყვანილი, `tmdb_id`-ის გარეშე) უკვე არსებობს. ნახევრად შექმნილი რიგი
     * იშლება და არსებული ბრუნდება — ან, ურნაშია თუ, 409.
     *
     * ⚠️ რიგი **ნამდვილად** იშლება (`delete()`, ურნის გარეშე) — ის ამ წამს
     * შეიქმნა და მომხმარებელს არასდროს უნახავს.
     *
     * @throws RecordInTrashException
     * @throws Throwable სხვა შეცდომა უცვლელად ბრუნდება
     */
    public static function resolveClash(string $domain, Model $fresh, Throwable $e): Model
    {
        $imdb = $fresh->getAttribute('imdb_id');

        if (! $e instanceof UniqueConstraintViolationException || ! $imdb) {
            throw $e;
        }

        $fresh->setAttribute('imdb_id', $fresh->getOriginal('imdb_id'));
        $userId = (int) $fresh->getAttribute('user_id');
        $fresh->delete();

        $existing = self::find($domain, $fresh::class, $userId, ['imdb_id' => $imdb]);

        if (! $existing) {
            throw $e;
        }

        return $existing;
    }
}
