<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * K13 — მომხმარებელს შეუძლია თვითონ გამორთოს ჩართული მოდული.
 *
 * წაშლის (detach) ნაცვლად დროშას ვიყენებთ: ასე უფლება რჩება და ჩართვა
 * ადმინის ხელახალ დადასტურებას აღარ საჭიროებს. super_admin-ს pivot-ი
 * შეიძლება საერთოდ არ ჰქონდეს — გამორთვისას იქმნება `is_hidden = true`-თი.
 *
 * ⚠️ სვეტი განზრახ **`is_hidden`**-ია და არა `hidden`: `hidden` Eloquent-ის
 * protected თვისებაა (სერიალიზაციისთვის დამალული ველების სია), ამიტომ
 * `$model->pivot->hidden` მოდელის შიგნიდან სვეტს კი არა, **იმ მასივს** აბრუნებს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('module_user', function (Blueprint $table) {
            $table->boolean('is_hidden')->default(false)->after('settings');
        });
    }

    public function down(): void
    {
        Schema::table('module_user', function (Blueprint $table) {
            $table->dropColumn('is_hidden');
        });
    }
};
