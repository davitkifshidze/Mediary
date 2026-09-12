<?php

namespace App\Policies;

use App\Models\Playlist;
use App\Models\User;

class PlaylistPolicy
{
    public function view(User $user, Playlist $playlist): bool
    {
        return $playlist->user_id === $user->id;
    }

    public function update(User $user, Playlist $playlist): bool
    {
        return $this->view($user, $playlist);
    }

    public function delete(User $user, Playlist $playlist): bool
    {
        return $this->view($user, $playlist);
    }
}
