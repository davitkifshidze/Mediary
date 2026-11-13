<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **სინქრონიზაციის ერთეულზე — რა რით შეიცვალა.**
 *
 * `changes` მხოლოდ შეცვლილი ველების სახელებს ინახავს („აღწერა, პოსტერი") — ისტორია
 * პასუხობდა კითხვას „რა განახლდა", მაგრამ არა „რით". `details` ყოველ შეცვლილ ველზე
 * ძველ და ახალ მნიშვნელობას წერს (`SyncFacts`): ტექსტსა და რიცხვს — „იყო → გახდა",
 * სიას (ჟანრები, მსახიობები) — რა დაემატა და რა მოაკლდა, ფაილს (პოსტერი, ფოტო) —
 * მხოლოდ ფაქტს, მისამართის გარეშე; თარგმანს თან ახლავს, რომელმა წყარომ შეავსო.
 *
 * ⚠️ ძველ გაშვებებს მნიშვნელობები არ აქვს (`null`) — იქ ისევ ველების სია ჩანს.
 * ⚠️ `changes` რჩება: ის ამბობს, რა შეიცვალა, იმ ველებზეც, რომელთა მნიშვნელობა არ
 * იწერება (მსახიობების ფოტოები).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sync_run_items', function (Blueprint $table) {
            $table->json('details')->nullable()->after('changes');
        });
    }

    public function down(): void
    {
        Schema::table('sync_run_items', function (Blueprint $table) {
            $table->dropColumn('details');
        });
    }
};
