<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **სტუმრის შიდა გვერდის ბლოკები გაზიარების ბმულზე.**
 *
 * ბმულის მიმღები აქამდე მხოლოდ ბარათებს ხედავდა; ჩანაწერის შიდა გვერდზე რა გამოჩნდეს,
 * ბმულის შექმნისას ინიშნება: გალერეა · მსახიობები · თრეილერი (ჩემი ქულა და სტატუსი —
 * არსებული `show_rating` / `show_status`).
 *
 * ⚠️ ნაგულისხმევად სამივე გამორთულია: ძველი ბმული იმაზე მეტს არ უნდა აჩვენებდეს,
 * ვიდრე შექმნისას იყო ნათქვამი.
 */
return new class extends Migration
{
    private const COLUMNS = ['show_gallery', 'show_cast', 'show_trailer'];

    public function up(): void
    {
        Schema::table('share_links', function (Blueprint $table) {
            foreach (self::COLUMNS as $column) {
                if (! Schema::hasColumn('share_links', $column)) {
                    $table->boolean($column)->default(false);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('share_links', function (Blueprint $table) {
            foreach (self::COLUMNS as $column) {
                if (Schema::hasColumn('share_links', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
