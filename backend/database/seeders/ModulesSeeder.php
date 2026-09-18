<?php

namespace Database\Seeders;

use App\Models\Module;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * მოდულების რეესტრი (I2). ფილმები/სერიალები — პირველი ორი „plug-in".
 * ახალი მოდულის დამატება = ერთი ჩანაწერი აქ (იხ. docs/I7-*.md, §7.3 recipe).
 */
class ModulesSeeder extends Seeder
{
    /**
     * გვერდის ჰედერის ფონი მოდულზე (Tasks §2.1).
     *
     * ⚠️ **მხოლოდ საწყისი მნიშვნელობაა** — reseed-ი მას აღარ ეხება, თორემ
     * `/modules/{key}`-ზე ხელით არჩეული ფერი ყოველ `db:seed`-ზე დაიკარგებოდა
     * (სახელი/აიქონი განზრახ სხვაგვარად იქცევა: ისინი კოდიდან მოდის).
     */
    private const COLORS = [
        'movie' => '#6366f1',
        'series' => '#8b5cf6',
        'anime' => '#d946ef',
        'video' => '#ef4444',
        'song' => '#ec4899',
        'book' => '#f59e0b',
        'board_game' => '#10b981',
        'game' => '#06b6d4',
        'gallery' => '#a855f7',
        'note' => '#64748b',
        'bookmark' => '#0ea5e9',
    ];

    public function run(): void
    {
        $modules = [
            [
                'key' => 'movie',
                'name_ka' => 'ფილმები',
                'name_en' => 'Movies',
                'description_ka' => 'ფილმების პირადი კატალოგი TMDB-ის მონაცემებით.',
                'description_en' => 'Personal movie catalog enriched from TMDB.',
                'icon' => 'Film',
                // Tasks 2.2 — `/` დეშბორდისაა, ბიბლიოთეკა `/movies`-ზეა
                'route_base' => '/movies',
                'api_base' => '/movies',
                'morph_alias' => 'movie',
                // შეთანხმებული ქცევა: რეგისტრაცია ღიაა, მოდულები კი მოთხოვნით ირთვება —
                // ახალი ანგარიში „ცარიელია" და ადმინს სთხოვს ჩართვას (ApprovalRequest).
                'enabled_by_default' => false,
                'sort_order' => 10,
            ],
            [
                'key' => 'series',
                'name_ka' => 'სერიალები',
                'name_en' => 'Series',
                'description_ka' => 'სერიალების კატალოგი სეზონებითა და ეპიზოდებით.',
                'description_en' => 'TV series catalog with seasons and episodes.',
                'icon' => 'Tv',
                'route_base' => '/series',
                'api_base' => '/series',
                'morph_alias' => 'series',
                // შეთანხმებული ქცევა: რეგისტრაცია ღიაა, მოდულები კი მოთხოვნით ირთვება —
                // ახალი ანგარიში „ცარიელია" და ადმინს სთხოვს ჩართვას (ApprovalRequest).
                'enabled_by_default' => false,
                'sort_order' => 20,
            ],
            [
                // §7.1 — მესამე მედია-დომენი, გვერდით მენიუში სერიალების ქვემოთ
                'key' => 'anime',
                'name_ka' => 'ანიმეები',
                'name_en' => 'Anime',
                'description_ka' => 'ანიმეების ბიბლიოთეკა — TMDB-ის მონაცემები, ჟანრები, ხმის მსახიობები და გალერეა.',
                'description_en' => 'Anime library — TMDB data, genres, voice cast and gallery.',
                'icon' => 'Sparkles',
                'route_base' => '/anime',
                'api_base' => '/anime',
                'morph_alias' => 'anime',
                'enabled_by_default' => false,
                'sort_order' => 25,
            ],
            [
                'key' => 'video',
                'name_ka' => 'ვიდეოები',
                'name_en' => 'Videos',
                'description_ka' => 'ვიდეოების ბმულები ნებისმიერი წყაროდან — YouTube, Vimeo, პირდაპირი ფაილი.',
                'description_en' => 'Video links from any source — YouTube, Vimeo, direct files.',
                'icon' => 'Video',
                'route_base' => '/videos',
                'api_base' => '/videos',
                'morph_alias' => 'video',
                'enabled_by_default' => false,
                'sort_order' => 30,
            ],
            [
                // 2026-09-03 — სიმღერა ცალკე მოდულია (ადრე `videos`-ის რიგი იყო):
                // საიდბარის სექცია, ადმინის გადამრთველი და როლების უფლებები
                // მხოლოდ `modules`-ის ჩანაწერზე მიბმულ მოდულს აქვს.
                'key' => 'song',
                'name_ka' => 'სიმღერები',
                'name_en' => 'Songs',
                'description_ka' => 'მუსიკის პირადი ბაზა — შემსრულებელი, ალბომი, ჟანრი და პლეილისტები.',
                'description_en' => 'Personal music library — artist, album, genre and playlists.',
                'icon' => 'Music',
                'route_base' => '/songs',
                'api_base' => '/songs',
                'morph_alias' => 'song',
                'enabled_by_default' => false,
                'sort_order' => 35,
            ],
            [
                // Tasks §12 — წიგნები. გამამდიდრებელი წყარო Open Library-ია
                // (კლავიშს არ ითხოვს), ჟანრები per-user ლექსიკონია.
                'key' => 'book',
                'name_ka' => 'წიგნები',
                'name_en' => 'Books',
                'description_ka' => 'წიგნების პირადი ბიბლიოთეკა — ავტორი, სერია, პროგრესი, ციტატები და ფაილები.',
                'description_en' => 'Personal book library — author, series, reading progress, quotes and files.',
                'icon' => 'BookOpen',
                'route_base' => '/books',
                'api_base' => '/books',
                'morph_alias' => 'book',
                'enabled_by_default' => false,
                'sort_order' => 38,
            ],
            [
                // Tasks §14 — ბორდგეიმები. წყარო BoardGameGeek (XML API 2,
                // კლავიშის გარეშე); გალერეა `board_game_files.kind = 'image'`-შია.
                'key' => 'board_game',
                'name_ka' => 'ბორდგეიმები',
                'name_en' => 'Board games',
                'description_ka' => 'სამაგიდო თამაშების კოლექცია — მოთამაშეები, სირთულე, BGG-ის რეიტინგი და წესები.',
                'description_en' => 'Board game collection — players, complexity, BGG rating and rules.',
                'icon' => 'Dices',
                'route_base' => '/board-games',
                'api_base' => '/board-games',
                'morph_alias' => 'board_game',
                'enabled_by_default' => false,
                'sort_order' => 39,
            ],
            [
                // Tasks §11 — თამაშები. წყარო RAWG (§11.4, ერთი უფასო კლავიში);
                // ჟანრი per-user ლექსიკონია, მაგრამ **მრავალჟანრიანი** (pivot).
                'key' => 'game',
                'name_ka' => 'თამაშები',
                'name_en' => 'Games',
                'description_ka' => 'ვიდეოთამაშების კოლექცია — პლატფორმები, გავლის დრო, ქულები, walkthrough-ები და სქრინშოტები.',
                'description_en' => 'Video game collection — platforms, playtime, scores, walkthroughs and screenshots.',
                'icon' => 'Gamepad2',
                'route_base' => '/games',
                'api_base' => '/games',
                'morph_alias' => 'game',
                'enabled_by_default' => false,
                'sort_order' => 39,
            ],
            [
                // Tasks 10 — გალერეა ცალკე მოდულია, თუმცა ფოტოები ფილმებს,
                // სერიალებს, მსახიობებსა და სიმღერებს ჰკიდია (`gallery_images`),
                // ამიტომ `morph_alias` არ სჭირდება.
                'key' => 'gallery',
                'name_ka' => 'გალერეა',
                'name_en' => 'Gallery',
                'description_ka' => 'ოფიციალური კადრები და მსახიობების ფოტოები ფილმებსა და სერიალებზე.',
                'description_en' => 'Official stills and cast photos for movies and series.',
                'icon' => 'Image',
                'route_base' => '/gallery',
                'api_base' => '/gallery',
                'morph_alias' => null,
                'enabled_by_default' => false,
                'sort_order' => 40,
            ],
            [
                // Tasks §13 — ჩანაწერები (საჭირო ინფორმაცია + შეხსენებები).
                // ⚠️ key `note`-ია, ცხრილი კი `note_entries`: უნივერსალური
                // `notes` 2026-09-03-ის წესით აღარ არსებობს და სახელი
                // „სხვა ჩანაწერზე მიმაგრებულ ჩანიშვნას" ნიშნავს.
                'key' => 'note',
                'name_ka' => 'ჩანაწერები',
                'name_en' => 'Notes',
                'description_ka' => 'საჭირო ინფორმაცია ერთ ადგილას — ბმულები, ფაილები, ვადები და შეხსენებები.',
                'description_en' => 'Everything you need to remember — links, files, deadlines and reminders.',
                'icon' => 'NotebookPen',
                'route_base' => '/notes',
                'api_base' => '/notes',
                'morph_alias' => 'note',
                'enabled_by_default' => false,
                'sort_order' => 41,
            ],
            [
                // Tasks §18 — ბუკმარკები (`DECISIONS.md` §10-ის არჩევანი 2026-09-06).
                // გამამდიდრებელი წყარო არ არსებობს: მეტამონაცემი თვითონ გვერდის
                // `<head>`-იდან მოდის (`Services\Bookmarks\LinkMetadata`).
                'key' => 'bookmark',
                'name_ka' => 'ბუკმარკები',
                'name_en' => 'Bookmarks',
                'description_ka' => 'საიტებისა და რესურსების ბმულები — კატეგორიები, ტეგები და „წასაკითხი" სია.',
                'description_en' => 'Links to sites and resources — categories, tags and a read-later list.',
                'icon' => 'Bookmark',
                'route_base' => '/bookmarks',
                'api_base' => '/bookmarks',
                'morph_alias' => 'bookmark',
                'enabled_by_default' => false,
                'sort_order' => 42,
            ],
        ];

        foreach ($modules as $m) {
            $module = Module::updateOrCreate(['key' => $m['key']], $m);

            // ფერი მხოლოდ მაშინ, თუ ჯერ არავის აურჩევია (იხ. `COLORS`)
            if ($module->color === null && isset(self::COLORS[$m['key']])) {
                $module->forceFill(['color' => self::COLORS[$m['key']]])->save();
            }
        }

        $this->fillDefaultRole();
    }

    /**
     * **ნაგულისხმევი როლის უფლებები — „ყველა მოდულის" ნიღბის ჩამნაცვლებელი**
     * (2026-09-15).
     *
     * ⚠️ **ეს სწორედ ის ადგილია, სადაც მოდულების სია ცხოვრობს.** `user`
     * როლი ადრე `{"*": …}`-ზე იდგა; ნიღბის მოხსნის შემდეგ მისი შევსება
     * მიგრაციას არ შეუძლია — მიგრაციები სიდერამდე გადის, ე.ი. `modules`
     * ცხრილი მაშინ ცარიელია.
     *
     * ⚠️ **ივსება მხოლოდ სრულიად ცარიელი ნაკრები**, ე.ი. ახალი ბაზა —
     * უკვე კონფიგურირებული როლი reseed-ზე ხელახლა არ იხსნება (იგივე წესი,
     * რაც `COLORS`-ს აქვს: ხელით არჩეული არ გადაიწერება).
     *
     * ⚠️ `!== []` და არა `empty()`: `null` სვეტში აღარ არსებობს (Tasks
     * SEC-10 — მიგრაციამ `{}`-ად გადაიყვანა და სვეტი `NOT NULL` გახდა),
     * მაგრამ თუ ოდესმე გაჩნდა, ის „უფლების გარეშეს" ნიშნავს და არა
     * „ყველაფერს" — ე.ი. შევსება მას ვერაფერს დაუკლებს.
     */
    private function fillDefaultRole(): void
    {
        $role = Role::where('key', 'user')->first();

        if (! $role || $role->permissions !== []) {
            return;
        }

        $role->forceFill([
            'permissions' => Module::pluck('key')
                ->mapWithKeys(fn (string $key) => [$key => Role::ACTIONS])
                ->all(),
        ])->save();
    }
}
