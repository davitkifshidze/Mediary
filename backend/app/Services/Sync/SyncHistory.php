<?php

namespace App\Services\Sync;

use App\Models\SyncRun;
use App\Models\SyncRunItem;
use App\Services\Cast\CastEnricher;
use App\Services\Translation\ItemTranslator;
use App\Support\AppTime;
use App\Support\SyncOutcome;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Throwable;

/**
 * **სინქრონიზაციის ისტორიის ერთადერთი მწერალი.**
 *
 * გაშვება ორი გზით მიდის — ფონური პარტიით (`RunBatchItem`) და ბრაუზერის რიგით
 * (თითო ერთეულზე ერთი მოკლე მოთხოვნა: `/media/sync/…`, `/translations/…`,
 * `/cast/sync/…`). ორივე ერთეულის შედეგს აქ აწერს, გაშვების გასაღებით: პარტიაზე
 * ეს მისი id-ია, რიგზე — რიგის მიერ გენერირებული `run` (მოთხოვნის პარამეტრი).
 * გაშვების რიგი პირველივე ერთეულზე იქმნება; **რაზე და რით** ეშვება (დაგეგმილი სია და
 * პარამეტრები), ცალკე იწერება — `open()`: მისით გრძელდება გაწყვეტილი გაშვება.
 *
 * ⚠️ **ისტორია ვერასდროს ტეხს სინქრონიზაციას** (`AuditLogger`-ის წესი): ჩაწერა
 * try/catch-შია და ჩავარდნა მხოლოდ `report()`-ით ფიქსირდება.
 * ⚠️ **იწერება ველების სიაც და მათი მნიშვნელობებიც**: `changes` — რა შეიცვალა
 * („პოსტერი, აღწერა"), `details` — რა რით (`SyncFacts`: ძველი → ახალი, სიაზე რა
 * დაემატა და რა მოაკლდა, ფაილზე მხოლოდ ფაქტი). ორივე მხოლოდ „განახლდა" შედეგზე.
 * ⚠️ ჟურნალში (`audit_logs`) აქედან არაფერი იწერება — ეს მანქანის ჟურნალია.
 */
class SyncHistory
{
    public const KIND_SYNC = 'sync';

    public const KIND_EPISODES = 'episodes';

    public const KIND_CAST = 'cast';

    public const KIND_TRANSLATE = 'translate';

    /** გაშვების სახეობები: მონაცემები · სეზონები და სერიები · მსახიობები · თარგმანი */
    public const KINDS = [self::KIND_SYNC, self::KIND_EPISODES, self::KIND_CAST, self::KIND_TRANSLATE];

    public const SOURCE_BATCH = 'batch';

    public const SOURCE_QUEUE = 'queue';

    public const UPDATED = 'updated';

    public const UNCHANGED = 'unchanged';

    public const SKIPPED = 'skipped';

    public const FAILED = 'failed';

    public const RESULTS = [self::UPDATED, self::UNCHANGED, self::SKIPPED, self::FAILED];

    /** მსახიობის ერთეულის ტიპი — მედია-დომენი არ არის (`RunBatchItem::ACTOR`) */
    public const ACTOR = 'actor';

    /** ერთ გაშვებაში მაქსიმუმ რამდენი ერთეული ითვლება დაგეგმილად (`BatchLauncher::MAX_ITEMS`) */
    public const MAX_TOTAL = 5000;

    /**
     * **გაშვების გახსნა: რაზე და რით ეშვება.** დაგეგმილი ერთეულები (`plan`) და
     * პარამეტრები (`params`) აქ იწერება — გაწყვეტილი გაშვება ამით გრძელდება.
     *
     * ფონურ პარტიაზე ამას პარტიის გამშვები იძახებს (გასაღები და `batch_id` — პარტიის
     * id), ბრაუზერის რიგზე — რიგი თვითონ, გაშვების დასაწყისში (`POST /sync/runs`).
     *
     * ⚠️ პირველი ერთეულის შედეგმა შეიძლება დაასწროს — გაშვება მაშინ უკვე არსებობს
     * გეგმის გარეშე და აქ მხოლოდ ივსება; ერთხელ ჩაწერილი გეგმა აღარ იცვლება.
     *
     * @param  list<array{type: string, id: int|string}>  $items
     * @param  array<string, mixed>  $options  გაშვების პარამეტრები — ნედლად; ინახება მხოლოდ სახეობის ნაცნობი გასაღებები
     */
    public function open(int $userId, string $key, string $kind, string $source, array $items, array $options = [], ?string $batchId = null): ?SyncRun
    {
        if (! in_array($kind, self::KINDS, true) || ! Str::isUuid($key)) {
            return null;
        }

        try {
            $plan = [];

            foreach (array_slice($items, 0, self::MAX_TOTAL) as $item) {
                $plan[(string) $item['type']][(int) $item['id']] = true;
            }

            $plan = array_map(fn (array $ids) => array_keys($ids), $plan);
            $total = array_sum(array_map('count', $plan));
            $facts = ['params' => self::params($kind, $options), 'plan' => $plan, 'batch_id' => $batchId];

            $run = SyncRun::withoutGlobalScope('owner')->firstOrCreate(
                ['user_id' => $userId, 'key' => $key],
                ['kind' => $kind, 'source' => $source, 'total' => $total, ...$facts],
            );

            if (! $run->wasRecentlyCreated && $run->plan === null) {
                $run->update(['total' => max($total, (int) $run->total), ...$facts]);
            }

            return $run;
        } catch (Throwable $e) {
            report($e);

            return null;
        }
    }

    /**
     * გაშვების პარამეტრები — მხოლოდ ის გასაღებები, რომლებიც ამ სახეობის ერთეულს მართლა
     * გადაეცემა (`RunBatchItem::run()`); პაუზა (`delay_ms`) გაშვების ფაქტი არ არის.
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public static function params(string $kind, array $options): array
    {
        $list = fn (string $key, array $allowed) => array_values(array_intersect($allowed, array_map('strval', (array) ($options[$key] ?? []))));

        return match ($kind) {
            self::KIND_SYNC => [
                'fields' => $list('fields', ItemSyncer::FIELDS),
                'media' => (bool) ($options['media'] ?? false),
                'only_missing' => (bool) ($options['only_missing'] ?? false),
                'overwrite' => (bool) ($options['overwrite'] ?? false),
            ],
            self::KIND_TRANSLATE => [
                'sources' => $list('sources', ItemTranslator::SOURCES) ?: ItemTranslator::SOURCES,
                'review' => (bool) ($options['review'] ?? false),
            ],
            self::KIND_CAST => [
                'fields' => $list('fields', CastEnricher::FIELDS) ?: CastEnricher::FIELDS,
                'overwrite_photo' => (bool) ($options['overwrite_photo'] ?? false),
            ],
            default => [],
        };
    }

    /**
     * გაშვებას ახალი ფონური პარტია ავსებს (გაგრძელება, ან ბრაუზერის რიგმა დარჩენილი
     * სერვერს გადასცა): „გაჩერებულია" იხსნება და ბოლო აქტივობის დრო ახლდება.
     */
    public function attach(SyncRun $run, string $batchId): void
    {
        $run->forceFill(['batch_id' => $batchId, 'stopped_at' => null])->save();
        $run->touch();
    }

    /**
     * გაშვება ხელით გაჩერდა. ⚠️ `updated_at` არ იცვლება — ის ბოლო **ერთეულის** დროა და
     * გაშვებების სია მისით ლაგდება.
     */
    public function stop(SyncRun $run): void
    {
        $run->timestamps = false;
        $run->forceFill(['stopped_at' => AppTime::now()])->save();
        $run->timestamps = true;
    }

    /**
     * ერთეულის შედეგის ჩაწერა.
     *
     * @param  list<string>  $changes  შეცვლილი ველების გასაღებები (`poster`, `description_ka`, `seasons:8`…)
     * @param  list<array<string, mixed>>  $details  რა რით შეიცვალა (`SyncFacts::changes()`)
     */
    public function record(
        int $userId,
        string $key,
        string $kind,
        string $source,
        int $total,
        string $type,
        int $recordId,
        ?string $title,
        string $result,
        array $changes = [],
        ?string $reason = null,
        array $details = [],
    ): void {
        if (! in_array($kind, self::KINDS, true) || ! in_array($result, self::RESULTS, true) || ! Str::isUuid($key)) {
            return;
        }

        try {
            $total = max(0, min(self::MAX_TOTAL, $total));

            $run = SyncRun::withoutGlobalScope('owner')->firstOrCreate(
                ['user_id' => $userId, 'key' => $key],
                // ფონური პარტიის გაშვების გასაღები თვითონ პარტიის id-ია
                ['kind' => $kind, 'source' => $source, 'total' => $total, 'batch_id' => $source === self::SOURCE_BATCH ? $key : null],
            );

            // რიგს ერთეულები გზადაგზა შეიძლება დაემატოს — დაგეგმილი რიცხვი მხოლოდ იზრდება
            if ($total > (int) $run->total) {
                $run->update(['total' => $total]);
            }

            SyncRunItem::updateOrCreate(
                ['sync_run_id' => $run->getKey(), 'type' => $type, 'record_id' => $recordId],
                [
                    /* ⚠️ უსათაურო შედეგი ადრე ჩაწერილ სათაურს არ შლის: თავიდან გაშვებული
                       ერთეული, რომლის ჩანაწერიც მანამდე წაიშალა, სიაში ისევ თავისი სახელით რჩება */
                    ...($title === null ? [] : ['title' => mb_substr($title, 0, 200)]),
                    'result' => $result,
                    'reason' => $reason === null || $reason === '' ? null : mb_substr($reason, 0, 500),
                    'changes' => $result === self::UPDATED && $changes !== [] ? array_values(array_unique($changes)) : null,
                    'details' => $result === self::UPDATED && $details !== [] ? array_values($details) : null,
                ],
            );

            // „ბოლოს როდის" — გაშვების სია ამით ლაგდება და ამბობს, მიმდინარეობს თუ არა
            $run->touch();
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * ბრაუზერის რიგის ერთეული: გასაღები და დაგეგმილი რიცხვი მოთხოვნაში მოდის
     * (`run`, `run_total`). გასაღების გარეშე მოთხოვნა ერთეულოვანი ღილაკია — ისტორიაში
     * არ იწერება.
     *
     * @param  array{0: string, 1: list<string>, 2: ?string}  $outcome  `outcome()` / `castOutcome()`
     * @param  list<array<string, mixed>>  $details  რა რით შეიცვალა (`SyncFacts::changes()`)
     */
    public function fromRequest(Request $request, string $kind, string $type, int $recordId, ?string $title, array $outcome, array $details = []): void
    {
        $key = $request->input('run');
        $user = $request->user();

        if (! $this->tracks($request)) {
            return;
        }

        [$result, $changes, $reason] = $outcome;

        $this->record(
            (int) $user->getKey(),
            $key,
            $kind,
            self::SOURCE_QUEUE,
            (int) $request->input('run_total', 0),
            $type,
            $recordId,
            $title,
            $result,
            $changes,
            $reason,
            $details,
        );
    }

    /**
     * ეს მოთხოვნა ისტორიაში იწერება? — რიგის ერთეულს გასაღები (`run`) მოაქვს, ერთეულოვან
     * ღილაკს არა. ⚠️ `SyncFacts::watch()` ამით იგებს, წაიკითხოს თუ არა ჩანაწერი გაშვებამდე.
     */
    public function tracks(Request $request): bool
    {
        return is_string($request->input('run')) && $request->user() !== null;
    }

    /**
     * `ItemSyncer` / `ItemTranslator`-ის პასუხი → შედეგი, შეცვლილი ველები, მიზეზი.
     *
     * ⚠️ „ცარიელი" (წყარომ არაფერი დააბრუნა) გამოტოვებაა მიზეზით და არა „უცვლელი":
     * ჩანაწერი დამუშავებულად არ ითვლება და გეგმა მას ისევ სთავაზობს (`SyncOutcome`).
     *
     * @param  array<string, mixed>  $result
     * @return array{0: string, 1: list<string>, 2: ?string}
     */
    public static function outcome(array $result): array
    {
        if (($result['ok'] ?? true) === false) {
            return [self::FAILED, [], (string) ($result['error'] ?? 'failed')];
        }

        if (($result['skipped'] ?? false) === true) {
            return [self::SKIPPED, [], isset($result['error']) ? (string) $result['error'] : null];
        }

        $state = $result['result'] ?? null;
        $changed = array_values(array_unique(array_map('strval', (array) ($result['changed'] ?? []))));

        if ($state === SyncOutcome::EMPTY) {
            return [self::SKIPPED, [], SyncOutcome::EMPTY];
        }

        if ($state === SyncOutcome::UNCHANGED || ($state !== SyncOutcome::UPDATED && $changed === [])) {
            return [self::UNCHANGED, [], null];
        }

        return [self::UPDATED, $changed, null];
    }

    /**
     * `CastEnricher::run()`-ის პასუხი → იგივე სამეული.
     *
     * @return array{0: string, 1: list<string>, 2: ?string}
     */
    public static function castOutcome(string $result, CastEnricher $enricher): array
    {
        return match ($result) {
            CastEnricher::UPDATED => [self::UPDATED, $enricher->lastChanged(), null],
            CastEnricher::UNCHANGED => [self::UNCHANGED, [], null],
            CastEnricher::FAILED => [self::FAILED, [], $enricher->lastError() ?? 'tmdb_unavailable'],
            // `tmdb_empty` · `no_tmdb_id` — ხელახლა ცდა არაფერს შეცვლის
            default => [self::SKIPPED, [], $result],
        };
    }

    /**
     * `EpisodeSync::sync()`-ის პასუხი → იგივე სამეული; რიცხვები „შეცვლილში" მიდის
     * (`seasons:8`, `episodes:73`) — სერვისი თვითონ არ ამბობს, რამდენი იყო ახალი.
     *
     * @param  array<string, mixed>  $result
     * @return array{0: string, 1: list<string>, 2: ?string}
     */
    public static function episodesOutcome(array $result): array
    {
        if (($result['ok'] ?? false) !== true) {
            $error = (string) ($result['error'] ?? 'failed');

            // ხელით შექმნილ სერიალს TMDB-ზე წყარო არ აქვს — ეს შეცდომა არაა
            return [$error === 'no_tmdb_id' ? self::SKIPPED : self::FAILED, [], $error];
        }

        return [self::UPDATED, ['seasons:'.(int) ($result['seasons'] ?? 0), 'episodes:'.(int) ($result['episodes'] ?? 0)], null];
    }
}
