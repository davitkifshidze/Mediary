<?php

namespace App\Services\Export;

use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\User;
use App\Services\Modules\CustomFieldService;
use App\Support\AppTime;
use App\Support\ExportDomain;
use App\Support\StorageFolder;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphOneOrMany;
use Illuminate\Support\Facades\DB;

/**
 * **ჩანაწერის „დამატებები" ექსპორტში.**
 *
 * ექსპორტში აქამდე მხოლოდ ჩანაწერის სვეტები გადიოდა — დამატებითი ველები,
 * მიმაგრებული ფაილები, ჩანიშვნები, გალერეა, მსახიობები და მარშრუტები კი
 * **არა**, ე.ი. ფაილი უკან ვეღარ შემოვიდოდა ისე, რომ ჩანაწერი იგივე
 * ყოფილიყო. აქ თითო „დამატება" სიად იკრიბება (`ExportDomain::EXTRAS`),
 * `MediaryImporter` კი მას იმავე ფორმით კითხულობს.
 *
 * ⚠️ **შიდა რიცხვები არ გადის** (`INTERNAL` + მშობლის გასაღები): `id`,
 * `user_id`, `video_id`… ამ ბაზის გარეთ არაფერს ნიშნავს და იმპორტში სხვისი
 * ანგარიშის id-ის „გაჟონვის" ერთადერთი გზა იქნებოდა.
 *
 * ⚠️ **ფაილი გზით გადის** (`path`) — „ჩემი სრული ექსპორტის" ZIP-ში ის
 * `files/<გზა>`-ზე დევს (`LibraryArchive`); ცალკე JSON/CSV-ში გზა მხოლოდ
 * მინიშნებაა და იმპორტი მას ფაილის გარეშე არ იყენებს.
 *
 * ⚠️ **ჩაკეტილი არაფერი გადის**: ჩაკეტილი ფოტო პრივატულ
 * `gallery/locked`-შია და გამოიტოვება, ჩაკეტილი მსახიობი — `withoutLocked()`.
 *
 * ⚠️ **ბევრი ჩანაწერის მნიშვნელობა პორციით იკითხება** (`preload()`):
 * დამატებითი ველები და ეპიზოდები რელაცია არ არის, ე.ი. ჩანაწერზე ერთი
 * query 5000 სიმღერაზე 5000 query იქნებოდა.
 */
class RecordExtras
{
    /** სვეტები, რომლებიც ამ ბაზის გარეთ არაფერს ნიშნავს */
    public const INTERNAL = ['id', 'user_id', 'module', 'trashed_at', 'trash_meta', 'updated_at'];

    /** @var array<int, array<string, mixed>> ჩანაწერის id → დამატებითი ველები (მიმდინარე პორცია) */
    private array $custom = [];

    /** @var array<int, list<array<string, mixed>>> TMDB-ის id → ნანახი ეპიზოდები (მიმდინარე პორცია) */
    private array $episodes = [];

    public function __construct(private readonly CustomFieldService $fields) {}

    /**
     * პორციის წინასწარ წაკითხვა — ის, რაც რელაციით ვერ ჩაიტვირთება.
     *
     * ⚠️ **ყოველ პორციაზე თავიდან** — კლასი კონტროლერთან ერთად რჩება
     * (Laravel კონტროლერს მარშრუტზე ინახავს), ე.ი. წინა მოთხოვნის პორცია
     * ახალზე არასდროს უნდა გამოჩნდეს.
     */
    public function preload(User $user, string $module, Collection $records): void
    {
        $extras = ExportDomain::extras($module);

        $this->custom = in_array('custom_fields', $extras, true)
            ? $this->fields->exportValues($user, $module, $records->modelKeys())
            : [];

        $this->episodes = in_array('episode_watches', $extras, true)
            ? $this->episodeWatches($user, $records->pluck('tmdb_id')->filter()->map(fn ($id) => (int) $id)->all())
            : [];
    }

    /** ერთი „დამატების" მნიშვნელობა */
    public function value(Model $record, string $field): mixed
    {
        return match ($field) {
            'custom_fields' => $this->custom[$record->getKey()] ?? [],
            'files' => $record->files->map(fn (Model $file) => [
                'kind' => $file->kind,
                'name' => $file->original_name,
                'path' => $file->path,
                'mime' => $file->mime,
                'size' => (int) $file->size,
            ])->values()->all(),
            'notes', 'routes', 'videos', 'watches' => $this->rows($record, $field),
            'gallery' => [...$this->images($record), ...$this->galleryVideos($record)],
            'cast' => $this->cast($record),
            'episode_watches' => $this->episodes[(int) $record->getAttribute('tmdb_id')] ?? [],
            default => null,
        };
    }

    /**
     * შვილი რიგები (ჩანიშვნა, მარშრუტი, თამაშის ვიდეო, ნახვა) — სვეტები, შიდა
     * რიცხვებისა და მშობლის გასაღების გარეშე.
     *
     * @return list<array<string, mixed>>
     */
    private function rows(Model $record, string $relation): array
    {
        return $record->{$relation}
            ->map(fn (Model $row) => $this->plain($row, $this->parentKeys($record, $relation)))
            ->values()
            ->all();
    }

    /** @return list<string> მშობლის გასაღები (+ პოლიმორფული ტიპი) */
    private function parentKeys(Model $record, string $relation): array
    {
        $rel = $record->{$relation}();
        $keys = [$rel->getForeignKeyName()];

        if ($rel instanceof MorphOneOrMany) {
            $keys[] = $rel->getMorphType();
        }

        return $keys;
    }

    /** @param  list<string>  $skip */
    private function plain(Model $row, array $skip): array
    {
        $out = [];

        foreach (array_keys($row->getAttributes()) as $key) {
            if (in_array($key, self::INTERNAL, true) || in_array($key, $skip, true)) {
                continue;
            }

            $value = $row->getAttribute($key);
            $out[$key] = $value instanceof DateTimeInterface ? AppTime::at($value)?->format('Y-m-d H:i:s') : $value;
        }

        return $out;
    }

    /** @return list<array<string, mixed>> */
    private function images(Model $record): array
    {
        return $record->galleryImages
            // ⚠️ ჩაკეტილი ფოტო (`gallery/locked`) ექსპორტში არ გადის
            ->reject(fn (GalleryImage $image) => StorageFolder::isPrivate((string) $image->path))
            ->map(fn (GalleryImage $image) => [
                'type' => 'image',
                'path' => $image->path,
                'source' => $image->source,
                'category' => $image->category,
                'name' => $image->original_name,
                'mime' => $image->mime,
                'size' => (int) $image->size,
                'width' => $image->width,
                'height' => $image->height,
                'is_thumbnail' => (bool) $image->is_thumbnail,
                'source_url' => $image->source_url,
                'remote_path' => $image->remote_path,
                'created_at' => AppTime::at($image->created_at)?->format('Y-m-d H:i:s'),
            ])
            ->values()
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function galleryVideos(Model $record): array
    {
        $skip = $this->parentKeys($record, 'galleryVideos');

        return $record->galleryVideos
            ->map(fn (Model $video) => ['type' => 'video', ...$this->plain($video, $skip)])
            ->values()
            ->all();
    }

    /**
     * მსახიობები — სახელით და TMDB-ის id-ით (`cast_members` საერთო ცხრილია,
     * ე.ი. id აქ არაფერს ნიშნავს); წაშლილი (`is_removed`) არ გადის.
     *
     * @return list<array<string, mixed>>
     */
    private function cast(Model $record): array
    {
        return $record->castLinks
            ->reject(fn (CastMember $member) => (bool) $member->pivot->is_removed)
            ->map(fn (CastMember $member) => [
                'name' => $member->name,
                'name_ka' => $member->translations->firstWhere('locale', 'ka')?->name,
                'name_en' => $member->translations->firstWhere('locale', 'en')?->name,
                'tmdb_person_id' => $member->tmdb_person_id,
                'imdb_id' => $member->imdb_id,
                'photo_path' => $member->photo_path,
                'character' => $member->pivot->character,
                'billing_order' => (int) $member->pivot->billing_order,
                'is_manual' => (bool) $member->pivot->is_manual,
                'is_hidden' => (bool) $member->pivot->is_hidden,
            ])
            ->values()
            ->all();
    }

    /**
     * ნანახი ეპიზოდები — სეზონით და ნომრით (`tv_episodes` საერთო ცხრილია).
     *
     * @param  list<int>  $tmdbIds
     * @return array<int, list<array<string, mixed>>>
     */
    private function episodeWatches(User $user, array $tmdbIds): array
    {
        if ($tmdbIds === []) {
            return [];
        }

        $rows = DB::table('episode_watches as w')
            ->join('tv_episodes as e', 'e.id', '=', 'w.tv_episode_id')
            ->where('w.user_id', $user->getKey())
            ->whereIn('e.tmdb_series_id', array_values(array_unique($tmdbIds)))
            ->orderBy('e.season_number')
            ->orderBy('e.episode_number')
            ->get(['e.tmdb_series_id', 'e.season_number', 'e.episode_number', 'e.name', 'e.air_date', 'e.runtime', 'w.watched_at']);

        $out = [];

        foreach ($rows as $row) {
            $out[(int) $row->tmdb_series_id][] = [
                'season' => (int) $row->season_number,
                'episode' => (int) $row->episode_number,
                'name' => $row->name,
                'air_date' => $row->air_date !== null ? substr((string) $row->air_date, 0, 10) : null,
                'runtime' => $row->runtime !== null ? (int) $row->runtime : null,
                'watched_at' => $row->watched_at,
            ];
        }

        return $out;
    }
}
