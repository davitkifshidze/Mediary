<?php

namespace App\Services\Import;

use App\Models\CastMember;
use App\Models\EpisodeWatch;
use App\Models\TvEpisode;
use App\Models\User;
use App\Services\Export\RecordExtras;
use App\Services\Modules\CustomFieldService;
use App\Support\CustomFields;
use App\Support\CustomModules;
use App\Support\ExportDomain;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOneOrMany;
use Illuminate\Database\Eloquent\Relations\MorphOneOrMany;

/**
 * **Tasks §59.6 — ჩანაწერის „დამატებები" უკან** (`RecordExtras`-ის შებრუნება):
 * დამატებითი ველები, მიმაგრებული ფაილები, ჩანიშვნები, გალერეა, მსახიობები,
 * მარშრუტები, თამაშის ვიდეოები, ნახვები, ეპიზოდები.
 *
 * ⚠️ **შვილი რიგი მხოლოდ თავისი ცხრილის სვეტებით იწერება** (`MediarySchema`):
 * მშობლის გასაღებს რელაცია სვამს, `user_id`-ს — იმპორტი; ფაილში ჩაწერილი
 * `video_id`/`user_id` არასდროს ჯდება.
 *
 * ⚠️ **ფაილი მხოლოდ ZIP-იდან** (`MediaryFiles`) — ცალკე JSON/CSV-ის იმპორტზე
 * ფაილიანი „დამატება" (მიმაგრებული ფაილი, გალერეის ფოტო, `file` ველი)
 * გამოიტოვება, ტექსტიანი კი (ჩანიშვნა, მარშრუტი, ველები) — შემოდის.
 */
class MediaryExtras
{
    public function __construct(private readonly CustomFieldService $fields) {}

    /**
     * @param  array<string, mixed>  $record
     * @param  array<string, mixed>  $envelope
     */
    public function write(User $user, string $module, Model $model, array $record, array $envelope, MediaryFiles $files): void
    {
        foreach (ExportDomain::extras($module) as $extra) {
            $value = $record[$extra] ?? null;

            if (is_string($value)) {
                $value = json_decode($value, true);
            }

            match ($extra) {
                'custom_fields' => $this->customFields($user, $module, $model, is_array($value) ? $value : [], $envelope, $files),
                'files' => $this->files($user, $module, $model, $this->list($value), $files),
                'notes', 'routes', 'videos' => $this->children($user, $module, $model->{$extra}(), $this->list($value)),
                'watches' => $this->watches($user, $model, $this->list($value)),
                'gallery' => $this->gallery($user, $module, $model, $this->list($value), $files),
                'cast' => $this->cast($user, $model, $this->list($value), $files),
                'episode_watches' => $this->episodes($user, $model, $this->list($value)),
                default => null,
            };
        }
    }

    /**
     * დამატებითი ველები: ჯერ განსაზღვრებები (ჩემს არსებულ ველს არ ეხება),
     * მერე მნიშვნელობები; `file` ველი — ZIP-იდან.
     */
    private function customFields(User $user, string $module, Model $model, array $values, array $envelope, MediaryFiles $files): void
    {
        $this->fields->mergeDefinitions($user, $module, array_values(array_filter((array) ($envelope['custom_field_definitions'] ?? []), 'is_array')));

        if ($values === []) {
            return;
        }

        $types = array_column($this->fields->definitions($user, $module), 'type', 'key');
        $plain = [];

        foreach ($values as $key => $value) {
            $type = is_string($key) ? ($types[$key] ?? null) : null;

            if ($type === null) {
                continue;
            }

            if ($type !== 'file') {
                $plain[$key] = $value;

                continue;
            }

            foreach (array_slice($this->list($value), 0, CustomFields::FILE_MAX_COUNT) as $file) {
                $stored = $files->store($user, $file['path'] ?? null, StorageFolder::customFields($module), 'field');

                if ($stored) {
                    $name = is_string($file['name'] ?? null) && $file['name'] !== '' ? $file['name'] : $stored['name'];
                    $this->fields->attachStoredFile($user, $module, (int) $model->getKey(), $key, $stored['path'], $name, $stored['mime'], $stored['size']);
                }
            }
        }

        if ($plain !== []) {
            $this->fields->setValues($user, $module, (int) $model->getKey(), $plain);
        }
    }

    /** მიმაგრებული ფაილები — თავისი სახეობის საქაღალდეში და ფორმატის სიით */
    private function files(User $user, string $module, Model $model, array $items, MediaryFiles $files): void
    {
        if (! $files->available() || $items === []) {
            return;
        }

        $relation = $model->files();
        $columns = MediarySchema::columns($relation->getRelated()->getTable());

        foreach (array_values($items) as $i => $item) {
            // ⚠️ სახეობა `enum`-ია (წიგნის ფაილი — `book`, სამაგიდოს წესები — `rules`): უცნობი — `doc`
            $kind = in_array($item['kind'] ?? null, ['image', 'doc', 'book', 'rules', 'video'], true) ? $item['kind'] : 'doc';
            $stored = $files->store($user, $item['path'] ?? null, $this->filesFolder($module, $kind), $this->uploadKind($kind));

            if (! $stored) {
                continue;
            }

            $attrs = [
                'user_id' => $user->getKey(),
                'kind' => $kind,
                'path' => $stored['path'],
                'original_name' => mb_substr(is_string($item['name'] ?? null) && $item['name'] !== '' ? $item['name'] : $stored['name'], 0, 255),
                'mime' => $stored['mime'],
                'size' => $stored['size'],
            ];

            if (isset($columns['sort_order'])) {
                $attrs['sort_order'] = $i;
            }
            if (isset($columns['module'])) {
                $attrs['module'] = $module;
            }

            $relation->make()->forceFill($attrs)->save();
        }
    }

    /**
     * შვილი რიგები (ჩანიშვნა, მარშრუტი, თამაშის ვიდეო) — ძველიდან ახლისკენ,
     * რომ ახალმა id-ებმა ფაილის რიგი გაიმეორონ (ჩანიშვნები id-ით ლაგდება).
     *
     * @param  HasOneOrMany<Model>  $relation
     */
    private function children(User $user, string $module, HasOneOrMany $relation, array $items): void
    {
        $related = $relation->getRelated();
        $columns = MediarySchema::columns($related->getTable());
        $skip = [...RecordExtras::INTERNAL, $relation->getForeignKeyName()];

        if ($relation instanceof MorphOneOrMany) {
            $skip[] = $relation->getMorphType();
        }

        usort($items, fn (array $a, array $b) => strcmp((string) ($a['created_at'] ?? ''), (string) ($b['created_at'] ?? '')));

        foreach ($items as $item) {
            $attrs = $this->attributes($related, $columns, $item, $skip);

            if ($attrs === null) {
                continue;
            }

            $attrs['user_id'] = $user->getKey();
            if (isset($columns['module'])) {
                $attrs['module'] = $module;
            }

            $relation->make()->forceFill($attrs)->save();
        }
    }

    /** ხელახალი ნახვების ჟურნალი (FEAT-14) — `watched_at`-ის ჩაწერამ პირველი უკვე შექმნა */
    private function watches(User $user, Model $model, array $items): void
    {
        foreach ($items as $item) {
            $at = MediarySchema::moment($item['watched_at'] ?? null);

            if ($at === null) {
                continue;
            }

            $model->watches()->firstOrCreate(
                ['user_id' => $user->getKey(), 'watched_at' => $at],
                ['note' => is_string($item['note'] ?? null) ? mb_substr($item['note'], 0, 255) : null],
            );
        }
    }

    /** გალერეა: ფოტო — ZIP-იდან (კვოტაში), ვიდეო — ბმულია და ფაილი არ სჭირდება */
    private function gallery(User $user, string $module, Model $model, array $items, MediaryFiles $files): void
    {
        $videos = array_values(array_filter($items, fn (array $item) => ($item['type'] ?? 'image') === 'video'));
        $this->children($user, $module, $model->galleryVideos(), $videos);

        if (! $files->available()) {
            return;
        }

        $images = array_values(array_filter($items, fn (array $item) => ($item['type'] ?? 'image') !== 'video'));

        foreach ($images as $i => $item) {
            $stored = $files->store($user, $item['path'] ?? null, StorageFolder::GALLERY_IMAGES, 'image');

            if (! $stored) {
                continue;
            }

            $model->galleryImages()->make()->forceFill([
                'user_id' => $user->getKey(),
                'source' => is_string($item['source'] ?? null) && $item['source'] !== '' ? mb_substr($item['source'], 0, 20) : 'upload',
                'category' => is_string($item['category'] ?? null) ? mb_substr($item['category'], 0, 40) : null,
                'path' => $stored['path'],
                'remote_path' => is_string($item['remote_path'] ?? null) ? mb_substr($item['remote_path'], 0, 255) : null,
                'original_name' => mb_substr(is_string($item['name'] ?? null) && $item['name'] !== '' ? $item['name'] : $stored['name'], 0, 255),
                'mime' => $stored['mime'],
                'size' => $stored['size'],
                'width' => is_numeric($item['width'] ?? null) ? (int) $item['width'] : null,
                'height' => is_numeric($item['height'] ?? null) ? (int) $item['height'] : null,
                'sort_order' => $i,
                'source_url' => is_string($item['source_url'] ?? null) ? mb_substr($item['source_url'], 0, 255) : null,
                'is_thumbnail' => (bool) ($item['is_thumbnail'] ?? false),
                ...(($created = MediarySchema::moment($item['created_at'] ?? null)) ? ['created_at' => $created] : []),
            ])->save();
        }
    }

    /**
     * მსახიობები — `cast_members` საერთო ცხრილია: TMDB-ის მსახიობი TMDB-ის id-ით
     * იძებნება (და ახალი, თუ ჯერ არ არის, იმავე id-ით იქმნება — `/sync` შეავსებს),
     * ხელით შექმნილი კი — ჩემს ხელით შექმნილებში სახელით (Tasks §35.3: ის მხოლოდ
     * შემქმნელს ეკუთვნის).
     */
    private function cast(User $user, Model $model, array $items, MediaryFiles $files): void
    {
        $attach = [];

        foreach ($items as $i => $item) {
            $name = is_string($item['name'] ?? null) ? mb_substr(trim($item['name']), 0, 255) : '';
            if ($name === '') {
                continue;
            }

            $tmdb = is_numeric($item['tmdb_person_id'] ?? null) ? (int) $item['tmdb_person_id'] : null;
            $member = $tmdb
                ? CastMember::withoutGlobalScopes()->where('tmdb_person_id', $tmdb)->first()
                : CastMember::withoutGlobalScopes()->whereNull('tmdb_person_id')->where('created_by', $user->getKey())->where('name', $name)->first();

            if (! $member) {
                $member = $this->newMember($user, $item, $name, $tmdb, $files);
            }

            $attach[$member->getKey()] = [
                'character' => is_string($item['character'] ?? null) ? mb_substr($item['character'], 0, 255) : null,
                'billing_order' => is_numeric($item['billing_order'] ?? null) ? (int) $item['billing_order'] : $i,
                'is_manual' => (bool) ($item['is_manual'] ?? false),
                'is_hidden' => (bool) ($item['is_hidden'] ?? false),
                'is_removed' => false,
                'is_edited' => false,
            ];
        }

        if ($attach !== []) {
            $model->castLinks()->syncWithoutDetaching($attach);
        }
    }

    private function newMember(User $user, array $item, string $name, ?int $tmdb, MediaryFiles $files): CastMember
    {
        $photo = $item['photo_path'] ?? null;
        $path = null;

        if ($files->available() && is_string($photo)) {
            // TMDB-ის პორტრეტი საერთოა (`cast/photos`); ატვირთული — მხოლოდ ჩემი ხელით შექმნილისთვის (კვოტაში)
            $path = str_starts_with($photo, StorageFolder::CAST_PHOTOS.'/')
                ? $files->shared($photo, StorageFolder::CAST_PHOTOS)
                : ($tmdb === null ? ($files->store($user, $photo, StorageFolder::CAST_UPLOADS, 'primary')['path'] ?? null) : null);
        }

        $member = new CastMember;
        $member->forceFill([
            'tmdb_person_id' => $tmdb,
            'name' => $name,
            'imdb_id' => is_string($item['imdb_id'] ?? null) ? mb_substr($item['imdb_id'], 0, 20) : null,
            'photo_path' => $path,
            // §35.3 — ხელით შექმნილი მხოლოდ შემქმნელისაა; TMDB-ის მსახიობი — საერთო
            'created_by' => $tmdb === null ? $user->getKey() : null,
        ])->save();

        foreach (['ka', 'en'] as $locale) {
            if (is_string($item["name_{$locale}"] ?? null) && trim($item["name_{$locale}"]) !== '') {
                $member->setTranslation($locale, mb_substr(trim($item["name_{$locale}"]), 0, 255));
            }
        }

        return $member;
    }

    /** ნანახი ეპიზოდები — `tv_episodes` საერთოა: სეზონით და ნომრით, საჭიროებისას იქმნება */
    private function episodes(User $user, Model $model, array $items): void
    {
        $tmdb = (int) $model->getAttribute('tmdb_id');

        if ($tmdb <= 0) {
            return;
        }

        foreach ($items as $item) {
            if (! is_numeric($item['season'] ?? null) || ! is_numeric($item['episode'] ?? null)) {
                continue;
            }

            $episode = TvEpisode::firstOrCreate(
                ['tmdb_series_id' => $tmdb, 'season_number' => (int) $item['season'], 'episode_number' => (int) $item['episode']],
                [
                    'name' => is_string($item['name'] ?? null) ? mb_substr($item['name'], 0, 255) : null,
                    'air_date' => MediarySchema::moment($item['air_date'] ?? null, 'Y-m-d'),
                    'runtime' => is_numeric($item['runtime'] ?? null) ? (int) $item['runtime'] : null,
                ],
            );

            EpisodeWatch::withoutGlobalScopes()->firstOrCreate(
                ['user_id' => $user->getKey(), 'tv_episode_id' => $episode->getKey()],
                ['watched_at' => MediarySchema::moment($item['watched_at'] ?? null)],
            );
        }
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * შვილი რიგის სვეტები — მხოლოდ ცხრილის სვეტები, ტიპზე გადაყვანილი;
     * `null` — სავალდებულო სვეტი აკლია (რიგი გამოიტოვება და ჩანაწერს არ აგდებს).
     *
     * @param  array<string, array{type: string, nullable: bool, length: int|null}>  $columns
     * @param  list<string>  $skip
     * @return array<string, mixed>|null
     */
    private function attributes(Model $related, array $columns, array $item, array $skip): ?array
    {
        $attrs = [];

        foreach ($item as $key => $value) {
            if (! is_string($key) || in_array($key, $skip, true) || ! isset($columns[$key])) {
                continue;
            }

            $value = MediarySchema::coerce($related, $key, $columns[$key], $value);

            if ($value === null && ! $columns[$key]['nullable']) {
                continue;
            }

            $attrs[$key] = $value;
        }

        // სავალდებულო ტექსტი (ჩანიშვნის `body`, ვიდეოს `url`) — მის გარეშე რიგი არაფერია
        foreach (['body', 'url', 'geometry'] as $required) {
            if (isset($columns[$required]) && ! $columns[$required]['nullable'] && ! isset($attrs[$required])) {
                return null;
            }
        }

        return $attrs === [] ? null : $attrs;
    }

    /** @return list<array<string, mixed>> */
    private function list(mixed $value): array
    {
        return is_array($value) ? array_values(array_filter($value, 'is_array')) : [];
    }

    private function filesFolder(string $module, string $kind): string
    {
        return match ($module) {
            'video' => StorageFolder::videoFiles($kind),
            'book' => StorageFolder::bookFiles($kind),
            'board_game' => StorageFolder::boardGameFiles($kind),
            'game' => StorageFolder::gameFiles($kind),
            'note' => StorageFolder::noteFiles($kind),
            'bookmark' => StorageFolder::BOOKMARK_IMAGES,
            'course' => StorageFolder::courseFiles($kind),
            'place' => StorageFolder::placeFiles($kind),
            default => CustomModules::isKey($module) ? StorageFolder::customFiles($module, $kind) : StorageFolder::customFields($module),
        };
    }

    /** ფაილის სახეობა → `UploadLimits`-ის სახეობა (ფორმატების სია) */
    private function uploadKind(string $kind): string
    {
        return match ($kind) {
            'image' => 'image',
            'book' => 'book',
            'rules' => 'rules',
            'video' => 'video',
            default => 'doc',
        };
    }
}
