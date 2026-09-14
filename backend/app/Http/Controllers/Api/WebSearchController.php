<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CastMember;
use App\Services\Serp\SerpApiClient;
use App\Services\Serp\SerpQuotaExceeded;
use App\Services\Serp\WebImageImporter;
use App\Services\Web\SerperImages;
use App\Services\Web\WikimediaImages;
use App\Support\GalleryParent;
use App\Support\VideoUrl;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **ძებნა ვებში და კვოტა (Tasks §7.5/§7.6)**.
 *
 * ⚠️ **წყარო ერთი არ არის და კონტროლერიც ამიტომ არ ჰქვია `SerpController`.**
 * §7.5 ცხადად ითხოვს არჩევანს და **ნაგულისხმევად უფასო კატალოგებს** ასახელებს:
 *  · **Wikimedia Commons** — უფასო, გასაღების გარეშე, ლიმიტის გარეშე,
 *    ლიცენზირებული. სამაგიეროდ ტეგით ძებნა სუსტია (ფაილის სახელზე ეძებს).
 *  · **SerpApi-ის engine-ები** — ნამდვილი ტეგით ძებნა, `safe=off`, ოთხი
 *    სურათის წყარო. სამაგიეროდ **250 ძებნა თვეში მთელ ანგარიშზე**.
 * ე.ი. ერთი სია, ორი ფასი — და ღილაკის გვერდით ცხადად წერია, რომელი რას
 * დაჯდება (§7.6.4).
 *
 * ⚠️ **მოდულის middleware-ის გარეთაა განზრახ.** ვებძებნა მოდული არ არის —
 * წყაროა (TMDB/RAWG/BGG-ის რიგში), ე.ი. არც `modules` რიგი აქვს და არც
 * `module:*`/`permission:*` ჯგუფი. სამაგიეროდ **ყველა მარშრუტი `GET`-ია**:
 * ძებნა კითხვაა და არა შექმნა, ხოლო თუ ეს endpoint-ები ოდესმე მოდულის
 * ჯგუფში გადავა, `EnsureModulePermission` POST-იდან `create`-ს გამოიყვანდა
 * და **რედაქტირებისას** (update-ის უფლებით) ძებნა 403-ს დააბრუნებდა — ზუსტად
 * ის ხაფანგი, რასაც `GET /board-games/shops` არიდებს თავს.
 *
 * ⚠️ **სამი მდგომარეობა და სამივე სხვადასხვაა** (`bgg_unavailable`-ის წესი):
 *  · გასაღები არ არის / წყარო არ პასუხობს → **503 `serpapi_unavailable`**;
 *  · თვიური ლიმიტი ამოიწურა → **429 `serpapi_quota_exceeded`**;
 *  · იძებნა და ვერაფერი იპოვა → **200, ცარიელი სია**.
 * ცარიელი სია „ლიმიტი ამოიწურა"-დ რომ იკითხებოდეს, მომხმარებელი იმავე ძებნას
 * თავიდან გაუშვებდა და ბიუჯეტს ორმაგად დახარჯავდა.
 *
 * ⚠️ **კვოტა ანგარიშისაა და არა მომხმარებლისა** — ამიტომ `serp_searches.user_id`
 * მხოლოდ „ვინ დახარჯა"-ს პასუხობს და არა წვდომას: ერთი ბიუჯეტი ყველას აქვს.
 */
class WebSearchController extends Controller
{
    /**
     * სად ეკიდება ვებიდან ჩამოტვირთული ფოტო (§7.6.5/§7.6.6 → §8.4).
     *
     * ⚠️ **სია აქ აღარ წერია** — ის `App\Support\GalleryParent`-შია, ე.ი.
     * ერთი და იგივე „ვისაც `HasGallery` აქვს" სამ ადგილას აღარ მეორდება
     * (იმპორტი, გალერეის ჯგუფები, ფოტოს მშობლის სახელი). ახალი დომენი ერთი
     * რიგია; მისი გამორჩენა **ჩუმი არაა** (422).
     */
    public function __construct(
        private readonly SerpApiClient $serp,
        private readonly WikimediaImages $wikimedia,
        private readonly SerperImages $serper,
        private readonly WebImageImporter $importer,
    ) {}

    /**
     * უფასო კატალოგები (§7.5-ის წყარო „დ").
     *
     * ⚠️ **სია პირველია და ესეც განზრახაა** — ნაგულისხმევად სწორედ უფასო
     * წყარო უნდა აირჩეოდეს, თორემ ერთი მსახიობის ფოტოძებნა 250-იან ბიუჯეტს
     * ერთ საღამოში შეჭამს (§7.5-ის პირდაპირი გაფრთხილება).
     *
     * @return array<string, array{name: string, safe: bool}>
     */
    private const FREE_IMAGE_SOURCES = [
        WikimediaImages::KEY => ['name' => 'Wikimedia Commons', 'safe' => false],
    ];

    /**
     * **მესამე კატეგორია: საკუთარი გასაღები, საკუთარი ანგარიშსწორება** (2026-09-14).
     *
     * ⚠️ Serper **უფასო არ არის**, მაგრამ SerpApi-ის 250-იან ბიუჯეტსაც არ ეხება —
     * მას თავისი credit-ები აქვს. ერთ-ერთ არსებულ სიაში რომ ჩაგვესვა, ან
     * მრიცხველი მოგვატყუებდა („უფასოა"), ან სხვისი კვოტა დაიხარჯებოდა.
     *
     * @return array<string, array{name: string, safe: bool}>
     */
    private const EXTRA_IMAGE_SOURCES = [
        SerperImages::KEY => ['name' => 'Google Images (Serper)', 'safe' => true],
    ];

    /**
     * კვოტისა და წყაროების მდგომარეობა (§7.6.1).
     *
     * ⚠️ **უფასოა** — `GET /account` ძებნას არ ხარჯავს, ე.ი. ამ სიის გახსნა
     * ბიუჯეტს არ ეხება.
     *
     * ⚠️ **უფასო წყარო სიაში მაშინაც რჩება, როცა SerpApi კონფიგურირებული
     * არ არის** — სწორედ ესაა „ნაგულისხმევი კატალოგები" პრაქტიკაში:
     * გასაღების გარეშე ვებძებნა მთლიანად არ ქრება, მხოლოდ ტეგიანი ძებნა ქრება.
     */
    public function status(): JsonResponse
    {
        $status = $this->serp->status();

        return response()->json($status + [
            'sources' => [
                'images' => $this->imageSources(),
                'videos' => $this->sourceList($this->serp::VIDEO_ENGINES, false),
            ],
        ]);
    }

    /** სურათების ძებნა — უფასო კატალოგები + SerpApi (§7.5 „დ"/„ე", §7.6.2) */
    public function images(Request $request): JsonResponse
    {
        return $this->search($request, array_keys($this->imageSourceMap()), 'images');
    }

    /** ვიდეოების ძებნა (§7.6.3) */
    public function videos(Request $request): JsonResponse
    {
        return $this->search($request, array_keys(SerpApiClient::VIDEO_ENGINES), 'videos');
    }

    /**
     * ერთი ვიდეოს დეტალები (§7.6.3) — YouTube-ის გასაღების გარეშე.
     *
     * ⚠️ **ეს ღილაკია და არა ავტომატური probe:** თითო გამოძახება ერთ ძებნას
     * ხარჯავს 250-იდან, ე.ი. URL-ის ჩასმაზე ისევ უფასო oEmbed მუშაობს
     * (`VideoMetadata`) და SerpApi მაშინ, როცა უფასომ ვერ მოიტანა.
     */
    public function video(Request $request): JsonResponse
    {
        $data = $request->validate([
            'url' => ['required', 'string', 'max:2000'],
        ]);

        if (! $this->serp->configured()) {
            return response()->json(['message' => 'serpapi_unavailable'], 503);
        }

        $parsed = VideoUrl::parse($data['url']);

        // ⚠️ ერთადერთი engine YouTube-ისაა — სხვა ჰოსტზე ძებნის დახარჯვას აზრი
        // არ აქვს და ცხადი უარი ჯობია ცარიელ პასუხს
        if (($parsed['platform'] ?? null) !== 'youtube' || ! ($parsed['external_id'] ?? null)) {
            return response()->json(['message' => 'not_youtube'], 422);
        }

        try {
            $details = $this->serp->videoDetails((string) $parsed['external_id']);
        } catch (SerpQuotaExceeded $e) {
            return $this->quota($e);
        }

        if ($details === null) {
            return response()->json(['message' => 'serpapi_unavailable'], 503);
        }

        return response()->json([
            'video' => $details,
            'quota' => $this->quotaBlock(),
        ]);
    }

    /**
     * მონიშნული ფოტოების ჩამოტვირთვა და მიმაგრება (§7.6.5 → **§8.4**).
     *
     * ⚠️ **`POST`-ია და ეს გამონაკლისი არაა** — აქ მართლა ჩანაწერი იქმნება
     * (`gallery_images`-ის რიგი), ე.ი. `create` სწორედ ის მოქმედებაა, რაც
     * ხდება. ძებნა კი `GET` რჩება.
     *
     * ⚠️ **ჩამოსატვირთი სია ფრონტიდან მოდის და ეს განზრახაა:** მომხმარებელმა
     * უკვე ნახა შედეგები და **აირჩია**. ხელახალი ძებნა სერვერზე კიდევ ერთ
     * ერთეულს დახარჯავდა 250-იდან იმის გასაკეთებლად, რაც უკვე გვაქვს.
     * ამიტომ URL-ები აქ ისევ მოწმდება (`http(s)` და ზომის ჭერი), წყარო კი
     * მხოლოდ ჩვენი ცნობილი engine-ებიდან იწერება.
     *
     * ## განაწილება მსახიობებზე (§8.4)
     *
     * მოთხოვნა სიტყვასიტყვით: „თუ ფილმზე ხარ შესული და კონკრეტულ მსახიობს
     * მონიშნავ ან რამდენიმეს, ამ მსახიობებზე დაანაწილოს შესაბამისი ფოტოები;
     * თუ რამდენიმე იყო და ფოტოდან ვერ გაირკვა, ზოგადად ფილმზე ჩააგდოს".
     *
     * ⚠️ **წესი სერვერზეა ერთხელ** და არა ფრონტში: ის ტესტდება, ერთნაირად
     * მუშაობს ყველა გამომძახებელზე და მსახიობის **ქართული** სახელიც იმავე
     * ადგილას მოწმდება. კლიენტს ხელით გადაწერა მაინც შეუძლია
     * (`images[].target_id`) — ავტომატიკა ვარაუდია და არა განაჩენი.
     *
     * ⚠️ **დამთხვევა სახელზეა და არა სახეზე.** სახის ამოცნობა აქ არ არის და
     * არც დაემატება; ვამოწმებთ სათაურსა და გვერდის მისამართს. ამიტომ
     * **ნაგულისხმევი ყოველთვის ჩანაწერია**: ბუნდოვანი ფოტო ფილმზე ჯდება და
     * არა შემთხვევით მსახიობზე.
     *
     * ⚠️ **ერთი ფოტო ერთ მშობელზე ჯდება.** ორზე მიბმა ორ ფაილს და ორმაგ
     * კვოტას ნიშნავდა — დუბლი `remote_path`-ით მხოლოდ **ერთი მშობლის**
     * ფარგლებში იჭრება.
     */
    public function import(Request $request): JsonResponse
    {
        $data = $request->validate([
            'target' => ['required', Rule::in(GalleryParent::keys())],
            'id' => ['required', 'integer', 'min:1'],
            // §8.4 — რომელ მსახიობებზე შეიძლება დანაწილება (ლოკალური id-ები)
            'distribute' => ['nullable', 'array', 'max:50'],
            'distribute.*' => ['integer', 'min:1'],
            'images' => ['required', 'array', 'min:1', 'max:50'],
            'images.*.original' => ['nullable', 'string', 'max:1000'],
            'images.*.thumbnail' => ['nullable', 'string', 'max:1000'],
            'images.*.link' => ['nullable', 'string', 'max:1000'],
            'images.*.title' => ['nullable', 'string', 'max:500'],
            'images.*.engine' => ['nullable', 'string', 'max:40'],
            'images.*.width' => ['nullable', 'integer', 'min:0'],
            'images.*.height' => ['nullable', 'integer', 'min:0'],
            // ხელით გადაწერა — მხოლოდ მსახიობზე (ცარიელი = ჩანაწერზე)
            'images.*.target_id' => ['nullable', 'integer', 'min:1'],
        ]);

        $user = $request->user();
        $targetKey = $data['target'];

        // მოდულის წვდომა და CRUD-ის უფლება ცხადად მოწმდება — ეს მარშრუტი
        // `module:*`/`permission:*` ჯგუფის გარეთაა (`VisibilityController`-ის წესი)
        abort_unless($user->hasModule(GalleryParent::module($targetKey)), 403, 'module_disabled');
        abort_unless($user->hasPermission(GalleryParent::module($targetKey), 'update'), 403, 'forbidden');

        /** @var class-string<Model> $model */
        $model = GalleryParent::model($targetKey);
        $parent = $model::findOrFail($data['id']);

        // ⚠️ `cast_member` **გლობალური ლექსიკონია** (მფლობელი არ აქვს) — ფოტო
        // კი ყოველთვის მომხმარებლისაა (`gallery_images.user_id`). დანარჩენ
        // დომენებზე `owner` scope ისედაც ჭრის სხვისას; ცხადი შემოწმება მაინც
        // რჩება, რადგან scope `Auth::id()`-ზეა დამოკიდებული.
        if ($targetKey !== GalleryParent::ACTOR) {
            abort_unless($parent->user_id === $user->id, 404);
        }

        $people = $this->distributionTargets($user, $data['distribute'] ?? []);
        $buckets = $this->assign($data['images'], $people, $targetKey, (int) $data['id']);

        $total = ['added' => 0, 'skipped' => 0, 'failed' => 0, 'thumbnails' => 0, 'bytes' => 0, 'quota_exceeded' => false];
        $assigned = [];

        foreach ($buckets as $key => $images) {
            [$kind, $id] = explode(':', $key);

            $bucketParent = $kind === $targetKey && (int) $id === (int) $data['id']
                ? $parent
                : ($people[(int) $id] ?? null);

            if (! $bucketParent) {
                $total['failed'] += count($images);

                continue;
            }

            $result = $this->importer->import(
                $user,
                $bucketParent,
                $images,
                GalleryParent::category($kind),
            );

            foreach (['added', 'skipped', 'failed', 'thumbnails', 'bytes'] as $field) {
                $total[$field] += $result[$field];
            }

            $assigned[$key] = $result['added'];

            /* ⚠️ ამოწურვაზე **ციკლი ჩერდება** და უკვე ჩამოტვირთული რჩება —
               გალერეის არსებული ქცევა. გაგრძელება ყოველ მშობელზე ერთ
               წარუმატებელ ცდას დაამატებდა. */
            if ($result['quota_exceeded']) {
                $total['quota_exceeded'] = true;

                break;
            }
        }

        // ⚠️ ამოწურვა **413-ია და არა 422** (`storage_quota_exceeded`-ის წესი),
        // ხოლო უკვე ჩამოტვირთული ფოტოები რჩება და პასუხშივე ჩანს
        return response()->json(
            [...$total, 'assigned' => $assigned],
            $total['quota_exceeded'] ? 413 : 200,
        );
    }

    /**
     * განაწილების მონაწილეები — **მხოლოდ მსახიობები**.
     *
     * ⚠️ სახელებს **სერვერი კითხულობს** და არა კლიენტი: ასე ქართული სახელიც
     * (`cast_member_translations`) იმავე წესით მუშაობს და გაყალბებული
     * სახელით სხვის მსახიობზე მიბმა შეუძლებელია.
     *
     * @param  list<int>  $ids
     * @return array<int, CastMember>
     */
    private function distributionTargets($user, array $ids): array
    {
        if (! $ids) {
            return [];
        }

        // მსახიობი გლობალურია, მაგრამ განაწილება მხოლოდ გალერეის მოდულით შეიძლება
        if (! $user->hasModule('gallery')) {
            return [];
        }

        return CastMember::whereIn('id', array_slice(array_values(array_unique($ids)), 0, 50))
            ->get()
            ->keyBy('id')
            ->all();
    }

    /**
     * თითო ფოტო — ერთ მშობელს.
     *
     * ⚠️ **ნაგულისხმევი ყოველთვის ჩანაწერია** (ის, საიდანაც ძებნა გაუშვი).
     * მსახიობზე ფოტო მხოლოდ მაშინ გადადის, როცა მისი სახელი მართლა წერია
     * სათაურში ან გვერდის მისამართში — „ვერ გაირკვა" ნიშნავს „ფილმზე".
     *
     * @param  list<array<string, mixed>>  $images
     * @param  array<int, CastMember>  $people
     * @return array<string, list<array<string, mixed>>>
     */
    private function assign(array $images, array $people, string $targetKey, int $targetId): array
    {
        $fallback = $targetKey.':'.$targetId;
        $buckets = [];

        // სახელების ინდექსი — თითო მსახიობზე რამდენიმე საძებნი ვარიანტი
        $needles = [];
        foreach ($people as $id => $member) {
            $needles[$id] = $this->needlesFor($member);
        }

        foreach ($images as $image) {
            $key = $fallback;

            // 1. ხელით გადაწერა — უპირობოდ უპირატესია
            $manual = (int) ($image['target_id'] ?? 0);

            if ($manual && isset($people[$manual])) {
                $key = GalleryParent::ACTOR.':'.$manual;
            } elseif ($people) {
                // 2. სახელით ამოცნობა სათაურსა და ბმულში
                $haystack = mb_strtolower(trim(
                    ($image['title'] ?? '').' '.($image['link'] ?? '').' '.($image['original'] ?? '')
                ));

                foreach ($needles as $id => $words) {
                    foreach ($words as $word) {
                        if ($word !== '' && str_contains($haystack, $word)) {
                            $key = GalleryParent::ACTOR.':'.$id;

                            break 2;
                        }
                    }
                }
            }

            $buckets[$key][] = $image;
        }

        return $buckets;
    }

    /**
     * რა სიტყვებით ვცნობთ მსახიობს.
     *
     * ⚠️ **გვარი ცალკეც ითვლება, სახელი — არა.** „ჯონი" ათას სურათში წერია,
     * „დეპი" კი პრაქტიკულად მხოლოდ მასზე; ამიტომ სრული სახელის გარდა
     * მხოლოდ **ბოლო** სიტყვა ემატება და ისიც მაშინ, თუ საკმარისად გრძელია.
     *
     * @return list<string>
     */
    private function needlesFor(CastMember $member): array
    {
        $out = [];

        foreach ([$member->name, $member->name_ka] as $name) {
            $name = mb_strtolower(trim((string) $name));

            if ($name === '') {
                continue;
            }

            $out[] = $name;

            $parts = preg_split('/\s+/u', $name) ?: [];
            $last = (string) end($parts);

            if (count($parts) > 1 && mb_strlen($last) >= 4) {
                $out[] = $last;
            }
        }

        return array_values(array_unique($out));
    }

    /* ---------- შიგნეული ---------- */

    /**
     * ერთი ან რამდენიმე engine ერთ რექვესთში (§7.6.4).
     *
     * ⚠️ **ყოველი მონიშნული engine +1 ძებნაა** — „ყველა ერთად" ოთხ სურათის
     * წყაროზე ოთხს ხარჯავს. ამიტომ პასუხი ცხადად წერს, **რამდენი დაიხარჯა
     * მართლა** (`spent`) და რომელი მოვიდა ქეშიდან: ქეშის მოხვედრა უფასოა და
     * მისი „დახარჯულად" ჩვენება მომხმარებელს ტყუილად შეაშინებდა.
     *
     * ⚠️ **დუბლიკატები ერთდება ორიგინალი ლინკით** და ერთეული ინახავს
     * **ყველა** engine-ს, რომელმაც ის მოიტანა (`engines[]`) — სწორედ ესაა ის,
     * რაც აჩვენებს, რომელი წყარო პოულობს უკეთესს.
     *
     * @param  array<string, array<string, mixed>>  $catalogue
     */
    private function search(Request $request, array $keys, string $kind): JsonResponse
    {
        $data = $request->validate([
            'query' => ['required', 'string', 'max:255'],
            'engines' => ['sometimes', 'array', 'max:'.count($keys)],
            'engines.*' => ['string', Rule::in($keys)],
            // ⚠️ ჭერი 1000-ია და არა 100 (2026-09-14) — Serper რამდენიმე გვერდს
            // კრებს; დანარჩენი წყაროები `runOne()`-ში ისევ 100-ზე იჭრებიან,
            // თორემ ერთ SerpApi-ის ძახილს 1000 შედეგს ვთხოვდით.
            'limit' => ['sometimes', 'integer', 'min:1', 'max:'.SerperImages::MAX_LIMIT],
            // ⚠️ **თითო გვერდი = ერთი credit** — ამიტომ ხელით შეიყვანება
            'pages' => ['sometimes', 'integer', 'min:1', 'max:'.SerperImages::MAX_PAGES],
            // ⚠️ ცენზურა **გამორთულია ნაგულისხმევად** (§7.5-ის პირდაპირი პირობა):
            // „რასაც ტეგში დაწერს, ის ჩამოიწეროს".
            'safe' => ['sometimes', 'boolean'],
        ]);

        // ცარიელი არჩევანი = **პირველი** წყარო და არა „ყველა". სიაში პირველი
        // უფასოა, ე.ი. ნაგულისხმევი ქცევა ბიუჯეტს არ ეხება (§7.5).
        $engines = $data['engines'] ?? [];
        $engines = $engines ? array_values(array_unique($engines)) : [$keys[0] ?? ''];

        // ⚠️ 503 მხოლოდ მაშინ, როცა **არჩეული** წყაროებიდან არც ერთი არ მუშაობს.
        // უფასო წყარო SerpApi-ის გასაღების გარეშეც მუშაობს, ე.ი. „გასაღები
        // არ არის" მთელ ძებნას აღარ კეტავს.
        $usable = array_values(array_filter($engines, fn (string $e) => $this->usable($e)));

        if (! $usable) {
            return response()->json(['message' => 'serpapi_unavailable'], 503);
        }

        $limit = (int) ($data['limit'] ?? 20);
        $pages = (int) ($data['pages'] ?? 1);
        $safe = (bool) ($data['safe'] ?? false);

        $merged = [];
        $sources = [];
        $spent = 0;

        foreach ($usable as $engine) {
            try {
                $result = $this->runOne($engine, $kind, $data['query'], $limit, $pages, $safe);
            } catch (SerpQuotaExceeded $e) {
                // ⚠️ უკვე მოტანილი შედეგები **არ იკარგება** — ლიმიტი შუა გზაზე
                // რომ ამოიწუროს, სამი engine-ის პასუხის გადაგდება ძებნის
                // ხელახლა დახარჯვას ნიშნავდა (გალერეის 413-ის იგივე ქცევა)
                if (! $merged) {
                    return $this->quota($e);
                }

                $sources[] = [
                    'engine' => $engine, 'ok' => false, 'cached' => false,
                    'count' => 0, 'dropped' => 0, 'quota_exceeded' => true,
                ];

                break;
            }

            // ⚠️ მრიცხველი **მხოლოდ SerpApi-ისაა** — უფასო წყარო და საკუთარი
            // გასაღების მქონე Serper მას არ ეხებიან (იხ. `EXTRA_IMAGE_SOURCES`)
            if (! $result['cached'] && $result['ok'] && $this->usesSerpQuota($engine)) {
                $spent++;
            }

            foreach ($result['items'] as $item) {
                // ერთი და იგივე ორიგინალი რამდენიმე წყაროდან — ერთი ერთეული
                $key = $item['original'] ?? $item['link'] ?? $item['thumbnail'] ?? null;

                if ($key === null) {
                    continue;
                }

                if (isset($merged[$key])) {
                    $merged[$key]['engines'][] = $engine;

                    continue;
                }

                $item['engines'] = [$engine];
                $merged[$key] = $item;
            }

            $sources[] = [
                'engine' => $engine,
                // `ok: false` = წყარო არ პასუხობს; `ok: true, count: 0` = ვერაფერი იპოვა
                'ok' => $result['ok'],
                'cached' => $result['cached'],
                'count' => count($result['items']),
                // ⚠️ **მესამე მდგომარეობა:** იპოვა, მაგრამ ერთეულები გამოუსადეგარი
                // იყო (ლინკის გარეშე). ნულოვანი `count` + დადებითი `dropped`
                // „ვერაფერი ვიპოვე"-ს არ უდრის და ინტერფეისმაც სხვა რამ უნდა თქვას.
                'dropped' => $result['dropped'],
                'quota_exceeded' => false,
                // ⚠️ Serper-ის ხარჯი ცალკე იწერება: ის SerpApi-ის 250-ში არ ჯდება,
                // მაგრამ ფული მაინც არის და ეკრანზე უნდა ჩანდეს
                'credits' => (int) ($result['spent'] ?? 0),
            ];
        }

        return response()->json([
            'items' => array_values($merged),
            'sources' => $sources,
            'spent' => $spent,
            'quota' => $this->quotaBlock(),
        ]);
    }

    /**
     * ერთი წყაროს გაშვება. **ერთადერთი ადგილი, სადაც უფასო და ფასიანი წყარო
     * ერთმანეთისგან განსხვავდება** — დანარჩენი ლოგიკა (გაერთიანება, დუბლი,
     * მდგომარეობები) ორივეზე ერთნაირად მუშაობს.
     *
     * @return array{ok: bool, cached: bool, engine: string, items: list<array<string, mixed>>, dropped: int}
     */
    private function runOne(string $engine, string $kind, string $query, int $limit, int $pages, bool $safe): array
    {
        if ($engine === WikimediaImages::KEY) {
            return $this->wikimedia->search($query, min($limit, 100));
        }

        // ⚠️ **ერთადერთი წყარო, რომელსაც გვერდები აქვს** — დანარჩენებს ერთი
        // ძახილი აქვთ და 1000-ის თხოვნა მათ უბრალოდ შეცდომას დააბრუნებინებდა
        if ($engine === SerperImages::KEY) {
            return $this->serper->search($query, $limit, $pages, $safe);
        }

        return $kind === 'images'
            ? $this->serp->images($engine, $query, min($limit, 100), $safe)
            : $this->serp->videos($engine, $query, min($limit, 100), $safe);
    }

    /** უფასო წყარო კვოტას არ ეხება (არც ჭერს ამოწმებს, არც მრიცხველს ზრდის) */
    private function isFree(string $engine): bool
    {
        return isset(self::FREE_IMAGE_SOURCES[$engine]);
    }

    /**
     * **SerpApi-ის 250-იან ბიუჯეტს ეხება თუ არა.**
     *
     * ⚠️ სამი კატეგორიაა და არა ორი: უფასო (Wikimedia) · საკუთარი გასაღები
     * (Serper) · SerpApi. მხოლოდ ბოლო ზრდის იმ მრიცხველს, რომელიც ეკრანზე
     * „დარჩა N ძებნა"-დ იკითხება.
     */
    private function usesSerpQuota(string $engine): bool
    {
        return ! $this->isFree($engine) && ! isset(self::EXTRA_IMAGE_SOURCES[$engine]);
    }

    /** ეს წყარო ახლა მუშაობს? (ფასიანს გასაღები სჭირდება, უფასოს — არა) */
    private function usable(string $engine): bool
    {
        if ($engine === SerperImages::KEY) {
            return $this->serper->configured();
        }

        return $this->isFree($engine) || $this->serp->configured();
    }

    /**
     * სურათების წყაროები — **ჯერ უფასო, მერე ფასიანი** (§7.5-ის რიგი).
     *
     * @return array<string, array{name: string, safe: bool}>
     */
    private function imageSourceMap(): array
    {
        $paid = [];

        foreach (SerpApiClient::IMAGE_ENGINES as $key => $spec) {
            $paid[$key] = ['name' => $spec['name'], 'safe' => $spec['safe']];
        }

        // ⚠️ რიგი: უფასო → საკუთარი გასაღები → SerpApi. ნაგულისხმევად
        // პირველი ირჩევა, ე.ი. ბიუჯეტი ისევ ხელუხლებელი რჩება (§7.5).
        return self::FREE_IMAGE_SOURCES + self::EXTRA_IMAGE_SOURCES + $paid;
    }

    /** @return list<array<string, mixed>> */
    private function imageSources(): array
    {
        $out = [];

        foreach ($this->imageSourceMap() as $key => $spec) {
            // ⚠️ გასაღების გარეშე **ფასიანი** წყარო სიაში არ ჩანს (RAWG-ის წესი),
            // უფასო კი რჩება — თორემ ვებძებნა მთლიანად გაქრებოდა
            if (! $this->usable($key)) {
                continue;
            }

            $out[] = [
                'key' => $key,
                'name' => $spec['name'],
                'safe_search' => $spec['safe'],
                'free' => $this->isFree($key),
                /* ⚠️ ინტერფეისს **სამივე კატეგორია** სჭირდება და არა „უფასო/ფასიანი":
                   Serper არც უფასოა და არც SerpApi-ის ბიუჯეტიდან იხარჯება, ე.ი.
                   „დარჩა N ძებნა" მასზე არაფერს ამბობს. */
                'uses_quota' => $this->usesSerpQuota($key),
                // გვერდები მხოლოდ Serper-ს აქვს — ინტერფეისი ველს სხვაზე არ აჩვენებს
                'paged' => $key === SerperImages::KEY,
            ];
        }

        return $out;
    }

    /**
     * @param  array<string, array<string, mixed>>  $catalogue
     * @return list<array<string, mixed>>
     */
    private function sourceList(array $catalogue, bool $free): array
    {
        if (! $this->serp->configured()) {
            return [];
        }

        $out = [];

        foreach ($catalogue as $key => $spec) {
            $out[] = [
                'key' => $key,
                'name' => $spec['name'],
                'safe_search' => (bool) $spec['safe'],
                'free' => $free,
            ];
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function quotaBlock(): array
    {
        return [
            'used' => $this->serp->usage(),
            'limit' => $this->serp->limit(),
            'remaining' => $this->serp->remaining(),
        ];
    }

    private function quota(SerpQuotaExceeded $e): JsonResponse
    {
        return response()->json([
            'message' => 'serpapi_quota_exceeded',
            'used' => $e->used,
            'limit' => $e->limit,
        ], 429);
    }
}
