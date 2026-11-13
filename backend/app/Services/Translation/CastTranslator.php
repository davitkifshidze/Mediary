<?php

namespace App\Services\Translation;

use App\Models\CastMember;
use App\Models\CastMemberTranslation;
use App\Services\Tmdb\TmdbClient;
use App\Support\Lang;
use App\Support\MissingCredential;
use App\Support\Redact;
use App\Support\SyncOutcome;
use Throwable;

/**
 * **მსახიობის ქართული სახელი და ბიოგრაფია.**
 *
 * მსახიობის ქართულ სახელს აქამდე მხოლოდ მსახიობების სინქრონიზაცია ავსებდა და მხოლოდ
 * მაშინ, როცა TMDB-ზე ქართული სახელი არის; ბიოგრაფია მხოლოდ ინგლისურად ინახებოდა.
 * აქ ორივე თარგმანის ნაწილია:
 *   · **სახელი** — ჯერ TMDB-ის ქართული სახელი; სადაც არ არის, Gemini წერს ქართული
 *     ასოებით და სახელი **გადასამოწმებლად** ინიშნება (მანქანური ტრანსლიტერაცია ცდება);
 *   · **ბიოგრაფია** — ინგლისური ტექსტიდან, Gemini-თ; ისიც გადასამოწმებელია, როგორც
 *     მანქანით ნათარგმნი აღწერა.
 *
 * ⚠️ **არსებულ ქართულ ტექსტს არ ეხება** — მხოლოდ ცარიელი ივსება (`ItemTranslator`-ის წესი).
 * ⚠️ **მსახიობი საერთო ჩანაწერია**: ჩაწერილი სახელი და ბიოგრაფია ყველა ანგარიშს უჩანს,
 * ხარჯი კი გამშვების Gemini-გასაღებზე მიდის (`Translator` მას `Auth::id()`-ით კითხულობს).
 * ⚠️ **ამოწურული დღიური ლიმიტი ჩავარდნა არ არის** — პასუხი `quota: true`-ია: გამომძახებელი
 * გაშვებას აჩერებს და ერთეულს შედეგს არ უწერს, რომ მეორე დღეს დარჩენილზე გაგრძელდეს.
 */
class CastTranslator
{
    public const NAME = 'name';

    public const BIOGRAPHY = 'biography';

    /** რა ითარგმნება მსახიობზე — ორი ნაწილი ცალ-ცალკე ეშვება */
    public const FIELDS = [self::NAME, self::BIOGRAPHY];

    public function __construct(
        private TmdbClient $tmdb,
        private Translator $translator,
    ) {}

    /**
     * რა აკლია მსახიობს: ქართული სახელი; ქართული ბიოგრაფია — მხოლოდ მაშინ, როცა ინგლისური
     * აქვს (თარგმანს წყარო სჭირდება).
     *
     * @return list<string> `name` · `biography`
     */
    public static function missing(CastMember $member): array
    {
        $missing = [];

        if (trim((string) $member->name_ka) === '' && trim((string) $member->name) !== '') {
            $missing[] = self::NAME;
        }

        if (trim((string) $member->biography_ka) === '' && trim((string) $member->biography) !== '') {
            $missing[] = self::BIOGRAPHY;
        }

        return $missing;
    }

    /**
     * @param  array<int, string>  $fields  `name` · `biography` (ქვესიმრავლე)
     * @param  array<int, string>  $sources  `tmdb` · `gemini` (ქვესიმრავლე)
     * @return array{ok: bool, skipped: bool, changed: list<string>, providers: array<string, string>, error: ?string, result: ?string, quota: bool}
     */
    public function translate(CastMember $member, array $fields = self::FIELDS, array $sources = ItemTranslator::SOURCES): array
    {
        $sources = array_values(array_intersect(ItemTranslator::SOURCES, $sources)) ?: ItemTranslator::SOURCES;
        $wanted = array_values(array_intersect(self::missing($member), $fields));

        if ($wanted === []) {
            return $this->result(true, true, [], [], null, null);
        }

        /** @var array<string, string> ისტორიის ველი (`name_ka` · `biography_ka`) → წყარო */
        $providers = [];

        try {
            // TMDB-ის ქართული პასუხი ერთხელ იკითხება — სახელიც და (თუ ოდესმე ექნება) ბიოგრაფიაც იქიდანაა
            $tmdb = in_array('tmdb', $sources, true) ? $this->fromTmdb($member) : [];

            foreach ($wanted as $field) {
                if (isset($tmdb[$field])) {
                    $member->setGeorgian($field, $tmdb[$field], CastMemberTranslation::SOURCE_TMDB);
                    $providers[$field.'_ka'] = 'tmdb';

                    continue;
                }

                if (! in_array('gemini', $sources, true)) {
                    continue;
                }

                $text = $field === self::NAME
                    ? $this->translator->transliterate($member->name)
                    : $this->translator->translate($member->biography, 'ka', 'actor biography');
                $text = trim((string) $text);

                // შედეგი მხედრული უნდა იყოს — თორემ მოდელმა ორიგინალი დაგვიბრუნა
                if ($text === '' || ! Lang::georgian($text)) {
                    continue;
                }

                $member->setGeorgian(
                    $field,
                    mb_substr($text, 0, $field === self::NAME ? 200 : 10000),
                    CastMemberTranslation::SOURCE_TRANSLATION,
                );
                $providers[$field.'_ka'] = 'gemini';
            }
        } catch (Throwable $e) {
            return $this->result(false, false, array_keys($providers), $providers, Redact::secrets($e->getMessage()), SyncOutcome::FAILED);
        }

        $changed = array_keys($providers);

        // ლიმიტი ამოიწურა: რაც მოესწრო, ჩაწერილია; დანარჩენი გაშვების გაგრძელებას ელის
        if ($this->translator->lastError() === 'gemini_quota_exceeded') {
            return $this->result($changed !== [], false, $changed, $providers, 'gemini_quota_exceeded', $changed ? SyncOutcome::UPDATED : null, true);
        }

        // არჩეული წყაროებიდან არცერთის გასაღები არ მაქვს — შეცდომაა და არა „გამოტოვება"
        if (! $changed && ! $this->anyConfigured($sources)) {
            return $this->result(false, false, [], [], MissingCredential::CODE, SyncOutcome::FAILED);
        }

        return $this->result(true, $changed === [], $changed, $providers, null, $changed ? SyncOutcome::UPDATED : SyncOutcome::EMPTY);
    }

    /**
     * TMDB-ის ქართული სახელი და ბიოგრაფია — მხოლოდ მხედრული ტექსტი (TMDB თარგმანის
     * არქონაზე ჩუმად ორიგინალს აბრუნებს).
     *
     * @return array<string, string> `name` · `biography`
     */
    private function fromTmdb(CastMember $member): array
    {
        if (! $member->tmdb_person_id || ! $this->tmdb->configured()) {
            return [];
        }

        try {
            $ka = $this->tmdb->person((int) $member->tmdb_person_id, 'ka');
        } catch (Throwable) {
            // TMDB-ის ჩავარდნა თარგმანს არ აჩერებს — თარჯიმანი მაინც სცდის
            return [];
        }

        return array_filter([
            self::NAME => Lang::georgian($ka['name'] ?? null),
            self::BIOGRAPHY => Lang::georgian($ka['biography'] ?? null),
        ]);
    }

    /** @param  array<int, string>  $sources */
    private function anyConfigured(array $sources): bool
    {
        foreach ($sources as $source) {
            if ($source === 'tmdb' ? $this->tmdb->configured() : $this->translator->configured()) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<string>  $changed
     * @param  array<string, string>  $providers
     * @return array{ok: bool, skipped: bool, changed: list<string>, providers: array<string, string>, error: ?string, result: ?string, quota: bool}
     */
    private function result(bool $ok, bool $skipped, array $changed, array $providers, ?string $error, ?string $result, bool $quota = false): array
    {
        return [
            'ok' => $ok,
            'skipped' => $skipped,
            // ისტორიის ველები: `name_ka` · `biography_ka`
            'changed' => $changed,
            'providers' => $providers,
            'error' => $error,
            // `updated` · `empty` · `failed`; გამოტოვებაზე `null`
            'result' => $result,
            // დღიური ლიმიტი ამოიწურა — გაშვება ჩერდება და დარჩენილი მოგვიანებით გრძელდება
            'quota' => $quota,
        ];
    }
}
