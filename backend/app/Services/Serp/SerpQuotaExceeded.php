<?php

namespace App\Services\Serp;

use RuntimeException;

/**
 * თვიური ლიმიტი ამოიწურა (Tasks §7.6.1).
 *
 * ⚠️ **ეს „ვერაფერი ვიპოვე" არ არის და არც „წყარო მიუწვდომელია".** სამივე
 * სხვადასხვა მდგომარეობაა და ინტერფეისმაც სამი სხვადასხვა რამ უნდა თქვას
 * (`bgg_unavailable`/`rawg_unavailable`-ის ზუსტი წესი). ამიტომ არის ცალკე
 * გამონაკლისი ცალკე მანქანური კოდით და არა `null`-ის დაბრუნება.
 */
class SerpQuotaExceeded extends RuntimeException
{
    public function __construct(
        public readonly int $used,
        public readonly ?int $limit,
    ) {
        parent::__construct('serpapi_quota_exceeded');
    }
}
