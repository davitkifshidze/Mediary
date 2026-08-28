<?php

use App\Http\Controllers\Api\Admin\AdminModuleController;
use App\Http\Controllers\Api\Admin\AdminRequestController;
use App\Http\Controllers\Api\Admin\AdminUserController;
use App\Http\Controllers\Api\ApprovalRequestController;
use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CastController;
use App\Http\Controllers\Api\DiscoverController;
use App\Http\Controllers\Api\GenreController;
use App\Http\Controllers\Api\GenreItemController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\MediaSyncController;
use App\Http\Controllers\Api\ModuleController;
use App\Http\Controllers\Api\MovieCollectionController;
use App\Http\Controllers\Api\MovieController;
use App\Http\Controllers\Api\MovieFavoriteController;
use App\Http\Controllers\Api\MovieStatusController;
use App\Http\Controllers\Api\MovieSyncController;
use App\Http\Controllers\Api\NoteController;
use App\Http\Controllers\Api\SeriesController;
use App\Http\Controllers\Api\SeriesFavoriteController;
use App\Http\Controllers\Api\SeriesStatusController;
use App\Http\Controllers\Api\SeriesSyncController;
use App\Http\Controllers\Api\VideoController;
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

/* ---------- ავტორიზაცია (საჯარო) ---------- */
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {

    /* ---------- ანგარიში ---------- */
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::match(['put', 'patch'], '/auth/profile', [AuthController::class, 'updateProfile']);
    Route::patch('/auth/password', [AuthController::class, 'updatePassword']);
    Route::put('/auth/settings', [AuthController::class, 'updateSettings']);

    /* ---------- მოდულები და მოთხოვნები ---------- */
    Route::get('/modules', [ModuleController::class, 'index']);
    Route::put('/modules/{key}/settings', [ModuleController::class, 'updateSettings']);
    // საკუთარი თავისთვის ჩართვა/გამორთვა (K13) — ჩართვა მხოლოდ უკვე მინიჭებულზე
    Route::patch('/modules/{key}', [ModuleController::class, 'setEnabled']);
    Route::get('/requests', [ApprovalRequestController::class, 'index']);
    Route::post('/requests/module', [ApprovalRequestController::class, 'storeModuleRequest']);
    Route::delete('/requests/{approvalRequest}', [ApprovalRequestController::class, 'destroy']);

    /* ---------- ფილმები (module: movie) ---------- */
    Route::middleware('module:movie')->group(function () {
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
    Route::middleware('module:series')->group(function () {
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

    /* ---------- ვიდეოები (module: video; 18+ ჩანაწერები — `video_adult`) ---------- */
    Route::middleware('module:video')->group(function () {
        Route::get('/videos', [VideoController::class, 'index']);
        // ბმულის მეტამონაცემი ფორმის შესავსებად (K2) — ჩანაწერს არ ქმნის
        Route::post('/videos/metadata', [VideoController::class, 'metadata']);
        Route::post('/videos', [VideoController::class, 'store']);
        Route::get('/videos/{video}', [VideoController::class, 'show']);
        Route::match(['put', 'patch'], '/videos/{video}', [VideoController::class, 'update']);
        Route::delete('/videos/{video}', [VideoController::class, 'destroy']);
        Route::patch('/videos/{video}/favorite', [VideoController::class, 'toggleFavorite']);
        Route::post('/videos/{video}/watched', [VideoController::class, 'markWatched']);
        // private (18+) thumbnail — /storage/* ავტორიზაციას არ ამოწმებს
        Route::get('/videos/{video}/thumb', [VideoController::class, 'thumb'])->name('videos.thumb');

        /* მიმაგრებული ფაილები და ჩანიშვნები (K3) — polymorphic, დღეს ვიდეოებზე */
        Route::get('/videos/{video}/attachments', [AttachmentController::class, 'index']);
        Route::post('/videos/{video}/attachments', [AttachmentController::class, 'store']);
        Route::delete('/attachments/{attachment}', [AttachmentController::class, 'destroy']);
        Route::get('/attachments/{attachment}/file', [AttachmentController::class, 'file'])
            ->name('attachments.file');

        Route::get('/videos/{video}/notes', [NoteController::class, 'index']);
        Route::post('/videos/{video}/notes', [NoteController::class, 'store']);
        Route::match(['put', 'patch'], '/notes/{note}', [NoteController::class, 'update']);
        Route::delete('/notes/{note}', [NoteController::class, 'destroy']);
    });

    /* ---------- გაზიარებული: დომენი `type` პარამეტრიდან (`module:@type`) ---------- */
    Route::middleware('module:@type')->group(function () {
        Route::post('/lookup/candidates', [LookupController::class, 'candidates']);
        Route::post('/lookup', [LookupController::class, 'lookup']);
        Route::get('/discover', [DiscoverController::class, 'index']);
        Route::post('/media/sync/{type}/{id}', [MediaSyncController::class, 'item']);
    });

    // sync-ის გეგმა ორივე დომენს ერთდროულად ეხება — ფილტრი თავად ითვალისწინებს
    Route::post('/media/sync/plan', [MediaSyncController::class, 'plan']);

    /* ---------- გაზიარებული ლექსიკონები ---------- */
    Route::get('/genres', [GenreController::class, 'index']);
    Route::post('/genres', [GenreController::class, 'store']);
    Route::match(['put', 'patch'], '/genres/{genre}', [GenreController::class, 'update']);
    // ჟანრი გლობალურია: user-ის წაშლა ადმინთან მიდის (202), super_admin — მაშინვე
    Route::delete('/genres/{genre}', [GenreController::class, 'destroy']);
    Route::get('/genres/{genre}/items', [GenreItemController::class, 'index']);
    Route::post('/genres/{genre}/items', [GenreItemController::class, 'update']);

    Route::get('/cast/{castMember}', [CastController::class, 'show']);

    /* ---------- სუპერ-ადმინი ---------- */
    Route::middleware('super_admin')->prefix('admin')->group(function () {
        Route::get('/users', [AdminUserController::class, 'index']);
        // მომხმარებლის შიდა გვერდი — უფლებები, შიგთავსი, დაკავებული ადგილი (K14)
        Route::get('/users/{user}', [AdminUserController::class, 'show']);
        Route::patch('/users/{user}', [AdminUserController::class, 'update']);
        Route::put('/users/{user}/modules', [AdminUserController::class, 'syncModules']);
        Route::delete('/users/{user}', [AdminUserController::class, 'destroy']);

        Route::get('/modules', [AdminModuleController::class, 'index']);
        Route::patch('/modules/{module}', [AdminModuleController::class, 'update']);

        Route::get('/requests', [AdminRequestController::class, 'index']);
        Route::get('/requests/pending-count', [AdminRequestController::class, 'pendingCount']);
        Route::post('/requests/{approvalRequest}/approve', [AdminRequestController::class, 'approve']);
        Route::post('/requests/{approvalRequest}/reject', [AdminRequestController::class, 'reject']);
    });
});
