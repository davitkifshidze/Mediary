<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ManagesRecordLock;
use App\Http\Controllers\Controller;
use App\Models\CastMember;
use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * **მსახიობის ჩაკეტვა პაროლით.**
 *
 * სამი კარი `ManagesRecordLock`-იდან: `PUT /cast/{id}/lock` (დადება/შეცვლა/
 * მოხსნა), `POST /cast/{id}/unlock` (გახსნა ამ სესიაში) და `POST /cast/{id}/lock`
 * (ისევ ჩაკეტვა).
 *
 * ⚠️ **ლოკი მნახველისაა** — `cast_members` გლობალური ლექსიკონია, ე.ი. ჩემი
 * პაროლი მსახიობს მხოლოდ ჩემგან მალავს (`RecordLocks::ownerOf()`); სხვა
 * ანგარიშს ის ჩვეულებრივ უჩანს და მასზე თავისი ლოკი შეიძლება ჰქონდეს.
 *
 * ⚠️ **`{id}` და არა `{castMember}`** — მიბმული დამალული ჩანაწერი
 * `EnsureRecordOwnership`-ში 423-ს მიიღებდა, გახსნა კი სწორედ დამალულზე ხდება.
 * ჩანაწერი `record_lock`-ის გარეშე იძებნება; `creator` (სხვისი კერძო) კი რჩება.
 */
class ActorLockController extends Controller
{
    use ManagesRecordLock;

    public function setLock(Request $request, int $id)
    {
        return $this->putLock($request, $this->actor($id));
    }

    public function unlock(Request $request, int $id)
    {
        return $this->unlockRecord($request, $this->actor($id));
    }

    public function relock(int $id)
    {
        return $this->relockRecord($this->actor($id));
    }

    /** პასუხი — დამალულზე ბოქლომიანი ბარათი, თორემ მსახიობის მოკლე ფორმა ლოკის ფაქტებით */
    protected function lockResponse(Model $record): mixed
    {
        /** @var CastMember $record */
        return response()->json([
            'data' => RecordLocks::hiddenRecord($record)
                ? $record->lockedCard()
                : ['id' => $record->id, 'name' => $record->name, 'name_ka' => $record->name_ka, ...RecordLocks::state($record)],
        ]);
    }

    private function actor(int $id): CastMember
    {
        $actor = CastMember::query()->withoutGlobalScope('record_lock')->find($id);
        abort_unless($actor !== null, 404);

        return $actor;
    }
}
