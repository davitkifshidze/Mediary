<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Person;
use App\Models\PersonalAlbum;
use App\Models\PersonalMedia;
use App\Services\Personal\PersonalGallery;
use App\Services\Storage\StorageMeter;
use Illuminate\Http\Request;

/**
 * **პირადი გალერეის შეჯამება და ჯგუფები.**
 *
 * „ფოტო & ვიდეო" ჩანართი ყველაფერს ერთად აჩვენებს, დაჯგუფებით — **პიროვნებით ·
 * ალბომით** (და „დაუჯგუფებელი" — `GET /personal/media?ungrouped=1`). ⚠️ ჯგუფი
 * სერვერზე ითვლება და არა SPA-ში: ათასობით ფოტოს ჩამოტანა მხოლოდ იმისთვის,
 * რომ ჯგუფებად დაიყოს, სწორედ ის შეცდომაა, რომელსაც სიების გვერდებად დაყოფა
 * ასწორებდა (`LibraryStats`-ის წესი).
 *
 * ⚠️ **თვეებით დაჯგუფება აღარ არის** — გადაღების თარიღი მხოლოდ სორტირებაა.
 */
class PersonalGalleryController extends Controller
{
    public const GROUP_BY = ['person', 'album'];

    public function __construct(
        private PersonalGallery $gallery,
        private StorageMeter $meter,
    ) {}

    /** მთვლელები ქვე-ნავიგაციისთვის და ადგილი (`StorageBar`) */
    public function summary(Request $request)
    {
        $media = PersonalMedia::query();

        return response()->json([
            'people' => Person::query()->count(),
            'albums' => PersonalAlbum::query()->count(),
            'photos' => (clone $media)->where('kind', 'photo')->count(),
            'videos' => (clone $media)->where('kind', 'video')->count(),
            'favorites' => (clone $media)->where('is_favorite', true)->count(),
            'ungrouped' => (clone $media)->whereNull('person_id')->whereNull('album_id')->count(),
            'bytes' => (int) (clone $media)->sum('size') + (int) (clone $media)->sum('thumb_size'),
            'storage' => $this->meter->usage($request->user()),
        ]);
    }

    /**
     * ჯგუფები — `?by=person|album`, თითოს რიცხვი და 4 ესკიზი.
     *
     * ⚠️ **„პიროვნების/ალბომის გარეშე" თავისი ბარათია** და ის ბოლოშია —
     * ცარიელი ჯგუფი საერთოდ არ ჩანს.
     *
     * ⚠️ **`person_id` — პიროვნების გვერდის „ალბომით" ხედი**: ითვლება მხოლოდ
     * მისი ფოტო/ვიდეო, ე.ი. ჯგუფად ჩანს ყველა ალბომი, სადაც ის არის — „გარე"
     * ალბომიც, სადაც მისი ფოტო დევს — და „ალბომის გარეშე". ჩაკეტილი და
     * დაუხსნელი პიროვნების ფოტოს `PersonalMedia`-ს ლოკის სქოუპი ისედაც მალავს,
     * ე.ი. პასუხი ცარიელი სიაა.
     */
    public function groups(Request $request)
    {
        $data = $request->validate([
            'by' => ['required', 'in:'.implode(',', self::GROUP_BY)],
            'kind' => ['nullable', 'in:'.implode(',', PersonalMedia::KINDS)],
            'favorite' => ['nullable', 'boolean'],
            'person_id' => ['nullable', 'integer'],
        ]);

        $base = PersonalMedia::query()
            ->when(isset($data['person_id']), fn ($q) => $q->where('person_id', (int) $data['person_id']))
            ->when(isset($data['kind']), fn ($q) => $q->where('kind', $data['kind']))
            ->when(! empty($data['favorite']), fn ($q) => $q->where('is_favorite', true));

        $groups = match ($data['by']) {
            'person' => $this->byPerson($base),
            'album' => $this->byAlbum($base),
        };

        return response()->json(['data' => $groups]);
    }

    /** @return list<array<string, mixed>> */
    private function byPerson($base): array
    {
        $counts = (clone $base)->selectRaw('person_id, kind, count(*) as total')
            ->groupBy('person_id', 'kind')
            ->get()
            ->groupBy(fn ($row) => (string) $row->person_id);

        $people = Person::query()->orderBy('sort_order')->orderBy('name')->get(['id', 'name']);
        $keys = [...$people->modelKeys(), null];
        $previews = $this->gallery->previews($base, 'person_id', $keys);

        $out = [];

        foreach ($people as $person) {
            $out[] = $this->group('person:'.$person->id, $person->name, ['person_id' => $person->id], $counts->get((string) $person->id), $previews[(string) $person->id] ?? []);
        }

        $out[] = $this->group('person:none', null, ['no_person' => true], $counts->get(''), $previews[''] ?? []);

        return array_values(array_filter($out, fn (array $g) => $g['total'] > 0));
    }

    /** @return list<array<string, mixed>> */
    private function byAlbum($base): array
    {
        $counts = (clone $base)->selectRaw('album_id, kind, count(*) as total')
            ->groupBy('album_id', 'kind')
            ->get()
            ->groupBy(fn ($row) => (string) $row->album_id);

        $albums = PersonalAlbum::query()->with('person:id,name')->orderBy('sort_order')->orderBy('name')->get();
        $keys = [...$albums->modelKeys(), null];
        $previews = $this->gallery->previews($base, 'album_id', $keys);

        $out = [];

        foreach ($albums as $album) {
            $group = $this->group('album:'.$album->id, $album->name, ['album_id' => $album->id], $counts->get((string) $album->id), $previews[(string) $album->id] ?? []);
            // ადამიანის ალბომი — ვისია (ქვესათაური)
            $group['subtitle'] = $album->person?->name;
            $out[] = $group;
        }

        $out[] = $this->group('album:none', null, ['no_album' => true], $counts->get(''), $previews[''] ?? []);

        return array_values(array_filter($out, fn (array $g) => $g['total'] > 0));
    }

    /**
     * @param  array<string, mixed>  $filter  რა ფილტრით გაიხსნება ჯგუფი (`GET /personal/media`)
     * @return array<string, mixed>
     */
    private function group(string $key, ?string $title, array $filter, $counts, array $previews): array
    {
        $photos = (int) ($counts?->firstWhere('kind', 'photo')?->total ?? 0);
        $videos = (int) ($counts?->firstWhere('kind', 'video')?->total ?? 0);

        return [
            'key' => $key,
            'title' => $title,
            'subtitle' => null,
            'filter' => $filter,
            'photos' => $photos,
            'videos' => $videos,
            'total' => $photos + $videos,
            'previews' => $previews,
        ];
    }
}
