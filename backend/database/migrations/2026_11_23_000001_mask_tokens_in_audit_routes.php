<?php

use App\Services\Audit\AuditLogger;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **უკვე ჩაწერილ აუდიტის რიგებში ტოკენის ნიღაბი.**
 *
 * `route` სვეტი მოთხოვნის გზას უცვლელად წერდა: `api/shares/{token}/…`,
 * `api/public/shares/{token}/…` და პაროლის აღდგენის გზა ტოკენს ღიად ინახავდა,
 * თუმცა ბაზაში ის მხოლოდ ჰეშადაა. ახლა `AuditLogger::maskPath()` ნიღბავს ჩაწერამდე;
 * ეს მიგრაცია იმავე წესით ასწორებს ძველ რიგებს.
 *
 * ⚠️ უკან დაბრუნება შეუძლებელია — ტოკენი აღარსად ინახება, და ეს სწორედ მიზანია.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('audit_logs')) {
            return;
        }

        DB::table('audit_logs')
            ->where(function ($q) {
                foreach (['api/shares/', 'api/public/shares/', 'share/', 'api/auth/reset/', 'reset/'] as $prefix) {
                    $q->orWhere('route', 'like', $prefix.'%');
                }
            })
            ->select(['id', 'route'])
            ->orderBy('id')
            ->chunkById(500, function ($rows) {
                foreach ($rows as $row) {
                    $masked = AuditLogger::maskPath((string) $row->route);

                    if ($masked !== $row->route) {
                        DB::table('audit_logs')->where('id', $row->id)->update(['route' => $masked]);
                    }
                }
            });
    }

    public function down(): void
    {
        // ნიღაბი შეუქცევადია
    }
};
