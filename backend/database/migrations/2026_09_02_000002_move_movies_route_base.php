<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Tasks 2.2 — მთავარი გვერდი (`/`) დეშბორდს გადაეცა, ე.ი. ფილმების
 * ბიბლიოთეკა `/movies`-ზე გადავიდა. `modules.route_base` ამას უნდა ასახავდეს,
 * თორემ ნავიგაცია (რომელიც ბაზიდან იგება) დეშბორდსა და ფილმებს აირევდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('modules')->where('key', 'movie')->where('route_base', '/')
            ->update(['route_base' => '/movies']);
    }

    public function down(): void
    {
        DB::table('modules')->where('key', 'movie')->where('route_base', '/movies')
            ->update(['route_base' => '/']);
    }
};
