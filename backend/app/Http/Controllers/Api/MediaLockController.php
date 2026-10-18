<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ManagesRecordLock;
use App\Http\Controllers\Controller;
use App\Http\Resources\AnimeListResource;
use App\Http\Resources\MovieListResource;
use App\Http\Resources\SeriesListResource;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * **ფილმის, სერიალისა და ანიმეს ჩაკეტვა პაროლით.**
 *
 * სამი კარი `ManagesRecordLock`-იდან, ერთი მისამართი სამივე დომენზე —
 * `/media/{type}/{id}/lock|unlock` (`/media/cast/{type}/{id}`-ის წესი):
 *  · `PUT …/lock` — დადება, შეცვლა, მოხსნა (არსებულზე — ანგარიშის პაროლით, თუ
 *    ამ სესიაში არ გაგიხსნია);
 *  · `POST …/unlock` — გახსნა ამ სესიაში (`throttle:record-unlock`, 10 ცდა → 15 წთ);
 *  · `POST …/lock` — ისევ ჩაკეტვა.
 *
 * ⚠️ **ჩანაწერი `record_lock` scope-ის გარეშე იძებნება** — დამალულის გახსნა
 * სწორედ დამალულზე ხდება; `owner` კი რჩება (სხვისი 404-ია).
 */
class MediaLockController extends Controller
{
    use ManagesRecordLock;

    /** @var array<string, class-string> */
    private const RESOURCES = [
        'movie' => MovieListResource::class,
        'series' => SeriesListResource::class,
        'anime' => AnimeListResource::class,
    ];

    public function setLock(Request $request, string $type, int $id)
    {
        return $this->putLock($request, $this->record($type, $id));
    }

    public function unlock(Request $request, string $type, int $id)
    {
        return $this->unlockRecord($request, $this->record($type, $id));
    }

    public function relock(string $type, int $id)
    {
        return $this->relockRecord($this->record($type, $id));
    }

    /** პასუხი — სიის ბარათი (დამალულზე ბოქლომიანი, `lockedCard()`) */
    protected function lockResponse(Model $record): mixed
    {
        $resource = self::RESOURCES[MediaDomain::typeOf($record)];

        return new $resource($record->loadMissing('genres'));
    }

    private function record(string $type, int $id): Model
    {
        abort_unless(MediaDomain::has($type), 404);

        $record = MediaDomain::query($type)->withoutGlobalScope('record_lock')->find($id);
        abort_unless($record !== null, 404);

        return $record;
    }
}
