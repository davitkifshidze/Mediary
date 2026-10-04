<?php

namespace App\Services\Cast;

use App\Models\CastMember;
use App\Models\CastMemberTag;
use App\Models\GalleryImage;
use App\Support\GalleryParent;
use App\Support\Like;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * **`/actors` — ყველა „ჩემი" მსახიობი ერთ სიაში (Tasks §35.2).**
 *
 * ⚠️ **„ჩემი" სამი წყაროდან იკრიბება** (Q9): ვინც ჩემს ჩანაწერზეა (ფილმი,
 * სერიალი, ანიმე), ვისაც ჩემი ფოტო აქვს გალერეაში და (§35.3) ვინც მე შევქმენი.
 * `cast_members` გლობალური ლექსიკონია — უფილტრო სია სხვის მსახიობებსაც
 * აჩვენებდა.
 *
 * ⚠️ **ერთი SQL და არა PHP-ში აწყობილი სია**: ავზი ათასობითაა (ცოცხალ ბაზაში
 * ოთხი ათასი), დახარისხება კი „ჩანაწერების რიცხვით" გვერდებამდე უნდა მოხდეს —
 * ამიტომ თითო მსახიობის რიცხვები ქვე-query-ებია (`r` — ჩანაწერები დომენებით,
 * `p` — ფოტოები), რომლებიც `cast_members`-ს `left join`-ით ებმის.
 *
 * ⚠️ **ჩანაწერების ქვე-query მედია-მოდელის query-ა** (`MediaDomain::query()`),
 * ე.ი. მისი global scope-ები თავისით მოქმედებს: `owner` (ჩემი), `trash`
 * (ურნაში მყოფის მსახიობი არ ითვლება) და მომავალი ლოკი. `castables`-ის
 * საფლავის ქვა (`is_removed`) ცხადადაა — ჩანაწერიდან წაშლილი იქ აღარ არის.
 *
 * ⚠️ **ტეგი PHP-შია და არა `LIKE`-ით**: `cast_member_tags.tags` JSON-ია და
 * ქართული მასში `ი…`-ად წერია (CLAUDE.md), ე.ი. `like '%ტეგი%'` ვერაფერს
 * იპოვიდა. ჩემი ტეგების რიგები ცოტაა — ისინი ერთხელ იკითხება და id-ებად იქცევა.
 */
final class ActorIndex
{
    public const SORTS = ['name', 'records', 'popularity', 'recent'];

    public const DEFAULT_PER_PAGE = 40;

    public const MAX_PER_PAGE = 120;

    /** „რამდენ ჩანაწერზეა" — ფილტრის ზღვრები */
    public const RECORD_STEPS = [1, 2, 5, 10];

    /** @var array<int, list<string>>|null ჩემი ტეგები მსახიობებზე — `cast_member_id => tags` */
    private ?array $tags = null;

    /**
     * @param  list<string>  $types  დომენები, რომლის ჩანაწერებიც ითვლება (ჩართული + `view`)
     */
    public function __construct(private readonly array $types, private readonly int $userId) {}

    /**
     * მსახიობები ფილტრებით — დახარისხებამდე.
     *
     * @param  array<string, mixed>  $filters
     * @return Builder<CastMember>
     */
    public function query(array $filters = [], bool $withGender = true): Builder
    {
        $records = $this->recordCounts();

        $query = CastMember::query()
            ->leftJoinSub($this->photoCounts(), 'p', 'p.cast_member_id', '=', 'cast_members.id')
            ->select('cast_members.*')
            ->selectRaw('coalesce(p.photos, 0) as photos_count');

        if ($records) {
            $query->leftJoinSub($records, 'r', 'r.cast_member_id', '=', 'cast_members.id')
                ->selectRaw('coalesce(r.records, 0) as records_count')
                ->selectRaw('coalesce(r.movie_count, 0) as movie_count')
                ->selectRaw('coalesce(r.series_count, 0) as series_count')
                ->selectRaw('coalesce(r.anime_count, 0) as anime_count');
        } else {
            $query->selectRaw('0 as records_count, 0 as movie_count, 0 as series_count, 0 as anime_count');
        }

        // ⚠️ ავზი: ჩემს ჩანაწერზეა, ჩემი ფოტო აქვს ან მე შევქმენი (§35.3) — `left join`-ები აქ იჭრება
        $query->where(function (Builder $w) use ($records) {
            $w->whereNotNull('p.cast_member_id')
                ->orWhere('cast_members.created_by', $this->userId);

            if ($records) {
                $w->orWhereNotNull('r.cast_member_id');
            }
        });

        $this->applyFilters($query, $filters, $withGender, (bool) $records);

        return $query;
    }

    /**
     * დახარისხება. ⚠️ ქართულ ინტერფეისზე სახელი ქართულით ლაგდება (`cast_member_translations`),
     * თორემ ბარათებზე დაწერილი სახელები ლათინური ანბანით არეული ჩანდა.
     *
     * @param  Builder<CastMember>  $query
     */
    public function sort(Builder $query, string $sort, string $locale): void
    {
        match ($sort) {
            'records' => $query->orderByDesc('records_count'),
            // ⚠️ პოპულარობის გარეშე (ხელით შექმნილი) ბოლოშია — ორივე ბაზაზე NULL DESC-ში ბოლოა
            'popularity' => $query->orderByDesc('cast_members.popularity'),
            'recent' => $query->orderByDesc('cast_members.id'),
            default => null,
        };

        if ($locale === 'ka') {
            $query->leftJoin('cast_member_translations as tka', function ($join) {
                $join->on('tka.cast_member_id', '=', 'cast_members.id')->where('tka.locale', 'ka');
            })->orderByRaw('coalesce(tka.name, cast_members.name)');
        } else {
            $query->orderBy('cast_members.name');
        }

        $query->orderBy('cast_members.id');
    }

    /**
     * „ყველა / ქალები / კაცები" — ⚠️ ჭრილი საკუთარ თავს არ ითვლის (გალერეის
     * `actorGroups()`-ის წესი): სქესის ფილტრი მთვლელში არ შედის, თორემ
     * „ქალების" არჩევისას „კაცები" ნულზე ჩამოვიდოდა.
     *
     * @param  array<string, mixed>  $filters
     * @return array{all: int, female: int, male: int}
     */
    public function genderFacets(array $filters): array
    {
        $rows = $this->query($filters, withGender: false)
            ->reorder()
            ->toBase()
            ->select('cast_members.gender')
            ->selectRaw('count(*) as n')
            ->groupBy('cast_members.gender')
            ->pluck('n', 'gender');

        return [
            'all' => (int) $rows->sum(),
            'female' => (int) ($rows[CastMember::GENDER_FEMALE] ?? 0),
            'male' => (int) ($rows[CastMember::GENDER_MALE] ?? 0),
        ];
    }

    /**
     * ფილტრის არჩევანი — „ცნობილია" (TMDB-ის `known_for_department`) ავზში
     * არსებული მნიშვნელობებით და ჩემი ტეგები.
     *
     * @return array{known_for: list<string>, tags: list<string>}
     */
    public function options(): array
    {
        $knownFor = $this->query()
            ->reorder()
            ->toBase()
            ->select('cast_members.known_for')
            ->whereNotNull('cast_members.known_for')
            ->distinct()
            ->pluck('known_for')
            ->map(fn ($value) => (string) $value)
            ->sort()
            ->values()
            ->all();

        $tags = collect($this->tags())->flatten()->unique(fn ($tag) => mb_strtolower($tag))->sort()->values()->all();

        return ['known_for' => $knownFor, 'tags' => $tags];
    }

    /** @return list<string> */
    public function tagsOf(int $castMemberId): array
    {
        return $this->tags()[$castMemberId] ?? [];
    }

    /* ---------- შიგნით ---------- */

    /**
     * @param  Builder<CastMember>  $query
     * @param  array<string, mixed>  $filters
     */
    private function applyFilters(Builder $query, array $filters, bool $withGender, bool $hasRecords): void
    {
        if (($q = trim((string) ($filters['q'] ?? ''))) !== '') {
            // ⚠️ `name_ka` სვეტი არ არის (accessor-ია) — ქართული სახელი `cast_member_translations`-შია
            $query->where(function (Builder $w) use ($q) {
                $w->where('cast_members.name', 'like', Like::contains($q))
                    ->orWhereHas('translations', fn ($t) => $t->where('name', 'like', Like::contains($q)));
            });
        }

        if ($withGender && ($gender = $filters['gender'] ?? null)) {
            $query->where('cast_members.gender', $gender === 'female' ? CastMember::GENDER_FEMALE : CastMember::GENDER_MALE);
        }

        if (($knownFor = $filters['known_for'] ?? null) !== null && $knownFor !== '') {
            $query->where('cast_members.known_for', $knownFor);
        }

        if (($tag = trim((string) ($filters['tag'] ?? ''))) !== '') {
            $needle = mb_strtolower($tag);
            $ids = array_keys(array_filter(
                $this->tags(),
                fn (array $tags) => in_array($needle, array_map('mb_strtolower', $tags), true),
            ));
            $query->whereIn('cast_members.id', $ids ?: [0]);
        }

        match ($filters['photos'] ?? null) {
            'with' => $query->whereNotNull('p.cast_member_id'),
            'without' => $query->whereNull('p.cast_member_id'),
            default => null,
        };

        if (($min = (int) ($filters['records_min'] ?? 0)) > 0) {
            $hasRecords
                ? $query->whereRaw('coalesce(r.records, 0) >= ?', [$min])
                : $query->whereRaw('1 = 0');
        }

        match ($filters['synced'] ?? null) {
            'yes' => $query->whereNotNull('cast_members.details_synced_at'),
            'no' => $query->whereNull('cast_members.details_synced_at'),
            default => null,
        };

        /* Tasks §35.5 — „ჩაკეტილები": ჩემი ჩაკეტილი მსახიობები, დამალულიც (ბოქლომიანი
           ბარათით). ⚠️ დანარჩენ სიაში დამალული საერთოდ არ არის (`record_lock` scope). */
        if (! empty($filters['locked'])) {
            $query->onlyLocked();
        }
    }

    /**
     * თითო მსახიობზე ჩემი ჩანაწერები დომენებით — `cast_member_id, records, movie_count, …`.
     *
     * ⚠️ `union all` სამი მედია-query-დან (თითოს თავისი global scope-ებით) —
     * `castables`-ზე პირდაპირი `join` `owner`-ს და `trash`-ს ვერ დაინახავდა.
     */
    private function recordCounts(): ?QueryBuilder
    {
        $parts = [];

        foreach ($this->types as $type) {
            $query = MediaDomain::query($type);
            $model = $query->getModel();

            $parts[] = $query
                ->join('castables', function ($join) use ($model) {
                    $join->on('castables.castable_id', '=', $model->qualifyColumn($model->getKeyName()))
                        ->where('castables.castable_type', $model->getMorphClass());
                })
                ->where('castables.is_removed', false)
                ->toBase()
                ->select('castables.cast_member_id', 'castables.castable_type as domain');
        }

        if ($parts === []) {
            return null;
        }

        $union = array_shift($parts);
        foreach ($parts as $part) {
            $union->unionAll($part);
        }

        return DB::query()
            ->fromSub($union, 'links')
            ->select('links.cast_member_id')
            ->selectRaw('count(*) as records')
            ->selectRaw("sum(case when links.domain = 'movie' then 1 else 0 end) as movie_count")
            ->selectRaw("sum(case when links.domain = 'series' then 1 else 0 end) as series_count")
            ->selectRaw("sum(case when links.domain = 'anime' then 1 else 0 end) as anime_count")
            ->groupBy('links.cast_member_id');
    }

    /**
     * ჩემი ფოტოები თითო მსახიობზე. ⚠️ `GalleryImage`-ის scope-ები მოქმედებს —
     * `owner` (ჩემი), `trash` და `album_lock` (ჩაკეტილი ალბომის ფოტო არ ითვლება:
     * დამალული ყველგან დამალულია, Q9).
     */
    private function photoCounts(): QueryBuilder
    {
        return GalleryImage::query()
            ->where('imageable_type', GalleryParent::ACTOR)
            ->toBase()
            ->select('imageable_id as cast_member_id')
            ->selectRaw('count(*) as photos')
            ->groupBy('imageable_id');
    }

    /** @return array<int, list<string>> */
    private function tags(): array
    {
        return $this->tags ??= CastMemberTag::withoutGlobalScope('owner')
            ->where('user_id', $this->userId)
            ->get(['cast_member_id', 'tags'])
            ->mapWithKeys(fn (CastMemberTag $row) => [(int) $row->cast_member_id => array_values((array) $row->tags)])
            ->all();
    }
}
