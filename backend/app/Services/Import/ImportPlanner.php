<?php

namespace App\Services\Import;

use App\Models\User;
use App\Support\ImportSource;

/**
 * **„რა მოხდება, თუ ამ ფაილს შემოვიტან"** (წინასწარი ნახვა).
 *
 * თითო მოდულზე: დაემატება N · გამოტოვდება M (უკვე მაქვს / ფაილში ორჯერაა) ·
 * ვერ წავიკითხე K — და თითო რიგის მდგომარეობა, რომ რიგმა მხოლოდ ახლები
 * გაგზავნოს. ⚠️ **დუბლი ჩაწერისას თავიდან მოწმდება** (`MediaryImporter`):
 * გეგმა შეიძლება წუთებით ადრე აიგო — „დაემატა" მხოლოდ სერვერის პასუხია.
 *
 * ⚠️ **გეგმა გარე წყაროს არ ეკითხება** — და ახლა ერთეულის
 * ბიჯიც აღარ ეკითხება: მონაცემი ფაილშია.
 */
class ImportPlanner
{
    public function __construct(
        private readonly MediaryPackage $package,
        private readonly MediaryTargets $targets,
    ) {}

    /**
     * @param  array<string, mixed>  $meta  `MediaryPackage::stage()`-ის პასუხი
     * @return array<string, mixed>
     */
    public function plan(User $user, array $meta): array
    {
        $modules = [];

        foreach ((array) ($meta['modules'] ?? []) as $source => $info) {
            // ცარიელი მოდული (სრულ ექსპორტში ყველა მოდული დევს) ეკრანს არაფერს ეუბნება
            if ((int) ($info['total'] ?? 0) === 0) {
                continue;
            }

            $source = (string) $source;
            $envelope = (array) ($info['envelope'] ?? []);
            $target = $this->targets->resolve($user, $source, $envelope);
            $counts = ['new' => 0, 'duplicate' => 0, 'invalid' => 0];
            $items = [];

            if ($target['reason'] === null) {
                $seen = [];

                foreach ($this->package->records($user, (string) $meta['token'], $source, (int) ($info['chunks'] ?? 0)) as $index => $record) {
                    [$state, $reason] = $this->state($user, (string) $target['module'], $record, $seen);
                    $counts[$state]++;

                    $items[] = [
                        'index' => $index,
                        'title' => MediaryIdentity::label((string) $target['module'], $record),
                        'year' => is_numeric($record['year'] ?? null) ? (int) $record['year'] : null,
                        'state' => $state,
                        'reason' => $reason,
                    ];
                }
            }

            $modules[] = [
                'source' => $source,
                'module' => $target['module'],
                'reason' => $target['reason'],
                // პირადი მოდულის სახელი ფაილიდან — როცა ჩემთან ჯერ არ არსებობს
                'name_ka' => $envelope['name_ka'] ?? null,
                'name_en' => $envelope['name_en'] ?? null,
                'total' => (int) ($info['total'] ?? 0),
                'counts' => $counts,
                'items' => $items,
            ];
        }

        return [
            'token' => $meta['token'],
            'kind' => $meta['kind'],
            'name' => $meta['name'] ?? null,
            'files' => (int) ($meta['files'] ?? 0),
            'truncated' => (bool) ($meta['truncated'] ?? false),
            'max_rows' => ImportSource::MAX_ROWS,
            'modules' => $modules,
        ];
    }

    /**
     * ერთი რიგის მდგომარეობა — `[state, reason]`.
     *
     * ⚠️ **ფაილის შიგნით დუბლიც** (`in_file`): ერთი და იგივე ჩანაწერი ფაილში
     * ორჯერ რომ იყოს, ორივე „ახალი" გამოჩნდებოდა, მეორე კი ჩაწერისას მაინც
     * გამოტოვდებოდა — რიცხვი ტყუილი იქნებოდა.
     *
     * @param  array<string, mixed>  $record
     * @param  array<string, true>  $seen
     * @return array{0: string, 1: ?string}
     */
    public function state(User $user, string $module, array $record, array &$seen): array
    {
        if ($reason = self::invalid($module, $record)) {
            return ['invalid', $reason];
        }

        $keys = MediaryIdentity::incoming($module, $record);

        if (array_intersect_key(array_flip($keys), $seen) !== []) {
            return ['duplicate', 'in_file'];
        }

        foreach ($keys as $key) {
            $seen[$key] = true;
        }

        if ($existing = MediaryIdentity::find($user, $module, $record)) {
            return ['duplicate', $existing->getAttribute('trashed_at') ? 'in_trash' : 'exists'];
        }

        return ['new', null];
    }

    /**
     * რიგი ვერ ჩაიწერება? — მიზეზი ან `null`.
     *
     * @param  array<string, mixed>  $record
     */
    public static function invalid(string $module, array $record): ?string
    {
        $identity = ImportSource::identity($module);

        if ($identity === null) {
            return 'module_unknown';
        }

        foreach ($identity['required'] as $column) {
            $value = $record[$column] ?? null;

            if (! is_scalar($value) || trim((string) $value) === '') {
                return 'missing_field';
            }
        }

        return MediaryIdentity::label($module, $record) === '' ? 'missing_title' : null;
    }
}
