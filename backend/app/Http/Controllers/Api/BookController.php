<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookResource;
use App\Models\Book;
use App\Services\Books\OpenLibraryClient;
use App\Services\Storage\StorageMeter;
use App\Support\Lang;
use App\Support\Like;
use App\Support\StorageFolder;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * წიგნების მოდული (`book`, Tasks §12).
 *
 * მფლობელობა — `BelongsToUser` global scope (სხვისი ჩანაწერი 404), უფლებები —
 * `permission:book` middleware. გამამდიდრებელი წყარო Open Library-ია
 * (კლავიშს არ ითხოვს), ნაკადი კი TMDB-ის იდენტურია: ჯერ **კანდიდატების სია**,
 * მერე არჩეულის დრაფტი — ავტომატურ დამთხვევას განზრახ ვერიდებით.
 */
class BookController extends Controller
{
    public function __construct(
        private StorageMeter $meter,
        private OpenLibraryClient $openLibrary,
    ) {}

    public function index(Request $request)
    {
        $query = Book::query()->with('genre')->withCount(['files', 'notes']);

        if ($status = $request->string('status')->toString()) {
            $query->where('status', $status);
        }
        if ($format = $request->string('format')->toString()) {
            $query->where('format', $format);
        }
        if ($request->boolean('favorite')) {
            $query->where('is_favorite', true);
        }
        // ჟანრები/ტეგები — მძიმით გამოყოფილი სია (იგივე წესი, რაც სიმღერებზე)
        if ($genres = $this->slugList($request->string('genre_id')->toString())) {
            $query->whereIn('genre_id', array_map('intval', $genres));
        }
        foreach ($this->slugList($request->string('tag')->toString()) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
        if ($author = $request->string('author')->toString()) {
            $query->where('author', $author);
        }
        if ($series = $request->string('series')->toString()) {
            $query->where('series_name', $series);
        }

        if ($q = $request->string('q')->toString()) {
            $query->where(fn (Builder $inner) => $inner
                ->where('title_ka', 'like', Like::contains($q))
                ->orWhere('title_en', 'like', Like::contains($q))
                ->orWhere('author', 'like', Like::contains($q))
                ->orWhere('series_name', 'like', Like::contains($q))
                ->orWhere('isbn', 'like', Like::contains($q))
                ->orWhere('tags', 'like', Like::contains($q)));
        }

        match ($request->string('sort')->toString()) {
            'title' => $query->orderBy('title_en')->orderBy('title_ka'),
            'author' => $query->orderBy('author')->orderBy('series_number'),
            'series' => $query->orderBy('series_name')->orderBy('series_number'),
            'year' => $query->orderByDesc('year'),
            'rating' => $query->orderByDesc('rating'),
            'pages' => $query->orderByDesc('pages'),
            'oldest' => $query->orderBy('id'),
            default => $query->orderByDesc('id'),
        };

        return BookResource::collection($this->paginated($request, $query));
    }

    public function show(Book $book)
    {
        return new BookResource($book->load('genre')->loadCount(['files', 'notes']));
    }

    public function store(Request $request)
    {
        $book = new Book;
        $this->apply($book, $request, $this->validated($request));
        $book->save();

        $this->fetchCover($book, $request);

        return (new BookResource($book->refresh()->load('genre')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, Book $book)
    {
        $this->apply($book, $request, $this->validated($request, $book));
        $book->save();

        return new BookResource($book->load('genre')->loadCount(['files', 'notes']));
    }

    public function destroy(Book $book)
    {
        // ყდას, ფაილებს და გალერეას `Book::booted()` შლის — კვოტაც იქვე თავისუფლდება
        $book->delete();

        return response()->noContent();
    }

    public function toggleFavorite(Book $book)
    {
        $book->is_favorite = ! $book->is_favorite;
        $book->save();

        return new BookResource($book->load('genre'));
    }

    /** სტატუსის ცვლილება ცალკე endpoint-ია — ბარათიდან ერთი კლიკია (მედიის ანალოგი) */
    public function setStatus(Request $request, Book $book)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(Book::STATUSES)],
        ]);

        $book->status = $data['status'];

        // „წაკითხული" პროგრესსაც ავსებს — თორემ ბარათი 40%-ზე გაჩერდებოდა
        if ($data['status'] === 'read') {
            $book->syncProgress($book->pages ?: null, 100);
        }

        $book->save();

        return new BookResource($book->load('genre'));
    }

    /** კითხვის პროგრესი — გვერდი ან პროცენტი; მოდელი მეორეს თვითონ ითვლის */
    public function setProgress(Request $request, Book $book)
    {
        $data = $request->validate([
            'page' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'percent' => ['nullable', 'integer', 'min:0', 'max:100'],
        ]);

        $book->syncProgress(
            $data['page'] ?? null,
            array_key_exists('percent', $data) ? $data['percent'] : null,
        );

        // პროგრესის დაწყება სტატუსსაც ნიშნავს — ხელით გადართვა ზედმეტია
        if ($book->status === 'to_read' && (int) $book->progress_percent > 0) {
            $book->status = 'reading';
        }
        if ((int) $book->progress_percent === 100) {
            $book->status = 'read';
        }

        $book->save();

        return new BookResource($book->load('genre'));
    }

    /* ---------- Open Library (§12-ის enrichment) ---------- */

    /**
     * არჩევანის სია — ავტომატურად არაფერს ვამთხვევთ (TMDB-ის იგივე წესი).
     *
     * ⚠️ **ქართული ასოებით დაწერილ შეკითხვაზე წყარო საერთოდ არ იძახება**
     * (§5.7, შენი გადაწყვეტილება 2026-09-11): ქართული წიგნი **ხელით ემატება**.
     * Open Library მხოლოდ ლათინურს პასუხობს, ე.ი. ქართული შეკითხვა ისედაც
     * ცარიელი სიით ბრუნდებოდა — და ეს „ასეთი წიგნი არ არსებობს"-ად
     * იკითხებოდა. ახლა პასუხში `notice: manual_only` წერია და ინტერფეისი
     * ცხადად ამბობს, რომ ველები ხელით უნდა შეივსოს.
     *
     * ⚠️ **SerpApi აქ არ ჩაერთო და ვერც ჩაერთვებოდა** — მისი `google_books`
     * engine აღარ არსებობს (`Unsupported \`google_books\` search engine`),
     * `google&tbm=bks`-იც უარყოფილია. ე.ი. უცხოური წიგნის ერთადერთი წყარო
     * ისევ Open Library-ია (უფასო, ულიმიტო).
     */
    public function candidates(Request $request)
    {
        $data = $request->validate([
            'query' => ['required_without:isbn', 'nullable', 'string', 'max:255'],
            'isbn' => ['nullable', 'string', 'max:20'],
        ]);

        // ქართული შეკითხვა → ხელით შევსება; გარე გამოძახება არ ხდება
        if (empty($data['isbn']) && Lang::georgian($data['query'] ?? null) !== null) {
            return response()->json(['results' => [], 'notice' => 'manual_only']);
        }

        if (! empty($data['isbn'])) {
            $one = $this->openLibrary->byIsbn($data['isbn']);

            return $this->blocked() ?? response()->json(['results' => $one ? [$one] : []]);
        }

        $results = $this->openLibrary->search($data['query']);

        return $this->blocked() ?? response()->json(['results' => $results]);
    }

    /**
     * წყაროს ჩავარდნა → **503**, და არა ცარიელი სია.
     *
     * ⚠️ ამასთანავე ეს **500-ის ჩანაცვლებაცაა**: `OpenLibraryClient`-ს try/catch
     * არ ჰქონდა და `cURL error 28` გამონაკლისით ამოვიდა — ე.ი. წიგნის
     * დამატების დროს ეკრანზე გამონაკლისის ტექსტი ადგებოდა.
     */
    private function blocked()
    {
        return $this->openLibrary->blocked()
            ? response()->json(['message' => 'openlibrary_unavailable'], 503)
            : null;
    }

    /** არჩეული კანდიდატის დრაფტი ფორმის შესავსებად — ჩანაწერს **არ ქმნის** */
    public function lookup(Request $request)
    {
        $data = $request->validate(['key' => ['required', 'string', 'max:120']]);

        $draft = $this->openLibrary->details($data['key']);

        if (! $draft) {
            // ⚠️ „წყარო არ პასუხობს" და „ასეთი წიგნი არ არსებობს" სხვა ფაქტებია
            return $this->blocked() ?? response()->json(['message' => 'not_found'], 404);
        }

        return response()->json(['draft' => $draft]);
    }

    /* ---------- დამხმარეები ---------- */

    private function validated(Request $request, ?Book $book = null): array
    {
        $userId = $request->user()->id;

        // ⚠️ სტატუსი და ტიპი სავალდებულოა — ჩანაწერი ვერცერთის გარეშე ვერ შეინახება.
        // რედაქტირებისას `sometimes`: თუ ველი საერთოდ არ გამოიგზავნა, ძველი
        // მნიშვნელობა რჩება (შექმნისას სავალდებულო იყო) — მაგრამ ცარიელს ვეღარ გაგზავნი.
        $must = $book ? ['sometimes', 'required'] : ['required'];

        return $request->validate([
            // ერთი ენა მაინც სავალდებულოა — უსათაურო წიგნი სიაში ვერ იძებნება
            'title_ka' => ['nullable', 'string', 'max:255', 'required_without:title_en'],
            'title_en' => ['nullable', 'string', 'max:255', 'required_without:title_ka'],
            'description_ka' => ['nullable', 'string', 'max:20000'],
            'description_en' => ['nullable', 'string', 'max:20000'],

            'author' => ['nullable', 'string', 'max:255'],
            'publisher' => ['nullable', 'string', 'max:255'],
            'isbn' => [
                'nullable', 'string', 'max:20',
                // ⚠️ უნიკალურობა **user-ზეა** — ორმა ანგარიშმა ერთი წიგნი უნდა შეძლოს
                Rule::unique('books', 'isbn')->where('user_id', $userId)->ignore($book?->id),
            ],
            'year' => ['nullable', 'integer', 'min:1', 'max:2200'],
            'pages' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'language' => ['nullable', 'string', 'max:10'],
            // §5.7 — ერთი, მარტივი „წყაროს / წასაკითხი ლინკი" (`links`-ის ნაცვლად)
            'source_url' => ['nullable', 'string', 'max:1000', 'url'],

            'genre_id' => [
                ...$must, 'integer',
                Rule::exists('book_genres', 'id')->where('user_id', $userId),
            ],
            'series_name' => ['nullable', 'string', 'max:255'],
            'series_number' => ['nullable', 'integer', 'min:0', 'max:9999'],

            'format' => ['nullable', Rule::in(Book::FORMATS)],
            'status' => [...$must, Rule::in(Book::STATUSES)],
            'rating' => ['nullable', 'integer', 'min:1', 'max:'.Book::MAX_RATING],
            'is_favorite' => ['nullable', 'boolean'],
            'progress_page' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],

            'links' => ['nullable', 'array', 'max:10'],
            'links.*.label' => ['nullable', 'string', 'max:60'],
            'links.*.url' => ['required_with:links', 'string', 'max:1000', 'url'],
            'tags' => ['nullable', 'array', 'max:20'],
            'tags.*' => ['string', 'max:40'],

            'openlibrary_id' => ['nullable', 'string', 'max:60'],
            'cover_url' => ['nullable', 'string', 'max:1000', 'url'],
            'cover' => ['nullable', 'image', 'max:4096'],
            'remove_cover' => ['nullable', 'boolean'],
            'visibility' => ['nullable', Rule::in(['private', 'public'])],
        ]);
    }

    private function apply(Book $book, Request $request, array $data): void
    {
        $plain = [
            'title_ka', 'title_en', 'description_ka', 'description_en',
            'author', 'publisher', 'isbn', 'year', 'pages', 'language', 'source_url',
            'series_name', 'series_number', 'rating', 'openlibrary_id',
        ];

        foreach ($plain as $field) {
            if (array_key_exists($field, $data)) {
                $book->{$field} = $data[$field] ?: null;
            }
        }

        if (array_key_exists('genre_id', $data)) {
            $book->genre_id = $data['genre_id'] ?: null;
        }
        foreach (['format', 'status', 'visibility'] as $field) {
            if (! empty($data[$field])) {
                $book->{$field} = $data[$field];
            }
        }
        if (array_key_exists('tags', $data)) {
            $book->tags = Book::normalizeTags($data['tags'] ?? []);
        }
        if (array_key_exists('links', $data)) {
            $book->links = array_values(array_map(fn (array $link) => [
                'label' => $link['label'] ?? null,
                'url' => $link['url'],
            ], $data['links'] ?? []));
        }
        if ($request->has('is_favorite')) {
            $book->is_favorite = $request->boolean('is_favorite');
        }

        // პროგრესი ორივე ერთეულში ერთდროულად იწერება (იხ. `Book::syncProgress()`)
        if (array_key_exists('progress_page', $data) || array_key_exists('progress_percent', $data)) {
            $book->syncProgress($data['progress_page'] ?? null, $data['progress_percent'] ?? null);
        }

        if ($request->boolean('remove_cover')) {
            $book->deleteCover();
            $book->cover_path = null;
            $book->cover_source = null;
        }

        if (array_key_exists('cover_url', $data)) {
            $book->cover_url = $data['cover_url'] ?: null;
        }

        if ($request->hasFile('cover')) {
            // 17.3 — `storeUpload()` ატვირთვამდე ამოწმებს კვოტას (ამოწურვაზე 413)
            $book->deleteCover();
            $book->cover_path = $this->meter
                ->storeUpload($request->user(), $request->file('cover'), StorageFolder::BOOK_COVERS);
            $book->cover_source = 'upload';
            $book->cover_url = null;
        }
    }

    /**
     * Open Library-ს ყდის ჩამოტვირთვა შენახვისას.
     *
     * ⚠️ **კვოტაში არ ითვლება** (19.4/B): TMDB-ის პოსტერივით ეს user-ის
     * ატვირთვა არაა. ამიტომ `cover_source = 'openlibrary'` და ჩაწერა
     * `storeContents()`-ის გვერდით — `Storage`-ით პირდაპირ.
     */
    private function fetchCover(Book $book, Request $request): void
    {
        $coverId = $request->integer('openlibrary_cover_id');

        if (! $coverId || $book->cover_path) {
            return;
        }

        $body = $this->openLibrary->cover($coverId);

        if (! $body) {
            return;
        }

        $path = StorageFolder::BOOK_COVERS."/ol-{$coverId}.jpg";
        Storage::disk(StorageFolder::diskFor($path))->put($path, $body);

        $book->forceFill(['cover_path' => $path, 'cover_source' => 'openlibrary'])->save();
    }
}
