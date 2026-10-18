<?php

namespace App\Services\Import;

use RuntimeException;

/**
 * **იმპორტის ფაილის „ვერ წავიკითხე".**
 *
 * `message` მანქანური კოდია (`import_format_unknown`…), რომელსაც კონტროლერი
 * პასუხის `message`-ად აბრუნებს (CLAUDE.md-ის წესი); `context` — ის, რაც
 * ეკრანს არჩევანისთვის სჭირდება (მაგ. CSV-ის შესაძლო მოდულები).
 */
class ImportException extends RuntimeException
{
    /** @param  array<string, mixed>  $context */
    public function __construct(string $code, public readonly array $context = [], public readonly int $status = 422)
    {
        parent::__construct($code);
    }
}
