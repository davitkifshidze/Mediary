<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **`runtime` სვეტი იშლება ფილმიდან, სერიალიდან და ანიმედან.**
 *
 * ფილმზე ის არასდროს ივსებოდა, სერიალსა და ანიმეზე — მხოლოდ სინქრონიზაციით, და
 * არსად გამოიყენებოდა: არც სიაში, არც ფილტრში, არც სტატისტიკაში.
 *
 * ⚠️ **სერიის** ხანგრძლივობა (`tv_episodes.runtime`) რჩება — ის სერიების სიაში ჩანს.
 */
return new class extends Migration
{
    private const TABLES = ['movies', 'series', 'animes'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (Schema::hasColumn($table, 'runtime')) {
                Schema::table($table, fn (Blueprint $t) => $t->dropColumn('runtime'));
            }
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            if (! Schema::hasColumn($table, 'runtime')) {
                Schema::table($table, fn (Blueprint $t) => $t->unsignedSmallInteger('runtime')->nullable());
            }
        }
    }
};
