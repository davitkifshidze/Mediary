<?php

namespace App\Services\Chat;

use App\Models\Message;
use App\Models\User;
use App\Services\Profile\PublicProfileService;
use App\Support\MediaDomain;
use App\Support\PublicDomain;
use Illuminate\Database\Eloquent\Model;

/**
 * **ჩანაწერის გაზიარება ჩატში (FEAT-13).**
 *
 * „ეს ნახე" დღემდე URL-ის ჩასმა იყო — პოსტერის, სათაურის, სტატუსისა და
 * „დაამატე ჩემთანაც" ღილაკის გარეშე. მატჩინგი (§16.2) უკვე ითვლიდა
 * „ორივეს გვაქვს"-ს, რეკომენდაციის გზა კი არ არსებობდა.
 *
 * ⚠️ **გაზიარებადი დომენები `PublicDomain::MATCH`-ია და არა ახალი სია.**
 * ზუსტად იმ ცხრა დომენს აქვს **გლობალური იდენტობა** (`tmdb_id`,
 * `rawg_id`, `openlibrary_id`, `bgg_id`, `platform`+`external_id`, `url`),
 * რომლის გარეშეც „დაამატე ჩემთანაც" ვერაფერს გააკეთებდა — ე.ი. სიაც
 * იგივეა და მეორე რუკა დღესვე დაშორდებოდა.
 *
 * ⚠️ **`note` შიგნით არ არის და ეს გამორჩენა არ არის** (§16.5): ის პირად
 * დოკუმენტებს ინახავს და `PublicDomain::MATCH`-ში არასდროს ყოფილა.
 *
 * ⚠️ **ბარათი ყოველ წაკითხვაზე იგება.** გაყინული ასლი იმას ნიშნავდა,
 * რომ დღეს დაპრივატებული ჩანაწერი გუშინდელ წერილში სამუდამოდ ღია
 * დარჩებოდა — ხილვადობის სამივე ფენა (§16.1) ისტორიულ წერილზეც უნდა
 * მოქმედებდეს.
 */
class SharedRecord
{
    public function __construct(private readonly PublicProfileService $public) {}

    /** გაზიარებადი დომენები — გლობალური იდენტობის მქონენი */
    public static function domains(): array
    {
        return array_keys(PublicDomain::MATCH);
    }

    public static function shareable(string $domain): bool
    {
        return isset(PublicDomain::MATCH[$domain]);
    }

    /**
     * გასაგზავნი ჩანაწერის JSON.
     *
     * ⚠️ **იდენტობა აქვე იყინება და არა მხოლოდ `id`.** `id` **ჩემი**
     * ბიბლიოთეკის ნომერია და მიმღებისთვის არაფერს ნიშნავს; სწორედ
     * `tmdb_id`/`url`/`platform`+`external_id` არის ის, რითიც მას
     * თავისთან იგივე ჩანაწერი შეუძლია დაამატოს.
     */
    public function describe(string $domain, Model $record): array
    {
        $identity = [];

        foreach (PublicDomain::MATCH[$domain]['columns'] as $column) {
            $identity[$column] = $record->getAttribute($column);
        }

        return [
            'domain' => $domain,
            'id' => $record->getKey(),
            'identity' => $identity,
            // ⚠️ ჩანაწერი შეიძლება წაიშალოს — მაშინ ეს ერთადერთი, რაც რჩება
            'title' => $this->title($record),
        ];
    }

    /**
     * რას ხედავს მკითხველი.
     *
     * ⚠️ **საჯარო → სრული ბარათი, პირადი → მხოლოდ სათაური.** ეს არის
     * ტასქის მთავარი წესი: გაზიარება ხილვადობას **არ** ცვლის. ავტორმა
     * თვითონ შეიძლება გაუშვას პირადი ჩანაწერი — მაშინ თანამოსაუბრე
     * ხედავს, *რაზე* არის საუბარი, და არა *რა უწერია შიგნით*.
     *
     * ⚠️ **თვითონ ავტორი ყოველთვის ხედავს ბარათს** — ეს მისივე ჩანაწერია
     * და მისი დამალვა თავისივე თავისგან უაზრობაა.
     */
    public function view(Message $message, int $viewerId): ?array
    {
        $shared = $message->record;

        if (! is_array($shared) || ! self::shareable((string) ($shared['domain'] ?? ''))) {
            return null;
        }

        $domain = (string) $shared['domain'];
        $owner = $message->user_id;

        $record = $this->visibleRecord($domain, (int) $shared['id'], (int) $owner, $viewerId);

        return [
            'domain' => $domain,
            'title' => (string) ($shared['title'] ?? ''),
            'identity' => (array) ($shared['identity'] ?? []),
            /* ⚠️ `card` **null-ია ორ სხვადასხვა შემთხვევაში** და ეს
               განზრახია: ჩანაწერი პირადია, ან უკვე აღარ არსებობს. ორივეზე
               ინტერფეისს ერთი და იგივე აქვს სათქმელი — „მხოლოდ სათაური". */
            'card' => $record ? PublicDomain::card($domain, $record) : null,
        ];
    }

    /**
     * ჩანაწერის დამატება მიმღების ბიბლიოთეკაში.
     *
     * ⚠️ **ჯერ იდენტობით ვეძებთ, მერე ვქმნით.** ერთი და იგივე ფილმი ორჯერ
     * რომ დაემატოს, `movies.imdb_id`-ის unique-ს არ დაარღვევდა (ის
     * per-user-ია), სამაგიეროდ მატჩინგი (§16.2) ორ რიგს დაითვლიდა.
     *
     * ⚠️ **გამდიდრება სურვილისამებრია და არა პირობა.** TMDB-ის გასაღები
     * შეიძლება არ იყოს ან წყარო არ პასუხობდეს — ჩანაწერი მაინც უნდა
     * შეიქმნას (იდენტობითა და სათაურით), რომ მერე ჩვეულებრივმა
     * სინქრონმა შეავსოს. საპირისპირო ქცევა „დამატება არ მუშაობს"-ს
     * ნიშნავდა მაშინ, როცა ის სინამდვილეში ერთ გასაღებს ელოდება.
     *
     * @return array{record: Model, created: bool}
     */
    public function copyTo(User $recipient, array $shared): array
    {
        $domain = (string) $shared['domain'];
        $identity = array_filter((array) ($shared['identity'] ?? []), fn ($v) => $v !== null && $v !== '');

        if ($identity === []) {
            throw new \RuntimeException('record_identity_missing');
        }

        /** @var class-string<Model> $model */
        $model = PublicDomain::model($domain);

        $existing = $model::withoutGlobalScope('owner')
            ->where('user_id', $recipient->getKey())
            ->where($identity)
            ->first();

        if ($existing) {
            return ['record' => $existing, 'created' => false];
        }

        $record = new $model([...$identity]);
        $record->user_id = $recipient->getKey();
        $record->save();

        $this->fillTitle($domain, $record, (string) ($shared['title'] ?? ''));
        $this->enrich($domain, $record);

        return ['record' => $record->refresh(), 'created' => true];
    }

    /* ---------- დამხმარეები ---------- */

    /**
     * ჩანაწერი, თუ მკითხველს მისი ნახვა შეუძლია.
     *
     * ⚠️ **`PublicProfileService::query()`-ზე დგას და არა საკუთარ `where`-ზე**
     * — ხილვადობის სამივე ფენა (პროფილი → მოდული → ჩანაწერი) ერთ ადგილას
     * წერია და მეორე ასლი ერთ დღეს პირადს გაუშვებდა.
     */
    private function visibleRecord(string $domain, int $id, int $ownerId, int $viewerId): ?Model
    {
        /** @var class-string<Model> $model */
        $model = PublicDomain::model($domain);

        if ($ownerId === $viewerId) {
            // საკუთარი ჩანაწერი — ხილვადობას აქ აზრი არ აქვს
            return $model::withoutGlobalScope('owner')->where('user_id', $ownerId)->find($id);
        }

        $owner = User::find($ownerId);

        return $owner ? $this->public->query($owner, $domain)->find($id) : null;
    }

    /**
     * სათაური — ცხრა დომენი, სამი სქემა.
     *
     * ⚠️ **სერვერი წყვეტს**: ნაწილს `title` აქვს, მედიას `title_ka`/`title_en`
     * აქსესორები. ორივე მხარეს ჩაწერილი რუკა პირველივე ახალ მოდულზე
     * დაშორდებოდა.
     */
    private function title(Model $record): string
    {
        foreach (['title_ka', 'title_en', 'title', 'name'] as $field) {
            $value = $record->getAttribute($field);

            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return '#'.$record->getKey();
    }

    /**
     * ⚠️ **მედიის სათაური თარგმანების ცხრილშია** და არა სვეტში, ე.ი.
     * `$record->title = …` ჩუმად არაფერს აკეთებდა. გამდიდრება მას
     * ისედაც გადააწერს — ეს იმისთვისაა, რომ გასაღების გარეშეც ბარათი
     * ცარიელი არ იყოს.
     */
    private function fillTitle(string $domain, Model $record, string $title): void
    {
        if ($title === '') {
            return;
        }

        if (MediaDomain::has($domain)) {
            $record->translations()->create(['locale' => 'en', 'title' => $title]);

            return;
        }

        if ($record->isFillable('title') || in_array('title', $record->getFillable(), true)) {
            $record->forceFill(['title' => $title])->save();
        }
    }

    /**
     * ⚠️ **ჩავარდნა ჩუმად ითმინება.** გამდიდრება ბონუსია — წყარო შეიძლება
     * არ პასუხობდეს, გასაღები არ იყოს ან კვოტა ამოწურული — ჩანაწერი კი
     * უკვე შექმნილია და მისი წაშლა უარესი შედეგია, ვიდრე ნახევრად
     * შევსებული ბარათი, რომელსაც სინქრონი შეავსებს.
     */
    private function enrich(string $domain, Model $record): void
    {
        if (! MediaDomain::has($domain)) {
            return;
        }

        try {
            MediaDomain::enrich($domain, $record);
        } catch (\Throwable) {
            $record->forceFill(['sync_status' => 'partial'])->save();
        }
    }
}
