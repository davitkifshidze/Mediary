<?php

namespace App\Http\Controllers\Concerns;

use App\Models\RecordLock;
use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * **ჩანაწერის ლოკის სამი კარი (Tasks §33.7 ← §35.4)** — დადება/შეცვლა/მოხსნა
 * (`PUT …/lock`), გახსნა სესიაში (`POST …/unlock`) და ისევ ჩაკეტვა
 * (`POST …/lock`). გალერეის ალბომის კარების (`GalleryAlbumController`) ასლი,
 * ოღონდ ნებისმიერ ჩანაწერზე — პასუხს თითო კონტროლერი თავისი რესურსით აწყობს.
 *
 * ⚠️ სამივე `update`-ია (`EnsureModulePermission`): `PUT` თავისით, `POST`-ის
 * ბოლო სეგმენტები (`unlock`, `lock`) კი `UPDATE_ENDPOINTS`-შია.
 */
trait ManagesRecordLock
{
    /** ჩანაწერის პასუხი ლოკის ცვლილების შემდეგ */
    abstract protected function lockResponse(Model $record): mixed;

    /** კაკვი — მაგ. ჩაკეტილი ალბომი საჯარო ვეღარ რჩება */
    protected function lockChanged(Model $record, bool $locked): void {}

    /**
     * **პაროლის დადება, შეცვლა ან მოხსნა** (`remove: true`); `hint` — მინიშნება.
     *
     * ⚠️ **არსებული ლოკის შეცვლა/მოხსნა ანგარიშის პაროლს ითხოვს**, თუ ჩანაწერი
     * ამ სესიაში არ გახსნილა (ალბომის წესი, Tasks §7.8): უამისოდ ბრაუზერთან
     * მისული „მოხსნას" უბრალოდ დააჭერდა. „დამავიწყდა" ჩიხი არ არის — ანგარიშის
     * პაროლი საკმარისია. ⚠️ ახალ ლოკზე არაფერი იკითხება — დასაცავი ჯერ არაფერია.
     */
    protected function putLock(Request $request, Model $record): mixed
    {
        $lock = RecordLocks::lockOf($record);

        $data = $request->validate([
            'password' => ['nullable', 'string', 'min:4', 'max:100'],
            'hint' => ['nullable', 'string', 'max:120'],
            'remove' => ['nullable', 'boolean'],
            'account_password' => ['nullable', 'string', 'max:255'],
        ]);

        $remove = (bool) ($data['remove'] ?? false);
        $password = $data['password'] ?? null;

        // ⚠️ ახალ ლოკს პაროლი სჭირდება; არსებულზე მარტო მინიშნებაც იცვლება
        abort_if(! $lock && ! $remove && $password === null, 422, 'record_password_required');

        if ($lock && RecordLocks::isHidden($record)) {
            abort_unless(
                ($data['account_password'] ?? null) !== null
                    && Hash::check($data['account_password'], $request->user()->password),
                422,
                'account_password_wrong',
            );
        }

        if ($remove) {
            $lock?->delete();
            // სესიის ჩანაწერიც ქრება — მომავალი ლოკი „უკვე გახსნილად" არ დაიწყება
            RecordLocks::lock($record);
            $this->lockChanged($record, false);

            return $this->lockResponse($record);
        }

        $changes = array_key_exists('hint', $data) ? ['hint' => $data['hint']] : [];

        if ($password !== null) {
            // ახალი პაროლი — ახალი დასაწყისი: ძველი ცდები და ბლოკი აღარ მოქმედებს
            $changes += ['password_hash' => Hash::make($password), 'failed_unlocks' => 0, 'unlock_blocked_until' => null];
        }

        $lock
            ? $lock->update($changes)
            : RecordLock::create([
                ...$changes,
                'user_id' => $record->getAttribute('user_id'),
                'lockable_type' => $record->getMorphClass(),
                'lockable_id' => $record->getKey(),
            ]);

        // ⚠️ დამდები ამ სესიაში ღიად რჩება — „შევინახე" საკუთარ ჩანაწერს არ დამალავს
        RecordLocks::unlock($record);
        $this->lockChanged($record, true);

        return $this->lockResponse($record);
    }

    /**
     * **გახსნა ამ სესიაში.**
     *
     * ⚠️ რიგი `GalleryAlbumController::unlock()`-ისაა: სესიის გარეშე 409 (BUG-02 —
     * სწორი პაროლი ჩუმად არაფერს გახსნიდა); ბლოკი პაროლის შემოწმებამდე
     * (FEAT-04 — შემდეგ დაბრუნებული 423 ორაკული იქნებოდა); ლოკის არქონა და
     * არასწორი პაროლი ერთი და იგივე 422-ია — პასუხი არაფერს ამხელს.
     */
    protected function unlockRecord(Request $request, Model $record): mixed
    {
        abort_unless(RecordLocks::hasSession(), 409, 'session_required');

        $lock = RecordLocks::lockOf($record);

        abort_if($lock?->unlockBlocked() ?? false, 423, 'record_temporarily_locked');

        $data = $request->validate([
            'password' => ['required', 'string', 'max:100'],
        ]);

        $ok = $lock !== null && Hash::check($data['password'], $lock->password_hash);
        $lock?->registerUnlockAttempt($ok);

        abort_unless($ok, 422, 'record_password_wrong');

        RecordLocks::unlock($record);

        return $this->lockResponse($record);
    }

    /** „ისევ ჩაკეტე" — სესიიდან ამოვარდნა, პაროლი ხელუხლებელია */
    protected function relockRecord(Model $record): mixed
    {
        RecordLocks::lock($record);

        return $this->lockResponse($record);
    }
}
