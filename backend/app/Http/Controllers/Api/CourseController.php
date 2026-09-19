<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CourseResource;
use App\Models\Course;
use App\Services\Bookmarks\LinkMetadata;
use App\Services\Storage\StorageMeter;
use App\Support\Like;
use App\Support\StorageFolder;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * კურსების მოდული (`course`, FEAT-25).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:course` middleware.
 *
 * ⚠️ **გამამდიდრებელი წყარო არ არსებობს** (Udemy/Coursera-ს კატალოგი
 * დახურულია), ე.ი. კანდიდატების ნაკადი აქ უაზროა. ერთადერთი დახმარება
 * `POST /courses/metadata`-ა — ბუკმარკის იგივე probe, რომელიც გვერდის
 * `<head>`-ს კითხულობს.
 */
class CourseController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    public function index(Request $request)
    {
        $query = Course::query()->with('category')->withCount('files');

        foreach ($this->slugList($request->string('status')->toString()) as $key) {
            $query->where('status', $key);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }

        /* ⚠️ კატეგორია **სვეტია** (ერთია ჩანაწერზე), ე.ი. `whereIn` და არა
           `whereHas`: მათი AND-ით კვეთა ყოველთვის ცარიელ სიას მოგვცემდა
           (ბუკმარკის იგივე მსჯელობა). */
        if ($categories = $this->slugList($request->string('category_id')->toString())) {
            $query->whereIn('category_id', array_map('intval', $categories));
        }
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
        if ($platform = $request->string('platform')->toString()) {
            $query->where('platform', $platform);
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn (Builder $inner) => $inner
                ->where('title', 'like', Like::contains($q))
                ->orWhere('description', 'like', Like::contains($q))
                ->orWhere('instructor', 'like', Like::contains($q))
                ->orWhere('platform', 'like', Like::contains($q))
                ->orWhere('tags', 'like', Like::contains($q)));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title'),
            'oldest' => $query->orderBy('id'),
            'rating' => $query->orderByDesc('rating'),
            'progress' => $query->orderByDesc('lessons_done'),
            'finished' => $query->orderByDesc('finished_at'),
            default => $query->orderByDesc('id'),
        };

        return CourseResource::collection($this->paginated($request, $query));
    }

    public function show(Course $course)
    {
        return new CourseResource($course->load('category')->loadCount('files'));
    }

    /**
     * გვერდის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის.
     * ⚠️ ჩავარდნა 200-ია ცარიელი ველებით და არა 5xx: კურსის გვერდი ბოტს
     * ხშირად 403-ს აძლევს და ეს ხელით შევსებას არ უნდა უშლიდეს (ბუკმარკის წესი).
     */
    public function metadata(Request $request, LinkMetadata $meta)
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:1000', 'url']]);

        return response()->json($meta->fetch($data['url']));
    }

    public function store(Request $request)
    {
        $course = new Course;
        $this->apply($course, $request, $this->validated($request));
        $course->save();

        return (new CourseResource($course->refresh()->load('category')->loadCount('files')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, Course $course)
    {
        $this->apply($course, $request, $this->validated($request, $course));
        $course->save();

        return new CourseResource($course->load('category')->loadCount('files'));
    }

    public function destroy(Course $course)
    {
        // ⚠️ **კალათა (FEAT-11)** — `delete()` კი არა, `moveToTrash()`
        $course->moveToTrash();

        return response()->noContent();
    }

    public function toggleFavorite(Course $course)
    {
        $course->is_favorite = ! $course->is_favorite;
        $course->save();

        return new CourseResource($course->load('category')->loadCount('files'));
    }

    /** სტატუსი ცალკე endpoint-ია — ბარათიდან ერთი კლიკია (მედიის ანალოგი) */
    public function setStatus(Request $request, Course $course)
    {
        $data = $request->validate(['status' => ['required', Rule::in(Course::STATUSES)]]);

        $course->status = $data['status'];
        // ⚠️ სტატუსსა და პროგრესს ერთი მეთოდი ათანხმებს — იხ. `Course::syncProgress()`
        $course->syncProgress();
        $course->save();

        return new CourseResource($course->load('category')->loadCount('files'));
    }

    /** გავლილი გაკვეთილები — წიგნის `progress`-ის ანალოგი */
    public function setProgress(Request $request, Course $course)
    {
        $data = $request->validate([
            'lessons_done' => ['required', 'integer', 'min:0', 'max:9999'],
        ]);

        $course->lessons_done = $data['lessons_done'];
        $course->syncProgress();
        $course->save();

        return new CourseResource($course->load('category')->loadCount('files'));
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?Course $course = null): array
    {
        /* ⚠️ სტატუსი და კატეგორია სავალდებულოა (2026-09-16-ის წესი).
           რედაქტირებისას `sometimes`: გამოტოვებული ველი ძველს ტოვებს,
           ცხადად ცარიელი კი 422-ია. */
        $must = $course ? ['sometimes', 'required'] : ['required'];

        return $request->validate([
            'title' => [$course ? 'sometimes' : 'required', 'string', 'max:255'],
            // ⚠️ ბმული **არასავალდებულოა**: ოფლაინ კურსსაც მისამართი არ აქვს
            'url' => ['nullable', 'string', 'max:1000', 'url'],
            'instructor' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'category_id' => [
                ...$must,
                'integer',
                Rule::exists('course_categories', 'id')->where('user_id', $request->user()->id),
            ],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],
            'lessons_total' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'lessons_done' => ['nullable', 'integer', 'min:0', 'max:9999'],
            // ⚠️ **წუთები და არა საათები** (§2.5-ის ერთეული) — 400 საათი = 24000 წთ
            'minutes' => ['nullable', 'integer', 'min:0', 'max:600000'],
            'status' => [...$must, Rule::in(Course::STATUSES)],
            'rating' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'is_favorite' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
            'image_url' => ['nullable', 'string', 'max:1000', 'url'],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'remove_thumbnail' => ['nullable', 'boolean'],
            'started_at' => ['nullable', 'date'],
            'finished_at' => ['nullable', 'date'],
        ]);
    }

    private function apply(Course $course, Request $request, array $data): void
    {
        foreach (['title', 'instructor', 'description', 'image_url'] as $field) {
            if (array_key_exists($field, $data)) {
                $course->{$field} = $data[$field] ?: null;
            }
        }
        foreach (['lessons_total', 'minutes', 'rating', 'started_at'] as $field) {
            if (array_key_exists($field, $data)) {
                $course->{$field} = $data[$field] !== '' ? $data[$field] : null;
            }
        }
        if (array_key_exists('category_id', $data)) {
            $course->category_id = $data['category_id'] ?: null;
        }
        if (! empty($data['status'])) {
            $course->status = $data['status'];
        }
        if (! empty($data['visibility'])) {
            $course->visibility = $data['visibility'];
        }
        if (array_key_exists('tags', $data)) {
            $course->tags = Course::normalizeTags($data['tags'] ?? []);
        }
        if (array_key_exists('lessons_done', $data)) {
            $course->lessons_done = (int) ($data['lessons_done'] ?? 0);
        }
        if ($request->has('is_favorite')) {
            $course->is_favorite = $request->boolean('is_favorite');
        }

        if (array_key_exists('url', $data)) {
            $changed = $course->url !== ($data['url'] ?: null);
            // ⚠️ `platform` მხოლოდ აქედან იწერება
            $course->applyUrl($data['url']);

            if ($changed && $course->url) {
                $this->autofill($course, $request);
            }
        }

        if ($request->boolean('remove_thumbnail')) {
            $course->deleteThumbnail();
            $course->thumbnail_path = null;
        }

        if ($request->hasFile('thumbnail')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            $course->deleteThumbnail();
            $course->thumbnail_path = $this->meter
                ->storeUpload($request->user(), $request->file('thumbnail'), StorageFolder::COURSE_THUMBNAILS);
        }

        /* ⚠️ **ბოლოს** — `finished_at`/`started_at` და გაკვეთილების ჭერი
           ერთმანეთზეა დამოკიდებული, ე.ი. შეთანხმება ყველა ველის ჩაწერის
           შემდეგ უნდა მოხდეს. */
        if (array_key_exists('finished_at', $data)) {
            $course->finished_at = $data['finished_at'] ?: null;
        }

        $course->syncProgress();
    }

    /**
     * ცარიელი ველების შევსება გვერდიდან. არასდროს გადააწერს იმას, რაც
     * user-მა შეავსო; ჩავარდნაზე ჩუმად გადის. `autofill=0`-ით გამორთვადია
     * (ბუკმარკის იგივე ქცევა და იგივე სერვისი).
     */
    private function autofill(Course $course, Request $request): void
    {
        if (! $request->boolean('autofill', true)) {
            return;
        }

        if ($course->title && $course->description && $course->image_url) {
            return;
        }

        $meta = app(LinkMetadata::class)->fetch((string) $course->url);

        if (! $course->title) {
            $course->title = $meta['title'] ?: $course->platform ?: (string) $course->url;
        }
        if (! $course->description && $meta['description']) {
            $course->description = $meta['description'];
        }
        if (! $course->thumbnail_path && ! $course->image_url && $meta['image_url']) {
            $course->image_url = $meta['image_url'];
        }
    }
}
