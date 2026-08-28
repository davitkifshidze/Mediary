<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * I7 — ადმინთან გასაგზავნი მოთხოვნები (user-ის შეთანხმებული ქცევა):
 *  · `module_access` — მომხმარებელი ითხოვს მოდულის ჩართვას (რეგისტრაცია ღიაა,
 *    მოდულები კი მოთხოვნით ირთვება);
 *  · `genre_delete`  — ჟანრები გლობალურია, ამიტომ ჩვეულებრივი user-ის წაშლა
 *    პირდაპირ არ სრულდება, არამედ ადმინთან მიდის დასადასტურებლად.
 *
 * ერთი ცხრილი ორივესთვის — ახალი ტიპი = ერთი enum მნიშვნელობა + handler.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['module_access', 'genre_delete']);
            $table->foreignId('module_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('genre_id')->nullable()->constrained()->nullOnDelete();
            $table->json('payload')->nullable();      // მაგ. genre_delete: reassign_to, ჟანრის სახელი
            $table->text('message')->nullable();      // მომხმარებლის კომენტარი
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->timestamps();

            $table->index(['status', 'type']);
            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_requests');
    }
};
