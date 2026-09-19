<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\Game;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\Series;
use App\Models\Song;
use App\Models\Video;
use Illuminate\Database\Eloquent\Model;

/**
 * **რომელი ჩანაწერი მიდის კალათაში (FEAT-11).**
 *
 * ⚠️ **ერთი რუკა და არა ათი ადგილას გამეორებული სია** — მიგრაცია,
 * კალათის კონტროლერი, გასუფთავების ბრძანება და `RegistryConsistencyTest`
 * ერთსა და იმავეს კითხულობენ. `MediaDomain`-ის იგივე წესი: `['movie',
 * 'series']` თოთხმეტ ადგილას ეწერა და ერთის გამორჩენა ჩუმი იყო.
 *
 * ⚠️ **გალერეა შიგნით არ არის და ეს გამორჩენა არ არის.** მისი შიგთავსი
 * **ფაილებია** და არა ჩანაწერები (`ExportDomain`-ის იგივე გამიჯვნა), ხოლო
 * ფოტოს „წაშლა" გალერეაში ისედაც მყისიერია — ის ბიბლიოთეკაა და არა ფორმა.
 *
 * ⚠️ **სექციების ცხრილები (`<module>_files`, `<module>_notes`) შიგნით არ
 * არიან**: ისინი მშობელს მიჰყვებიან. კალათაში გადატანა მშობელს **არ**
 * შლის, ე.ი. ფაილებიც და ჩანიშვნებიც ადგილზე რჩება და აღდგენა უფასოა —
 * სწორედ ეს არის მიზეზი, რის გამოც კალათა `delete()` **არაა**.
 */
final class TrashDomain
{
    /**
     * დომენი → მოდელი.
     *
     * @var array<string, class-string<Model>>
     */
    public const MODELS = [
        'movie' => Movie::class,
        'series' => Series::class,
        'anime' => Anime::class,
        'video' => Video::class,
        'song' => Song::class,
        'book' => Book::class,
        'board_game' => BoardGame::class,
        'game' => Game::class,
        'note' => NoteEntry::class,
        'bookmark' => Bookmark::class,
        'course' => Course::class,
        'place' => Place::class,
    ];

    /** რამდენ დღეს ინახება წაშლილი ჩანაწერი */
    public const KEEP_DAYS = 30;

    /** @return list<string> */
    public static function domains(): array
    {
        return array_keys(self::MODELS);
    }

    public static function has(string $domain): bool
    {
        return isset(self::MODELS[$domain]);
    }

    /** @return class-string<Model> */
    public static function model(string $domain): string
    {
        return self::MODELS[$domain];
    }

    /**
     * ცხრილების სია — მიგრაციისთვის.
     *
     * @return list<string>
     */
    public static function tables(): array
    {
        return array_values(array_map(
            fn (string $model) => (new $model)->getTable(),
            self::MODELS,
        ));
    }

    /**
     * ვალიდაციის წესი — `in:movie,series,…`.
     *
     * ⚠️ ჩაწერილი სია `MediaDomain::rule()`-ის იგივე ხაფანგს დაიჭერდა:
     * ახალი მოდული დაემატებოდა და ერთი endpoint ჩუმად 422-ს დააბრუნებდა.
     */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::domains());
    }
}
