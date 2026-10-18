<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ManagesRecordLock;
use App\Http\Controllers\Controller;
use App\Http\Resources\PersonResource;
use App\Models\Person;
use App\Services\Personal\PersonalGallery;
use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **ადამიანები პირად გალერეაში** — `/personal/people`.
 *
 * ⚠️ **ნაგულისხმევი ადამიანი არ იქმნება** (გალერეის ალბომის წესი): ის მხოლოდ
 * მაშინ არსებობს, როცა შენ დაამატე — გამოგონილი „მე" ცარიელ ბარათად დაიდებოდა.
 *
 * ⚠️ **სია გვერდებად არ იჭრება** — ადამიანები ათეულებია და არა ათასები,
 * ხოლო ბადე, გადატანის ამრჩევი და ჯგუფები მთელ სიას ერთად ითხოვს.
 *
 * ⚠️ **ჩაკეტილი ადამიანი** სიაში რჩება, მაგრამ დაუხსნელს ცვლილება
 * არ ეხება — რედაქტირება და წაშლა 423-ია (`RecordLocks::ensureOpen()`).
 */
class PersonalPersonController extends Controller
{
    use ManagesRecordLock;

    public function __construct(private PersonalGallery $gallery) {}

    public function index()
    {
        $people = $this->gallery->withCounts(Person::query(), albums: true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $this->gallery->covers($people, 'person_id');

        return PersonResource::collection($people);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

        $person = Person::create([
            ...$data,
            'user_id' => $request->user()->id,
            // ბოლოში ჩნდება — ახალი ადამიანი არსებულ რიგს არ არევს
            'sort_order' => (int) Person::query()->max('sort_order') + 1,
        ]);

        return (new PersonResource($this->fresh($person)))->response()->setStatusCode(201);
    }

    public function show(Person $person)
    {
        return new PersonResource($this->fresh($person));
    }

    public function update(Request $request, Person $person)
    {
        RecordLocks::ensureOpen($person);

        $person->update($this->validated($request, $person));

        return new PersonResource($this->fresh($person));
    }

    /**
     * ურნაში — ⚠️ **ნაგულისხმევად შიგთავსი ადამიანთან ერთად მიდის** (მისი
     * ნაწილია და აღდგენა მასთან ერთად აბრუნებს); `keep=1` — ფოტოები და
     * ალბომები უჯგუფოდ რჩება (`Person::release()`), აღდგენა კი უკან მიაბამს.
     */
    public function destroy(Request $request, Person $person)
    {
        // ⚠️ „შიგთავსი დამიტოვე" დამალულ ფოტოებს უჯგუფოდ გააშიშვლებდა — ჯერ გახსნა
        RecordLocks::ensureOpen($person);

        if ($request->boolean('keep')) {
            $person->release();
        }

        $person->moveToTrash();

        return response()->noContent();
    }

    /** პაროლის დადება/შეცვლა/მოხსნა — `PUT /personal/people/{person}/lock` */
    public function setLock(Request $request, Person $person)
    {
        return $this->putLock($request, $person);
    }

    /** გახსნა ამ სესიაში — `POST /personal/people/{person}/unlock` */
    public function unlock(Request $request, Person $person)
    {
        return $this->unlockRecord($request, $person);
    }

    /** ისევ ჩაკეტვა — `POST /personal/people/{person}/lock` */
    public function relock(Person $person)
    {
        return $this->relockRecord($person);
    }

    /** მთელი რიგი ერთად (`GalleryAlbumController::reorder()`-ის წესი) */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer'],
        ]);

        foreach ($data['ids'] as $index => $id) {
            Person::query()->whereKey((int) $id)->update(['sort_order' => $index + 1]);
        }

        return $this->index();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Person $person = null): array
    {
        $userId = $request->user()->id;

        return $request->validate([
            'name' => [$person ? 'sometimes' : 'required', 'string', 'max:120'],
            'birthday' => ['nullable', 'date', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:5000'],
            // ყდა — ჩემი ფოტო (ურნაში მყოფი არა)
            'cover_media_id' => [
                'nullable', 'integer',
                Rule::exists('personal_media', 'id')->where('user_id', $userId)->whereNull('trashed_at'),
            ],
        ]);
    }

    protected function lockResponse(Model $record): mixed
    {
        /** @var Person $record */
        return new PersonResource($this->fresh($record));
    }

    private function fresh(Person $person): Person
    {
        $person = $this->gallery->withCounts(Person::query(), albums: true)->findOrFail($person->id);
        $this->gallery->covers($person->newCollection([$person]), 'person_id');

        return $person;
    }
}
