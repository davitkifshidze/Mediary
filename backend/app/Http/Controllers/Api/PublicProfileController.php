<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GalleryAlbum;
use App\Services\Modules\FieldSettings;
use App\Services\Profile\PublicGallery;
use App\Services\Profile\PublicProfileService;
use App\Support\AlbumLock;
use App\Support\PublicDomain;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

/**
 * **Tasks §16.1 — საჯარო პროფილი `/u/{username}`.**
 *
 * ⚠️ **ეს ერთადერთი დომენური endpoint-ებია, რომლებიც `auth:sanctum`-ის გარეთ დგას.**
 * გადაწყვეტილება ცხადია და უკან იხსნება: „საჯარო პროფილი" ბმულს ნიშნავს, რომელიც
 * გაზიარებადია — თუ შესვლა სჭირდება, ის უკვე „მომხმარებლებისთვის ხილვადი
 * პროფილია". სამაგიეროდ სამი დაცვის ფენა ერთდროულად უნდა იყოს ღია
 * (პროფილი → მოდული → ჩანაწერი), ყველა default-ით `private`, და მთელი მექანიზმი
 * ერთი გადამრთველით ითიშება: `PUBLIC_PROFILES=false` (`config/mediary.php`).
 *
 * ჩაწერა აქ **არაფერი ხდება** — მხოლოდ ორი GET.
 */
class PublicProfileController extends Controller
{
    public function __construct(
        private PublicProfileService $profiles,
        private FieldSettings $fields,
        private PublicGallery $gallery,
    ) {}

    /** პროფილის თავი: ავატარი/სახელი/ბიო + ხილვადი დომენები რაოდენობებით */
    public function show(string $username)
    {
        $user = $this->profiles->resolve($username);

        // ⚠️ არასაჯარო პროფილიც 404-ია და არა 403: „ასეთი user არსებობს,
        // უბრალოდ დამალულია" თვითონაც ინფორმაციაა.
        abort_unless($user, 404);

        $domains = $this->profiles->domains($user);

        return response()->json([
            'profile' => $this->profiles->header($user),
            'domains' => $domains,
            /* ⚠️ **გალერეის ტაბის რიცხვი ალბომების რაოდენობა არ არის** (Tasks §7.4):
               `gallery_album` დომენის ჩანაწერი საქაღალდეა, ჩანართში კი ფოტოები
               იხატება. ბარათი რომ ალბომებს დაეთვალა, „3" ეწერებოდა და შიგნით
               ორასი ფოტო იდებოდა. */
            'counts' => in_array('gallery_album', $domains, true)
                ? ['gallery_album' => $this->gallery->count($user)] + $this->profiles->stats($user, $domains)
                : $this->profiles->stats($user, $domains),
            'modules' => $this->profiles->moduleMeta($domains),
            // რომელი მოდულს ეკუთვნის დომენი — ფრონტს ტაბის სახელისთვის სჭირდება
            'domain_modules' => array_combine(
                $domains,
                array_map(PublicDomain::module(...), $domains),
            ),
        ]);
    }

    /** ერთი დომენის საჯარო ჩანაწერები, გვერდებად */
    public function items(Request $request, string $username, string $domain)
    {
        $user = $this->profiles->resolve($username);
        abort_unless($user, 404);

        abort_unless(PublicDomain::has($domain), 404);
        // მოდული საჯარო არაა → დომენი არ არსებობს ამ პროფილისთვის
        abort_unless(in_array($domain, $this->profiles->domains($user), true), 404);

        /* ⚠️ **ქვედა ზღვარიც აუცილებელია და არა მარტო ჭერი** (აუდიტი
           2026-09-14, §B4). `Builder::limit()` **უარყოფით** მნიშვნელობას
           ჩუმად უგულებელყოფს, ე.ი. `?per_page=-1` `LIMIT`-ს საერთოდ
           აშორებდა და ეს endpoint — **ავტორიზაციის გარეშე ერთადერთი
           დომენური** — მთელ საჯარო ბიბლიოთეკას ერთ პასუხში აბრუნებდა. */
        $perPage = min(max((int) $request->integer('per_page', PublicProfileService::PER_PAGE), 1), 100);

        $page = $this->profiles->query($user, $domain)->paginate($perPage);

        /* §6 ფაზა 4 — რომელი ველი დამალა **მფლობელმა** საჯარო ბარათზე.
           ერთხელ ითვლება რექვესთზე და არა თითო ჩანაწერზე. */
        $hidden = $this->fields->hiddenOnPublic($user, PublicDomain::module($domain));

        return response()->json([
            'data' => $page->getCollection()
                ->map(fn ($record) => PublicDomain::card($domain, $record, $hidden))
                ->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /**
     * **საჯარო გალერეა (Tasks §7.4)** — `GET /public/profiles/{username}/gallery-photos`.
     *
     * ⚠️ **ცალკე endpoint-ია და არა `{domain}`-ის კიდევ ერთი მნიშვნელობა**:
     * აქ ჩანაწერის ბარათი კი არა, ფოტოს რიგი ბრუნდება — სხვა ფორმა, ე.ი.
     * `PublicDomain::card()`-ში ჩატენვა მას ორ სხვადასხვა ფიგურად აქცევდა.
     *
     * ⚠️ **მარშრუტი `{domain}`-ზე ზემოთ უნდა იდგეს**, თორემ „gallery-photos"
     * დომენად წაიკითხება (იგივე წესი, რაც `/gallery/{type}/{id}`-ს აქვს).
     */
    public function photos(Request $request, string $username)
    {
        $user = $this->profiles->resolve($username);
        abort_unless($user, 404);

        // მოდული საჯარო არაა → გალერეა ამ პროფილისთვის არ არსებობს
        abort_unless(in_array('gallery_album', $this->profiles->domains($user), true), 404);

        // ⚠️ ქვედა ზღვარიც (§B4): `?per_page=-1` `LIMIT`-ს ჩუმად აშორებს
        $perPage = min(max((int) $request->integer('per_page', PublicProfileService::PER_PAGE), 1), 100);

        return response()->json($this->gallery->page($user, $perPage, max(1, (int) $request->integer('page', 1))));
    }

    /**
     * **საჯარო გალერეის ფაილი პირად დისკიდან (2026-09-17)** —
     * `GET /public/profiles/{username}/gallery-photos/{image}/file`.
     *
     * გახსნილი ჩაკეტილი ალბომის ფოტო `gallery/locked`-შია (§7.9), რასაც
     * `/storage/*` ვერ კითხულობს; შიდა `/gallery/images/{id}/file` კი
     * `auth:sanctum`-ის უკანაა და უცხოსთვის 404-ია. ე.ი. პაროლის შეყვანის
     * შემდეგ საჯარო გვერდზე ფოტო **არსაიდან ვერ გამოვიდოდა**.
     *
     * ⚠️ **მოდელი როუტში არ იბმება** (`unlockAlbum`-ის იგივე მიზეზი):
     * `EnsureRecordOwnership` ანონიმს ვერაფრის მფლობელად ჩათვლის.
     * ხილვადობას `PublicGallery::visible()` წყვეტს — იმავე query-თი, რაც სია.
     *
     * ⚠️ **404 და არა 403** — „ეს ფოტო არსებობს" თვითონაც ინფორმაციაა.
     */
    public function photoFile(string $username, int $image)
    {
        $user = $this->profiles->resolve($username);
        abort_unless($user, 404);
        abort_unless(in_array('gallery_album', $this->profiles->domains($user), true), 404);

        $galleryImage = $this->gallery->visible($user, $image);
        abort_unless($galleryImage, 404);

        $disk = Storage::disk(StorageFolder::diskFor((string) $galleryImage->path));
        abort_unless($disk->exists($galleryImage->path), 404);

        /* ⚠️ **ჩაკეტილი ალბომის ფოტო არსად არ უნდა დაიკეშოს** (Tasks GAP-08).
           ის აქ მხოლოდ იმიტომ გამოდის, რომ პაროლი **ამ სესიაში** შეიყვანეს —
           ე.ი. შუამავალი (CDN/proxy) მას სხვას მიაწოდებდა, ბრაუზერის კეში კი
           პაროლის მოხსნის შემდეგაც გახსნიდა. ზუსტად ის კლასის ხვრელია, რასაც
           CLAUDE.md ძველ `/storage/...` მისამართზე „ვერ ვაკეთებთ"-ად აღწერს —
           ახალ როუტზე მისი ხელახლა შემოშვება არ ღირს.

           ⚠️ **მხოლოდ ჩაკეტილზე და არა ყველა პასუხზე**: დანარჩენი ფოტოები
           განსაზღვრებით საჯაროა და მათი კეშირება სასურველია.

           ⚠️ `private` **და** `no-store` ერთად: პირველი შუამავალს კრძალავს,
           მეორე — ბრაუზერის დისკსაც. */
        $locked = $galleryImage->album_id !== null && $galleryImage->album?->isLocked();

        return $disk->response(
            $galleryImage->path,
            null,
            $locked ? ['Cache-Control' => 'private, no-store, max-age=0'] : [],
        );
    }

    /**
     * **ჩაკეტილი ალბომის გახსნა საჯარო გვერდზეც (Tasks §7.12).**
     *
     * შენი სიტყვები: „საჯაროშიც პაროლიან ალბომებს პაროლი ჭირდება".
     *
     * ⚠️ **პაროლი მფლობელისაა** — ე.ი. უცხოსთვის ალბომი პრაქტიკულად
     * ჩაკეტილი რჩება, მაგრამ მექანიზმი უნდა არსებობდეს: უამისოდ საჯარო
     * გვერდზე „ჩაკეტილი" სამუდამო კედელი იქნებოდა და თვითონ მფლობელიც კი
     * ვერ გახსნიდა საკუთარ ბმულზე შესვლისას.
     *
     * ⚠️ **გახსნილობა სესიაშია** (`AlbumLock::unlock()`) და არა კლიენტის
     * ტოკენში — ზუსტად იგივე მიზეზი, რაც შიდა გვერდზე.
     *
     * ⚠️ **throttle როუტზეა** და ანონიმზე **IP + ალბომი** (§7.13): უამისოდ
     * ოთხსიმბოლოიანი პაროლი წუთებში ცვივა.
     *
     * ⚠️ **სესიის გარეშე პაროლი საერთოდ არ იცდება** (Tasks BUG-02, 409
     * `session_required`) და ეს ორ სხვადასხვა ხვრელს ხურავს ერთდროულად:
     * (ა) არა-stateful კლიენტს პასუხი `unlocked: true`-ს ეუბნებოდა, ალბომი
     * კი ჩაკეტილი რჩებოდა — ე.ი. სწორ პაროლს უხმაურო ჩავარდნა მოჰყვებოდა;
     * (ბ) რაკი შედეგის შესანახი არაფერი იყო, endpoint სუფთა **stateless
     * ორაკულად** გამოდგებოდა — ქუქის გარეშე, მხოლოდ „სწორია/არა", რასაც
     * IP-ის როტაცია throttle-საც არიდებს. ახლა ცდას სესია სჭირდება.
     */
    public function unlockAlbum(Request $request, string $username, int $album)
    {
        $user = $this->profiles->resolve($username);
        abort_unless($user, 404);

        /* ⚠️ **მოდელი როუტში განზრახ არ იბმება.** `EnsureRecordOwnership`
           ყოველ ჩაბმულ მოდელს ამოწმებს და ავტორიზაციის გარეშე მას მფლობელი
           ვერ ეყოლება — ე.ი. უცხოსთვის ეს endpoint **ყოველთვის 404** იქნებოდა.
           აქ საკუთრებას ქვემოთ ცხადად ვამოწმებთ: ალბომი ამ პროფილისაა. */
        $galleryAlbum = GalleryAlbum::query()->withoutGlobalScope('owner')->find($album);
        abort_unless($galleryAlbum, 404);

        /* ⚠️ ალბომი **ამ პროფილისა** უნდა იყოს და **საჯარო** — თორემ ეს
           endpoint სხვისი პირადი ალბომის პაროლის გამოცნობის კარი გახდებოდა. */
        abort_unless(
            (int) $galleryAlbum->user_id === (int) $user->id
                && $galleryAlbum->visibility === 'public'
                && in_array('gallery_album', $this->profiles->domains($user), true),
            404,
        );

        /* ⚠️ **ვალიდაციაზე და `Hash::check`-ზე ადრე.** გახსნილობა სესიაში
           იწერება, ე.ი. სესიის გარეშე ცდას შედეგი არ აქვს — შემოწმება კი
           მაინც პასუხობდა „სწორია თუ არა". */
        abort_unless(AlbumLock::hasSession(), 409, 'session_required');

        $data = $request->validate([
            'password' => ['required', 'string', 'max:100'],
        ]);

        abort_unless(
            $galleryAlbum->isLocked() && Hash::check($data['password'], $galleryAlbum->password_hash),
            422,
            'album_password_wrong',
        );

        AlbumLock::unlock($galleryAlbum);

        return response()->json(['id' => $galleryAlbum->id, 'unlocked' => true]);
    }
}
