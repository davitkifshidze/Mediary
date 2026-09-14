<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
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
    /**
     * მოდულის key → მოდელი (ან მოდელების სია), რომლის ჩანაწერებსაც ითვლის.
     *
     * ⚠️ **სია მხოლოდ `gallery`-ს სჭირდება** და ეს განზრახაა: მისი შიგთავსი
     * ორ ცხრილშია (`gallery_images` + `gallery_videos`, §8.1), ერთი კი
     * მეორეს დამალავდა — მხოლოდ ფოტოების თვლისას ვიდეოებიანი და
     * ფოტოების გარეშე დარჩენილი ბიბლიოთეკა „0"-ს აჩვენებდა, ე.ი. იგივე
     * ჩუმი ხარვეზი, რასაც ეს ბარათი ახლა ასწორებს.
     */
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
        /* ⚠️ `gallery` აქ **არ იყო** და ბარათი `—`-ს აჩვენებდა მაშინაც, როცა
           გალერეა ფოტოებით სავსეა (ნანახი 2026-09-14). მიზეზი დაშვება იყო,
           რომ „გალერეას საკუთარი ჩანაწერი არ აქვს" — აქვს: `gallery_images`
           სწორედ მისი ცხრილია (ერთადერთი გაზიარებული, იხ. `CLAUDE.md`).
           ორივე მოდელი `BelongsToUser`-ია, ე.ი. `owner` scope თვითონ ჭრის. */
        'gallery' => [GalleryImage::class, GalleryVideo::class],
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

            $models = self::COUNTERS[$module->key] ?? null;

            $cards[] = [
                'key' => $module->key,
                'name_ka' => $module->name_ka,
                'name_en' => $module->name_en,
                'icon' => $module->icon,
                'route_base' => $module->route_base,
                // მოდული მთვლელის გარეშე (ჯერ არ აქვს მოდელი) — `null`, არა 0
                'count' => $models === null ? null : $this->countOf($models),
            ];
        }

        return response()->json(['data' => $cards]);
    }

    /**
     * ერთი ან რამდენიმე ცხრილის ჯამი.
     *
     * @param  class-string|array<int, class-string>  $models
     */
    private function countOf(string|array $models): int
    {
        return collect((array) $models)->sum(fn (string $model) => $model::count());
    }
}
