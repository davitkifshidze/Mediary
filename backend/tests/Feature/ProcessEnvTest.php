<?php

namespace Tests\Feature;

use App\Support\ProcessEnv;
use Tests\TestCase;

/**
 * **გარე პროგრამის გარემო Windows-ზე (2026-09-17).**
 *
 * ⚠️ **ეს ტესტი გაზომილ ავარიას იცავს და არა თეორიას.** `artisan serve`-ზე
 * ბაზის ასლის გახსნა `ERROR 2004 (HY000): Can't create TCP/IP socket (10106)`-ით
 * ცვიოდა, მაშინ როცა იგივე კოდი CLI-დან მუშაობდა: `Symfony\Process`
 * Windows-ზე მშობლის გარემოს `$_SERVER`-თან გადაკვეთით ჭრის, ხოლო Laravel-ის
 * Dotenv `.env`-ის გასაღებებს სწორედ `$_SERVER`-ში წერს — ე.ი. ჩატვირთვის
 * შემდეგ ბავშვს **მხოლოდ `.env`** მიდიოდა და `SystemRoot` ქრებოდა.
 * `SystemRoot`-ის გარეშე კი Winsock საერთოდ არ ეშვება.
 */
class ProcessEnvTest extends TestCase
{
    /** ⚠️ `SystemRoot` სიაში **უნდა** იყოს — სწორედ ის ტეხდა Winsock-ს */
    public function test_the_critical_windows_keys_are_listed(): void
    {
        $this->assertContains('SystemRoot', ProcessEnv::WINDOWS_KEYS);
        $this->assertContains('PATH', ProcessEnv::WINDOWS_KEYS);
        $this->assertContains('TEMP', ProcessEnv::WINDOWS_KEYS);
    }

    /** გამომძახებლის საკუთარი ცვლადი არასდროს იკარგება */
    public function test_the_callers_own_values_survive(): void
    {
        $env = ProcessEnv::for(['MYSQL_PWD' => 'secret']);

        $this->assertSame('secret', $env['MYSQL_PWD']);
    }

    /**
     * ⚠️ **Windows-ზე გარემო ცხადად გადაიცემა** — Symfony-ის ნაგულისხმევს
     * ვერ დაველოდებით, რადგან სწორედ ის ჭრის მას web SAPI-ზე.
     */
    public function test_windows_gets_the_system_environment_explicitly(): void
    {
        if (DIRECTORY_SEPARATOR !== '\\') {
            $this->assertSame([], ProcessEnv::for(), 'არა-Windows-ზე Symfony სრულ გარემოს ისედაც გადასცემს');

            return;
        }

        $env = ProcessEnv::for();

        $this->assertArrayHasKey('SystemRoot', $env);
        $this->assertNotSame('', $env['SystemRoot']);
    }
}
