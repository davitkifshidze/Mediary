<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GalleryImageResource;
use App\Http\Resources\GalleryVideoResource;
use App\Http\Resources\StatusResource;
use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Services\Gallery\GalleryFetcher;
use App\Services\Gallery\GalleryScope;
use App\Services\Gallery\ModuleImages;
use App\Services\Storage\StorageMeter;
use App\Support\GalleryParent;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

/**
 * გალერეის მოდული (Tasks 10 → **§8, გალერეა 2.0**).
 *
 * ფოტოები `gallery_images`-ია — ჩანაწერის კადრები/პოსტერები ფილმზე/სერიალზე/
 * ანიმეზე (და სიმღერაზე/წიგნზე/თამაშზე, სადაც ვებიდან ჩამოიწერა), მსახიობის
 * ფოტოები კი **მსახიობზე** (`cast_member`), ე.ი. მსახიობის გვერდზეც იგივე
 * გალერეა ჩანს და ორ ფილმს შორის არ დუბლირდება. ვიდეო-ბმულები იმავე
 * მშობლებზე `gallery_videos`-შია (§8.1).
 *
 * ჩამოტვირთვა **სათითაოდ** მიდის — ციკლს ფრონტის რიგი მართავს, ისე
 * როგორც `/sync`-ზე (J3).
 *
 * ## რა შეიცვალა §8-ში
 *
 * ⚠️ **`GET /gallery` აღარ არის „ჩანაწერების სია ჩამოსატვირთად", არამედ
 * გვერდის შეჯამებაა.** ხაზით გაყოფილი „მასობრივი ჩამოტვირთვის" ბლოკი
 * მოიხსნა (user-ის პირდაპირი მითითება), ე.ი. იმ სიას გამომძახებელი აღარ
 * ჰყავდა; მის ადგილას გვერდითი ქვე-მენიუს მთვლელები დგას.
 *
 * ⚠️ **ჯგუფები აღარ შემოიფარგლება TMDB-ის დომენებით** — `GalleryParent`
 * არის „ვისაც ფოტო ჰკიდია" ერთადერთი სია. სიმღერაზე ვებიდან ჩამოწერილი
 * ფოტო აქამდე ბაზაში იდო, მაგრამ გალერეაში **არსად ჩანდა**.
 *
 * ⚠️ **ორი ახალი ჭრილი**: `by=provider` (TMDB · Wikimedia · Google — „საიდან
 * მოვიდა" წყაროს გაგებით) და `by=module` (სხვა მოდულების საკუთარი ფოტოები,
 * `ModuleImages`).
 */
class GalleryController extends Controller
{
    /** გაზომილი ტემპი — მიახლოებითი დროის შესაფასებლად (გალერეა სინქრონზე ნელია) */
    private const ITEMS_PER_MINUTE = 4.0;

    /**
     * მსახიობთა ავზის ჭერი პასუხში.
     *
     * ⚠️ ეს **სიის** ჭერია და არა ჩამოტვირთვის: 1000-ზე მეტი მსახიობი ერთ
     * არჩევანში ისედაც ვერ ჩანს, პასუხს კი გაბერავდა. ჭრილი პასუხში ცხადად
     * ბრუნდება (`cast_truncated`), რომ ინტერფეისმა ძებნა შესთავაზოს და არა
     * ჩუმად სრულ სიად აჩვენოს ნახევარი.
     */
    private const CAST_POOL_LIMIT = 1000;

    /**
     * „რამდენი ფოტო გამოჩნდეს" არჩევანის ჭერი (10 · 20 · 30 · 40 · 50 · ყველა).
     *
     * ⚠️ „ყველა" **უსასრულო არ არის** — ერთ პასუხში ათასი ფოტოს მეტს არ
     * ვაბრუნებთ, თორემ ერთი ჯგუფი მთელ გვერდს გაყინავდა. გვერდები ისევ
     * მუშაობს, ე.ი. ათასზე მეტი ფოტოც მისაწვდომია.
     */
    private const MAX_PER_PAGE = 1000;

    /**
     * რამდენ ჩანაწერამდე ვავსებთ სქესს TMDB-დან მსახიობების ტაბზე (§3.2).
     *
     * ⚠️ თითო ჩანაწერი **ერთი `credits` რექვესთია** — ასეულ ფილმზე გაშვებულს
     * გეგმის აწყობა წუთებად გადააქცევდა. პატარა სკოუპზე (ჩანაწერის გვერდი,
     * რამდენიმე მონიშნული) კი სწორედ ეს აკეთებს „ქალი/კაცი"-ს მუშაობადს.
     */
    private const GENDER_BACKFILL_RECORDS = 10;

    /**
     * ჯგუფის ესკიზების ნაგულისხმევი და მაქსიმალური რაოდენობა.
     *
     * ⚠️ §8.6-ის დასტას **ხუთი** ბარათი აქვს (სამი იყო), ე.ი. სამი ესკიზი
     * აღარ ჰყოფნის — დასტის უკანა ბარათები ცარიელი გამოჩნდებოდა.
     */
    private const DEFAULT_PREVIEWS = 5;

    private const MAX_PREVIEWS = 10;

    public function __construct(
        private GalleryFetcher $fetcher,
        private StorageMeter $meter,
        private ModuleImages $moduleImages,
    ) {}

    /**
     * **გალერეის შეჯამება — `GET /api/gallery` (§8.3).**
     *
     * ერთი გამოძახება ავსებს გვერდით ქვე-მენიუს: რამდენი ფოტოა, რამდენ
     * ჩანაწერზე, რამდენ მსახიობზე, რამდენი ვიდეო-ბმულია და რამდენ ადგილს
     * იკავებს. ⚠️ სამი ცალკე `groups` გამოძახება იმავეს რომ ეკეთებინა,
     * ქვე-მენიუს დახატვა სამ სრულ სიას ჩამოტვირთავდა.
     */
    public function summary(Request $request)
    {
        $user = $request->user();

        $images = GalleryImage::query()
            ->selectRaw('count(*) as photos, coalesce(sum(size), 0) as bytes')
            ->first();

        /* ⚠️ **`count(distinct a, b)` მხოლოდ MySQL-ს აქვს** — sqlite-ზე
           (ტესტები) იგივე შედეგი ქვე-მოთხოვნით მიიღება. არსებული წესი:
           დრაივერის სპეციფიკა ცხადად იჭრება და არა შემთხვევით. */
        /* ⚠️ `whereNotNull` ცხადად: SQL-ში `!=` ისედაც `NULL`-ს ტოვებს გარეთ,
           მაგრამ §26-ის შემდეგ უმშობლო რიგები მართლა არსებობს და ეს
           გამორიცხვა განზრახული უნდა ჩანდეს და არა შემთხვევითი. */
        $records = GalleryImage::query()
            ->whereNotNull('imageable_type')
            ->where('imageable_type', '!=', GalleryParent::ACTOR)
            ->distinct()
            ->count(DB::connection()->getDriverName() === 'mysql'
                ? DB::raw('imageable_type, imageable_id')
                : DB::raw("imageable_type || ':' || imageable_id"));

        $actors = GalleryImage::query()
            ->where('imageable_type', GalleryParent::ACTOR)
            ->distinct()
            ->count('imageable_id');

        /* ⚠️ **კატეგორიები რეალური რიცხვებიდან და არა ხელით დაწერილი სიიდან.**
           „ყველა · კადრი · პოსტერი · ლოგო · მსახიობი" ფრონტში კონსტანტა იყო,
           ამიტომ „ლოგო" მაშინაც ჩანდა, როცა ბიბლიოთეკაში **არცერთი ლოგო**
           არ არის (გაზომილი: actor 103 · backdrop 14 · poster 4 · logo 0).
           ნულიან კატეგორიას ჩიპი აღარ ეხატება. */
        $categories = GalleryImage::query()
            ->selectRaw('category, count(*) as photos')
            ->groupBy('category')
            ->pluck('photos', 'category')
            ->map(fn ($n) => (int) $n)
            ->all();

        /* §26 — უკატეგორიო (მშობლის გარეშე) და ალბომების რაოდენობა.
           ⚠️ ქვე-მენიუს ორივე რიცხვი აქედან მოსდის — ცალკე `groups`
           გამოძახება მთელ სიას ჩამოტვირთავდა მხოლოდ იმისთვის, რომ
           მენიუზე ერთი ციფრი დაეწერა. */
        $loose = GalleryImage::query()->whereNull('imageable_type')->count();

        return response()->json([
            'photos' => (int) ($images->photos ?? 0),
            'bytes' => (int) ($images->bytes ?? 0),
            'records' => (int) $records,
            'actors' => (int) $actors,
            'uncategorized' => (int) $loose,
            'albums' => GalleryAlbum::query()->count(),
            'categories' => (object) $categories,
            'videos' => GalleryVideo::query()->count(),
            // სხვა მოდულების ფოტოები — ცალკე ჭრილია, ე.ი. ცალკე მთვლელიც
            'module_groups' => count($this->moduleImages->groups($user, 1)),
            'domains' => MediaDomain::enabledFor($user),
            'storage' => $this->meter->usage($user),
        ]);
    }

    /**
     * **ჯგუფები (Tasks §3.2/§3.3 → §8.3).**
     *
     * `by=record` — ჩანაწერი და მისი ფოტოები (**ყველა მშობელი**, არა მხოლოდ
     *   TMDB-ის დომენები);
     * `by=actor` — მსახიობების ჯგუფები, სქესით ჭრით;
     * `by=source` — **რომელი დომენიდან** მოვიდა (ფილმი · სერიალი · ანიმე).
     *   ⚠️ მსახიობის ფოტო **მშობლად მსახიობს** ჰყავს (განზრახ — ერთი ფოტო ორ
     *   ფილმზე არ დუბლირდება), ე.ი. „საიდან" გამოითვლება იმით, **რომელ
     *   დომენში თამაშობს** ეს მსახიობი; ორივეში მოთამაშე ორივე ჯგუფში ჩანს.
     * `by=provider` — **რომელმა წყარომ მოიტანა** (TMDB · Wikimedia · Google · …).
     *   ⚠️ ეს `source`-ისგან სხვა კითხვაა და §8-მდე პასუხი არ ჰქონდა:
     *   ვებძებნის შემდეგ „საიდან მოვიდა" ორივე გაგებით იკითხება.
     * `by=module` — სხვა მოდულების საკუთარი ფოტოები (`ModuleImages`).
     *
     * ⚠️ **მხოლოდ ჯგუფები ბრუნდება, ფოტოები არა** — თითო ჯგუფს რამდენიმე
     * ესკიზი მოსდევს; სრული სია `photos()`-ია, გვერდებით (§3.7).
     */
    public function groups(Request $request)
    {
        $data = $request->validate([
            'by' => ['nullable', 'in:record,actor,source,provider,module,album'],
            /* ⚠️ **`type` აღარ არის მხოლოდ მედია-დომენი** (ეტაპი 2): ჩანაწერების
               ჭრილში ტაბებად ყველა მშობელი დგას — სიმღერაც, წიგნიც, თამაშიც —
               ე.ი. `MediaDomain::rule()` მათ 422-ს აძლევდა. */
            'type' => ['nullable', GalleryParent::recordRule()],
            'q' => ['nullable', 'string', 'max:200'],
            /* §3.2 — მსახიობების ჭრილი სქესითაც უნდა იყოფოდეს („ქალი/კაცი,
               თითო მსახიობი ცალკე"). TMDB-ის კოდირება: 1 = ქალი, 2 = კაცი. */
            'gender' => ['nullable', 'in:female,male'],
            /* ეტაპი 2 — „ფილმების გალერეა, სადაც მსახიობებიც შიგნითაა":
               მსახიობების ჯგუფები **დომენით** იჭრება (ვინც ამ დომენში თამაშობს). */
            'from' => ['nullable', MediaDomain::rule()],
            /* ეტაპი 2 — „ფოტოიანი/უფოტო". ⚠️ `without` სწორედ ის ჭრილია,
               რომლისთვისაც ჩამოტვირთვა არსებობს: აქამდე ჯგუფების სია
               `has('galleryImages')`-ით იწყებოდა, ე.ი. „რომელ ფილმს **არ**
               აქვს ფოტო" კითხვას გალერეაში პასუხი საერთოდ არ ჰქონდა. */
            'have' => ['nullable', 'in:with,without,all'],
            'genre' => ['nullable', 'string', 'max:400'],
            'status' => ['nullable', 'string', 'max:200'],
            'year_min' => ['nullable', 'integer', 'min:1800', 'max:2200'],
            'year_max' => ['nullable', 'integer', 'min:1800', 'max:2200'],
            'favorite' => ['nullable', 'boolean'],
            'previews' => ['nullable', 'integer', 'min:0', 'max:'.self::MAX_PREVIEWS],
        ]);

        $by = $data['by'] ?? 'record';
        $q = $data['q'] ?? null;
        $user = $request->user();
        $previews = (int) ($data['previews'] ?? self::DEFAULT_PREVIEWS);

        if ($by === 'album') {
            return $this->albumGroups($previews);
        }

        if ($by === 'module') {
            return response()->json([
                'by' => $by,
                'groups' => $this->moduleImages->groups($user, $previews),
                'previews' => [],
            ]);
        }

        if ($by === 'source') {
            return $this->sourceGroups($user, $previews);
        }

        if ($by === 'provider') {
            return $this->providerGroups($previews);
        }

        if ($by === 'actor') {
            return $this->actorGroups($data, $q, $previews);
        }

        return $this->recordGroups($user, $data, $q, $previews);
    }

    /**
     * მსახიობების ჯგუფები.
     *
     * ⚠️ ფოტო **მსახიობზეა** მიბმული (გლობალური ლექსიკონი), ე.ი. ჯგუფი
     * ისეთია, რომელსაც **ამ user-ის** ფოტო აქვს (`owner` scope).
     */
    private function actorGroups(array $data, ?string $q, int $previews)
    {
        $rows = GalleryImage::query()
            ->where('imageable_type', GalleryParent::ACTOR)
            ->selectRaw('imageable_id, count(*) photos, sum(size) bytes')
            ->groupBy('imageable_id')
            ->get();

        $members = CastMember::whereIn('id', $rows->pluck('imageable_id'))
            ->when($data['gender'] ?? null, fn ($query, $gender) => $query->where(
                'gender',
                $gender === 'female' ? CastMember::GENDER_FEMALE : CastMember::GENDER_MALE,
            ))
            /* ეტაპი 2 — დომენის ტაბი: „ფილმების გალერეაში" მხოლოდ ფილმების
               მსახიობები. ⚠️ `whereHas` მედია-მოდელზე `owner` scope-ს
               იმემკვიდრეობს, ე.ი. ეს **ამ user-ის** ბიბლიოთეკაა და არა
               ყველა ანგარიშის (იგივე წესი, რაც `sourceQuery()`-ს აქვს). */
            ->when(
                $data['from'] ?? null,
                fn ($query, $from) => $query->whereHas(MediaDomain::castRelation($from)),
            )
            ->get()
            ->keyBy('id');

        $groups = $rows
            ->map(function ($row) use ($members) {
                $member = $members->get($row->imageable_id);

                return $member ? [
                    'kind' => 'actor',
                    'id' => $member->id,
                    'title' => $member->name,
                    'title_ka' => $member->name_ka,
                    'poster_path' => $member->photo_path,
                    'photos' => (int) $row->photos,
                    'bytes' => (int) $row->bytes,
                    'has_tmdb' => (bool) $member->tmdb_person_id,
                    // §8.5 — „ყველა ქალის მონიშვნა" ჯგუფების ბადეზეც უნდა მუშაობდეს
                    'gender' => $member->gender,
                ] : null;
            })
            ->filter()
            ->when($q, fn ($c) => $c->filter(
                fn ($g) => str_contains(mb_strtolower($g['title'] ?? ''), mb_strtolower($q))
                    || str_contains(mb_strtolower($g['title_ka'] ?? ''), mb_strtolower($q))
            ))
            ->sortByDesc('photos')
            ->values();

        return response()->json([
            'by' => 'actor',
            'groups' => $groups,
            'previews' => $this->previews($groups, GalleryParent::ACTOR, $previews),
        ]);
    }

    /**
     * ჩანაწერების ჯგუფები — **ყველა მშობელი, არა მხოლოდ მედია-დომენები**.
     *
     * ⚠️ ეს იყო ხვრელი: სიმღერაზე/წიგნზე/თამაშზე ვებიდან ჩამოწერილი ფოტო
     * `gallery_images`-ში ჯდებოდა, მაგრამ ჯგუფებში მხოლოდ `MediaDomain::TYPES`
     * იკითხებოდა — ე.ი. ფოტო ბაზაში იყო და გალერეაში არსად ჩანდა.
     */
    private function recordGroups($user, array $data, ?string $q, int $previews)
    {
        $groups = collect();
        $have = $data['have'] ?? 'with';

        foreach (GalleryParent::recordKeys() as $type) {
            if (($data['type'] ?? null) && $data['type'] !== $type) {
                continue;
            }
            if (! $user->hasModule(GalleryParent::module($type))) {
                continue;
            }

            /** @var class-string<Model> $model */
            $model = GalleryParent::model($type);

            $query = $model::query()
                ->withCount('galleryImages as photos')
                ->withSum('galleryImages as photo_bytes', 'size');

            /* ⚠️ **„უფოტო" ცალკე შეკითხვაა და არა გაფილტრული სია.** `photos = 0`
               `withCount`-ის შედეგია, ე.ი. `where`-ში ვერ შევა (HAVING-ს კი
               ექვსი დომენის გაერთიანებაზე აზრი არ აქვს) — ამიტომ დარჩა `doesntHave`. */
            match ($have) {
                'without' => $query->doesntHave('galleryImages'),
                'all' => null,
                default => $query->has('galleryImages'),
            };

            if ($q) {
                $this->applyTitleSearch($query, $type, $model, $q);
            }

            $this->applyRecordFilters($query, $type, $data);

            // ჟანრი ბარათზეც გამოდის (შიდა დაჯგუფებისთვის), ე.ი. ერთხელ იტვირთება
            if (MediaDomain::has($type)) {
                $query->with('genres');
            }

            foreach ($query->get() as $row) {
                $groups->push([
                    'kind' => $type,
                    'id' => $row->id,
                    'title' => $row->title_en ?? $row->title ?? null,
                    'title_ka' => $row->title_ka ?? null,
                    'poster_path' => $this->coverOf($row),
                    'photos' => (int) $row->photos,
                    'bytes' => (int) $row->photo_bytes,
                    'has_tmdb' => (bool) ($row->tmdb_id ?? null),
                    /* ---- ეტაპი 2: შიდა დაჯგუფებისა და დალაგების საკვები ----
                       ⚠️ **დაჯგუფებას ბარათი თვითონ ვერ უპასუხებდა.** „ჟანრი /
                       წელი / სტატუსი" ფრონტზე ისე იყოფა, როგორც `MovieGrid`-ში
                       — ე.ი. სამივე ფაქტი ჯგუფშივე უნდა მოვიდეს, თორემ თითო
                       ბარათზე ცალკე მოთხოვნა დასჭირდებოდა. */
                    'year' => is_numeric($row->year ?? null) ? (int) $row->year : null,
                    'favorite' => (bool) ($row->is_favorite ?? false),
                    /* ⚠️ სტატუსი **ობიექტია და არა სტრიქონი** (§6.4): სახელი
                       მფლობელის ლექსიკონშია და გასაღები მარტო არ იკითხება.
                       არა-მედია მშობლებზე `null` — წიგნს/თამაშს ისევ enum აქვს,
                       სიმღერას კი სტატუსი საერთოდ არ აქვს. */
                    'status' => MediaDomain::has($type) ? StatusResource::brief($row->status) : null,
                    'genres' => MediaDomain::has($type)
                        ? $row->genres->map(fn ($genre) => [
                            'slug' => $genre->slug,
                            'name_ka' => $genre->name_ka,
                            'name_en' => $genre->name_en,
                        ])->values()->all()
                        : [],
                ]);
            }
        }

        /* ⚠️ **დალაგება backend-ზე მხოლოდ ფოტოებითაა და ეს განზრახაა.**
           „სახელით" დალაგება იმ ენაზე უნდა მოხდეს, რომელიც **ეკრანზე** წერია
           (`contentLang`), ე.ი. სერვერი მას ვერ იცნობს და ორივე მხარეს
           დაწერილი წესი ერთ დღეს გაშორდებოდა. სია სრულად ბრუნდება (გვერდები
           აქ არ არის), ამიტომ ფრონტი მას უბრალოდ თავიდან ალაგებს.
           ესკიზები კი სწორედ ფოტოიან ჯგუფებს სჭირდება, ე.ი. ეს რიგი მათ
           სწორად არჩევს. */
        $groups = $groups->sortByDesc('photos')->values();

        return response()->json([
            'by' => 'record',
            'groups' => $groups,
            'previews' => $this->previews($groups, null, $previews),
        ]);
    }

    /**
     * ჩანაწერების ჭრილის ფილტრები (ეტაპი 2).
     *
     * ⚠️ **ჟანრი/წელი/სტატუსი მხოლოდ მედია-დომენებზე მოქმედებს და
     * ინტერფეისიც მხოლოდ იქ ხატავს მათ.** სამი მშობელს სამნაირი ჟანრი აქვს
     * (გლობალური პოლიმორფული `genres`, `song_genres`/`game_genres` pivot-ით,
     * წიგნს კი ერთი `genre_id`), სტატუსი კი მედიაზე ლექსიკონია, წიგნზე/
     * თამაშზე enum, სიმღერაზე კი საერთოდ არ არსებობს. ერთ საერთო
     * `where`-ად ჩაწერა SQL-ის შეცდომა იქნებოდა — იგივე წესი, რაც
     * `applyTitleSearch()`-ს აქვს.
     */
    private function applyRecordFilters($query, string $type, array $data): void
    {
        if (! empty($data['favorite'])) {
            $query->where('is_favorite', true);
        }

        if (! MediaDomain::has($type)) {
            return;
        }

        // ⚠️ სია **AND**-ით იჭრება (`?genre=drama,comedy` = ორივე) — იგივე წესი,
        // რაც ბიბლიოთეკის სიას აქვს (`MovieController::index`)
        foreach ($this->slugList($data['genre'] ?? null) as $slug) {
            $query->whereHas('genres', fn ($genre) => $genre->where('slug', $slug));
        }

        // ⚠️ სტატუსები კი **OR** — ერთი ჩანაწერი ორ სტატუსში ვერ იქნება
        if ($keys = $this->slugList($data['status'] ?? null)) {
            $query->statusKey($keys);
        }

        if (! empty($data['year_min'])) {
            $query->where('year', '>=', (int) $data['year_min']);
        }

        if (! empty($data['year_max'])) {
            $query->where('year', '<=', (int) $data['year_max']);
        }
    }

    /**
     * სათაურით ძებნა.
     *
     * ⚠️ **`movies.title` სვეტი არ არსებობს** — ორენოვანი ტექსტი თარგმანის
     * ცხრილშია. ერთი საერთო `where('title', 'like', …)` მედია-დომენზე SQL-ის
     * შეცდომაა, ე.ი. ორი გზაა და არჩევანი დომენს ეკითხება.
     */
    private function applyTitleSearch($query, string $type, string $model, string $q): void
    {
        if (MediaDomain::has($type)) {
            $query->whereHas('translations', fn ($t) => $t->where('title', 'like', "%{$q}%"));

            return;
        }

        $table = (new $model)->getTable();

        $columns = array_values(array_filter(
            ['title', 'title_ka', 'title_en', 'name'],
            fn (string $column) => Schema::hasColumn($table, $column),
        ));

        $query->where(function ($w) use ($columns, $q) {
            foreach ($columns as $column) {
                $w->orWhere($column, 'like', "%{$q}%");
            }
        });
    }

    /** ჩანაწერის ყდა — სვეტი მოდულზეა დამოკიდებული */
    private function coverOf(Model $record): ?string
    {
        foreach (['poster_path', 'cover_path', 'image_path', 'thumbnail_path'] as $column) {
            $value = $record->{$column} ?? null;

            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return null;
    }

    /**
     * **„საიდან მოვიდა" ჭრილი** (§4.1) — ჯგუფი = მედია-დომენი.
     *
     * ერთ ჯგუფში ორივე სახის ფოტოა: ამ დომენის ჩანაწერების საკუთარი
     * კადრები/პოსტერები **და** მისი მსახიობების პორტრეტები. სწორედ ეს
     * პასუხობს კითხვას „ეს ფოტო ფილმიდან მოვიდა თუ სერიალიდან".
     */
    private function sourceGroups($user, int $previews)
    {
        $groups = collect();

        foreach (MediaDomain::TYPES as $type) {
            if (! $user->hasModule($type)) {
                continue;
            }

            $rows = $this->sourceQuery($type)
                ->selectRaw('count(*) photos, sum(size) bytes')
                ->first();

            if (! $rows || ! $rows->photos) {
                continue;
            }

            $groups->push([
                // ⚠️ `kind` დომენია, `id` კი 0 — ჯგუფი ერთეული ჩანაწერი არაა,
                // ამიტომ შიგნით შესვლა `from=`-ით ხდება და არა `owner=`-ით
                'kind' => $type,
                'id' => 0,
                'from' => $type,
                'title' => $type,
                'title_ka' => null,
                'poster_path' => null,
                'photos' => (int) $rows->photos,
                'bytes' => (int) $rows->bytes,
                'has_tmdb' => false,
            ]);
        }

        return response()->json([
            'by' => 'source',
            'groups' => $groups->values(),
            'previews' => $this->sourcePreviews($groups, $previews),
        ]);
    }

    /**
     * **„რომელმა წყარომ მოიტანა" ჭრილი (§8.3)** — `gallery_images.source`.
     *
     * ⚠️ **ეს `by=source`-ის დუბლი არ არის.** იქ „ფილმიდან თუ სერიალიდან"
     * იკითხება, აქ კი „TMDB-დან, Wikimedia-დან თუ Google-დან" — ვებძებნის
     * შემდეგ ეს ორი სხვადასხვა კითხვაა და ორივეს პასუხი სჭირდება.
     */
    private function providerGroups(int $previews)
    {
        $rows = GalleryImage::query()
            ->selectRaw('source, count(*) photos, sum(size) bytes')
            ->groupBy('source')
            ->orderByDesc('photos')
            ->get();

        $groups = $rows->map(fn ($row) => [
            'kind' => 'provider',
            // ⚠️ `id` 0-ია: ჯგუფი ერთეული ჩანაწერი არაა (წყაროს ჭრილის იგივე წესი)
            'id' => 0,
            'provider' => (string) ($row->source ?: 'tmdb'),
            'title' => (string) ($row->source ?: 'tmdb'),
            'title_ka' => null,
            'poster_path' => null,
            'photos' => (int) $row->photos,
            'bytes' => (int) $row->bytes,
            'has_tmdb' => false,
        ])->values();

        $previewMap = [];

        foreach ($groups as $group) {
            $previewMap['provider:'.$group['provider']] = GalleryImage::query()
                ->where('source', $group['provider'])
                ->orderByDesc('id')
                ->limit($previews)
                ->pluck('path')
                ->all();
        }

        return response()->json(['by' => 'provider', 'groups' => $groups, 'previews' => $previewMap]);
    }

    /**
     * **ალბომების ჭრილი (§26.4) — „უკატეგორიო" და მისი ჯგუფები.**
     *
     * პირველი ჯგუფი ყოველთვის **„უკატეგორიო, ალბომის გარეშე"**-ა
     * (`album:0`), მერე user-ის ალბომები.
     *
     * ⚠️ **ნულიანი ალბომიც იხატება** — ცარიელი საქაღალდე სწორედ ის ადგილია,
     * სადაც ფოტოებს ეზიდები; თუ ის მანამდე გაქრებოდა, სანამ პირველ ფოტოს
     * ჩააგდებდი, გადატანა შეუძლებელი იქნებოდა.
     *
     * ⚠️ **ალბომი ფოტოს მშობელს არ ცვლის**: ფილმის კადრიც შეიძლება
     * ალბომში იდოს. ამიტომ ჯგუფის რიცხვი `album_id`-ს ითვლის და არა
     * უმშობლოებს — თორემ „ჯგუფში 12 წერია, შიგნით 4-ია" გამოვიდოდა.
     */
    private function albumGroups(int $previews)
    {
        $loose = GalleryImage::query()
            ->whereNull('imageable_type')
            ->whereNull('album_id')
            ->selectRaw('count(*) as photos, coalesce(sum(size), 0) as bytes')
            ->first();

        $groups = collect([[
            'kind' => 'album',
            'id' => 0,
            'title' => null,
            'title_ka' => null,
            'photos' => (int) ($loose->photos ?? 0),
            'bytes' => (int) ($loose->bytes ?? 0),
            'has_tmdb' => false,
        ]]);

        foreach (GalleryAlbum::query()->orderBy('sort_order')->orderBy('id')->get() as $album) {
            $totals = GalleryImage::query()
                ->where('album_id', $album->id)
                ->selectRaw('count(*) as photos, coalesce(sum(size), 0) as bytes')
                ->first();

            $groups->push([
                'kind' => 'album',
                'id' => (int) $album->id,
                'title' => $album->name,
                'title_ka' => $album->name,
                'photos' => (int) ($totals->photos ?? 0),
                'bytes' => (int) ($totals->bytes ?? 0),
                'has_tmdb' => false,
            ]);
        }

        $out = [];
        foreach ($groups as $group) {
            if ($group['photos'] < 1 || $previews <= 0) {
                continue;
            }

            $query = GalleryImage::query();
            $group['id'] === 0
                ? $query->whereNull('imageable_type')->whereNull('album_id')
                : $query->where('album_id', $group['id']);

            $out['album:'.$group['id']] = $query->orderBy('sort_order')->limit($previews)->pluck('path')->all();
        }

        return response()->json([
            'by' => 'album',
            'groups' => $groups->values()->all(),
            'previews' => $out,
        ]);
    }

    /**
     * **ფოტოს გადატანა (§26.3) — `POST /api/gallery/images/move`.**
     *
     * შენი სიტყვები: „ფოტოებზე შეიძლებოდეს გადაიტანო სხვადასხვა რამეზე —
     * იმ უკატეგორიოზე, ასევე უკატეგორიოში რაიმე კონკრეტულ ჯგუფში, ან
     * მსახიობზე, ან სერიალზე".
     *
     * ⚠️ **ორი ღერძი ერთ გამოძახებაში, მაგრამ ცალ-ცალკე არჩევადი.**
     * `target` მშობელს ცვლის, `album_id` — დახარისხებას. თუ გასაღები
     * საერთოდ არ მოვიდა, ის ღერძი **ხელუხლებელია**; თუ მოვიდა `null`-ით —
     * იშლება. „არ მომიტანია" და „გაასუფთავე" ერთ მნიშვნელობად რომ
     * გვექცია, ალბომში ჩაგდება ჩუმად მშობელსაც მოხსნიდა.
     *
     * ⚠️ **ფაილი არსად მოძრაობს.** გადატანა მხოლოდ ორი სვეტია — დისკზე
     * ფოტო იმავე ადგილას რჩება, ე.ი. არც კვოტა იცვლება და არც `path`.
     *
     * ⚠️ **სკოუპი `owner`-ია**: `GalleryImage`-ს `BelongsToUser` აქვს, ე.ი.
     * სხვისი ფოტოს id უბრალოდ ვერ მოიძებნება — „გამოტოვებული" და არა 403.
     */
    public function moveImages(Request $request)
    {
        $parents = implode('|', GalleryParent::keys());

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
            /* `none` = უკატეგორიოში; `movie:12`/`actor:5` = მშობელზე */
            'target' => ['nullable', 'string', 'regex:/^(none|('.$parents.'):\d+)$/'],
            'album_id' => ['nullable', 'integer',
                Rule::exists('gallery_albums', 'id')->where('user_id', $request->user()->id)],
        ]);

        $changes = [];

        if ($target = $data['target'] ?? null) {
            if ($target === 'none') {
                $changes['imageable_type'] = null;
                $changes['imageable_id'] = null;
            } else {
                [$kind, $id] = explode(':', $target);
                $parent = $kind === GalleryParent::ACTOR
                    ? CastMember::find((int) $id)
                    : $this->findParent($kind, (int) $id);

                // ⚠️ მშობელი **ჩემი** უნდა იყოს — `findParent()` `owner` სკოუპზე დგას
                abort_unless($parent, 404, 'not_found');

                $changes['imageable_type'] = $kind;
                $changes['imageable_id'] = (int) $id;
            }
        }

        // ⚠️ `exists()` და არა `filled()`: `album_id: null` „გაასუფთავეა"
        if ($request->exists('album_id')) {
            $changes['album_id'] = $data['album_id'] ?? null;
        }

        abort_if(! $changes, 422, 'nothing_to_move');

        $moved = GalleryImage::whereIn('id', array_map('intval', $data['ids']))->update($changes);

        return response()->json(['moved' => $moved]);
    }

    /**
     * ერთი დომენის ფოტოები — ჩანაწერისაც და მისი მსახიობებისაც.
     *
     * ⚠️ **ერთი წყარო ჯგუფის დათვლისთვისაც და შიგთავსისთვისაც** — ორი
     * ასლი ერთ დღეს სხვადასხვა რიცხვს აჩვენებდა („ჯგუფში 40 წერია, შიგნით
     * 37-ია" — `PurgeService`-ის იგივე წესი).
     */
    private function sourceQuery(string $type)
    {
        $relation = MediaDomain::castRelation($type);

        // ⚠️ `whereHas` მედია-მოდელზე `owner` scope-ს იმემკვიდრეობს, ე.ი. ეს
        // ავტომატურად **ამ user-ის** ბიბლიოთეკის მსახიობებია
        $castIds = CastMember::whereHas($relation)->pluck('id')->all();

        return GalleryImage::query()->where(function ($w) use ($type, $castIds) {
            $w->where('imageable_type', $type);

            if ($castIds) {
                $w->orWhere(fn ($x) => $x->where('imageable_type', GalleryParent::ACTOR)->whereIn('imageable_id', $castIds));
            }
        });
    }

    /** @param  Collection<int, array<string, mixed>>  $groups */
    private function sourcePreviews($groups, int $previews): array
    {
        $out = [];

        foreach ($groups as $group) {
            $out[$group['kind'].':0'] = $this->sourceQuery($group['from'])
                ->orderBy('id')
                ->limit($previews)
                ->pluck('path')
                ->all();
        }

        return $out;
    }

    /**
     * ჯგუფის რამდენიმე ესკიზი — ბადეზე „რა დევს შიგნით" ერთი შეხედვით.
     *
     * @param  Collection<int, array<string, mixed>>  $groups
     * @return array<string, list<string>>
     */
    private function previews($groups, ?string $morph, int $limit): array
    {
        $out = [];

        if ($limit <= 0) {
            return $out;
        }

        foreach ($groups->take(120) as $group) {
            // „უფოტო" ჭრილში ესკიზი ვერ იქნება — თითო ჯგუფზე
            // ცარიელი მოთხოვნის გაშვება მხოლოდ დროს ჭამს
            if (($group['photos'] ?? 0) < 1) {
                continue;
            }

            $type = $morph ?? $group['kind'];
            $out[$group['kind'].':'.$group['id']] = GalleryImage::where('imageable_type', $type)
                ->where('imageable_id', $group['id'])
                ->orderBy('sort_order')
                ->limit($limit)
                ->pluck('path')
                ->all();
        }

        return $out;
    }

    /**
     * **ფოტოების ბრტყელი სია, გვერდებით (Tasks §3.3/§3.7 → §8.3).**
     *
     * `owner` — `movie:12` · `series:3` · `song:4` · `actor:5`;
     * მისი გარეშე **ყველა ფოტო**.
     *
     * ⚠️ `movie:12`-ზე ჩანაწერის ფოტოებიც ბრუნდება **და მისი მსახიობებისაც** —
     * §3.3-ის „ფილმი და მისი ფოტოები (მსახიობებისაც შეიძლება შედიოდეს)".
     * ეს არჩევადია `with_cast`-ით, თორემ ფილმის ფოტოებში ვერ გაარკვევდი,
     * რომელი მისია და რომელი მსახიობის.
     *
     * ⚠️ **`sort=random` სიდით მუშაობს (§8.3).** „არეულად" ნიშნავს შემთხვევით
     * რიგს, მაგრამ **გვერდებს შორის მდგრადს**: სიდის გარეშე მე-2 გვერდი
     * იმავე ფოტოებს გამოიტანდა, რაც პირველზე უკვე ნანახია.
     */
    public function photos(Request $request)
    {
        $owners = implode('|', [...GalleryParent::recordKeys(), 'actor', 'album']);

        $data = $request->validate([
            /* ⚠️ **`none` ცალკე მნიშვნელობაა და არა „owner არ მოსულა"** (§26):
               მშობლის გარეშე ჩამოსული მოთხოვნა „ყველა ფოტოა", უმშობლო
               ფოტოების ჭრილი კი — „უკატეგორიო". ერთ სიტყვად რომ გვექცია,
               ერთი მათგანი ვერსად გამოჩნდებოდა. */
            'owner' => ['nullable', 'string', 'regex:/^(none|('.$owners.'):\d+)$/'],
            'with_cast' => ['nullable', 'boolean'],
            'category' => ['nullable', 'in:backdrop,poster,logo,actor'],
            // §4.1 — „საიდან მოვიდა" ჭრილში შესვლა (დომენი და არა ერთეული)
            'from' => ['nullable', MediaDomain::rule()],
            // §8.3 — წყაროს ჭრილში შესვლა (`tmdb` · `wikimedia` · `serpapi:*`)
            'provider' => ['nullable', 'string', 'max:40'],
            'sort' => ['nullable', 'in:new,old,random'],
            'seed' => ['nullable', 'integer', 'min:0', 'max:999999'],
            /* ⚠️ ჭერი 100-იდან `MAX_PER_PAGE`-ზე ავიდა: „რამდენი გამოჩნდეს"
               არჩევანს („ყველა"-ს ჩათვლით) 100 არ ჰყოფნიდა და lightbox-ის
               ისრებიც პირველ ასზე ჩერდებოდა. */
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $query = ($from = $data['from'] ?? null)
            ? $this->sourceQuery($from)
            : GalleryImage::query();

        if ($owner = $data['owner'] ?? null) {
            [$kind, $id] = $owner === 'none' ? ['none', 0] : explode(':', $owner);

            /* „უკატეგორიო" — მშობლის გარეშე დარჩენილი ფოტოები (§26) */
            if ($kind === 'none') {
                $query->whereNull('imageable_type');
            } elseif ($kind === 'album') {
                $query->where('album_id', (int) $id);
            } elseif ($kind === 'actor') {
                $query->where('imageable_type', GalleryParent::ACTOR)->where('imageable_id', (int) $id);
            } else {
                $record = $this->findParent($kind, (int) $id);

                if (! $record) {
                    return response()->json(['message' => 'not_found'], 404);
                }

                /* მსახიობების ფოტოები მხოლოდ იქ, სადაც შემადგენლობა არსებობს —
                   სიმღერას/წიგნს/თამაშს `cast()` რელაცია არ აქვს */
                $castIds = $request->boolean('with_cast', true) && MediaDomain::has($kind)
                    ? $record->cast()->pluck('cast_members.id')->all()
                    : [];

                $query->where(function ($w) use ($kind, $id, $castIds) {
                    $w->where(fn ($x) => $x->where('imageable_type', $kind)->where('imageable_id', (int) $id));
                    if ($castIds) {
                        $w->orWhere(fn ($x) => $x->where('imageable_type', GalleryParent::ACTOR)->whereIn('imageable_id', $castIds));
                    }
                });
            }
        }

        if ($category = $data['category'] ?? null) {
            $query->where('category', $category);
        }

        if ($provider = $data['provider'] ?? null) {
            $query->where('source', $provider);
        }

        $this->applySort($query, $data['sort'] ?? null, (int) ($data['seed'] ?? 0));

        $page = $query->paginate($data['per_page'] ?? 24)->withQueryString();

        return response()->json([
            'data' => $this->withOwners(collect($page->items())),
            'meta' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }

    /**
     * „არეული / ახალი / ძველი" — ერთი ადგილი, სადაც რიგი წყდება (§8.3).
     *
     * ⚠️ **sqlite-ს `RAND(seed)` არ აქვს** (ტესტები იქ გადიან), ამიტომ იქ
     * იგივე მდგრადი არევა არითმეტიკით კეთდება. მთავარია **მდგრადობა**:
     * გვერდებს შორის რიგი არ უნდა იცვლებოდეს, თორემ მე-2 გვერდი პირველზე
     * უკვე ნანახ ფოტოებს გამოიტანდა.
     */
    private function applySort($query, ?string $sort, int $seed): void
    {
        if ($sort === 'random') {
            if (DB::connection()->getDriverName() === 'mysql') {
                $query->orderByRaw('RAND(?)', [$seed]);

                return;
            }

            $query->orderByRaw('(id * ? + ?) % 9973', [($seed % 97) + 3, $seed]);

            return;
        }

        if ($sort === 'old') {
            $query->orderBy('id');

            return;
        }

        if ($sort === 'new') {
            $query->orderByDesc('id');

            return;
        }

        // ნაგულისხმევი — მშობლების მიხედვით („დაჯგუფებული" ხედი)
        $query->orderBy('imageable_type')->orderBy('imageable_id')->orderBy('sort_order');
    }

    /**
     * ფოტოებს მშობლის სახელი მიაწერე — ბადეზე უნდა ჩანდეს, ვისია.
     *
     * ⚠️ **მშობლები ჯგუფურად იკითხება** (`whereIn` თითო ტიპზე) და არა
     * `imageable`-ით თითოზე: 8 ფოტო 8 დამატებით რექვესთს ნიშნავდა.
     *
     * @param  Collection<int, GalleryImage>  $images
     */
    private function withOwners($images): array
    {
        $byType = $images->groupBy('imageable_type');

        $names = [];
        foreach ($byType as $type => $rows) {
            $ids = $rows->pluck('imageable_id')->unique();

            // ⚠️ მშობლების სია `GalleryParent`-იდან მოდის და ხელით აღარ ითვლება —
            // ანიმეს (და მერე სიმღერის/წიგნის) ფოტოებს მშობლის სახელი აკლდა
            $model = GalleryParent::model((string) $type);

            if (! $model) {
                continue;
            }

            foreach ($model::query()->whereIn('id', $ids)->get() as $record) {
                $names[$type.':'.$record->getKey()] = [
                    'kind' => $type === GalleryParent::ACTOR ? 'actor' : $type,
                    'id' => $record->getKey(),
                    'title' => $type === GalleryParent::ACTOR
                        ? $record->name
                        : ($record->title_en ?? $record->title ?? null),
                    'title_ka' => $type === GalleryParent::ACTOR
                        ? $record->name_ka
                        : ($record->title_ka ?? null),
                ];
            }
        }

        return $images->map(fn (GalleryImage $image) => [
            ...(new GalleryImageResource($image))->resolve(),
            'owner' => $names[$image->imageable_type.':'.$image->imageable_id] ?? null,
        ])->values()->all();
    }

    /**
     * **სხვა მოდულების ფოტოები (§8.3)** — `GET /api/gallery/module-photos`.
     *
     * ⚠️ **მხოლოდ კითხვადია.** ეს ფოტოები ჩანაწერის ნაწილია (ყდა, თამბნეილი,
     * მიმაგრებული სურათი) და არა გალერეის ერთეული — მათი წაშლა ჩანაწერის
     * რედაქტირებაა და არა გალერეის მოქმედება.
     */
    public function modulePhotos(Request $request)
    {
        $data = $request->validate([
            'module' => ['required', 'string', 'max:40'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
        ]);

        $perPage = (int) ($data['per_page'] ?? 24);
        $page = max(1, (int) $request->query('page', 1));

        $result = $this->moduleImages->photos($request->user(), $data['module'], $page, $perPage);

        return response()->json([
            'data' => $result['items'],
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $result['total'],
                'last_page' => max(1, (int) ceil($result['total'] / $perPage)),
                // ⚠️ ჭრილი ცხადად ითქვას — ჩუმად მოჭრილი სია „სულ ეს არის"-ად იკითხება
                'truncated' => $result['truncated'],
            ],
        ]);
    }

    /**
     * ერთი ჩანაწერის გალერეა — ბადე ჩანაწერის გვერდზე (ტრეილერის ქვემოთ).
     *
     * აბრუნებს ოთხივეს: ჩანაწერის ფოტოებს, ამ ჩანაწერის **მსახიობების**
     * ფოტოებს (მშობელი მსახიობია), მსახიობთა სიას სქესით და **ვიდეო-ბმულებს**
     * (§8.1).
     */
    public function show(string $type, int $id)
    {
        $record = $this->find($type, $id);

        if (! $record) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $images = $record->galleryImages()->get();

        $cast = $record->cast()->get();
        $castImages = GalleryImage::where('imageable_type', GalleryParent::ACTOR)
            ->whereIn('imageable_id', $cast->pluck('id'))
            ->orderBy('imageable_id')
            ->orderBy('sort_order')
            ->get();

        $castById = $cast->keyBy('id');

        return response()->json([
            'record' => [
                'type' => $type,
                'id' => $record->id,
                'title_ka' => $record->title_ka,
                'title_en' => $record->title_en,
                'year' => $record->year,
                'poster_path' => $record->poster_path,
                'tmdb_id' => $record->tmdb_id,
            ],
            'images' => GalleryImageResource::collection($images),
            'cast_images' => $castImages->map(function (GalleryImage $a) use ($castById) {
                $member = $castById->get($a->imageable_id);

                return [
                    ...(new GalleryImageResource($a))->resolve(),
                    'actor' => $member ? [
                        'id' => $member->id,
                        'name' => $member->name,
                        'name_ka' => $member->name_ka,
                    ] : null,
                ];
            })->values(),
            'cast' => $cast->map(fn (CastMember $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'name_ka' => $m->name_ka,
                'gender' => $m->gender,
                'photo_path' => $m->photo_path,
                'has_tmdb' => (bool) $m->tmdb_person_id,
                'photos' => $castImages->where('imageable_id', $m->id)->count(),
            ])->values(),
            // §8.1 — ამ ჩანაწერზე შენახული ვიდეო-ბმულები
            'videos' => GalleryVideoResource::collection($record->galleryVideos()->get()),
            'bytes' => (int) $images->sum('size') + (int) $castImages->sum('size'),
        ]);
    }

    /**
     * მსახიობის გალერეა — მსახიობის გვერდისთვის (Tasks 10 → §8.1).
     *
     * ⚠️ პასუხს **პიროვნების მონაცემებიც** მოსდევს (ბიოგრაფია, IMDb, ბმულები):
     * „მსახიობის შიდა გვერდი" სწორედ ამით განსხვავდება ფოტოების სიისგან.
     */
    public function castShow(CastMember $castMember)
    {
        $images = $castMember->galleryImages()->get();

        return response()->json([
            'actor' => $castMember->toDetailArray(),
            'images' => GalleryImageResource::collection($images),
            'videos' => GalleryVideoResource::collection($castMember->galleryVideos()->get()),
            'bytes' => (int) $images->sum('size'),
        ]);
    }

    /** ერთი მსახიობის ფოტოების ჩამოტვირთვა */
    public function castFetch(Request $request, CastMember $castMember)
    {
        if (! $this->fetcher->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
        }

        $data = $request->validate([
            /* ⚠️ **min:0 და არა min:1** — გეგმაში 0 „არცერთს" ნიშნავს (§3.6) და
               ერთსა და იმავე ველზე ორი სხვადასხვა ჭერი ხაფანგია. */
            'per_actor' => ['nullable', 'integer', 'min:0', 'max:'.GalleryFetcher::MAX_PER_ACTOR],
            'cast_size' => ['nullable', 'in:'.implode(',', GalleryFetcher::CAST_SIZES)],
            'cast_source' => ['nullable', 'in:'.implode(',', GalleryFetcher::CAST_SOURCES)],
        ]);

        $result = $this->fetcher->fetchActor($request->user(), $castMember, $data);

        return $this->fetchResponse($request, $result, $castMember->name);
    }

    /**
     * რიგის გეგმა + **წინასწარი შეფასება** (17.3): რამდენი ერთეულია, დაახლოებით
     * რამდენ ადგილს დაიკავებს და რამდენი კვოტა დარჩა.
     *
     * ⚠️ **ორი სამიზნე, ერთი endpoint** (`target`) — ეს ორი სამიზნე დიალოგის
     * ორი ტაბია:
     *  · `record` — **მხოლოდ ჩანაწერის** ფოტოები (კადრი · პოსტერი · ლოგო)
     *    არჩეულ სკოუპზე. მსახიობები აქ საერთოდ არ მონაწილეობენ (§3.1):
     *    კადრში ვერ გაარჩევ, ვინაა სურათზე.
     *  · `actor` — **მსახიობების ფოტოები** (ყველა · ქალი · კაცი · კონკრეტული).
     *    ავზი იმავე სკოუპიდან მოდის, ხოლო `scope=off`-ზე — მთელი ბიბლიოთეკიდან.
     *
     * ⚠️ **გეგმა ახლა მრავალდომენიანია** (§8.2): „ფილმებზე, სერიალებზე და
     * ანიმეებზე ჯამში" ერთი გაშვებაა და არა სამი.
     */
    public function plan(Request $request)
    {
        $data = $request->validate([
            'target' => ['nullable', 'in:record,actor'],
            'skip_with_photos' => ['nullable', 'boolean'],
            // მსახიობთა ავზში ძებნა — ბიბლიოთეკაში ასეულობით მსახიობია
            'cast_q' => ['nullable', 'string', 'max:200'],
            ...GalleryScope::rules(),
            ...$this->optionRules(),
        ]);

        $opts = $this->fetcher->options($data);
        $user = $request->user();
        $types = GalleryScope::types($user, $data);

        if (! $types) {
            return response()->json(['message' => 'module_disabled'], 403);
        }

        if (($data['target'] ?? 'record') === 'actor') {
            return $this->actorPlan($request, $data, $opts, $types);
        }

        /* ⚠️ **ჩანაწერის ტაბი მსახიობებს არ ეხება** (§3.1) — მაშინაც კი, თუ
           ძველი კლიენტი `cast`-ს გამოგზავნის: შეფასება და ჩამოტვირთვა ერთ
           რიცხვზე უნდა დგებოდეს, თორემ ტაბის ჯამი სხვას დათვლიდა. */
        $opts['cast'] = 'none';
        $opts['cast_ids'] = [];

        $items = [];
        $withoutTmdb = 0;
        $withPhotos = 0;
        $recordIds = [];

        foreach ($types as $type) {
            $query = GalleryScope::query($type, $data);

            if ($request->boolean('skip_with_photos')) {
                /* ⚠️ **გამოტოვებული ცხადად ითვლება.** უამისოდ „ჩანაწერი 0"
                   ორ სრულიად სხვადასხვა მდგომარეობას ნიშნავდა — „სკოუპში
                   არაფერია" და „ყველას ფოტოები უკვე აქვს" — და მეორე
                   შემთხვევაში ინტერფეისი ჩუმად ცარიელ გეგმას ხატავდა. */
                $withPhotos += (clone $query)->has('galleryImages')->count();
                $query->doesntHave('galleryImages');
            }

            foreach ($query->orderBy('id')->get() as $row) {
                // tmdb_id-ის გარეშე გალერეა შეუძლებელია — ჩუმად არ ვაგდებთ, ვითვლით
                if (! $row->tmdb_id) {
                    $withoutTmdb++;

                    continue;
                }
                $recordIds[$type][] = $row->id;
                $items[] = [
                    'type' => $type,
                    'id' => $row->id,
                    'title' => $row->title_ka ?: ($row->title_en ?: '#'.$row->id),
                    'year' => $row->year,
                ];
            }
        }

        $estimate = count($items) * $this->fetcher->estimateItem($opts);
        $usage = $this->meter->usage($user);

        return response()->json([
            'target' => 'record',
            'types' => $types,
            'items' => $items,
            'count' => count($items),
            'eta_seconds' => (int) ceil(count($items) * 60 / self::ITEMS_PER_MINUTE),
            'skipped_without_tmdb' => $withoutTmdb,
            'skipped_with_photos' => $withPhotos,
            // ⚠️ ზედა ზღვარია და არა ზუსტი რიცხვი — იხ. `GalleryFetcher::AVG_BYTES`
            'estimated_bytes' => $estimate,
            'storage' => $usage,
            'fits' => $estimate <= $usage['remaining'],
            'options' => $opts,
            // „კონკრეტული მსახიობები" მასობრივ ჩამოტვირთვაშიც — არჩეული
            // ჩანაწერების **გაერთიანებული** შემადგენლობა (Tasks 10)
            'cast' => $this->castOptions($recordIds, $data['cast_q'] ?? null),
            'cast_truncated' => false,
            'unknown_gender' => 0,
        ]);
    }

    /**
     * **მსახიობების ტაბი** (§3.2 → §8.2) — ავზი სკოუპის ჩანაწერების
     * შემადგენლობაა (ერთი ფილმი, თუ ჩანაწერიდან მოხვედი; მთელი სკოუპი, თუ
     * გალერეიდან; **მთელი ბიბლიოთეკა**, თუ სკოუპი გამორთულია), არჩევანი კი
     * ყველა · ქალი · კაცი · კონკრეტული.
     *
     * ⚠️ ჩამოტვირთვა ჩანაწერზე გავლით **არ ხდება**: მსახიობის ფოტოები TMDB-ის
     * `/person/{id}/*`-იდან მოდის და მშობელიც თვითონ მსახიობია, ე.ი.
     * ერთი მსახიობის ფოტო ორ ფილმზე არ დუბლირდება.
     *
     * ⚠️ რიგში ერთეული **მსახიობია** (`type: 'actor'`) და არა ჩანაწერი —
     * ფრონტი მას `POST /gallery/cast/{id}`-ზე აგზავნის.
     */
    private function actorPlan(Request $request, array $data, array $opts, array $types)
    {
        $user = $request->user();
        $scopeOff = GalleryScope::isOff($data);

        /* ⚠️ **ავზი სკოუპს მიჰყვება** (§3.2): ფილმიდან გახსნილ ტაბში მხოლოდ
           **ამ ფილმის** მსახიობები უნდა ჩანდეს, გალერეის გვერდზე კი — არჩეული
           სკოუპის. `scope=off`-ზე კი შეზღუდვა საერთოდ არ არის (§8.2 — „ან
           ჩათიშო და ზოგადად მსახიობზე ჩამოწერ"). */
        $recordIds = [];

        if (! $scopeOff) {
            foreach ($types as $type) {
                $recordIds[$type] = GalleryScope::query($type, $data)->orderBy('id')->pluck('id')->all();
            }
        }

        $pool = $this->castPoolQuery($types, $recordIds, $data['cast_q'] ?? null, $scopeOff);

        /* „ქალი/კაცი" სქესს ითხოვს, ის კი ძველ ჩანაწერებზე ცარიელია. ერთი
           `credits` რექვესთი ჩანაწერზე ამას ავსებს — მაგრამ მხოლოდ მაშინ,
           თუ სკოუპი მართლა პატარაა (ჩანაწერის გვერდი, რამდენიმე მონიშნული):
           ასეულ ფილმზე ეს ასეული რექვესთი იქნებოდა. */
        $flat = array_merge(...array_values($recordIds ?: [[]]));

        if (in_array($opts['cast'], ['female', 'male'], true) && count($flat) <= self::GENDER_BACKFILL_RECORDS) {
            foreach ($recordIds as $type => $ids) {
                foreach ($ids as $recordId) {
                    if ($record = $this->find($type, $recordId)) {
                        $this->fetcher->backfillGendersForRecord($record);
                    }
                }
            }
        }

        // TMDB-ის პირის id-ის გარეშე გალერეა შეუძლებელია — ჩუმად არ ვაგდებთ
        $withoutTmdb = (clone $pool)->whereNull('tmdb_person_id')->count();

        $members = $pool->whereNotNull('tmdb_person_id')
            ->orderBy('name')
            ->limit(self::CAST_POOL_LIMIT)
            ->get();

        $photos = $this->castPhotoCounts($members->pluck('id')->all());

        $chosen = match ($opts['cast']) {
            'female' => $members->where('gender', CastMember::GENDER_FEMALE),
            'male' => $members->where('gender', CastMember::GENDER_MALE),
            /* ⚠️ **„კონკრეტული" ავზის ჭერს არ ექვემდებარება.** `$members`
               სახელით დალაგებული პირველი `CAST_POOL_LIMIT` რიგია — ე.ი. სამ
               ათას მსახიობიან ბიბლიოთეკაში ანბანით გვიან მდგომი მონიშნული
               მსახიობი იქ საერთოდ არ მოხვდებოდა და ჩამოტვირთვა **ჩუმად
               არაფერს იზამდა** (ზუსტად ეს ემართებოდა მსახიობის გვერდიდან
               გახსნილ დიალოგს). ამიტომ მონიშნულებს ცალკე ვკითხულობთ —
               იმავე ავზის წესებით, ოღონდ ჭერის გარეშე. */
            'selected' => $this->castPoolQuery($types, $recordIds, null, $scopeOff)
                ->whereNotNull('tmdb_person_id')
                ->whereIn('id', $opts['cast_ids'])
                ->get(),
            // ⚠️ `none` აქ „არჩევანი არ გაკეთებულა"-ს ნიშნავს და არა შეცდომას:
            // `options()` სწორედ ასე გარდაქმნის „კონკრეტულს" id-ების გარეშე
            'none' => collect(),
            default => $members,
        };

        // მონიშნულების ფოტოების რაოდენობაც იმავე ერთი აგრეგატით
        if ($opts['cast'] === 'selected' && $chosen->isNotEmpty()) {
            $photos = $photos->union($this->castPhotoCounts($chosen->pluck('id')->all()));
        }

        /* ⚠️ **რამდენი მოიჭრა, ითვლება.** სწორედ ეს ფილტრი აბრუნებდა
           „მსახიობი 0"-ს იქ, სადაც ერთი კონკრეტული მსახიობი იყო მონიშნული
           და ფოტოები უკვე ჰქონდა — ჩამრთველი კი ამ დროს ეკრანზე არ იყო.
           რიცხვი პასუხში იმისთვისაა, რომ ნული თავის მიზეზს ატარებდეს. */
        $withPhotos = 0;

        if ($request->boolean('skip_with_photos')) {
            $before = $chosen->count();
            $chosen = $chosen->filter(fn (CastMember $m) => ($photos[$m->id] ?? 0) === 0);
            $withPhotos = $before - $chosen->count();
        }

        // „კონკრეტული" ჩამონათვალი ჭერს არ ექვემდებარება — ხელით მონიშნულია
        if ($opts['cast'] !== 'selected') {
            $chosen = $chosen->take($opts['actors']);
        }

        $items = $chosen->map(fn (CastMember $m) => [
            'type' => 'actor',
            'id' => $m->id,
            'title' => $m->name_ka ?: $m->name,
            'year' => null,
        ])->values()->all();

        $estimate = count($items) * $this->fetcher->estimateActor($opts);
        $usage = $this->meter->usage($user);

        return response()->json([
            'target' => 'actor',
            'types' => $types,
            'items' => $items,
            'count' => count($items),
            'eta_seconds' => (int) ceil(count($items) * 60 / self::ITEMS_PER_MINUTE),
            'skipped_without_tmdb' => $withoutTmdb,
            'skipped_with_photos' => $withPhotos,
            'estimated_bytes' => $estimate,
            'storage' => $usage,
            'fits' => $estimate <= $usage['remaining'],
            'options' => $opts,
            'cast' => $this->castPayload($members, $photos),
            'cast_truncated' => $members->count() >= self::CAST_POOL_LIMIT,
            /* ⚠️ სქესი TMDB-დან მოდის და ძველ ჩანაწერებზე ცარიელია. პატარა
               სკოუპზე მას ზემოთ ვავსებთ, დიდზე კი — არა (ასეული რექვესთი),
               ამიტომ რიცხვს ვაბრუნებთ და ინტერფეისი ცხადად ამბობს, რამდენი
               მსახიობი „ქალი/კაცი" ფილტრში ვერ ჩავარდა. */
            'unknown_gender' => $members->whereNull('gender')->count(),
        ]);
    }

    /**
     * არჩეული სკოუპის მსახიობთა ავზი, ძებნით.
     *
     * ⚠️ `whereHas` მედია-მოდელზე `owner` global scope-ს იმემკვიდრეობს, ე.ი.
     * ავზი ავტომატურად **ამ user-ის** ბიბლიოთეკაა.
     *
     * ⚠️ **`scope=off`-ზე შეზღუდვა მხოლოდ დომენებზეა** — „ყველა მსახიობი,
     * ვინც ჩემს ბიბლიოთეკაში მონაწილეობს", და არა TMDB-ის მთელი ლექსიკონი
     * (`cast_members` გლობალურია, ე.ი. უფილტრო სია სხვისი ჩანაწერების
     * მსახიობებსაც მოიცავდა).
     *
     * @param  list<string>  $types
     * @param  array<string, list<int>>  $recordIds
     */
    private function castPoolQuery(array $types, array $recordIds, ?string $q, bool $scopeOff)
    {
        $pool = CastMember::query()->where(function ($w) use ($types, $recordIds, $scopeOff) {
            foreach ($types as $type) {
                $relation = MediaDomain::castRelation($type);

                if ($scopeOff) {
                    $w->orWhereHas($relation);

                    continue;
                }

                $ids = $recordIds[$type] ?? [];

                if ($ids) {
                    $w->orWhereHas($relation, fn ($r) => $r->whereIn("{$relation}.id", $ids));
                }
            }

            // ⚠️ არცერთი დომენი/ჩანაწერი — ავზი **ცარიელია** და არა „ყველა"
            $w->orWhereRaw('1 = 0');
        });

        if ($q) {
            // ⚠️ `name_ka` სვეტი არ არის (accessor-ია) — ქართული სახელი
            // `cast_member_translations`-შია, ე.ი. ძებნა ორივეზე უნდა გავიდეს
            $pool->where(function ($w) use ($q) {
                $w->where('name', 'like', "%{$q}%")
                    ->orWhereHas('translations', fn ($t) => $t->where('name', 'like', "%{$q}%"));
            });
        }

        return $pool;
    }

    /** რომელ მსახიობს რამდენი ფოტო აქვს — ერთი აგრეგატი, არა თითოზე count */
    private function castPhotoCounts(array $ids)
    {
        return GalleryImage::where('imageable_type', GalleryParent::ACTOR)
            ->whereIn('imageable_id', $ids)
            ->selectRaw('imageable_id, count(*) as total')
            ->groupBy('imageable_id')
            ->pluck('total', 'imageable_id');
    }

    /**
     * არჩეული ჩანაწერების მსახიობთა გაერთიანებული სია, სქესითა და უკვე
     * ჩამოტვირთული ფოტოების რაოდენობით.
     *
     * @param  array<string, list<int>>  $recordIds
     */
    private function castOptions(array $recordIds, ?string $q = null): array
    {
        if (! array_filter($recordIds)) {
            return [];
        }

        // ⚠️ **ავზს ერთი წყარო აქვს** (`castPoolQuery`) — აქამდე იგივე
        // `whereHas` მეორედ ეწერა და ანიმეს რელაცია მასში ჩუმად `movies` იყო
        $cast = $this->castPoolQuery(array_keys($recordIds), $recordIds, $q, false)
            ->orderBy('name')
            ->limit(self::CAST_POOL_LIMIT)
            ->get();

        return $this->castPayload($cast, $this->castPhotoCounts($cast->pluck('id')->all()));
    }

    /**
     * ერთი ფორმა მსახიობის არჩევანისთვის — ჩანაწერის სამიზნეზეც და
     * მსახიობების სამიზნეზეც. ორი ასლი ორ სხვადასხვა ველს დაწერდა.
     *
     * @param  Collection<int, CastMember>  $cast
     */
    private function castPayload($cast, $photos): array
    {
        return $cast->map(fn (CastMember $m) => [
            'id' => $m->id,
            'name' => $m->name,
            'name_ka' => $m->name_ka,
            'gender' => $m->gender,
            'photo_path' => $m->photo_path,
            'has_tmdb' => (bool) $m->tmdb_person_id,
            'photos' => (int) ($photos[$m->id] ?? 0),
        ])->values()->all();
    }

    /**
     * ერთი ჩანაწერის ჩამოტვირთვა. per-item შეცდომა 200-ით ბრუნდება
     * (`ok:false`), რომ ფრონტის ციკლი არ გაწყდეს; **კვოტის ამოწურვა კი
     * 413-ია** — ის ნაკადს განზრახ აჩერებს (Tasks 10 / 17.3).
     */
    public function fetch(Request $request, string $type, int $id)
    {
        if (! MediaDomain::has($type)) {
            return response()->json(['message' => 'invalid_type'], 422);
        }

        if (! $this->fetcher->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
        }

        $data = $request->validate($this->optionRules());

        $record = $this->find($type, $id);

        if (! $record) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $result = $this->fetcher->fetch($request->user(), $record, $data);

        if (! $result['ok']) {
            Log::warning('gallery fetch failed', ['type' => $type, 'id' => $id, 'error' => $result['error']]);
        }

        return $this->fetchResponse(
            $request,
            $result,
            $record->title_ka ?: ($record->title_en ?: '#'.$record->id),
        );
    }

    /** ერთი ფოტოს წაშლა — ფაილიც და კვოტაც `GalleryImage`-ის ივენთებზეა */
    public function destroyImage(GalleryImage $galleryImage)
    {
        // თუ ეს ფოტო ჩანაწერის პოსტერია, ბმული არ უნდა დაეკიდოს
        $parent = $galleryImage->imageable;
        if ($parent && ! $parent instanceof CastMember && $parent->poster_path === $galleryImage->path) {
            $parent->forceFill(['poster_path' => null, 'poster_source' => null])->save();
        }

        $galleryImage->delete();

        return response()->noContent();
    }

    /**
     * „მთავარად დაყენება" — გალერეის ფოტო ხდება ჩანაწერის პოსტერი.
     *
     * ⚠️ `poster_source = 'tmdb'` განზრახ: ფაილი მართლაც TMDB-დან მოვიდა და,
     * რაც მთავარია, კვოტაში ის **გალერეის ფოტოდ** უკვე ითვლება —
     * `'upload'`-ად ჩაწერა იმავე ფაილს მეორედ დათვლიდა (`StorageMeter::files()`).
     *
     * ⚠️ მსახიობზე ეს **არ** მუშაობს: `cast_members.photo_path` გლობალური
     * ლექსიკონის სვეტია და ერთი user-ის არჩევანი ყველას შეეცვლებოდა.
     */
    public function setPrimary(GalleryImage $galleryImage)
    {
        $parent = $galleryImage->imageable;

        if (! $parent) {
            return response()->json(['message' => 'not_found'], 404);
        }

        if ($parent instanceof CastMember) {
            return response()->json(['message' => 'primary_not_supported_for_cast'], 422);
        }

        // ძველი **ხელით ატვირთული** პოსტერი კვოტიდან თავისუფლდება
        if ($parent->poster_source === 'upload' && $parent->poster_path !== $galleryImage->path) {
            $this->meter->deleteUpload($parent->user_id, $parent->poster_path);
        }

        $parent->forceFill([
            'poster_path' => $galleryImage->path,
            'poster_source' => 'tmdb',
        ])->save();

        return response()->json(['poster_path' => $parent->poster_path]);
    }

    /**
     * ჩამოტვირთვის ვალიდაცია — ერთი წყარო `plan()`-ისთვისაც და `fetch()`-ისთვისაც.
     *
     * ⚠️ **`limits`/`sizes` სახეობის რუკებია (§8.2)**, `limit`/`size` კი
     * ისევ მიიღება და ყველა არჩეულ სახეობაზე ვრცელდება — „ყველაფერი 20 ცალი"
     * სრულიად აზრიანი მოთხოვნაა და მისთვის სამი ველის შევსება ზედმეტია.
     */
    private function optionRules(): array
    {
        $rules = [
            'subjects' => ['nullable', 'array'],
            'subjects.*' => ['in:'.implode(',', GalleryFetcher::SUBJECTS)],
            'cast' => ['nullable', 'in:'.implode(',', GalleryFetcher::CAST_MODES)],
            'cast_ids' => ['nullable', 'array'],
            'cast_ids.*' => ['integer'],
            // §8.2 — მსახიობის ფოტოს წყარო: პორტრეტები და/ან კადრები ფილმებიდან
            'cast_source' => ['nullable', 'in:'.implode(',', GalleryFetcher::CAST_SOURCES)],
            // მსახიობის პორტრეტს TMDB-ზე თავისი ზომები აქვს (Tasks §3.2)
            'cast_size' => ['nullable', 'in:'.implode(',', GalleryFetcher::CAST_SIZES)],
            /* ⚠️ **0 დაშვებულია და „არცერთს" ნიშნავს** (Tasks §3.6): ფილმზე 5
               და მსახიობზე 0 ცხადი არჩევანია, არა შეცდომა. */
            'limit' => ['nullable', 'integer', 'min:0', 'max:'.GalleryFetcher::MAX_LIMIT],
            'size' => ['nullable', 'string', 'max:20'],
            'limits' => ['nullable', 'array'],
            'sizes' => ['nullable', 'array'],
            'per_actor' => ['nullable', 'integer', 'min:0', 'max:'.GalleryFetcher::MAX_PER_ACTOR],
            'actors' => ['nullable', 'integer', 'min:1', 'max:'.GalleryFetcher::MAX_ACTORS],
        ];

        foreach (GalleryFetcher::SUBJECTS as $subject) {
            $rules["limits.{$subject}"] = ['nullable', 'integer', 'min:0', 'max:'.GalleryFetcher::MAX_LIMIT];
            $rules["sizes.{$subject}"] = ['nullable', 'in:'.implode(',', GalleryFetcher::SUBJECT_SIZES[$subject])];
        }

        return $rules;
    }

    /** ერთი პასუხის ფორმა ჩანაწერისთვისაც და მსახიობისთვისაც */
    private function fetchResponse(Request $request, array $result, string $title)
    {
        $payload = [
            ...$result,
            'title' => $title,
            'storage' => $this->meter->usage($request->user()->refresh()),
        ];

        // ნახევრად ჩამოტვირთულს ვინახავთ, მაგრამ სტატუსით ვამბობთ, რომ ადგილი გავსდა
        return response()->json(
            $result['quota_exceeded'] ? [...$payload, 'message' => 'storage_quota_exceeded'] : $payload,
            $result['quota_exceeded'] ? 413 : 200,
        );
    }

    private function find(string $type, int $id): ?Model
    {
        return MediaDomain::model($type)::find($id);
    }

    /** ნებისმიერი გალერეის მშობელი (მედია-დომენი, სიმღერა, წიგნი, თამაში) */
    private function findParent(string $type, int $id): ?Model
    {
        $model = GalleryParent::model($type);

        return $model ? $model::find($id) : null;
    }
}
