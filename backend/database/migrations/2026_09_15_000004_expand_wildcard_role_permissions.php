<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **„ყველა მოდულის" ნიღბის (`"*"`) გაშლა** (2026-09-15, შენი მითითებით:
 * „ეს არ მჭირდება, ჩახსნიე ეს ფუნქციონალი").
 *
 * ⚠️ **ნიღაბი უბრალოდ ვერ წაიშლებოდა.** სისტემური როლი `user` **მთლიანად**
 * `{"*": [view, create, update, delete]}`-ზე იდგა (იხ. `create_roles_table`),
 * ე.ი. მისი უბრალო მოცილება ყველა ჩვეულებრივ ანგარიშს **ყველა მოდულზე**
 * წვდომას ერთ ღამეში წაართმევდა. ამიტომ ჯერ იშლება თითოეულ მოდულად და
 * მერე ქრება — დღევანდელი უფლებები ზუსტად უცვლელი რჩება.
 *
 * ⚠️ **გაერთიანება და არა გადაწერა**: როლს შეიძლება ჰქონდეს ორივე —
 * `{"*": ["view"], "movie": ["delete"]}`. ცალკე ჩაწერილი უფლება ნიღბის
 * გაშლისას არ უნდა დაიკარგოს, ე.ი. ორი სია ერთდება.
 *
 * ⚠️ **ცარიელი `modules` ცხრილი ნორმალური შემთხვევაა და არა შეცდომა**:
 * ახალ ბაზაზე მიგრაციები სიდერამდე გადის, ე.ი. მოდულების რიგები ჯერ არ
 * არსებობს და გასაშლელი არაფერია. `user`-ს იქ `ModulesSeeder` ავსებს —
 * სწორედ ის იცნობს მოდულების კანონიკურ სიას.
 *
 * ⚠️ **`down()` ნიღაბს უკან არ აბრუნებს.** გაშლილი სიიდან „რომელი მოდული
 * იყო ნიღბიდან და რომელი — ხელით ჩაწერილი" აღარ იკითხება, ე.ი. აღდგენა
 * გამოცნობა იქნებოდა და ხელით მიცემულ უფლებებს ჩუმად წაშლიდა.
 */
return new class extends Migration
{
    private const WILDCARD = '*';

    public function up(): void
    {
        $modules = DB::table('modules')->pluck('key')->all();
        $actions = ['view', 'create', 'update', 'delete'];

        foreach (DB::table('roles')->whereNotNull('permissions')->get() as $role) {
            $perms = json_decode($role->permissions, true);

            if (! is_array($perms) || ! isset($perms[self::WILDCARD])) {
                continue;
            }

            $wild = array_values(array_intersect($actions, (array) $perms[self::WILDCARD]));
            unset($perms[self::WILDCARD]);

            foreach ($modules as $key) {
                $perms[$key] = array_values(array_intersect(
                    $actions,
                    array_unique(array_merge((array) ($perms[$key] ?? []), $wild)),
                ));
            }

            // ცარიელი ნაკრები არ ინახება — იგივე წესი, რაც `cleanPermissions()`-ს აქვს
            $perms = array_filter($perms, fn (array $list) => $list !== []);

            DB::table('roles')->where('id', $role->id)->update([
                'permissions' => json_encode($perms),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // განზრახ ცარიელი — იხ. კლასის კომენტარი
    }
};
