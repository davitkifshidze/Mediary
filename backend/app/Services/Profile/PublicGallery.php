<?php

namespace App\Services\Profile;

use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\User;
use App\Support\AlbumLock;
use App\Support\GalleryParent;
use App\Support\MediaDomain;
use App\Support\PublicDomain;
use Illuminate\Database\Eloquent\Builder;

/**
 * **საჯარო გალერეა (Tasks §7.4) — გამოთვლადი და არა ცალკე ჩაწერილი.**
 *
 * შენი სიტყვები: „გალერეის გასაჯაროება შეგიძლია გააკეთო ფილმების/მსახიობების
 * გასაჯაროებით, როგორც ლოგიკურია".
 *
 * ⚠️ **ფოტოს საკუთარი `visibility` სვეტი არ აქვს და არც დაემატება** — ის
 * მშობლის ხილვადობას იმემკვიდრებს (§10-ის წესი). ე.ი. აქ არაფერი ინახება:
 * კითხვა ყოველ ჯერზე იმავე სამფენიანი query-დან გამოითვლება, რასაც
 * `PublicProfileService::query()` იყენებს. ორი წყარო ერთ ფაქტზე ზუსტად ის
 * ხაფანგია, რომელსაც პროექტი თავს არიდებს.
 *
 * **ფოტო საჯაროდ ჩანს სამი გზით:**
 *  1. მისი **ჩანაწერი** საჯაროა (ფილმი · სერიალი · ანიმე · სიმღერა · წიგნი · თამაში);
 *  2. ის **მსახიობისაა**, რომელიც ჩემს საჯარო მედია-ჩანაწერში თამაშობს;
 *  3. ის **საჯარო ალბომშია** — ერთადერთი გზა უმშობლო ფოტოსთვის (§7.5).
 *
 * ⚠️ **მსახიობის წესი მეორედ არ იწერება**: „რომელი დომენიდან მოვიდა"
 * `GalleryController::sourceQuery()`-ში უკვე მისი ფილმებით გამოითვლება —
 * აქ იგივე `whereHas`-ია, ოღონდ მხოლოდ **საჯარო** ჩანაწერებზე.
 *
 * ⚠️ **ჩაკეტილი ალბომის ფოტო სიიდან არ ქრება — ის შიშვლდება** (§7.11):
 * რიგი ჩანს, მაგრამ მხოლოდ `id`-ითა და ზომებით. `path`/`remote_path`/
 * `source_url` არასდროს გამოდის, ე.ი. ინსპექტორს საპოვნელი არაფერი აქვს.
 *
 * ⚠️ **`album_lock` global scope აქ ცხადად იხსნება და ეს აუცილებელია.** ის
 * `Auth::id()`-ს კითხულობს, ე.ი. უცხო მნახველზე ან ცარიელია (ლოკი არ
 * იმუშავებდა), ან **მისივე** ჩაკეტილ ალბომებს დაითვლიდა — სულ სხვა კაცის
 * სიას. ამიტომ დამალვას აქ `AlbumLock::hiddenIdsFor($owner->id)` წყვეტს.
 */
class PublicGallery
{
    public function __construct(private PublicProfileService $profiles) {}

    /**
     * ამ პროფილზე ხილვადი ფოტოების query.
     *
     * ⚠️ `withoutGlobalScope('owner')` + ცხადი `user_id` — იგივე ორმხრივი
     * მიზეზი, რაც `PublicProfileService`-ის docblock-შია.
     */
    public function query(User $user): Builder
    {
        $domains = $this->profiles->domains($user);

        $q = GalleryImage::query()
            ->withoutGlobalScope('owner')
            ->withoutGlobalScope('album_lock')
            ->where('gallery_images.user_id', $user->id);

        $recordDomains = array_values(array_intersect(GalleryParent::recordKeys(), $domains));
        $mediaDomains = array_values(array_intersect(MediaDomain::TYPES, $domains));
        $albums = in_array('gallery_album', $domains, true) ? $this->publicAlbumIds($user) : [];

        /* ⚠️ **არცერთი წყარო არ არის ღია → ცარიელი პასუხი და არა „ყველაფერი".**
           ცარიელი `orWhere`-ების ჯგუფი SQL-ში ჭეშმარიტია, ე.ი. პირობის
           გარეშე ეს query მთელ გალერეას დააბრუნებდა. */
        if (! $recordDomains && ! $mediaDomains && ! $albums) {
            return $q->whereRaw('1 = 0');
        }

        $q->where(function (Builder $w) use ($user, $recordDomains, $mediaDomains, $albums) {
            foreach ($recordDomains as $domain) {
                $w->orWhere(fn (Builder $x) => $x
                    ->where('gallery_images.imageable_type', $domain)
                    ->whereIn('gallery_images.imageable_id', $this->publicIds($user, $domain)));
            }

            if ($mediaDomains) {
                $w->orWhere(fn (Builder $x) => $x
                    ->where('gallery_images.imageable_type', GalleryParent::ACTOR)
                    ->whereIn('gallery_images.imageable_id', $this->publicCastIds($user, $mediaDomains)));
            }

            if ($albums) {
                $w->orWhereIn('gallery_images.album_id', $albums);
            }
        });

        return $q->orderByDesc('gallery_images.id');
    }

    /**
     * ერთი გვერდი, ჩაკეტილი ალბომების გაშიშვლებით.
     *
     * @return array{data: list<array<string, mixed>>, meta: array<string, int>}
     */
    public function page(User $user, int $perPage, int $page): array
    {
        $paginator = $this->query($user)->paginate($perPage, ['*'], 'page', $page);
        $hidden = AlbumLock::hiddenIdsFor((int) $user->id);

        return [
            'data' => collect($paginator->items())
                ->map(fn (GalleryImage $image) => $this->row($image, $hidden))
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /** რამდენი ფოტო ჩანს — პროფილის ტაბის რიცხვი */
    public function count(User $user): int
    {
        return $this->query($user)->count();
    }

    /**
     * **ერთი ფოტოს ვიწრო ფორმა.**
     *
     * ⚠️ `PublicDomain::card()`-ის იგივე წესი: ველი მხოლოდ მაშინ ჩნდება,
     * თუ ცხადად ჩაიწერა. ჩაკეტილზე კი **მხოლოდ სამი ფაქტი** — რომ რიგი
     * არსებობს, რა პროპორციისაა და რომ ჩაკეტილია.
     *
     * @param  list<int>  $hidden
     * @return array<string, mixed>
     */
    private function row(GalleryImage $image, array $hidden): array
    {
        $locked = $image->album_id !== null && in_array((int) $image->album_id, $hidden, true);

        $base = [
            'id' => $image->id,
            'width' => $image->width,
            'height' => $image->height,
            'album_id' => $image->album_id,
            'locked' => $locked,
        ];

        return $locked ? $base : $base + [
            'path' => $image->path,
            'category' => $image->category,
        ];
    }

    /** ამ დომენის საჯარო ჩანაწერების id-ები */
    private function publicIds(User $user, string $domain): array
    {
        return $this->profiles->query($user, $domain)
            ->reorder()
            ->pluck(PublicDomain::model($domain)::query()->getModel()->getTable().'.id')
            ->all();
    }

    /**
     * მსახიობები, რომლებიც ჩემს **საჯარო** მედია-ჩანაწერებში თამაშობენ.
     *
     * ⚠️ `cast_members` გლობალური ლექსიკონია, ე.ი. „ჩემი მსახიობი" მხოლოდ
     * ჩემი ჩანაწერებით განისაზღვრება — ზუსტად ის წესი, რასაც `GlobalSearch`
     * და `sourceQuery()` უკვე იყენებს.
     *
     * @param  list<string>  $domains
     */
    private function publicCastIds(User $user, array $domains): array
    {
        $ids = [];

        foreach ($domains as $domain) {
            $records = $this->profiles->query($user, $domain)->reorder()->get(['id']);

            foreach ($records as $record) {
                foreach ($record->cast()->pluck('cast_members.id') as $castId) {
                    $ids[(int) $castId] = true;
                }
            }
        }

        return array_keys($ids);
    }

    /** @return list<int> */
    private function publicAlbumIds(User $user): array
    {
        return GalleryAlbum::query()
            ->withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->where('visibility', 'public')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
