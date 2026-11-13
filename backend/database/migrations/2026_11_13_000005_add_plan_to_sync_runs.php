<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **გაშვებამ იცის, რაზე და რით გაეშვა** — გაწყვეტილი გაშვება ამით გრძელდება.
 *
 * აქამდე ისტორიამ იცოდა, რამდენი ერთეული იყო დაგეგმილი (`total`) და რომლებს აქვს
 * შედეგი, მაგრამ **დაგეგმილი სია არ ინახებოდა**: ჩანართის დახურვით, რიგის შეჩერებით,
 * პარტიის შეწყვეტით ან სერვერის გათიშვით გაწყვეტილ გაშვებაზე მხოლოდ „12 / 170" ეწერა
 * და დარჩენილის გასაშვებად იგივე ფილტრი თავიდან უნდა აგეწყო.
 *
 * `plan` — დაგეგმილი ერთეულები, ტიპი → id-ები (`{"movie":[3,7],"series":[2]}`);
 * `params` — რით გაეშვა (ველები, გადაწერა, მედია, წყაროები — სახეობის მიხედვით);
 * `batch_id` — ფონური პარტია, რომელიც ამ გაშვებას **ახლა** ავსებს: პარტიით გაშვებულზე
 * თავიდანვე გასაღების ტოლია, გაგრძელებაზე — ახალი პარტიისა (გაშვება იგივე რჩება);
 * `stopped_at` — როდის გაჩერდა ხელით (ბრაუზერის რიგის „შეჩერება", პარტიის „შეწყვეტა").
 *
 * ⚠️ ძველ გაშვებებს არცერთი არ აქვს (`null`) — მათი გაგრძელება შეუძლებელია.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sync_runs', function (Blueprint $table) {
            $table->json('params')->nullable()->after('total');
            $table->json('plan')->nullable()->after('params');
            $table->uuid('batch_id')->nullable()->after('plan');
            $table->timestamp('stopped_at')->nullable()->after('batch_id');
        });
    }

    public function down(): void
    {
        Schema::table('sync_runs', function (Blueprint $table) {
            $table->dropColumn(['params', 'plan', 'batch_id', 'stopped_at']);
        });
    }
};
