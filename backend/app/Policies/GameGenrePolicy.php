<?php

namespace App\Policies;

use App\Models\GameGenre;
use App\Models\User;

class GameGenrePolicy
{
    public function view(User $user, GameGenre $genre): bool
    {
        return $genre->user_id === $user->id;
    }

    public function update(User $user, GameGenre $genre): bool
    {
        return $this->view($user, $genre);
    }

    public function delete(User $user, GameGenre $genre): bool
    {
        return $this->view($user, $genre);
    }
}
