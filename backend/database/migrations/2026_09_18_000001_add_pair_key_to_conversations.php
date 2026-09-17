<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ერთი წყვილი — ერთი საუბარი, და ამას სქემა იცავს (Tasks BUG-07).**
 *
 * `ChatService::between()` არსებულ საუბარს **მხოლოდ კითხვით** ეძებდა და
 * ვერპოვნაზე ახალს ქმნიდა. ორი ტაბი (ან polling + ხელით გახსნა) ერთსა და
 * იმავე წამში ორივე „ვერპოვნას" იღებდა და **ორი** საუბარი იქმნებოდა —
 * ძაფი კი სამუდამოდ იყოფოდა: შეტყობინება იმაში ხვდებოდა, რომელიც თითო
 * კლიენტმა დაიქეშა.
 *
 * ⚠️ **`conversation_user`-ის unique (`conversation_id`, `user_id`) ამას ვერ
 * იჭერს** — ის „ერთი ადამიანი ერთ საუბარში ორჯერ არ არის"-ს ამბობს და არა
 * „ეს ორი ერთხელ ხვდება ერთმანეთს". წყვილზე შეზღუდვა pivot-ზე დაწერა
 * შეუძლებელია, ამიტომ გასაღები თვითონ საუბარზე ჯდება.
 *
 * ⚠️ **`min:max` და არა „ვინ დაიწყო"** — გასაღები მიმართულებისგან
 * დამოუკიდებელი უნდა იყოს, თორემ A→B და B→A ორ სხვადასხვა რიგად დაჯდებოდა
 * და შეზღუდვა არაფერს დაიცავდა.
 *
 * ⚠️ **სვეტი nullable-ია განზრახ.** ორივე ძრავზე `NULL` unique ინდექსს არ
 * ეწინააღმდეგება, ე.ი. ორზე მეტმონაწილიანი (ან უკვე გაორებული) საუბარი
 * არსებობას განაგრძობს — მიგრაცია მონაცემს არ შლის და არ ადუღაბებს.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('conversations', 'pair_key')) {
            Schema::table('conversations', function (Blueprint $table) {
                $table->string('pair_key', 64)->nullable()->after('id');
            });
        }

        /* არსებული საუბრების შევსება. ⚠️ **ზუსტად ორმონაწილიანი** რიგები
           მონაწილეობენ: სამის (ან ერთის) გასაღები ვერ აიგება. */
        $pairs = DB::table('conversation_user')
            ->select('conversation_id', 'user_id')
            ->orderBy('conversation_id')
            ->get()
            ->groupBy('conversation_id')
            ->map(fn ($rows) => $rows->pluck('user_id')->map(fn ($id) => (int) $id)->sort()->values()->all())
            ->filter(fn (array $ids) => count($ids) === 2);

        /* ⚠️ **გაორებული წყვილი უკვე შეიძლება არსებობდეს** — სწორედ ეს ბაგი
           ქმნიდა მას. ასეთზე გასაღები **უმცროს id-ს** რჩება (ე.ი. იმას,
           რომელსაც ორივე კლიენტი პოულობდა ბაგამდე), დანარჩენი `null`-ით
           რჩება: unique ინდექსი სხვაგვარად საერთოდ არ აიგებოდა.
           ⚠️ დარჩენილი ძაფი **არ იშლება** — ის სიაში ისევ ჩანს (სია
           მონაწილეობით იგება და არა `pair_key`-ით), ე.ი. წერილები არსად
           იკარგება; უბრალოდ `between()` ამიერიდან კანონიკურს აბრუნებს. */
        $taken = [];

        foreach ($pairs as $conversationId => $ids) {
            $key = $ids[0].':'.$ids[1];

            if (isset($taken[$key])) {
                continue;
            }

            $taken[$key] = true;
            DB::table('conversations')->where('id', $conversationId)->update(['pair_key' => $key]);
        }

        if (! $this->hasIndex('conversations_pair_key_unique')) {
            Schema::table('conversations', function (Blueprint $table) {
                $table->unique('pair_key');
            });
        }
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropUnique('conversations_pair_key_unique');
            $table->dropColumn('pair_key');
        });
    }

    private function hasIndex(string $name): bool
    {
        foreach (Schema::getIndexes('conversations') as $index) {
            if (($index['name'] ?? null) === $name) {
                return true;
            }
        }

        return false;
    }
};
