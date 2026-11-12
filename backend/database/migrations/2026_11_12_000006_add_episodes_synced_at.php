<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **როდის ჩამოიტვირთა სეზონები და სერიები ბოლოს** — სერიალი და ანიმე.
 *
 * სეზონები და სერიები აქამდე მხოლოდ თითო სერიალზე ცალ-ცალკე იტვირთებოდა; „ყველა
 * სერიალზე" გაშვებას უნდა ახსოვდეს, რომელი უკვე განახლდა — შეწყვეტილი გაშვება
 * თავიდან კი არ იწყება, არამედ გრძელდება (`EpisodeController::plan`).
 */
return new class extends Migration
{
    private const TABLES = ['series', 'animes'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (! Schema::hasColumn($table, 'episodes_synced_at')) {
                Schema::table($table, fn (Blueprint $t) => $t->timestamp('episodes_synced_at')->nullable());
            }
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            if (Schema::hasColumn($table, 'episodes_synced_at')) {
                Schema::table($table, fn (Blueprint $t) => $t->dropColumn('episodes_synced_at'));
            }
        }
    }
};
