<?php

namespace App\Services\Share;

use App\Exceptions\RecordInTrashException;
use App\Models\ApprovalRequest;
use App\Models\Module;
use App\Models\ShareLink;
use App\Models\Status;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Storage\StorageMeter;
use App\Support\AppTime;
use App\Support\MediaDomain;
use App\Support\MediaDuplicate;
use App\Support\NotificationType;
use App\Support\ShareDomain;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * **ბმულიდან საკუთარ ბიბლიოთეკაში დამატება (Tasks §40.8).**
 *
 * ⚠️ **მხოლოდ „რა ფილმია" გადმოდის (Q49 — „ა").** TMDB-იანი ჩანაწერი მიმღებთან
 * TMDB-დან თავიდან ივსება (პოსტერი, აღწერა, ჟანრები, მსახიობები) — მიმღების
 * **საკუთარი** გასაღებით; გამზიარებლის პირადი ნაწილი (რჩეული, ჩანიშვნები,
 * საკუთარი ველები, გალერეა, მსახიობების შენეული რიგი) არ გადმოდის. ხელით
 * შეყვანილი (TMDB-ის გარეშე) კი სხვაგვარად ვერ შეივსება, ამიტომ მისი სათაური,
 * წელი, აღწერა, ჟანრები და ატვირთული პოსტერი კოპირდება — პოსტერი **მიმღების**
 * კვოტით; ადგილი თუ არ ეყო, ჩანაწერი პოსტერის გარეშე ემატება და მიზეზი ბრუნდება.
 *
 * ⚠️ **სტატუსს მიმღები ირჩევს (Q48 — „ა")**: `default` — მისი ნაგულისხმევი
 * (`HasStatus`-ის `creating` ჰუკი), `owner` — „როგორც გამზიარებელს აქვს",
 * **როლით** და არასდროს სახელით ან გასაღებით (§6.4: ჩემი „ნანახი" და შენი
 * „ვნახე" მხოლოდ როლის დონეზეა ერთი). დასრულებულს გამზიარებლის ნახვის
 * თარიღიც მოჰყვება — თორემ 300 „ნანახი" ერთ დღეს ჩაიწერებოდა სტატისტიკასა და
 * ყურების ჟურნალში.
 *
 * ⚠️ **გამდიდრება სურვილისამებრია და არა პირობა** (ჩატის წესი): გასაღები
 * შეიძლება არ იყოს ან წყარო არ პასუხობდეს — ჩანაწერი მაინც იქმნება (სათაურით
 * და ჟანრებით), `partial: true`-ით, და ჩვეულებრივი სინქრონიზაცია მერე შეავსებს.
 */
final class ShareImporter
{
    public function __construct(
        private readonly StorageMeter $meter,
        private readonly Notifier $notifier,
    ) {}

    /**
     * რომელ სექციაში შეუძლია მნახველს დამატება — მიმღების გვერდისა და გეგმისთვის.
     *
     * ⚠️ `requested` — მოდულის მოთხოვნა უკვე გაგზავნილია: ღილაკი მაშინ
     * „მოთხოვნა გაგზავნილია"-ს ამბობს და არა „მოითხოვე" (მეორე მოთხოვნა
     * backend-ზე ისედაც არსებულს აბრუნებს, მაგრამ ეკრანი ტყუილს არ უნდა ამბობდეს).
     *
     * @param  list<string>  $domains
     * @return array<string, array{enabled: bool, can_create: bool, requested: bool}>
     */
    public static function abilities(User $viewer, array $domains): array
    {
        $pendingIds = ApprovalRequest::where('user_id', $viewer->id)
            ->where('type', ApprovalRequest::TYPE_MODULE)
            ->pending()
            ->pluck('module_id')
            ->filter()
            ->all();

        $pendingKeys = $pendingIds === []
            ? []
            : Module::base()->whereIn('id', $pendingIds)->pluck('key')->all();

        $out = [];

        foreach ($domains as $domain) {
            $module = ShareDomain::module($domain);
            $enabled = $viewer->hasModule($module);

            $out[$domain] = [
                'enabled' => $enabled,
                'can_create' => $enabled && $viewer->hasPermission($module, 'create'),
                'requested' => ! $enabled && in_array($module, $pendingKeys, true),
            ];
        }

        return $out;
    }

    /**
     * ერთი ჩანაწერის დამატება.
     *
     * @return array{result: 'added'|'have', id: int, partial: bool, poster_skipped: ?string}
     *
     * @throws RecordInTrashException იგივე ჩანაწერი მიმღების ურნაშია (409)
     */
    public function add(ShareLink $link, User $owner, User $viewer, string $domain, Model $record, string $statusMode): array
    {
        $model = ShareDomain::model($domain);

        // ⚠️ იგივე წესი, რასაც გვერდის „უკვე გაქვს ✓" კითხულობს
        $match = ShareMatcher::matches($viewer, $domain, new Collection([$record]))[(int) $record->getKey()] ?? null;

        if ($match) {
            if ($match['trashed']) {
                throw new RecordInTrashException($domain, $model::withoutGlobalScopes()->findOrFail($match['id']));
            }

            return ['result' => 'have', 'id' => $match['id'], 'partial' => false, 'poster_skipped' => null];
        }

        $copy = new $model;
        $copy->user_id = $viewer->id;

        $partial = false;
        $posterSkipped = null;
        $tmdbId = $record->getAttribute('tmdb_id');

        if ($tmdbId) {
            $copy->tmdb_id = $tmdbId;
            $copy->save();

            try {
                MediaDomain::enrich($domain, $copy);
            } catch (UniqueConstraintViolationException $e) {
                // გამდიდრებამ `imdb_id` მიაწერა, რომელიც მიმღებს სხვა რიგზე უკვე აქვს
                $existing = MediaDuplicate::resolveClash($domain, $copy, $e);

                return ['result' => 'have', 'id' => (int) $existing->getKey(), 'partial' => false, 'poster_skipped' => null];
            } catch (Throwable) {
                $partial = true;
                $copy->forceFill(['sync_status' => 'partial'])->save();
            }

            $copy->refresh();

            /* ⚠️ გამდიდრება ჩავარდა (გასაღები არ აქვს, წყარო არ პასუხობს) —
               ჩანაწერი სათაურისა და ჟანრების გარეშე რომ არ დარჩეს */
            if (! $copy->title_en && ! $copy->title_ka) {
                $this->copyText($record, $copy, false);
            }

            if ($copy->genres()->count() === 0) {
                $copy->genres()->sync($record->genres()->pluck('genres.id')->all());
            }
        } else {
            // ხელით შეყვანილი — სხვაგვარად ვერაფრით შეივსება
            $copy->year = $record->getAttribute('year');
            $copy->save();

            $this->copyText($record, $copy, true);
            $copy->genres()->sync($record->genres()->pluck('genres.id')->all());
            $posterSkipped = $this->copyPoster($record, $copy, $viewer, $domain);
        }

        if ($statusMode === 'owner') {
            $this->applyOwnerStatus($record, $copy, $viewer, $domain);
        }

        $this->countImport($link, $owner, $viewer);

        return ['result' => 'added', 'id' => (int) $copy->getKey(), 'partial' => $partial, 'poster_skipped' => $posterSkipped];
    }

    /**
     * სათაური (და ხელით შეყვანილზე — აღწერაც) ორივე ენაზე.
     *
     * ⚠️ **მედიის ტექსტი თარგმანების ცხრილშია** და არა სვეტში
     * (`SharedRecord::fillTitle()`-ის გაკვეთილი). წყარო (`source`) თან მიჰყვება:
     * TMDB-ის ტექსტი TMDB-ისად რჩება, ხელით დაწერილი — ხელით დაწერილად.
     */
    private function copyText(Model $record, Model $copy, bool $withDescription): void
    {
        foreach ($record->translations as $tr) {
            $title = (string) ($tr->title ?? '');
            $description = $withDescription ? $tr->description : null;

            if ($title === '' && ($description === null || $description === '')) {
                continue;
            }

            $copy->translations()->updateOrCreate(
                ['locale' => $tr->locale],
                array_filter([
                    'title' => $title !== '' ? $title : null,
                    'description' => $description,
                    'source' => $withDescription ? $tr->source : null,
                ], fn ($v) => $v !== null),
            );
        }

        $copy->load('translations');
    }

    /**
     * ხელით შეყვანილის პოსტერი — **მიმღების კვოტით** (`StorageMeter`-ის ერთადერთი გზა).
     *
     * ⚠️ ფაილი **კოპირდება** და არა იზიარებს გზას: გამზიარებლის ფაილი მისი
     * ჩანაწერის წაშლასთან ერთად იშლება, და მიმღების პოსტერი მაშინ გატყდებოდა.
     * ⚠️ კვოტა არ ეყო → ჩანაწერი **მაინც** ემატება, პოსტერის გარეშე, და მიზეზი
     * ბრუნდება (`storage_quota_exceeded` / `module_quota_exceeded`) — ერთი სურათის
     * გამო ფილმის დაკარგვა უარესი შედეგია.
     */
    private function copyPoster(Model $record, Model $copy, User $viewer, string $domain): ?string
    {
        $path = (string) $record->getAttribute('poster_path');

        if ($path === '' || preg_match('#^https?://#', $path)) {
            return null;
        }

        $disk = Storage::disk(StorageFolder::diskFor($path));

        if (! $disk->exists($path)) {
            return null;
        }

        try {
            $stored = $this->meter->storeContents(
                $viewer,
                (string) $disk->get($path),
                StorageFolder::posters($domain),
                pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg',
            );
        } catch (HttpResponseException $e) {
            return (string) ($e->getResponse()->getData(true)['message'] ?? 'storage_quota_exceeded');
        }

        $copy->forceFill(['poster_path' => $stored, 'poster_source' => 'upload'])->save();

        return null;
    }

    /**
     * „როგორც გამზიარებელს აქვს" — **როლით** (Q48).
     *
     * ⚠️ `applyStatus()` ერთადერთი ჩამწერია `watched_at`-ისა (BUG-05); მას
     * მხოლოდ მაშინ ვაწვდით გამზიარებლის თარიღს, როცა როლი `done`-ია — ის
     * არსებულ მნიშვნელობას ინარჩუნებს, ე.ი. „ახლა" აღარ ჩაიწერება.
     * მიმღებს ასეთი როლის სტატუსი თუ არ აქვს (წაშალა) — მისი ნაგულისხმევი რჩება.
     */
    private function applyOwnerStatus(Model $record, Model $copy, User $viewer, string $domain): void
    {
        $role = $record->status?->role;

        if (! $role) {
            return;
        }

        Status::ensureDefaults((int) $viewer->id, $domain);

        $status = Status::withoutGlobalScope('owner')
            ->where('user_id', $viewer->id)
            ->where('module', $domain)
            ->where('role', $role)
            ->ordered()
            ->first();

        if (! $status) {
            return;
        }

        if ($role === 'done' && $record->getAttribute('watched_at')) {
            $copy->watched_at = $record->getAttribute('watched_at');
        }

        $copy->applyStatus($status);
        $copy->save();
    }

    /**
     * ბმულის მრიცხველი, „ვინ დაიმატა" და მფლობელის შეტყობინება.
     *
     * ⚠️ **query builder-ით** — მოდელის `increment()` `updated`-ს ისვრის და ყოველი
     * დამატება ბმულის „განახლდა"-დ ჩაიწერებოდა ჟურნალში.
     * ⚠️ **შეტყობინება ერთი მიმღებზე დღეში** (FEAT-19): რიგი ჩანაწერს სათითაოდ
     * ამატებს, ე.ი. ყოველ ჩანაწერზე შეტყობინება ასს დაწერდა.
     */
    private function countImport(ShareLink $link, User $owner, User $viewer): void
    {
        DB::table('share_links')->where('id', $link->id)->increment('imports');

        $now = AppTime::now();
        $row = DB::table('share_link_imports')
            ->where('share_link_id', $link->id)
            ->where('user_id', $viewer->id)
            ->first();

        if ($row) {
            DB::table('share_link_imports')->where('id', $row->id)->update([
                'added' => DB::raw('added + 1'),
                'last_added_at' => $now,
                'updated_at' => $now,
            ]);
        } else {
            DB::table('share_link_imports')->insert([
                'share_link_id' => $link->id,
                'user_id' => $viewer->id,
                'added' => 1,
                'last_added_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // ⚠️ ბაზის სტრიქონი აპის ზონაშია (`APP_TIMEZONE`), ე.ი. `parse()` სწორ მომენტს იძლევა
        $notified = $row?->notified_at ? Carbon::parse((string) $row->notified_at) : null;

        if ($notified === null || ! $notified->isSameDay($now)) {
            $this->notifier->send($owner, NotificationType::SHARE_IMPORTED, [
                'username' => $viewer->username,
                'display_name' => $viewer->displayName(),
                'link_id' => $link->id,
                'link_name' => $link->name,
            ]);

            DB::table('share_link_imports')
                ->where('share_link_id', $link->id)
                ->where('user_id', $viewer->id)
                ->update(['notified_at' => $now]);
        }
    }
}
