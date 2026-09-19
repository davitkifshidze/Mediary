<?php

namespace App\Services\Import;

use App\Support\ImportSource;
use Illuminate\Http\UploadedFile;

/**
 * **FEAT-07 — CSV-ის წაკითხვა.**
 *
 * ერთადერთი ადგილი, სადაც ატვირთული ფაილი ტექსტიდან რიგებად იქცევა.
 *
 * ⚠️ **ფაილი არსად არ ინახება.** ის შემოსული მონაცემია და არა ბიბლიოთეკის
 * ფაილი: `StorageMeter`-ზე არ გადის, კვოტას არ ხარჯავს და რექვესთის
 * დასრულებისთანავე ქრება. სწორედ ამიტომ გეგმა **სრულ სიას** აბრუნებს
 * პასუხში — რიგის შესრულებას ფაილი მეორედ აღარ სჭირდება.
 *
 * ⚠️ **BOM ხელით იჭრება.** Excel-ში შენახული CSV სამი ბაიტით იწყება და
 * პირველი სვეტის სახელი `\u{FEFF}Name` ხდება — ე.ი. **ხელმოწერის ამოცნობა
 * და სვეტების რუკა ჩუმად ცდებოდა** სწორედ იმ ფაილებზე, რომლებსაც ხალხი
 * ყველაზე ხშირად ტვირთავს. იგივე სამი ბაიტი, რომელსაც ჩვენი ექსპორტი წერს.
 *
 * ⚠️ **გამყოფი ცნობადია და არა ჩაბეტონებული მძიმე.** ევროპულ ლოკალზე
 * Excel `;`-ით ინახავს, ხოლო ცნობა მარტივია: სათაურების ხაზზე რომელი
 * სიმბოლოც მეტჯერ გვხვდება, ის არის. არასწორი გამყოფი ერთსვეტიან
 * ცხრილს იძლევა — ე.ი. „ფაილი ცარიელია"-ს ტიპის უაზრო შეცდომას.
 */
class CsvReader
{
    /** შესაძლო გამყოფები — რიგი მნიშვნელობა არ აქვს, მხოლოდ სიხშირე ითვლება */
    private const DELIMITERS = [',', ';', "\t", '|'];

    /**
     * @return array{headers: list<string>, rows: list<array<string, string>>, total: int, truncated: bool}
     */
    public function read(UploadedFile $file): array
    {
        $handle = fopen($file->getRealPath(), 'r');

        if (! $handle) {
            return ['headers' => [], 'rows' => [], 'total' => 0, 'truncated' => false];
        }

        $first = fgets($handle);

        if ($first === false) {
            fclose($handle);

            return ['headers' => [], 'rows' => [], 'total' => 0, 'truncated' => false];
        }

        $first = $this->stripBom($first);
        $delimiter = $this->delimiter($first);

        rewind($handle);
        // ⚠️ პირველ ხაზს ისევ ვკითხულობთ, რომ BOM-იანი ვარიანტი აღარ დაბრუნდეს
        $headers = $this->row($handle, $delimiter);
        $headers[0] = isset($headers[0]) ? $this->stripBom($headers[0]) : '';
        $headers = array_map(fn ($h) => trim((string) $h), $headers);

        $rows = [];
        $total = 0;
        $truncated = false;

        while (($cells = $this->row($handle, $delimiter)) !== null) {
            // ცარიელი ხაზი (ფაილის ბოლო) რიგად არ ითვლება
            if ($cells === [null] || (count($cells) === 1 && trim((string) $cells[0]) === '')) {
                continue;
            }

            $total++;

            if (count($rows) >= ImportSource::MAX_ROWS) {
                $truncated = true;

                continue;
            }

            $row = [];
            foreach ($headers as $i => $header) {
                $row[$header] = trim((string) ($cells[$i] ?? ''));
            }
            // ხაზის ნომერი ანგარიშისთვის — სათაურის ხაზი პირველია
            $row['__line'] = (string) ($total + 1);

            $rows[] = $row;
        }

        fclose($handle);

        return ['headers' => $headers, 'rows' => $rows, 'total' => $total, 'truncated' => $truncated];
    }

    /** @return list<string>|null */
    private function row($handle, string $delimiter): ?array
    {
        // ⚠️ `escape: ''` — RFC 4180-ს ესკეიპ-სიმბოლო არ აქვს; ნაგულისხმევი `\`
        // ტექსტში მოხვედრილ უკუდახრილზე უჯრას გახსნიდა (იგივე წესი, რაც ექსპორტს)
        $cells = fgetcsv($handle, 0, $delimiter, '"', '');

        return $cells === false ? null : $cells;
    }

    private function stripBom(string $value): string
    {
        return str_starts_with($value, "\u{FEFF}") ? substr($value, 3) : $value;
    }

    /** სათაურების ხაზში ყველაზე ხშირი კანდიდატი */
    private function delimiter(string $line): string
    {
        $best = ',';
        $bestCount = 0;

        foreach (self::DELIMITERS as $candidate) {
            $count = substr_count($line, $candidate);

            if ($count > $bestCount) {
                $best = $candidate;
                $bestCount = $count;
            }
        }

        return $best;
    }
}
