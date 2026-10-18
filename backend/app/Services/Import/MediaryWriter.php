<?php

namespace App\Services\Import;

use App\Models\CustomCategory;
use App\Models\Genre;
use App\Models\Status;
use App\Models\User;
use App\Services\Export\RecordExporter;
use App\Support\CustomModules;
use App\Support\ExportDomain;
use App\Support\StatusDomain;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * **ექსპორტის ერთი რიგი → ჩემი ახალი ჩანაწერი.**
 *
 * ⚠️ **id-ები თავიდან ინომრება და სხვისი რიცხვი არსად ჯდება.** ფაილის `id`,
 * `user_id`, `status_id` ამ ბაზაში არაფერს ნიშნავს: ჩანაწერი ახალ id-ს იღებს,
 * მფლობელი — მე ვარ, ლექსიკონები (სტატუსი, ჟანრი, კატეგორია, ტიპი,
 * სამსახური) კი **ჩემს** ლექსიკონში იძებნება გასაღებით ან სახელით და,
 * თუ არ მაქვს, იქმნება — სხვა ანგარიშის რიგზე მიბმა პრინციპულად შეუძლებელია.
 *
 * ⚠️ **მონაცემი ფაილიდან იღება, როგორც არის** — TMDB-ს, Open Library-ს და
 * სხვა წყაროს არავინ ეკითხება. ცარიელი ველი ცარიელი
 * რჩება; შეავსებს `/sync`, თუ მოინდომებ.
 *
 * ⚠️ **ჩანაწერი მოდელით იწერება** (`save()`), ე.ი. მოდელის ყველა წესი
 * მუშაობს: აუდიტი (`AuditObserver`), ნახვების ჟურნალი (`HasWatchLog`),
 * ტეგების ნორმალიზება — იმპორტი ცალკე, „უწესო" გზა არ არის.
 */
class MediaryWriter
{
    /** ველები, რომლებიც სვეტად არ იწერება (ცალკე მუშავდება ან ამ ბაზის გარეთ არაფერს ნიშნავს) */
    private const SKIP = [
        'id', 'user_id', 'module', 'status', 'status_id', 'created_at', 'updated_at', 'trashed_at',
        'sort_order', 'visibility',
        // ჩამოწერილი ვიდეო თავიდან ჩამოიწერება — სახელი ფაილის გარეშე არაფერია
        'download_name', 'download_path',
    ];

    /** ლექსიკონის ველი → ჩანაწერის `BelongsTo` რელაცია */
    private const DICTIONARIES = ['genre' => 'genre', 'category' => 'category', 'type' => 'type', 'workplace_name' => 'workplace'];

    /** ფილმი/სერიალი/ანიმე — სათაური და აღწერა თარგმანებშია */
    private const TRANSLATED = ['movie', 'series', 'anime'];

    /**
     * @param  array<string, mixed>  $record
     * @param  array<string, mixed>  $envelope
     */
    public function create(User $user, string $module, array $record, array $envelope, MediaryFiles $files): Model
    {
        $class = ExportDomain::model($module);
        /** @var Model $model */
        $model = new $class;
        $columns = MediarySchema::columns($model->getTable());
        $fields = ExportDomain::fields($module);

        $model->forceFill(['user_id' => $user->getKey()]);

        if (CustomModules::isKey($module)) {
            $model->forceFill(['module' => $module]);
        }

        // ⚠️ სტატუსი **ჯერ** — `applyStatus()` „როდის დასრულდა"-ს წერს, ფაილის თარიღი კი მას მერე გადაეწერება
        $this->status($user, $module, $model, $record, $envelope);

        $photo = ExportDomain::photo($module) ?? [];
        $attrs = [];

        foreach ($fields as $field) {
            if (in_array($field, self::SKIP, true) || in_array($field, $photo, true)
                || in_array($field, RecordExporter::VIRTUAL, true)
                || ! isset($columns[$field]) || ! array_key_exists($field, $record)) {
                continue;
            }

            $value = MediarySchema::coerce($model, $field, $columns[$field], $record[$field]);

            // NOT NULL სვეტზე ცარიელი — ბაზის ნაგულისხმევი დარჩეს (`platform`, `format`…)
            if ($value === null && ! $columns[$field]['nullable']) {
                continue;
            }

            $attrs[$field] = $value;
        }

        if (in_array($record['visibility'] ?? null, ['private', 'public'], true)) {
            $attrs['visibility'] = $record['visibility'];
        }

        // enum-სტატუსი (წიგნი, თამაში, კურსი, ადგილი) — მხოლოდ ცნობადი მნიშვნელობა
        if (! StatusDomain::usesDictionary($module) && isset($columns['status']) && is_string($record['status'] ?? null)) {
            $allowed = defined($class.'::STATUSES') ? $class::STATUSES : [];

            if ($allowed === [] || in_array($record['status'], $allowed, true)) {
                $attrs['status'] = $record['status'];
            }
        }

        $model->forceFill($attrs);

        $this->dictionaries($user, $module, $model, $record);
        $this->photo($user, $module, $model, $record, $files);

        if ($created = MediarySchema::moment($record['created_at'] ?? null)) {
            // ⚠️ ქრონოლოგია ფაილისაა — „დამატების თარიღით" დალაგება იმპორტის დღეზე არ უნდა გადავიდეს
            $model->setAttribute('created_at', $created);
        }

        $model->save();

        if (in_array($module, self::TRANSLATED, true) && method_exists($model, 'setTranslation')) {
            foreach (['ka', 'en'] as $locale) {
                $model->setTranslation($locale, [
                    'title' => $this->text($record["title_{$locale}"] ?? null, 255),
                    'description' => $this->text($record["description_{$locale}"] ?? null),
                ]);
            }
        }

        $this->genres($user, $module, $model, $record);

        return $model;
    }

    /* ---------- სტატუსი ---------- */

    /**
     * ლექსიკონის სტატუსი (ფილმი, ვიდეო, ჩანიშვნა, ბუკმარკი, პირადი მოდული).
     *
     * რიგი: ჩემი სტატუსი იმავე **გასაღებით** → იმავე **სახელით** (CSV-ის
     * `status_name`) → კონვერტის სტატუსი, რომელიც მე არ მაქვს, **იქმნება**
     * თავისი როლით → ნაგულისხმევი. ⚠️ ლოგიკა როლს კითხულობს და არა სახელს
     * (CLAUDE.md), ამიტომ როლის გარეშე სტატუსი არ იქმნება.
     */
    private function status(User $user, string $module, Model $model, array $record, array $envelope): void
    {
        if (! StatusDomain::usesDictionary($module) || ! method_exists($model, 'applyStatus')) {
            return;
        }

        $userId = (int) $user->getKey();
        Status::ensureDefaults($userId, $module);

        $mine = Status::withoutGlobalScopes()
            ->where('user_id', $userId)
            ->where('module', $module)
            ->whereNull('trashed_at')
            ->ordered()
            ->get();

        $key = is_string($record['status'] ?? null) ? trim($record['status']) : '';
        $status = $key !== '' ? $mine->firstWhere('key', $key) : null;

        if (! $status && is_string($record['status_name'] ?? null) && trim($record['status_name']) !== '') {
            $name = mb_strtolower(trim($record['status_name']));
            $status = $mine->first(fn (Status $s) => mb_strtolower((string) $s->name_ka) === $name || mb_strtolower((string) $s->name_en) === $name);
        }

        if (! $status && $key !== '') {
            $status = $this->createStatus($userId, $module, $key, $envelope, (int) $mine->max('sort_order'));
        }

        $model->applyStatus($status ?? Status::defaultFor($userId, $module));
    }

    private function createStatus(int $userId, string $module, string $key, array $envelope, int $sort): ?Status
    {
        $def = collect((array) ($envelope['statuses'] ?? []))
            ->first(fn ($s) => is_array($s) && ($s['key'] ?? null) === $key);

        if (! $def || ! in_array($def['role'] ?? null, StatusDomain::ROLES, true)) {
            return null;
        }

        $nameKa = $this->text($def['name_ka'] ?? null, 60) ?? $key;
        $nameEn = $this->text($def['name_en'] ?? null, 60) ?? $nameKa;

        // ⚠️ გასაღები თავისუფალია? (ურნაში მყოფიც იკავებს)
        $taken = in_array($key, StatusDomain::RESERVED_KEYS, true)
            || ! preg_match('/^[a-z0-9_-]{1,60}$/', $key)
            || Status::withoutGlobalScopes()->where('user_id', $userId)->where('module', $module)->where('key', $key)->exists();

        $status = new Status;
        $status->forceFill([
            'user_id' => $userId,
            'module' => $module,
            'key' => $taken ? Status::makeKey($userId, $module, $nameEn) : $key,
            'name_ka' => $nameKa,
            'name_en' => $nameEn,
            'role' => $def['role'],
            'icon' => $this->text($def['icon'] ?? null, 64),
            'color' => $this->text($def['color'] ?? null, 32),
            'is_default' => false,
            'sort_order' => $sort + 1,
        ])->save();

        return $status;
    }

    /* ---------- ლექსიკონები ---------- */

    /** `BelongsTo` ლექსიკონები: ჟანრი (წიგნი, სამაგიდო), კატეგორია, ტიპი, სამსახური */
    private function dictionaries(User $user, string $module, Model $model, array $record): void
    {
        $fields = ExportDomain::fields($module);

        foreach (self::DICTIONARIES as $field => $relation) {
            if (! in_array($field, $fields, true) || ! method_exists($model, $relation)) {
                continue;
            }

            $rel = $model->{$relation}();
            $label = $this->text($record[$field] ?? null, 100);

            if (! $rel instanceof BelongsTo || $label === null) {
                continue;
            }

            if ($row = $this->dictionary($user, $module, $rel->getRelated(), $label, $record)) {
                $model->setAttribute($rel->getForeignKeyName(), $row->getKey());
            }
        }
    }

    /** ჟანრები — ფილმზე საერთო (`genres`), სიმღერასა და თამაშზე ჩემი ლექსიკონი */
    private function genres(User $user, string $module, Model $model, array $record): void
    {
        if (! in_array('genres', ExportDomain::fields($module), true) || ! method_exists($model, 'genres')) {
            return;
        }

        $labels = is_array($record['genres'] ?? null)
            ? $record['genres']
            : (is_string($record['genres'] ?? null) ? explode(' | ', $record['genres']) : []);

        $related = $model->genres()->getRelated();
        $ids = [];

        foreach ($labels as $label) {
            $label = $this->text($label, 100);
            if ($label === null) {
                continue;
            }

            $row = $related instanceof Genre ? $this->sharedGenre($label) : $this->dictionary($user, $module, $related, $label, $record);
            if ($row) {
                $ids[] = $row->getKey();
            }
        }

        if ($ids !== []) {
            $model->genres()->sync(array_values(array_unique($ids)));
        }
    }

    /**
     * საერთო ჟანრი (ფილმი/სერიალი/ანიმე) — ჯერ სახელით (ნებისმიერ ენაზე),
     * მერე `MovieController::syncGenres()`-ის წესით (slug-ით, ახალს ორივე სახელით).
     */
    private function sharedGenre(string $label): Genre
    {
        $found = Genre::whereHas('translations', fn ($q) => $q->where('name', $label))->first();

        if ($found) {
            return $found;
        }

        $slug = Str::slug($label) ?: 'g-'.substr(md5($label), 0, 8);
        $genre = Genre::firstOrCreate(['slug' => $slug]);

        if ($genre->wasRecentlyCreated) {
            $genre->setTranslation('en', $label);
            $genre->setTranslation('ka', $label);
        }

        return $genre;
    }

    /**
     * ჩემი ლექსიკონის რიგი სახელით; არ მაქვს — იქმნება.
     *
     * ⚠️ **ნაგულისხმევები ჯერ** (`ensureDefaults()`): ისინი მხოლოდ ცარიელ
     * ლექსიკონში ჩნდება, ე.ი. იმპორტის პირველი ჟანრი სამუდამოდ წაართმევდა
     * ანგარიშს საწყის ნაკრებს.
     */
    private function dictionary(User $user, string $module, Model $related, string $label, array $record): ?Model
    {
        $class = $related::class;
        $userId = (int) $user->getKey();

        if (method_exists($class, 'ensureDefaults')) {
            $class::ensureDefaults($userId);
        } elseif (method_exists($class, 'ensureDefault')) {
            $class::ensureDefault($userId);
        }

        $columns = MediarySchema::columns($related->getTable());
        $base = fn () => $class::withoutGlobalScopes()
            ->where('user_id', $userId)
            ->when(isset($columns['trashed_at']), fn ($q) => $q->whereNull('trashed_at'))
            ->when($related instanceof CustomCategory, fn ($q) => $q->where('module', $module));

        $needle = mb_strtolower($label);
        $found = $base()->get()->first(function (Model $row) use ($needle) {
            foreach (['name', 'name_ka', 'name_en'] as $column) {
                $value = $row->getAttribute($column);

                if (is_string($value) && mb_strtolower(trim($value)) === $needle) {
                    return true;
                }
            }

            return false;
        });

        if ($found) {
            return $found;
        }

        $fill = ['user_id' => $userId];

        if (isset($columns['sort_order'])) {
            $fill['sort_order'] = (int) $base()->max('sort_order') + 1;
        }
        if (isset($columns['name'])) {
            $fill['name'] = $label;
        }
        if (isset($columns['name_ka'])) {
            $fill['name_ka'] = $label;
            $fill['name_en'] = $label;
        }
        if (isset($columns['module'])) {
            $fill['module'] = $module;
        }
        if (isset($columns['key'])) {
            $fill['key'] = $related instanceof CustomCategory
                ? CustomCategory::makeKey($userId, $module, $label)
                : $class::makeKey($userId, $label);
        }
        // მორიგეობის ტიპს საათები სჭირდება (`NOT NULL`) — ცვლის საათები
        if (isset($columns['hours'])) {
            $fill['hours'] = is_numeric($record['hours'] ?? null) ? (float) $record['hours'] : 0;
        }
        if (isset($columns['is_active'])) {
            $fill['is_active'] = true;
        }

        /** @var Model $row */
        $row = new $class;
        $row->forceFill($fill)->save();

        return $row;
    }

    /* ---------- მთავარი ფოტო ---------- */

    /**
     * ⚠️ **წყარო განსაზღვრავს, ვისია ფაილი** (`ExportDomain::PHOTOS`): `upload` —
     * ჩემი ატვირთვაა (კვოტაში), სხვა წყარო (`tmdb`, `openlibrary`…) — საერთო
     * ფაილი, კვოტის გარეშე და იგივე წყაროთი, რომ `/sync`-მა მისი განახლება შეძლოს.
     */
    private function photo(User $user, string $module, Model $model, array $record, MediaryFiles $files): void
    {
        $photo = ExportDomain::photo($module);
        $path = $photo ? ($record[$photo[0]] ?? null) : null;

        if (! $photo || ! $files->available() || ! is_string($path) || $path === '') {
            return;
        }

        [$column, $sourceColumn] = $photo;
        $folder = $this->photoFolder($module);
        $source = $sourceColumn ? ($record[$sourceColumn] ?? null) : null;

        if ($sourceColumn && is_string($source) && $source !== '' && $source !== 'upload') {
            if ($shared = $files->shared($path, $folder)) {
                $model->setAttribute($column, $shared);
                $model->setAttribute($sourceColumn, mb_substr($source, 0, 20));
            }

            return;
        }

        if ($stored = $files->store($user, $path, $folder, 'primary')) {
            $model->setAttribute($column, $stored['path']);

            if ($sourceColumn) {
                $model->setAttribute($sourceColumn, 'upload');
            }
        }
    }

    private function photoFolder(string $module): string
    {
        return match ($module) {
            'movie' => StorageFolder::MOVIE_POSTERS,
            'series' => StorageFolder::SERIES_POSTERS,
            'anime' => StorageFolder::ANIME_POSTERS,
            'video' => StorageFolder::VIDEO_THUMBNAILS,
            'song' => StorageFolder::SONG_THUMBNAILS,
            'book' => StorageFolder::BOOK_COVERS,
            'board_game' => StorageFolder::BOARD_GAME_IMAGES,
            'game' => StorageFolder::GAME_COVERS,
            'bookmark' => StorageFolder::BOOKMARK_THUMBNAILS,
            'course' => StorageFolder::COURSE_THUMBNAILS,
            'place' => StorageFolder::PLACE_PHOTOS,
            default => StorageFolder::customPhotos($module),
        };
    }

    private function text(mixed $value, ?int $length = null): ?string
    {
        if (! is_scalar($value) || is_bool($value)) {
            return null;
        }

        $value = trim((string) $value);

        if ($value === '') {
            return null;
        }

        return $length !== null ? mb_substr($value, 0, $length) : $value;
    }
}
