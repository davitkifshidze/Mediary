<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Game;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Series;
use App\Models\Song;
use App\Models\Video;
use Illuminate\Http\Request;

/**
 * დეშბორდი (Tasks 2) — მთავარი გვერდის ქარდები.
 *
 * ერთი მოთხოვნა თითო მოდულზე ცალკე რექვესთის ნაცვლად. მთვლელები
 * `BelongsToUser`-ის `owner` scope-ზე გადის, ე.ი. თითოეული მხოლოდ თავისას ითვლის.
 * გადაწყდა (19.10): **ჯერ მხოლოდ რაოდენობა** — სტატუსებად დაშლა მოგვიანებით.
 */
class DashboardController extends Controller
{
    /** მოდულის key → მოდელი, რომლის ჩანაწერებსაც ითვლის */
    private const COUNTERS = [
        'movie' => Movie::class,
        'series' => Series::class,
        'anime' => Anime::class,
        'video' => Video::class,
        'song' => Song::class,
        'book' => Book::class,
        'board_game' => BoardGame::class,
        'game' => Game::class,
        // ⚠️ §13/§18 — ორივე აქ **გამორჩენილი იყო** და ბარათი მთვლელის გარეშე
        // იხატებოდა (`count: null`). შეცდომა ჩუმია: მოდული ჩანს, რიცხვი კი არა.
        'note' => NoteEntry::class,
        'bookmark' => Bookmark::class,
    ];

    public function index(Request $request)
    {
        $user = $request->user();

        $modules = Module::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $cards = [];

        foreach ($modules as $module) {
            // ჩაურთველი მოდული ქარდადაც არ ჩანს — ისევე, როგორც მენიუში
            if (! $user->hasModule($module->key)) {
                continue;
            }

            $model = self::COUNTERS[$module->key] ?? null;

            $cards[] = [
                'key' => $module->key,
                'name_ka' => $module->name_ka,
                'name_en' => $module->name_en,
                'icon' => $module->icon,
                'route_base' => $module->route_base,
                // მოდული მთვლელის გარეშე (ჯერ არ აქვს მოდელი) — `null`, არა 0
                'count' => $model ? $model::count() : null,
            ];
        }

        return response()->json(['data' => $cards]);
    }
}
