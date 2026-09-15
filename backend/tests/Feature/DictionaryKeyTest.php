<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Role;
use App\Models\Status;
use App\Models\User;
use App\Models\VideoType;
use App\Support\CustomFields;
use App\Support\DictionaryKey;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ლექსიკონის გასაღები (აუდიტი 2026-09-14, §B3).**
 *
 * ბაგი ცხრა ფაილში იდო და ცხრავეგან ერთი და იგივე იყო: უნიკალურობა
 * **სრულ** სტრიქონზე მოწმდებოდა, ჭრა კი ციკლის **შემდეგ** ხდებოდა.
 * ე.ი. (1) ბაზაში სხვა გასაღები იწერებოდა, ვიდრე შემოწმდა, და (2) `-2`
 * სუფიქსი — ერთადერთი, რაც კონფლიქტს აგვარებდა — ჭრაში იკარგებოდა.
 */
class DictionaryKeyTest extends TestCase
{
    use RefreshDatabase;

    /* ================= ალგორითმი ================= */

    /**
     * **ზუსტად ის შემთხვევა, რომელიც 500-ს იძლეოდა.**
     *
     * ⚠️ 80-სიმბოლოიანი ქართული სახელი (ვალიდაციის მაქსიმუმი) `Str::slug`-ის
     * შემდეგ **91 სიმბოლოა** — ქართული ტრანსლიტერაციაში `ჩ`→`ch`, `ძ`→`dz`.
     * ორი ასეთი სახელი, რომელთა პირველი 60 სიმბოლო ემთხვევა, ძველ კოდში
     * ერთსა და იმავე გასაღებს იღებდა.
     */
    public function test_a_long_name_still_gets_a_unique_key(): void
    {
        $long = mb_substr(str_repeat('ჩხუბი ძალიან გრძელი სტატუსის სახელია ', 3), 0, 80);

        $issued = [];
        /* ⚠️ **ჩვეულებრივი closure და არა arrow-function**: `fn () =>` გარე
           ცვლადს **ასლად** იჭერს შექმნის მომენტში, ე.ი. `$taken` სამუდამოდ
           ცარიელ მასივს დაინახავდა და ტესტი ცრუდ გაივლიდა (იგივე ხაფანგი,
           რაც `VideoDownloadTest`-ში `ArrayObject`-ით არის შემოვლილი). */
        $taken = function (string $key) use (&$issued) {
            return in_array($key, $issued, true);
        };

        for ($i = 0; $i < 5; $i++) {
            $key = DictionaryKey::make($long, $taken);

            $this->assertLessThanOrEqual(DictionaryKey::MAX_LENGTH, mb_strlen($key));
            $this->assertNotContains($key, $issued, 'გასაღები გამეორდა');

            $issued[] = $key;
        }
    }

    /** მოკლე სახელი უცვლელი რჩება — ჭრა მხოლოდ საჭიროებისას მოქმედებს */
    public function test_a_short_name_is_left_alone(): void
    {
        $this->assertSame('rock', DictionaryKey::make('Rock', fn () => false));
    }

    /** ლათინურის გარეშე დარჩენილი სახელი ნაცვალს იღებს და არა ცარიელს */
    public function test_a_name_without_latin_falls_back(): void
    {
        // ⚠️ მხოლოდ პუნქტუაცია — `Str::slug` ცარიელს აბრუნებს
        $this->assertSame('genre', DictionaryKey::make('!!! ???', fn () => false, 'genre'));
    }

    /** სუფიქსი ემატება და **არ** იკარგება ჭრისას */
    public function test_the_suffix_survives_truncation(): void
    {
        $long = str_repeat('a', 120);

        $first = DictionaryKey::make($long, fn () => false);
        $second = DictionaryKey::make($long, fn (string $k) => $k === $first);

        $this->assertSame(60, mb_strlen($first));
        $this->assertSame(60, mb_strlen($second));
        $this->assertNotSame($first, $second);
        $this->assertStringEndsWith('-2', $second);
    }

    /** გამყოფიც და სიგრძეც პარამეტრებია — `CustomFields`-ს `_` და 50 სჭირდება */
    public function test_the_separator_and_length_are_configurable(): void
    {
        $key = DictionaryKey::make('Release date', fn () => false, 'field', max: 50, separator: '_');

        $this->assertSame('release_date', $key);
    }

    /**
     * ⚠️ **ციკლს ჭერი აქვს.** უსასრულო `while`, რომელიც ყოველ ბიჯზე ბაზას
     * ეკითხება, ხარვეზზე სერვერს დაბლოკავდა — ამიტომ ჭერის მიღწევაზე
     * შემთხვევითი სუფიქსი მუშაობს.
     */
    public function test_it_gives_up_instead_of_looping_forever(): void
    {
        $key = DictionaryKey::make('rock', fn () => true);

        $this->assertNotSame('', $key);
        $this->assertLessThanOrEqual(DictionaryKey::MAX_LENGTH, mb_strlen($key));
    }

    /* ================= ნამდვილი ლექსიკონები ================= */

    private function makeUser(): User
    {
        $this->seed(ModulesSeeder::class);

        $user = User::create([
            'name' => 'dara',
            'username' => 'dara',
            'email' => 'dara@example.com',
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    /**
     * **სტატუსი ბაზაშიც ჯდება.** ეს არის ის გზა, რომელიც `QueryException`-ს
     * იძლეოდა: `unique(user_id, module, key)` ორ მოჭრილ, იდენტურ გასაღებზე.
     */
    public function test_two_long_status_names_can_both_be_saved(): void
    {
        $user = $this->makeUser();
        $long = mb_substr(str_repeat('ჩხუბი ძალიან გრძელი სტატუსის სახელია ', 3), 0, 78);

        foreach (['ა', 'ბ'] as $suffix) {
            $name = $long.$suffix;

            Status::withoutGlobalScope('owner')->create([
                'user_id' => $user->id,
                'module' => 'movie',
                'key' => Status::makeKey($user->id, 'movie', $name),
                'name_ka' => $name,
                'name_en' => $name,
                'role' => 'todo',
            ]);
        }

        $this->assertSame(2, Status::withoutGlobalScope('owner')->where('module', 'movie')->count());
    }

    /**
     * ⚠️ **დაცული გასაღებები კვლავ გვერდის ავლითაა**: „Favorite" სახელის
     * სტატუსი `favorite`-ს ვერ მიიღებს, თორემ `?view=favorite` რჩეულებს
     * გახსნიდა (ეტაპი 8-ის წესი, რომელიც რეფაქტორინგმა არ უნდა დაარღვიოს).
     */
    public function test_reserved_status_keys_are_still_skipped(): void
    {
        $user = $this->makeUser();

        $this->assertNotSame('favorite', Status::makeKey($user->id, 'movie', 'Favorite'));
        $this->assertNotSame('all', Status::makeKey($user->id, 'movie', 'All'));
    }

    /** per-user ლექსიკონი: ერთი და იგივე სახელი ორჯერ — ორი გასაღები */
    public function test_a_duplicate_name_in_one_dictionary_gets_a_suffix(): void
    {
        $user = $this->makeUser();

        $first = VideoType::makeKey($user->id, 'ვლოგი');
        VideoType::withoutGlobalScope('owner')->create([
            'user_id' => $user->id,
            'key' => $first,
            'name_ka' => 'ვლოგი',
            'name_en' => 'Vlog',
        ]);

        $this->assertNotSame($first, VideoType::makeKey($user->id, 'ვლოგი'));
    }

    /**
     * ⚠️ **სხვისი გასაღები ხელს არ უშლის** — ლექსიკონი per-user-ია, ე.ი.
     * ორივე ანგარიშს ერთი და იგივე `key` შეიძლება ჰქონდეს.
     */
    public function test_another_users_key_does_not_collide(): void
    {
        $user = $this->makeUser();

        $other = User::create([
            'name' => 'bob',
            'username' => 'bob',
            'email' => 'bob@example.com',
            'password' => 'password',
        ]);

        VideoType::withoutGlobalScope('owner')->create([
            'user_id' => $other->id,
            'key' => 'vlogi',
            'name_ka' => 'ვლოგი',
            'name_en' => 'Vlog',
        ]);

        $this->assertSame('vlogi', VideoType::makeKey($user->id, 'ვლოგი'));
    }

    /** გლობალური როლიც იმავე ალგორითმზეა */
    public function test_role_keys_stay_unique(): void
    {
        Role::create(['key' => 'editor', 'name_ka' => 'რედაქტორი', 'name_en' => 'Editor']);

        $this->assertNotSame('editor', Role::makeKey('Editor'));
    }

    /** მორგებული ველი — `_` გამყოფი და 50 სიმბოლო */
    public function test_custom_field_keys_keep_their_own_shape(): void
    {
        $this->assertSame('release_date', CustomFields::makeKey('Release date', []));
        $this->assertSame('release_date_2', CustomFields::makeKey('Release date', ['release_date']));
    }
}
