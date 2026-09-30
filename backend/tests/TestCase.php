<?php

namespace Tests;

use App\Models\User;
use App\Models\UserCredential;
use App\Services\Credentials\CredentialStore;
use App\Support\AlbumLock;
use App\Support\AppSettings;
use App\Support\CredentialProviders;
use App\Support\CustomModules;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * ⚠️ **`CredentialStore`-ის რექვესთის ქეში სტატიკურია** (Tasks §21), ე.ი.
     * ერთ PHP პროცესში მიმდინარე ტესტებს შორის გადადის. `RefreshDatabase`-თან
     * ერთად ეს ჩუმი ცდომილებაა: მეორე ტესტის `id = 1` მომხმარებელი პირველის
     * დამახსოვრებულ (უკვე წაშლილ) გასაღებს მიიღებდა.
     */
    protected function setUp(): void
    {
        parent::setUp();

        CredentialStore::forget();
        // ⚠️ იგივე ხაფანგი: `AlbumLock`-ის მემოც სტატიკურია (ჩაკეტილი
        // ალბომების სია), ე.ი. წინა ტესტის `id = 1` მომხმარებლის პასუხი
        // შემდეგზე გადავიდოდა და ლოკი შემთხვევით „უკვე გახსნილი" იქნებოდა
        AlbumLock::flush();
        // ⚠️ მესამე სტატიკური: „ამ რიგზე გაშიფვრის შეცდომა უკვე ჩავწერეთ"
        // (Tasks GAP-11) — წინა ტესტის `user 1 : telegram` მომდევნოს
        // გაფრთხილებას ჩუმად ჩაყლაპავდა
        UserCredential::flushWarnings();
        // ⚠️ მეოთხე (Tasks §34.1): ინსტალაციის პარამეტრების ქეში მოთხოვნისაა,
        // მაგრამ ტესტის სხეული ერთსა და იმავე `Request`-ს ხედავს — ბაზის
        // პირდაპირ ჩასწორების შემდეგ ძველი მნიშვნელობა დარჩებოდა
        AppSettings::flush();
        // ⚠️ მეხუთე (Tasks §37): პირადი მოდულების სია — იგივე მოთხოვნის ქეში
        CustomModules::flush();
    }

    /**
     * **მომხმარებელს წყაროს პირადი გასაღები** (Tasks §30.9).
     *
     * ⚠️ `config(['services.tmdb.key' => …])` აქამდე ტესტის „გასაღები" იყო —
     * §30-იდან აპი `config('services.*')`-ს შვიდ წყაროზე **აღარ კითხულობს**,
     * ე.ი. ასეთი ხაზი ჩუმად აღარაფერს აკეთებს. გასაღები ახლა ისევე ჩნდება,
     * როგორც ცოცხალ აპში: `user_credentials`-ის რიგით, მოდელით (დაშიფრულად).
     *
     * ⚠️ ცარიელი `$fields` → ყოველ სავალდებულო ველზე `test-<ველი>`, ე.ი.
     * TMDB-ზე `['key' => 'test-key']` — ზუსტად ის, რაც ძველ ტესტებს ეწერა.
     * არსებულ რიგს **გადაწერს** (ერთ ტესტში გასაღების შეცვლა ჩვეულებრივია).
     *
     * @param  array<string, string>  $fields
     * @param  array<string, int|null>  $limits
     */
    protected function giveCredential(User|int $user, string $provider, array $fields = [], array $limits = []): UserCredential
    {
        $userId = $user instanceof User ? (int) $user->getKey() : $user;

        if ($fields === []) {
            foreach (CredentialProviders::required($provider) as $name) {
                $fields[$name] = 'test-'.str_replace('_', '-', $name);
            }
        }

        $row = UserCredential::firstOrNew(['user_id' => $userId, 'provider' => $provider]);
        $row->forgetUnreadable();
        $row->credentials = $fields;
        $row->limits = array_filter($limits, fn ($v) => $v !== null) ?: null;
        $row->is_active = true;
        $row->save();

        CredentialStore::forget();

        return $row;
    }

    /** პირადი გასაღების წაშლა — „გასაღების გარეშე" ტესტებისთვის */
    protected function takeCredential(User|int $user, string $provider): void
    {
        $userId = $user instanceof User ? (int) $user->getKey() : $user;

        UserCredential::where('user_id', $userId)->where('provider', $provider)->delete();

        CredentialStore::forget();
    }
}
