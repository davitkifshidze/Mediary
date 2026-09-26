<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §13 — თამაშების მოდული მსუბუქდება.
 *
 * შენი სიტყვები: „სტატუსები მხოლოდ ეს იყოს: გასავლელი, ვთამაშობ, დახურული"
 * · „სრულად ამოიღე, რამდენი დრო სჭირდება დახურვას" · „ინტერფეისი, ხმა,
 * სუბტიტრებიც წაშალე" · „ცალკე ეს DLC აღარ არის საჭირო" · Q11 — Metacritic
 * მთლიანად. ცოცხალში: 5 თამაში, ხუთივე `undecided`; HLTB, ენები, DLC — 0;
 * Metacritic — 3.
 *
 * ⚠️ **DLC-ის რიგი არ იკარგება**: მისამართი არ აქვს, ამიტომ ბმულად ვერ
 * გადავა — აღწერის ბოლოს ტექსტად იწერება (ჯერ ქართულში, თუ ის ცარიელია —
 * ინგლისურში).
 *
 * ⚠️ **სტატუსი**: `undecided` და `abandoned` → `to_play`; `finished` რჩება
 * (`PublicDomain::MATCH`-ის „done"-ია და `finished_at`-ს ადგენს) და ახლა
 * „დახურული" ჰქვია. სვეტის ნაგულისხმევიც `to_play` ხდება. ⚠️ ცხრილის
 * ჩაწერა query builder-ითაა — მოდელი `AuditObserver`-ს ხუთჯერ გაისროდა.
 *
 * ⚠️ `down()` სვეტებს ცარიელად აბრუნებს; სტატუსი `to_play`-ზე რჩება
 * (რომელი იყო `undecided` და რომელი `abandoned`, აღარ ჩანს).
 */
return new class extends Migration
{
    private const COLUMNS = ['hltb_main', 'hltb_main_extra', 'hltb_complete', 'metacritic', 'languages', 'dlcs'];

    public function up(): void
    {
        if (Schema::hasColumn('games', 'dlcs')) {
            DB::table('games')->whereNotNull('dlcs')->orderBy('id')->lazyById()->each(function ($row) {
                $dlcs = json_decode((string) $row->dlcs, true) ?: [];
                $lines = array_values(array_filter(array_map(function ($dlc) {
                    $name = trim((string) ($dlc['name'] ?? ''));
                    $note = trim((string) ($dlc['note'] ?? ''));

                    return $name === '' ? null : ($note === '' ? "- {$name}" : "- {$name} — {$note}");
                }, $dlcs)));

                if (! $lines) {
                    return;
                }

                $column = filled($row->description_ka) || blank($row->description_en) ? 'description_ka' : 'description_en';
                $text = trim((string) $row->{$column});
                $block = "DLC:\n".implode("\n", $lines);

                DB::table('games')->where('id', $row->id)->update([
                    $column => $text === '' ? $block : "{$text}\n\n{$block}",
                ]);
            });
        }

        DB::table('games')->whereIn('status', ['undecided', 'abandoned'])->update(['status' => 'to_play']);

        Schema::table('games', function (Blueprint $t) {
            $t->string('status', 20)->default('to_play')->change();
        });

        $columns = array_values(array_filter(self::COLUMNS, fn ($c) => Schema::hasColumn('games', $c)));
        foreach (Schema::getIndexes('games') as $index) {
            if (! $index['primary'] && array_intersect($columns, $index['columns'])) {
                Schema::table('games', fn (Blueprint $t) => $t->dropIndex($index['name']));
            }
        }
        foreach ($columns as $column) {
            Schema::table('games', fn (Blueprint $t) => $t->dropColumn($column));
        }
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $t) {
            $t->string('status', 20)->default('undecided')->change();
            foreach (['hltb_main', 'hltb_main_extra', 'hltb_complete'] as $c) {
                if (! Schema::hasColumn('games', $c)) {
                    $t->unsignedInteger($c)->nullable();
                }
            }
            if (! Schema::hasColumn('games', 'metacritic')) {
                $t->unsignedTinyInteger('metacritic')->nullable();
            }
            foreach (['languages', 'dlcs'] as $c) {
                if (! Schema::hasColumn('games', $c)) {
                    $t->json($c)->nullable();
                }
            }
        });
    }
};
