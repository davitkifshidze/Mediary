<?php

namespace App\Services\Export;

use App\Models\Module;
use App\Models\User;
use App\Support\AppTime;
use App\Support\ExportDomain;
use App\Support\StorageFolder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * **„ჩემი სრული ექსპორტი": ყველა მოდული ერთ ZIP-ში.**
 *
 * ```
 * manifest.json          — {app: mediary, kind: library, format, modules: [...], files}
 * modules/<მოდული>.json  — იგივე ფაილი, რასაც მოდულის ბარათის „JSON" იძლევა
 * files/<გზა>            — ჩანაწერების ფაილები, თავისი გზით (`poster_path` → `files/movies/posters/…`)
 * ```
 *
 * ⚠️ **მოდულის ფაილი ზუსტად ისაა, რასაც ბარათი იძლევა** (`RecordExporter::json()`)
 * — ორი ფორმატი ერთი მონაცემისთვის იმპორტს ორ წამკითხველს აიძულებდა;
 * ახლა `MediaryImporter` ერთსა და იმავე რიგს კითხულობს, ZIP-იდან იქნება
 * თუ ცალკე ფაილიდან.
 *
 * ⚠️ **ფაილი თავისი გზით დევს** (`files/<გზა>`) და არა სახელით: გზა უკვე
 * რიგშია (`poster_path`, `files[].path`…), ე.ი. იმპორტი ფაილს რიგიდან
 * პოულობს და სახელების რუკა საერთოდ არ სჭირდება.
 *
 * ⚠️ **მხოლოდ ჩემი ჩანაწერების ფაილები** — გზები იმავე, მფლობელით
 * შეზღუდული მოთხოვნიდან მოდის, რომლითაც ჩანაწერები (`RecordExporter::query()`);
 * პრივატული ფაილიც (`notes/`) ხვდება — `archiveOwnFiles()`-ის წესით: მარშრუტი
 * ავტორიზებულია და ფაილი ჩემია. ჩამოწერილი ვიდეო (`videos/downloads`) არ
 * ხვდება — ის თავიდან ჩამოიწერება და არქივს გიგაბაიტებით გაზრდიდა.
 *
 * ⚠️ **სურათი არ იკუმშება** (`CM_STORE`) — JPEG/PNG უკვე შეკუმშულია და
 * deflate მხოლოდ დროს დახარჯავდა; JSON კი იკუმშება.
 */
class LibraryArchive
{
    /** ფორმატის ვერსია — იმპორტი უცნობ (უფრო ახალ) ვერსიას ცხადად ამბობს */
    public const FORMAT = 1;

    public function __construct(private readonly RecordExporter $exporter) {}

    /**
     * რომელი მოდულები შედის — `ExportController::index()`-ის იგივე წესი
     * (ჩართული, ხილული, `view` უფლებით).
     *
     * @return Collection<int, Module>
     */
    public function modules(User $user): Collection
    {
        return Module::where('is_active', true)
            ->visibleTo($user)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->filter(fn (Module $m) => ExportDomain::has($m->key) && $user->hasModule($m->key) && $user->hasPermission($m->key, 'view'))
            ->values();
    }

    /**
     * არქივის აგება დროებით ფაილად.
     *
     * @return array{path: string, records: int, files: int, missing: int}
     */
    public function build(User $user, bool $withFiles): array
    {
        // ⚠️ დიდი ბიბლიოთეკა ფაილებით წუთებს ითხოვს — PHP-ის 30 წამი არქივს შუაზე გაწყვეტდა
        @set_time_limit(0);

        $path = $this->tempPath('zip');
        $zip = new ZipArchive;

        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('export_failed');
        }

        $parts = [];
        $paths = [];
        $modules = [];
        $records = 0;

        try {
            foreach ($this->modules($user) as $module) {
                $file = $this->tempPath('json');
                $parts[] = $file;
                $count = 0;

                $handle = fopen($file, 'wb');
                if ($handle === false) {
                    throw new RuntimeException('export_failed');
                }

                $tap = function (array $row) use ($module, &$paths, &$count) {
                    $count++;
                    foreach (ExportDomain::paths($module->key, $row) as $p) {
                        $paths[$p] = true;
                    }
                };

                foreach ($this->exporter->json($user, $module->key, $tap) as $chunk) {
                    fwrite($handle, $chunk);
                }
                fclose($handle);

                $zip->addFile($file, "modules/{$module->key}.json");
                $records += $count;

                $modules[] = [
                    'key' => $module->key,
                    'name_ka' => $module->name_ka,
                    'name_en' => $module->name_en,
                    'icon' => $module->icon,
                    'color' => $module->color,
                    'records' => $count,
                ];
            }

            [$files, $missing] = $withFiles ? $this->addFiles($zip, array_keys($paths)) : [0, 0];

            $zip->addFromString('manifest.json', (string) json_encode([
                'app' => 'mediary',
                'kind' => 'library',
                'format' => self::FORMAT,
                'exported_at' => AppTime::now()->format('Y-m-d H:i:s'),
                'timezone' => AppTime::zone(),
                'username' => $user->username,
                'with_files' => $withFiles,
                'modules' => $modules,
                'records' => $records,
                'files' => $files,
                // ⚠️ დისკზე აღარ მყოფი ფაილი (ხელით წაშლილი) ჩუმად არ ქრება — რიცხვი ჩანს
                'missing_files' => $missing,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

            $zip->close();
        } catch (Throwable $e) {
            @$zip->close();
            @unlink($path);

            throw $e;
        } finally {
            // ⚠️ ნაწილები ZIP-ის დახურვის **შემდეგ** იშლება — `addFile()` მათ მხოლოდ მაშინ კითხულობს
            foreach ($parts as $part) {
                @unlink($part);
            }
        }

        return ['path' => $path, 'records' => $records, 'files' => $files, 'missing' => $missing];
    }

    /**
     * ფაილების ჩადება `files/<გზა>`-ზე.
     *
     * @param  list<string>  $paths
     * @return array{0: int, 1: int} [ჩადებული, დაკარგული]
     */
    private function addFiles(ZipArchive $zip, array $paths): array
    {
        $added = 0;
        $missing = 0;

        foreach ($paths as $path) {
            // ⚠️ ბაზის გზა სანდოა, მაგრამ არქივის სახელი მაინც შემოწმდება — `..` ZIP-ში არასდროს
            if (str_contains($path, '..') || str_starts_with($path, '/') || str_contains($path, '\\')) {
                $missing++;

                continue;
            }

            // ჩამოწერილი ვიდეო თავიდან ჩამოიწერება და არქივში არ ჯდება
            if (str_starts_with($path, StorageFolder::VIDEO_DOWNLOADS.'/')) {
                continue;
            }

            $disk = Storage::disk(StorageFolder::diskFor($path));

            if (! $disk->fileExists($path)) {
                $missing++;

                continue;
            }

            $name = 'files/'.$path;
            $zip->addFile($disk->path($path), $name);
            $zip->setCompressionName($name, ZipArchive::CM_STORE);
            $added++;
        }

        return [$added, $missing];
    }

    private function tempPath(string $extension): string
    {
        $dir = storage_path('app/private/exports');

        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir.DIRECTORY_SEPARATOR.'library-'.now()->format('Ymd-His').'-'.bin2hex(random_bytes(4)).'.'.$extension;
    }
}
