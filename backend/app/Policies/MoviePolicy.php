<?php

namespace App\Policies;

use App\Models\Movie;
use App\Models\User;

/**
 * მფლობელობის მეორე ფენა: global scope ჩუმად მალავს სხვის ჩანაწერს,
 * policy კი აშკარად კეტავს (თუ სადმე scope გამორთულია).
 */
class MoviePolicy
{
    public function view(User $user, Movie $movie): bool
    {
        return $movie->user_id === $user->id;
    }

    public function update(User $user, Movie $movie): bool
    {
        return $movie->user_id === $user->id;
    }

    public function delete(User $user, Movie $movie): bool
    {
        return $movie->user_id === $user->id;
    }
}
