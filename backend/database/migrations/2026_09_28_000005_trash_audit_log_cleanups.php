<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **აუდიტის ლოგის გასუფთავება ურნაში — ერთ ელემენტად (Tasks §29.8).**
 *
 * შენი გადაწყვეტილება (Q39 — „ა"): აკრეფილი `DELETE`-ით წაშლაც ურნაში მიდის.
 * ⚠️ **ათასი ცალკე რიგი ურნას დამარხავდა**, ამიტომ გასუფთავება ერთი
 * `trash_entries` რიგია (`kind = audit_log`), ლოგის რიგები კი მას
 * `trash_entry_id`-ით მიებმის და ჩვეულებრივ წაკითხვას ემალება
 * (`AuditLog`-ის `trash` scope).
 *
 * ⚠️ **`cascadeOnDelete` თვითონ არის საბოლოო წაშლა**: ურნის ელემენტის
 * წაშლა (ხელით, დაცლით ან ვადის გასვლით) ლოგის რიგებს SQL-კასკადით შლის —
 * ლოგის რიგს ფაილი არ აქვს და მოვლენა არ სჭირდება, ე.ი. მეორე წამშლელი
 * კოდი არ იწერება. აღდგენა კი სვეტს ასუფთავებს **ელემენტის წაშლამდე**.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('audit_logs', 'trash_entry_id')) {
            return;
        }

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->foreignId('trash_entry_id')->nullable()->constrained('trash_entries')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('audit_logs', 'trash_entry_id')) {
            return;
        }

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('trash_entry_id');
        });
    }
};
