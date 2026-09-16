<?php

namespace App\Support;

use App\Models\GalleryAlbum;
use Illuminate\Contracts\Session\Session;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * **ჩაკეტილი ალბომი — ერთი პასუხი კითხვაზე „ეს ფოტო ჩანს თუ არა" (2026-09-16).**
 *
 * ალბომს პაროლი ედება (`gallery_albums.password_hash`); სანამ ის ამ სესიაში
 * არ გაიხსნა, მისი ფოტოები **სერვერიდან საერთოდ არ გამოდის** — არც სიაში,
 * არც ესკიზებში, არც შეჯამების რიცხვში.
 *
 * ⚠️ **CSS-ის blur პასუხი არ არის და სწორედ ამიტომ არსებობს ეს კლასი.**
 * დაბუნდოვნებული `<img>` მაინც ჩამოტვირთულ ფაილს აჩვენებს: devtools-ში
 * კლასის მოხსნა ან `src`-ის გახსნა ერთი კლიკია. ე.ი. ერთადერთი ნამდვილი
 * ლოკი სერვერზეა — რაც პასუხში არ მოვიდა, იმას ინსპექტორი ვერ იპოვის.
 *
 * ⚠️ **გახსნა სესიაშია და არა ბრაუზერში.** ტოკენი რომ კლიენტს მიგვეცა,
 * ის localStorage-ში/devtools-ში ისევ სანახავი იქნებოდა და „გახსნილობა"
 * ბრაუზერის გადატვირთვასაც გადაურჩებოდა. სესია სერვერზე წერია, გასვლისას
 * თავისით ქრება და კლიენტს ხელში არაფერი რჩება.
 *
 * ⚠️ **სესია `/api`-ზე მხოლოდ stateful მოთხოვნას აქვს** (Sanctum-ის cookie
 * რეჟიმი) — `AuthController`-ის გაკვეთილი: დაუცველი `session()` სხვა
 * კლიენტს 500-ს აძლევს. ამიტომ ყველა წვდომა `hasSession()`-ზე გადის და
 * სესიის გარეშე პასუხი ყოველთვის „ჩაკეტილია".
 *
 * ⚠️ **მემოიზაცია აუცილებელია და არა ოპტიმიზაცია**: global scope ყოველ
 * `GalleryImage` query-ზე ირთვება, ე.ი. ერთი გვერდი ათობით ერთნაირ
 * `select`-ს გააკეთებდა. სტატიკურია, ამიტომ ტესტებში `setUp()` ასუფთავებს.
 */
final class AlbumLock
{
    /** სესიის გასაღები — გახსნილი ალბომების id-ები */
    public const SESSION_KEY = 'gallery.unlocked_albums';

    /**
     * @var array<string, list<int>> „user + ამ სესიაში გახსნილები" => დამალულები
     *
     * ⚠️ **გასაღებში გახსნილებიც წერია და ეს შეცდომაზე ნასწავლია.** მარტო
     * `user_id` რომ ყოფილიყო, ერთ პროცესში მომდევნო მოთხოვნა წინას პასუხს
     * მიიღებდა — ტესტებში (და Octane-ზე) ეს იმას ნიშნავდა, რომ ეს-ესაა
     * დადებული პაროლი შემდეგ მოთხოვნაზე **არ მოქმედებდა**. ახლა ქეში
     * თვითონვე ბათილდება: სხვა გახსნილობა = სხვა გასაღები.
     */
    private static array $memo = [];

    /** ტესტებისა და ხანგრძლივი პროცესებისთვის */
    public static function flush(): void
    {
        self::$memo = [];
    }

    /**
     * ამ user-ის ჩაკეტილი ალბომები, რომლებიც ამ სესიაში **არ** გახსნილა.
     *
     * ⚠️ `Auth::id()`-ის გარეშე (CLI, seeder) სია ცარიელია — ე.ი. ბრძანება
     * ყველაფერს ხედავს, ზუსტად ისე, როგორც `owner` scope-ია გამორთული.
     *
     * @return list<int>
     */
    public static function hiddenIds(): array
    {
        $userId = Auth::id();
        if (! $userId) {
            return [];
        }

        $open = self::unlockedIds();
        $key = $userId.':'.implode(',', $open);

        if (! isset(self::$memo[$key])) {
            $locked = GalleryAlbum::query()
                ->withoutGlobalScope('owner')
                ->where('user_id', $userId)
                ->whereNotNull('password_hash')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            self::$memo[$key] = array_values(array_diff($locked, $open));
        }

        return self::$memo[$key];
    }

    /** @return list<int> */
    public static function unlockedIds(): array
    {
        $session = self::session();
        if (! $session) {
            return [];
        }

        return array_values(array_map('intval', (array) $session->get(self::SESSION_KEY, [])));
    }

    public static function isUnlocked(GalleryAlbum $album): bool
    {
        return ! $album->isLocked() || in_array((int) $album->id, self::unlockedIds(), true);
    }

    /** პაროლი სწორია — ეს ალბომი ამ სესიაში ღიაა */
    public static function unlock(GalleryAlbum $album): void
    {
        $session = self::session();
        if (! $session) {
            return;
        }

        $ids = self::unlockedIds();
        $ids[] = (int) $album->id;
        $session->put(self::SESSION_KEY, array_values(array_unique($ids)));
        self::flush();
    }

    /** „ისევ ჩაკეტე" — ერთი ალბომი ან (id-ის გარეშე) ყველა */
    public static function lock(?GalleryAlbum $album = null): void
    {
        $session = self::session();
        if (! $session) {
            return;
        }

        $session->put(
            self::SESSION_KEY,
            $album ? array_values(array_diff(self::unlockedIds(), [(int) $album->id])) : [],
        );
        self::flush();
    }

    /**
     * სესია — მხოლოდ მაშინ, როცა ის მართლა არსებობს.
     *
     * ⚠️ `request()->hasSession()` და არა `session()` პირდაპირ: `/api`-ზე
     * არა-stateful კლიენტს სესია არ აქვს და დაუცველი გამოძახება 500-ს იძლევა.
     */
    private static function session(): ?Session
    {
        $request = app()->bound('request') ? app(Request::class) : null;

        return $request && $request->hasSession() ? $request->session() : null;
    }
}
