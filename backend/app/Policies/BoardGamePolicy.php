<?php

namespace App\Policies;

use App\Models\BoardGame;
use App\Models\User;

class BoardGamePolicy
{
    public function view(User $user, BoardGame $game): bool
    {
        return $game->user_id === $user->id;
    }

    public function update(User $user, BoardGame $game): bool
    {
        return $this->view($user, $game);
    }

    public function delete(User $user, BoardGame $game): bool
    {
        return $this->view($user, $game);
    }
}
