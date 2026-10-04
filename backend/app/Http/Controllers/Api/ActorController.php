<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CastMember;
use App\Services\Cast\ActorIndex;
use App\Services\Cast\CastDetacher;
use App\Services\Cast\CastPool;
use App\Support\MediaDomain;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **მსახიობების გვერდი `/actors` (Tasks §35.2).**
 *
 *  · `GET /actors` — ყველა ჩემი მსახიობი (`ActorIndex`): ძებნა, ფილტრები,
 *    დახარისხება, გვერდები, სქესის მთვლელი და ფილტრის არჩევანი;
 *  · `DELETE /actors/{castMember}/records` — „წაშლა ჩემი ჩანაწერებიდან".
 *
 * ⚠️ **`module:`/`permission:` middleware განზრახ არ დგას** — მსახიობს მოდული
 * არ აქვს (`/cast/sync/plan`-ის წესი); ჩანაწერების დომენებს კონტროლერი
 * თვითონ ირჩევს: სიაში — ჩართული და `view`-ის უფლებით (`CastPool::typesFor()`),
 * მოხსნაში — ჩართული და `update`-ის უფლებით (მსახიობის მოხსნა ჩანაწერის
 * რედაქტირებაა, `RecordCastController`-ის წესი).
 */
class ActorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'gender' => ['nullable', 'in:female,male'],
            'known_for' => ['nullable', 'string', 'max:60'],
            'tag' => ['nullable', 'string', 'max:60'],
            'photos' => ['nullable', 'in:with,without'],
            'records_min' => ['nullable', 'integer', Rule::in(ActorIndex::RECORD_STEPS)],
            'synced' => ['nullable', 'in:yes,no'],
            'sort' => ['nullable', Rule::in(ActorIndex::SORTS)],
            'locale' => ['nullable', 'in:ka,en'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.ActorIndex::MAX_PER_PAGE],
        ]);

        $user = $request->user();
        $index = new ActorIndex(CastPool::typesFor($user), (int) $user->id);

        $query = $index->query($data);
        $index->sort($query, $data['sort'] ?? 'name', $data['locale'] ?? 'ka');

        $page = $query->paginate((int) ($data['per_page'] ?? ActorIndex::DEFAULT_PER_PAGE), ['*'], 'page', (int) ($data['page'] ?? 1));

        return response()->json([
            'items' => collect($page->items())->map(fn (CastMember $member) => $this->card($member, $index))->all(),
            'total' => $page->total(),
            'page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'facets' => ['gender' => $index->genderFacets($data)],
            'options' => $index->options(),
        ]);
    }

    /**
     * **„წაშლა ჩემი ჩანაწერებიდან"** — მსახიობი ყველა ჩემს ჩანაწერზე იხსნება
     * იმავე გზით, რითაც ჩანაწერის მსახიობების სიიდან (`CastDetacher`): ურნაში,
     * საფლავის ქვით და აუდიტით.
     *
     * ⚠️ **ლექსიკონის რიგი რჩება** და ჩემი ფოტოებიც — ეს „ჩემი ჩანაწერებიდან" არის
     * და არა მსახიობის წაშლა (ის გლობალურია და სხვის ჩანაწერსაც ეკუთვნის).
     * ⚠️ `update`-ის უფლების გარეშე დომენი არ ეხება — რიცხვი `skipped`-ში ბრუნდება,
     * რომ „მოიხსნა" ტყუილად სრული არ იყოს.
     */
    public function detachEverywhere(Request $request, CastMember $castMember, CastDetacher $detacher): JsonResponse
    {
        $user = $request->user();
        $removed = 0;
        $skipped = 0;

        foreach (MediaDomain::TYPES as $type) {
            // ⚠️ რელაცია მედია-მოდელის scope-ებს იმემკვიდრეობს — მხოლოდ ჩემი, ურნის გარეშე
            $records = $castMember->{MediaDomain::relation($type)}()->get();

            if ($records->isEmpty()) {
                continue;
            }

            if (! $user->hasModule($type) || ! $user->hasPermission($type, 'update')) {
                $skipped += $records->count();

                continue;
            }

            foreach ($records as $record) {
                $removed += (int) $detacher->detach($record, $castMember);
            }
        }

        return response()->json(['removed' => $removed, 'skipped' => $skipped]);
    }

    /**
     * ბარათი — ⚠️ რიცხვები **ჩემი ბიბლიოთეკისაა** და არა TMDB-ის ფილმოგრაფიის.
     *
     * @return array<string, mixed>
     */
    private function card(CastMember $member, ActorIndex $index): array
    {
        return [
            'id' => $member->id,
            'name' => $member->name,
            'name_ka' => $member->name_ka,
            'photo' => $member->photo_path ? asset('storage/'.$member->photo_path) : null,
            'gender' => $member->gender,
            'known_for' => $member->known_for,
            'popularity' => $member->popularity,
            'has_tmdb' => (bool) $member->tmdb_person_id,
            'synced' => $member->details_synced_at !== null,
            'counts' => [
                'movie' => (int) $member->getAttribute('movie_count'),
                'series' => (int) $member->getAttribute('series_count'),
                'anime' => (int) $member->getAttribute('anime_count'),
            ],
            'records' => (int) $member->getAttribute('records_count'),
            'photos' => (int) $member->getAttribute('photos_count'),
            'tags' => $index->tagsOf((int) $member->id),
        ];
    }
}
