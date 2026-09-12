<?php

use App\Support\StatusDomain;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §6.2/§6.4 — სტატუსი per-user ლექსიკონად.**
 *
 * ექვს დომენზე `status` enum ქრება და მის ადგილს `status_id` იკავებს
 * (`statuses` ცხრილი, `module` სვეტით ჭრილი). არჩევანი „სრული ლექსიკონია"
 * — მომხმარებლის 2026-09-12-ის პასუხი: ყველაფერი ემატება, იშლება,
 * გადაერქმევა და ლაგდება.
 *
 * ⚠️ **ძველი სვეტის დატოვება არ შეიძლება.** ორი წყარო ერთ ფაქტზე
 * გარდაუვლად დაშორდება (`hltb_*`-ისა და `Book::syncProgress()`-ის ხაფანგი),
 * ამიტომ მნიშვნელობები **ჯერ გადადის** ლექსიკონზე და მერე იშლება სვეტი.
 *
 * ⚠️ **ინდექსი სვეტზე ადრე უნდა მოიხსნას.** `status` სამ ცხრილზე
 * კომპოზიტური ინდექსის ნაწილია (`user_id, status`), sqlite კი ინდექსიან
 * სვეტს **საერთოდ არ შლის** — ტესტების ბაზა იქვე ჩავარდებოდა.
 *
 * ⚠️ **ვიდეოს ეს სვეტი არ ჰქონია** — მას სტატუსი ამ მიგრაციით *ჩნდება*,
 * ე.ი. მისი ჩანაწერები ნაგულისხმევ სტატუსზე ჯდება.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('statuses')) {
            Schema::create('statuses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                // რომელი დომენის სტატუსია — ერთი ცხრილი ექვსივეს ემსახურება
                $table->string('module', 32);
                // ⚠️ გასაღები არასდროს იცვლება: ის აკავშირებს ლექსიკონს ძველ
                // ბმულებთან (`?view=watched`) და კოდში ჩაწერილ ნაგულისხმევებთან
                $table->string('key', 60);
                $table->string('name_ka', 80);
                $table->string('name_en', 80);
                /* ⚠️ **მნიშვნელობა და არა დეკორაცია** — `MatchService`,
                   `PurgeService` და ფრანჩაიზის ბეჯი სწორედ ამას კითხულობენ. */
                $table->enum('role', StatusDomain::ROLES)->default('todo');
                $table->string('icon', 60)->nullable();
                $table->string('color', 20)->nullable();
                // რომელ სტატუსზე იჯდება ახალი ჩანაწერი
                $table->boolean('is_default')->default(false);
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();

                $table->unique(['user_id', 'module', 'key']);
                $table->index(['user_id', 'module']);
            });
        }

        /* ---------- 1. `status_id` ექვსივე ცხრილზე ---------- */
        foreach (StatusDomain::TABLES as $table => $domain) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, 'status_id')) {
                continue;
            }

            Schema::table($table, function (Blueprint $t) {
                $t->foreignId('status_id')->nullable()->constrained('statuses')->nullOnDelete();
            });
        }

        /* ---------- 2. ყველა ანგარიშს თავისი ნაკრები ---------- */
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (StatusDomain::DOMAINS as $domain => $config) {
                if (DB::table('statuses')->where('user_id', $userId)->where('module', $domain)->exists()) {
                    continue;
                }

                foreach ($config['defaults'] as $i => $status) {
                    DB::table('statuses')->insert([
                        'user_id' => $userId,
                        'module' => $domain,
                        'key' => $status['key'],
                        'name_ka' => $status['name_ka'],
                        'name_en' => $status['name_en'],
                        'role' => $status['role'],
                        'icon' => $status['icon'] ?? null,
                        'is_default' => (bool) ($status['is_default'] ?? false),
                        'sort_order' => $i + 1,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        /* ---------- 3. ძველი მნიშვნელობა → ლექსიკონის რიგი ----------
           ⚠️ PHP-ში და არა ერთი `UPDATE … JOIN`-ით: sqlite (ტესტები)
           multi-table update-ს არ იცნობს, სტატუსების რიგების რაოდენობა კი
           ერთ ანგარიშზე ერთნიშნაა. */
        foreach (StatusDomain::TABLES as $table => $domain) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'status')) {
                continue;
            }

            foreach (DB::table('statuses')->where('module', $domain)->get(['id', 'user_id', 'key']) as $status) {
                DB::table($table)
                    ->where('user_id', $status->user_id)
                    ->where('status', $status->key)
                    ->update(['status_id' => $status->id]);
            }
        }

        /* ---------- 4. ვისაც ვერაფერი მოერგო — ნაგულისხმევზე ----------
           (ვიდეოს სვეტი არ ჰქონია; სხვაგან — enum-ის გარეთ დარჩენილი რიგი.) */
        foreach (StatusDomain::TABLES as $table => $domain) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $defaults = DB::table('statuses')
                ->where('module', $domain)
                ->where('is_default', true)
                ->get(['id', 'user_id']);

            foreach ($defaults as $status) {
                DB::table($table)
                    ->where('user_id', $status->user_id)
                    ->whereNull('status_id')
                    ->update(['status_id' => $status->id]);
            }
        }

        /* ---------- 5. ძველი სვეტი და მისი ინდექსები ----------
           ⚠️ **ინდექსები სქემიდან იკითხება და არა სახელით.** `status` სამ
           სხვადასხვა ინდექსში მონაწილეობს (`status` · `user_id, status` ·
           `visibility, status`), ე.ი. სახელების ხელით ჩამოწერა ერთს
           აუცილებლად გამოტოვებდა — sqlite კი ინდექსიან სვეტს არ შლის და
           მიგრაცია იქვე ჩავარდებოდა (ზუსტად ასე მოხდა პირველ გაშვებაზე). */
        foreach (array_keys(StatusDomain::TABLES) as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'status')) {
                continue;
            }

            // რომელი ინდექსები ეყრდნობოდა `status`-ს — იმავე ფორმით აღდგება `status_id`-ზე
            $rebuild = [];

            foreach (Schema::getIndexes($table) as $index) {
                if ($index['primary'] || ! in_array('status', $index['columns'], true)) {
                    continue;
                }

                $rebuild[] = array_map(
                    fn (string $column) => $column === 'status' ? 'status_id' : $column,
                    $index['columns'],
                );

                Schema::table($table, fn (Blueprint $t) => $t->dropIndex($index['name']));
            }

            Schema::table($table, fn (Blueprint $t) => $t->dropColumn('status'));

            foreach ($rebuild as $columns) {
                Schema::table($table, fn (Blueprint $t) => $t->index($columns));
            }
        }

        /* ---------- 6. სიის ფილტრის ინდექსი ---------- */
        foreach (array_keys(StatusDomain::TABLES) as $table) {
            if (! Schema::hasTable($table) || Schema::hasIndex($table, "{$table}_user_id_status_id_index")) {
                continue;
            }

            Schema::table($table, fn (Blueprint $t) => $t->index(['user_id', 'status_id']));
        }
    }

    public function down(): void
    {
        foreach (StatusDomain::TABLES as $table => $domain) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            // ვიდეოს სტატუსი ამ მიგრაციამდე არ ჰქონია — მასზე სვეტი არ ბრუნდება
            if ($domain !== 'video' && ! Schema::hasColumn($table, 'status')) {
                Schema::table($table, function (Blueprint $t) use ($domain) {
                    $t->string('status', 20)->default(StatusDomain::defaults($domain)[0]['key']);
                });

                foreach (DB::table('statuses')->where('module', $domain)->get(['id', 'key']) as $status) {
                    DB::table($table)->where('status_id', $status->id)->update(['status' => $status->key]);
                }
            }

            if (Schema::hasColumn($table, 'status_id')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropForeign(['status_id']);
                    $t->dropColumn('status_id');
                });
            }
        }

        Schema::dropIfExists('statuses');
    }
};
