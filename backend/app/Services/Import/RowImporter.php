<?php

namespace App\Services\Import;

use App\Models\Book;
use App\Models\Game;
use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use App\Services\Books\OpenLibraryClient;
use App\Services\Enrichment\MovieEnricher;
use App\Services\Games\RawgClient;
use App\Services\Tmdb\TmdbClient;
use App\Support\AppTime;
use App\Support\ImportSource;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * **FEAT-07 — ერთი რიგი → ერთი ჩანაწერი.**
 *
 * ⚠️ **ერთეულის ბიჯი და არა მთელი ფაილის ციკლი.** 800 ფილმი 800 TMDB-
 * გამოძახებაა, `artisan serve` კი ერთნაკადიანია — სწორედ ამიტომ არის
 * სინქრონი, გალერეა და `/purge` per-item რიგები. იმპორტიც იმავე რიგში
 * ჯდება, ე.ი. პროგრესიც ჩანს, გაჩერებაც შეიძლება და `syncDelayMs`-ის
 * პაუზაც მოქმედებს.
 *
 * ⚠️ **დუბლი აქ თავიდან მოწმდება.** გეგმა წუთებით ადრე აიგო; მართალი
 * პასუხი მხოლოდ ჩაწერის მომენტშია — „გამოტოვებული" სერვერის სიტყვაა.
 *
 * ⚠️ **ჟანრი/კატეგორია არ ივსება და ეს შეგნებულია.** „სტატუსი და ტიპი
 * სავალდებულოა" **ფორმის** წესია (`validated()`-ის `$must`) და არა სქემის
 * შეზღუდვა; `POST /{domain}/from-tmdb` — ერთი დაჭერით დამატება აღმოჩენიდან —
 * ზუსტად ასევე გვერდს უვლის მას. ფილმზე ჟანრებს TMDB ავსებს, წიგნზე კი
 * ჟანრი **per-user ლექსიკონია**, ე.ი. Goodreads-ის თაროს მასზე გადაბმა
 * გამოცნობა იქნებოდა. სტატუსი — ანუ ის ნახევარი, რომელიც ფაილშია — ივსება.
 */
class RowImporter
{
    public function __construct(
        private readonly TmdbClient $tmdb,
        private readonly MovieEnricher $enricher,
        private readonly OpenLibraryClient $openLibrary,
        private readonly RawgClient $rawg,
    ) {}

    /**
     * @param  array<string, mixed>  $row  `ImportPlanner`-ის ნორმალიზებული ერთეული
     * @return array{ok: bool, skipped: bool, error: ?string, id: ?int, title: ?string}
     */
    public function import(User $user, string $source, array $row): array
    {
        return match (ImportSource::module($source)) {
            'book' => $this->book($user, $row),
            'game' => $this->game($user, $row),
            default => $this->movie($user, $row),
        };
    }

    /* ---------- ფილმი (Letterboxd · IMDb) ---------- */

    private function movie(User $user, array $row): array
    {
        if (! $this->enricher->configured()) {
            return $this->fail('tmdb_not_configured');
        }

        /* ⚠️ ჯერ `imdb_id` და მერე ძებნა: პირველი **ზუსტია**, მეორე
           ვარაუდი. შებრუნებული რიგი ზუსტ id-ს გამოუსადეგარს ხდიდა. */
        $tmdbId = $row['imdb_id']
            ? $this->tmdb->findByImdb((string) $row['imdb_id'])
            : null;

        $tmdbId ??= $row['title'] ? $this->tmdb->search((string) $row['title'], $row['year'] ?: null) : null;

        if (! $tmdbId) {
            return $this->fail('not_found');
        }

        $existing = Movie::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->where('tmdb_id', $tmdbId)
            ->first();

        if ($existing) {
            return ['ok' => true, 'skipped' => true, 'error' => null, 'id' => $existing->id, 'title' => $existing->title_en];
        }

        $movie = new Movie(['tmdb_id' => $tmdbId, 'user_id' => $user->getKey()]);
        $movie->imdb_id = $row['imdb_id'] ?: null;
        $movie->save();

        try {
            $this->enricher->enrichMovie($movie);
        } catch (Throwable) {
            // ⚠️ ნაწილობრივი ჩანაწერიც ჩანაწერია — `/sync`-ს მერე შეუძლია შეავსოს
            $movie->sync_status = 'partial';
        }

        $this->applyRating($movie, $row);
        $this->applyRole($movie, $user, 'movie', $row);
        $movie->save();

        return ['ok' => true, 'skipped' => false, 'error' => null, 'id' => $movie->id, 'title' => $movie->title_en];
    }

    /* ---------- წიგნი (Goodreads) ---------- */

    private function book(User $user, array $row): array
    {
        $draft = $row['isbn'] ? $this->openLibrary->byIsbn((string) $row['isbn']) : null;

        if (! $draft && $row['title']) {
            $query = trim($row['title'].' '.($row['author'] ?? ''));
            $draft = $this->openLibrary->search($query, 1)[0] ?? null;
        }

        if (! $draft) {
            /* ⚠️ „წყარო არ პასუხობს" და „ვერ ვიპოვე" სხვადასხვა პასუხია
               (`bgg_unavailable`-ის წესი) — თორემ ერთი ტაიმაუტი მთელ
               ფაილს „ასეთი წიგნები არ არსებობს"-ად წარმოაჩენდა. */
            return $this->fail($this->openLibrary->blocked() ? 'openlibrary_unavailable' : 'not_found');
        }

        $book = new Book([
            'user_id' => $user->getKey(),
            // ⚠️ ფაილის სათაური უპირატესია: მომხმარებელმა თვითონ ჩაწერა ის, რაც აქვს
            'title_en' => $row['title'] ?: ($draft['title'] ?? null),
            'author' => $row['author'] ?: ($draft['author'] ?? null),
            'year' => $row['year'] ?: ($draft['year'] ?? null),
            'isbn' => $row['isbn'] ?: ($draft['isbn'] ?? null),
            'pages' => $draft['pages'] ?? null,
            'publisher' => $draft['publisher'] ?? null,
            'language' => $draft['language'] ?? null,
            'description_en' => $draft['description'] ?? null,
            'openlibrary_id' => $draft['key'] ?? null,
            'status' => $row['status'] ?: 'to_read',
        ]);

        /* ⚠️ **ყდა არ ჩამოიტვირთება, მხოლოდ მისამართი ინახება.** 500 წიგნი
           500 სურათის ჩამოტვირთვა იქნებოდა ერთი რიგის შიგნით; Open Library-ის
           ყდა კი ისედაც საჯაროა და ბარათი `cover_path ?: cover_url`-ს ხატავს.
           ჩამოტვირთვა ჩანაწერის შენახვისას მაინც მოხდება, თუ დასჭირდა. */
        if ($coverId = $draft['cover_id'] ?? null) {
            $book->cover_url = "https://covers.openlibrary.org/b/id/{$coverId}-L.jpg";
        }

        $this->applyRating($book, $row, 10);
        $book->save();

        return ['ok' => true, 'skipped' => false, 'error' => null, 'id' => $book->id, 'title' => $book->title_en];
    }

    /* ---------- თამაში (Steam) ---------- */

    private function game(User $user, array $row): array
    {
        if (! $this->rawg->configured()) {
            return $this->fail('rawg_unavailable');
        }

        /* ⚠️ **`appid` აქ არ იძებნება და ეს RAWG-ის უფასო API-ის შეზღუდვაა** —
           Steam-ის id-ით პირდაპირი ძებნა მას არ აქვს, ამიტომ სახელით ვეძებთ.
           `appid` მაინც მოგვაქვს: ის ერთადერთია, რაც ორ რიგს ერთმანეთისგან
           გამოარჩევს, როცა სახელები ემთხვევა. */
        $found = $row['title'] ? ($this->rawg->search((string) $row['title'], 1)[0] ?? null) : null;

        if (! $found) {
            return $this->fail($this->rawg->blocked() ? 'rawg_unavailable' : 'not_found');
        }

        $draft = $this->rawg->details((int) $found['rawg_id']) ?? $found;

        $game = new Game([
            'user_id' => $user->getKey(),
            'title_en' => $draft['title_en'] ?? $row['title'],
            'release_date' => $draft['release_date'] ?? null,
            'description_en' => $draft['description_en'] ?? null,
            'developer' => $draft['developer'] ?? null,
            'publisher' => $draft['publisher'] ?? null,
            'platforms' => $draft['platforms'] ?? null,
            'metacritic' => $draft['metacritic'] ?? null,
            'users_score' => $draft['users_score'] ?? null,
            'cover_url' => $draft['cover_url'] ?? null,
            'rawg_id' => $draft['rawg_id'] ?? null,
            'rawg_slug' => $draft['rawg_slug'] ?? null,
        ]);

        $game->save();

        return ['ok' => true, 'skipped' => false, 'error' => null, 'id' => $game->id, 'title' => $game->title_en];
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * შეფასება — უკვე 1–10-ზეა გადაყვანილი (`ImportSource::rating()`).
     *
     * ⚠️ `$decimals = 0` წიგნზე, რადგან `books.rating` **integer**-ია;
     * ფილმზე კი `decimal:1`. ერთი მრგვალება ორივეზე ან ნახევარვარსკვლავს
     * კარგავდა, ან ბაზაში ჩუმად იჭრებოდა.
     */
    private function applyRating(Movie|Book $record, array $row, int $decimals = 1): void
    {
        if ($row['rating'] !== null) {
            $record->rating = $decimals === 0 ? (int) round((float) $row['rating']) : (float) $row['rating'];
        }
    }

    /**
     * სტატუსი **როლით** და არა სახელით.
     *
     * ⚠️ სტატუსი per-user ლექსიკონია (§6.4): ჩემი „ნანახი" და შენი „ვნახე"
     * ერთი და იგივეა, გასაღები კი სხვა. ერთადერთი, რითიც გარე ფაილს
     * შეიძლება ვუპასუხოთ, `role`-ია — ზუსტად ის სვეტი, რომლის გამოც
     * `MatchService` და `PurgeService` მუშაობს.
     *
     * ⚠️ `applyStatus()`-ით და არა `status_id`-ის პირდაპირი ჩაწერით —
     * `watched_at` მხოლოდ იქ ივსება (BUG-05-ის გაკვეთილი).
     */
    private function applyRole(Movie $record, User $user, string $domain, array $row): void
    {
        if (! $row['status']) {
            return;
        }

        Status::ensureDefaults($user->getKey(), $domain);

        $status = Status::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->where('module', $domain)
            ->where('role', $row['status'])
            ->ordered()
            ->first();

        if (! $status) {
            return;
        }

        $record->applyStatus($status);

        /* ⚠️ ფაილის თარიღი `applyStatus()`-ის „ახლა"-ს ცვლის: „როდის ვნახე"
           სწორედ ის ინფორმაციაა, რისთვისაც ექსპორტი არსებობს. არასწორ
           თარიღს ვტოვებთ ცარიელად და არა დღევანდელს. */
        if ($row['done_at'] && ($moment = $this->moment((string) $row['done_at']))) {
            $record->watched_at = $moment;
        }
    }

    private function moment(string $raw): ?string
    {
        try {
            /* ⚠️ ზონა ცხადად აპლიკაციისაა (§8): უზონო სტრიქონს Carbon
               ნაგულისხმევ ზონაში კითხულობს და `AppTime`-ის მთელი აზრი
               სწორედ ის არის, რომ ეს კითხვა ერთ ადგილას პასუხდებოდეს. */
            return Carbon::parse($raw, AppTime::zone())->format('Y-m-d H:i:s');
        } catch (Throwable) {
            return null;
        }
    }

    /** @return array{ok: bool, skipped: bool, error: ?string, id: ?int, title: ?string} */
    private function fail(string $error): array
    {
        return ['ok' => false, 'skipped' => false, 'error' => $error, 'id' => null, 'title' => null];
    }
}
