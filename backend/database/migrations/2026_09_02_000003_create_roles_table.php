<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks 1.6 — როლები ცხრილად, `users.role` enum-ის ნაცვლად.
 *
 * უფლება = **მოდულის შიდა** CRUD (გადაწყდა 19.8): `permissions` JSON-ია სახით
 * `{"movie": ["view","create","update","delete"], "*": ["view"]}`.
 * ⚠️ **`"*"` („ყველა მოდული") 2026-09-15-ს მოიხსნა** — იხ.
 * `expand_wildcard_role_permissions`. ფასი ცნობილია და მიღებული: ხვალ
 * დამატებული მოდული ყველა როლზე **ცხადად** უნდა მოინიშნოს.
 *
 * მოდულზე **წვდომა** (ვინ ხედავს მოდულს) ისევ `module_user`-შია — ეს ორი
 * მექანიზმი ერთმანეთს არ ცვლის.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('key', 60)->unique();
            $table->string('name_ka');
            $table->string('name_en');
            // null = შეზღუდვის გარეშე (მხოლოდ სისტემურ `super_admin`-ზე)
            $table->json('permissions')->nullable();
            // სისტემური როლი არ იშლება და უფლებები არ ეჭრება
            $table->boolean('is_system')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $now = now();
        $ids = [];

        foreach ([
            ['key' => 'super_admin', 'name_ka' => 'სუპერ-ადმინი', 'name_en' => 'Super admin', 'permissions' => null, 'is_system' => true, 'sort_order' => 1],
            /* ⚠️ **ცარიელი და არა `['*' => FULL]` (2026-09-15).** „ყველა მოდულის"
               ნიღაბი მოიხსნა (იხ. `expand_wildcard_role_permissions`), აქ კი
               მოდულების სია ვერც დაიწერება: მიგრაცია სიდერამდე გადის, ე.ი.
               `modules` ცხრილი ჯერ ცარიელია. ამ როლს **`ModulesSeeder`
               ავსებს** — ის იცნობს მოდულების კანონიკურ სიას. */
            ['key' => 'user', 'name_ka' => 'მომხმარებელი', 'name_en' => 'User', 'permissions' => json_encode([]), 'is_system' => true, 'sort_order' => 2],
        ] as $role) {
            $ids[$role['key']] = DB::table('roles')->insertGetId($role + ['created_at' => $now, 'updated_at' => $now]);
        }

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('avatar_path')->constrained('roles')->nullOnDelete();
        });

        foreach ($ids as $key => $id) {
            DB::table('users')->where('role', $key)->update(['role_id' => $id]);
        }
        // role-ის გარეშე დარჩენილი (თეორიულად არ უნდა იყოს) — ჩვეულებრივი მომხმარებელი
        DB::table('users')->whereNull('role_id')->update(['role_id' => $ids['user']]);

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropColumn('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['super_admin', 'user'])->default('user')->after('avatar_path');
        });

        $keys = DB::table('roles')->pluck('key', 'id');
        foreach ($keys as $id => $key) {
            DB::table('users')->where('role_id', $id)
                ->update(['role' => $key === 'super_admin' ? 'super_admin' : 'user']);
        }

        Schema::table('users', function (Blueprint $table) {
            $table->index('role');
            $table->dropConstrainedForeignId('role_id');
        });

        Schema::dropIfExists('roles');
    }
};
