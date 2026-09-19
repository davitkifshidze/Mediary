<?php

namespace App\Services\Sync;

use App\Models\CastMember;
use App\Models\Genre;
use App\Models\Series;
use App\Services\Media\MediaDownloader;
use App\Services\Tmdb\TmdbClient;
use App\Support\CastSync;
use App\Support\Lang;
use App\Support\MediaDomain;
use App\Support\Redact;
use App\Support\StorageFolder;
use App\Support\Trailer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * ერთი ჩანაწერის სინქრონი TMDB-დან (Tasks J3/J4).
 *
 * განსხვავება არსებული Enricher-ებისგან: აქ **ირჩევა**, რომელი ველები განახლდეს
 * და რეჟიმი (მხოლოდ ცარიელი vs გადაწერა). Enricher „ყველაფერი, მხოლოდ ცარიელი"
 * სემანტიკით რჩება დამატებისა და ერთეულოვანი resync-ისთვის.
 */
class ItemSyncer
{
    /** არჩევადი ველები (`fields`) */
    public const FIELDS = ['title', 'description', 'year', 'rating', 'genres', 'cast', 'details', 'trailer'];

    private const CAST_LIMIT = 12;

    public function __construct(
        private TmdbClient $tmdb,
        private MediaDownloader $media,
    ) {}

    public function configured(): bool
    {
        return $this->tmdb->configured();
    }

    /**
     * @param  array{fields?:array<string>, media?:bool, overwrite?:bool, only_missing?:bool}  $opts
     * @return array{ok:bool, skipped:bool, changed:array<string>, error:?string}
     */
    public function sync(Model $item, array $opts): array
    {
        $fields = array_values(array_intersect($opts['fields'] ?? [], self::FIELDS));
        $wantMedia = (bool) ($opts['media'] ?? false);
        $overwrite = (bool) ($opts['overwrite'] ?? false);
        $onlyMissing = (bool) ($opts['only_missing'] ?? false);

        if (! $fields && ! $wantMedia) {
            return $this->result(true, true, [], null);
        }

        if (! $item->tmdb_id) {
            return $this->result(false, false, [], 'no_tmdb_id');
        }

        // „მხოლოდ დაკარგული ფაილები" — თუ ყველაფერი ადგილზეა და ტექსტი არ გვჭირდება,
        // TMDB-ს არც ვეხებით (მთელი ბიბლიოთეკა წამებში გაირბენს)
        if ($wantMedia && ! $fields && $onlyMissing && ! $this->mediaMissing($item)) {
            return $this->result(true, true, [], null);
        }

        // ⚠️ **`instanceof Series` აღარ გამოდგება** (§7.1): TMDB-ის `/tv/*`-ზე
        // ორი დომენი ზის — სერიალი და ანიმე. რუკა ერთია.
        $isSeries = MediaDomain::isTv(MediaDomain::typeOf($item));
        $changed = [];

        try {
            $d = $isSeries ? $this->tmdb->tvDetails($item->tmdb_id) : $this->tmdb->details($item->tmdb_id);

            $needsCredits = $wantMedia || in_array('cast', $fields, true);
            $credits = $needsCredits
                ? ($isSeries ? $this->tmdb->tvCredits($item->tmdb_id) : $this->tmdb->credits($item->tmdb_id))
                : [];

            // ქართული სახელი/აღწერა — TMDB-ის ლოკალიზებული პასუხიდან (Translator აქ განზრახ არ ერთვის — თარგმანი `/translations`-ის საქმეა)
            $dka = [];
            if (array_intersect(['title', 'description'], $fields)) {
                try {
                    $dka = $isSeries
                        ? $this->tmdb->tvDetails($item->tmdb_id, 'ka')
                        : $this->tmdb->details($item->tmdb_id, 'ka');
                } catch (Throwable $e) {
                    $dka = [];
                }
            }

            $changed = array_merge(
                $this->applyScalars($item, $d, $fields, $overwrite, $isSeries),
                $this->applyTranslations($item, $d, $dka, $fields, $overwrite, $isSeries),
            );

            // ტრეილერი ცალკე რექვესთია (`/videos`), ამიტომ მხოლოდ არჩევისას (Tasks 9)
            if (in_array('trailer', $fields, true) && $this->applyTrailer($item, $overwrite, $isSeries)) {
                $changed[] = 'trailer';
            }
            if (in_array('genres', $fields, true) && $this->applyGenres($item, $d, $overwrite)) {
                $changed[] = 'genres';
            }
            if (in_array('cast', $fields, true) && $this->applyCast($item, $credits, $overwrite, $wantMedia, $onlyMissing)) {
                $changed[] = 'cast';
            }

            // მედია: პოსტერი + (cast არ იყო არჩეული და მაინც გვინდა ფოტოები)
            if ($wantMedia) {
                if ($this->applyPoster($item, $d, $onlyMissing)) {
                    $changed[] = 'poster';
                }
                if (! in_array('cast', $fields, true) && $this->refreshCastPhotos($credits, $onlyMissing)) {
                    $changed[] = 'photos';
                }
            }

            $item->sync_status = 'synced';
            $item->save();
        } catch (Throwable $e) {
            return $this->result(false, false, $changed, Redact::secrets($e->getMessage()));
        }

        return $this->result(true, false, array_values(array_unique($changed)), null);
    }

    /* ---------- ველების გამოყენება ---------- */

    /** არა-translation ველები: year, rating, details (runtime/imdb/კოლექცია/სეზონები) */
    private function applyScalars(Model $item, array $d, array $fields, bool $overwrite, bool $isSeries): array
    {
        $changed = [];
        $set = function (string $attr, $value, string $label) use ($item, $overwrite, &$changed) {
            if ($value === null || $value === '') {
                return;
            }
            if (! $overwrite && filled($item->{$attr})) {
                return;
            }
            if ((string) $item->{$attr} === (string) $value) {
                return;
            }
            $item->{$attr} = $value;
            $changed[] = $label;
        };

        $dateKey = $isSeries ? 'first_air_date' : 'release_date';

        if (in_array('year', $fields, true)) {
            $set('year', ! empty($d[$dateKey]) ? (int) substr($d[$dateKey], 0, 4) : null, 'year');
        }
        if (in_array('rating', $fields, true)) {
            $set('rating', isset($d['vote_average']) ? round((float) $d['vote_average'], 1) : null, 'rating');
        }
        if (in_array('details', $fields, true)) {
            $imdb = $isSeries ? ($d['external_ids']['imdb_id'] ?? null) : ($d['imdb_id'] ?? null);
            $set('imdb_id', $imdb, 'imdb');
            if ($item->imdb_id) {
                $item->imdb_url = "https://www.imdb.com/title/{$item->imdb_id}/";
            }
            if ($isSeries) {
                $set('runtime', $d['episode_run_time'][0] ?? null, 'runtime');
                $set('seasons', $d['number_of_seasons'] ?? null, 'seasons');
                $set('episodes', $d['number_of_episodes'] ?? null, 'episodes');
                $this->applyNextAir($item, $d, $changed);
            } else {
                $set('runtime', $d['runtime'] ?? null, 'runtime');
                if (! empty($d['belongs_to_collection'])) {
                    $set('tmdb_collection_id', $d['belongs_to_collection']['id'] ?? null, 'collection');
                    $set('collection_name', $d['belongs_to_collection']['name'] ?? null, 'collection');
                }
            }
        }

        return $changed;
    }

    /**
     * „მალე" კალენდრის სამი სვეტი (FEAT-10, გასწორებულია 2026-09-19).
     *
     * ⚠️ **ეს სვეტები მხოლოდ `TvEnricher`-ს ეწერა, ე.ი. მასობრივ სინქრონს
     * კალენდარი საერთოდ არ შეუვსია.** ჩანაწერის დამატება და თითო
     * ჩანაწერის `resync` enricher-ზე გადის, `/sync`-ის რიგი კი — აქ;
     * ბიბლიოთეკის სინქრონიზაციის შემდეგ „მალე" ისევ ცარიელი რჩებოდა და
     * ეს იკითხებოდა, როგორც „ფუნქცია არ მუშაობს".
     *
     * ⚠️ **`$set()` აქ არ გამოდგება და ეს არსებითია.** ის „ცარიელს ავსებს,
     * შევსებულს არ ეხება" წესზე დგას, რაც მომხმარებლის ტექსტს იცავს —
     * აქ კი **მოძრავი ფაქტია**: შენახული ძველი თარიღი სამუდამოდ წარსულში
     * დარჩებოდა. `null`-ზე გასუფთავებაც ასევე სავალდებულოა: დასრულებულ
     * სერიალს შემდეგი ეპიზოდი აღარ აქვს.
     *
     * ⚠️ **`overwrite`-ს არ ეკითხება** — იმავე მიზეზით. ეს TMDB-ის ფაქტია
     * და არა ჩანაწერის ველი, რომელსაც ხელით წერენ.
     *
     * @param  list<string>  $changed
     */
    private function applyNextAir(Model $item, array $d, array &$changed): void
    {
        $next = $d['next_episode_to_air'] ?? null;

        $date = ($next['air_date'] ?? '') ?: null;
        $season = isset($next['season_number']) ? (int) $next['season_number'] : null;
        $episode = isset($next['episode_number']) ? (int) $next['episode_number'] : null;

        /* ⚠️ `next_air_at` `date`-ად იკასტება, ე.ი. შედარება სტრიქონთან
           პირდაპირ ცრუობდა — `Carbon` და `'2026-10-01'` არასდროს ტოლდება.
           ამიტომ ნორმალიზებული სახე ედრება ნორმალიზებულს. */
        $before = $item->next_air_at?->format('Y-m-d');

        $item->next_air_at = $date;
        $item->next_season = $season;
        $item->next_episode = $episode;

        if ($before !== $date) {
            $changed[] = 'next_air';
        }
    }

    /**
     * ოფიციალური ტრეილერი (Tasks 9) — ka→en კასკადი.
     * `overwrite=false`-ზე არსებულ ბმულს არ ეხება; ჩავარდნა ჩუმად ითმენს.
     */
    private function applyTrailer(Model $item, bool $overwrite, bool $isSeries): bool
    {
        if (! $overwrite && filled($item->trailer_url)) {
            return false;
        }

        try {
            $url = $isSeries
                ? Trailer::pick($this->tmdb->tvVideos($item->tmdb_id, 'ka'), $this->tmdb->tvVideos($item->tmdb_id))
                : Trailer::pick($this->tmdb->videos($item->tmdb_id, 'ka'), $this->tmdb->videos($item->tmdb_id));
        } catch (Throwable) {
            return false;
        }

        if (! $url || $url === $item->trailer_url) {
            return false;
        }

        $item->trailer_url = $url;

        return true;
    }

    /** სათაური/აღწერა ორ ენაზე (ka — TMDB-ის ლოკალიზებული პასუხიდან) */
    private function applyTranslations(Model $item, array $d, array $dka, array $fields, bool $overwrite, bool $isSeries): array
    {
        $wantTitle = in_array('title', $fields, true);
        $wantDesc = in_array('description', $fields, true);
        if (! $wantTitle && ! $wantDesc) {
            return [];
        }

        $titleKey = $isSeries ? 'name' : 'title';
        $changed = [];

        $enTitle = $d[$titleKey] ?? null;
        $enDesc = $d['overview'] ?? null;
        $kaTitle = Lang::georgian($dka[$titleKey] ?? null);
        $kaDesc = Lang::georgian($dka['overview'] ?? null);

        $en = [];
        $ka = [];
        if ($wantTitle) {
            if ($enTitle && ($overwrite || ! $item->title_en)) {
                $en['title'] = $enTitle;
                $changed[] = 'title_en';
            }
            if ($kaTitle && ($overwrite || ! $item->title_ka)) {
                $ka['title'] = $kaTitle;
                $changed[] = 'title_ka';
            }
        }
        if ($wantDesc) {
            if ($enDesc && ($overwrite || ! $item->description_en)) {
                $en['description'] = $enDesc;
                $en['source'] = 'tmdb';
                $changed[] = 'description_en';
            }
            if ($kaDesc && ($overwrite || ! $item->description_ka)) {
                $ka['description'] = $kaDesc;
                $ka['source'] = 'tmdb';
                $changed[] = 'description_ka';
            }
        }

        if ($en) {
            $item->setTranslation('en', $en);
        }
        if ($ka) {
            $item->setTranslation('ka', $ka);
        }

        return $changed;
    }

    /** ჟანრები — slug-ით ვამთხვევთ (იხ. CLAUDE.md gotcha) */
    private function applyGenres(Model $item, array $d, bool $overwrite): bool
    {
        if (! $overwrite && $item->genres()->exists()) {
            return false;
        }

        $ids = [];
        foreach ($d['genres'] ?? [] as $g) {
            $slug = Str::slug($g['name']) ?: 'g-'.$g['id'];
            $genre = Genre::firstOrCreate(['slug' => $slug], ['tmdb_id' => $g['id']]);
            if ($genre->wasRecentlyCreated) {
                $genre->setTranslation('en', $g['name']);
                // ⚠️ `ka` განზრახ არ იწერება — იხ. `MovieEnricher` (BUG-23)
            } elseif (! $genre->tmdb_id) {
                $genre->tmdb_id = $g['id'];
                $genre->save();
            }
            $ids[] = $genre->id;
        }

        if (! $ids) {
            return false;
        }
        $item->genres()->sync($ids);

        return true;
    }

    /** მსახიობები (+ ფოტოები, თუ მედიაც გვინდა) */
    private function applyCast(Model $item, array $credits, bool $overwrite, bool $withPhotos, bool $onlyMissing): bool
    {
        if (! $overwrite && $item->cast()->exists()) {
            // ბმულებს არ ვცვლით, ფოტოები მაინც შეიძლება დასჭირდეს
            if ($withPhotos) {
                $this->refreshCastPhotos($credits, $onlyMissing);
            }

            return false;
        }

        $sync = [];
        foreach (array_slice($credits['cast'] ?? [], 0, self::CAST_LIMIT) as $i => $c) {
            $member = CastMember::firstOrNew(['tmdb_person_id' => $c['id']]);
            $member->name = $c['name'];
            // Tasks 10 — სქესი გალერეის „ქალი/კაცი მსახიობები" ფილტრს სჭირდება
            if (isset($c['gender'])) {
                $member->gender = (int) $c['gender'];
            }
            if ($withPhotos && ! empty($c['profile_path']) && $this->needsPhoto($member, $onlyMissing)) {
                if ($photo = $this->media->profile($c['profile_path'], $c['id'])) {
                    $member->photo_path = $photo;
                }
            }
            $member->save();
            $sync[$member->id] = ['character' => $c['character'] ?? '', 'billing_order' => $i];
        }

        if (! $sync) {
            return false;
        }
        // ⚠️ ხელით დამატებული მსახიობი `sync()`-ს ჩუმად წაეშლებოდა — იხ. `CastSync`
        CastSync::fromSource($item, $sync);

        return true;
    }

    /** მხოლოდ ფოტოების განახლება — cast-ის ბმულებს არ ეხება */
    private function refreshCastPhotos(array $credits, bool $onlyMissing): bool
    {
        $any = false;
        foreach (array_slice($credits['cast'] ?? [], 0, self::CAST_LIMIT) as $c) {
            if (empty($c['profile_path'])) {
                continue;
            }
            $member = CastMember::where('tmdb_person_id', $c['id'])->first();
            if (! $member || ! $this->needsPhoto($member, $onlyMissing)) {
                continue;
            }
            if ($photo = $this->media->profile($c['profile_path'], $c['id'])) {
                $member->photo_path = $photo;
                $member->save();
                $any = true;
            }
        }

        return $any;
    }

    private function applyPoster(Model $item, array $d, bool $onlyMissing): bool
    {
        if (empty($d['poster_path'])) {
            return false;
        }
        if ($onlyMissing && $item->poster_path && Storage::disk(StorageFolder::diskFor((string) $item->poster_path))->exists($item->poster_path)) {
            return false;
        }
        // ხელით ატვირთულ პოსტერს არ ვაფუჭებთ
        if ($item->poster_source === 'upload' && $onlyMissing) {
            return false;
        }

        $path = $this->media->poster($d['poster_path'], $item->slugForFile(), $item->getMorphClass());
        if (! $path) {
            return false;
        }
        $item->poster_path = $path;
        $item->poster_source = 'tmdb';

        return true;
    }

    /* ---------- დაკარგული ფაილების შემოწმება ---------- */

    private function needsPhoto(CastMember $member, bool $onlyMissing): bool
    {
        if (! $onlyMissing) {
            return true;
        }

        return ! $member->photo_path || ! Storage::disk(StorageFolder::diskFor((string) $member->photo_path))->exists($member->photo_path);
    }

    /** ჩანაწერს აკლია პოსტერი ან რომელიმე მსახიობის ფოტო? */
    public function mediaMissing(Model $item): bool
    {
        if ($this->fileMissing($item->poster_path)) {
            return true;
        }

        foreach ($item->cast as $member) {
            if ($this->fileMissing($member->photo_path)) {
                return true;
            }
        }

        return false;
    }

    /**
     * ⚠️ **დისკი თითო გზაზე ცალკე იკითხება** (აუდიტი 2026-09-14): პროექტის
     * წესი ის არის, რომ დისკს **მხოლოდ** `StorageFolder::diskFor()` წყვეტს
     * (§17.5), ე.ი. ერთი გაზიარებული `'public'` ობიექტი ამ წესს არღვევდა
     * და მომავალ პრივატულ საქაღალდეს არასწორ დისკზე მოძებნიდა.
     */
    private function fileMissing(?string $path): bool
    {
        return ! $path || ! Storage::disk(StorageFolder::diskFor($path))->exists($path);
    }

    private function result(bool $ok, bool $skipped, array $changed, ?string $error): array
    {
        return ['ok' => $ok, 'skipped' => $skipped, 'changed' => $changed, 'error' => $error];
    }
}
