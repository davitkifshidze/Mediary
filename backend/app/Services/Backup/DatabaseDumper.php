<?php

namespace App\Services\Backup;

use RuntimeException;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

/**
 * **ბაზის დამპი და აღდგენა** (Tasks §22).
 *
 * ⚠️ **ორივე გარე პროგრამაა და არა PHP.** სუფთა PHP-ით დაწერილი დამპი
 * ნიშნავდა ყველა ცხრილის მეხსიერებაში ჩამოტარებას — და ეს იმ პროექტში,
 * სადაც ერთი ჩამოწერილი ვიდეო გიგაბაიტია. `mysqldump` სწორედ ამისთვისაა
 * და ის ისედაც დგას ამ მანქანაზე (XAMPP), რადგან პროექტის ყოველდღიური
 * ბექაპიც მას იძახებს.
 *
 * ⚠️ **ბინარის არქონა მდგომარეობაა და არა ავარია** — `available()` false-ს
 * აბრუნებს და endpoint **503 `mysqldump_unavailable`**-ს. ეს ზუსტად
 * `ytdlp_unavailable`/`bgg_unavailable`-ის წესია: „ინსტრუმენტი არ მაქვს"
 * და „ვცადე და ვერ გამომივიდა" სხვადასხვა პასუხს მოითხოვს.
 *
 * ⚠️ **მხოლოდ MySQL/MariaDB.** sqlite-ზე (ტესტები) ფუნქცია საერთოდ არ
 * ირთვება: იქ „ბაზა" ერთი ფაილია და მისი კოპირება სხვა ამოცანაა.
 */
class DatabaseDumper
{
    /**
     * ⚠️ **XAMPP-ის ბილიკი ცალკე იცდება და ეს არაა ზედმეტობა.** ამ მანქანაზე
     * MySQL XAMPP-შია და `bin/` **PATH-ზე არ დგას** — ზუსტად ის მდგომარეობა,
     * რამაც `yt-dlp` ორი დღე გამოუყენებელი დატოვა. `.env`-ის ცხადი ბილიკი
     * ისევ პირველია.
     */
    private const COMMON_PATHS = [
        'C:/xampp/mysql/bin',
        'C:/wamp64/bin/mysql/mysql8.0.31/bin',
        '/usr/bin',
        '/usr/local/bin',
        '/opt/homebrew/bin',
    ];

    public function available(): bool
    {
        return $this->dumpBinary() !== null && $this->driver() === 'mysql';
    }

    public function restoreAvailable(): bool
    {
        return $this->clientBinary() !== null && $this->driver() === 'mysql';
    }

    public function driver(): string
    {
        return (string) config('database.default') === 'sqlite'
            ? 'sqlite'
            : (string) config('database.connections.'.config('database.default').'.driver');
    }

    public function dumpBinary(): ?string
    {
        return $this->locate((string) config('mediary.backup.mysqldump', ''), 'mysqldump');
    }

    public function clientBinary(): ?string
    {
        return $this->locate((string) config('mediary.backup.mysql', ''), 'mysql');
    }

    private function locate(string $configured, string $name): ?string
    {
        if ($configured !== '') {
            return is_file($configured) ? $configured : null;
        }

        $found = (new ExecutableFinder)->find($name);

        if ($found !== null) {
            return $found;
        }

        foreach (self::COMMON_PATHS as $dir) {
            foreach ([$name.'.exe', $name] as $file) {
                if (is_file($dir.'/'.$file)) {
                    return $dir.'/'.$file;
                }
            }
        }

        return null;
    }

    /**
     * დამპის აღება მითითებულ ფაილში.
     *
     * ⚠️ **პაროლი არგუმენტად არ მიდის.** `--password=…` პროცესების სიაში
     * ყველასთვის ჩანს; MySQL-ის საკუთარი გზაა `MYSQL_PWD` გარემოს ცვლადი,
     * და სწორედ ისაა გამოყენებული. (ამ მანქანაზე პაროლი ცარიელია, მაგრამ
     * ფაილი სხვა ინსტალაციაშიც იმუშავებს.)
     *
     * ⚠️ **`--routines --events --triggers`**: მათ გარეშე „სრული ასლი"
     * ტყუილია — აღდგენილ ბაზას ჩუმად დააკლდებოდა ის, რაც ცხრილებში არ დევს.
     *
     * ⚠️ **`--single-transaction`** InnoDB-ს ცხრილებს **არ ბლოკავს**, ე.ი.
     * აპი დამპის დროს მუშაობს. `--lock-tables` აქ სწორედ იმას გააკეთებდა,
     * რასაც ვერიდებით.
     *
     * @return array{tables: int}
     */
    public function dump(string $absolutePath, bool $compress = false): array
    {
        $binary = $this->dumpBinary();

        if ($binary === null) {
            throw new RuntimeException('mysqldump_unavailable');
        }

        $config = $this->connection();

        $args = [
            $binary,
            '--host='.$config['host'],
            '--port='.$config['port'],
            '--user='.$config['username'],
            '--default-character-set=utf8mb4',
            '--single-transaction',
            '--routines',
            '--events',
            '--triggers',
            // ⚠️ `--add-drop-table`: აღდგენა **ჩანაცვლებაა** და არა დამატება;
            // მის გარეშე იმპორტი არსებულ ცხრილზე „already exists"-ით დაეცემოდა
            '--add-drop-table',
            $config['database'],
        ];

        $process = new Process($args, null, $this->env($config), null, $this->timeout());
        $handle = fopen($absolutePath, 'wb');

        if ($handle === false) {
            throw new RuntimeException("დამპის ფაილი ვერ შეიქმნა: {$absolutePath}");
        }

        /* ⚠️ **შეკუმშვა PHP-ის ნაკადის ფილტრით და არა გარე `gzip`-ით.** ერთი
           გარე პროგრამა უკვე საკმარისი პირობაა (`mysqldump`); მეორის
           მოთხოვნა ფუნქციას Windows-ზე ჩუმად გატეხავდა. `window => 31`
           სწორედ gzip-ის სათაურს ნიშნავს (15 + 16) — მის გარეშე ფაილი
           „ნედლი deflate" იქნებოდა და `gzip`-ს ვერ გაეხსნა.
           ⚠️ შეკუმშვა **კვოტის საკითხია**: 4 მბ SQL ~600 კბ-მდე ჯდება, ე.ი.
           დამპი მომხმარებლის საცავს გაცილებით ნაკლებს ჭამს. */
        if ($compress) {
            stream_filter_append($handle, 'zlib.deflate', STREAM_FILTER_WRITE, ['level' => 6, 'window' => 31]);
        }

        try {
            // ⚠️ გამოტანა **ნაკადად** ფაილში: `getOutput()` მთელ ბაზას
            // PHP-ის სტრიქონში ჩაიტევდა
            $process->run(function (string $type, string $buffer) use ($handle) {
                if ($type === Process::OUT) {
                    fwrite($handle, $buffer);
                }
            });
        } finally {
            fclose($handle);
        }

        if (! $process->isSuccessful()) {
            @unlink($absolutePath);

            throw new RuntimeException($this->reason($process));
        }

        return ['tables' => $this->countTables($absolutePath, $compress)];
    }

    /**
     * აღდგენა — ფაილის ბაზაში ჩატვირთვა.
     *
     * ⚠️ **ეს ჩანაცვლებაა.** დამპი `DROP TABLE`-ებით მოდის, ე.ი. მიმდინარე
     * მონაცემები ქრება. სწორედ ამიტომ დგას endpoint-ზე აკრეფილი `RESTORE`
     * და ავტომატური უსაფრთხოების დამპი (§22.5).
     */
    public function restore(string $absolutePath): void
    {
        $binary = $this->clientBinary();

        if ($binary === null) {
            throw new RuntimeException('mysqldump_unavailable');
        }

        if (! is_file($absolutePath)) {
            throw new RuntimeException('backup_file_missing');
        }

        $config = $this->connection();

        $args = [
            $binary,
            '--host='.$config['host'],
            '--port='.$config['port'],
            '--user='.$config['username'],
            '--default-character-set=utf8mb4',
            $config['database'],
        ];

        $process = new Process($args, null, $this->env($config), null, $this->timeout());

        /* ⚠️ შეკუმშული ფაილი `gzopen`-ით იხსნება — `mysql` თვითონ gzip-ს
           ვერ კითხულობს და ორიგინალის შუაზე გაწყვეტილი SQL ნახევრად
           აღდგენილ ბაზას დატოვებდა. */
        $stream = $this->isGzip($absolutePath)
            ? gzopen($absolutePath, 'rb')
            : fopen($absolutePath, 'rb');

        if ($stream === false) {
            throw new RuntimeException('backup_file_missing');
        }

        $process->setInput($stream);
        $process->run();

        if (! $process->isSuccessful()) {
            throw new RuntimeException($this->reason($process));
        }
    }

    /**
     * ⚠️ **შიგთავსით და არა გაფართოებით.** ატვირთული ფაილი (§22.6) სხვა
     * კომპიუტერიდან მოდის და მისი სახელი ნებისმიერი შეიძლება იყოს; gzip-ის
     * ორი საწყისი ბაიტი (`1f 8b`) კი ყოველთვის ერთია.
     */
    public function isGzip(string $absolutePath): bool
    {
        $handle = @fopen($absolutePath, 'rb');

        if ($handle === false) {
            return false;
        }

        $magic = fread($handle, 2);
        fclose($handle);

        /* ⚠️ **შედარება hex-ით და არა ბაიტების სტრიქონით.** `""`
           ცოცხალ გაშვებაზე **ყოველთვის `false`-ს აბრუნებდა**: `pint`-ის
           `single_quote` ფიქსერი ორმაგ ბრჭყალებს ერთმაგად გადააკეთებს, ე.ი.
           escape-ი წყვეტს მუშაობას და სტრიქონში ლიტერალური `\`, `x`, `1`, `f`
           რჩება (UTF-8-ში კი `` ორ ბაიტად იქცევა). ფორმატერი კოდის
           მნიშვნელობას ცვლიდა და ვერავინ ამჩნევდა — `bin2hex()` ამ ხაფანგს
           საერთოდ არ ტოვებს. */
        return bin2hex((string) $magic) === '1f8b';
    }

    /** @return array<string, string> */
    private function connection(): array
    {
        $name = (string) config('database.default');
        $config = config('database.connections.'.$name);

        return [
            'host' => (string) ($config['host'] ?? '127.0.0.1'),
            'port' => (string) ($config['port'] ?? 3306),
            'username' => (string) ($config['username'] ?? 'root'),
            'password' => (string) ($config['password'] ?? ''),
            'database' => (string) ($config['database'] ?? ''),
        ];
    }

    /**
     * ⚠️ `MYSQL_PWD` — პაროლის ერთადერთი უსაფრთხო გზა: არგუმენტი პროცესების
     * სიაში ჩანს, გარემოს ცვლადი — არა.
     *
     * @return array<string, string>
     */
    private function env(array $config): array
    {
        return $config['password'] === '' ? [] : ['MYSQL_PWD' => $config['password']];
    }

    private function timeout(): int
    {
        return (int) config('mediary.backup.timeout', 900);
    }

    /**
     * ⚠️ **მიზეზი ბოლო ხაზებიდან და არა მთელი გამოტანიდან.** mysqldump-ის
     * შეცდომა ერთი სტრიქონია, სტანდარტული გამოტანა კი მთელი ბაზაა — ლოგში
     * მისი ჩაწერა ზუსტად იმას წაშლიდა, რის წასაკითხადაც იხსნება.
     */
    private function reason(Process $process): string
    {
        $error = trim($process->getErrorOutput());

        if ($error === '') {
            return 'exit code '.$process->getExitCode();
        }

        $lines = array_slice(preg_split('/\R/', $error) ?: [], -3);

        return mb_substr(implode(' | ', $lines), 0, 480);
    }

    /**
     * რამდენი ცხრილი ჩაიწერა — „ცარიელი დამპი" მხოლოდ ასე ჩანს.
     *
     * ⚠️ ფაილი **ხაზ-ხაზ** იკითხება: 4 მბ დღეს, შეიძლება 400 ხვალ.
     */
    private function countTables(string $path, bool $compressed = false): int
    {
        $handle = $compressed ? @gzopen($path, 'rb') : @fopen($path, 'rb');

        if ($handle === false) {
            return 0;
        }

        $count = 0;

        while (($line = $compressed ? gzgets($handle) : fgets($handle)) !== false) {
            if (str_starts_with($line, 'CREATE TABLE')) {
                $count++;
            }
        }

        $compressed ? gzclose($handle) : fclose($handle);

        return $count;
    }
}
