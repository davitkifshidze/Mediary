<?php

namespace App\Support;

/**
 * **ფონური პროცესის გაშვება, რომელიც მშობელს გადარჩება (Tasks §7.1).**
 *
 * ⚠️ `Symfony\Component\Process` აქ **არ გამოდგება**: მისი `start()` შვილს
 * ობიექტის განადგურებაზე კლავს, ე.ი. HTTP-მოთხოვნის დასრულებისთანავე
 * ჩამოწერა შეწყდებოდა.
 *
 * ⚠️ **რატომ ფონურად.** ერთი ვიდეო წუთებს ჩამოდის, `php artisan serve` კი
 * ერთნაკადიანია — სინქრონული მოთხოვნა მთელ dev-სერვერს გააჩერებდა. ეს იმავე
 * ოჯახის გადაწყვეტილებაა, რაც სინქრონიზაციისა და გალერეის რიგს აქვს:
 * ხანგრძლივი სამუშაო არასდროს ზის ერთ მოთხოვნაში.
 *
 * ⚠️ **ცალკე კლასია განზრახ** — ტესტში ის იცვლება და ვიდეო მართლა არ
 * იწერება; `VideoDownloader::run()` კი პირდაპირ გამოიძახება.
 */
class BackgroundProcess
{
    /**
     * @param  list<string>  $command  სრული ბრძანება არგუმენტებად
     * @return bool `false` — გაშვება ვერ მოხერხდა (ფუნქციები გამორთულია)
     */
    public function dispatch(array $command): bool
    {
        $line = implode(' ', array_map(fn (string $part) => $this->quote($part), $command));

        if (PHP_OS_FAMILY === 'Windows') {
            // ⚠️ `start`-ის პირველი ბრჭყალებიანი არგუმენტი **ფანჯრის სათაურია**
            // და არა პროგრამა — ცარიელი `""` აუცილებელია, თორემ ბრჭყალებში
            // ჩასმული ბილიკი სათაურად წაიკითხებოდა და არაფერი გაეშვებოდა.
            return $this->spawn('start /B "" '.$line.' > NUL 2>&1');
        }

        return $this->spawn($line.' > /dev/null 2>&1 &');
    }

    private function spawn(string $line): bool
    {
        if (function_exists('popen')) {
            $handle = @popen($line, 'r');
            if ($handle !== false) {
                pclose($handle);

                return true;
            }
        }

        if (function_exists('exec')) {
            @exec($line);

            return true;
        }

        return false;
    }

    private function quote(string $part): string
    {
        return PHP_OS_FAMILY === 'Windows' ? '"'.str_replace('"', '""', $part).'"' : escapeshellarg($part);
    }
}
