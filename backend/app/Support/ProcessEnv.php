<?php

namespace App\Support;

/**
 * **გარე პროგრამის გარემო Windows-ზე (2026-09-17).**
 *
 * ⚠️ **ეს არ არის სიფრთხილე — ეს გაზომილი ავარიაა.** `artisan serve`-ზე
 * (`cli-server` SAPI) ბაზის ასლის გახსნა
 * `ERROR 2004 (HY000): Can't create TCP/IP socket (10106)`-ით ცვიოდა,
 * მაშინ როცა **იგივე კოდი CLI-დან მუშაობდა**.
 *
 * მიზეზი `Symfony\Process::getDefaultEnv()`-შია და ის ზუსტად ორ ხაზზე ზის:
 *
 * ```php
 * $env = getenv();
 * $env = array_intersect_ukey($env, $_SERVER, 'strcasecmp') ?: $env;
 * ```
 *
 * ე.ი. Windows-ზე მშობლის გარემო **`$_SERVER`-თან გადაკვეთით** იჭრება, და
 * მხოლოდ მაშინ ბრუნდება სრული სია, როცა გადაკვეთა **ცარიელია**. Laravel-ის
 * ჩატვირთვამდე გადაკვეთა ნამდვილად ცარიელია (0 გასაღები) და ბავშვი სრულ
 * გარემოს იღებს; ჩატვირთვის შემდეგ კი Dotenv `.env`-ის 62 გასაღებს
 * **`$_SERVER`-შიც** წერს — გადაკვეთა 62-ზე ხტება, `?:` აღარ ირთვება და
 * ბავშვს **მხოლოდ `.env`-ის ცვლადები** მიდის. `SystemRoot` იქ არ არის.
 *
 * ⚠️ **`SystemRoot`-ის გარეშე Winsock საერთოდ არ ეშვება**: მისი პროვაიდერების
 * კატალოგი სწორედ ამ ბილიკით იტვირთება, ე.ი. `WSAStartup` აბრუნებს
 * `WSAEPROVIDERFAILEDINIT`-ს (**10106**) და `mysql.exe` სოკეტს ვერ ქმნის.
 * ეს არაფერ შუაშია ბაზასთან, პორტთან ან პაროლთან — და სწორედ ამიტომ
 * იკითხებოდა შეცდომა სრულიად სხვა მიმართულებით.
 *
 * ⚠️ **გამოსავალი ცხადი გადმოცემაა და არა Symfony-ის შესწორება**:
 * `Process::start()`-ში ჩვენი `$env` **პირველი** ერევა
 * (`$env += array_diff_ukey($this->env, $env, 'strcasecmp')`), ე.ი. რასაც
 * აქ ჩავწერთ, ის ყოველთვის მიაღწევს ბავშვს.
 *
 * ⚠️ **CLI-ზე ეს პრობლემა არ ჩანდა** (იქ `$_SERVER` მთელ გარემოს შეიცავს,
 * ე.ი. გადაკვეთა სრულია) — სწორედ ამიტომ გაიარა ცოცხალმა შემოწმებამ
 * `tinker`-იდან და ჩავარდა ბრაუზერიდან. ერთი და იგივე კოდი, ორი SAPI.
 *
 * ⚠️ **`BackgroundProcess` ამას არ ექვემდებარება**: ის `popen()`-ით
 * `cmd /c start /B`-ს უშვებს, ე.ი. გარემო ჭურვიდან მთლიანად მემკვიდრეობით
 * გადადის.
 */
final class ProcessEnv
{
    /**
     * რა უნდა გადარჩეს ყოველთვის.
     *
     * ⚠️ **`SystemRoot` კრიტიკულია** (Winsock), `PATH` — DLL-ებისა და
     * დამხმარე პროგრამებისთვის, `TEMP`/`TMP` — დროებითი ფაილებისთვის.
     * დანარჩენი იმისთვისაა, რომ ბავშვმა „ნორმალურ" Windows-ს დაინახოს.
     */
    public const WINDOWS_KEYS = [
        'SystemRoot', 'windir', 'SystemDrive', 'COMSPEC', 'PATH', 'PATHEXT',
        'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
        'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES',
        'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
    ];

    /**
     * პროცესისთვის გადასაცემი გარემო.
     *
     * @param  array<string, string>  $extra  ჩვენი საკუთარი ცვლადები (მაგ. `MYSQL_PWD`)
     * @return array<string, string>
     */
    public static function for(array $extra = []): array
    {
        // არა-Windows-ზე Symfony სრულ გარემოს ისედაც გადასცემს
        if (DIRECTORY_SEPARATOR !== '\\') {
            return $extra;
        }

        $env = $extra;

        foreach (self::WINDOWS_KEYS as $key) {
            $value = getenv($key);

            // ⚠️ `array_key_exists` და არა `isset`: გამომძახებლის ცხადი
            // მნიშვნელობა (თუნდაც ცარიელი) ჩვენსას არ უნდა დაკარგოს
            if ($value !== false && ! array_key_exists($key, $env)) {
                $env[$key] = $value;
            }
        }

        return $env;
    }
}
