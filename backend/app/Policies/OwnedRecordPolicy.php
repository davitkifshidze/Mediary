<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * **მფლობელობის მეორე ფენა — ერთი წესი ყველა დომენზე** (აუდიტი 2026-09-14, §A5).
 *
 * ⚠️ **ეს ფენა 2026-09-14-მდე საერთოდ არ მუშაობდა.** ჩვიდმეტი policy კლასი
 * დაწერილი იყო, მაგრამ `grep -rn "authorize(\|Gate::" app/Http/Controllers`
 * **0 შედეგს** აბრუნებდა — ე.ი. მფლობელობას მხოლოდ `BelongsToUser`-ის
 * global scope იცავდა. დღეს ის 94 ადგილას ცხადად ითიშება
 * (`withoutGlobalScope('owner')`) და ყველა 94 სწორია, მაგრამ 95-ე
 * დავიწყება ჩუმად გაუშვებდა. ახლა კარიბჭე ნამდვილად დგას —
 * `EnsureRecordOwnership` middleware-ს გავლით.
 *
 * ⚠️ **ლოგიკა ერთხელ წერია.** ჩვიდმეტივე policy სიმბოლო-სიმბოლოში იგივე
 * იყო (`return $model->user_id === $user->id;`) — ზუსტად ის დუბლირება,
 * რომელმაც `makeKey()`-ს ცხრა ერთნაირი ბაგი აჩუქა (§B3). კონკრეტული
 * კლასები რჩება, რომ (ა) Laravel-ის ავტომატური აღმოჩენა მუშაობდეს და
 * (ბ) ცალკეულ დომენს მომავალში საკუთარი წესის გადაფარვა შეეძლოს.
 *
 * ⚠️ **`Gate::before` სუპერ-ადმინს ატარებს** (`AppServiceProvider`), ე.ი.
 * აქ მისი ცალკე შემოწმება არ წერია — თორემ წესი ორ ადგილას იქნებოდა.
 */
abstract class OwnedRecordPolicy
{
    public function view(User $user, Model $record): bool
    {
        return $this->owns($user, $record);
    }

    public function update(User $user, Model $record): bool
    {
        return $this->owns($user, $record);
    }

    public function delete(User $user, Model $record): bool
    {
        return $this->owns($user, $record);
    }

    /**
     * ⚠️ **`(int)` შედარება და არა `===`**: `user_id` ზოგ დრაივერზე
     * სტრიქონად მოდის (sqlite/PDO-ს ტიპები), ე.ი. მკაცრი შედარება
     * მფლობელსაც უარს ეტყოდა.
     */
    protected function owns(User $user, Model $record): bool
    {
        return (int) $record->getAttribute('user_id') === (int) $user->getKey();
    }
}
