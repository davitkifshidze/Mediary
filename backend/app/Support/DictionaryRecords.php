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
 *  · `clear_records`  — ჩანაწერი რჩება, უბრალოდ ლექსიკონის გარეშე;
 *  · `delete_records` — **ჩანაწერებიც იშლება** (მომხმარებლის პასუხი 2026-09-13).
 *
 * ⚠️ **სამივე ცხადია და „არაფერი" აღარ არსებობს (Tasks GAP-09).** აქამდე
 * `isset($data['move_to'])`-ს ეყრდნობოდა, ე.ი. `null`-ზე false-ს აბრუნებდა —
 * და **გასაღების არყოფნა**, ცხადი `move_to: null` და `move_to: <self>` სამივე
 * ერთსა და იმავეს ნიშნავდა: „ჩანაწერები ცარიელი დარჩეს". ე.ი. ნახევრად
 * აწყობილი ფორმა და ბაგიანი კლიენტი უხმოდ იღებდა იმ შედეგს, რომელიც
 * სავალდებულო სტატუსის წესის ერთადერთი დარჩენილი გამონაკლისია. ახლა
 * განზრახვა **ცხადად იგზავნება**, უამისოდ კი **422 `move_target_required`**.
 *
 * ⚠️ `move_to: <self>` ცალკე აღარ იკითხება — თავის თავზე „გადატანა" წაშლადი
 * ერთეულისკენ უაზროა და 422-ია (`Rule::notIn`).
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
     * ⚠️ **`move_to` სავალდებულოა, თუ ცხადი ფლაგი არ მოვიდა** (Tasks GAP-09) —
     * ე.ი. ფორმა, რომელმაც განზრახვა არ თქვა, 422-ს იღებს და არა ჩუმად
     * „დატოვე ცარიელი"-ს.
     *
     * @param  Exists  $target  სამიზნე ერთეული — **ჩემი** ლექსიკონიდან (და, სტატუსზე, იმავე დომენიდან)
     * @param  int  $selfId  წაშლადი ერთეული — თავის თავზე გადატანა უაზროა
     */
    public static function rules(Request $request, Exists $target, int $selfId): array
    {
        // „ჩანაწერებს რაღაც სხვა მოუვა" — ორივე შემთხვევაში `move_to` ზედმეტია
        $explicit = fn (): bool => $request->boolean('delete_records') || $request->boolean('clear_records');

        return [
            'move_to' => [
                Rule::prohibitedIf($explicit),
                Rule::requiredIf(fn (): bool => ! $explicit()),
                'integer',
                Rule::notIn([$selfId]),
                $target,
            ],
            'delete_records' => ['nullable', 'boolean'],
            // ⚠️ ორი ურთიერთგამომრიცხავი განზრახვა ერთად — 422, არასდროს ჩუმი არჩევანი
            'clear_records' => [
                Rule::prohibitedIf(fn (): bool => $request->boolean('delete_records')),
                'nullable',
                'boolean',
            ],
        ];
    }

    /**
     * ვალიდაციის შეტყობინებები — **მანქანური კოდები** და არა ინგლისური
     * წინადადებები.
     *
     * ⚠️ Laravel `message`-ში პირველივე შეცდომის ტექსტს წერს, ე.ი. კოდი
     * პირდაპირ `errorMessage()`-ს ხვდება და ითარგმნება (BUG-14-ის შემდეგ
     * ის `CODES`-ს ჯერ ამოწმებს).
     *
     * @return array<string, string>
     */
    public static function messages(): array
    {
        return [
            'move_to.required' => 'move_target_required',
            'move_to.not_in' => 'move_target_is_self',
        ];
    }

    /** გადატანის სამიზნე — `null` მხოლოდ ცხადი `clear_records`-ის შემთხვევაშია */
    public static function moveTarget(array $data): ?int
    {
        return isset($data['move_to']) ? (int) $data['move_to'] : null;
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

    /**
     * ჩანაწერების გადატანა — ისიც თითო-თითოდ, მოდელით (Tasks BUG-05).
     *
     * ⚠️ **ორივე ბრანჩი ერთი დიალოგისაა, ე.ი. ერთნაირადაც უნდა მუშაობდეს.**
     * წაშლა მოდელზე იყო, გადატანა კი query-builder-ის `update()`-ით — და
     * სწორედ ის ორი რამ იკარგებოდა, რისთვისაც ეს წესი არსებობს:
     *
     * ⚠️ **`watched_at`.** `done` სტატუსის წაშლა `todo`-ზე გადატანით
     * ყველა ჩანაწერს **შევსებული** `watched_at`-ით ტოვებდა — ერთი სვეტი
     * თავის ჩანაწერს ეწინააღმდეგებოდა. სვეტს მხოლოდ `HasStatus::applyStatus()`
     * წერს, ე.ი. მასობრივი `update()` მას ვერ დაინახავდა.
     *
     * ⚠️ **აუდიტის ლოგი.** `AuditObserver` მოდელის ივენთებზე ზის, ე.ი.
     * „ჩემი ასი ფილმი სხვა სტატუსზე გადავიდა" ლოგში **არსად** ჩანდა.
     *
     * ⚠️ `lazyById` და არა `get()`, იგივე მიზეზით, რაც წაშლაზე; ჭრა
     * უსაფრთხოა, რადგან შეცვლილ რიგებს უფრო პატარა id აქვთ, ვიდრე
     * მომდევნო ნაჭერს.
     *
     * @param  callable(Model): void  $apply  რას ვცვლით — სვეტს თუ `applyStatus()`-ს
     */
    public static function move(Builder $records, callable $apply): int
    {
        $moved = 0;

        $records->lazyById(100)->each(function (Model $record) use ($apply, &$moved) {
            $apply($record);

            if ($record->save()) {
                $moved++;
            }
        });

        return $moved;
    }
}
