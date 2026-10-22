<?php

namespace App\Services\Export;

use App\Models\Status;
use App\Models\User;
use App\Services\Modules\CustomFieldService;
use App\Support\AppTime;
use App\Support\CustomModules;
use App\Support\ExportDomain;
use App\Support\RecordLocks;
use App\Support\RichText;
use App\Support\StatusDomain;
use DateTimeInterface;
use Generator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * **ერთი მოდულის ჩანაწერები ფაილად.**
 *
 * რიგების აგება ერთი და იგივეა ორივე ფორმატზე: `rows()` აბრუნებს
 * ტიპიზებულ მნიშვნელობებს, `json()`/`csv()` კი მხოლოდ **ხატავს** მათ.
 *
 * ⚠️ **ერთი შიგთავსი, ორი გამოსახულება — და არა ორი ექსპორტი.** თუ JSON
 * მეტს იტყოდა, ვიდრე CSV, „ჩემი მონაცემები" ორი სხვადასხვა რამ გახდებოდა
 * და მომხმარებელს ფორმატის არჩევა შიგთავსზე იმოქმედებდა. ერთადერთი
 * განსხვავება **ტიპებია**: CSV-ს ტიპები საერთოდ არ აქვს, ე.ი. მასივი
 * იკვრება სტრიქონად და `true` ხდება `1`. ეს CSV-ის თვისებაა და არა
 * გადაწყვეტილება. ⚠️ მეორე განსხვავება: **აღწერა CSV-ში უბრალო
 * ტექსტია** (`RichText::plain()`), JSON-ში კი Markdown რჩება — ცხრილში `**` და
 * `[..](..)` ხმაურია, JSON-ის ფაილი კი მონაცემია და ფორმატს არ კარგავს.
 *
 * ⚠️ **პასუხი იდინება (`Generator` + id-ით პორციები) და არ გროვდება.** 353
 * ფილმის ბიბლიოთეკა პატარაა, 5000 სიმღერისა — აღარ; ხოლო `artisan serve`
 * ერთნაკადიანია, ე.ი. მეხსიერებაში აწყობილი მასივი მთელ აპლიკაციას
 * აჩერებს. იგივე მიზეზი, რის გამოც `StorageMeter::storeLocalFile()`
 * ნაკადით წერს და `SafeHttp` ნაწილ-ნაწილ კითხულობს.
 *
 * ⚠️ **id-ით პორციები და არა `chunk`** — `chunk()` ოფსეტს იყენებს, ე.ი. თუ
 * ექსპორტის მიმდინარეობისას ჩანაწერი წაიშალა, ყოველი შემდეგი პორცია
 * ერთ რიგს **ჩუმად გამოტოვებს** (ზუსტად ის ხაფანგი, რაც ერთ-ერთ
 * ძველ მიგრაციას ეწერა).
 */
class RecordExporter
{
    /**
     * ველები, რომლებიც სვეტიდან **არ** იკითხება — რელაციიდან იკრიბება.
     *
     * ⚠️ **`status` აქ იმიტომაა, რომ ის ორ სხვადასხვა რამეს ნიშნავს**:
     * ექვს დომენზე ის `Status` **მოდელია** (`status_id` → ლექსიკონი), სამზე
     * კი ჩვეულებრივი enum-სვეტი. სიაში ჩაწერის გარეშე პირველ ჯგუფზე
     * ფაილში ობიექტი ჩაიწერებოდა და CSV-ში `Illuminate\...\Status`.
     */
    public const VIRTUAL = ['genres', 'genre', 'category', 'type', 'course', 'status', 'status_name', ...ExportDomain::EXTRAS];

    /** მასივის ელემენტების გამყოფი CSV-ის უჯრაში (ტეგი/ჟანრი) */
    private const LIST_GLUE = ' | ';

    /** რამდენ ჩანაწერს კითხულობს ერთი პორცია */
    private const CHUNK = 500;

    public function __construct(
        private readonly RecordExtras $extras,
        private readonly CustomFieldService $fields,
    ) {}

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
            // ⚠️ პირადი მოდულის ჩანაწერები ერთ ცხრილშია: მოდულით ჭრა სავალდებულოა
            ->when(CustomModules::isKey($module), fn (Builder $q) => $q->where('module', $module))
            // ექსპორტი ჩაკეტილს არ შეიცავს, სესიაში გახსნილსაც
            ->when(RecordLocks::hides($model), fn (Builder $q) => $q->withoutLocked())
            ->with($this->relations($module))
            ->orderBy('id');
    }

    /**
     * წინასწარ ჩასატვირთი რელაციები.
     *
     * ⚠️ **ჩაკეტილი მსახიობი ფილმის მსახიობებშიც არ გადის**
     * (`withoutLocked()`): `record_lock` scope მხოლოდ *დამალულს*
     * ჭრის, ექსპორტის წესი კი „ყველა ჩაკეტილი გარეთ"-ია.
     *
     * @return array<int|string, mixed>
     */
    private function relations(string $module): array
    {
        $out = [];

        foreach (ExportDomain::with($module) as $relation) {
            if ($relation === 'castLinks') {
                $out['castLinks'] = fn ($q) => $q->withoutLocked();

                continue;
            }

            $out[] = $relation;
        }

        return $out;
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
        $query = $this->query($user, $module);
        $key = $query->getModel()->getQualifiedKeyName();
        $last = 0;

        /* ⚠️ **პორციები ხელით და არა `lazyById()`-ით**: დამატებითი
           ველები და ეპიზოდები რელაცია არ არის და პორციაზე ერთი query-ით
           იკითხება (`RecordExtras::preload()`); `lazyById` პორციის საზღვარს არ
           აჩენს. წესი იგივეა — id-ით წინ და არა ოფსეტით (წაშლა ვერ გამოტოვებს). */
        do {
            $chunk = (clone $query)->where($key, '>', $last)->limit(self::CHUNK)->get();

            if ($chunk->isEmpty()) {
                break;
            }

            $this->extras->preload($user, $module, $chunk);

            foreach ($chunk as $record) {
                $row = [];

                foreach ($fields as $field) {
                    $row[$field] = $this->value($record, $module, $field);
                }

                yield $row;
            }

            $last = $chunk->last()->getKey();
        } while ($chunk->count() === self::CHUNK);
    }

    /**
     * ფაილის კონვერტი — ველები და ის, რაც იმპორტს ჩანაწერის გარეთ სჭირდება.
     *
     * ⚠️ **კონვერტი (`module`/`exported_at`/`timezone`/`fields`) სავალდებულოა.**
     * ველების სია თვითონ ფაილშია, რომ წაკითხვა იმ კოდზე არ იყოს
     * დამოკიდებული, რომელმაც ის დაწერა; `timezone` კი იმიტომ, რომ
     * თარიღები კედლის საათითაა (იხ. `date()`) და ოფსეტის გარეშე
     * ერთი და იგივე სტრიქონი ორ სხვადასხვა მომენტს ნიშნავდა.
     *
     * ⚠️ `custom_field_definitions` და `statuses`: ჩანაწერში
     * მხოლოდ ველის `key` და სტატუსის გასაღებია; სხვა ანგარიშზე (ან სხვა
     * სერვერზე) იმპორტს ველის ტიპი და სტატუსის როლი სჭირდება, რომ ისინი
     * თავიდან შექმნას (`MediaryImporter`).
     *
     * @return array<string, mixed>
     */
    public function envelope(User $user, string $module): array
    {
        $meta = [
            'app' => 'mediary',
            'module' => $module,
            'exported_at' => AppTime::now()->format('Y-m-d H:i:s'),
            'timezone' => AppTime::zone(),
            'fields' => ExportDomain::fields($module),
        ];

        if (in_array('custom_fields', ExportDomain::extras($module), true)) {
            $meta['custom_field_definitions'] = array_map(
                fn (array $field) => array_intersect_key($field, array_flip(['key', 'type', 'label_ka', 'label_en', 'placeholder_ka', 'placeholder_en', 'enabled', 'required', 'sort_order'])),
                $this->fields->definitions($user, $module),
            );
        }

        if (StatusDomain::usesDictionary($module)) {
            $meta['statuses'] = Status::withoutGlobalScopes()
                ->where('user_id', $user->getKey())
                ->where('module', $module)
                ->whereNull('trashed_at')
                ->ordered()
                ->get(['key', 'name_ka', 'name_en', 'role', 'icon', 'color', 'is_default'])
                ->map(fn (Status $status) => [
                    'key' => $status->key,
                    'name_ka' => $status->name_ka,
                    'name_en' => $status->name_en,
                    'role' => $status->role,
                    'icon' => $status->icon,
                    'color' => $status->color,
                    'is_default' => (bool) $status->is_default,
                ])
                ->all();
        }

        return $meta;
    }

    /**
     * JSON — ნაკადად, კონვერტთან ერთად (`envelope()`).
     *
     * `$tap` — „სრული ექსპორტი" ყოველ რიგს ხედავს, რომ მისი
     * ფაილები ZIP-ში ჩადოს (`ExportDomain::paths()`), რიგების მეორედ აგების გარეშე.
     *
     * @param  (callable(array<string, mixed>): void)|null  $tap
     */
    public function json(User $user, string $module, ?callable $tap = null): Generator
    {
        $json = (string) json_encode($this->envelope($user, $module), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        // ⚠️ მხოლოდ ბოლო `}` იჭრება — `rtrim(…, "\n}")` ბოლო ობიექტის ფრჩხილებსაც შეჭამდა
        $head = rtrim(substr($json, 0, (int) strrpos($json, '}')));

        yield $head.",\n  \"records\": [";

        $first = true;

        foreach ($this->rows($user, $module) as $row) {
            if ($tap) {
                $tap($row);
            }

            yield ($first ? "\n    " : ",\n    ")
                .json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
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
            yield $this->line(array_map($this->flat(...), $this->plainText($row)));
        }
    }

    /** Markdown-ის ველები (აღწერა) CSV-ის უჯრაში უბრალო ტექსტად */
    private function plainText(array $row): array
    {
        foreach (RichText::FIELDS as $field) {
            if (is_string($row[$field] ?? null)) {
                $row[$field] = RichText::plain($row[$field]);
            }
        }

        return $row;
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

        // ჩანაწერის „დამატებები" (დამატებითი ველები, ფაილები, გალერეა…)
        if (in_array($field, ExportDomain::EXTRAS, true)) {
            return $this->extras->value($record, $field);
        }

        return match ($field) {
            'genres' => $record->genres->map($this->label(...))->filter()->values()->all(),
            'genre' => $this->label($record->genre),
            'category' => $this->label($record->category),
            'type' => $this->label($record->type),
            // ვიდეოს კურსი — სათაურით (id სხვა ბაზაში არაფერს ნიშნავს)
            'course' => $record->course?->title,
            /* ექვს დომენზე ეს ლექსიკონის რიგია და გასაღები გვინდა,
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
     * `toISOString()`-ს. ზონას კონვერტი ამბობს.
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
            /* ⚠️ **ობიექტების სია (ბუკმარკის `links`) JSON-ად იწერება**:
               `strval()` მასივზე „Array to string conversion"-ით ვარდებოდა, ხოლო
               ბრტყელი წებო ლეიბლს, ბმულსა და ფასს ერთმანეთში აურევდა. `[`-ით
               დაწყებული უჯრა ფორმულად არ იკითხება, ე.ი. `deFormula()` არ სჭირდება. */
            /* **ასოციაციური მასივიც** (დამატებითი ველები `key → მნიშვნელობა`):
               ბრტყელი წებო გასაღებებს დაკარგავდა და უკან ვეღარ წაიკითხებოდა. */
            if (! array_is_list($value) || array_filter($value, 'is_array') !== []) {
                return (string) json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }

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
