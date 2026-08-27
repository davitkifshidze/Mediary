<?php

use App\Http\Controllers\Api\CastController;
use App\Http\Controllers\Api\DiscoverController;
use App\Http\Controllers\Api\GenreController;
use App\Http\Controllers\Api\LookupController;
use App\Http\Controllers\Api\MediaController;
use App\Http\Controllers\Api\MovieCollectionController;
use App\Http\Controllers\Api\MovieController;
use App\Http\Controllers\Api\MovieFavoriteController;
use App\Http\Controllers\Api\MovieStatusController;
use App\Http\Controllers\Api\MovieSyncController;
use App\Http\Controllers\Api\SeriesController;
use App\Http\Controllers\Api\SeriesFavoriteController;
use App\Http\Controllers\Api\SeriesStatusController;
use App\Http\Controllers\Api\SeriesSyncController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — Mediary 2.0
|--------------------------------------------------------------------------
| ბაზისო პრეფიქსი: /api  (იხ. bootstrap/app.php)
| ეტაპი 4: CRUD + სტატუსი + რჩეული + TMDB სინქრონი.
*/

Route::get('/health', function () {
    return response()->json([
        'app' => 'mediary-api',
        'status' => 'ok',
        'version' => '0.4.0',
        'time' => now()->toIso8601String(),
    ]);
});

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

// სერიალები — movies-ის ანალოგიური (ფრანჩაიზი/კოლექცია TV-ს არ აქვს)
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

Route::post('/lookup/candidates', [LookupController::class, 'candidates']);
Route::post('/lookup', [LookupController::class, 'lookup']);
Route::get('/genres', [GenreController::class, 'index']);
Route::post('/genres', [GenreController::class, 'store']);
Route::match(['put', 'patch'], '/genres/{genre}', [GenreController::class, 'update']);
Route::delete('/genres/{genre}', [GenreController::class, 'destroy']);
Route::get('/cast/{castMember}', [CastController::class, 'show']);
Route::get('/discover', [DiscoverController::class, 'index']);

// მედიის ხელახლა ჩამოტვირთვა TMDB-დან (პოსტერები + მსახიობთა ფოტოები)
Route::post('/media/redownload', [MediaController::class, 'redownload']);
