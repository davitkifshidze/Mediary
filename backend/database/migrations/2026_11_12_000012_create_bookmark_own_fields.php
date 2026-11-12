<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ბუკმარკის საკუთარი ველები** — „სახელი → მნიშვნელობა" წყვილები ერთ ჩანაწერზე
 * (ტექპასპორტის ნომერი, მანქანის ნომერი, შეკვეთის კოდი), რომლებიც ფანჯრიდან
 * ერთი დაჭერით კოპირდება.
 *
 * ⚠️ ეს **მოდულის დამატებითი ველები არ არის** (`bookmark_field_values` — ერთი
 * განსაზღვრება ყველა ბუკმარკზე): აქ თითო ჩანაწერს თავისი სია აქვს.
 * ⚠️ `value` **დაშიფრულია** (`BookmarkOwnField`) — ამიტომ `text`-ია და მასზე
 * ინდექსი ან `LIKE` აზრს მოკლებულია.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookmark_own_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('bookmark_id')->constrained()->cascadeOnDelete();
            $table->string('label', 100);
            $table->text('value')->nullable();
            // საიდუმლო: ეკრანზე წერტილებად, ძებნაში და ჟურნალში — არსად
            $table->boolean('is_secret')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['bookmark_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookmark_own_fields');
    }
};
