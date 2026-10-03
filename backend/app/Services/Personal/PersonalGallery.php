<?php

namespace App\Services\Personal;

use App\Models\Person;
use App\Models\PersonalAlbum;
use App\Models\PersonalMedia;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;

/**
 * **პირადი გალერეის საერთო წესები (Tasks §33)** — ყდები, მთვლელები და
 * გადატანის ინვარიანტი, რომ სამმა კონტროლერმა ერთნაირად დაითვალოს.
 *
 * ⚠️ **ინვარიანტი: ადამიანის ალბომის ფოტო ყოველთვის იმავე ადამიანისაა.**
 * „ადამიანის ფოტოები" ამიტომ ერთი `where person_id`-ია და ალბომის გავლით
 * არ ითვლება; „გარე" ალბომში კი სხვადასხვა ადამიანის ფოტო ერთად დევს.
 * ყველა ცვლილება (`move()`, ალბომის გადატანა სხვა ადამიანზე) ამას იცავს.
 */
class PersonalGallery
{
    /** ადამიანების/ალბომების სიის მთვლელები — ფოტო · ვიდეო (· ალბომი) */
    public function withCounts(Builder $query, bool $albums = false): Builder
    {
        $counts = [
            'media as photos_count' => fn ($q) => $q->where('kind', 'photo'),
            'media as videos_count' => fn ($q) => $q->where('kind', 'video'),
        ];

        if ($albums) {
            $counts[] = 'albums';
        }

        return $query->withCount($counts);
    }

    /**
     * **ყდა თითოეულს — ერთი მოთხოვნით.** ცხადად არჩეული ფოტო, ან თუ ის
     * აღარ ჩანს (ურნაშია, სხვა ადამიანზე გადავიდა) — უახლესი ესკიზიანი ფოტო.
     *
     * ⚠️ ესკიზის გზა იწერება (`resolved_cover`) და არა ფაილისა: ბადე და დასტა
     * პატარა ასლს ხატავს, 15-მეგაბაიტიანი ორიგინალი კი ბარათზე ზედმეტია.
     *
     * @param  EloquentCollection<int, Person|PersonalAlbum>  $rows
     */
    public function covers(EloquentCollection $rows, string $foreignKey): void
    {
        if ($rows->isEmpty()) {
            return;
        }

        $chosen = PersonalMedia::query()
            ->whereIn('id', $rows->pluck('cover_media_id')->filter()->all())
            ->whereNotNull('thumb_path')
            ->get()
            ->keyBy('id');

        $fallback = PersonalMedia::query()
            ->whereIn($foreignKey, $rows->modelKeys())
            ->whereNotNull('thumb_path')
            ->orderByDesc('taken_at')
            ->orderByDesc('id')
            ->get(['id', $foreignKey, 'thumb_path', 'user_id'])
            ->unique($foreignKey)
            ->keyBy($foreignKey);

        foreach ($rows as $row) {
            $media = $chosen->get($row->cover_media_id) ?? $fallback->get($row->getKey());
            $row->setAttribute('resolved_cover', $media?->thumbUrl());
        }
    }

    /**
     * ფოტოების ესკიზები დასტისთვის — თითო ჯგუფზე `$limit` (უახლესები).
     *
     * @param  list<int|null>  $keys
     * @return array<string, list<string>> გასაღები → ესკიზის გზები
     */
    public function previews(Builder $query, string $column, array $keys, int $limit = 4): array
    {
        $out = [];

        foreach ($keys as $key) {
            $out[(string) $key] = (clone $query)
                ->when($key === null, fn ($q) => $q->whereNull($column), fn ($q) => $q->where($column, $key))
                ->whereNotNull('thumb_path')
                ->orderByDesc('taken_at')
                ->orderByDesc('id')
                ->limit($limit)
                ->get()
                ->map(fn (PersonalMedia $m) => $m->thumbUrl())
                ->filter()
                ->values()
                ->all();
        }

        return $out;
    }

    /**
     * **გადატანა — ადამიანი და/ან ალბომი** (Tasks §33.6, მრავალმონიშვნა).
     *
     * `$changes`-ში მხოლოდ ის გასაღებია, რაც იცვლება (`person_id` · `album_id`,
     * მნიშვნელობა `null` = „მოხსნა").
     *
     * ⚠️ **ალბომი იმარჯვებს**: ადამიანის ალბომში გადატანილი ფოტო მისი ადამიანის
     * ხდება (ინვარიანტი). ⚠️ სხვა ადამიანზე გადატანისას ალბომი, რომელიც
     * წინა ადამიანისაა, ეხსნება — თორემ ფოტო ორ სხვადასხვა ადამიანს ეკუთვნოდა.
     *
     * @param  Collection<int, PersonalMedia>  $media
     * @param  array{person_id?: int|null, album_id?: int|null}  $changes
     * @return int რამდენი შეიცვალა
     */
    public function move(Collection $media, array $changes): int
    {
        $album = array_key_exists('album_id', $changes) && $changes['album_id'] !== null
            ? PersonalAlbum::query()->findOrFail($changes['album_id'])
            : null;

        $albumPersons = PersonalAlbum::query()
            ->whereIn('id', $media->pluck('album_id')->filter()->unique()->all())
            ->pluck('person_id', 'id');

        $moved = 0;

        foreach ($media as $item) {
            $person = array_key_exists('person_id', $changes) ? $changes['person_id'] : $item->person_id;
            $albumId = array_key_exists('album_id', $changes) ? $changes['album_id'] : $item->album_id;

            if ($album) {
                $person = $album->person_id ?? $person;
            } elseif ($albumId !== null) {
                $owner = $albumPersons->get($albumId);

                // წინა ადამიანის ალბომი ახალ ადამიანს არ გაჰყვება
                if ($owner !== null && (int) $owner !== (int) $person) {
                    $albumId = null;
                }
            }

            $person = $person === null ? null : (int) $person;
            $albumId = $albumId === null ? null : (int) $albumId;

            if ($item->person_id === $person && $item->album_id === $albumId) {
                continue;
            }

            $item->forceFill(['person_id' => $person, 'album_id' => $albumId])->save();
            $moved++;
        }

        return $moved;
    }

    /**
     * ალბომი სხვა ადამიანზე (ან „გარეთ") — **ფოტოები ალბომს მიჰყვება**.
     *
     * ⚠️ „გარეთ" გატანისას ფოტოებს ადამიანი რჩებათ: „გარე" ალბომი
     * ნებისმიერი ადამიანის ფოტოს იტევს, ე.ი. ინვარიანტი არ ირღვევა.
     */
    public function followAlbum(PersonalAlbum $album): void
    {
        if ($album->person_id === null) {
            return;
        }

        PersonalMedia::withoutGlobalScopes()
            ->where('user_id', $album->user_id)
            ->where('album_id', $album->id)
            ->update(['person_id' => $album->person_id]);
    }
}
