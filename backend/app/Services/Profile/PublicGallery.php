<?php

namespace App\Services\Profile;

use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\User;
use App\Services\Modules\FieldSettings;
use App\Support\AlbumLock;
use App\Support\GalleryParent;
use App\Support\GallerySort;
use App\Support\MediaDomain;
use App\Support\PublicDomain;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use WeakMap;

/**
 * **საჯარო გალერეა (Tasks §7.4) — გამოთვლადი და არა ცალკე ჩაწერილი.**
 *
 * შენი სიტყვები: „გალერეის გასაჯაროება შეგიძლია გააკეთო ფილმების/მსახიობების
 * გასაჯაროებით, როგორც ლოგიკურია".
 *
 * ⚠️ **ფოტოს საკუთარი `visibility` სვეტი არ აქვს და არც დაემატება** — ის
 * მშობლის ხილვადობას იმემკვიდრებს (§10-ის წესი). ე.ი. აქ არაფერი ინახება:
 * კითხვა ყოველ ჯერზე იმავე სამფენიანი query-დან გამოითვლება, რასაც
 * `PublicProfileService::query()` იყენებს. ორი წყარო ერთ ფაქტზე ზუსტად ის
 * ხაფანგია, რომელსაც პროექტი თავს არიდებს.
 *
 * **ფოტო საჯაროდ ჩანს სამი გზით** — და ეს სამი გზა ახლა სამი **ცალკე
 * არჩევადი წესია** (`RULES`, Tasks §32):
 *  1. `record` — მისი **ჩანაწერი** საჯაროა (ფილმი · სერიალი · ანიმე · წიგნი · თამაში · ადგილი);
 *  2. `actor` — ის **მსახიობისაა**, რომელიც ჩემს საჯარო მედია-ჩანაწერში თამაშობს;
 *  3. `album` — ის **საჯარო ალბომშია** — ერთადერთი გზა უმშობლო ფოტოსთვის (§7.5).
 *
 * ⚠️ **§32-ის მთავარი წესი: ჭრილი წესს ირჩევს და არა გაერთიანებას ჭრის.**
 * საჯარო ალბომში შეიძლება იდოს **პირადი** ფილმის კადრი — ის „ყველა ფოტოში"
 * კანონიერად ჩანს (მესამე გზით). „ბიბლიოთეკის" ჭრილი კი ჩანაწერებს
 * ჯგუფავს, ე.ი. იქ ასეთი ფოტო პირადი ფილმის ჯგუფს გააჩენდა — **მისი
 * სათაურით**. ამიტომ „ბიბლიოთეკა" მხოლოდ პირველ წესს კითხულობს,
 * „მსახიობები" — მეორეს, „ალბომები" — მესამეს, და მხოლოდ „ყველა ფოტო"
 * აერთიანებს სამივეს.
 *
 * ⚠️ **მსახიობის წესი მეორედ არ იწერება**: „რომელი დომენიდან მოვიდა"
 * `GalleryController::sourceQuery()`-ში უკვე მისი ფილმებით გამოითვლება —
 * აქ იგივე `whereHas`-ია, ოღონდ მხოლოდ **საჯარო** ჩანაწერებზე.
 *
 * ⚠️ **ჩაკეტილი ალბომის ფოტო სიიდან არ ქრება — ის შიშვლდება** (§7.11):
 * რიგი ჩანს, მაგრამ მხოლოდ `id`-ითა და ზომებით. `path`/`remote_path`/
 * `source_url` არასდროს გამოდის, ე.ი. ინსპექტორს საპოვნელი არაფერი აქვს.
 * ესკიზებში (`previews`) კი ჩაკეტილი ფოტო **საერთოდ არ ხვდება** —
 * მფლობელის გალერეის იგივე წესი.
 *
 * ⚠️ **`album_lock` global scope აქ ცხადად იხსნება და ეს აუცილებელია.** ის
 * `Auth::id()`-ს კითხულობს, ე.ი. უცხო მნახველზე ან ცარიელია (ლოკი არ
 * იმუშავებდა), ან **მისივე** ჩაკეტილ ალბომებს დაითვლიდა — სულ სხვა კაცის
 * სიას. ამიტომ დამალვას აქ `AlbumLock::hiddenIdsFor($owner->id)` წყვეტს.
 *
 * ⚠️ **`GalleryImage::servedUrl()`/`preview()` აქ არასდროს გამოიყენება**:
 * ისინი შიდა `/gallery/images/{id}/file`-ზე მიუთითებს, რომელიც
 * `auth:sanctum`-ის უკანაა — უცხოსთვის 404. პირადი დისკის ფაილს საჯარო
 * პროფილის საკუთარი მარშრუტი აქვს (`fileRoute()`).
 */
class PublicGallery
{
    /** ხილვადობის სამი წესი — იხ. კლასის docblock */
    public const RULE_RECORD = 'record';

    public const RULE_ACTOR = 'actor';

    public const RULE_ALBUM = 'album';

    public const RULES = [self::RULE_RECORD, self::RULE_ACTOR, self::RULE_ALBUM];

    /** ჯგუფის ესკიზები — მფლობელის `GalleryController`-ის იგივე რიცხვები */
    public const DEFAULT_PREVIEWS = 5;

    public const MAX_PREVIEWS = 10;

    /**
     * რამდენ ჯგუფს ახლავს ესკიზები ერთ პასუხში.
     *
     * ⚠️ **ესკიზები ერთი query-ითაა და არა ჯგუფ-ჯგუფ** (იხ. `rankedPreviews()`),
     * ე.ი. ჭერი ბაზას არ იცავს — ის **პასუხის ზომას** ზღუდავს: ხუთასფილმიან
     * საჯარო პროფილზე 2500 ბილიკი ერთ JSON-ში. მფლობელის გალერეაც 120-ზე ჩერდება.
     */
    public const PREVIEW_GROUPS = 120;

    /**
     * მოთხოვნა → მისი memo (იხ. `remember()`).
     *
     * @var WeakMap<object, array<string, mixed>>
     */
    private WeakMap $memo;

    public function __construct(
        private PublicProfileService $profiles,
        private FieldSettings $fields,
    ) {
        $this->memo = new WeakMap;
    }

    /**
     * ამ პროფილზე ხილვადი ფოტოების query — **სამივე წესი**, უახლესი პირველი.
     *
     * ⚠️ `withoutGlobalScope('owner')` + ცხადი `user_id` — იგივე ორმხრივი
     * მიზეზი, რაც `PublicProfileService`-ის docblock-შია.
     */
    public function query(User $user): Builder
    {
        return $this->scoped($user, self::RULES)->orderByDesc('gallery_images.id');
    }

    /**
     * **ფოტოების ერთი გვერდი — ჭრილის ფილტრებით (Tasks §32.1).**
     *
     * `owner` — ერთი ჯგუფი (`movie:12` · `actor:5` · `album:3`);
     * `parent` — რომელი წესი (`record` · `actor`), `type`/`from` მას ერთ
     * დომენზე ჭრის; `album=any` — საჯარო ალბომების ფოტოები; `category`;
     * `sort` (`new` · `old` · `random` + `seed`).
     *
     * ⚠️ **`owner=movie:12` მხოლოდ ჩანაწერის საკუთარ ფოტოებს აბრუნებს** —
     * მფლობელის გალერეისგან განსხვავებით, სადაც მისი მსახიობების ფოტოებიც
     * ერევა. ეს განზრახულია: ჯგუფის ბარათზე წერია „12 ფოტო" და შიგნითაც ზუსტად
     * თორმეტი უნდა იყოს („ჯგუფში 40 წერია, შიგნით 37-ია" ამ პროექტში
     * დაწერილი აკრძალვაა). ფილმის მსახიობები იმავე დომენის „მსახიობების"
     * ჩანართშია — ერთი დაჭერით.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>|null `null` — მოთხოვნილი ჯგუფი ამ პროფილზე საჯარო არაა (→ 404)
     */
    public function photosPage(User $user, array $filters, int $perPage, int $page): ?array
    {
        $album = null;

        if ($owner = $filters['owner'] ?? null) {
            [$kind, $id] = explode(':', (string) $owner) + [1 => 0];
            $id = (int) $id;

            if ($kind === 'album') {
                $album = $this->publicAlbum($user, $id);
                if (! $album) {
                    return null;
                }

                $query = $this->photos($user)->where('gallery_images.album_id', $id);
            } elseif ($kind === 'actor') {
                if (! isset(array_flip($this->publicCastIds($user, $this->mediaDomains($user)))[$id])) {
                    return null;
                }

                $query = $this->photos($user)
                    ->where('gallery_images.imageable_type', GalleryParent::ACTOR)
                    ->where('gallery_images.imageable_id', $id);
            } else {
                if (! in_array($kind, $this->recordDomains($user), true)
                    || ! isset(array_flip($this->publicIds($user, $kind))[$id])) {
                    return null;
                }

                $query = $this->photos($user)
                    ->where('gallery_images.imageable_type', $kind)
                    ->where('gallery_images.imageable_id', $id);
            }
        } else {
            $rules = match (true) {
                ($filters['album'] ?? null) === 'any' => [self::RULE_ALBUM],
                ($filters['parent'] ?? null) === self::RULE_RECORD => [self::RULE_RECORD],
                ($filters['parent'] ?? null) === self::RULE_ACTOR => [self::RULE_ACTOR],
                default => self::RULES,
            };

            $query = $this->scoped($user, $rules, $filters['type'] ?? null, $filters['from'] ?? null);
        }

        if ($category = $filters['category'] ?? null) {
            $query->where('gallery_images.category', $category);
        }

        // ⚠️ ნაგულისხმევი „ახალი" — საჯარო ბადე ყოველთვის ასე იწყებოდა
        if (! GallerySort::apply($query, $filters['sort'] ?? 'new', (int) ($filters['seed'] ?? 0))) {
            $query->orderByDesc('gallery_images.id');
        }

        $paginator = $query->paginate($perPage, ['gallery_images.*'], 'page', $page);
        $hidden = AlbumLock::hiddenIdsFor((int) $user->id);
        $images = collect($paginator->items());

        $owners = $this->owners($user, $images
            ->reject(fn (GalleryImage $image) => $this->isHidden($image->album_id, $hidden))
            ->map(fn (GalleryImage $image) => [(string) $image->imageable_type, (int) $image->imageable_id]));

        return [
            'data' => $images
                ->map(fn (GalleryImage $image) => $this->row($user, $image, $hidden, $owners))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ] + ($album ? ['album' => $this->albumMeta($album)] : []);
    }

    /** რამდენი ფოტო ჩანს — პროფილის ტაბის რიცხვი */
    public function count(User $user): int
    {
        return $this->scoped($user, self::RULES)->count();
    }

    /**
     * **ჭრილების მთვლელები — ერთი გამოძახება (Tasks §32.2).**
     *
     * ⚠️ **ცალკე endpoint-ია და არა პროფილის თავის ნაწილი**: თავი ყოველ
     * გახსნაზე იკითხება, გალერეის ჩანართი კი — მხოლოდ მაშინ, როცა მას
     * გახსნი. აქაური ~ათი query ყველა პროფილის ნახვას დაემატებოდა.
     *
     * ⚠️ **თითო რიცხვი იმავე წყაროდანაა, რასაც მისი ჭრილი ხატავს**:
     * „ბიბლიოთეკა" `recordGroups()`-ის მთვლელია, „ალბომები" — `albumGroups()`-ის.
     * ორი ფორმულა ერთ დღეს „ბარათზე 12, შიგნით 11"-ს დაწერდა.
     *
     * @return array<string, mixed>
     */
    public function summary(User $user): array
    {
        $categories = $this->scoped($user, self::RULES)
            ->selectRaw('gallery_images.category as category, count(*) as photos')
            ->groupBy('gallery_images.category')
            ->get()
            ->mapWithKeys(fn ($row) => [(string) ($row->category ?? '') => (int) $row->photos])
            ->all();

        return [
            'photos' => $this->count($user),
            'records' => array_sum(array_map('count', $this->recordPhotoCounts($user))),
            'actors' => count($this->actorPhotoCounts($user, $this->mediaDomains($user))),
            'albums' => count(array_filter($this->albumPhotoCounts($user))),
            'videos' => $this->videosQuery($user)->count(),
            'categories' => (object) $categories,
        ];
    }

    /**
     * **ჯგუფები — `record` · `actor` · `album` (Tasks §32.1).**
     *
     * ⚠️ **„მოდულების" ჭრილი აქ განზრახ არ არსებობს** (§32.4): მთავარი ფოტოები
     * და მოდულების ფაილები ჩანაწერის ნაწილია და არა გალერეის ერთეული, ხოლო
     * `note` მოდული პირადია (§16.5). „წყაროები" არც მფლობელის ტექნიკური
     * ჭრილია, რასაც უცხო თვალი საჭიროებს.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function groups(User $user, string $by, array $filters, int $previews): array
    {
        return match ($by) {
            'actor' => $this->actorGroups($user, $filters, $previews),
            'album' => $this->albumGroups($user, $previews),
            default => $this->recordGroups($user, $filters, $previews),
        };
    }

    /**
     * **ვიდეო-ბმულების ერთი გვერდი (Tasks §32.1).**
     *
     * ⚠️ ვიდეოს ალბომი არ აქვს, ე.ი. მისთვის მხოლოდ პირველი ორი წესი
     * მოქმედებს: მშობელი ჩანაწერი საჯაროა, ან მსახიობი საჯარო ჩანაწერში
     * თამაშობს. `gallery_images`-ის იგივე მემკვიდრეობა — ცალკე სვეტი არ
     * არსებობს და არც დაემატება.
     *
     * @return array<string, mixed>
     */
    public function videosPage(User $user, int $perPage, int $page): array
    {
        $paginator = $this->videosQuery($user)
            ->orderByDesc('gallery_videos.id')
            ->paginate($perPage, ['gallery_videos.*'], 'page', $page);

        $videos = collect($paginator->items());

        $owners = $this->owners($user, $videos->map(
            fn (GalleryVideo $video) => [(string) $video->videoable_type, (int) $video->videoable_id],
        ));

        return [
            'data' => $videos->map(fn (GalleryVideo $video) => $this->videoRow($video, $owners))->values()->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /**
     * **ერთი ფოტო, რომელიც ამ მნახველს ახლა ჩანს (2026-09-17).**
     *
     * `GET /public/profiles/{username}/gallery-photos/{image}/file`-ის
     * ერთადერთი კითხვა: ფოტო ამ პროფილის საჯარო გალერეაშია **და** მისი
     * ალბომი ამ სესიაში ჩაკეტილი არ არის. სხვა ყველაფერზე `null` (→ 404).
     *
     * ⚠️ იგივე `query()` და იგივე `hiddenIdsFor()`, რაც სიას — მეორე
     * „ვინ ხედავს" ფორმულა სწორედ ის ორი წყაროა, რაც ერთ დღეს გაშორდებოდა.
     *
     * ⚠️ **ალბომი აქვე იტვირთება, `owner` scope-ის გარეშე და მფლობელის ცხადი
     * id-ით** (Tasks §1.2). გამომძახებელი `$image->album`-ს კითხულობს (ჩაკეტილ
     * ფაილს `no-store` სჭირდება), რელაცია კი `GalleryAlbum`-ის `owner` scope-ს
     * ემორჩილება: ანონიმზე ის ცარიელია და ყველაფერი მუშაობდა, **შესულ** უცხოს
     * კი მის საკუთარ ალბომებზე ჭრიდა — ალბომი `null`, ე.ი. პაროლით გახსნილი
     * ფოტო `Cache-Control: no-store`-ის გარეშე გადიოდა.
     */
    public function visible(User $user, int $imageId): ?GalleryImage
    {
        $image = $this->query($user)
            ->with(['album' => fn ($album) => $album
                ->withoutGlobalScope('owner')
                ->where('gallery_albums.user_id', $user->id)])
            ->whereKey($imageId)
            ->first();

        if (! $image) {
            return null;
        }

        $hidden = AlbumLock::hiddenIdsFor((int) $user->id);

        return $this->isHidden($image->album_id, $hidden) ? null : $image;
    }

    /* ======================================================================
       წესები
       ====================================================================== */

    /**
     * მფლობელის ფოტოები — **ყოველგვარი ხილვადობის პირობის გარეშე**.
     *
     * ⚠️ ეს მხოლოდ საფუძველია: ყოველი გამომძახებელი მას წესით ან საჯარო
     * ჯგუფით ჭრის (`scoped()`, `photosPage()`-ის `owner`). `trash` scope
     * რჩება — ურნაში მდგომი ფოტო საჯაროდ არასდროს ჩანს.
     */
    private function photos(User $user): Builder
    {
        return GalleryImage::query()
            ->withoutGlobalScope('owner')
            ->withoutGlobalScope('album_lock')
            ->where('gallery_images.user_id', $user->id);
    }

    /**
     * ფოტოები **არჩეული წესებით** — იხ. კლასის docblock.
     *
     * ⚠️ **არცერთი წყარო არ არის ღია → ცარიელი პასუხი და არა „ყველაფერი".**
     * ცარიელი `orWhere`-ების ჯგუფი SQL-ში ჭეშმარიტია, ე.ი. პირობის გარეშე
     * ეს query მთელ გალერეას დააბრუნებდა.
     *
     * @param  list<string>  $rules
     */
    private function scoped(User $user, array $rules, ?string $type = null, ?string $from = null): Builder
    {
        $q = $this->photos($user);

        $recordDomains = in_array(self::RULE_RECORD, $rules, true) ? $this->recordDomains($user, $type) : [];
        $castDomains = in_array(self::RULE_ACTOR, $rules, true) ? $this->mediaDomains($user, $from) : [];
        $albums = in_array(self::RULE_ALBUM, $rules, true) ? $this->publicAlbumIds($user) : [];

        if (! $recordDomains && ! $castDomains && ! $albums) {
            return $q->whereRaw('1 = 0');
        }

        return $q->where(function (Builder $w) use ($user, $recordDomains, $castDomains, $albums) {
            foreach ($recordDomains as $domain) {
                $w->orWhere(fn (Builder $x) => $x
                    ->where('gallery_images.imageable_type', $domain)
                    ->whereIn('gallery_images.imageable_id', $this->publicIds($user, $domain)));
            }

            if ($castDomains) {
                $w->orWhere(fn (Builder $x) => $x
                    ->where('gallery_images.imageable_type', GalleryParent::ACTOR)
                    ->whereIn('gallery_images.imageable_id', $this->publicCastIds($user, $castDomains)));
            }

            if ($albums) {
                $w->orWhereIn('gallery_images.album_id', $albums);
            }
        });
    }

    /**
     * საჯარო **ჩანაწერის** დომენები, რომლებსაც ფოტო შეიძლება ეკიდოს.
     *
     * @return list<string>
     */
    private function recordDomains(User $user, ?string $only = null): array
    {
        $domains = array_values(array_intersect(GalleryParent::recordKeys(), $this->profiles->domains($user)));

        return $only === null ? $domains : array_values(array_intersect($domains, [$only]));
    }

    /**
     * საჯარო **მედია**-დომენები — მსახიობი მხოლოდ მათში „თამაშობს".
     *
     * @return list<string>
     */
    private function mediaDomains(User $user, ?string $only = null): array
    {
        $domains = array_values(array_intersect(MediaDomain::TYPES, $this->profiles->domains($user)));

        return $only === null ? $domains : array_values(array_intersect($domains, [$only]));
    }

    /**
     * **მოთხოვნის ფარგლებში დამახსოვრება — ერთი ადგილი ყველა memo-სთვის.**
     *
     * ⚠️ **გასაღები მიმდინარე `Request`-ია და არა ეს ინსტანცია** (Tasks §32,
     * PERF-15-ის გაკვეთილი ცოცხალ ხარვეზად). აქამდე memo ინსტანციის ველი იყო
     * და docblock ამბობდა „ინსტანცია ერთი მოთხოვნისაა". ეს სიმართლე არ არის:
     * `Route::getController()` კონტროლერს **მარშრუტზე** იმახსოვრებს, ე.ი.
     * ტესტში (და Octane-ზე) მომდევნო მოთხოვნა იმავე სერვისს და **იმავე memo-ს**
     * იღებდა. §32-მა მსახიობების სიაც დაიმახსოვრა და ეს მაშინვე გამოჩნდა:
     * ფილმიდან წაშლილი მსახიობის ფოტოები მეორე მოთხოვნაზე ისევ საჯარო იყო —
     * ხოლო ქვერიების მთვლელი ტესტი ორ „თბილ" პასუხს ადარებდა და ჩუმად
     * ცარიელი გახდებოდა.
     *
     * ⚠️ `WeakMap` — მოთხოვნის ობიექტი რომ გაქრება, მისი memo-ც თავისით ქრება.
     */
    private function remember(string $key, callable $compute): mixed
    {
        $scope = app()->bound('request') ? app('request') : $this;
        $bag = $this->memo[$scope] ?? [];

        if (! array_key_exists($key, $bag)) {
            $bag[$key] = $compute();
            $this->memo[$scope] = $bag;
        }

        return $bag[$key];
    }

    /**
     * ამ დომენის საჯარო ჩანაწერების id-ები.
     *
     * ⚠️ **შედეგი მოთხოვნის ფარგლებში იმახსოვრება** (Tasks PERF-02): ერთსა და
     * იმავე დომენს რამდენიმე ადგილი ეკითხება — ჩანაწერის ფოტოები, მსახიობები,
     * ჯგუფები, მფლობელის სახელები. იხ. `remember()`.
     *
     * @return list<int>
     */
    private function publicIds(User $user, string $domain): array
    {
        return $this->remember('ids:'.$user->id.':'.$domain, fn () => $this->profiles->query($user, $domain)
            ->reorder()
            ->pluck(PublicDomain::model($domain)::query()->getModel()->getTable().'.id')
            ->map(fn ($id) => (int) $id)
            ->all());
    }

    /**
     * მსახიობები, რომლებიც ჩემს **საჯარო** მედია-ჩანაწერებში თამაშობენ.
     *
     * ⚠️ `cast_members` გლობალური ლექსიკონია, ე.ი. „ჩემი მსახიობი" მხოლოდ
     * ჩემი ჩანაწერებით განისაზღვრება — ზუსტად ის წესი, რასაც `GlobalSearch`
     * და `sourceQuery()` უკვე იყენებს.
     *
     * ⚠️ **pivot პირდაპირ იკითხება და არა ჩანაწერ-ჩანაწერ** (Tasks PERF-02).
     * `foreach ($records as $record) { $record->cast()->pluck(…) }` თითო
     * საჯარო ჩანაწერზე თითო query იყო — გაზომილი: 5 ფილმზე 16 query,
     * 25-ზე 36, 60-ზე 71. ⚠️ და ეს **`auth:sanctum`-ის გარეთაა**: ერთადერთი
     * დომენური endpoint, რომელსაც ავტორიზაციის გარეშე გამოიძახებ, ე.ი.
     * წრფივი ზრდა აქ არა მხოლოდ ნელი გვერდია, არამედ იაფი DoS-ვექტორიც.
     *
     * ⚠️ `castable_type`-ად **დომენის key გამოიყენება და არა `getMorphClass()`**:
     * `query()`-შივე `imageable_type`-ს ზუსტად ასე ადარებს (`movie`/`series`/
     * `anime` morph-რუკის სახელებია) — ორი კონვენცია ერთ ცხრილზე ზუსტად ის
     * არის, რაც ერთ დღეს გაშორდება.
     *
     * @param  list<string>  $domains
     * @return list<int>
     */
    private function publicCastIds(User $user, array $domains): array
    {
        return $this->remember('cast:'.$user->id.':'.implode(',', $domains), function () use ($user, $domains) {
            $ids = [];

            foreach ($domains as $domain) {
                $recordIds = $this->publicIds($user, $domain);

                if (! $recordIds) {
                    continue;
                }

                foreach (DB::table('castables')
                    ->where('castable_type', $domain)
                    ->whereIn('castable_id', $recordIds)
                    /* ⚠️ Tasks §16 — წაშლილი ბმული „საფლავის ქვაა" და არა მონაწილეობა:
                       pivot აქ პირდაპირ იკითხება, ე.ი. `HasCastMembers::cast()`-ის
                       ფილტრი ვერ დაიცავდა — ფილმიდან წაშლილი ადამიანის ფოტოები
                       საჯარო პროფილზე ისევ გამოჩნდებოდა. */
                    ->where('is_removed', false)
                    ->distinct()
                    ->pluck('cast_member_id') as $castId) {
                    $ids[(int) $castId] = true;
                }
            }

            return array_keys($ids);
        });
    }

    /** @return list<int> */
    private function publicAlbumIds(User $user): array
    {
        return $this->remember('albums:'.$user->id, fn () => GalleryAlbum::query()
            ->withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->where('visibility', 'public')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all());
    }

    /**
     * ერთი საჯარო ალბომი — **ამ** პროფილისა, თორემ `null`.
     *
     * ⚠️ `owner` scope იხსნება და მფლობელი ცხადად იწერება (§1.2-ის წესი):
     * შესულ უცხოს scope მის საკუთარ ალბომებზე მოჭრიდა და სხვისი საჯარო
     * ალბომი 404 გამოვიდოდა.
     */
    private function publicAlbum(User $user, int $id): ?GalleryAlbum
    {
        return GalleryAlbum::query()
            ->withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->where('visibility', 'public')
            ->find($id);
    }

    /** @param  list<int>  $hidden */
    private function isHidden(mixed $albumId, array $hidden): bool
    {
        return $albumId !== null && in_array((int) $albumId, $hidden, true);
    }

    /* ======================================================================
       ჯგუფები
       ====================================================================== */

    /**
     * საჯარო ჩანაწერების ფოტოების მთვლელი — `[დომენი => [id => რაოდენობა]]`.
     *
     * ⚠️ **ჩაკეტილი ფოტოც ითვლება** (მფლობელის გალერეის 2026-09-20-ის წესი):
     * რიცხვი ფოტოს არ ამხელს — ამხელს ბილიკი, რომელიც აქ არ იწერება. ბადე
     * მას დაბლარულად ხატავს, ე.ი. „ჯგუფში 12, შიგნით 12".
     *
     * @return array<string, array<int, int>>
     */
    private function recordPhotoCounts(User $user): array
    {
        return $this->remember('recordCounts:'.$user->id, function () use ($user) {
            $out = [];

            foreach ($this->recordDomains($user) as $domain) {
                $ids = $this->publicIds($user, $domain);

                $out[$domain] = $ids ? $this->countBy(
                    $this->photos($user)
                        ->where('gallery_images.imageable_type', $domain)
                        ->whereIn('gallery_images.imageable_id', $ids),
                    'gallery_images.imageable_id',
                ) : [];
            }

            return $out;
        });
    }

    /**
     * საჯარო ჩანაწერებში მოთამაშე მსახიობების ფოტოების მთვლელი — `[id => რაოდენობა]`.
     *
     * @param  list<string>  $domains
     * @return array<int, int>
     */
    private function actorPhotoCounts(User $user, array $domains): array
    {
        $castIds = $domains ? $this->publicCastIds($user, $domains) : [];

        return $castIds ? $this->countBy(
            $this->photos($user)
                ->where('gallery_images.imageable_type', GalleryParent::ACTOR)
                ->whereIn('gallery_images.imageable_id', $castIds),
            'gallery_images.imageable_id',
        ) : [];
    }

    /**
     * საჯარო ალბომების ფოტოების მთვლელი — `[album_id => რაოდენობა]`.
     *
     * @return array<int, int>
     */
    private function albumPhotoCounts(User $user): array
    {
        $albums = $this->publicAlbumIds($user);

        return $albums ? $this->countBy(
            $this->photos($user)->whereIn('gallery_images.album_id', $albums),
            'gallery_images.album_id',
        ) : [];
    }

    /**
     * ერთი `GROUP BY` → `[გასაღები => რაოდენობა]`.
     *
     * @return array<int, int>
     */
    private function countBy(Builder $query, string $column): array
    {
        return $query
            ->selectRaw($column.' as group_key, count(*) as photos')
            ->groupBy($column)
            ->get()
            ->mapWithKeys(fn ($row) => [(int) $row->group_key => (int) $row->photos])
            ->all();
    }

    /**
     * **ჩანაწერების ჯგუფები** — მხოლოდ პირველი წესი (იხ. კლასის docblock).
     *
     * ⚠️ **ფასეტური მთვლელი ყველა დომენს ითვლის და მერე ჭრის** — მფლობელის
     * `recordGroups()`-ის წესი (§24.4): ჭრილი საკუთარ თავს არ ითვლის, თორემ
     * ერთი დომენის არჩევისთანავე დანარჩენი ბარათები ნულზე ჩამოვიდოდა.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function recordGroups(User $user, array $filters, int $previews): array
    {
        $groups = collect();

        foreach ($this->recordPhotoCounts($user) as $domain => $counts) {
            if (! $counts) {
                continue;
            }

            $cards = $this->recordCards($user, $domain, array_keys($counts));

            foreach ($counts as $id => $photos) {
                /* ⚠️ ბარათის **ვიწრო ფორმიდან** — სათაური, წელი (თუ მფლობელმა
                   საჯარო ბარათზე არ დამალა) და მეტი არაფერი. ჩანაწერის სრული
                   რესურსი აქ ისევე არ მიდის, როგორც `{domain}` ჩანართზე. */
                $card = $cards[$id] ?? null;

                if (! $card) {
                    continue;
                }

                $groups->push([
                    'kind' => $domain,
                    'id' => $id,
                    'title' => $card['title_en'] ?? null,
                    'title_ka' => $card['title_ka'] ?? null,
                    'year' => $card['year'] ?? null,
                    'photos' => $photos,
                ]);
            }
        }

        $groups = $groups->sortByDesc('photos')->values();

        $facets = $groups->countBy('kind')->map(fn ($n) => (int) $n)->all();
        $facets['all'] = $groups->count();

        if ($type = $filters['type'] ?? null) {
            $groups = $groups->where('kind', $type)->values();
        }

        return [
            'by' => 'record',
            'groups' => $groups->all(),
            'facets' => ['types' => (object) $facets],
            'previews' => $this->parentPreviews($user, $groups->take(self::PREVIEW_GROUPS), $previews),
        ];
    }

    /**
     * **მსახიობების ჯგუფები** — მხოლოდ მეორე წესი; `from` ერთ დომენზე ჭრის.
     *
     * ⚠️ სქესის მთვლელი **ფილტრამდე** ითვლება (§24.2): „ქალების" არჩევისთანავე
     * „კაცები" ნულზე რომ არ ჩამოვიდეს.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function actorGroups(User $user, array $filters, int $previews): array
    {
        $counts = $this->actorPhotoCounts($user, $this->mediaDomains($user, $filters['from'] ?? null));

        $members = $counts
            ? CastMember::query()->whereIn('id', array_keys($counts))->get()->keyBy('id')
            : collect();

        $facets = [
            'all' => $members->count(),
            'female' => $members->where('gender', CastMember::GENDER_FEMALE)->count(),
            'male' => $members->where('gender', CastMember::GENDER_MALE)->count(),
        ];

        if ($gender = $filters['gender'] ?? null) {
            $wanted = $gender === 'female' ? CastMember::GENDER_FEMALE : CastMember::GENDER_MALE;
            $members = $members->where('gender', $wanted);
        }

        $groups = $members
            ->map(fn (CastMember $member) => [
                'kind' => 'actor',
                'id' => (int) $member->id,
                'title' => $member->name,
                'title_ka' => $member->name_ka,
                'photos' => $counts[(int) $member->id] ?? 0,
                'gender' => $member->gender,
            ])
            ->sortByDesc('photos')
            ->values();

        return [
            'by' => 'actor',
            'groups' => $groups->all(),
            'facets' => ['gender' => $facets],
            'previews' => $this->parentPreviews($user, $groups->take(self::PREVIEW_GROUPS), $previews),
        ];
    }

    /**
     * **ალბომების ჯგუფები** — მხოლოდ მესამე წესი.
     *
     * ⚠️ **ცარიელი ალბომი აქ არ იხატება** — მფლობელისგან განსხვავებით, სადაც
     * ცარიელი საქაღალდე სწორედ ის ადგილია, სადაც პირველ ფოტოს ჩააგდებ. უცხო
     * მნახველი ვერაფერს ჩააგდებს, ე.ი. ცარიელი ბარათი მისთვის მხოლოდ ხმაურია.
     *
     * ⚠️ **ჩაკეტილს ესკიზი არ ახლავს** (§32.1 — „ალბომის ბარათს მთავარი ფოტო
     * მხოლოდ ღიას"): ერთი ესკიზიც `path`-ს გამოიტანდა და ბლარის მოხსნა
     * devtools-ში ერთი კლიკი იქნებოდა. რიცხვი და სახელი ჩანს.
     *
     * @return array<string, mixed>
     */
    private function albumGroups(User $user, int $previews): array
    {
        $counts = $this->albumPhotoCounts($user);

        $albums = $counts
            ? GalleryAlbum::query()
                ->withoutGlobalScope('owner')
                ->where('user_id', $user->id)
                ->where('visibility', 'public')
                ->whereIn('id', array_keys($counts))
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get()
            : collect();

        $groups = $albums->map(fn (GalleryAlbum $album) => [
            'kind' => 'album',
            'id' => (int) $album->id,
            'title' => $album->name,
            'title_ka' => $album->name,
            'subtitle' => $album->description,
            'photos' => $counts[(int) $album->id] ?? 0,
            'locked' => $album->isLocked(),
            // ⚠️ გახსნილობა **სესიისაა** — ალბომის პაროლი ამ ბრაუზერში შეიყვანეს
            'unlocked' => AlbumLock::isUnlocked($album),
        ])->values();

        $open = $groups
            ->filter(fn (array $group) => ! $group['locked'] || $group['unlocked'])
            ->take(self::PREVIEW_GROUPS)
            ->pluck('id')
            ->all();

        return [
            'by' => 'album',
            'groups' => $groups->all(),
            'previews' => $open && $previews > 0
                ? $this->rankedPreviews(
                    $user,
                    $this->photos($user)->whereIn('gallery_images.album_id', $open),
                    ['gallery_images.album_id'],
                    $previews,
                    fn ($row) => 'album:'.$row->album_id,
                )
                : (object) [],
        ];
    }

    /**
     * ჩანაწერების/მსახიობების ესკიზები.
     *
     * @param  Collection<int, array<string, mixed>>  $groups
     * @return array<string, mixed>|object
     */
    private function parentPreviews(User $user, Collection $groups, int $limit): array|object
    {
        $byParent = [];

        foreach ($groups as $group) {
            $type = $group['kind'] === 'actor' ? GalleryParent::ACTOR : $group['kind'];
            $byParent[$type][] = (int) $group['id'];
        }

        if (! $byParent || $limit <= 0) {
            return (object) [];
        }

        $scope = $this->photos($user)->where(function (Builder $w) use ($byParent) {
            foreach ($byParent as $type => $ids) {
                $w->orWhere(fn (Builder $x) => $x
                    ->where('gallery_images.imageable_type', $type)
                    ->whereIn('gallery_images.imageable_id', $ids));
            }
        });

        return $this->rankedPreviews(
            $user,
            $scope,
            ['gallery_images.imageable_type', 'gallery_images.imageable_id'],
            $limit,
            fn ($row) => ($row->imageable_type === GalleryParent::ACTOR ? 'actor' : $row->imageable_type)
                .':'.$row->imageable_id,
        );
    }

    /**
     * **ყველა ჯგუფის ესკიზი ერთი query-ით** — `row_number() over (partition by …)`.
     *
     * ⚠️ **ჯგუფ-ჯგუფ query აქ ვერ დაიწერება** (Tasks PERF-02-ის გაკვეთილი):
     * მფლობელის `previews()` თითო ჯგუფზე ერთ `select`-ს უშვებს, ეს endpoint
     * კი **ავტორიზაციის გარეთაა** — ხუთასფილმიან პროფილზე ანონიმური ნახვა
     * ას ოცამდე query-ს დაიწყებდა. ფანჯრის ფუნქცია სტანდარტული SQL-ია და
     * ორივე ძრავა იცნობს (MariaDB 10.2+, MySQL 8, SQLite 3.25+), ე.ი. ეს
     * დრაივერის ცალკე შტო არ არის.
     *
     * ⚠️ **ჩაკეტილი ფოტო ესკიზში საერთოდ არ ხვდება** — მფლობელის გალერეის
     * წესი: ერთი ესკიზიც ბილიკს გამოიტანდა. ესკიზი დასტაზე ისედაც მხოლოდ
     * „რა დევს შიგნით"-ის ორიენტირია.
     *
     * @param  list<string>  $partition
     * @param  callable(object): string  $keyOf
     * @return array<string, list<string|array{url: string, private: true}>>|object
     */
    private function rankedPreviews(User $user, Builder $scope, array $partition, int $limit, callable $keyOf): array|object
    {
        $hidden = AlbumLock::hiddenIdsFor((int) $user->id);

        if ($hidden) {
            $scope->where(fn (Builder $w) => $w
                ->whereNull('gallery_images.album_id')
                ->orWhereNotIn('gallery_images.album_id', $hidden));
        }

        $ranked = $scope
            ->select(array_merge(['gallery_images.id', 'gallery_images.path'], $partition))
            ->selectRaw(
                'row_number() over (partition by '.implode(', ', $partition)
                .' order by gallery_images.sort_order, gallery_images.id) as preview_rank',
            );

        $rows = DB::query()
            ->fromSub($ranked->toBase(), 'ranked')
            ->where('preview_rank', '<=', $limit)
            ->orderBy('preview_rank')
            ->get();

        $out = [];

        foreach ($rows as $row) {
            $out[$keyOf($row)][] = $this->preview($user, (int) $row->id, (string) $row->path);
        }

        return $out ?: (object) [];
    }

    /* ======================================================================
       რიგები
       ====================================================================== */

    /**
     * **ერთი ფოტოს ვიწრო ფორმა.**
     *
     * ⚠️ `PublicDomain::card()`-ის იგივე წესი: ველი მხოლოდ მაშინ ჩნდება,
     * თუ ცხადად ჩაიწერა. ჩაკეტილზე კი **მხოლოდ სამი ფაქტი** — რომ რიგი
     * არსებობს, რა პროპორციისაა და რომ ჩაკეტილია.
     *
     * ⚠️ **გახსნილი ჩაკეტილი ალბომის ფოტო პირად დისკზეა** (§7.9), ე.ი. მისი
     * `path` `/storage/*`-ზე 404-ია — უცხოსაც და მფლობელსაც. ამიტომ `path`
     * აქ **მისამართია და არა სვეტი**: საჯაროზე storage-ის გზა, პრივატულზე
     * საჯარო პროფილის საკუთარი ფაილის მარშრუტი, `private: true`-თი. შიდა
     * `/gallery/images/{id}/file` აქ არ გამოდგება — ის `auth:sanctum`-ის
     * უკანაა და უცხოსთვის 404 იქნებოდა (2026-09-17).
     *
     * ⚠️ **`owner` (ვისია ფოტო) მხოლოდ საჯარო მშობელს ეწერება** (§32): საჯარო
     * ალბომში მდგომ პირადი ფილმის კადრს სათაური რომ მიწეროდა, ალბომი ფილმის
     * სახელს გაამხელდა. `owners()` ასეთ მშობელს უბრალოდ ვერ პოულობს.
     *
     * @param  list<int>  $hidden
     * @param  array<string, array<string, mixed>>  $owners
     * @return array<string, mixed>
     */
    private function row(User $user, GalleryImage $image, array $hidden, array $owners = []): array
    {
        $locked = $this->isHidden($image->album_id, $hidden);

        $base = [
            'id' => $image->id,
            'width' => $image->width,
            'height' => $image->height,
            'album_id' => $image->album_id,
            'locked' => $locked,
        ];

        if ($locked) {
            return $base;
        }

        $private = $image->isPrivate();

        return $base + [
            'path' => $private ? $this->fileRoute($user, (int) $image->getKey()) : $image->path,
            'private' => $private,
            'category' => $image->category,
            'owner' => $owners[$image->imageable_type.':'.$image->imageable_id] ?? null,
        ];
    }

    /**
     * ერთი ესკიზი — საჯაროზე გზა, პრივატულზე `{url, private}`.
     *
     * ⚠️ `GalleryImage::preview()`-ის ტყუპია, ოღონდ **საჯარო** მარშრუტით:
     * იმის `url` შიდა `/gallery/images/{id}/file`-ია (უცხოსთვის 404).
     *
     * @return string|array{url: string, private: true}
     */
    private function preview(User $user, int $id, string $path): string|array
    {
        return StorageFolder::isPrivate($path)
            ? ['url' => $this->fileRoute($user, $id), 'private' => true]
            : $path;
    }

    /** საჯარო პროფილის საკუთარი ფაილის მარშრუტი — იხ. `row()` */
    private function fileRoute(User $user, int $id): string
    {
        return '/public/profiles/'.$user->username.'/gallery-photos/'.$id.'/file';
    }

    /**
     * **ვისია ფოტო/ვიდეო — მხოლოდ საჯარო მშობელი.**
     *
     * ⚠️ **მშობლები ჯგუფურად იკითხება** (`whereIn` თითო ტიპზე) და არა თითო
     * ფოტოზე: 24-ფოტოიანი გვერდი 24 დამატებით query-ს ნიშნავდა.
     *
     * @param  Collection<int, array{0: string, 1: int}>  $pairs
     * @return array<string, array<string, mixed>>
     */
    private function owners(User $user, Collection $pairs): array
    {
        $records = [];
        $actors = [];
        $castIds = null;
        $domains = array_flip($this->recordDomains($user));
        /** @var array<string, array<int, int>> $publicByType ტიპი → საჯარო id-ების ძიების რუკა */
        $publicByType = [];

        foreach ($pairs as [$type, $id]) {
            if ($type === GalleryParent::ACTOR) {
                $castIds ??= array_flip($this->publicCastIds($user, $this->mediaDomains($user)));

                if (isset($castIds[$id])) {
                    $actors[$id] = true;
                }
            } elseif (isset($domains[$type])) {
                $publicByType[$type] ??= array_flip($this->publicIds($user, $type));

                if (isset($publicByType[$type][$id])) {
                    $records[$type][$id] = true;
                }
            }
        }

        $out = [];

        foreach ($records as $type => $ids) {
            foreach ($this->recordCards($user, $type, array_keys($ids)) as $id => $card) {
                $out[$type.':'.$id] = [
                    'kind' => $type,
                    'id' => $id,
                    'title' => $card['title_en'] ?? null,
                    'title_ka' => $card['title_ka'] ?? null,
                ];
            }
        }

        if ($actors) {
            foreach (CastMember::query()->whereIn('id', array_keys($actors))->get() as $member) {
                $out[GalleryParent::ACTOR.':'.$member->id] = [
                    'kind' => 'actor',
                    'id' => (int) $member->id,
                    'title' => $member->name,
                    'title_ka' => $member->name_ka,
                ];
            }
        }

        return $out;
    }

    /**
     * საჯარო ჩანაწერების **ვიწრო ბარათები** — `[id => card]`.
     *
     * ⚠️ `PublicDomain::card()` და მფლობელის დამალული ველები (`FieldSettings`):
     * ჯგუფის სათაური და წელი იმავე ფორმიდან მოდის, რასაც `{domain}` ჩანართი
     * ხატავს — ე.ი. მფლობელის მიერ საჯაროდ დამალული წელი აქაც არ ჩანს.
     *
     * @param  list<int>  $ids
     * @return array<int, array<string, mixed>>
     */
    private function recordCards(User $user, string $domain, array $ids): array
    {
        if (! $ids) {
            return [];
        }

        $table = PublicDomain::model($domain)::query()->getModel()->getTable();
        $hidden = $this->remember(
            'hidden:'.$user->id.':'.$domain,
            fn () => $this->fields->hiddenOnPublic($user, PublicDomain::module($domain)),
        );

        return $this->profiles->query($user, $domain)
            ->reorder()
            ->whereIn($table.'.id', $ids)
            ->get()
            ->mapWithKeys(fn ($record) => [(int) $record->id => PublicDomain::card($domain, $record, $hidden)])
            ->all();
    }

    /**
     * საჯარო ვიდეო-ბმულების query.
     *
     * ⚠️ **ცარიელი წყარო → ცარიელი პასუხი** (`scoped()`-ის წესი).
     */
    private function videosQuery(User $user): Builder
    {
        $q = GalleryVideo::query()
            ->withoutGlobalScope('owner')
            ->where('gallery_videos.user_id', $user->id);

        $recordDomains = $this->recordDomains($user);
        $mediaDomains = $this->mediaDomains($user);

        if (! $recordDomains && ! $mediaDomains) {
            return $q->whereRaw('1 = 0');
        }

        return $q->where(function (Builder $w) use ($user, $recordDomains, $mediaDomains) {
            foreach ($recordDomains as $domain) {
                $w->orWhere(fn (Builder $x) => $x
                    ->where('gallery_videos.videoable_type', $domain)
                    ->whereIn('gallery_videos.videoable_id', $this->publicIds($user, $domain)));
            }

            if ($mediaDomains) {
                $w->orWhere(fn (Builder $x) => $x
                    ->where('gallery_videos.videoable_type', GalleryParent::ACTOR)
                    ->whereIn('gallery_videos.videoable_id', $this->publicCastIds($user, $mediaDomains)));
            }
        });
    }

    /**
     * **ერთი ვიდეო-ბმულის ვიწრო ფორმა.**
     *
     * ⚠️ `GalleryVideoResource` აქ განზრახ არ გამოიყენება (`PublicDomain::card()`-ის
     * წესი): ის `source`-ს, `source_url`-ს, `sort_order`-ს და `created_at`-საც
     * აბრუნებს, ხოლო მასში ხვალ დამატებული ველი ჩუმად გაჟონავდა უცხო თვალში.
     * ⚠️ `embed_url` backend-ის allowlist-იდანაა (`VideoUrl`) — SPA მას მაინც
     * ხელახლა ამოწმებს (`lib/embed.ts`).
     *
     * @param  array<string, array<string, mixed>>  $owners
     * @return array<string, mixed>
     */
    private function videoRow(GalleryVideo $video, array $owners): array
    {
        return [
            'id' => $video->id,
            'url' => $video->url,
            'platform' => $video->platform,
            'embed_url' => $video->embed_url,
            'title' => $video->title,
            'channel' => $video->channel,
            'duration' => $video->duration,
            'published_at' => $video->published_at?->toDateString(),
            'thumbnail_url' => $video->thumbnail_url,
            'owner' => $owners[$video->videoable_type.':'.$video->videoable_id] ?? null,
        ];
    }

    /**
     * ალბომის თავი ერთი ალბომის გვერდზე — სახელი და ჩაკეტილობა.
     *
     * ⚠️ **ორი ცალკე ფაქტი**: `locked` — პაროლი ადევს; `unlocked` — ამ
     * სესიაში უკვე გახსნეს. მხოლოდ პირველი რომ გვეთქვა, გახსნილ ალბომზე
     * „პაროლის შეყვანა" ღილაკი დარჩებოდა.
     *
     * @return array<string, mixed>
     */
    private function albumMeta(GalleryAlbum $album): array
    {
        return [
            'id' => (int) $album->id,
            'name' => $album->name,
            'description' => $album->description,
            'locked' => $album->isLocked(),
            'unlocked' => AlbumLock::isUnlocked($album),
        ];
    }
}
