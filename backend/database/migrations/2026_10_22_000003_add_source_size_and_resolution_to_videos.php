<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **წყაროს ზომა და გარჩევადობა** — „1080p · ~420 MB" ხანგრძლივობის გვერდით.
 *
 * ⚠️ ორივე **წყაროსია** და არა ლოკალური ასლის (`download_size`/`download_format`
 * ჩამოწერის შემდეგ იწერება): `yt-dlp -J`-ის `filesize_approx` ჩამოსატვირთი
 * ფორმატისაა და მიახლოებითია, `resolution` — „1080p" (ვიწრო გვერდით).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->unsignedBigInteger('source_size')->nullable()->after('duration');
            $table->string('resolution', 20)->nullable()->after('source_size');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn(['source_size', 'resolution']);
        });
    }
};
