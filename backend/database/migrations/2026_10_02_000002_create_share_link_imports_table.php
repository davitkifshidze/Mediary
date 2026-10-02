<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §40.8 — **ვინ დაიმატა ბმულიდან და რამდენი.**
 *
 * ბმულების სია „დამატებები"-ს **ვინ**-ით აჩვენებს (username-ები), მფლობელის
 * შეტყობინება კი „ერთი მიმღებზე დღეში"-ა — ორივეს ერთი რიგი სჭირდება ერთ
 * წყვილზე (ბმული · მიმღები). `share_links.imports` ჯამია და ამას ვერ იტყოდა.
 *
 * ⚠️ `notified_at` — ბოლო შეტყობინების მომენტი: რიგი ჩანაწერს სათითაოდ ამატებს,
 * ე.ი. მის გარეშე 300 ფილმი 300 შეტყობინებას დაწერდა.
 *
 * ⚠️ ყველა დროის სვეტი nullable-ია (MariaDB 10.4-ის `ON UPDATE` ხაფანგი —
 * `share_links`-ის მიგრაციის იგივე მიზეზი).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('share_link_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('share_link_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('added')->default(0);
            $table->timestamp('last_added_at')->nullable();
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();

            $table->unique(['share_link_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('share_link_imports');
    }
};
