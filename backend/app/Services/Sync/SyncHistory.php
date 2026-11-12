<?php

namespace App\Services\Sync;

use App\Models\SyncRun;
use App\Models\SyncRunItem;
use App\Services\Cast\CastEnricher;
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
 * გაშვების რიგი პირველივე ერთეულზე იქმნება — ცალკე „დაწყების" მოთხოვნა არ არსებობს.
 *
 * ⚠️ **ისტორია ვერასდროს ტეხს სინქრონიზაციას** (`AuditLogger`-ის წესი): ჩაწერა
 * try/catch-შია და ჩავარდნა მხოლოდ `report()`-ით ფიქსირდება.
 * ⚠️ **იწერება ველების სია და არა მნიშვნელობები**: „შეიცვალა: პოსტერი, აღწერა"
 * პასუხობს კითხვას „რა განახლდა"; კონკრეტული მნიშვნელობა ჩანაწერის გვერდზეა.
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

    /** ერთ გაშვებაში მაქსიმუმ რამდენი ერთეული ითვლება დაგეგმილად (`BatchController::MAX_ITEMS`) */
    private const MAX_TOTAL = 5000;

    /**
     * ერთეულის შედეგის ჩაწერა.
     *
     * @param  list<string>  $changes  შეცვლილი ველების გასაღებები (`poster`, `description_ka`, `seasons:8`…)
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
    ): void {
        if (! in_array($kind, self::KINDS, true) || ! in_array($result, self::RESULTS, true) || ! Str::isUuid($key)) {
            return;
        }

        try {
            $total = max(0, min(self::MAX_TOTAL, $total));

            $run = SyncRun::withoutGlobalScope('owner')->firstOrCreate(
                ['user_id' => $userId, 'key' => $key],
                ['kind' => $kind, 'source' => $source, 'total' => $total],
            );

            // რიგს ერთეულები გზადაგზა შეიძლება დაემატოს — დაგეგმილი რიცხვი მხოლოდ იზრდება
            if ($total > (int) $run->total) {
                $run->update(['total' => $total]);
            }

            SyncRunItem::updateOrCreate(
                ['sync_run_id' => $run->getKey(), 'type' => $type, 'record_id' => $recordId],
                [
                    'title' => $title === null ? null : mb_substr($title, 0, 200),
                    'result' => $result,
                    'reason' => $reason === null || $reason === '' ? null : mb_substr($reason, 0, 500),
                    'changes' => $result === self::UPDATED && $changes !== [] ? array_values(array_unique($changes)) : null,
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
     */
    public function fromRequest(Request $request, string $kind, string $type, int $recordId, ?string $title, array $outcome): void
    {
        $key = $request->input('run');
        $user = $request->user();

        if (! is_string($key) || ! $user) {
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
        );
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
