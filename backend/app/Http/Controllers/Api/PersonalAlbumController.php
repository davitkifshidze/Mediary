<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ManagesRecordLock;
use App\Http\Controllers\Controller;
use App\Http\Resources\PersonalAlbumResource;
use App\Models\Person;
use App\Models\PersonalAlbum;
use App\Services\Personal\PersonalGallery;
use App\Support\PublicDomain;
use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **პირადი გალერეის ალბომები** — „გარეთ" და ადამიანის შიგნით.
 *
 * `?person_id=5` — ერთი ადამიანის ალბომები; `?outside=1` — მხოლოდ „გარე".
 * ⚠️ გვერდებად არ იჭრება (ადამიანების წესი) — ალბომი ათეულებია.
 *
 * ⚠️ **ჩაკეტილი ალბომი**: დაუხსნელს ცვლილება არ ეხება (423), და ის
 * **საჯარო ვერასდროს იქნება** — ჩაკეტვა ჩამრთველს თიშავს, ჩაკეტილზე
 * ჩართვა კი 422-ია.
 */
class PersonalAlbumController extends Controller
{
    use ManagesRecordLock;

    public function __construct(private PersonalGallery $gallery) {}

    public function index(Request $request)
    {
        $albums = $this->gallery->withCounts(PersonalAlbum::query()->with('person:id,name'))
            ->when($request->filled('person_id'), fn ($q) => $q->where('person_id', $request->integer('person_id')))
            ->when($request->boolean('outside'), fn ($q) => $q->whereNull('person_id'))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $this->gallery->covers($albums, 'album_id');

        return PersonalAlbumResource::collection($albums);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        // ⚠️ დამალულ ადამიანში შექმნილი ალბომი მაშინვე გაქრებოდა — ჯერ გახსნა
        RecordLocks::ensureOpen(isset($data['person_id']) ? Person::query()->find($data['person_id']) : null);

        $album = PersonalAlbum::create([
            ...$data,
            'user_id' => $request->user()->id,
            'sort_order' => (int) PersonalAlbum::query()->max('sort_order') + 1,
        ]);

        return (new PersonalAlbumResource($this->fresh($album)))->response()->setStatusCode(201);
    }

    public function show(PersonalAlbum $personalAlbum)
    {
        return new PersonalAlbumResource($this->fresh($personalAlbum));
    }

    /**
     * ⚠️ **ალბომის სხვა ადამიანზე გადატანა ფოტოებს თან მიაქვს** — ინვარიანტი
     * „ადამიანის ალბომის ფოტო მისია" (`PersonalGallery::followAlbum()`).
     */
    public function update(Request $request, PersonalAlbum $personalAlbum)
    {
        RecordLocks::ensureOpen($personalAlbum);

        $data = $this->validated($request, $personalAlbum);
        $movesPerson = array_key_exists('person_id', $data) && $data['person_id'] !== $personalAlbum->person_id;

        if ($movesPerson && $data['person_id'] !== null) {
            RecordLocks::ensureOpen(Person::query()->find($data['person_id']));
        }

        // ჩაკეტილი ალბომი საჯარო არასდროსაა
        abort_if(
            ($data['visibility'] ?? null) === 'public' && RecordLocks::isLocked($personalAlbum),
            422,
            'record_locked_not_public',
        );

        $personalAlbum->update($data);

        if ($movesPerson) {
            $this->gallery->followAlbum($personalAlbum);
        }

        return new PersonalAlbumResource($this->fresh($personalAlbum));
    }

    /**
     * ურნაში — ⚠️ **ნაგულისხმევად ფოტოები რჩება** (გალერეის ალბომის წესი:
     * „საქაღალდის" მოშორება ბიბლიოთეკის წაშლა ვერ იქნება) და ალბომის გარეშე
     * ჩანს; აღდგენა მათ უკან აბრუნებს. `with_media=1` — ფოტოები ალბომთან
     * ერთად მიდის ურნაში.
     */
    public function destroy(Request $request, PersonalAlbum $personalAlbum)
    {
        // ⚠️ „ფოტოები დამიტოვე" დამალულ ფოტოებს ალბომის გარეთ გააშიშვლებდა
        RecordLocks::ensureOpen($personalAlbum);

        if (! $request->boolean('with_media')) {
            $personalAlbum->release();
        }

        $personalAlbum->moveToTrash();

        return response()->noContent();
    }

    /** პაროლის დადება/შეცვლა/მოხსნა — `PUT /personal/albums/{album}/lock` */
    public function setLock(Request $request, PersonalAlbum $personalAlbum)
    {
        return $this->putLock($request, $personalAlbum);
    }

    /** გახსნა ამ სესიაში — `POST /personal/albums/{album}/unlock` */
    public function unlock(Request $request, PersonalAlbum $personalAlbum)
    {
        return $this->unlockRecord($request, $personalAlbum);
    }

    /** ისევ ჩაკეტვა — `POST /personal/albums/{album}/lock` */
    public function relock(PersonalAlbum $personalAlbum)
    {
        return $this->relockRecord($personalAlbum);
    }

    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer'],
        ]);

        foreach ($data['ids'] as $index => $id) {
            PersonalAlbum::query()->whereKey((int) $id)->update(['sort_order' => $index + 1]);
        }

        return $this->index($request);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?PersonalAlbum $album = null): array
    {
        $userId = $request->user()->id;

        $data = $request->validate([
            'name' => [$album ? 'sometimes' : 'required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'person_id' => [
                'nullable', 'integer',
                Rule::exists('persons', 'id')->where('user_id', $userId)->whereNull('trashed_at'),
            ],
            'cover_media_id' => [
                'nullable', 'integer',
                Rule::exists('personal_media', 'id')->where('user_id', $userId)->whereNull('trashed_at'),
            ],
            // საჯარო პროფილზე მხოლოდ ალბომი ჩანს, თავისი ჩამრთველით
            'visibility' => ['nullable', 'in:'.implode(',', PublicDomain::VALUES)],
        ]);

        if (array_key_exists('person_id', $data)) {
            $data['person_id'] = $data['person_id'] === null ? null : (int) $data['person_id'];
        }

        if (array_key_exists('visibility', $data) && $data['visibility'] === null) {
            unset($data['visibility']);
        }

        return $data;
    }

    protected function lockResponse(Model $record): mixed
    {
        /** @var PersonalAlbum $record */
        return new PersonalAlbumResource($this->fresh($record));
    }

    /**
     * ⚠️ **ჩაკეტვა საჯაროობას თიშავს** — ცხადად და არა მხოლოდ საჯარო
     * query-ში: ჩამრთველი ტყუილს არ უნდა ამბობდეს, ლოკის მოხსნა კი ალბომს
     * უკითხავად აღარ გამოაქვეყნებს.
     */
    protected function lockChanged(Model $record, bool $locked): void
    {
        if ($locked && $record->getAttribute('visibility') === 'public') {
            $record->update(['visibility' => 'private']);
        }
    }

    private function fresh(PersonalAlbum $album): PersonalAlbum
    {
        $album = $this->gallery->withCounts(PersonalAlbum::query()->with('person:id,name'))->findOrFail($album->id);
        $this->gallery->covers($album->newCollection([$album]), 'album_id');

        return $album;
    }
}
