<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Game;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\Series;
use App\Models\Song;
use App\Models\Video;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
        'course' => Course::class,
        'place' => Place::class,
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

        // ჩაურთველი მოდული ქარდადაც არ ჩანს — ისევე, როგორც მენიუში
        $mine = $modules->filter(fn (Module $module) => $user->hasModule($module->key));

        $counts = $this->countsFor($mine->pluck('key')->all());

        $cards = $mine->map(fn (Module $module) => [
            'key' => $module->key,
            'name_ka' => $module->name_ka,
            'name_en' => $module->name_en,
            'icon' => $module->icon,
            'route_base' => $module->route_base,
            // მოდული მთვლელის გარეშე (ჯერ არ აქვს მოდელი) — `null`, არა 0
            'count' => $counts[$module->key] ?? null,
        ])->values();

        return response()->json(['data' => $cards]);
    }

    /**
     * **ყველა მთვლელი ერთ query-ში (Tasks PERF-05).**
     *
     * ⚠️ **ადრე თითო მოდული თითო `SELECT COUNT(*)`-ს იხდიდა** (გალერეა ორს),
     * ე.ი. აპის **საწყისი** გვერდი 13 სერიულ query-ს აკეთებდა თვლაზე. ახლა
     * ისინი ერთი `select`-ის სკალარული ქვე-query-ებია:
     * `select (select count(*) from movies where …) as c0, (…) as c1`.
     *
     * ⚠️ **ქვე-query თვითონ მოდელიდან მოდის** (`$model::query()->toBase()`) და
     * არა ხელით დაწერილი `DB::table()`-იდან. სწორედ ეს ინარჩუნებს global
     * scope-ებს: `owner` (თითოეული მხოლოდ თავისას ითვლის) და `album_lock`
     * (ჩაკეტილი ალბომის ფოტო არც რიცხვში ჩანს). ხელით დაწერილი `where`
     * ორივეს ასლი იქნებოდა და პირველივე ცვლილებაზე დაშორდებოდა.
     *
     * ⚠️ **ფსევდონიმი `c0`, `c1`… და არა მოდულის key** — ერთ მოდულს ორი
     * ცხრილიც შეიძლება ჰქონდეს (`gallery`), ე.ი. key უნიკალური არაა;
     * რომელი რიცხვი რომელი მოდულისაა, `$owner` რუკაში წერია.
     *
     * @param  list<string>  $keys
     * @return array<string, int>
     */
    private function countsFor(array $keys): array
    {
        /** @var array<string, string> $owner ფსევდონიმი => მოდულის key */
        $owner = [];
        $query = DB::query();

        foreach ($keys as $key) {
            $models = self::COUNTERS[$key] ?? null;
            if ($models === null) {
                continue;
            }

            foreach ((array) $models as $model) {
                $alias = 'c'.count($owner);
                $owner[$alias] = $key;
                $query->selectSub($model::query()->toBase()->selectRaw('count(*)'), $alias);
            }
        }

        if ($owner === []) {
            return [];
        }

        $row = (array) $query->first();
        $counts = [];

        foreach ($owner as $alias => $key) {
            $counts[$key] = ($counts[$key] ?? 0) + (int) ($row[$alias] ?? 0);
        }

        return $counts;
    }
}
