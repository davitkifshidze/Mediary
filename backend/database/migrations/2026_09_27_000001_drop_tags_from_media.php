<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §10 — ფილმის, სერიალისა და ანიმეს პირადი ტეგები (FEAT-18) ქრება.
 *
 * შენი სიტყვები: „არც ფილტრაციაში და არც საერთოდ ტეგები არ მჭირდება".
 * ცოცხალ ბაზაში ტეგი 0 ჩანაწერს ჰქონდა (ფილმი 0/401, სერიალი 0/31,
 * ანიმე 0/2) — ე.ი. სვეტის წაშლით არაფერი იკარგება.
 *
 * ⚠️ `HasTags` ტრეიტი რჩება — მას ვიდეო, სიმღერა, წიგნი, ჩანაწერი და
 * ბუკმარკი იყენებს; მხოლოდ მედიის სამი ცხრილი იცვლება.
 *
 * ⚠️ `down()` სვეტს ცარიელად აბრუნებს — მონაცემი ისედაც არ იყო.
 */
return new class extends Migration
{
    private const TABLES = ['movies', 'series', 'animes'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (! Schema::hasColumn($table, 'tags')) {
                continue;
            }

            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn('tags');
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            if (Schema::hasColumn($table, 'tags')) {
                continue;
            }

            Schema::table($table, function (Blueprint $t) {
                $t->json('tags')->nullable();
            });
        }
    }
};
