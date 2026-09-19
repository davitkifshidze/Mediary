<?php

namespace App\Services\Export;

use App\Models\User;
use App\Support\AppTime;
use App\Support\ExportDomain;
use App\Support\StatusDomain;
use DateTimeInterface;
use Generator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * **FEAT-06 — ერთი მოდულის ჩანაწერები ფაილად.**
 *
 * რიგების აგება ერთი და იგივეა ორივე ფორმატზე: `rows()` აბრუნებს
 * ტიპიზებულ მნიშვნელობებს, `json()`/`csv()` კი მხოლოდ **ხატავს** მათ.
 *
 * ⚠️ **ერთი შიგთავსი, ორი გამოსახულება — და არა ორი ექსპორტი.** თუ JSON
 * მეტს იტყოდა, ვიდრე CSV, „ჩემი მონაცემები" ორი სხვადასხვა რამ გახდებოდა
 * და მომხმარებელს ფორმატის არჩევა შიგთავსზე იმოქმედებდა. ერთადერთი
 * განსხვავება **ტიპებია**: CSV-ს ტიპები საერთოდ არ აქვს, ე.ი. მასივი
 * იკვრება სტრიქონად და `true` ხდება `1`. ეს CSV-ის თვისებაა და არა
 * გადაწყვეტილება.
 *
 * ⚠️ **პასუხი იდინება (`Generator` + `lazyById`) და არ გროვდება.** 353
 * ფილმის ბიბლიოთეკა პატარაა, 5000 სიმღერისა — აღარ; ხოლო `artisan serve`
 * ერთნაკადიანია, ე.ი. მეხსიერებაში აწყობილი მასივი მთელ აპლიკაციას
 * აჩერებს. იგივე მიზეზი, რის გამოც `StorageMeter::storeLocalFile()`
 * ნაკადით წერს და `SafeHttp` ნაწილ-ნაწილ კითხულობს.
 *
 * ⚠️ **`lazyById` და არა `chunk`** — `chunk()` ოფსეტს იყენებს, ე.ი. თუ
 * ექსპორტის მიმდინარეობისას ჩანაწერი წაიშალა, ყოველი შემდეგი პორცია
 * ერთ რიგს **ჩუმად გამოტოვებს** (ზუსტად ის ხაფანგი, რაც BUG-23-ის
 * მიგრაციას ეწერა).
 */
class RecordExporter
{
    /**
     * ველები, რომლებიც სვეტიდან **არ** იკითხება — რელაციიდან იკრიბება.
     *
     * ⚠️ **`status` აქ იმიტომაა, რომ ის ორ სხვადასხვა რამეს ნიშნავს** (§6.4):
     * ექვს დომენზე ის `Status` **მოდელია** (`status_id` → ლექსიკონი), სამზე
     * კი ჩვეულებრივი enum-სვეტი. სიაში ჩაწერის გარეშე პირველ ჯგუფზე
     * ფაილში ობიექტი ჩაიწერებოდა და CSV-ში `Illuminate\...\Status`.
     */
    public const VIRTUAL = ['genres', 'genre', 'category', 'type', 'status', 'status_name'];

    /** მასივის ელემენტების გამყოფი CSV-ის უჯრაში (ტეგი/ჟანრი) */
    private const LIST_GLUE = ' | ';

    /** რამდენ ჩანაწერს კითხულობს ერთი პორცია */
    private const CHUNK = 500;

    /**
     * ამ ანგარიშის ჩანაწერები ამ მოდულში.
     *
     * ⚠️ **ცხადი `user_id` და არა `owner` scope-ზე დაყრდნობა.** scope
     * `Auth::id()`-ს კითხულობს, ე.ი. რექვესთის გარეთ (რიგის worker-ი,
     * კონსოლი) ის **ცარიელია** და ექსპორტში ყველა ანგარიშის ჩანაწერი
     * მოხვდებოდა — ზუსტად ის, რაც `RunBatchItem`-ს `Auth::setUser()`-ის
     * დაწერას აიძულებდა. `PurgeService::modelQuery()` იმავე მიზეზით
     * წერს მფლობელს ცხადად.
     */
    public function query(User $user, string $module): Builder
    {
        $model = ExportDomain::model($module);

        return $model::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->with(ExportDomain::with($module))
            ->orderBy('id');
    }

    public function count(User $user, string $module): int
    {
        return $this->query($user, $module)->count();
    }

    /**
     * რიგები — თითო ჩანაწერზე „ველი → მნიშვნელობა".
     *
     * @return Generator<int, array<string, mixed>>
     */
    public function rows(User $user, string $module): Generator
    {
        $fields = ExportDomain::fields($module);

        foreach ($this->query($user, $module)->lazyById(self::CHUNK) as $record) {
            $row = [];

            foreach ($fields as $field) {
                $row[$field] = $this->value($record, $module, $field);
            }

            yield $row;
        }
    }

    /**
     * JSON — ნაკადად, კონვერტთან ერთად.
     *
     * ⚠️ **კონვერტი (`module`/`exported_at`/`timezone`/`fields`) სავალდებულოა.**
     * ველების სია თვითონ ფაილშია, რომ წაკითხვა იმ კოდზე არ იყოს
     * დამოკიდებული, რომელმაც ის დაწერა; `timezone` კი იმიტომ, რომ
     * თარიღები კედლის საათითაა (იხ. `date()`) და ოფსეტის გარეშე
     * ერთი და იგივე სტრიქონი ორ სხვადასხვა მომენტს ნიშნავდა.
     */
    public function json(User $user, string $module): Generator
    {
        $meta = [
            'module' => $module,
            'exported_at' => AppTime::now()->format('Y-m-d H:i:s'),
            'timezone' => AppTime::zone(),
            'fields' => ExportDomain::fields($module),
        ];

        $head = rtrim(json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n}");

        yield $head.",\n  \"records\": [";

        $first = true;

        foreach ($this->rows($user, $module) as $row) {
            yield ($first ? "\n    " : ",\n    ")
                .json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $first = false;
        }

        yield ($first ? '' : "\n  ")."]\n}\n";
    }

    /**
     * CSV — ნაკადად.
     *
     * ⚠️ **BOM აუცილებელია.** Excel UTF-8-ს **არ** ცნობს ავტომატურად და
     * მხედრული უბრალოდ ჯღაბნად იხსნება; სამი ბაიტი კი ყველა სხვა
     * წამკითხველისთვის უვნებელია.
     */
    public function csv(User $user, string $module): Generator
    {
        $fields = ExportDomain::fields($module);

        yield "\u{FEFF}".$this->line($fields);

        foreach ($this->rows($user, $module) as $row) {
            yield $this->line(array_map($this->flat(...), $row));
        }
    }

    /**
     * ერთი ველის მნიშვნელობა.
     *
     * ⚠️ **ვირტუალური ველების გარდა ყველაფერი პირდაპირ იკითხება** —
     * და ეს სვეტსაც ფარავს, და აქსესორსაც (`title_ka` ფილმზე
     * `movie_translations`-ში ზის). ამიტომ `ExportDomain`-ის სია
     * სახელების უბრალო ჩამონათვალია და არა რუკა.
     */
    private function value(Model $record, string $module, string $field): mixed
    {
        if (! in_array($field, self::VIRTUAL, true)) {
            return $this->normalize($record->{$field});
        }

        return match ($field) {
            'genres' => $record->genres->map($this->label(...))->filter()->values()->all(),
            'genre' => $this->label($record->genre),
            'category' => $this->label($record->category),
            'type' => $this->label($record->type),
            /* §6.4 — ექვს დომენზე ეს ლექსიკონის რიგია და გასაღები გვინდა,
               სამზე კი enum-სვეტი, ე.ი. თვითონ სტრიქონი. */
            'status' => StatusDomain::usesDictionary($module)
                ? $record->status_key
                : $this->normalize($record->status),
            'status_name' => $this->label($record->status),
            default => null,
        };
    }

    /** ლექსიკონის რიგი → წასაკითხი სახელი (ka, შემდეგ en) */
    private function label(mixed $row): ?string
    {
        if (! $row instanceof Model) {
            return null;
        }

        return $row->name_ka ?: $row->name_en ?: null;
    }

    /**
     * მნიშვნელობის ნორმალიზება.
     *
     * ⚠️ **თარიღი კედლის საათითაა და არა ISO-UTC.** ფაილს ენა და ზონა არ
     * აქვს, Excel კი `2026-09-19T20:00:00Z`-ს არც კითხულობს და არც
     * გადაიყვანს — ე.ი. ქართული საღამო წინა დღედ წაიკითხებოდა. ზუსტად
     * იგივე მიზეზი, რის გამოც `lib/dates.ts` `sv-SE`-ს იყენებს და არა
     * `toISOString()`-ს (BUG-15). ზონას კონვერტი ამბობს.
     */
    private function normalize(mixed $value): mixed
    {
        if ($value instanceof DateTimeInterface) {
            return AppTime::at($value)?->format('Y-m-d H:i:s');
        }

        return $value;
    }

    /** ტიპიანი მნიშვნელობა → CSV-ის უჯრა */
    private function flat(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if (is_array($value)) {
            return implode(self::LIST_GLUE, array_map('strval', $value));
        }

        return $this->deFormula((string) $value);
    }

    /**
     * **CSV-ის ფორმულის ინექციის დაცვა.**
     *
     * ⚠️ **ეს თეორიული არ არის.** `=`/`+`/`@`-ით დაწყებულ უჯრას Excel-იც
     * და Google Sheets-იც **ფორმულად** კითხულობს, ტექსტი კი ამ აპში
     * გარედან მოდის: ბუკმარკის სათაურს `LinkMetadata` **უცხო გვერდის
     * `<head>`-იდან** იღებს, ფილმის აღწერას — TMDB-იდან. ე.ი. ექსპორტს
     * სწორედ ის ტექსტი გააქვს, რომელიც ჩვენ არ დაგვიწერია.
     *
     * ⚠️ **მინუსი განზრახ მხოლოდ არა-რიცხვზე ესკეიპდება** — თორემ `-5`
     * გახდებოდა `'-5` და ყველა უარყოფითი რიცხვი ტექსტად იქცეოდა, ე.ი.
     * დაცვა მონაცემს გააფუჭებდა.
     */
    private function deFormula(string $value): string
    {
        if ($value === '' || is_numeric($value)) {
            return $value;
        }

        return in_array($value[0], ['=', '+', '-', '@', "\t", "\r"], true) ? "'".$value : $value;
    }

    /**
     * ერთი CSV-ის ხაზი (`fputcsv`-ის ესკეიპინგით, ფაილის გარეშე).
     *
     * ⚠️ **`escape` ცხადად ცარიელია.** ნაგულისხმევი `\` არა-სტანდარტულია:
     * ტექსტში მოხვედრილი უკუდახრილი მომდევნო ბრჭყალს „აესკეიპებდა" და
     * უჯრა გაიხსნებოდა — RFC 4180-ს ესკეიპ-სიმბოლო საერთოდ არ აქვს.
     * (PHP 8.4-ში ამ არგუმენტის გამოტოვება deprecated-იცაა.)
     */
    private function line(array $cells): string
    {
        $fh = fopen('php://memory', 'r+');
        fputcsv($fh, $cells, ',', '"', '');
        rewind($fh);
        $line = stream_get_contents($fh);
        fclose($fh);

        return $line;
    }
}
