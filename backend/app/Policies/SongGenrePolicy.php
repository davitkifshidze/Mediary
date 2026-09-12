<?php

namespace App\Policies;

use App\Models\SongGenre;
use App\Models\User;

class SongGenrePolicy
{
    public function view(User $user, SongGenre $genre): bool
    {
        return $genre->user_id === $user->id;
    }

    public function update(User $user, SongGenre $genre): bool
    {
        return $this->view($user, $genre);
    }

    public function delete(User $user, SongGenre $genre): bool
    {
        return $this->view($user, $genre);
    }
}
