<?php

namespace App\Services\Share;

use App\Exceptions\RecordInTrashException;
use App\Models\ApprovalRequest;
use App\Models\Module;
use App\Models\Playlist;
use App\Models\ShareLink;
use App\Models\Status;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Profile\PublicProfileService;
use App\Services\Storage\StorageMeter;
use App\Support\AppTime;
use App\Support\MediaDomain;
use App\Support\MediaDuplicate;
use App\Support\NotificationType;
use App\Support\PublicDomain;
use App\Support\ShareDomain;
use App\Support\StorageFolder;
use App\Support\VideoUrl;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * **ბმულიდან საკუთარ ბიბლიოთეკაში დამატება (Tasks §40.8, §40.10).**
 *
 * ⚠️ **მხოლოდ „რა ფილმია" გადმოდის (Q49 — „ა").** TMDB-იანი ჩანაწერი მიმღებთან
 * TMDB-დან თავიდან ივსება (პოსტერი, აღწერა, ჟანრები, მსახიობები) — მიმღების
 * **საკუთარი** გასაღებით; გამზიარებლის პირადი ნაწილი (რჩეული, ჩანიშვნები,
 * საკუთარი ველები, გალერეა, მსახიობების შენეული რიგი) არ გადმოდის. ხელით
 * შეყვანილი (TMDB-ის გარეშე) კი სხვაგვარად ვერ შეივსება, ამიტომ მისი სათაური,
 * წელი, აღწერა, ჟანრები და ატვირთული პოსტერი კოპირდება — პოსტერი **მიმღების**
 * კვოტით; ადგილი თუ არ ეყო, ჩანაწერი პოსტერის გარეშე ემატება და მიზეზი ბრუნდება.
 *
 * ⚠️ **ეტაპი 2-ის რვა დომენი (§40.10) Q49-ის მეორე შტოთია**: ჩანაწერის
 * **ფაქტები** კოპირდება (`RECIPES` — სათაური, აღწერა, წელი, იდენტობა,
 * ბმული, მთავარი ფოტო), **პირადი** კი არა — შეფასება, რჩეული, ტეგები,
 * ბმულების სია, პროგრესი, „ჩემი პლატფორმა", ჩანიშვნები, ფაილები, დაკვრის
 * მრიცხველი. გარე წყაროს (RAWG/Open Library/Nominatim/oEmbed) **არ
 * ეკითხება**: ფაქტების სვეტები ისედაც წყაროს პასუხია, RAWG მიმღების პირად
 * გასაღებს ითხოვს (რომელიც უმრავლესობას არ აქვს), Nominatim კი წამში ერთ
 * მოთხოვნას — 300 ადგილი ხუთი წუთი იქნებოდა იმის გასაგებად, რაც უკვე ვიცით.
 * კლასიფიკატორი (ჟანრი/კატეგორია/ტიპი) **სახელით** გადმოდის (Q51): მიმღებთან
 * იმავე სახელის ჩანაწერი (ორივე ენაზე, რეგისტრისა და პუნქტუაციის გარეშე) — ის;
 * არ აქვს — **იქმნება** მის ლექსიკონში (სახელი, აიქონი; ფერის სვეტი
 * ლექსიკონებს არ აქვს).
 *
 * ⚠️ **სტატუსს მიმღები ირჩევს (Q48 — „ა")**: `default` — მისი ნაგულისხმევი
 * (`HasStatus`-ის `creating` ჰუკი; enum-იანზე სვეტის ნაგულისხმევი), `owner` —
 * „როგორც გამზიარებელს აქვს": ლექსიკონიანზე **როლით** და არასდროს სახელით ან
 * გასაღებით (§6.4: ჩემი „ნანახი" და შენი „ვნახე" მხოლოდ როლის დონეზეა ერთი),
 * enum-იანზე — გასაღებით (ის კოდშია და ყველასთვის ერთია). დასრულებულს
 * გამზიარებლის თარიღიც მოჰყვება — თორემ 300 „ნანახი" ერთ დღეს ჩაიწერებოდა
 * სტატისტიკასა და მიზნებში. ⚠️ ვიდეოს `watched_at` **დაკვრის** დროა და არა
 * სტატუსის (`statusDoneColumn()` — `null`), ამიტომ ის არასდროს გადმოდის.
 *
 * ⚠️ **გამდიდრება სურვილისამებრია და არა პირობა** (ჩატის წესი): გასაღები
 * შეიძლება არ იყოს ან წყარო არ პასუხობდეს — ჩანაწერი მაინც იქმნება (სათაურით
 * და ჟანრებით), `partial: true`-ით, და ჩვეულებრივი სინქრონიზაცია მერე შეავსებს.
 *
 * ⚠️ **პლეილისტი (§40.13) ასლს ქმნის** — `addPlaylist()`: სიმღერები სიმღერის
 * რეცეპტით ემატება (ან უკვე არსებული გამოიყენება) და მიმღებთან იმავე რიგის
 * პლეილისტი იქმნება.
 */
final class ShareImporter
{
    /**
     * **რა გადმოდის ეტაპი 2-ის დომენებზე** — ფაქტები და მთავარი ფოტო.
     *
     * ⚠️ სია **ცხადად** წერია (`PublicDomain::card()`-ის წესი): მოდელის ყველა
     * სვეტის კოპირება ხვალ დამატებულ პირად ველს ჩუმად გადაიტანდა.
     * - `copy` — სვეტები, რომლებიც ერთი-ერთზე გადმოდის;
     * - `url` — `embed` (ვიდეო/სიმღერა: პლატფორმა და ჩაშენება **ჩვენი
     *   allowlist-ით** თავიდან გამოითვლება, `VideoUrl`) ან `apply` (ბუკმარკი/კურსი —
     *   მოდელის `applyUrl()`, დომენის/პლატფორმის ერთადერთი მწერალი);
     * - `photo` — მთავარი ფოტოს სვეტი, წყაროს სვეტი, **წყაროს საერთო ფაილის**
     *   ნიშნები და საქაღალდე მიმღების ასლისთვის.
     *
     * @var array<string, array{copy: list<string>, url?: 'embed'|'apply', photo: array{column: string, source: ?string, shared: list<string>, folder: string}}>
     */
    private const RECIPES = [
        'game' => [
            'copy' => [
                'title_ka', 'title_en', 'description_ka', 'description_en', 'release_date', 'developer',
                'publisher', 'franchise', 'platforms', 'modes', 'opencritic', 'users_score', 'age_rating',
                'size_gb', 'rawg_id', 'rawg_slug', 'igdb_id', 'igdb_slug', 'cover_url',
            ],
            'photo' => ['column' => 'cover_path', 'source' => 'cover_source', 'shared' => ['rawg'], 'folder' => StorageFolder::GAME_COVERS],
        ],
        'book' => [
            'copy' => [
                'title_ka', 'title_en', 'description_ka', 'description_en', 'author', 'publisher', 'isbn',
                'year', 'pages', 'language', 'series_name', 'series_number', 'openlibrary_id', 'cover_url',
            ],
            'photo' => ['column' => 'cover_path', 'source' => 'cover_source', 'shared' => ['openlibrary'], 'folder' => StorageFolder::BOOK_COVERS],
        ],
        'board_game' => [
            'copy' => [
                'title', 'description', 'year', 'designer', 'publisher', 'players_min', 'players_max',
                'age_min', 'playtime_min', 'playtime_max', 'complexity', 'bgg_id', 'bgg_rating', 'image_url',
            ],
            'photo' => ['column' => 'image_path', 'source' => 'image_source', 'shared' => ['bgg'], 'folder' => StorageFolder::BOARD_GAME_IMAGES],
        ],
        'place' => [
            'copy' => ['name', 'address', 'city', 'country', 'lat', 'lng', 'osm_id', 'osm_type', 'description'],
            'photo' => ['column' => 'photo_path', 'source' => null, 'shared' => [], 'folder' => StorageFolder::PLACE_PHOTOS],
        ],
        'video' => [
            'copy' => ['title', 'description', 'channel', 'published_at', 'duration', 'thumbnail_url'],
            'url' => 'embed',
            'photo' => ['column' => 'thumbnail_path', 'source' => null, 'shared' => [], 'folder' => StorageFolder::VIDEO_THUMBNAILS],
        ],
        'song' => [
            'copy' => ['title', 'artist', 'album', 'year', 'duration', 'thumbnail_url'],
            'url' => 'embed',
            'photo' => ['column' => 'thumbnail_path', 'source' => null, 'shared' => [], 'folder' => StorageFolder::SONG_THUMBNAILS],
        ],
        'bookmark' => [
            'copy' => ['title', 'description', 'image_url', 'favicon_url'],
            'url' => 'apply',
            'photo' => ['column' => 'thumbnail_path', 'source' => null, 'shared' => [], 'folder' => StorageFolder::BOOKMARK_THUMBNAILS],
        ],
        'course' => [
            'copy' => ['title', 'description', 'image_url'],
            'url' => 'apply',
            'photo' => ['column' => 'thumbnail_path', 'source' => null, 'shared' => [], 'folder' => StorageFolder::COURSE_THUMBNAILS],
        ],
    ];

    public function __construct(
        private readonly StorageMeter $meter,
        private readonly Notifier $notifier,
        private readonly PublicProfileService $profiles,
    ) {}

    /** რეცეპტის მქონე დომენები — `RegistryConsistencyTest`-ისთვის */
    public static function recipeDomains(): array
    {
        return array_keys(self::RECIPES);
    }

    /** @return list<string> რეცეპტის სვეტები — `RegistryConsistencyTest` მათ სქემაში ამოწმებს */
    public static function recipeColumns(string $domain): array
    {
        $recipe = self::RECIPES[$domain];

        return array_values(array_filter([
            ...$recipe['copy'],
            $recipe['photo']['column'],
            $recipe['photo']['source'],
        ]));
    }

    /**
     * რომელ სექციაში შეუძლია მნახველს დამატება — მიმღების გვერდისა და გეგმისთვის.
     *
     * ⚠️ `requested` — მოდულის მოთხოვნა უკვე გაგზავნილია: ღილაკი მაშინ
     * „მოთხოვნა გაგზავნილია"-ს ამბობს და არა „მოითხოვე" (მეორე მოთხოვნა
     * backend-ზე ისედაც არსებულს აბრუნებს, მაგრამ ეკრანი ტყუილს არ უნდა ამბობდეს).
     *
     * @param  list<string>  $domains
     * @return array<string, array{enabled: bool, can_create: bool, requested: bool}>
     */
    public static function abilities(User $viewer, array $domains): array
    {
        $pendingIds = ApprovalRequest::where('user_id', $viewer->id)
            ->where('type', ApprovalRequest::TYPE_MODULE)
            ->pending()
            ->pluck('module_id')
            ->filter()
            ->all();

        $pendingKeys = $pendingIds === []
            ? []
            : Module::base()->whereIn('id', $pendingIds)->pluck('key')->all();

        $out = [];

        foreach ($domains as $domain) {
            $module = ShareDomain::module($domain);
            $enabled = $viewer->hasModule($module);

            $out[$domain] = [
                'enabled' => $enabled,
                'can_create' => $enabled && $viewer->hasPermission($module, 'create'),
                'requested' => ! $enabled && in_array($module, $pendingKeys, true),
            ];
        }

        return $out;
    }

    /**
     * ერთი ჩანაწერის (ან პლეილისტის) დამატება.
     *
     * @return array{result: 'added'|'have', id: int, partial: bool, poster_skipped: ?string, songs_added?: int}
     *
     * @throws RecordInTrashException იგივე ჩანაწერი მიმღების ურნაშია (409)
     */
    public function add(ShareLink $link, User $owner, User $viewer, string $domain, Model $record, string $statusMode): array
    {
        $model = ShareDomain::model($domain);

        // ⚠️ იგივე წესი, რასაც გვერდის „უკვე გაქვს ✓" კითხულობს
        $match = ShareMatcher::matches($viewer, $domain, new Collection([$record]))[(int) $record->getKey()] ?? null;

        if ($match) {
            if ($match['trashed']) {
                throw new RecordInTrashException($domain, $model::withoutGlobalScopes()->findOrFail($match['id']));
            }

            return ['result' => 'have', 'id' => $match['id'], 'partial' => false, 'poster_skipped' => null];
        }

        $result = match (true) {
            ShareDomain::isList($domain) && $record instanceof Playlist => $this->addPlaylist($owner, $viewer, $record),
            MediaDomain::has($domain) => $this->addMedia($viewer, $domain, $record, $statusMode),
            default => $this->addRecord($viewer, $domain, $record, $statusMode),
        };

        if ($result['result'] === 'added') {
            $this->countImport($link, $owner, $viewer);
        }

        return $result;
    }

    /**
     * ფილმი · სერიალი · ანიმე (ეტაპი 1).
     *
     * @return array{result: 'added'|'have', id: int, partial: bool, poster_skipped: ?string}
     */
    private function addMedia(User $viewer, string $domain, Model $record, string $statusMode): array
    {
        $model = ShareDomain::model($domain);

        $copy = new $model;
        $copy->user_id = $viewer->id;

        $partial = false;
        $posterSkipped = null;
        $tmdbId = $record->getAttribute('tmdb_id');

        if ($tmdbId) {
            $copy->tmdb_id = $tmdbId;
            $copy->save();

            try {
                MediaDomain::enrich($domain, $copy);
            } catch (UniqueConstraintViolationException $e) {
                // გამდიდრებამ `imdb_id` მიაწერა, რომელიც მიმღებს სხვა რიგზე უკვე აქვს
                $existing = MediaDuplicate::resolveClash($domain, $copy, $e);

                return ['result' => 'have', 'id' => (int) $existing->getKey(), 'partial' => false, 'poster_skipped' => null];
            } catch (Throwable) {
                $partial = true;
                $copy->forceFill(['sync_status' => 'partial'])->save();
            }

            $copy->refresh();

            /* ⚠️ გამდიდრება ჩავარდა (გასაღები არ აქვს, წყარო არ პასუხობს) —
               ჩანაწერი სათაურისა და ჟანრების გარეშე რომ არ დარჩეს */
            if (! $copy->title_en && ! $copy->title_ka) {
                $this->copyText($record, $copy, false);
            }

            if ($copy->genres()->count() === 0) {
                $copy->genres()->sync($record->genres()->pluck('genres.id')->all());
            }
        } else {
            // ხელით შეყვანილი — სხვაგვარად ვერაფრით შეივსება
            $copy->year = $record->getAttribute('year');
            $copy->save();

            $this->copyText($record, $copy, true);
            $copy->genres()->sync($record->genres()->pluck('genres.id')->all());
            $posterSkipped = $this->copyPhoto($record, $copy, $viewer, [
                'column' => 'poster_path',
                'source' => 'poster_source',
                // ⚠️ TMDB-ის საერთო ფაილი TMDB-იან ჩანაწერს ჰქონდა — აქ ყველაფერი კოპირდება
                'shared' => [],
                'folder' => StorageFolder::posters($domain),
            ]);
        }

        if ($statusMode === 'owner') {
            $this->applyOwnerRole($record, $copy, $viewer, $domain, true);
            $copy->save();
        }

        return ['result' => 'added', 'id' => (int) $copy->getKey(), 'partial' => $partial, 'poster_skipped' => $posterSkipped];
    }

    /**
     * ეტაპი 2-ის რვა დომენი — ფაქტები, კლასიფიკატორი სახელით, სტატუსი, ფოტო.
     *
     * ⚠️ სტატუსი და სვეტის კლასიფიკატორი **პირველ შენახვამდე** იწერება: ერთი
     * `INSERT` და ერთი „შეიქმნა" ჟურნალში, და არა შექმნა + ორი განახლება.
     *
     * @return array{result: 'added', id: int, partial: bool, poster_skipped: ?string}
     */
    private function addRecord(User $viewer, string $domain, Model $record, string $statusMode): array
    {
        $recipe = self::RECIPES[$domain];
        $model = ShareDomain::model($domain);

        $copy = new $model;
        $copy->forceFill(['user_id' => $viewer->id]);

        foreach ($recipe['copy'] as $column) {
            $copy->setAttribute($column, $record->getAttribute($column));
        }

        $url = $record->getAttribute('url');

        if (($recipe['url'] ?? null) === 'embed' && is_string($url) && $url !== '') {
            // ⚠️ ჩაშენება ჩვენი allowlist-იდან თავიდან გამოითვლება — სხვის ჩანაწერს ვენდობით მხოლოდ ბმულში
            $parsed = VideoUrl::parse($url);
            $copy->forceFill([
                'url' => $url,
                'platform' => $parsed['platform'],
                'external_id' => $parsed['external_id'],
                'embed_url' => $parsed['embed_url'],
            ]);
            $copy->thumbnail_url ??= $parsed['thumbnail_url'];
        }

        // ⚠️ `Bookmark::applyUrl()` `null`-ს არ იღებს; ბმულის გარეშე კურსს `url` ისედაც ცარიელი რჩება
        if (($recipe['url'] ?? null) === 'apply' && is_string($url) && $url !== '') {
            $copy->applyUrl($url);
        }

        $classes = $this->classifierFor($viewer, $domain, $record);
        $shape = ShareDomain::classifierShape($domain);

        if ($shape['type'] === 'column') {
            $copy->setAttribute($shape['column'], $classes[0] ?? null);
        }

        $this->applyRecordStatus($record, $copy, $viewer, $domain, $statusMode);

        $copy->save();

        if ($shape['type'] === 'pivot' && $classes !== []) {
            $copy->{ShareDomain::classifier($domain)['relation']}()->sync($classes);
        }

        $posterSkipped = $this->copyPhoto($record, $copy, $viewer, $recipe['photo']);

        return ['result' => 'added', 'id' => (int) $copy->getKey(), 'partial' => false, 'poster_skipped' => $posterSkipped];
    }

    /**
     * **პლეილისტის ასლი (§40.13, Q53 — „გ").**
     *
     * სიმღერები გამზიარებლის რიგით: მიმღებს რაც უკვე აქვს (`ShareMatcher`-ის
     * იგივე წესი, რასაც სიმღერების სექცია კითხულობს), ის გამოიყენება; დანარჩენი
     * სიმღერის რეცეპტით ემატება (ფაქტები, ჟანრი სახელით, ესკიზი). ბოლოს
     * იქმნება პლეილისტი იმავე რიგით და წყაროს id-ით (`copied_from_id`).
     *
     * ⚠️ **პლეილისტი ბოლოს იქმნება** — შუა გზაზე ჩავარდნა ასლის გარეშე დატოვებდა
     * მხოლოდ დამატებულ სიმღერებს, და განმეორებითი დამატება მათ „უკვე გაქვს"-ად
     * ცნობს და დანარჩენს დაასრულებს.
     * ⚠️ **ურნაში მყოფი სიმღერაც ერთვება** (და არ ორმაგდება): ის აღდგენისას
     * პლეილისტში დაბრუნდება — ერთი სიმღერის გამო მთელი პლეილისტის უარყოფა უარესია.
     * ⚠️ **გამზიარებელს ერთი სიმღერა ორჯერ რომ ჰქონდეს** (ერთი ბმული, ორი რიგი),
     * მიმღებთან ის ერთხელ ემატება: იდენტობა ციკლშივე ახსოვს.
     * ⚠️ **ასლი ერთხელ იქმნება**: მერე ის მიმღების საკუთარი პლეილისტია —
     * გამზიარებლის ახალი სიმღერები თავისით არ ემატება (წაშლილი სიმღერა
     * განმეორებით დამატებაზე ჩუმად რომ არ დაბრუნდეს).
     *
     * @return array{result: 'added', id: int, partial: bool, poster_skipped: ?string, songs_added: int}
     */
    private function addPlaylist(User $owner, User $viewer, Playlist $source): array
    {
        $songs = $this->profiles->playlistSongs($owner, $source)
            // ⚠️ ჟანრი `owner`-ის გარეშე — სახელით გადატანას (Q51) გამზიარებლის ჟანრები სჭირდება
            ->with(['genres' => fn ($q) => $q->withoutGlobalScope('owner')])
            ->get();

        $matches = ShareMatcher::matches($viewer, 'song', $songs);

        $ids = [];
        $seen = [];
        $added = 0;
        $posterSkipped = null;

        foreach ($songs as $song) {
            $url = (string) $song->getAttribute('url');
            $identity = ShareMatcher::identityKey('song', $song) ?? ($url !== '' ? 'url:'.$url : null);
            $hit = $matches[(int) $song->getKey()] ?? null;

            if ($hit) {
                $id = $hit['id'];
            } elseif ($identity !== null && isset($seen[$identity])) {
                $id = $seen[$identity];
            } else {
                $result = $this->addRecord($viewer, 'song', $song, 'default');
                $id = $result['id'];
                $added++;
                $posterSkipped ??= $result['poster_skipped'];
            }

            if ($identity !== null) {
                $seen[$identity] ??= $id;
            }

            $ids[] = $id;
        }

        $copy = new Playlist;
        $copy->forceFill([
            'user_id' => $viewer->id,
            'name' => $this->copyName($viewer, $owner, (string) $source->getAttribute('name')),
            'sort_order' => Playlist::nextOrderFor((int) $viewer->id),
            'copied_from_id' => (int) $source->getKey(),
        ])->save();

        $pivot = [];
        foreach (array_values(array_unique($ids)) as $i => $id) {
            $pivot[$id] = ['sort_order' => $i + 1];
        }

        $copy->songs()->sync($pivot);

        return [
            'result' => 'added',
            'id' => (int) $copy->getKey(),
            'partial' => false,
            'poster_skipped' => $posterSkipped,
            'songs_added' => $added,
        ];
    }

    /**
     * ასლის სახელი — თავისუფალია, თავისი; დაკავებულია — გამზიარებლის მეტსახელით.
     *
     * ⚠️ სახელი ანგარიშზე უნიკალურია (`unique(user_id, name)` — ურნაში მყოფიც
     * იკავებს), და MySQL-ის კოლაცია რეგისტრს არ არჩევს: „Road trip" და „road trip"
     * ერთია. ამიტომ შედარება `mb_strtolower`-ით, ურნიანად. სიგრძე — ფორმის 120-ის
     * ფარგლებში, სუფიქსი არ იჭრება.
     */
    private function copyName(User $viewer, User $owner, string $name): string
    {
        $taken = Playlist::withoutGlobalScopes(['owner', 'trash'])
            ->where('user_id', $viewer->id)
            ->pluck('name')
            ->map(fn ($n) => mb_strtolower(trim((string) $n)))
            ->all();

        $base = trim($name);
        $fit = fn (string $tail) => mb_substr($base, 0, 120 - mb_strlen($tail)).$tail;
        $suffix = $owner->username ? ' (@'.$owner->username.')' : '';

        $candidates = [$fit('')];
        if ($suffix !== '') {
            $candidates[] = $fit($suffix);
        }
        for ($i = 2; $i <= 50; $i++) {
            $candidates[] = $fit($suffix.' '.$i);
        }

        foreach ($candidates as $candidate) {
            if (! in_array(mb_strtolower($candidate), $taken, true)) {
                return $candidate;
            }
        }

        return $fit($suffix.' '.bin2hex(random_bytes(3)));
    }

    /**
     * სტატუსი ეტაპი 2-ის დომენზე — `null`-ზე (სიმღერა, სამაგიდო) არაფერი.
     *
     * ⚠️ enum-ის თარიღი თავის ერთადერთ მწერალს გადის: თამაშსა და წიგნს
     * `TracksCompletion` (`saving`, `??` — წინასწარ ჩაწერილი თარიღი რჩება),
     * კურსს `syncStatusDates()` (`??=`), ადგილს `applyStatus()` (ცხადი თარიღი უპირატესია).
     */
    private function applyRecordStatus(Model $record, Model $copy, User $viewer, string $domain, string $statusMode): void
    {
        $kind = ShareDomain::statusKind($domain);

        if ($kind === 'dictionary') {
            // `default` — `HasStatus`-ის `creating` ჰუკი მიმღების ნაგულისხმევს ირჩევს
            if ($statusMode === 'owner') {
                $this->applyOwnerRole($record, $copy, $viewer, $domain, false);
            }

            return;
        }

        if ($kind !== 'enum') {
            return;
        }

        $model = ShareDomain::model($domain);
        $theirs = (string) $record->getAttribute('status');
        $owner = $statusMode === 'owner' && in_array($theirs, $model::STATUSES, true);
        $key = $owner ? $theirs : (string) ShareDomain::defaultStatus($domain);
        $from = $owner ? $record : null;

        if ($domain === 'place') {
            $date = $from && $key === 'visited' ? $from->getAttribute('visited_at') : null;
            $copy->applyStatus($key, $date ? Carbon::parse($date)->toDateString() : null);

            return;
        }

        $copy->status = $key;

        if ($domain === 'course') {
            if ($from) {
                $copy->started_at = $from->getAttribute('started_at');
                $copy->finished_at = $from->getAttribute('finished_at');
            }

            $copy->syncStatusDates();

            return;
        }

        // თამაში · წიგნი — `TracksCompletion` შენახვისას წინასწარ ჩაწერილ თარიღს ტოვებს
        if ($from && $key === PublicDomain::doneStatus($domain)) {
            $copy->finished_at = $from->getAttribute('finished_at');
        }
    }

    /**
     * კლასიფიკატორი **სახელით** (Q51) — მიმღების ლექსიკონის id-ები.
     *
     * ⚠️ ჯერ მიმღების ნაგულისხმევები იქმნება (`ensureDefaults()`), თორემ
     * ცარიელ ლექსიკონში „Action" ახლად შეიქმნებოდა, მერე კი ნაგულისხმევი
     * „Action" მის გვერდით — ერთი ჟანრი ორჯერ.
     * ⚠️ შედარება ორივე ენაზეა და რეგისტრის, ჰარისა და პუნქტუაციის გარეშე
     * („Sci-Fi" = „sci fi") — `CastSync::resolve()`-ის წესი; PHP-ში და არა SQL-ში
     * (ქართულზე `LOWER()` არაფერს ცვლის, `COLLATE` კი ორ ძრავზე სხვადასხვაა).
     * ⚠️ ურნაში მყოფი თანამოსახელე **არ ცოცხლდება** — ჩუმი აღდგენა უარესია;
     * ახალი იქმნება (`makeKey()` ურნისასაც ხედავს, ე.ი. გასაღები არ დაეჯახება).
     *
     * @return list<int>
     */
    private function classifierFor(User $viewer, string $domain, Model $record): array
    {
        $entries = ShareDomain::classifierEntries($record, $domain);

        if ($entries->isEmpty()) {
            return [];
        }

        $model = ShareDomain::classifier($domain)['model'];
        $model::ensureDefaults((int) $viewer->id);

        $mine = $model::withoutGlobalScope('owner')
            ->where('user_id', $viewer->id)
            ->orderBy('sort_order')
            ->get();

        $ids = [];

        foreach ($entries as $entry) {
            $names = self::names($entry);
            $hit = $mine->first(fn (Model $m) => array_intersect($names, self::names($m)) !== []);

            if (! $hit) {
                $nameKa = (string) ($entry->getAttribute('name_ka') ?: $entry->getAttribute('name_en'));
                $nameEn = (string) ($entry->getAttribute('name_en') ?: $entry->getAttribute('name_ka'));

                $hit = new $model;
                $hit->forceFill([
                    'user_id' => $viewer->id,
                    'key' => $model::makeKey((int) $viewer->id, $nameEn ?: $nameKa),
                    'name_ka' => $nameKa,
                    'name_en' => $nameEn,
                    'icon' => $entry->getAttribute('icon'),
                    'sort_order' => (int) $mine->max('sort_order') + 1,
                ])->save();

                $mine->push($hit);
            }

            $ids[] = (int) $hit->getKey();
        }

        return array_values(array_unique($ids));
    }

    /** @return list<string> ნორმალიზებული სახელები ორივე ენაზე */
    private static function names(Model $entry): array
    {
        $out = [];

        foreach (['name_ka', 'name_en'] as $field) {
            $value = $entry->getAttribute($field);

            if (is_string($value) && trim($value) !== '') {
                $out[] = mb_strtolower((string) preg_replace('/[\s\p{P}]+/u', '', $value));
            }
        }

        return array_values(array_unique(array_filter($out)));
    }

    /**
     * სათაური (და ხელით შეყვანილზე — აღწერაც) ორივე ენაზე.
     *
     * ⚠️ **მედიის ტექსტი თარგმანების ცხრილშია** და არა სვეტში
     * (`SharedRecord::fillTitle()`-ის გაკვეთილი). წყარო (`source`) თან მიჰყვება:
     * TMDB-ის ტექსტი TMDB-ისად რჩება, ხელით დაწერილი — ხელით დაწერილად.
     */
    private function copyText(Model $record, Model $copy, bool $withDescription): void
    {
        foreach ($record->translations as $tr) {
            $title = (string) ($tr->title ?? '');
            $description = $withDescription ? $tr->description : null;

            if ($title === '' && ($description === null || $description === '')) {
                continue;
            }

            $copy->translations()->updateOrCreate(
                ['locale' => $tr->locale],
                array_filter([
                    'title' => $title !== '' ? $title : null,
                    'description' => $description,
                    'source' => $withDescription ? $tr->source : null,
                ], fn ($v) => $v !== null),
            );
        }

        $copy->load('translations');
    }

    /**
     * მთავარი ფოტო — **მიმღების კვოტით** (`StorageMeter`-ის ერთადერთი გზა).
     *
     * ⚠️ ფაილი **კოპირდება** და არა იზიარებს გზას: გამზიარებლის ფაილი მისი
     * ჩანაწერის წაშლასთან ერთად იშლება, და მიმღების ფოტო მაშინ გატყდებოდა.
     * ⚠️ **გამონაკლისი — წყაროს საერთო ფაილი** (`shared`: RAWG · Open Library ·
     * BGG): ის წყაროს id-ით არის დასახელებული, კვოტაში არ ითვლება და
     * ჩანაწერთან ერთად **არასდროს** იშლება — მიმღების ჩანაწერი იმავე გზას
     * მიუთითებს, ზუსტად ისე, როგორც მას თვითონ რომ ჩამოეტვირთა. ⚠️ გალერეის
     * ფაილი (`inGallery()` — „მთავრად დაყენებული") საერთო **არ** არის: ის
     * გამზიარებლის გალერეის ფოტოა და მისი წაშლა მიმღების სურათს გატეხავდა.
     * ⚠️ კვოტა არ ეყო → ჩანაწერი **მაინც** ემატება, ფოტოს გარეშე, და მიზეზი
     * ბრუნდება (`storage_quota_exceeded` / `module_quota_exceeded`) — ერთი სურათის
     * გამო ჩანაწერის დაკარგვა უარესი შედეგია.
     *
     * @param  array{column: string, source: ?string, shared: list<string>, folder: string}  $photo
     */
    private function copyPhoto(Model $record, Model $copy, User $viewer, array $photo): ?string
    {
        $column = $photo['column'];
        $path = (string) $record->getAttribute($column);

        if ($path === '' || preg_match('#^https?://#', $path)) {
            return null;
        }

        $source = $photo['source'] !== null ? (string) $record->getAttribute($photo['source']) : null;

        if ($source !== null && in_array($source, $photo['shared'], true) && ! StorageFolder::inGallery($path)) {
            $copy->forceFill([$column => $path, $photo['source'] => $source])->save();

            return null;
        }

        $disk = Storage::disk(StorageFolder::diskFor($path));

        if (! $disk->exists($path)) {
            return null;
        }

        try {
            $stored = $this->meter->storeContents(
                $viewer,
                (string) $disk->get($path),
                $photo['folder'],
                pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg',
            );
        } catch (HttpResponseException $e) {
            return (string) ($e->getResponse()->getData(true)['message'] ?? 'storage_quota_exceeded');
        }

        $fill = [$column => $stored];

        if ($photo['source'] !== null) {
            $fill[$photo['source']] = 'upload';
        }

        $copy->forceFill($fill)->save();

        return null;
    }

    /**
     * „როგორც გამზიარებელს აქვს" — **როლით** (Q48), ლექსიკონიან დომენზე.
     *
     * ⚠️ `applyStatus()` ერთადერთი ჩამწერია დასრულების სვეტისა (BUG-05); მას
     * გამზიარებლის თარიღს მხოლოდ მედიაზე ვაწვდით (`$withDate`) — იქ ის
     * `watched_at`-ია და არსებულ მნიშვნელობას ინარჩუნებს, ე.ი. „ახლა" აღარ
     * ჩაიწერება. ⚠️ ვიდეოზე/ბუკმარკზე `$withDate` ყოველთვის `false`-ია: ვიდეოს
     * `watched_at` დაკვრის დროა, ბუკმარკს კი დასრულების სვეტი საერთოდ არ აქვს.
     * მიმღებს ასეთი როლის სტატუსი თუ არ აქვს (წაშალა) — მისი ნაგულისხმევი რჩება.
     */
    private function applyOwnerRole(Model $record, Model $copy, User $viewer, string $domain, bool $withDate): void
    {
        $role = $record->status?->role;

        if (! $role) {
            return;
        }

        Status::ensureDefaults((int) $viewer->id, $domain);

        $status = Status::withoutGlobalScope('owner')
            ->where('user_id', $viewer->id)
            ->where('module', $domain)
            ->where('role', $role)
            ->ordered()
            ->first();

        if (! $status) {
            return;
        }

        if ($withDate && $role === 'done' && $record->getAttribute('watched_at')) {
            $copy->watched_at = $record->getAttribute('watched_at');
        }

        $copy->applyStatus($status);
    }

    /**
     * ბმულის მრიცხველი, „ვინ დაიმატა" და მფლობელის შეტყობინება.
     *
     * ⚠️ **query builder-ით** — მოდელის `increment()` `updated`-ს ისვრის და ყოველი
     * დამატება ბმულის „განახლდა"-დ ჩაიწერებოდა ჟურნალში.
     * ⚠️ **შეტყობინება ერთი მიმღებზე დღეში** (FEAT-19): რიგი ჩანაწერს სათითაოდ
     * ამატებს, ე.ი. ყოველ ჩანაწერზე შეტყობინება ასს დაწერდა.
     */
    private function countImport(ShareLink $link, User $owner, User $viewer): void
    {
        DB::table('share_links')->where('id', $link->id)->increment('imports');

        $now = AppTime::now();
        $row = DB::table('share_link_imports')
            ->where('share_link_id', $link->id)
            ->where('user_id', $viewer->id)
            ->first();

        if ($row) {
            DB::table('share_link_imports')->where('id', $row->id)->update([
                'added' => DB::raw('added + 1'),
                'last_added_at' => $now,
                'updated_at' => $now,
            ]);
        } else {
            DB::table('share_link_imports')->insert([
                'share_link_id' => $link->id,
                'user_id' => $viewer->id,
                'added' => 1,
                'last_added_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // ⚠️ ბაზის სტრიქონი აპის ზონაშია (`APP_TIMEZONE`), ე.ი. `parse()` სწორ მომენტს იძლევა
        $notified = $row?->notified_at ? Carbon::parse((string) $row->notified_at) : null;

        if ($notified === null || ! $notified->isSameDay($now)) {
            $this->notifier->send($owner, NotificationType::SHARE_IMPORTED, [
                'username' => $viewer->username,
                'display_name' => $viewer->displayName(),
                'link_id' => $link->id,
                'link_name' => $link->name,
            ]);

            DB::table('share_link_imports')
                ->where('share_link_id', $link->id)
                ->where('user_id', $viewer->id)
                ->update(['notified_at' => $now]);
        }
    }
}
