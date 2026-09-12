<?php

namespace App\Http\Controllers;

abstract class Controller
{
    /**
     * მძიმით გამოყოფილი slug-ების სია → სუფთა მასივი.
     * ფილტრების პანელი (Tasks 2.2) ერთ პარამეტრში რამდენიმე ჟანრს/ტეგს გზავნის.
     *
     * @return list<string>
     */
    protected function slugList(?string $value): array
    {
        if ($value === null || trim($value) === '') {
            return [];
        }

        return array_values(array_unique(array_filter(
            array_map('trim', explode(',', $value)),
            fn (string $slug) => $slug !== '',
        )));
    }
}
