<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * **ლექსიკონის ერთეულის წაშლა — რა მოუვა მასზე მიბმულ ჩანაწერებს (ეტაპი 8).**
 *
 * სამი ცხადი არჩევანი, რვავე ლექსიკონზე ერთნაირად (ვიდეოს ტიპი · ხუთი
 * ჟანრი · ორი კატეგორია · სტატუსი):
 *  · `move_to`        — სხვა ერთეულზე გადატანა;
 *  · არაფერი          — ჩანაწერი რჩება, უბრალოდ ლექსიკონის გარეშე;
 *  · `delete_records` — **ჩანაწერებიც იშლება** (მომხმარებლის პასუხი 2026-09-13).
 *
 * ⚠️ **წაშლა მოდელის გავლითაა, არასდროს `delete()` query-ზე.** ჩანაწერის
 * `deleting`/`deleted` ივენთები ფაილს დისკიდან შლის, კვოტას ათავისუფლებს,
 * polymorphic pivot-ებსა და გალერეას ასუფთავებს და აუდიტ ლოგში წერს —
 * query-ზე `delete()` ამ ყველაფერს ჩუმად გვერდს აუვლიდა (`PurgeService`-ის
 * იგივე წესი).
 *
 * ⚠️ **`move_to` და `delete_records` ერთად — 422.** ორ ურთიერთგამომრიცხავ
 * ბრძანებიდან ერთის ჩუმად არჩევა ზუსტად ის არის, რაც ფაილებს დაკარგავს.
 */
final class DictionaryRecords
{
    /**
     * `destroy()`-ის ვალიდაცია.
     *
     * @param  Exists  $target  სამიზნე ერთეული — **ჩემი** ლექსიკონიდან (და, სტატუსზე, იმავე დომენიდან)
     */
    public static function rules(Request $request, Exists $target): array
    {
        return [
            'move_to' => [
                Rule::prohibitedIf(fn () => $request->boolean('delete_records')),
                'nullable',
                'integer',
                $target,
            ],
            'delete_records' => ['nullable', 'boolean'],
        ];
    }

    /** გადატანის სამიზნე — თავის თავზე „გადატანა" ცარიელად დატოვებას ნიშნავს */
    public static function moveTarget(array $data, int $selfId): ?int
    {
        return isset($data['move_to']) && (int) $data['move_to'] !== $selfId
            ? (int) $data['move_to']
            : null;
    }

    /**
     * ჩანაწერების წაშლა — თითო-თითოდ, მოდელით.
     *
     * ⚠️ `lazyById` და არა `get()`: ასობით ფილმი ერთ მასივში ყველა თავისი
     * `$with` კავშირით მეხსიერებას ტყუილად დაიკავებდა. id-ით ჭრა წაშლისას
     * უსაფრთხოა — შემდეგი ნაჭერი `id > ბოლო`-თი იწყება, ე.ი. წაშლილი
     * რიგები არაფერს წანაცვლებს.
     */
    public static function delete(Builder $records): int
    {
        $deleted = 0;

        $records->lazyById(100)->each(function (Model $record) use (&$deleted) {
            if ($record->delete()) {
                $deleted++;
            }
        });

        return $deleted;
    }
}
