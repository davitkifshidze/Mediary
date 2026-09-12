<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\Bookmark;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Series;
use App\Models\Video;
use Illuminate\Database\Eloquent\Model;

/**
 * **Tasks §6.2/§6.4 — სტატუსი per-user ლექსიკონია.**
 *
 * ერთადერთი რუკა, რომელიც პასუხობს: *რომელ დომენს აქვს მართვადი სტატუსი,
 * რომელი მოდულის ჩართვა სჭირდება, რა მოდელია და რა სტატუსებით იწყებს
 * ახალი ანგარიში.* ექვსი დომენია — ფილმი · სერიალი · ანიმე · **ვიდეო**
 * (რომელსაც სტატუსი აქამდე საერთოდ არ ჰქონდა) · ჩანაწერი · ბუკმარკი.
 *
 * ⚠️ **წიგნი, თამაში და ბორდგეიმი აქ განზრახ არ არის** (მომხმარებლის
 * ჩამონათვალი 2026-09-12). მათი სტატუსი `enum`-ად რჩება, ე.ი.
 * `PurgeService`/`MatchService` **ორივე მექანიზმს ერთდროულად ატარებს** —
 * სწორედ ამიტომ არსებობს `usesDictionary()`, რომ ეს კითხვა ერთ ადგილას
 * იყოს პასუხგაცემული და არა თითო `if`-ში თითოეულ სერვისში.
 *
 * ⚠️ **`role` (`todo`/`doing`/`done`) ლექსიკონის სვეტია და არა დეკორაცია.**
 * სამი ადგილი *მნიშვნელობას* ეკითხება და არა სახელს: `MatchService`
 * („ორივემ ნანახი"), `PurgeService` (სტატუსით ჭრა) და ფრანჩაიზის ბეჯი
 * („ჯერ არ დაწყებული"). ამას **სახელი ვერ უპასუხებს** (ჩემი „ნანახი" და
 * შენი „ვნახე" ერთი და იგივე არაა), `id`-ც ვერა (per-user არის) —
 * როლის გარეშე სამივე **ჩუმად** ჩავარდებოდა.
 */
final class StatusDomain
{
    /** ლექსიკონის სამი მნიშვნელობა — ვალიდაციის ერთადერთი წყარო */
    public const ROLES = ['todo', 'doing', 'done'];

    /** მედია-დომენების საერთო ნაკრები — ვიდეოსაც იგივე ჰქონდეს (ის ხომ იყურება) */
    private const WATCH_DEFAULTS = [
        ['key' => 'undecided', 'name_ka' => 'გადაუწყვეტელი', 'name_en' => 'Undecided', 'role' => 'todo', 'icon' => 'HelpCircle', 'is_default' => true],
        ['key' => 'to_watch', 'name_ka' => 'საყურებელი', 'name_en' => 'To watch', 'role' => 'todo', 'icon' => 'Bookmark'],
        ['key' => 'watching', 'name_ka' => 'ვუყურებ', 'name_en' => 'Watching', 'role' => 'doing', 'icon' => 'Eye'],
        ['key' => 'watched', 'name_ka' => 'ნანახი', 'name_en' => 'Watched', 'role' => 'done', 'icon' => 'CheckCircle2'],
    ];

    /**
     * დომენი → [მოდელი, მოდულის key, საწყისი ნაკრები].
     * თანმიმდევრობა `/dictionaries`-ის გადამრჩევის რიგსაც განსაზღვრავს.
     *
     * @var array<string, array{model: class-string<Model>, module: string, defaults: list<array<string, mixed>>}>
     */
    public const DOMAINS = [
        'movie' => ['model' => Movie::class, 'module' => 'movie', 'defaults' => self::WATCH_DEFAULTS],
        'series' => ['model' => Series::class, 'module' => 'series', 'defaults' => self::WATCH_DEFAULTS],
        'anime' => ['model' => Anime::class, 'module' => 'anime', 'defaults' => self::WATCH_DEFAULTS],
        'video' => ['model' => Video::class, 'module' => 'video', 'defaults' => self::WATCH_DEFAULTS],
        'note' => ['model' => NoteEntry::class, 'module' => 'note', 'defaults' => [
            ['key' => 'open', 'name_ka' => 'ღია', 'name_en' => 'Open', 'role' => 'todo', 'icon' => 'Bookmark', 'is_default' => true],
            ['key' => 'done', 'name_ka' => 'დასრულებული', 'name_en' => 'Done', 'role' => 'done', 'icon' => 'ListChecks'],
            ['key' => 'archived', 'name_ka' => 'დაარქივებული', 'name_en' => 'Archived', 'role' => 'done', 'icon' => 'Wrench'],
        ]],
        'bookmark' => ['model' => Bookmark::class, 'module' => 'bookmark', 'defaults' => [
            ['key' => 'to_read', 'name_ka' => 'წასაკითხი', 'name_en' => 'To read', 'role' => 'todo', 'icon' => 'Bookmark', 'is_default' => true],
            ['key' => 'read', 'name_ka' => 'წაკითხული', 'name_en' => 'Read', 'role' => 'done', 'icon' => 'ListChecks'],
            ['key' => 'archived', 'name_ka' => 'არქივი', 'name_en' => 'Archived', 'role' => 'done', 'icon' => 'Wrench'],
        ]],
    ];

    /**
     * ცხრილი → დომენი. მიგრაციას და `Status::ensureDefaults()`-ს სჭირდება,
     * სადაც მოდელი ჯერ შეიძლება ხელმისაწვდომი არ იყოს.
     *
     * @var array<string, string>
     */
    public const TABLES = [
        'movies' => 'movie',
        'series' => 'series',
        'animes' => 'anime',
        'videos' => 'video',
        'note_entries' => 'note',
        'bookmarks' => 'bookmark',
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::DOMAINS);
    }

    /** ამ დომენს მართვადი სტატუსი აქვს? (წიგნი/თამაში/ბორდგეიმი — არა) */
    public static function usesDictionary(?string $domain): bool
    {
        return $domain !== null && isset(self::DOMAINS[$domain]);
    }

    /** @return class-string<Model> */
    public static function model(string $domain): string
    {
        return self::DOMAINS[$domain]['model'];
    }

    public static function module(string $domain): string
    {
        return self::DOMAINS[$domain]['module'];
    }

    /** @return list<array<string, mixed>> */
    public static function defaults(string $domain): array
    {
        return self::DOMAINS[$domain]['defaults'];
    }

    /** საწყისი ნაკრების გასაღებები — `PurgeService::TARGET_STATUSES`-ის წყარო */
    public static function defaultKeys(string $domain): array
    {
        return array_column(self::defaults($domain), 'key');
    }

    /** `Illuminate\Validation\Rule::in()`-ის ანალოგი დომენის სახელისთვის */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::keys());
    }
}
