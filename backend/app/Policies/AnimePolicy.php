<?php

namespace App\Policies;

use App\Models\Anime;
use App\Models\User;

class AnimePolicy
{
    public function view(User $user, Anime $anime): bool
    {
        return $anime->user_id === $user->id;
    }

    public function update(User $user, Anime $anime): bool
    {
        return $anime->user_id === $user->id;
    }

    public function delete(User $user, Anime $anime): bool
    {
        return $anime->user_id === $user->id;
    }
}
