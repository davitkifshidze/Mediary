<?php

use App\Support\AuditRegistry;
use App\Support\Openable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **„შევედი N-ჯერ" ჟურნალში გადადის და ცხრილი იშლება**.
 *
 * შენი სიტყვები: „შესვლების რაოდენობა — ეგ საერთოდ გამიუქმე… ეგ მჭირდება აუდიტ
 * ლოგში მხოლოდ: ვინ რა გახსნა და რამდენჯერ შევიდა". `record_visits`-ის თითო
 * რიგი → `audit_logs`-ის `open` რიგი: ვინ (`user_id` + სახელის ასლი), რა
 * (`subject_*`, სათაური ჩანაწერიდან — თუ ჯერ არსებობს), როდის (`visited_at` →
 * `created_at`), საიდან (`context.source`; `migrated` — გადმოტანილის ნიშანი).
 *
 * ⚠️ მოდელები `withoutGlobalScopes()`-ით იკითხება — მიგრაციას „მიმდინარე
 * მომხმარებელი" არ ჰყავს და `owner`/`trash` scope ყველაფერს დამალავდა.
 * ⚠️ ცარიელ (ახალ) ბაზაზე ციკლი არ ეშვება, ე.ი. აპის კლასები საერთოდ არ იკითხება.
 * ⚠️ `down()` ცხრილს **ცარიელს** აბრუნებს: ჟურნალიდან უკან გადატანა აზრს
 * კარგავს — გახსნა ახლა სხვა ფაქტია (წუთის ფანჯრით და არა საათის).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('record_visits')) {
            return;
        }

        DB::table('record_visits')->chunkById(500, function ($rows) {
            $insert = [];

            foreach ($rows as $row) {
                $record = $this->record((string) $row->visitable_type, (int) $row->visitable_id);

                $insert[] = [
                    'user_id' => $row->user_id,
                    'user_label' => $row->viewer_name,
                    'action' => 'open',
                    'module' => $this->module((string) $row->visitable_type, $record),
                    'subject_type' => $row->visitable_type,
                    'subject_id' => $row->visitable_id,
                    'subject_label' => $record ? AuditRegistry::labelFor($record) : null,
                    'context' => json_encode(['source' => $row->source, 'migrated' => 'record_visits']),
                    'created_at' => $row->visited_at,
                ];
            }

            if ($insert !== []) {
                DB::table('audit_logs')->insert($insert);
            }
        });

        Schema::drop('record_visits');
    }

    public function down(): void
    {
        if (Schema::hasTable('record_visits')) {
            return;
        }

        Schema::create('record_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('viewer_name', 120)->nullable();
            $table->string('visitable_type', 40);
            $table->unsignedBigInteger('visitable_id');
            $table->string('source', 10)->default('library');
            $table->dateTime('visited_at');

            $table->index(['visitable_type', 'visitable_id', 'visited_at'], 'record_visits_target_idx');
            $table->index(['visitable_type', 'visitable_id', 'user_id', 'visited_at'], 'record_visits_dedupe_idx');
            $table->index(['owner_id', 'visited_at'], 'record_visits_owner_idx');
        });
    }

    /** ჩანაწერი (ურნაში მყოფიც) — სათაურისა და პირადი მოდულის გასაღებისთვის */
    private function record(string $type, int $id): ?Model
    {
        $class = Openable::TYPES[$type] ?? null;
        if ($class === null) {
            return null;
        }

        /** @var ?Model $record */
        $record = $class::query()->withoutGlobalScopes()->find($id);

        if ($record && method_exists($record, 'translations')) {
            $record->loadMissing('translations');
        }

        return $record;
    }

    /** `Openable::module()`-ის იგივე წესი — წაშლილ ჩანაწერზეც (`custom_record` → `null`) */
    private function module(string $type, ?Model $record): ?string
    {
        return match ($type) {
            'playlist' => 'song',
            'custom_record' => $record ? (string) $record->getAttribute('module') : null,
            default => $type,
        };
    }
};
