<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * K3 — მიმაგრებული ფაილები და ჩანიშვნები.
 *
 * ორივე **polymorphic**-ია: დღეს ვიდეოებს ეკიდება, ხვალ შემსრულებლის
 * ფოტო-გალერეას (K5) ან სხვა მოდულს — ცხრილის შეცვლის გარეშე.
 *
 * `user_id` აქაც არის (და არა მხოლოდ მშობელზე), რომ `BelongsToUser`-ის
 * global scope-მა პირდაპირ იმუშაოს ფაილის route-ზეც.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->morphs('attachable');                       // attachable_type + attachable_id
            $table->enum('kind', ['image', 'doc'])->default('image');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'kind']);
        });

        Schema::create('notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->morphs('notable');
            $table->text('body');
            $table->timestamps();

            $table->index(['user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notes');
        Schema::dropIfExists('attachments');
    }
};
