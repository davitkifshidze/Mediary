<?php

use App\Http\Controllers\Api\Admin\AdminAuditController;
use App\Http\Controllers\Api\Admin\AdminModuleController;
use App\Http\Controllers\Api\Admin\AdminPurgeController;
use App\Http\Controllers\Api\Admin\AdminRequestController;
use App\Http\Controllers\Api\Admin\AdminRoleController;
use App\Http\Controllers\Api\Admin\AdminUserController;
use App\Http\Controllers\Api\AnimeController;
use App\Http\Controllers\Api\AnimeFavoriteController;
use App\Http\Controllers\Api\AnimeStatusController;
use App\Http\Controllers\Api\AnimeSyncController;
use App\Http\Controllers\Api\ApprovalRequestController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BatchController;
use App\Http\Controllers\Api\BoardGameController;
use App\Http\Controllers\Api\BoardGameFileController;
use App\Http\Controllers\Api\BoardGameGenreController;
use App\Http\Controllers\Api\BoardGameNoteController;
use App\Http\Controllers\Api\BookController;
use App\Http\Controllers\Api\BookFileController;
use App\Http\Controllers\Api\BookGenreController;
use App\Http\Controllers\Api\BookmarkCategoryController;
use App\Http\Controllers\Api\BookmarkController;
use App\Http\Controllers\Api\BookNoteController;
use App\Http\Controllers\Api\CastController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\CourseCategoryController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\CourseFileController;
use App\Http\Controllers\Api\CredentialController;
use App\Http\Controllers\Api\CustomFieldController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DatabaseBackupController;
use App\Http\Controllers\Api\DiscoverController;
use App\Http\Controllers\Api\EpisodeController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\GalleryAlbumController;
use App\Http\Controllers\Api\GalleryController;
use App\Http\Controllers\Api\GalleryVideoController;
use App\Http\Controllers\Api\GameController;
use App\Http\Controllers\Api\GameFileController;
use App\Http\Controllers\Api\GameGenreController;
use App\Http\Controllers\Api\GameNoteController;
use App\Http\Controllers\Api\GameVideoController;
use App\Http\Controllers\Api\GenreController;
use App\Http\Controllers\Api\GenreItemController;
use App\Http\Controllers\Api\ImportController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\MatchController;
use App\Http\Controllers\Api\MediaSyncController;
use App\Http\Controllers\Api\MediaTagController;
use App\Http\Controllers\Api\MediaWatchController;
use App\Http\Controllers\Api\ModuleController;
use App\Http\Controllers\Api\MovieCollectionController;
use App\Http\Controllers\Api\MovieController;
use App\Http\Controllers\Api\MovieFavoriteController;
use App\Http\Controllers\Api\MovieStatusController;
use App\Http\Controllers\Api\MovieSyncController;
use App\Http\Controllers\Api\NoteCategoryController;
use App\Http\Controllers\Api\NoteEntryController;
use App\Http\Controllers\Api\NoteEntryFileController;
use App\Http\Controllers\Api\NoteReminderController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PlaceCategoryController;
use App\Http\Controllers\Api\PlaceController;
use App\Http\Controllers\Api\PlaceFileController;
use App\Http\Controllers\Api\PlaylistController;
use App\Http\Controllers\Api\PublicProfileController;
use App\Http\Controllers\Api\RecordCastController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\SeriesController;
use App\Http\Controllers\Api\SeriesFavoriteController;
use App\Http\Controllers\Api\SeriesStatusController;
use App\Http\Controllers\Api\SeriesSyncController;
use App\Http\Controllers\Api\SongController;
use App\Http\Controllers\Api\SongFileController;
use App\Http\Controllers\Api\SongGenreController;
use App\Http\Controllers\Api\SongNoteController;
use App\Http\Controllers\Api\StatsController;
use App\Http\Controllers\Api\StatusController;
use App\Http\Controllers\Api\StorageController;
use App\Http\Controllers\Api\TranslationController;
use App\Http\Controllers\Api\TrashController;
use App\Http\Controllers\Api\TwoFactorController;
use App\Http\Controllers\Api\UpcomingController;
use App\Http\Controllers\Api\VideoBulkController;
use App\Http\Controllers\Api\VideoController;
use App\Http\Controllers\Api\VideoDownloadController;
use App\Http\Controllers\Api\VideoFileController;
use App\Http\Controllers\Api\VideoNoteController;
use App\Http\Controllers\Api\VideoStatusController;
use App\Http\Controllers\Api\VideoTypeController;
use App\Http\Controllers\Api\VisibilityController;
use App\Http\Controllers\Api\WebSearchController;
use App\Support\CustomFields;
use App\Support\MediaDomain;
use App\Support\PublicDomain;
use App\Support\StatusDomain;
use App\Support\UploadLimits;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — Mediary
|--------------------------------------------------------------------------
| ბაზისო პრეფიქსი: /api  (იხ. bootstrap/app.php)
|
| I7-ის შემდეგ ყველა route ავტორიზებულია (`auth:sanctum`, SPA cookie რეჟიმი),
| ხოლო დომენების route-ები დამატებით მოდულის ჩართვას მოითხოვს (`module:*`).
| გამონაკლისი მხოლოდ /health და /auth/{register,login}-ია.
*/

Route::get('/health', function () {
    return response()->json([
        'app' => 'mediary-api',
        'status' => 'ok',
        'version' => '0.5.0',
        'time' => now()->toIso8601String(),
    ]);
});

/* ---------- ავტორიზაცია (საჯარო) ----------
   ⚠️ **`throttle:login` აუცილებელია და არა სიფრთხილე** (აუდიტი 2026-09-14, §A1):
   რეგისტრაცია ღიაა, ე.ი. ამ ჭერის გარეშე პაროლის ბრუტფორსს არაფერი აჩერებდა.
   ჭერი **IP + შეყვანილი login-ი ერთად** არის — იხ. `AppServiceProvider::rateLimiters()`. */
Route::middleware('throttle:login')->group(function () {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);

    /* FEAT-16 — ადმინის ერთჯერადი აღდგენის ბმული. ⚠️ **ღიაა განზრახ**:
       ბმულით შემოსული ადამიანი სწორედ იმიტომ მოვიდა, რომ ვერ შედის.
       ვადაგასული/გამოყენებული ბმული **410**-ია და არა 404 — „ასეთი
       არასდროს ყოფილა" და „ვადა გაუშვა" სხვადასხვა ქმედებას ითხოვს. */
    Route::get('/auth/reset/{token}', [PasswordResetController::class, 'show']);
    Route::post('/auth/reset/{token}', [PasswordResetController::class, 'store']);
});

/* ---------- საჯარო პროფილი (Tasks §16.1) — ავტორიზაციის გარეშე ----------
   ⚠️ **ეს ხუთი endpoint-ია `auth:sanctum`-ის გარეთ არსებული დომენური
   ზედაპირი**; მის გარეთ ღიაა კიდევ ხუთი — `/health`, `register`, `login`
   და FEAT-16-ის აღდგენის წყვილი (`GET|POST /auth/reset/{token}`, ორივე
   `throttle:login`-ის უკან). ეს ყველაზე სენსიტიური სიაა პროექტში —
   შემდეგმა reviewer-მა ზუსტად უნდა იცოდეს, რამდენია:

     1. `GET  /public/profiles/{username}`                           — პროფილის თავი
     2. `GET  /public/profiles/{username}/gallery-photos`            — ფოტოების გვერდი
     3. `GET  /public/profiles/{username}/gallery-photos/{image}/file` — ერთი ფაილი
     4. `POST /public/profiles/{username}/albums/{album}/unlock`     — **ერთადერთი write**
     5. `GET  /public/profiles/{username}/{domain}`                  — დომენის ბარათები

   ⚠️ **ოთხი read-only-ია, მეხუთე — არა** (Tasks GAP-06; კომენტარი ადრე „ორივე
   read-only-ია"-ს ამბობდა, რაც ორმაგად მცდარი იყო). `unlockAlbum` პაროლს
   ამოწმებს და **სერვერის სესიას ცვლის**; მისი ორი დამცავია
   `throttle:album-unlock` (ანონიმზე გასაღები IP + ალბომი) და ცხადი შემოწმება,
   რომ ალბომი **ამ პროფილისაა და საჯაროა** — უამისოდ ეს endpoint სხვისი
   პირადი ალბომის პაროლის გამოცნობის კარი იქნებოდა. სესიის გარეშე პაროლი
   საერთოდ არ იცდება (BUG-02, 409 `session_required`).

   ხუთივე სამ ფენას ერთდროულად ითხოვს (პროფილი → მოდული → ჩანაწერი), ყველა
   default-ით `private`, და ხუთივე `PublicProfileService::resolve()`-ზე გადის —
   ე.ი. მთელი მექანიზმი ერთი ცვლადით ითიშება: `PUBLIC_PROFILES=false`.
   დეტალები `PublicProfileController`-ში. */
Route::get('/public/profiles/{username}', [PublicProfileController::class, 'show']);

/* ⚠️ **ორივე `{domain}`-ზე ზემოთ დგას** (Tasks §7.4/§7.12), თორემ
   „gallery-photos" და „albums" დომენებად წაიკითხება — იგივე წესი, რაც
   `/gallery/{type}/{id}`-ს აქვს. */
Route::get('/public/profiles/{username}/gallery-photos', [PublicProfileController::class, 'photos']);
/* 2026-09-17 — გახსნილი ჩაკეტილი ალბომის ფოტო პირად დისკზეა და მხოლოდ აქედან
   გამოდის: შიდა `/gallery/images/{id}/file` უცხოსთვის `auth:sanctum`-ის უკანაა. */
Route::get('/public/profiles/{username}/gallery-photos/{image}/file', [PublicProfileController::class, 'photoFile'])
    ->whereNumber('image');
Route::post('/public/profiles/{username}/albums/{album}/unlock', [PublicProfileController::class, 'unlockAlbum'])
    ->whereNumber('album')
    // §7.13 — ანონიმზე გასაღები IP + ალბომია; უამისოდ ოთხსიმბოლოიანი პაროლი წუთებში ცვივა
    ->middleware('throttle:album-unlock');

Route::get('/public/profiles/{username}/{domain}', [PublicProfileController::class, 'items']);

Route::middleware('auth:sanctum')->group(function () {

    /* ---------- ანგარიში ---------- */
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::match(['put', 'patch'], '/auth/profile', [AuthController::class, 'updateProfile']);
    Route::patch('/auth/password', [AuthController::class, 'updatePassword']);
    Route::put('/auth/settings', [AuthController::class, 'updateSettings']);

    /* FEAT-16 — არჩევითი TOTP. ⚠️ **ოთხივე ანგარიშის პაროლს ითხოვს**
       (გარდა `confirm`-ისა, სადაც დასადასტურებელი თვითონ კოდია) — გახსნილ
       ტაბთან მისული ადამიანისთვის მეორე ფაქტორის ჩუმად გამორთვა სწორედ
       ის ხვრელია, რომლის დახურვასაც ეს მექანიზმი ცდილობს.
       ⚠️ `throttle:login` **`confirm`-ზეც** დგას: ეს ერთადერთი ადგილია,
       სადაც ექვსნიშნა კოდი მოწმდება შესვლის გარეთ. */
    Route::post('/auth/2fa', [TwoFactorController::class, 'store']);
    Route::post('/auth/2fa/confirm', [TwoFactorController::class, 'confirm'])->middleware('throttle:login');
    Route::post('/auth/2fa/recovery-codes', [TwoFactorController::class, 'recoveryCodes']);
    Route::delete('/auth/2fa', [TwoFactorController::class, 'destroy']);

    /* ---------- შეტყობინებები (FEAT-19) ----------
       ⚠️ **მოდულის ჯგუფის გარეთ**: შეტყობინება ანგარიშის ფაქტია და არა
       მოდულის შიგთავსი (საცავისა და კვოტის იგივე რიგი).
       ⚠️ **`/read` და `/unread` `{notification}`-ზე ზემოთ დგას**, თორემ
       ისინი UUID-ად წაიკითხება — `/gallery/{type}/{id}`-ის იგივე წესი. */
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread', [NotificationController::class, 'unread']);
    Route::patch('/notifications/read', [NotificationController::class, 'read']);
    Route::delete('/notifications', [NotificationController::class, 'destroy']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'read']);
    Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy']);

    /* ---------- საცავი (Tasks 17.1/17.3) — მოდულებად დაშლა და გადათვლა ----------
       მსუბუქი ჯამი `GET /auth/me`-ზეც მოდის (`UserResource.storage`). */
    Route::get('/storage', [StorageController::class, 'show']);
    Route::post('/storage/recalculate', [StorageController::class, 'recalculate']);
    // 17.2 — ლიმიტების გადანაწილება მოდულებზე (`null` = ლიმიტის მოხსნა)
    Route::put('/storage/allocations', [StorageController::class, 'setAllocations']);
    // 17.5 — „ყველაზე დიდი ფაილები" + ერთეულოვანი წაშლა (`path` სხეულში)
    Route::get('/storage/files', [StorageController::class, 'files']);
    Route::delete('/storage/files', [StorageController::class, 'destroyFile']);
    /* §6.2 — მონიშნულების/ყველას ჩამოტვირთვა zip-ად. `POST`, რადგან
       მონიშვნა ასეულ გზას შეიძლება შეიცავდეს. */
    Route::post('/storage/files/download', [StorageController::class, 'downloadFiles']);
    // ობოლი ფაილები **გლობალურია** (მფლობელი აღარ აქვს) → მხოლოდ super_admin
    Route::middleware('super_admin')->group(function () {
        Route::get('/storage/orphans', [StorageController::class, 'orphans']);
        Route::post('/storage/orphans/clean', [StorageController::class, 'cleanOrphans']);
    });

    /* ---------- ძებნა ვებში (Tasks §7.5/§7.6) ----------
       ⚠️ **`/serp/*` განზრახ არ ჰქვია:** წყარო ერთი არ არის — უფასო
       კატალოგი (Wikimedia) და SerpApi-ის engine-ები ერთ სიაშია, ერთი
       ინტერფეისით; SerpApi მხოლოდ **ერთ-ერთი** მათგანია.
       ⚠️ **მოდულის ჯგუფის გარეთ განზრახ:** ვებძებნა მოდული არ არის, წყაროა
       (TMDB/RAWG/BGG-ის რიგში) — არც `modules` რიგი აქვს, არც საიდბარის
       სექცია. ოთხივე საძიებო მარშრუტი **`GET`-ია**: ძებნა კითხვაა, და POST-ის
       შემთხვევაში `EnsureModulePermission` მას `create`-ად წაიკითხავდა
       (`GET /board-games/shops`-ის იგივე მიზეზი).
       ⚠️ `status` **უფასოა** — `GET /account` კვოტას არ ხარჯავს, ამიტომ ის
       ჭერის გარეთაა: ღილაკის მდგომარეობა ლიმიტს არ უნდა ხარჯავდეს.
       ⚠️ **დანარჩენ სამზე `throttle:web-search`** (აუდიტი §A1): თითოეული
       გამოძახება ან SerpApi-ს კრედიტს ხარჯავს, ან Serper-ის გვერდს, და ეს
       კვოტა **ინსტალაციისაა** — ერთი ანგარიში ყველა დანარჩენს ტოვებდა უკვოტოდ. */
    Route::get('/web/status', [WebSearchController::class, 'status']);
    Route::middleware('throttle:web-search')->group(function () {
        Route::get('/web/images', [WebSearchController::class, 'images']);
        Route::get('/web/videos', [WebSearchController::class, 'videos']);
        Route::get('/web/video', [WebSearchController::class, 'video']);
    });
    /* ⚠️ **ეს ერთი `POST`-ია და განზრახ:** აქ მართლა იქმნება ჩანაწერი
       (`gallery_images`-ის რიგი + ფაილი დისკზე), ძებნა კი კითხვა იყო. */
    Route::post('/web/import', [WebSearchController::class, 'import']);

    /* ---------- ფონური პარტია (აუდიტი §D1) ----------
       ⚠️ **მოდულის ჯგუფის გარეთ**: ერთი პარტია სამ დომენს ერთდროულად
       შეიძლება შეიცავდეს („ფილმები და სერიალები ერთად"), ე.ი. `module:@type`
       ერთ კონკრეტულს მოითხოვდა. უფლებას კონტროლერი თითო ტიპზე ცხადად
       ამოწმებს — იგივე გადაწყვეტილება, რაც `/visibility/{domain}`-ს აქვს. */
    Route::post('/batches', [BatchController::class, 'store']);
    Route::get('/batches/{batch}', [BatchController::class, 'show']);
    Route::delete('/batches/{batch}', [BatchController::class, 'destroy']);

    /* ---------- ჯვარედინი ძებნა (აუდიტი §D6) ----------
       ⚠️ **მოდულის ჯგუფის გარეთ**: კითხვა ყველა ჩართულ მოდულს ეხება და არა
       ერთს — რომელია ჩართული, ამას `GlobalSearch` წყვეტს. */
    Route::get('/search', [SearchController::class, 'index']);

    /* ---------- აუდიტ-ლოგი: სექციაში შესვლა (Tasks §4.1) ----------
       SPA-ს მარშრუტის შეცვლა HTTP რექვესთი არ არის, ე.ი. სიგნალი ცხადად
       მოდის. მოდულის middleware-ის გარეთ — იხ. `AuditController`. */
    Route::post('/audit/visit', [AuditController::class, 'visit']);

    /* ---------- დეშბორდი (Tasks 2) — მთავარი გვერდის ქარდები ----------
       მოდულის middleware-ის გარეშე: თვითონ წყვეტს, რომელი მოდული ჩანს. */
    Route::get('/dashboard', [DashboardController::class, 'index']);

    /* ---------- „მონაცემები": გასაღებები და ლიმიტები (Tasks §21) ---------- */
    /* ⚠️ **`module:` ჯგუფს მიღმაა და განზრახ.** გასაღები კონტენტის მოდული
       არაა (`modules` ცხრილში რიგი არ აქვს, იხ. `CredentialProviders`), და —
       რაც მთავარია — მოდულის გამორთვა *ყველა* ანგარიშზე მოქმედებს, ე.ი.
       ერთი გადამრთველი ყველას თარგმანს გათიშავდა.
       ⚠️ `PUT`, არა `POST`: შვიდივე წყარო **არსებულ** ჩანაწერს ცვლის და
       `EnsureModulePermission`-ის ლოგიკით POST `create`-ად იკითხებოდა. */
    Route::get('/credentials', [CredentialController::class, 'index']);
    Route::put('/credentials/{provider}', [CredentialController::class, 'update']);
    Route::delete('/credentials/{provider}', [CredentialController::class, 'destroy']);
    /* ⚠️ ცოცხალი შემოწმება გარეთ გადის — `throttle:web-search`-ის ოჯახში
       ჯდება: SerpApi/Serper-ის შემოწმება ბიუჯეტს ეხება. */
    Route::post('/credentials/{provider}/test', [CredentialController::class, 'test'])
        ->middleware('throttle:web-search');
    /* §21.8 — გასაღების ნახვა/კოპირება. ⚠️ **`GET` და არა სიის ველი**:
       სრული გასაღები მხოლოდ ცხადი დაჭერისას გადის, და არა ყოველ გვერდის
       გახსნაზე (სადაც ის ქეშსა და ქსელის ჩანართში დარჩებოდა). */
    Route::get('/credentials/{provider}/reveal', [CredentialController::class, 'reveal']);

    /* ---------- მოდულები და მოთხოვნები ---------- */
    /* **ატვირთვის ლიმიტები** (2026-09-14) — ინტერფეისი ზუსტად იმას წერს,
       რასაც სერვერი მიიღებს. ⚠️ მოდულზე დამოკიდებული არაა: ლიმიტი აპისა და
       PHP-ის წესია და არა ბიბლიოთეკის შიგთავსისა, ე.ი. `module:` ჯგუფს
       მიღმა დგას (პარამეტრების გვერდსაც სჭირდება, ჩართული მოდულის გარეშეც). */
    Route::get('/uploads/limits', fn () => response()->json(['data' => UploadLimits::all()]));

    Route::get('/modules', [ModuleController::class, 'index']);
    Route::put('/modules/{key}/settings', [ModuleController::class, 'updateSettings']);
    // §6 (ფაზა 1) — რომელი არჩევითი ველი ჩანს მოდულის ფორმაზე.
    // `PUT`: POST-ს `permission:` middleware `create`-ად წაიკითხავდა.
    Route::get('/modules/{key}/fields', [ModuleController::class, 'fields']);
    Route::put('/modules/{key}/fields', [ModuleController::class, 'updateFields']);
    Route::delete('/modules/{key}/fields', [ModuleController::class, 'resetFields']);
    /* §6 (ფაზა 3) — **მორგებული** ველები: განსაზღვრებები მოდულზე,
       მნიშვნელობები ჩანაწერზე. ერთი endpoint რვავე მოდულზე —
       `/visibility/{domain}/{id}`-ის იგივე ნიმუში. */
    Route::get('/modules/{key}/custom-fields', [CustomFieldController::class, 'index']);
    Route::put('/modules/{key}/custom-fields', [CustomFieldController::class, 'update']);
    Route::get('/custom-fields/{module}/{id}', [CustomFieldController::class, 'values'])
        ->whereIn('module', CustomFields::modules())->whereNumber('id');
    Route::put('/custom-fields/{module}/{id}', [CustomFieldController::class, 'setValues'])
        ->whereIn('module', CustomFields::modules())->whereNumber('id');
    /* §6 (ფაზა 4b) — `ფაილი` ტიპის ველი. ⚠️ **ატვირთვა ცალკე endpoint-ია**:
       მნიშვნელობების `PUT` მთელ მონახაზს იღებს და ფაილს ცარიელ მნიშვნელობად
       წაშლიდა. გაცემა **მხოლოდ აქედან** ხდება — `notes/fields` პრივატულ
       დისკზეა (§17.5) და `/storage/*` მას ვერ ხედავს. */
    Route::post('/custom-fields/{module}/{id}/file', [CustomFieldController::class, 'storeFile'])
        ->whereIn('module', CustomFields::modules())->whereNumber('id');
    /* §7.3 — ⚠️ **`{file}` არჩევითია**: ერთ ველზე ახლა რამდენიმე ფაილი ჯდება,
       მისი გარეშე მისამართი კი ძველებურად მუშაობს (გაცემაზე — პირველი,
       წაშლაზე — ველის ყველა ფაილი). */
    Route::get('/custom-fields/{module}/{id}/file/{key}/{file?}', [CustomFieldController::class, 'showFile'])
        ->whereIn('module', CustomFields::modules())->whereNumber('id')->whereNumber('file');
    Route::delete('/custom-fields/{module}/{id}/file/{key}/{file?}', [CustomFieldController::class, 'destroyFile'])
        ->whereIn('module', CustomFields::modules())->whereNumber('id')->whereNumber('file');
    // 16.1 — ჩანს თუ არა მოდული ჩემს საჯარო პროფილზე (`PUT`: POST-ს
    // `permission:` middleware `create`-ად წაიკითხავდა)
    Route::put('/modules/{key}/public', [ModuleController::class, 'setPublic']);
    // საკუთარი თავისთვის ჩართვა/გამორთვა (K13) — ჩართვა მხოლოდ უკვე მინიჭებულზე
    Route::patch('/modules/{key}', [ModuleController::class, 'setEnabled']);
    Route::get('/requests', [ApprovalRequestController::class, 'index']);
    Route::post('/requests/module', [ApprovalRequestController::class, 'storeModuleRequest']);
    // 17.4 — ლიმიტის გაზრდის მოთხოვნა (იმავე ცხრილში, ახალი ტიპით)
    Route::post('/requests/storage', [ApprovalRequestController::class, 'storeStorageRequest']);
    Route::delete('/requests/{approvalRequest}', [ApprovalRequestController::class, 'destroy']);

    /* ---------- ჩემი მონაცემების ექსპორტი (FEAT-06) ----------
       ⚠️ **ჯგუფის `module:`/`permission:` middleware განზრახ არ ადევს** —
       პარამეტრი `module`-ია და არა `type`, ე.ი. `@type` მას ვერ წაიკითხავდა
       და ჩუმად `movie`-ის უფლებას შეამოწმებდა ყველა მოდულზე. ორივე
       შემოწმება კონტროლერშია, ცხადად (`VisibilityController`-ის წესი).
       ⚠️ ორივე **`GET`-ია**: ექსპორტი კითხვაა და არა ჩანაწერი; POST-ს
       `EnsureModulePermission` `create`-ად წაიკითხავდა და view-only როლი
       საკუთარ მონაცემებს ვერ წაიღებდა. */
    Route::get('/export', [ExportController::class, 'index']);
    Route::get('/export/{module}', [ExportController::class, 'show']);

    /* ---------- გარე სერვისის CSV-ის იმპორტი (FEAT-07) ----------
       ⚠️ **ეს „ლინკების ბოტი" არ არის** (2026-09-05-ს სამუდამოდ მოხსნილი):
       იქ აპი თვითონ დაეძებდა ბმულებს უცხო საიტებზე, აქ კი მომხმარებელი
       საკუთარ ფაილს ტვირთავს.
       ⚠️ **ჯგუფის middleware არ ადევს**: მოდული ფაილის შიგთავსიდან
       ირკვევა და არა მისამართიდან, ე.ი. `@type`-ს წასაკითხი არაფერი აქვს —
       ორივე შემოწმება (წვდომა + უფლება) კონტროლერშია, ცხადად. */
    /* ---------- სტატისტიკა (FEAT-08) ----------
       ⚠️ **დეშბორდს არ ცვლის**: ის „რა მაქვს"-ს პასუხობს, ეს — „რა გავაკეთე".
       ⚠️ ერთი რექვესთი ყველა ჩართულ მოდულზე; ჩაურთველი სიიდან თვითონ ცვივა. */
    /* ⚠️ `/stats/summary` **`/stats`-ის ზემოთ არ უნდა იყოს საჭირო**, რადგან
       პირველი ზუსტი მისამართია და არა პარამეტრი — მაგრამ თუ ოდესმე
       `/stats/{domain}` გაჩნდება, „summary" დომენად წაიკითხება. */
    Route::get('/stats', [StatsController::class, 'index']);
    Route::get('/stats/summary', [StatsController::class, 'summary']);

    /* ---------- „მალე" (FEAT-10) ----------
       მომდევნო 30 დღის მოვლენები ყველა ჩართულ მოდულზე: შემდეგი ეპიზოდი,
       თამაშის გამოსვლა, ჩანიშვნის ვადა. ⚠️ წიგნსა და ბორდგეიმს მხოლოდ
       `year` აქვთ, ე.ი. კონკრეტულ დღეს ვერ დადგებიან. */
    Route::get('/upcoming', [UpcomingController::class, 'index']);

    /* ---------- კალათა (FEAT-11) ----------
       ⚠️ **`module:`/`permission:` middleware განზრახ არ ადევს**: პარამეტრს
       `domain` ჰქვია და არა `type`, ე.ი. `@type` ყოველთვის `movie`-ს
       შეამოწმებდა. ორივე შემოწმება (წვდომა + `delete` უფლება) კონტროლერშია.
       ⚠️ **`DELETE /trash` `/trash/{domain}/{id}`-ზე მაღლა დგას** — თორემ
       დაცლის მისამართს როუტერი ვერ გაარჩევდა ერთი ჩანაწერის წაშლისგან. */
    Route::get('/trash', [TrashController::class, 'index']);
    Route::delete('/trash', [TrashController::class, 'empty']);
    Route::post('/trash/{domain}/{id}/restore', [TrashController::class, 'restore'])->whereNumber('id');
    Route::delete('/trash/{domain}/{id}', [TrashController::class, 'destroy'])->whereNumber('id');

    Route::get('/import/sources', [ImportController::class, 'sources']);
    Route::post('/import/plan', [ImportController::class, 'plan']);
    Route::post('/import/item', [ImportController::class, 'item']);

    /* ---------- ფილმები (module: movie) ---------- */
    Route::middleware(['module:movie', 'permission:movie'])->group(function () {
        Route::get('/movies', [MovieController::class, 'index']);
        Route::post('/movies', [MovieController::class, 'store']);
        Route::post('/movies/from-tmdb', [MovieController::class, 'storeFromTmdb']);
        Route::post('/movies/bulk-status', [MovieStatusController::class, 'bulkUpdate']);
        Route::get('/movies/{movie}', [MovieController::class, 'show']);
        Route::match(['put', 'patch'], '/movies/{movie}', [MovieController::class, 'update']);
        Route::delete('/movies/{movie}', [MovieController::class, 'destroy']);

        Route::patch('/movies/{movie}/status', [MovieStatusController::class, 'update']);
        Route::patch('/movies/{movie}/favorite', [MovieFavoriteController::class, 'update']);
        Route::post('/movies/{movie}/resync', [MovieSyncController::class, 'resync']);
        Route::get('/movies/{movie}/collection', [MovieCollectionController::class, 'show']);
    });

    /* ---------- სერიალები (module: series) ---------- */
    Route::middleware(['module:series', 'permission:series'])->group(function () {
        Route::get('/series', [SeriesController::class, 'index']);
        Route::post('/series', [SeriesController::class, 'store']);
        Route::post('/series/from-tmdb', [SeriesController::class, 'storeFromTmdb']);
        Route::post('/series/bulk-status', [SeriesStatusController::class, 'bulkUpdate']);
        Route::get('/series/{series}', [SeriesController::class, 'show']);
        Route::match(['put', 'patch'], '/series/{series}', [SeriesController::class, 'update']);
        Route::delete('/series/{series}', [SeriesController::class, 'destroy']);

        Route::patch('/series/{series}/status', [SeriesStatusController::class, 'update']);
        Route::patch('/series/{series}/favorite', [SeriesFavoriteController::class, 'update']);
        Route::post('/series/{series}/resync', [SeriesSyncController::class, 'resync']);
    });

    /* ---------- ანიმეები (module: anime, Tasks §7.1) ----------
       ⚠️ **სერიალის ზუსტი სარკე**: მესამე მედია-დომენს „ზუსტად იგივე
       ფუნქციონალი" აქვს, რაც ფილმებსა და სერიალებს. გაზიარებული endpoint-ები
       (`/lookup`, `/discover`, `/media/sync/{type}/{id}`, `/gallery/{type}/{id}`,
       `/translations/{type}/{id}`) მას `MediaDomain::TYPES`-ის წყალობით
       ავტომატურად ცნობენ. */
    Route::middleware(['module:anime', 'permission:anime'])->group(function () {
        Route::get('/anime', [AnimeController::class, 'index']);
        Route::post('/anime', [AnimeController::class, 'store']);
        Route::post('/anime/from-tmdb', [AnimeController::class, 'storeFromTmdb']);
        // ⚠️ `{anime}`-ზე **ზემოთ**, თორემ „bulk-status" id-ად წაიკითხება
        Route::post('/anime/bulk-status', [AnimeStatusController::class, 'bulkUpdate']);
        Route::get('/anime/{anime}', [AnimeController::class, 'show']);
        Route::match(['put', 'patch'], '/anime/{anime}', [AnimeController::class, 'update']);
        Route::delete('/anime/{anime}', [AnimeController::class, 'destroy']);

        Route::patch('/anime/{anime}/status', [AnimeStatusController::class, 'update']);
        Route::patch('/anime/{anime}/favorite', [AnimeFavoriteController::class, 'update']);
        Route::post('/anime/{anime}/resync', [AnimeSyncController::class, 'resync']);
    });

    /* ---------- ვიდეოები (module: video) ---------- */
    Route::middleware(['module:video', 'permission:video'])->group(function () {
        /* ვიდეოს ტიპები — მართვადი ლექსიკონი (Tasks 5.1).
           `/reorder` ცალკე POST-ია, ე.ი. `store`-ს არ ეჯახება. */
        Route::get('/video-types', [VideoTypeController::class, 'index']);
        Route::post('/video-types', [VideoTypeController::class, 'store']);
        Route::post('/video-types/reorder', [VideoTypeController::class, 'reorder']);
        Route::match(['put', 'patch'], '/video-types/{videoType}', [VideoTypeController::class, 'update']);
        Route::delete('/video-types/{videoType}', [VideoTypeController::class, 'destroy']);

        Route::get('/videos', [VideoController::class, 'index']);
        /* ბმულის მეტამონაცემი ფორმის შესავსებად (K2) — ჩანაწერს არ ქმნის.
           ⚠️ უფლება **`view`**-ია (`VIEW_ENDPOINTS`, Tasks GAP-04) და არა
           POST-იდან გამოყვანილი `create`: probe რედაქტირებიდანაც იძახება
           (URL-ის შეცვლაზე), ე.ი. update-only როლი ცრუ 403-ს იღებდა. */
        Route::post('/videos/metadata', [VideoController::class, 'metadata']);
        /* §7.1 — „ჩამოწერა შესაძლებელია?" (yt-dlp არის თუ არა ამ მანქანაზე).
           ⚠️ `{video}`-ზე **ზემოთ** უნდა იდგეს, თორემ „download-status" id-ად
           წაიკითხება — იგივე წესი, რაც `videos/bulk`-ს და `gallery/groups`-ს. */
        Route::get('/videos/download-status', [VideoDownloadController::class, 'status']);
        Route::post('/videos', [VideoController::class, 'store']);
        // მასობრივი ოპერაცია (Tasks 4 / 19.9): ტიპი · ტეგის დამატება/მოხსნა.
        // `{video}`-ზე ზემოთ უნდა იყოს, თორემ „bulk" id-ად წაიკითხება.
        Route::post('/videos/bulk', [VideoBulkController::class, 'update']);
        /* §9.2 — „რამდენს შეეხება". ⚠️ **`GET` და არა `POST`**: `preview`
           `UPDATE_ENDPOINTS`-ში არ არის, ე.ი. POST-ს შუამავალი `create`-ად
           წაიკითხავდა და view+update როლი უსაფუძვლო 403-ს მიიღებდა. */
        Route::get('/videos/bulk-preview', [VideoBulkController::class, 'preview']);
        /* §6.4 — ვიდეოს სტატუსი. **ახალი ველი**: ამ მოდულს სტატუსი აქამდე
           არ ჰქონდა. ⚠️ `{video}`-ზე ზემოთ, თორემ „bulk-status" id-ად წაიკითხება. */
        Route::post('/videos/bulk-status', [VideoStatusController::class, 'bulkUpdate']);
        Route::get('/videos/{video}', [VideoController::class, 'show']);
        Route::match(['put', 'patch'], '/videos/{video}', [VideoController::class, 'update']);
        Route::delete('/videos/{video}', [VideoController::class, 'destroy']);
        // „მსგავსი ვიდეოები" — ჩემი ბიბლიოთეკიდან (K4)
        Route::get('/videos/{video}/similar', [VideoController::class, 'similar']);
        Route::patch('/videos/{video}/favorite', [VideoController::class, 'toggleFavorite']);
        Route::post('/videos/{video}/watched', [VideoController::class, 'markWatched']);
        Route::patch('/videos/{video}/status', [VideoStatusController::class, 'update']);

        /* §7.1 — ლოკალური ასლი: ერთი მისამართი, სამი ზმნა (დაწყება · მიწოდება ·
           წაშლა). ⚠️ ფაილი **პრივატულ დისკზეა**, ე.ი. `/storage/*`-ით არ
           იხსნება — მხოლოდ ეს `GET` გამოიტანს მას, მფლობელობის შემოწმებით. */
        /* ⚠️ **მხოლოდ დაწყებას აქვს ჭერი** (აუდიტი §A1): ერთი გაშვება წუთებია
           და გიგაბაიტები. `GET` (ფაილის მიწოდება) და `DELETE` იაფია და
           ჭერის ქვეშ მოხვედრა მათ გამართულ მუშაობას გატეხდა. */
        Route::post('/videos/{video}/download', [VideoDownloadController::class, 'store'])
            ->middleware('throttle:download');
        Route::get('/videos/{video}/download', [VideoDownloadController::class, 'show']);
        Route::delete('/videos/{video}/download', [VideoDownloadController::class, 'destroy']);

        /* მიმაგრებული ფაილები და ჩანიშვნები (K3) — ცხრილიც და მისამართიც
           **სექციისაა** (`video_files` / `video_notes`, გადაწყვეტილება 2026-09-03) */
        Route::get('/videos/{video}/files', [VideoFileController::class, 'index']);
        Route::post('/videos/{video}/files', [VideoFileController::class, 'store']);
        Route::delete('/video-files/{videoFile}', [VideoFileController::class, 'destroy']);

        Route::get('/videos/{video}/notes', [VideoNoteController::class, 'index']);
        Route::post('/videos/{video}/notes', [VideoNoteController::class, 'store']);
        Route::match(['put', 'patch'], '/video-notes/{videoNote}', [VideoNoteController::class, 'update']);
        Route::delete('/video-notes/{videoNote}', [VideoNoteController::class, 'destroy']);
    });

    /* ---------- ბორდგეიმები (module: board_game) — Tasks §14 ----------
       წყარო BoardGameGeek-ია (XML API 2, კლავიშის გარეშე). გალერეა
       `board_game_files.kind = 'image'`-შია — იხ. `BoardGameFileController`. */
    Route::middleware(['module:board_game', 'permission:board_game'])->group(function () {
        Route::get('/board-game-genres', [BoardGameGenreController::class, 'index']);
        Route::post('/board-game-genres', [BoardGameGenreController::class, 'store']);
        Route::post('/board-game-genres/reorder', [BoardGameGenreController::class, 'reorder']);
        Route::match(['put', 'patch'], '/board-game-genres/{boardGameGenre}', [BoardGameGenreController::class, 'update']);
        Route::delete('/board-game-genres/{boardGameGenre}', [BoardGameGenreController::class, 'destroy']);

        Route::get('/board-games', [BoardGameController::class, 'index']);
        // ⚠️ `{boardGame}`-ზე ზემოთ, თორემ „lookup" id-ად წაიკითხება
        Route::post('/board-games/lookup/candidates', [BoardGameController::class, 'candidates']);
        Route::post('/board-games/lookup', [BoardGameController::class, 'lookup']);
        // ქართული მაღაზიები (§7.2) — GET, რადგან ძებნაა: POST-ზე უფლება `create`-ად
        // წაიკითხებოდა და რედაქტირებისას (update) 403 დაბრუნდებოდა
        Route::get('/board-games/shops', [BoardGameController::class, 'shops']);
        Route::post('/board-games', [BoardGameController::class, 'store']);
        Route::get('/board-games/{boardGame}', [BoardGameController::class, 'show']);
        Route::match(['put', 'patch'], '/board-games/{boardGame}', [BoardGameController::class, 'update']);
        Route::delete('/board-games/{boardGame}', [BoardGameController::class, 'destroy']);
        Route::patch('/board-games/{boardGame}/favorite', [BoardGameController::class, 'toggleFavorite']);
        Route::patch('/board-games/{boardGame}/status', [BoardGameController::class, 'setStatus']);

        /* წესების PDF, გალერეის ფოტოები და ჩანიშვნები — სექციის ცხრილები */
        Route::get('/board-games/{boardGame}/files', [BoardGameFileController::class, 'index']);
        Route::post('/board-games/{boardGame}/files', [BoardGameFileController::class, 'store']);
        Route::delete('/board-game-files/{boardGameFile}', [BoardGameFileController::class, 'destroy']);

        Route::get('/board-games/{boardGame}/notes', [BoardGameNoteController::class, 'index']);
        Route::post('/board-games/{boardGame}/notes', [BoardGameNoteController::class, 'store']);
        Route::match(['put', 'patch'], '/board-game-notes/{boardGameNote}', [BoardGameNoteController::class, 'update']);
        Route::delete('/board-game-notes/{boardGameNote}', [BoardGameNoteController::class, 'destroy']);
    });

    /* ---------- თამაშები (module: game) — Tasks §11 ----------
       წყარო RAWG-ია (§11.4, ერთი უფასო კლავიში). ჟანრი **pivot-ია** და არა
       სვეტი — 11.1 „ჟანრებს" მრავლობითში წერს. RAWG-ის სქრინშოტები
       `gallery_images`-ში ხვდება, user-ის ატვირთული კი `game_files`-ში. */
    Route::middleware(['module:game', 'permission:game'])->group(function () {
        Route::get('/game-genres', [GameGenreController::class, 'index']);
        Route::post('/game-genres', [GameGenreController::class, 'store']);
        Route::post('/game-genres/reorder', [GameGenreController::class, 'reorder']);
        Route::match(['put', 'patch'], '/game-genres/{gameGenre}', [GameGenreController::class, 'update']);
        Route::delete('/game-genres/{gameGenre}', [GameGenreController::class, 'destroy']);

        Route::get('/games', [GameController::class, 'index']);
        // ⚠️ `{game}`-ზე ზემოთ, თორემ „lookup"/„franchises" id-ად წაიკითხება
        Route::get('/games/franchises', [GameController::class, 'franchises']);
        Route::post('/games/lookup/candidates', [GameController::class, 'candidates']);
        Route::post('/games/lookup', [GameController::class, 'lookup']);
        Route::post('/games', [GameController::class, 'store']);
        Route::get('/games/{game}', [GameController::class, 'show']);
        Route::match(['put', 'patch'], '/games/{game}', [GameController::class, 'update']);
        Route::delete('/games/{game}', [GameController::class, 'destroy']);
        Route::patch('/games/{game}/favorite', [GameController::class, 'toggleFavorite']);
        Route::patch('/games/{game}/status', [GameController::class, 'setStatus']);

        /* §11.2 — walkthrough და სხვა ვიდეოები (საკუთარი ცხრილი `game_videos`) */
        Route::get('/games/{game}/videos', [GameVideoController::class, 'index']);
        Route::post('/games/{game}/videos', [GameVideoController::class, 'store']);
        Route::post('/games/{game}/videos/reorder', [GameVideoController::class, 'reorder']);
        Route::match(['put', 'patch'], '/game-videos/{gameVideo}', [GameVideoController::class, 'update']);
        Route::delete('/game-videos/{gameVideo}', [GameVideoController::class, 'destroy']);

        /* ატვირთული სქრინშოტები/დოკუმენტები და ჩანიშვნები — სექციის ცხრილები */
        Route::get('/games/{game}/files', [GameFileController::class, 'index']);
        Route::post('/games/{game}/files', [GameFileController::class, 'store']);
        Route::delete('/game-files/{gameFile}', [GameFileController::class, 'destroy']);

        Route::get('/games/{game}/notes', [GameNoteController::class, 'index']);
        Route::post('/games/{game}/notes', [GameNoteController::class, 'store']);
        Route::match(['put', 'patch'], '/game-notes/{gameNote}', [GameNoteController::class, 'update']);
        Route::delete('/game-notes/{gameNote}', [GameNoteController::class, 'destroy']);
    });

    /* ---------- ჩანაწერები (module: note) — Tasks §13 ----------
       გარე წყარო არ არსებობს: ეს user-ის საკუთარი ინფორმაციაა. ცხრილები
       `note_entries`/`note_entry_files`/`note_reminders`-ია — უნივერსალური
       `notes` 2026-09-03-ის წესით აღარ არსებობს. */
    Route::middleware(['module:note', 'permission:note'])->group(function () {
        /* კატეგორიები („რას ეხება") — per-user ლექსიკონი */
        Route::get('/note-categories', [NoteCategoryController::class, 'index']);
        Route::post('/note-categories', [NoteCategoryController::class, 'store']);
        Route::post('/note-categories/reorder', [NoteCategoryController::class, 'reorder']);
        Route::match(['put', 'patch'], '/note-categories/{noteCategory}', [NoteCategoryController::class, 'update']);
        Route::delete('/note-categories/{noteCategory}', [NoteCategoryController::class, 'destroy']);

        /* ⚠️ `{noteReminder}`-ის მარშრუტი არ არსებობს GET-ზე, ე.ი. „due"
           კონფლიქტს არ ქმნის; მაინც ზემოთ წერია, რომ წესი თვალსაჩინო იყოს */
        Route::get('/note-reminders/due', [NoteReminderController::class, 'due']);
        /* ეტაპი 11.2 — შეხსენებებს თავისი გვერდი აქვს (`/notes/reminders`),
           ე.ი. სჭირდება „რა მელის საერთოდ" და არა მხოლოდ „ამ ჩანაწერს რა აქვს".
           ⚠️ `due`-ს **შემდეგ** წერია, თორემ „due" `{noteReminder}`-ად წაიკითხებოდა
           (იგივე წესი, რაც `/gallery/{type}/{id}`-ს აქვს). */
        Route::get('/note-reminders', [NoteReminderController::class, 'all']);
        Route::match(['put', 'patch'], '/note-reminders/{noteReminder}', [NoteReminderController::class, 'update']);
        Route::delete('/note-reminders/{noteReminder}', [NoteReminderController::class, 'destroy']);
        // „ვნახე" — PATCH განზრახ: POST-ს `permission:` middleware `create`-ად წაიკითხავდა
        /* §8.2 — შეხსენებების **ჟურნალი**. ელფოსტის არხი ამოღებულია, ე.ი.
           „აპი დახურული მქონდა" აღარ ნიშნავს დაკარგულ შეხსენებას: ყოველი
           გასროლა აქ წერია. ⚠️ `due` ამის ნაცვლად რიგს აბრუნებს (რაც უნდა
           ამოხტეს), აქ კი ისტორიაა. */
        Route::get('/note-notifications', [NoteReminderController::class, 'notifications']);
        Route::patch('/note-notifications/{noteNotification}', [NoteReminderController::class, 'markRead']);

        Route::get('/notes', [NoteEntryController::class, 'index']);
        Route::post('/notes', [NoteEntryController::class, 'store']);
        Route::get('/notes/{note}', [NoteEntryController::class, 'show']);
        Route::match(['put', 'patch'], '/notes/{note}', [NoteEntryController::class, 'update']);
        Route::delete('/notes/{note}', [NoteEntryController::class, 'destroy']);
        Route::patch('/notes/{note}/favorite', [NoteEntryController::class, 'toggleFavorite']);
        Route::patch('/notes/{note}/status', [NoteEntryController::class, 'setStatus']);

        /* ატვირთვები (სქრინშოტი/ვიდეო/დოკუმენტი) — კვოტაზე გადის */
        Route::get('/notes/{note}/files', [NoteEntryFileController::class, 'index']);
        Route::post('/notes/{note}/files', [NoteEntryFileController::class, 'store']);
        /* ⚠️ §17.5 — ფაილი **პრივატულ დისკზეა** და მხოლოდ აქედან გაიცემა:
           `/storage/*` მას აღარ ხედავს, ე.ი. URL-ის გამოცნობა არაფერს იძლევა */
        Route::get('/note-files/{noteEntryFile}', [NoteEntryFileController::class, 'show']);
        Route::delete('/note-files/{noteEntryFile}', [NoteEntryFileController::class, 'destroy']);

        /* შეხსენებები (§13.2) */
        Route::get('/notes/{note}/reminders', [NoteReminderController::class, 'index']);
        Route::post('/notes/{note}/reminders', [NoteReminderController::class, 'store']);
    });

    /* ---------- წიგნები (module: book) — Tasks §12 ----------
       გამამდიდრებელი წყარო Open Library-ია: კლავიშს არ ითხოვს, ე.ი. `.env`-ში
       არაფერი ემატება. ნაკადი TMDB-ის იდენტურია — ჯერ კანდიდატები, მერე დრაფტი. */
    Route::middleware(['module:book', 'permission:book'])->group(function () {
        /* წიგნის ჟანრები — per-user ლექსიკონი */
        Route::get('/book-genres', [BookGenreController::class, 'index']);
        Route::post('/book-genres', [BookGenreController::class, 'store']);
        Route::post('/book-genres/reorder', [BookGenreController::class, 'reorder']);
        Route::match(['put', 'patch'], '/book-genres/{bookGenre}', [BookGenreController::class, 'update']);
        Route::delete('/book-genres/{bookGenre}', [BookGenreController::class, 'destroy']);

        Route::get('/books', [BookController::class, 'index']);
        // ⚠️ `{book}`-ზე ზემოთ, თორემ „lookup" id-ად წაიკითხება
        Route::post('/books/lookup/candidates', [BookController::class, 'candidates']);
        Route::post('/books/lookup', [BookController::class, 'lookup']);
        Route::post('/books', [BookController::class, 'store']);
        Route::get('/books/{book}', [BookController::class, 'show']);
        Route::match(['put', 'patch'], '/books/{book}', [BookController::class, 'update']);
        Route::delete('/books/{book}', [BookController::class, 'destroy']);
        Route::patch('/books/{book}/favorite', [BookController::class, 'toggleFavorite']);
        Route::patch('/books/{book}/status', [BookController::class, 'setStatus']);
        Route::patch('/books/{book}/progress', [BookController::class, 'setProgress']);

        /* ფაილები (pdf/epub) და ჩანიშვნები/ციტატები — სექციის ცხრილები */
        Route::get('/books/{book}/files', [BookFileController::class, 'index']);
        Route::post('/books/{book}/files', [BookFileController::class, 'store']);
        Route::delete('/book-files/{bookFile}', [BookFileController::class, 'destroy']);

        Route::get('/books/{book}/notes', [BookNoteController::class, 'index']);
        Route::post('/books/{book}/notes', [BookNoteController::class, 'store']);
        Route::match(['put', 'patch'], '/book-notes/{bookNote}', [BookNoteController::class, 'update']);
        Route::delete('/book-notes/{bookNote}', [BookNoteController::class, 'destroy']);
    });

    /* ---------- სიმღერები (module: song) ----------
       2026-09-03-მდე სიმღერა `videos`-ის რიგი იყო; ახლა საკუთარი მოდულია —
       საიდბარის სექცია, ადმინის გადამრთველი და როლების უფლებები მასზეც. */
    Route::middleware(['module:song', 'permission:song'])->group(function () {
        /* მუსიკის ჟანრები — per-user ლექსიკონი (`video-types`-ის ანალოგი) */
        Route::get('/song-genres', [SongGenreController::class, 'index']);
        Route::post('/song-genres', [SongGenreController::class, 'store']);
        Route::post('/song-genres/reorder', [SongGenreController::class, 'reorder']);
        Route::match(['put', 'patch'], '/song-genres/{songGenre}', [SongGenreController::class, 'update']);
        Route::delete('/song-genres/{songGenre}', [SongGenreController::class, 'destroy']);

        Route::get('/songs', [SongController::class, 'index']);
        // ბმულის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის.
        // ⚠️ უფლება `view`-ია (`VIEW_ENDPOINTS`, Tasks GAP-04) — იხ. `/videos/metadata`.
        Route::post('/songs/metadata', [SongController::class, 'metadata']);
        Route::post('/songs', [SongController::class, 'store']);
        Route::get('/songs/{song}', [SongController::class, 'show']);
        Route::match(['put', 'patch'], '/songs/{song}', [SongController::class, 'update']);
        Route::delete('/songs/{song}', [SongController::class, 'destroy']);
        Route::patch('/songs/{song}/favorite', [SongController::class, 'toggleFavorite']);
        Route::post('/songs/{song}/played', [SongController::class, 'markPlayed']);

        /* §7.4 — ტექსტი, ნოტები, ფოტოები და ჩანიშვნები. სექციის ცხრილები
           (`song_files`/`song_notes`), ზუსტად ვიდეოს ფორმაზე. */
        Route::get('/songs/{song}/files', [SongFileController::class, 'index']);
        Route::post('/songs/{song}/files', [SongFileController::class, 'store']);
        Route::delete('/song-files/{songFile}', [SongFileController::class, 'destroy']);

        Route::get('/songs/{song}/notes', [SongNoteController::class, 'index']);
        Route::post('/songs/{song}/notes', [SongNoteController::class, 'store']);
        Route::match(['put', 'patch'], '/song-notes/{songNote}', [SongNoteController::class, 'update']);
        Route::delete('/song-notes/{songNote}', [SongNoteController::class, 'destroy']);

        /* პლეილისტები — მუსიკის ერთეულია, ე.ი. `song` მოდულში ცხოვრობს */
        Route::get('/playlists', [PlaylistController::class, 'index']);
        Route::post('/playlists', [PlaylistController::class, 'store']);
        // `{playlist}`-ზე ზემოთ, თორემ „reorder" id-ად წაიკითხება
        Route::post('/playlists/reorder', [PlaylistController::class, 'reorder']);
        Route::get('/playlists/{playlist}', [PlaylistController::class, 'show']);
        Route::match(['put', 'patch'], '/playlists/{playlist}', [PlaylistController::class, 'update']);
        Route::delete('/playlists/{playlist}', [PlaylistController::class, 'destroy']);
        // ⚠️ `PUT` განზრახ — POST-ზე `permission:` middleware `create`-ს გამოიყვანდა
        Route::put('/playlists/{playlist}/songs', [PlaylistController::class, 'setSongs']);
        Route::put('/songs/{song}/playlists', [PlaylistController::class, 'setForSong']);
    });

    /* ---------- ბუკმარკები (module: bookmark) — Tasks §18 ----------
       გამამდიდრებელი წყარო არ არსებობს: ერთადერთი probe `POST /bookmarks/metadata`-ა,
       რომელიც თვითონ გვერდის `<head>`-ს კითხულობს (`LinkMetadata`). */
    Route::middleware(['module:bookmark', 'permission:bookmark'])->group(function () {
        /* კატეგორიები — per-user ლექსიკონი */
        Route::get('/bookmark-categories', [BookmarkCategoryController::class, 'index']);
        Route::post('/bookmark-categories', [BookmarkCategoryController::class, 'store']);
        Route::post('/bookmark-categories/reorder', [BookmarkCategoryController::class, 'reorder']);
        Route::match(['put', 'patch'], '/bookmark-categories/{bookmarkCategory}', [BookmarkCategoryController::class, 'update']);
        Route::delete('/bookmark-categories/{bookmarkCategory}', [BookmarkCategoryController::class, 'destroy']);

        Route::get('/bookmarks', [BookmarkController::class, 'index']);
        // ⚠️ `{bookmark}`-ზე ზემოთ, თორემ „metadata" id-ად წაიკითხება.
        // ⚠️ უფლება `view`-ია (`VIEW_ENDPOINTS`, Tasks GAP-04) — იხ. `/videos/metadata`.
        Route::post('/bookmarks/metadata', [BookmarkController::class, 'metadata']);
        Route::post('/bookmarks', [BookmarkController::class, 'store']);
        Route::get('/bookmarks/{bookmark}', [BookmarkController::class, 'show']);
        Route::match(['put', 'patch'], '/bookmarks/{bookmark}', [BookmarkController::class, 'update']);
        Route::delete('/bookmarks/{bookmark}', [BookmarkController::class, 'destroy']);
        Route::patch('/bookmarks/{bookmark}/favorite', [BookmarkController::class, 'toggleFavorite']);
        Route::patch('/bookmarks/{bookmark}/status', [BookmarkController::class, 'setStatus']);
        // ⚠️ „visited" `EnsureModulePermission::UPDATE_ENDPOINTS`-შიც უნდა იყოს,
        // თორემ POST-იდან `create` გამოვიდოდა და view+update უფლება 403-ს მიიღებდა
        Route::post('/bookmarks/{bookmark}/visited', [BookmarkController::class, 'markVisited']);
    });

    /* ---------- კურსები (module: course, FEAT-25) ----------
       ბუკმარკის ზუსტი რეცეპტი: გარე გამამდიდრებელი წყარო არ არსებობს,
       ერთადერთი დახმარება გვერდის probe-ია. */
    Route::middleware(['module:course', 'permission:course'])->group(function () {
        /* კატეგორიები — per-user ლექსიკონი */
        Route::get('/course-categories', [CourseCategoryController::class, 'index']);
        Route::post('/course-categories', [CourseCategoryController::class, 'store']);
        Route::post('/course-categories/reorder', [CourseCategoryController::class, 'reorder']);
        Route::match(['put', 'patch'], '/course-categories/{courseCategory}', [CourseCategoryController::class, 'update']);
        Route::delete('/course-categories/{courseCategory}', [CourseCategoryController::class, 'destroy']);

        Route::get('/courses', [CourseController::class, 'index']);
        // ⚠️ `{course}`-ზე ზემოთ, თორემ „metadata" id-ად წაიკითხება.
        // ⚠️ უფლება `view`-ია (`VIEW_ENDPOINTS`) — ეს ძებნაა და არა შექმნა.
        Route::post('/courses/metadata', [CourseController::class, 'metadata']);
        Route::post('/courses', [CourseController::class, 'store']);
        Route::get('/courses/{course}', [CourseController::class, 'show']);
        Route::match(['put', 'patch'], '/courses/{course}', [CourseController::class, 'update']);
        Route::delete('/courses/{course}', [CourseController::class, 'destroy']);
        Route::patch('/courses/{course}/favorite', [CourseController::class, 'toggleFavorite']);
        Route::patch('/courses/{course}/status', [CourseController::class, 'setStatus']);
        Route::patch('/courses/{course}/progress', [CourseController::class, 'setProgress']);

        /* ფაილები — სერტიფიკატი, ეკრანის ასლი, კონსპექტი */
        Route::get('/courses/{course}/files', [CourseFileController::class, 'index']);
        Route::post('/courses/{course}/files', [CourseFileController::class, 'store']);
        Route::delete('/course-files/{courseFile}', [CourseFileController::class, 'destroy']);
    });

    /* ---------- ადგილები (module: place, FEAT-26) ----------
       წყარო OSM Nominatim-ია: უფასო და გასაღების გარეშე, ე.ი. §12-ის
       `candidates → lookup` ნაკადი აქ ნამდვილად მუშაობს.

       ⚠️ **`lookup`/`candidates` `create`-ის უფლებას ითხოვს** — ზუსტად
       ისევე, როგორც წიგნის, თამაშისა და სამაგიდო თამაშის ანალოგიური
       endpoint-ები (`EnsureModulePermission` POST-იდან `create`-ს გამოიყვანს).
       `VIEW_ENDPOINTS`-ში მათი გადატანა სამ არსებულ მოდულს ჩუმად
       შეუცვლიდა უფლებას, ე.ი. ცალკე გადაწყვეტილებაა და არა ამ ტასქის. */
    Route::middleware(['module:place', 'permission:place'])->group(function () {
        /* კატეგორიები — per-user ლექსიკონი */
        Route::get('/place-categories', [PlaceCategoryController::class, 'index']);
        Route::post('/place-categories', [PlaceCategoryController::class, 'store']);
        Route::post('/place-categories/reorder', [PlaceCategoryController::class, 'reorder']);
        Route::match(['put', 'patch'], '/place-categories/{placeCategory}', [PlaceCategoryController::class, 'update']);
        Route::delete('/place-categories/{placeCategory}', [PlaceCategoryController::class, 'destroy']);

        Route::get('/places', [PlaceController::class, 'index']);
        // ⚠️ `{place}`-ზე ზემოთ, თორემ „countries" id-ად წაიკითხება
        Route::get('/places/countries', [PlaceController::class, 'countries']);
        Route::post('/places/lookup/candidates', [PlaceController::class, 'candidates']);
        Route::post('/places/lookup', [PlaceController::class, 'lookup']);
        Route::post('/places', [PlaceController::class, 'store']);
        Route::get('/places/{place}', [PlaceController::class, 'show']);
        Route::match(['put', 'patch'], '/places/{place}', [PlaceController::class, 'update']);
        Route::delete('/places/{place}', [PlaceController::class, 'destroy']);
        Route::patch('/places/{place}/favorite', [PlaceController::class, 'toggleFavorite']);
        Route::patch('/places/{place}/status', [PlaceController::class, 'setStatus']);

        /* ფაილები — ჩემი გადაღებული ფოტო და თანმხლები დოკუმენტი */
        Route::get('/places/{place}/files', [PlaceFileController::class, 'index']);
        Route::post('/places/{place}/files', [PlaceFileController::class, 'store']);
        Route::delete('/place-files/{placeFile}', [PlaceFileController::class, 'destroy']);
    });

    /* ---------- გალერეა (module: gallery, Tasks 10) ----------
       ფოტოები ფილმებსა და სერიალებს ჰკიდია, ამიტომ კონტროლერი დამატებით
       `hasModule($type)`-საც ამოწმებს — გალერეა ჩართული, ფილმები კი არა,
       სავსებით შესაძლებელი მდგომარეობაა. */
    Route::middleware(['module:gallery', 'permission:gallery'])->group(function () {
        /* §8.3 — მოდულის ფესვი **შეჯამებაა** და აღარ არის „ჩანაწერების სია
           ჩამოსატვირთად": ხაზით გაყოფილი „მასობრივი ჩამოტვირთვის" ბლოკი
           მოიხსნა (user-ის მითითება), ე.ი. იმ სიას გამომძახებელი აღარ ჰყავს. */
        Route::get('/gallery', [GalleryController::class, 'summary']);
        // Tasks §3.2/§3.3 — გალერეა ნამდვილი გვერდია: ჯგუფები და ფოტოები.
        // ⚠️ ყველა `{type}/{id}`-ზე **ზემოთაა**, თორემ „groups"/„photos" ტიპად წაიკითხება.
        Route::get('/gallery/groups', [GalleryController::class, 'groups']);
        Route::get('/gallery/photos', [GalleryController::class, 'photos']);
        // §8.3 — სხვა მოდულების საკუთარი ფოტოები (ყდები, თამბნეილები, ატვირთულები)
        Route::get('/gallery/module-photos', [GalleryController::class, 'modulePhotos']);
        /* §8.2 — **გეგმა მხოლოდ ითვლის** („რამდენ ფოტოს ჩამოტვირთავს ეს
           მასშტაბი") და არაფერს ინახავს, ზუსტად როგორც `GET /videos/bulk-preview`.
           ⚠️ უფლება **`view`**-ია (`VIEW_ENDPOINTS`, Tasks GAP-04): POST-იდან
           გამოყვანილი `create` view-only როლს გეგმას საერთოდ ართმევდა, ხოლო
           update-only როლს — იმის თვლას, რისი ჩამოტვირთვის უფლებაც ჰქონდა. */
        Route::post('/gallery/plan', [GalleryController::class, 'plan']);

        /* §8.1 — ვიდეო-ბმულები იმავე მშობლებზე. ⚠️ `{type}/{id}`-ზე **ზემოთ**
           უნდა იდგეს, თორემ „videos" ტიპად წაიკითხება (იგივე წესი, რაც
           „groups"/„photos"-ს აქვს). */
        Route::get('/gallery/videos', [GalleryVideoController::class, 'index']);
        Route::post('/gallery/videos', [GalleryVideoController::class, 'store']);
        Route::delete('/gallery/videos/{galleryVideo}', [GalleryVideoController::class, 'destroy']);
        /* **ალბომები და ფოტოს გადატანა (Tasks §26).**
           ⚠️ `albums`/`images/move` `{type}/{id}`-ზე **ზემოთ** — იგივე წესი,
           რაც „groups"/„photos"/„videos"-ს აქვს.
           ⚠️ გადატანა `POST`-ია, ე.ი. `EnsureModulePermission` მას ნაგულისხმევად
           `create`-ად კითხულობს — და 2026-09-17-მდე **ზუსტად ასე კითხულობდა**
           (Tasks SEC-07: ძველი კომენტარი „უფლება ცხადად `gallery`-ზეა"-ს
           ამტკიცებდა, რაც მოქმედებას არ ეხებოდა). ⚠️ ბოლო სეგმენტი სიტყვაა
           (`move`), და ის `UPDATE_ENDPOINTS`-შია → `update`. */
        Route::get('/gallery/albums', [GalleryAlbumController::class, 'index']);
        Route::post('/gallery/albums', [GalleryAlbumController::class, 'store']);
        Route::post('/gallery/albums/reorder', [GalleryAlbumController::class, 'reorder']);
        Route::match(['put', 'patch'], '/gallery/albums/{galleryAlbum}', [GalleryAlbumController::class, 'update'])
            ->whereNumber('galleryAlbum');
        Route::delete('/gallery/albums/{galleryAlbum}', [GalleryAlbumController::class, 'destroy'])
            ->whereNumber('galleryAlbum');
        /* **ჩაკეტილი ალბომი (2026-09-16).**
           ⚠️ `unlock` `throttle:album-unlock`-ზეა: პაროლის შემოწმება
           სწორედ ის კარია, რომელსაც სკრიპტი აბრახუნებს — უამისოდ
           ოთხნიშნა პაროლი წუთების საკითხია.
           ⚠️ ორივე `POST`-ია, ბოლო სეგმენტი კი სიტყვაა და არა id, ე.ი.
           `EnsureModulePermission` მოდულს URL-იდან კითხულობს; `unlock`
           `UPDATE_ENDPOINTS`-შია, თორემ view+update user-ს 403 დახვდებოდა. */
        Route::post('/gallery/albums/{galleryAlbum}/unlock', [GalleryAlbumController::class, 'unlock'])
            ->whereNumber('galleryAlbum')
            ->middleware('throttle:album-unlock');
        Route::post('/gallery/albums/{galleryAlbum}/lock', [GalleryAlbumController::class, 'lock'])
            ->whereNumber('galleryAlbum');

        // `images/...` `{type}/{id}`-ზე ზემოთ უნდა იყოს, თორემ „images" ტიპად წაიკითხება
        Route::post('/gallery/images/move', [GalleryController::class, 'moveImages']);
        /* §7.9 — ჩაკეტილი ალბომის ფოტო **პირად დისკზეა**, ე.ი. `/storage/*`
           მას ვერ კითხულობს; ერთადერთი კარი ეს მარშრუტია და ის ლოკსაც
           ამოწმებს (404, არასდროს 403). */
        Route::get('/gallery/images/{galleryImage}/file', [GalleryController::class, 'imageFile']);
        Route::delete('/gallery/images/{galleryImage}', [GalleryController::class, 'destroyImage']);
        Route::post('/gallery/images/{galleryImage}/primary', [GalleryController::class, 'setPrimary']);
        // მსახიობის გალერეა — მშობელი მსახიობია, ე.ი. ფოტო მის გვერდზეც ჩანს
        Route::get('/gallery/cast/{castMember}', [GalleryController::class, 'castShow']);
        Route::post('/gallery/cast/{castMember}', [GalleryController::class, 'castFetch']);
        Route::get('/gallery/{type}/{id}', [GalleryController::class, 'show'])
            ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
        Route::post('/gallery/{type}/{id}', [GalleryController::class, 'fetch'])
            ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
    });

    /* ---------- გაზიარებული: დომენი `type` პარამეტრიდან (`module:@type`) ----------

       ⚠️ **სამივე ჯგუფს უფლება ცხადად უწერია** (აუდიტი 2026-09-14, §A4).
       აქამდე ოთხივე მარშრუტი ერთ `permission:@type`-ში იდგა მოქმედების
       გარეშე, ე.ი. `EnsureModulePermission::actionFor()` მას HTTP მეთოდიდან
       იყვანდა — POST-ზე **`create`**. `/media/sync/{type}/{id}`-ის ბოლო
       სეგმენტი რიცხვია, ე.ი. `UPDATE_ENDPOINTS`-ის ცნობაც არ მუშაობდა.
       შედეგი ორმხრივად მცდარი იყო: როლი „ვქმნი, მაგრამ არ ვცვლი"
       **არსებულ ჩანაწერს გადააწერდა** (`ItemSyncer` overwrite რეჟიმში —
       სათაური, აღწერა, პოსტერი, ჟანრები, მსახიობები), ხოლო როლი
       „ვცვლი, მაგრამ არ ვქმნი" ცრუ 403-ს იღებდა. ზუსტად ის ხაფანგი,
       რომელსაც `/translations/{type}/{id}` და `/media/cast/…` უკვე არიდებენ. */

    // ძებნა და აღმოჩენა მხოლოდ **კითხულობს** — TMDB-ს ეკითხება და არაფერს ინახავს
    Route::middleware(['module:@type', 'permission:@type,view'])->group(function () {
        Route::post('/lookup/candidates', [LookupController::class, 'candidates']);
        Route::post('/lookup', [LookupController::class, 'lookup']);
        Route::get('/discover', [DiscoverController::class, 'index']);
        /* FEAT-18 — ბიბლიოთეკაში უკვე გამოყენებული ტეგები (შემოთავაზებისთვის).
           ⚠️ ლექსიკონის ცხრილი არ არსებობს — სია `tags` სვეტიდან გროვდება,
           `GET /games/franchises`-ის ზუსტი ფორმა. */
        Route::get('/media/tags', [MediaTagController::class, 'index']);
    });

    // სინქრონი **არსებულ ჩანაწერს ცვლის** — ე.ი. `update` და არა `create`
    Route::post('/media/sync/{type}/{id}', [MediaSyncController::class, 'item'])
        ->middleware(['module:@type', 'permission:@type,update'])
        ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');

    /* ---------- სეზონები და ეპიზოდები (FEAT-09) ----------
       ⚠️ **მხოლოდ TV-დომენები** (`MediaDomain::TV_TYPES`): ფილმს სეზონი
       არ აქვს და TMDB-საც `/tv/*`-ზე არაფერი აქვს მასზე.
       ⚠️ **ჩამოტანა `POST`-ია და მონიშვნა `PATCH`.** პირველი მართლა
       **ქმნის** ეპიზოდების რიგებს, მეორე კი არსებულ ჩანაწერს ცვლის —
       POST-ად დაწერილი მონიშვნა `create`-ად იკითხებოდა და მხოლოდ
       რედაქტირების უფლების მქონე როლს ცრუ 403 დაუბრუნდებოდა. */
    Route::get('/media/episodes/{type}/{id}', [EpisodeController::class, 'index'])
        ->middleware(['module:@type', 'permission:@type,view'])
        ->whereIn('type', MediaDomain::TV_TYPES)->whereNumber('id');
    Route::post('/media/episodes/{type}/{id}', [EpisodeController::class, 'store'])
        ->middleware(['module:@type', 'permission:@type,update'])
        ->whereIn('type', MediaDomain::TV_TYPES)->whereNumber('id');
    Route::patch('/media/episodes/{type}/{id}', [EpisodeController::class, 'update'])
        ->middleware(['module:@type', 'permission:@type,update'])
        ->whereIn('type', MediaDomain::TV_TYPES)->whereNumber('id');

    /* ---------- ხელახლა ნახვის ჟურნალი (FEAT-14) ----------
       ⚠️ **უფლება ცხადად წერია** (audit §A4-ის წესი): ბოლო სეგმენტი
       ჩანაწერის **id**-ია და არაფერს ამბობს იმაზე, რა ხდება — ე.ი.
       `EnsureModulePermission` POST-ს `create`-ად წაიკითხავდა, მაშინ
       როცა ნახვის ჩაწერა **არსებულ ჩანაწერს** ეხება.
       ⚠️ **სამივე მედია-დომენი** და არა მხოლოდ TV: ფილმის ხელახლა
       ნახვა ზუსტად ისეთივე ჩვეულებრივი ფაქტია. */
    Route::get('/media/watches/{type}/{id}', [MediaWatchController::class, 'index'])
        ->middleware(['module:@type', 'permission:@type,view'])
        ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
    Route::post('/media/watches/{type}/{id}', [MediaWatchController::class, 'store'])
        ->middleware(['module:@type', 'permission:@type,update'])
        ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
    Route::delete('/media-watches/{mediaWatch}', [MediaWatchController::class, 'destroy'])
        ->whereNumber('mediaWatch');

    /* ---------- ჩანაწერის მსახიობები ხელით (ეტაპი 1) ----------
       ⚠️ **უფლება სამივეწე `update`-ია და არა მეთოდიდან გამოყვანილი.**
       `EnsureModulePermission` POST-იდან `create`-ს და DELETE-იდან `delete`-ს
       გამოიყვანდა, მაშინ როცა მსახიობის მიბმა/მოხსნა **ჩანაწერის
       რედაქტირებაა** — ვინც update-ით შემოვიდა, ცრუ 403-ს მიიღებდა
       (იგივე გადაწყვეტილება, რაც `/translations/{type}/{id}`-ს აქვს). */
    Route::middleware(['module:@type', 'permission:@type,view'])->group(function () {
        Route::get('/media/cast/{type}/{id}', [RecordCastController::class, 'index'])
            ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
    });
    Route::middleware(['module:@type', 'permission:@type,update'])->group(function () {
        Route::post('/media/cast/{type}/{id}', [RecordCastController::class, 'store'])
            ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
        Route::match(['put', 'patch'], '/media/cast/{type}/{id}/{castMember}', [RecordCastController::class, 'update'])
            ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
        Route::delete('/media/cast/{type}/{id}/{castMember}', [RecordCastController::class, 'destroy'])
            ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
    });

    // sync-ის გეგმა ორივე დომენს ერთდროულად ეხება — ფილტრი თავად ითვალისწინებს
    Route::post('/media/sync/plan', [MediaSyncController::class, 'plan']);

    /* ---------- თარგმანები (Tasks 7) ----------
       გეგმა და ჰედერის მრიცხველი ორივე დომენს ერთდროულად ეხება, ჟანრები კი
       გლობალური ლექსიკონია — ამიტომ სამივე `module:` ჯგუფის გარეთ დგას და
       ჩართული მოდულების ფილტრს კონტროლერი თვითონ აკეთებს. */
    Route::get('/translations/summary', [TranslationController::class, 'summary']);
    /* ხარჯის სურათი + ბოლო თარგმანების ლოგი (შენი მითითება, 2026-09-14).
       ⚠️ **GET-ია** — `EnsureModulePermission` POST-ს `create`-ად კითხულობს, ე.ი.
       მხოლოდ მქონე მომხმარებელს „რამდენი დარჩა" არ უნდა არქვებდეს. */
    Route::get('/translations/usage', [TranslationController::class, 'usage']);
    Route::post('/translations/plan', [TranslationController::class, 'plan']);
    // ერთი ჩანაწერის თარგმნა — ჯგუფის გარეთ, რადგან POST-ია, მაგრამ **არსებულს ცვლის**:
    // მოქმედება ცხადად `update`-ია (მისამართის ბოლო სეგმენტი id-ია, ე.ი.
    // `UPDATE_ENDPOINTS`-ის ავტომატური ცნობა აქ არ მუშაობს და `create` გამოვიდოდა).
    /* ⚠️ **`throttle:translate` ორივეზე** (აუდიტი §A1): Gemini-ის უფასო დონე
       ~15 მოთხოვნას უშვებს წუთში და ეს ლიმიტი **მთელი ინსტალაციისაა**.
       ნამდვილ მრიცხველს `TranslationUsage` იცავს; ეს ჭერი იმას აკეთებს,
       რომ ერთმა გაქცეულმა ციკლმა დღიური კვოტა წუთებში არ შეჭამოს. */
    Route::post('/translations/{type}/{id}', [TranslationController::class, 'item'])
        ->middleware(['module:@type', 'permission:@type,update', 'throttle:translate'])
        ->whereIn('type', MediaDomain::TYPES)->whereNumber('id');
    Route::post('/translations/genres', [TranslationController::class, 'genres'])
        ->middleware('throttle:translate');

    /* ---------- დამთხვევები (Tasks 16.2) ----------
       ⚠️ საჯარო პროფილისგან განსხვავებით **ავტორიზებულია**: შედარებას მეორე
       მხარე სჭირდება და ის მიმდინარე user-ია. ორივე პროფილი საჯარო უნდა იყოს
       (არასაჯარო ჩემი მხარე → 409 `profile_not_public`). */
    // „ვისთან ჰგავს ჩემი გემოვნება" — საჯარო პროფილების კატალოგი რეიტინგით.
    // `{username}`-ზე ზემოთ არაა საჭირო (სეგმენტების რაოდენობა სხვაა), მაგრამ
    // აზრობრივად ჯერ სია მოდის და მერე კონკრეტული პროფილი.
    Route::get('/matches', [MatchController::class, 'index']);
    Route::get('/matches/{username}', [MatchController::class, 'show']);
    Route::get('/matches/{username}/{domain}', [MatchController::class, 'items'])
        ->whereIn('domain', PublicDomain::matchable());

    /* ---------- ჩატი (Tasks §16.3) ----------
       ⚠️ `module:` middleware განზრახ არ ეწერება — ჩატი მოდული არაა და
       ბიბლიოთეკის შიგთავს არ ეკითხება. წვდომას **მონაწილეობა** წჿვეტს
       (კონტროლერში, ცხადად), მიწერის უფლებას კი `ChatService`:
       ორივე პროფილი საჯარო + არავინ არავინ დაუბლოკავს. */
    Route::get('/chat', [ChatController::class, 'index']);
    Route::get('/chat/unread', [ChatController::class, 'unread']);
    // `{conversation}`-ზე ზემოთ, თორემ „unread"/„with" id-ად წაიკითხება
    Route::post('/chat/with/{username}', [ChatController::class, 'open']);
    Route::put('/chat/block/{username}', [ChatController::class, 'block']);
    /* მედია (§16.3) — ფაილი **პრივატულ დისკზეა** და მხოლოდ ამ გზით გადის
       გარეთ; მონაწილეობას კონტროლერი ამოწმებს, სხვისი ფაილი 404-ია. */
    Route::get('/chat/files/{message}', [ChatController::class, 'file']);
    Route::delete('/chat/files/{message}', [ChatController::class, 'deleteFile']);
    /* წერილის წაშლა (§4.6) — `scope=self|both`. ⚠️ **რიგი ბაზაში რჩება**
       (აღდგენისთვის), ე.ი. ეს „დამალვაა" და არა `delete`. */
    Route::delete('/chat/messages/{message}', [ChatController::class, 'deleteMessage']);
    /* §10.7/§10.10 — ⚠️ **`PATCH`/`PUT` და არა `POST`**: `EnsureModulePermission`
       POST-ს `create`-ად კითხულობს. ⚠️ ორივე `{conversation}`-ზე
       ზემოთაა, თორემ „messages" საუბრის id-ად წაიკითხება. */
    /* FEAT-13 — „დაამატე ჩემთანაც": გაზიარებული ჩანაწერი მიმღების ბიბლიოთეკაში.
       ⚠️ **ბოლო სეგმენტი `save`-ია და არა `create`**: ჩატის მარშრუტებზე
       `permission:` middleware არ დგას, მაგრამ უფლება კონტროლერში ცხადად
       მოწმდება — შედეგი **ჩანაწერის შექმნაა** და არა წერილის წაკითხვა. */
    Route::post('/chat/messages/{message}/save', [ChatController::class, 'saveRecord']);
    Route::patch('/chat/messages/{message}/pin', [ChatController::class, 'pin']);
    Route::put('/chat/messages/{message}/reaction', [ChatController::class, 'react']);
    Route::get('/chat/{conversation}', [ChatController::class, 'messages']);
    Route::post('/chat/{conversation}', [ChatController::class, 'send']);
    // ⚠️ `PATCH` — POST-ს `permission:` middleware `create`-ად წაიკითხავდა
    Route::patch('/chat/{conversation}/read', [ChatController::class, 'read']);
    // §10.9 — ძებნა ერთ საუბარში (დამალული წერილი არ იძებნება)
    Route::get('/chat/{conversation}/search', [ChatController::class, 'search']);
    // §10.7 — პინების სია; წაშლილი თავისით ცვივა
    Route::get('/chat/{conversation}/pins', [ChatController::class, 'pins']);
    Route::put('/chat/{conversation}/mute', [ChatController::class, 'mute']);
    Route::put('/chat/{conversation}/theme', [ChatController::class, 'theme']);
    Route::put('/chat/{conversation}/nickname', [ChatController::class, 'nickname']);

    /* ---------- ერთი ჩანაწერის ხილვადობა (Tasks 16.1) ----------
       ერთი endpoint რვავე დომენზე. `module:@type`/`permission:@type` აქ
       განზრახ არ ეწერება — `playlist` მოდული არაა (ის `song`-ის შიგნითაა),
       ამიტომ ორივე შემოწმებას კონტროლერი თვითონ აკეთებს `PublicDomain`-ის
       რუკით. `PATCH`: POST-ს `permission:` middleware `create`-ად წაიკითხავდა. */
    Route::patch('/visibility/{domain}/{id}', [VisibilityController::class, 'update'])
        ->whereIn('domain', PublicDomain::keys())->whereNumber('id');

    /* §6.1 — ხილვადობა **პროფილიდან** იმართება და აღარ ჩანაწერიდან, ე.ი.
       სია და მასობრივი გადართვა სჭირდება. ⚠️ `PATCH /{domain}` (მასობრივი) და
       `PATCH /{domain}/{id}` (ერთი) სხვადასხვა სიგრძის გზებია, ე.ი. არ ერევა
       ერთმანეთში — მაგრამ **ორივე `PATCH`-ია** იმავე მიზეზით: `POST`-იდან
       `EnsureModulePermission` `create`-ს გამოიყვანდა. */
    Route::get('/visibility/{domain}', [VisibilityController::class, 'index'])
        ->whereIn('domain', PublicDomain::keys());
    Route::patch('/visibility/{domain}', [VisibilityController::class, 'bulk'])
        ->whereIn('domain', PublicDomain::keys());

    /* ---------- სტატუსების ლექსიკონი (Tasks §6.2/§6.4) ----------
       ერთი endpoint ექვსივე დომენზე — `/visibility/{domain}`-ის ნიმუში.
       ⚠️ `module:@type`/`permission:@type` აქ არ ეწერება: პარამეტრი
       `{domain}`-ია და შემოწმებას (მოდული ჩართულია + უფლება) კონტროლერი
       ცხადად აკეთებს `StatusDomain`-ის რუკით.
       ⚠️ `reorder` **`{id}`-ზე ზემოთაა**, თორემ „reorder" id-ად წაიკითხება. */
    Route::get('/statuses/{domain}', [StatusController::class, 'index'])
        ->whereIn('domain', StatusDomain::keys());
    Route::post('/statuses/{domain}/reorder', [StatusController::class, 'reorder'])
        ->whereIn('domain', StatusDomain::keys());
    // ეტაპი 8 — საიდბარის განლაგება (დამალვა + „ყველა"/„რჩეული"-ს ადგილი)
    Route::put('/statuses/{domain}/sections', [StatusController::class, 'sections'])
        ->whereIn('domain', StatusDomain::keys());
    Route::post('/statuses/{domain}', [StatusController::class, 'store'])
        ->whereIn('domain', StatusDomain::keys());
    Route::match(['put', 'patch'], '/statuses/{domain}/{id}', [StatusController::class, 'update'])
        ->whereIn('domain', StatusDomain::keys())->whereNumber('id');
    Route::delete('/statuses/{domain}/{id}', [StatusController::class, 'destroy'])
        ->whereIn('domain', StatusDomain::keys())->whereNumber('id');

    /* ---------- გაზიარებული ლექსიკონები ---------- */
    Route::get('/genres', [GenreController::class, 'index']);
    Route::post('/genres', [GenreController::class, 'store']);
    Route::match(['put', 'patch'], '/genres/{genre}', [GenreController::class, 'update']);
    // ჟანრი გლობალურია: user-ის წაშლა ადმინთან მიდის (202), super_admin — მაშინვე
    Route::delete('/genres/{genre}', [GenreController::class, 'destroy']);
    Route::get('/genres/{genre}/items', [GenreItemController::class, 'index']);
    Route::post('/genres/{genre}/items', [GenreItemController::class, 'update']);

    /* ეტაპი 1 — მსახიობის ძებნა (ლექსიკონი + TMDB).
       ⚠️ **აუცილებლივ `/cast/{castMember}`-ზე ზემოთ**, თორემ „search"
       იდენტიფიკატორად წაიკითხება (იგივე წესი, რაც `/gallery/{type}/{id}`-ს აცვავს). */
    Route::get('/cast/search', [RecordCastController::class, 'search']);
    Route::get('/cast/{castMember}', [CastController::class, 'show'])->whereNumber('castMember');
    /* §7.5 — მსახიობის საძიებო ტეგები. ⚠️ `cast_members` გლობალური
       ლექსიკონია, ტეგები კი **ჩემია** (`cast_member_tags`, user-ზე).
       ⚠️ `PUT`-ია: მთელი ნაკრების ჩანაცვლებაა და POST `create`-ად იკითხებოდა. */
    Route::put('/cast/{castMember}/tags', [CastController::class, 'updateTags']);
    /* §8.1 — პიროვნების მონაცემები TMDB-დან (ბიოგრაფია, IMDb, ბმულები).
       ⚠️ **`resync` და არა `sync`**: `EnsureModulePermission::UPDATE_ENDPOINTS`
       სწორედ ამ სიტყვას იცნობს, ე.ი. მარშრუტის მოდულის ჯგუფში გადატანა
       მომავალში update-ის უფლებით მოსულს 403-ს არ დაუბრუნებს. */
    Route::post('/cast/{castMember}/resync', [CastController::class, 'resync']);

    /* ---------- ადმინის ზონა ----------
       Tasks 1.6 — სამი სექცია (`users`/`roles`/`requests`) **როლის უფლებაზეა**
       და აღარ არის მყარად `super_admin`-ზე მიბმული; `super_admin` ისედაც
       ყველგან გადის.

       ⚠️ **დანარჩენი განზრახ `super_admin`-ზე რჩება**: `admin/modules`
       (მოდულის გამორთვა **ყველა** ანგარიშს ეხება) და `admin/purge`
       (სხვისი ბიბლიოთეკის წაშლა) ერთი ანგარიშის საზღვრებს სცდება. */
    Route::prefix('admin')->group(function () {
        Route::middleware('admin_access:users')->group(function () {
            Route::get('/users', [AdminUserController::class, 'index']);
            /* **მისანიჭებელი როლების ვიწრო სია (Tasks GAP-10).**
               ⚠️ `GET /admin/roles` `admin_access:roles`-ის უკანაა, ე.ი.
               `admin:users`-ის მქონე ადმინს როლის სელექტი ჩუმად ცარიელი
               რჩებოდა (403). სია აქ მხოლოდ id-სა და სახელს აბრუნებს —
               მატრიცა ამ სექციის უფლებას სცილდება.
               ⚠️ `/users/{user}`-ზე **ზემოთ** არ სჭირდება: მისამართი
               `/admin/assignable-roles`-ია და მას ვერ დაემთხვევა. */
            Route::get('/assignable-roles', [AdminUserController::class, 'roles']);
            // მომხმარებლის შიდა გვერდი — უფლებები, შიგთავსი, დაკავებული ადგილი (K14)
            Route::get('/users/{user}', [AdminUserController::class, 'show']);
            Route::patch('/users/{user}', [AdminUserController::class, 'update']);
            Route::put('/users/{user}/modules', [AdminUserController::class, 'syncModules']);
            Route::delete('/users/{user}', [AdminUserController::class, 'destroy']);
            /* FEAT-16 — ერთჯერადი აღდგენის ბმული. ⚠️ `POST`, რადგან ყოველი
               გამოძახება ახალ ტოკენს ქმნის და ძველს კლავს. */
            Route::post('/users/{user}/reset-link', [AdminUserController::class, 'resetLink']);
        });

        Route::middleware('admin_access:roles')->group(function () {
            /* როლები და უფლებები (Tasks 1.6) */
            Route::get('/roles', [AdminRoleController::class, 'index']);
            Route::post('/roles', [AdminRoleController::class, 'store']);
            Route::match(['put', 'patch'], '/roles/{role}', [AdminRoleController::class, 'update']);
            Route::delete('/roles/{role}', [AdminRoleController::class, 'destroy']);
        });

        /* **აუდიტ-ლოგი (Tasks §4.4/§4.7)** — ნახვა და **ხელით** გასუფთავება.
           ⚠️ წაშლა `DELETE`-ია, ე.ი. `EnsureAdminAccess` მას `delete`
           მოქმედებად კითხულობს: როლს შეიძლება ნახვა ჰქონდეს და წაშლა — არა. */
        Route::middleware('admin_access:audit')->group(function () {
            Route::get('/audit', [AdminAuditController::class, 'index']);
            Route::get('/audit/meta', [AdminAuditController::class, 'meta']);
            // ჭრილების მთვლელები (ეტაპი 10) — ტაბებსა და ბარათებზე რიცხვები.
            // ⚠️ ისიც `GET`-ია, `plan`-ის იმავე მიზეზით.
            Route::get('/audit/summary', [AdminAuditController::class, 'summary']);
            // ⚠️ **`GET` და არა `POST`**: გეგმა კითხვაა, POST-ს კი
            // `EnsureAdminAccess` `create`-ად წაიკითხავდა და მხოლოდ-ნახვის
            // როლი ცრუ 403-ს მიიღებდა (იგივე ხაფანგი, რაც `permission:`-ს აქვს)
            Route::get('/audit/plan', [AdminAuditController::class, 'plan']);
            Route::delete('/audit', [AdminAuditController::class, 'destroy']);
        });

        Route::middleware('admin_access:requests')->group(function () {
            Route::get('/requests', [AdminRequestController::class, 'index']);
            Route::get('/requests/pending-count', [AdminRequestController::class, 'pendingCount']);
            Route::post('/requests/{approvalRequest}/approve', [AdminRequestController::class, 'approve']);
            Route::post('/requests/{approvalRequest}/reject', [AdminRequestController::class, 'reject']);
        });
    });

    /* ---------- სუპერ-ადმინი (გლობალური და დესტრუქციული) ---------- */
    Route::middleware('super_admin')->prefix('admin')->group(function () {
        Route::get('/modules', [AdminModuleController::class, 'index']);
        Route::patch('/modules/{module}', [AdminModuleController::class, 'update']);

        /* მასობრივი წაშლა (Tasks 20) — ორნაბიჯიანი: გეგმა, მერე `confirm=DELETE` */
        Route::post('/purge/plan', [AdminPurgeController::class, 'plan']);
        Route::post('/purge', [AdminPurgeController::class, 'run']);
        /* რიგის ერთი ნაბიჯი (20.2) — ფრონტი ციკლს queue-თი ატარებს */
        Route::post('/purge/item', [AdminPurgeController::class, 'item']);
        /* `ids` სკოუპის ამრჩევი (§25.2) — **სამიზნე ანგარიშის** ჩანაწერები;
           მოდულის თავისი `index()` ყოველთვის მოვალის სიას აბრუნებს. */
        Route::get('/purge/records', [AdminPurgeController::class, 'records']);

        /* **ბაზის დამპი და აღდგენა (Tasks §22)**.
           ⚠️ `super_admin` და არა `admin_access:` — დამპი მთელი ბაზაა
           (ყველა ანგარიში, ჰეშირებული პაროლები, პირადი ჩატები), ე.ი. ერთი
           სექციის უფლება ვერ იქნება; იგივე მსჯელობა, რაც `admin/purge`-ს აქვს.
           ⚠️ `download`/`restore` **`{backup}`-ის ქვემოთაა** — რიგს მნიშვნელობა
           აქვს მხოლოდ იმიტომ, რომ `import` ციფრი არაა და `{backup}`-ად
           წაიკითხებოდა; ამიტომ ის სიაშივე, პარამეტრიან მისამართებამდე დგას. */
        Route::get('/backups', [DatabaseBackupController::class, 'index']);
        Route::post('/backups', [DatabaseBackupController::class, 'store']);
        Route::post('/backups/import', [DatabaseBackupController::class, 'import']);
        Route::get('/backups/{backup}', [DatabaseBackupController::class, 'show'])->whereNumber('backup');
        Route::get('/backups/{backup}/download', [DatabaseBackupController::class, 'download'])->whereNumber('backup');
        Route::post('/backups/{backup}/restore', [DatabaseBackupController::class, 'restore'])->whereNumber('backup');

        /* §11 — ასლის ვიუერი და ნაწილობრივი აღდგენა.
           ⚠️ ყველა `super_admin`-ზეა (ჯგუფის შიგნით), რადგან ვიუერიც
           მთელ ბაზას ახედებს — ეს ერთი სექციის უფლება ვერ იქნება. */
        Route::post('/backups/{backup}/inspect', [DatabaseBackupController::class, 'inspect'])->whereNumber('backup');
        Route::delete('/backups/{backup}/inspect', [DatabaseBackupController::class, 'closeInspect'])->whereNumber('backup');
        Route::get('/backups/{backup}/tables', [DatabaseBackupController::class, 'tables'])->whereNumber('backup');
        Route::get('/backups/{backup}/rows', [DatabaseBackupController::class, 'rows'])->whereNumber('backup');
        Route::post('/backups/{backup}/restore-table', [DatabaseBackupController::class, 'restoreTable'])->whereNumber('backup');
        Route::post('/backups/{backup}/restore-row', [DatabaseBackupController::class, 'restoreRow'])->whereNumber('backup');
        Route::delete('/backups/{backup}', [DatabaseBackupController::class, 'destroy'])->whereNumber('backup');
    });
});
