<?php

namespace App\Services\Import;

use App\Models\User;
use App\Services\Export\LibraryArchive;
use App\Support\CustomModules;
use App\Support\ExportDomain;
use App\Support\ImportSource;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;
use ZipArchive;

/**
 * **ატვირთული ექსპორტის დროებითი ასლი.**
 *
 * ფაილი (მოდულის JSON/CSV ან „სრული ექსპორტის" ZIP) გეგმის დროს ერთხელ
 * იკითხება და `imports/<user>/<token>/`-ში ნაწილებად იწერება:
 *
 * ```
 * meta.json              — სახე, მოდულები (რამდენი ჩანაწერი, კონვერტი)
 * <მოდული>/<n>.json       — ჩანაწერები, `ImportSource::CHUNK`-ით
 * package.zip            — მხოლოდ ZIP-ზე: ფაილები (`files/<გზა>`) ერთეულის ბიჯს სჭირდება
 * ```
 *
 * ⚠️ **ძველი წესი „ფაილი არსად ინახება" აქ აღარ მუშაობს** — ZIP-ში
 * ფაილებია (პოსტერები, დოკუმენტები), რომლებიც თითო ჩანაწერს თავისი ბიჯზე
 * სჭირდება, ბრაუზერი კი 500 MB-იან არქივს ყოველ რიგზე ვერ გამოგზავნის.
 * ამიტომ ასლი ცოცხლობს გეგმიდან ბოლო ერთეულამდე და ქრება: ახალი გეგმა
 * ამ ანგარიშის წინას შლის, ხოლო `ImportSource::TTL_HOURS`-ზე ძველს —
 * ნებისმიერი ანგარიშის (`sweep()`). კვოტაში ის არ ითვლება: ბიბლიოთეკის
 * ფაილი არ არის, და ზღვარი ატვირთვაზევე მოწმდება (`UploadLimits`).
 *
 * ⚠️ **ZIP-იდან არაფერი იშლება დისკზე სახელით** — ერთეულები სახელით
 * იკითხება (`manifest.json`, `modules/<მოდული>.json`, `files/<გზა>`), ე.ი.
 * `../`-იანი სახელი (zip-slip) ვერსად ჩაწერს; JSON-ის გაშლილ ზომას კი ჭერი
 * აქვს (zip-bomb).
 */
class MediaryPackage
{
    public const DISK = 'local';

    public const ROOT = 'imports';

    /** მოდულის JSON-ის ჭერი გაშლილ ზომაზე (ZIP-ში) */
    private const MAX_JSON_BYTES = 268435456;

    /** CSV-ის ველები, რომლებიც `RecordExporter::flat()`-მა ` | `-ით შეკრა */
    private const LIST_FIELDS = ['genres', 'tags', 'platforms', 'modes', 'mechanics'];

    /** CSV-ის ველები, რომლებიც `flat()`-მა JSON-ად ჩაწერა */
    private const JSON_FIELDS = [...ExportDomain::EXTRAS, 'links', 'opening_hours'];

    public function __construct(private readonly CsvReader $csv) {}

    /**
     * ატვირთული ფაილი → დროებითი ასლი.
     *
     * @return array<string, mixed> `meta.json`-ის შიგთავსი
     *
     * @throws ImportException
     */
    public function stage(User $user, UploadedFile $file, ?string $module = null): array
    {
        $this->sweep($user);

        $token = Str::random(40);
        $dir = $this->dir($user, $token);
        $extension = strtolower($file->getClientOriginalExtension());
        $kind = match ($extension) {
            'zip' => 'zip',
            'csv' => 'csv',
            default => 'json',
        };

        try {
            $staged = match ($kind) {
                'zip' => $this->stageZip($file, $dir),
                'csv' => $this->stageCsv($user, $file, $dir, $module),
                default => $this->stageJson($file, $dir),
            };

            // ⚠️ „სრული ექსპორტი" ცარიელ მოდულსაც ფუთავს — ჩანაწერი მაინც ერთი უნდა იყოს
            if (array_sum(array_column($staged['modules'], 'total')) === 0) {
                throw new ImportException('import_empty');
            }

            $meta = [
                'token' => $token,
                'kind' => $kind,
                'name' => mb_substr($file->getClientOriginalName(), 0, 200),
                'created_at' => now()->toIso8601String(),
                ...$staged,
            ];

            $this->disk()->put("{$dir}/meta.json", (string) json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        } catch (Throwable $e) {
            $this->disk()->deleteDirectory($dir);

            throw $e;
        }

        return $meta;
    }

    /**
     * დროებითი ასლის აღწერა.
     *
     * @return array<string, mixed>
     *
     * @throws ImportException `import_expired` — ასლი აღარ არის (ვადა, ახალი გეგმა)
     */
    public function meta(User $user, string $token): array
    {
        $path = $this->dir($user, $token).'/meta.json';

        if (! $this->validToken($token) || ! $this->disk()->exists($path)) {
            throw new ImportException('import_expired', [], 410);
        }

        return (array) json_decode((string) $this->disk()->get($path), true);
    }

    /**
     * ერთი ჩანაწერი — მხოლოდ თავისი ნაწილის წაკითხვით.
     *
     * @return array<string, mixed>|null
     */
    public function record(User $user, string $token, string $module, int $index): ?array
    {
        if ($index < 0 || ! $this->validModule($module)) {
            return null;
        }

        $chunk = $this->chunk($user, $token, $module, intdiv($index, ImportSource::CHUNK));
        $record = $chunk[$index % ImportSource::CHUNK] ?? null;

        return is_array($record) ? $record : null;
    }

    /**
     * ყველა ჩანაწერი ერთი მოდულიდან — გეგმისთვის (`index => ჩანაწერი`).
     *
     * @return \Generator<int, array<string, mixed>>
     */
    public function records(User $user, string $token, string $module, int $chunks): \Generator
    {
        $index = 0;

        for ($n = 0; $n < $chunks; $n++) {
            foreach ($this->chunk($user, $token, $module, $n) as $record) {
                yield $index++ => is_array($record) ? $record : [];
            }
        }
    }

    /** ZIP-ის ფაილებთან წვდომა (ერთეულის ბიჯი); JSON/CSV-ზე `null` */
    public function zip(User $user, string $token): ?ZipArchive
    {
        $path = $this->dir($user, $token).'/package.zip';

        if (! $this->disk()->exists($path)) {
            return null;
        }

        $zip = new ZipArchive;

        return $zip->open($this->disk()->path($path), ZipArchive::RDONLY) === true ? $zip : null;
    }

    /** ასლის წაშლა (გაუქმება ან დასრულება) */
    public function discard(User $user, string $token): void
    {
        if ($this->validToken($token)) {
            $this->disk()->deleteDirectory($this->dir($user, $token));
        }
    }

    /* ---------- ფორმატები ---------- */

    /** @return array{modules: array<string, array<string, mixed>>, truncated: bool} */
    private function stageJson(UploadedFile $file, string $dir): array
    {
        $data = json_decode((string) file_get_contents((string) $file->getRealPath()), true);

        if (! is_array($data) || ! is_string($data['module'] ?? null) || ! is_array($data['records'] ?? null)) {
            throw new ImportException('import_format_unknown');
        }

        $module = $data['module'];
        if (! $this->validModule($module)) {
            throw new ImportException('import_format_unknown');
        }

        $budget = ImportSource::MAX_ROWS;
        $written = $this->writeModule($dir, $module, $data['records'], Arr::except($data, ['records']), $budget);

        return ['modules' => [$module => $written], 'truncated' => $written['truncated']];
    }

    /**
     * Mediary-ის CSV: მოდული სათაურების ხაზიდან ირკვევა.
     *
     * ⚠️ **ზოგ მოდულს ერთი და იგივე სვეტები აქვს** (სერიალი · ანიმე, ყველა პირადი
     * მოდული), ამიტომ ჯერ ფაილის სახელი (`mediary-anime-2026-10-05.csv` — ზუსტად
     * ის, რასაც ექსპორტი არქმევს) და მერე სვეტები; ორაზროვნებაზე — 422
     * `import_module_ambiguous` შესაძლო მოდულებით, რომ ეკრანმა არჩევა მოგცეს.
     *
     * @return array{modules: array<string, array<string, mixed>>, truncated: bool}
     */
    private function stageCsv(User $user, UploadedFile $file, string $dir, ?string $module): array
    {
        $read = $this->csv->read($file);
        $headers = array_values(array_filter($read['headers'], fn (string $h) => $h !== ''));

        $candidates = $this->modulesFor($user, $headers);
        $hint = $this->hint($file->getClientOriginalName(), $candidates);

        $module = match (true) {
            $module !== null => in_array($module, $candidates, true) ? $module : null,
            $hint !== null => $hint,
            count($candidates) === 1 => $candidates[0],
            default => null,
        };

        if ($module === null) {
            throw new ImportException(
                $candidates === [] ? 'import_format_unknown' : 'import_module_ambiguous',
                ['modules' => $candidates, 'headers' => array_slice($headers, 0, 40)],
            );
        }

        $records = array_map(fn (array $row) => $this->fromCsv($row), $read['rows']);
        $budget = ImportSource::MAX_ROWS;
        $written = $this->writeModule($dir, $module, $records, ['module' => $module, 'fields' => $headers], $budget);

        return ['modules' => [$module => $written], 'truncated' => $written['truncated'] || $read['truncated']];
    }

    /** @return array{modules: array<string, array<string, mixed>>, truncated: bool, files: int} */
    private function stageZip(UploadedFile $file, string $dir): array
    {
        $this->disk()->putFileAs($dir, $file, 'package.zip');

        $zip = new ZipArchive;
        if ($zip->open($this->disk()->path("{$dir}/package.zip"), ZipArchive::RDONLY) !== true) {
            throw new ImportException('import_format_unknown');
        }

        try {
            $manifest = $this->zipJson($zip, 'manifest.json');

            if (! is_array($manifest) || ($manifest['app'] ?? null) !== 'mediary') {
                throw new ImportException('import_format_unknown');
            }

            // ⚠️ ბაზის ZIP სხვა რამეა — ის მხოლოდ „ბაზის" ჩანართში, ჩანაცვლებით
            if (($manifest['kind'] ?? null) === 'database') {
                throw new ImportException('import_database_archive');
            }

            if (($manifest['kind'] ?? null) !== 'library') {
                throw new ImportException('import_format_unknown');
            }

            if ((int) ($manifest['format'] ?? 0) > LibraryArchive::FORMAT) {
                throw new ImportException('import_format_newer');
            }

            $modules = [];
            $truncated = false;
            $budget = ImportSource::MAX_ROWS;

            foreach ((array) ($manifest['modules'] ?? []) as $info) {
                $key = is_array($info) ? ($info['key'] ?? null) : null;

                if (! is_string($key) || ! $this->validModule($key) || isset($modules[$key])) {
                    continue;
                }

                $data = $this->zipJson($zip, "modules/{$key}.json");
                if (! is_array($data) || ! is_array($data['records'] ?? null)) {
                    continue;
                }

                $envelope = [
                    ...Arr::except($data, ['records']),
                    // პირადი მოდულის სახელი — სხვა ანგარიშზე მისი მოძებნისთვის (`MediaryImporter::target()`)
                    'name_ka' => is_string($info['name_ka'] ?? null) ? $info['name_ka'] : null,
                    'name_en' => is_string($info['name_en'] ?? null) ? $info['name_en'] : null,
                ];

                $modules[$key] = $this->writeModule($dir, $key, $data['records'], $envelope, $budget);
                $truncated = $truncated || $modules[$key]['truncated'];
            }

            $files = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                if (str_starts_with((string) $zip->getNameIndex($i), 'files/')) {
                    $files++;
                }
            }
        } finally {
            $zip->close();
        }

        return ['modules' => $modules, 'truncated' => $truncated, 'files' => $files];
    }

    /**
     * ერთი მოდულის ჩანაწერები ნაწილებად.
     *
     * @param  array<int, mixed>  $records
     * @param  array<string, mixed>  $envelope
     * @return array{total: int, chunks: int, truncated: bool, envelope: array<string, mixed>}
     */
    private function writeModule(string $dir, string $module, array $records, array $envelope, int &$budget): array
    {
        $records = array_values(array_filter($records, 'is_array'));
        $truncated = count($records) > $budget;
        $records = array_slice($records, 0, max(0, $budget));
        $budget -= count($records);

        $chunks = 0;
        foreach (array_chunk($records, ImportSource::CHUNK) as $n => $chunk) {
            $this->disk()->put(
                "{$dir}/{$module}/{$n}.json",
                (string) json_encode($chunk, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE),
            );
            $chunks++;
        }

        return [
            'total' => count($records),
            'chunks' => $chunks,
            'truncated' => $truncated,
            // ⚠️ კონვერტიდან მხოლოდ ის, რაც იმპორტს სჭირდება — თვითნებური ველი meta-ში არ ჯდება
            'envelope' => Arr::only($envelope, ['module', 'exported_at', 'timezone', 'fields', 'custom_field_definitions', 'statuses', 'name_ka', 'name_en']),
        ];
    }

    /* ---------- CSV ---------- */

    /**
     * რომელ მოდულს შეიძლება ეკუთვნოდეს ეს სვეტები.
     *
     * ⚠️ **სრული დამთხვევა არ მოითხოვება** — ძველ ექსპორტს ახალი ველები აკლია
     * (ადრე „დამატებები" არ იყო), ამიტომ: სვეტების ≥ 80% მოდულის
     * ველია და მისი სათაურის სვეტი ფაილშია. რამდენიმე თანაბარ კანდიდატს
     * ორაზროვნება ჰქვია.
     *
     * @param  list<string>  $headers
     * @return list<string>
     */
    private function modulesFor(User $user, array $headers): array
    {
        if ($headers === []) {
            return [];
        }

        $scores = [];

        foreach ([...ExportDomain::keys(), ...CustomModules::keysOf($user)] as $module) {
            $fields = ExportDomain::fields($module);
            $identity = ImportSource::identity($module);
            $title = $identity['title'][0] ?? null;

            if ($title === null || ! in_array($title, $headers, true)) {
                continue;
            }

            // ⚠️ `(float)` — თანაბარი გაყოფა PHP-ში მთელ რიცხვს აბრუნებს და `===` მერე `1.0`-ს ვერ ცნობს
            $score = (float) (count(array_intersect($headers, $fields)) / count($headers));
            if ($score >= 0.8) {
                $scores[$module] = $score;
            }
        }

        if ($scores === []) {
            return [];
        }

        $best = max($scores);

        return array_keys(array_filter($scores, fn (float $s) => $s === $best));
    }

    /**
     * ფაილის სახელიდან მოდული — ექსპორტის სახელია `mediary-<მოდული>-<თარიღი>.<ფორმატი>`
     * (`board_game` → `board-game`; ბრაუზერი შეიძლება „ (1)" მიაწეროს).
     *
     * @param  list<string>  $candidates
     */
    private function hint(string $name, array $candidates): ?string
    {
        if (! preg_match('/^mediary-(.+?)-\d{4}-\d{2}-\d{2}/', $name, $m)) {
            return null;
        }

        foreach ([$m[1], str_replace('-', '_', $m[1])] as $key) {
            if (in_array($key, $candidates, true)) {
                return $key;
            }
        }

        return null;
    }

    /**
     * CSV-ის უჯრა → ექსპორტის მნიშვნელობა (`RecordExporter::flat()`-ის შებრუნება).
     *
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function fromCsv(array $row): array
    {
        $out = [];

        foreach ($row as $field => $value) {
            if ($field === '__line' || $field === '') {
                continue;
            }

            $value = $this->unformula((string) $value);

            if ($value === '') {
                $out[$field] = null;

                continue;
            }

            if (in_array($field, self::JSON_FIELDS, true)) {
                $decoded = json_decode($value, true);
                $out[$field] = is_array($decoded) ? $decoded : null;

                continue;
            }

            if (in_array($field, self::LIST_FIELDS, true)) {
                $out[$field] = array_values(array_filter(array_map('trim', explode(' | ', $value)), fn (string $v) => $v !== ''));

                continue;
            }

            $out[$field] = $value;
        }

        return $out;
    }

    /** `'=…` → `=…` — ექსპორტის ფორმულის დაცვის (`deFormula()`) შებრუნება */
    private function unformula(string $value): string
    {
        return strlen($value) > 1 && $value[0] === "'" && in_array($value[1], ['=', '+', '-', '@', "\t", "\r"], true)
            ? substr($value, 1)
            : $value;
    }

    /* ---------- შიგნეული ---------- */

    private function zipJson(ZipArchive $zip, string $name): mixed
    {
        $stat = $zip->statName($name);

        if ($stat === false) {
            return null;
        }

        if ((int) $stat['size'] > self::MAX_JSON_BYTES) {
            throw new ImportException('import_too_large', [], 413);
        }

        $raw = $zip->getFromName($name);

        return $raw === false ? null : json_decode($raw, true);
    }

    /** @return list<mixed> */
    private function chunk(User $user, string $token, string $module, int $n): array
    {
        $path = $this->dir($user, $token)."/{$module}/{$n}.json";

        if (! $this->validToken($token) || ! $this->disk()->exists($path)) {
            return [];
        }

        return (array) json_decode((string) $this->disk()->get($path), true);
    }

    /**
     * ძველი ასლების წაშლა: ამ ანგარიშის ყველა წინა (ერთ ანგარიშზე ერთი
     * იმპორტი) და ნებისმიერი ანგარიშის ვადაგასული.
     */
    private function sweep(User $user): void
    {
        $disk = $this->disk();
        $own = self::ROOT.'/'.$user->getKey();

        foreach ($disk->directories($own) as $dir) {
            $disk->deleteDirectory($dir);
        }

        $cutoff = now()->subHours(ImportSource::TTL_HOURS)->getTimestamp();

        foreach ($disk->directories(self::ROOT) as $userDir) {
            foreach ($disk->directories($userDir) as $dir) {
                $meta = "{$dir}/meta.json";
                $stamp = $disk->exists($meta) ? $disk->lastModified($meta) : 0;

                if ($stamp < $cutoff) {
                    $disk->deleteDirectory($dir);
                }
            }
        }
    }

    private function dir(User $user, string $token): string
    {
        return self::ROOT.'/'.$user->getKey().'/'.$token;
    }

    /** ⚠️ ტოკენი კლიენტიდან მოდის და გზაში ჯდება — მხოლოდ ასო-ციფრი */
    private function validToken(string $token): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9]{40}$/', $token);
    }

    /** ⚠️ მოდულის გასაღებიც გზაშია (`<მოდული>/<n>.json`) */
    private function validModule(string $module): bool
    {
        return (bool) preg_match('/^[a-z0-9][a-z0-9_-]{0,39}$/', $module);
    }

    private function disk(): Filesystem
    {
        return Storage::disk(self::DISK);
    }
}
