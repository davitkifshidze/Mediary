<?php

namespace App\Policies;

use App\Models\Song;
use App\Models\User;

class SongPolicy
{
    public function view(User $user, Song $song): bool
    {
        return $song->user_id === $user->id;
    }

    public function update(User $user, Song $song): bool
    {
        return $this->view($user, $song);
    }

    public function delete(User $user, Song $song): bool
    {
        return $this->view($user, $song);
    }
}
