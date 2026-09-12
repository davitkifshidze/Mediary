<?php

namespace App\Policies;

use App\Models\BoardGameGenre;
use App\Models\User;

class BoardGameGenrePolicy
{
    public function view(User $user, BoardGameGenre $genre): bool
    {
        return $genre->user_id === $user->id;
    }

    public function update(User $user, BoardGameGenre $genre): bool
    {
        return $this->view($user, $genre);
    }

    public function delete(User $user, BoardGameGenre $genre): bool
    {
        return $this->view($user, $genre);
    }
}
