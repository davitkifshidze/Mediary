<?php

namespace App\Console\Commands;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\BoardGameGenre;
use App\Models\Book;
use App\Models\BookGenre;
use App\Models\Bookmark;
use App\Models\BookmarkCategory;
use App\Models\Game;
use App\Models\GameGenre;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Models\Series;
use App\Models\Song;
use App\Models\SongGenre;
use App\Models\Status;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoType;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

/**
 * **საჩვენებელი მონაცემები — კომიტებული dump-ის ნაცვლად** (Tasks FEAT-02).
 *
 * ⚠️ **რატომ არსებობს:** SEC-01-მდე „სწრაფი აწყობა" პროდ-dump-ს ეყრდნობოდა,
 * რომელიც პაროლის ჰეშებს, სესიებს, პირად ჩატსა და ტოკენს შეიცავდა. dump-ის
 * ამოღების შემდეგ ახალი კლონი **სრულიად ცარიელ** აპს იღებდა: მოდულები
 * ჩანდა, შიგნით კი არაფერი — ე.ი. ვერც დაათვალიერებდი და ვერც შეამოწმებდი.
 *
 * ⚠️ **ყველა ჩანაწერი სინთეზურია.** არც ერთი სახელი, ელფოსტა ან ბმული
 * რეალურ ადამიანს ან ანგარიშს არ ეკუთვნის, ელფოსტა `example.com`-ზეა
 * (RFC 2606) და გარე წყაროს არც ერთი id არ ჩნდება — ე.ი. ამ ბრძანების
 * შედეგი, dump-ისგან განსხვავებით, პერსონალურ მონაცემს არ შეიცავს.
 *
 * ⚠️ **პროდუქციაზე დადასტურებას ითხოვს** (`ConfirmableTrait`): ბრძანება
 * ანგარიშს **ცნობილი პაროლით** ქმნის — სერვერზე შემთხვევითი გაშვება
 * უკანა კარს გააღებდა.
 *
 * ⚠️ **ჩანაწერები მოდელით იქმნება და არა API-ით**: `HasStatus`-ის `creating`
 * ჰუკი ნაგულისხმევ სტატუსს თვითონ აყენებს, ლექსიკონები კი `ensureDefaults()`-ით
 * ივსება — ე.ი. შედეგი იმავე წესებს ემორჩილება, რასაც ფორმები.
 */
class SeedDemoCommand extends Command
{
    use ConfirmableTrait;

    protected $signature = 'mediary:seed-demo
        {--email=demo@example.com : დემო-ანგარიშის ელფოსტა}
        {--password=demo-password : პაროლი}
        {--force : დადასტურების გარეშე პროდუქციაზეც}';

    protected $description = 'ქმნის დემო-ანგარიშს და თითო მოდულზე რამდენიმე სინთეზურ ჩანაწერს';

    public function handle(): int
    {
        if (! $this->confirmToProceed()) {
            return self::FAILURE;
        }

        if (! Module::exists()) {
            $this->error('modules ცხრილი ცარიელია — ჯერ `php artisan migrate --seed`.');

            return self::FAILURE;
        }

        $user = $this->demoUser();

        /* ⚠️ **`Auth::setUser()` აქაც აუცილებელია** (იგივე, რაც `RunBatchItem`-ში):
           `BelongsToUser`-ის global scope `Auth::id()`-ს კითხულობს, ე.ი. CLI-ზე
           ის გამორთულია და ჩანაწერები `user_id`-ის გარეშე დაიბადებოდა. */
        Auth::setUser($user);

        $made = 0;

        foreach ($this->seeders() as $module => $seed) {
            $count = $seed($user);
            $made += $count;

            $this->line(sprintf('  %-12s %s', $module, $count > 0 ? "+{$count}" : 'უკვე შევსებულია'));
        }

        $this->line('');
        $this->info('✔ დემო მზადაა: '.$user->email.' / '.$this->option('password'));
        $this->line("  ახალი ჩანაწერები: {$made}");
        $this->line('  ⚠️ პაროლი ცნობილია — საჯარო ინსტალაციაზე შეცვალე ან წაშალე ეს ანგარიში.');

        return self::SUCCESS;
    }

    /* ---------- ანგარიში ---------- */

    private function demoUser(): User
    {
        $email = (string) $this->option('email');
        $existing = User::where('email', $email)->first();

        if ($existing) {
            $this->line("დემო-ანგარიში უკვე არსებობს: {$email}");
            $this->attachModules($existing);

            return $existing->refresh();
        }

        $user = User::create([
            'name' => 'Demo User',
            'username' => 'demo',
            'email' => $email,
            'password' => Hash::make((string) $this->option('password')),
        ]);
        $user->forceFill(['is_active' => true])->save();

        $this->attachModules($user);

        return $user->refresh();
    }

    private function attachModules(User $user): void
    {
        $ids = Module::where('is_active', true)
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();

        $user->modules()->syncWithoutDetaching($ids);
    }

    /* ---------- ჩანაწერები ---------- */

    /**
     * ⚠️ **თითო მოდული = თითო ჩამკეტი**, რომ ახალი მოდულის დამატება ერთ
     * რიგად დარჩეს; თითოეული **უკვე შევსებულს ტოვებს** (`already()`), ე.ი.
     * ბრძანების ხელახლა გაშვება დუბლიკატებს არ ქმნის.
     *
     * @return array<string, callable(User): int>
     */
    private function seeders(): array
    {
        return [
            'movie' => fn (User $u) => $this->media($u, Movie::class, 'movie', [
                ['ka' => 'ქალაქის შუქები', 'en' => 'City Lights', 'year' => 1931],
                ['ka' => 'მეშვიდე ბეჭედი', 'en' => 'The Seventh Seal', 'year' => 1957],
                ['ka' => 'მზის ჩასვლის ბულვარი', 'en' => 'Sunset Boulevard', 'year' => 1950],
            ]),
            'series' => fn (User $u) => $this->media($u, Series::class, 'series', [
                ['ka' => 'დემო-სერიალი', 'en' => 'Demo Series', 'year' => 2021],
                ['ka' => 'მეორე სეზონი', 'en' => 'Second Season', 'year' => 2023],
            ]),
            'anime' => fn (User $u) => $this->media($u, Anime::class, 'anime', [
                ['ka' => 'დემო-ანიმე', 'en' => 'Demo Anime', 'year' => 2019],
            ]),

            'video' => function (User $u) {
                if ($this->already(Video::class)) {
                    return 0;
                }

                VideoType::ensureDefaults($u->id);
                Status::ensureDefaults($u->id, 'video');
                $type = VideoType::orderBy('sort_order')->first();

                foreach ([
                    ['ლექცია ისტორიაზე', 'https://youtu.be/dQw4w9WgXcQ'],
                    ['რეცეპტი: ხაჭაპური', 'https://vimeo.com/76979871'],
                ] as [$title, $url]) {
                    Video::create([
                        'title' => $title,
                        'url' => $url,
                        'type_id' => $type?->id,
                        'tags' => ['დემო'],
                    ]);
                }

                return 2;
            },

            'song' => function (User $u) {
                if ($this->already(Song::class)) {
                    return 0;
                }

                SongGenre::ensureDefaults($u->id);
                $genre = SongGenre::orderBy('sort_order')->first();

                $song = Song::create([
                    'title' => 'დემო-სიმღერა',
                    'artist' => 'Demo Artist',
                    'url' => 'https://youtu.be/dQw4w9WgXcQ',
                ]);

                if ($genre) {
                    $song->genres()->sync([$genre->id]);
                }

                return 1;
            },

            'book' => function (User $u) {
                if ($this->already(Book::class)) {
                    return 0;
                }

                BookGenre::ensureDefaults($u->id);

                Book::create([
                    'title_ka' => 'დემო-წიგნი',
                    'title_en' => 'Demo Book',
                    'author' => 'Demo Author',
                    'genre_id' => BookGenre::orderBy('sort_order')->value('id'),
                    'status' => 'to_read',
                ]);

                return 1;
            },

            'board_game' => function (User $u) {
                if ($this->already(BoardGame::class)) {
                    return 0;
                }

                BoardGameGenre::ensureDefaults($u->id);

                BoardGame::create([
                    'title' => 'Demo Board Game',
                    'genre_id' => BoardGameGenre::orderBy('sort_order')->value('id'),
                    'status' => 'owned',
                    'min_players' => 2,
                    'max_players' => 4,
                ]);

                return 1;
            },

            'game' => function (User $u) {
                if ($this->already(Game::class)) {
                    return 0;
                }

                GameGenre::ensureDefaults($u->id);
                $genre = GameGenre::orderBy('sort_order')->first();

                $game = Game::create([
                    'title_ka' => 'დემო-თამაში',
                    'title_en' => 'Demo Game',
                    'status' => 'undecided',
                ]);

                if ($genre) {
                    $game->genres()->sync([$genre->id]);
                }

                return 1;
            },

            'note' => function (User $u) {
                if ($this->already(NoteEntry::class)) {
                    return 0;
                }

                NoteCategory::ensureDefaults($u->id);
                Status::ensureDefaults($u->id, 'note');

                NoteEntry::create([
                    'title' => 'დემო-ჩანაწერი',
                    'body' => 'ეს ტექსტი mediary:seed-demo-მ დაწერა.',
                    'category_id' => NoteCategory::orderBy('sort_order')->value('id'),
                ]);

                return 1;
            },

            'bookmark' => function (User $u) {
                if ($this->already(Bookmark::class)) {
                    return 0;
                }

                BookmarkCategory::ensureDefaults($u->id);
                Status::ensureDefaults($u->id, 'bookmark');

                Bookmark::create([
                    'title' => 'Laravel-ის დოკუმენტაცია',
                    'url' => 'https://laravel.com/docs',
                    'category_id' => BookmarkCategory::orderBy('sort_order')->value('id'),
                ]);

                return 1;
            },
        ];
    }

    /**
     * ⚠️ **მედია-დომენები ერთი ფუნქციით**: სამივეს ერთი ფორმა აქვს
     * (ორენოვანი სათაური + **გლობალური** `genres` pivot), ე.ი. სამი ასლი
     * პირველსავე ცვლილებაზე გაშორდებოდა.
     *
     * @param  class-string<Movie|Series|Anime>  $model
     * @param  list<array{ka: string, en: string, year: int}>  $rows
     */
    private function media(User $user, string $model, string $domain, array $rows): int
    {
        if ($this->already($model)) {
            return 0;
        }

        Status::ensureDefaults($user->id, $domain);

        // ⚠️ ჟანრი **გლობალურია** (`GenresSeeder`) და არა per-user ლექსიკონი
        $genre = Genre::orderBy('id')->first();

        foreach ($rows as $row) {
            $record = $model::create(['year' => $row['year']]);

            /* ⚠️ სათაური **ცალკე ცხრილშია** (`<domain>_translations`) —
               `title_ka` accessor-ია და არა სვეტი, ე.ი. მისი მინიჭება
               უხმოდ არაფერს ჩაწერდა. */
            $record->setTranslation('ka', ['title' => $row['ka']]);
            $record->setTranslation('en', ['title' => $row['en']]);

            if ($genre) {
                $record->genres()->sync([$genre->id]);
            }
        }

        return count($rows);
    }

    /**
     * ⚠️ **უკვე შევსებულს არ ვეხებით.** ხელახლა გაშვება დუბლიკატებს რომ
     * ქმნიდეს, ბრძანება ერთჯერადი იქნებოდა — და სწორედ განმეორებით
     * გაშვება სჭირდება იმას, ვინც ახალ მოდულს ამატებს.
     *
     * @param  class-string  $model
     */
    private function already(string $model): bool
    {
        return $model::query()->exists();
    }
}
