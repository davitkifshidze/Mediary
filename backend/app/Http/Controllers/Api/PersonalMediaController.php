<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PersonalMediaResource;
use App\Models\Person;
use App\Models\PersonalAlbum;
use App\Models\PersonalMedia;
use App\Services\Personal\MediaInspector;
use App\Services\Personal\PersonalGallery;
use App\Services\Storage\StorageMeter;
use App\Support\AppTime;
use App\Support\Like;
use App\Support\RecordLocks;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * **ფოტო და ვიდეო პირად გალერეაში.**
 *
 * ⚠️ **ატვირთვა სათითაოა** — ერთი ფაილი ერთ მოთხოვნაში: SPA თითოს თავის
 * პროგრესს და ჩავარდნის მიზეზს აჩვენებს (`lib/pendingUploads.ts`-ის წესი),
 * 300-მეგაბაიტიანი ვიდეო კი პაკეტში მთელ რიგს გააჭედავდა.
 *
 * ⚠️ **ფაილი სერვერიდან მხოლოდ აქედან გადის** (`file` · `thumb`) — პირადი
 * დისკი, მფლობელობა (`owner` scope + `EnsureRecordOwnership`, სხვისი 404),
 * `SafeMime` და Range (ვიდეოს გადახვევა).
 */
class PersonalMediaController extends Controller
{
    /** სორტირება: გადაღების თარიღი · დამატება · ჩემი რიგი */
    public const SORTS = ['taken', 'added', 'manual'];

    /** ვიდეოს ოჯახის გაფართოებები — `UploadLimits::CATALOG['video']` */
    private const VIDEO_EXTENSIONS = UploadLimits::CATALOG['video'];

    public function __construct(
        private StorageMeter $meter,
        private MediaInspector $inspector,
        private PersonalGallery $gallery,
    ) {}

    public function index(Request $request)
    {
        $data = $request->validate([
            'person_id' => ['nullable', 'integer'],
            'album_id' => ['nullable', 'integer'],
            // უჯგუფო — არც ადამიანი, არც ალბომი
            'ungrouped' => ['nullable', 'boolean'],
            // ადამიანის გარეშე (ალბომში შეიძლება იყოს)
            'no_person' => ['nullable', 'boolean'],
            'no_album' => ['nullable', 'boolean'],
            'kind' => ['nullable', 'in:'.implode(',', PersonalMedia::KINDS)],
            'favorite' => ['nullable', 'boolean'],
            // `YYYY-MM` ან `undated`
            'month' => ['nullable', 'string', 'regex:/^(\d{4}-\d{2}|undated)$/'],
            'q' => ['nullable', 'string', 'max:200'],
            'sort' => ['nullable', 'in:'.implode(',', self::SORTS)],
        ]);

        $query = $this->filtered(PersonalMedia::query(), $data);
        $this->sort($query, $data['sort'] ?? 'taken');

        return PersonalMediaResource::collection($this->paginated($request, $query));
    }

    /**
     * **ატვირთვა** — ერთი ფაილი; ფოტო თუ ვიდეო, ამას შიგთავსი წყვეტს (`finfo`).
     *
     * ⚠️ **შემოწმება შენახვამდე** (ზომები, EXIF-ის თარიღი, ესკიზი) — ატვირთული
     * დროებითი ფაილი უკვე დისკზეა და მისი წაკითხვა ორჯერ არ გვიწევს.
     * ⚠️ ესკიზიც კვოტაშია (`storeContents()`); თუ მისთვის ადგილი აღარ დარჩა,
     * ფაილი მაინც ინახება — უბრალოდ ესკიზის გარეშე.
     */
    public function store(Request $request)
    {
        $request->validate(['file' => ['required', 'file']]);

        $user = $request->user();
        /** @var UploadedFile $file */
        $file = $request->file('file');
        /* ⚠️ MIME-ის გარდა გაფართოებაც (შიგთავსიდან გამოცნობილი): MP4-ს `finfo`
           ზოგჯერ `application/mp4`-ად კითხულობს და ვიდეო ფოტოს წესით ჩავარდებოდა */
        $kind = str_starts_with(SafeMime::ofUpload($file), 'video/')
            || in_array(strtolower((string) $file->guessExtension()), self::VIDEO_EXTENSIONS, true)
            ? 'video' : 'photo';

        $data = $request->validate([
            'file' => ['required', ...UploadLimits::rule($kind === 'video' ? 'personal_video' : 'personal_photo', $user)],
            'person_id' => ['nullable', 'integer', Rule::exists('persons', 'id')->where('user_id', $user->id)->whereNull('trashed_at')],
            'album_id' => ['nullable', 'integer', Rule::exists('personal_albums', 'id')->where('user_id', $user->id)->whereNull('trashed_at')],
            'caption' => ['nullable', 'string', 'max:500'],
            // ბრაუზერის `File.lastModified` — როცა EXIF/ვიდეოს თარიღი არ არის
            'taken_at' => ['nullable', 'date'],
        ]);

        $personId = isset($data['person_id']) ? (int) $data['person_id'] : null;
        $albumId = isset($data['album_id']) ? (int) $data['album_id'] : null;

        // ადამიანის ალბომში ატვირთული ფოტო მისი ადამიანისაა (ინვარიანტი)
        if ($albumId !== null) {
            $personId = $this->openTarget($personId, $albumId)?->person_id ?? $personId;
        } else {
            $this->openTarget($personId, null);
        }

        $meta = $this->inspector->inspect((string) $file->getRealPath(), $kind);
        $path = $this->meter->storeUpload($user, $file, StorageFolder::personalMedia($kind));
        [$thumbPath, $thumbSize] = $this->storeThumb($request, $meta['thumb']);

        $media = PersonalMedia::create([
            'user_id' => $user->id,
            'person_id' => $personId,
            'album_id' => $albumId,
            'kind' => $kind,
            'path' => $path,
            'original_name' => mb_substr((string) $file->getClientOriginalName(), 0, 255) ?: basename($path),
            'mime' => SafeMime::ofUpload($file),
            'size' => (int) $file->getSize(),
            'thumb_path' => $thumbPath,
            'thumb_size' => $thumbSize,
            'width' => $meta['width'],
            'height' => $meta['height'],
            'duration' => $meta['duration'],
            'taken_at' => $meta['taken_at'] ?? $this->hint($data['taken_at'] ?? null),
            'caption' => $data['caption'] ?? null,
        ]);

        return (new PersonalMediaResource($media))->response()->setStatusCode(201);
    }

    /** წარწერა და გადაღების თარიღი — ფაილი არ იცვლება */
    public function update(Request $request, PersonalMedia $personalMedia)
    {
        $data = $request->validate([
            'caption' => ['nullable', 'string', 'max:500'],
            'taken_at' => ['nullable', 'date'],
        ]);

        $personalMedia->update($data);

        return new PersonalMediaResource($personalMedia->fresh());
    }

    public function toggleFavorite(PersonalMedia $personalMedia)
    {
        $personalMedia->update(['is_favorite' => ! $personalMedia->is_favorite]);

        return new PersonalMediaResource($personalMedia->fresh());
    }

    /**
     * **გადატანა ადამიანში/ალბომში** — მრავალმონიშვნით (`PhotoGrid`-ის „მონიშვნა").
     *
     * ⚠️ `POST`-ია და ბოლო სეგმენტი `move` (`UPDATE_ENDPOINTS`) — უფლება `update`.
     * გასაღების **არსებობა** ნიშნავს ცვლილებას: `person_id: null` ადამიანს ხსნის,
     * გასაღების არქონა — ხელს არ ახლებს.
     */
    public function move(Request $request)
    {
        $userId = $request->user()->id;

        $data = $request->validate([
            'ids' => ['required', 'array', 'max:1000'],
            'ids.*' => ['integer'],
            'person_id' => ['nullable', 'integer', Rule::exists('persons', 'id')->where('user_id', $userId)->whereNull('trashed_at')],
            'album_id' => ['nullable', 'integer', Rule::exists('personal_albums', 'id')->where('user_id', $userId)->whereNull('trashed_at')],
        ]);

        $changes = [];
        foreach (['person_id', 'album_id'] as $key) {
            if ($request->exists($key)) {
                $changes[$key] = $data[$key] === null ? null : (int) $data[$key];
            }
        }

        abort_if($changes === [], 422, 'nothing_to_move');

        $this->openTarget($changes['person_id'] ?? null, $changes['album_id'] ?? null);

        $media = PersonalMedia::query()->whereIn('id', array_map('intval', $data['ids']))->get();

        return response()->json(['moved' => $this->gallery->move($media, $changes)]);
    }

    /**
     * **დამალულ ადამიანში/ალბომში ჩაგდება 423-ია** — ფოტო მომხმარებლის
     * თვალწინ უკვალოდ „გაქრებოდა"; ჯერ გახსნა. ⚠️ ალბომი `personal_lock`-ის
     * გარეშე იკითხება: დამალული ადამიანის ალბომი scope-ით უბრალოდ „არ
     * არსებობდა", ფოტო კი მის `album_id`-ს უადამიანოდ მიიღებდა.
     */
    private function openTarget(?int $personId, ?int $albumId): ?PersonalAlbum
    {
        $album = $albumId !== null ? PersonalAlbum::withoutGlobalScope('personal_lock')->find($albumId) : null;

        RecordLocks::ensureOpen($album);
        RecordLocks::ensureOpen($album?->person_id ? Person::query()->find($album->person_id) : null);
        RecordLocks::ensureOpen($personId !== null ? Person::query()->find($personId) : null);

        return $album;
    }

    /** მთელი რიგი ერთად — „ჩემი რიგით" ხედისთვის */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'max:2000'],
            'ids.*' => ['integer'],
        ]);

        foreach ($data['ids'] as $index => $id) {
            PersonalMedia::query()->whereKey((int) $id)->update(['sort_order' => $index + 1]);
        }

        return response()->noContent();
    }

    /** ურნაში — ფაილი და კვოტა ადგილზე რჩება, აღდგენა უკან აბრუნებს */
    public function destroy(PersonalMedia $personalMedia)
    {
        $personalMedia->moveToTrash();

        return response()->noContent();
    }

    /** მონიშნულების წაშლა (ურნაში) — `DELETE /personal/media` + `ids` */
    public function destroyMany(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'max:1000'],
            'ids.*' => ['integer'],
        ]);

        $count = 0;

        foreach (PersonalMedia::query()->whereIn('id', array_map('intval', $data['ids']))->get() as $media) {
            $count += $media->moveToTrash() ? 1 : 0;
        }

        return response()->json(['trashed' => $count]);
    }

    /**
     * ფაილი — Range-ით (ვიდეოს გადახვევა), `SafeMime`-ით.
     *
     * `?download=1` — ჩამოტვირთვა ორიგინალი სახელით (`attachment`): SPA მას
     * პირდაპირი ბმულით იძახებს და არა blob-ით — 300-მეგაბაიტიანი ვიდეო
     * მეხსიერებაში არ უნდა ჩაიტვირთოს.
     */
    public function file(Request $request, PersonalMedia $personalMedia): BinaryFileResponse
    {
        return $this->gallery->fileResponse($personalMedia, $request->boolean('download'));
    }

    /**
     * ესკიზი — ⚠️ **ბრაუზერში იქეშება** (`private`, ერთი თვე): ბადე ათეულობით
     * ესკიზს კითხულობს და ყოველ გახსნაზე თავიდან მოთხოვნა ზედმეტი იქნებოდა;
     * მისამართს ვერსია ახლავს (`thumbUrl()` — `?v=`).
     */
    public function thumb(PersonalMedia $personalMedia): BinaryFileResponse
    {
        return $this->gallery->thumbResponse($personalMedia, 'private, max-age=2592000, immutable');
    }

    /* ---------- დამხმარეები ---------- */

    /** @param array<string, mixed> $data */
    private function filtered(Builder $query, array $data): Builder
    {
        return $query
            ->when(isset($data['person_id']), fn ($q) => $q->where('person_id', (int) $data['person_id']))
            ->when(isset($data['album_id']), fn ($q) => $q->where('album_id', (int) $data['album_id']))
            ->when(! empty($data['ungrouped']), fn ($q) => $q->whereNull('person_id')->whereNull('album_id'))
            ->when(! empty($data['no_person']), fn ($q) => $q->whereNull('person_id'))
            ->when(! empty($data['no_album']), fn ($q) => $q->whereNull('album_id'))
            ->when(isset($data['kind']), fn ($q) => $q->where('kind', $data['kind']))
            ->when(! empty($data['favorite']), fn ($q) => $q->where('is_favorite', true))
            ->when(isset($data['month']), function ($q) use ($data) {
                if ($data['month'] === 'undated') {
                    return $q->whereNull('taken_at');
                }

                $from = Carbon::createFromFormat('Y-m-d H:i:s', $data['month'].'-01 00:00:00', AppTime::zone());

                return $q->where('taken_at', '>=', $from)->where('taken_at', '<', $from->copy()->addMonth());
            })
            ->when(isset($data['q']) && trim((string) $data['q']) !== '', function ($q) use ($data) {
                $like = Like::contains(trim((string) $data['q']));

                $q->where(fn ($w) => $w->where('caption', 'like', $like)->orWhere('original_name', 'like', $like));
            });
    }

    private function sort(Builder $query, string $sort): void
    {
        match ($sort) {
            'added' => $query->orderByDesc('created_at')->orderByDesc('id'),
            'manual' => $query->orderBy('sort_order')->orderByDesc('taken_at')->orderByDesc('id'),
            // ⚠️ თარიღის გარეშე ფოტო ბოლოშია (ორივე დრაივერზე `NULL` DESC-ში ბოლოა)
            default => $query->orderByDesc('taken_at')->orderByDesc('id'),
        };
    }

    /**
     * ესკიზის შენახვა — კვოტით; ადგილის უქონლობა ატვირთვას არ აჩერებს.
     *
     * @return array{0: string|null, 1: int}
     */
    private function storeThumb(Request $request, ?string $bytes): array
    {
        if ($bytes === null || $bytes === '') {
            return [null, 0];
        }

        try {
            $path = $this->meter->storeContents($request->user(), $bytes, StorageFolder::PERSONAL_THUMBS, $this->inspector->thumbExtension());

            return [$path, strlen($bytes)];
        } catch (HttpResponseException) {
            return [null, 0];
        }
    }

    /** ბრაუზერის თარიღი — მომავალი და 1970 (ცარიელი `lastModified`) არ ითვლება */
    private function hint(?string $value): ?Carbon
    {
        if (! $value) {
            return null;
        }

        try {
            $moment = AppTime::at(Carbon::parse($value));
        } catch (\Throwable) {
            return null;
        }

        return $moment && $moment->year > 1971 && $moment->lessThanOrEqualTo(now()->addDay()) ? $moment : null;
    }
}
