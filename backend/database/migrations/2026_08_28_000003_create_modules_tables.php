<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * I7 / ეტაპი 3 — მოდულების რეესტრი და per-user ჩართვა.
 * ფილმები/სერიალები ხდება პირველი ორი „plug-in" (იხ. ModulesSeeder).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('modules', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();          // movie | series | anime | video …
            $table->string('name_ka');
            $table->string('name_en');
            $table->string('description_ka')->nullable();
            $table->string('description_en')->nullable();
            $table->string('icon')->default('LayoutGrid');   // lucide-react-ის კომპონენტის სახელი
            $table->string('route_base');                    // '/' | '/series'
            $table->string('api_base');                      // '/movies' | '/series'
            $table->string('morph_alias')->nullable();       // polymorphic pivot-ების alias
            $table->boolean('is_sensitive')->default(false); // adult — ცალკე gate, default off
            $table->boolean('enabled_by_default')->default(false);
            $table->boolean('is_active')->default(true);     // ადმინს შეუძლია მთლიანად გამორთოს
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('module_user', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('module_id')->constrained()->cascadeOnDelete();
            $table->json('settings')->nullable();        // per-user per-module პარამეტრები
            $table->timestamp('enabled_at')->nullable();
            $table->primary(['user_id', 'module_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('module_user');
        Schema::dropIfExists('modules');
    }
};
