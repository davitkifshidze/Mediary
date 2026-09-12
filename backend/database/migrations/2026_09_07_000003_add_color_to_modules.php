<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **მოდულის ფერი (Tasks §2.1).**
 *
 * გვერდის ჰედერს გამოყოფილი ფონი სჭირდება და ფერი **მოდულს ეკუთვნის** —
 * ე.ი. ერთხელ ინიშნება `/modules/{key}`-ზე და ყველა იმ მოდულის გვერდზე
 * მუშაობს (ბიბლიოთეკა, ფორმა, ლექსიკონები).
 *
 * ⚠️ **ფერი გლობალურია და არა per-user** (`module_user.settings`-ში არაა):
 * „მოდულის ფერი" ნიშნავს, რომ ვიდეო ყველასთვის ერთი ფერისაა — თორემ ორი
 * ანგარიშის ეკრანი ვერ შედარდებოდა და support-ის კითხვა „რომელი ფერია
 * ვიდეო" პასუხის გარეშე დარჩებოდა.
 *
 * ⚠️ **`null` = ფერის გარეშე** და ჰედერი ნეიტრალურ ფონს იღებს. ეს ცხადი
 * მდგომარეობაა და არა „ჯერ არ შევსებული": მოდულს შეიძლება ფერი არ სურდეს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('modules', function (Blueprint $table) {
            // hex (`#rrggbb`) — 7 სიმბოლო; ვალიდაცია კონტროლერშია
            $table->string('color', 16)->nullable()->after('icon');
        });
    }

    public function down(): void
    {
        Schema::table('modules', function (Blueprint $table) {
            $table->dropColumn('color');
        });
    }
};
