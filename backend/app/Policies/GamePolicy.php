<?php

namespace App\Policies;

use App\Models\Game;
use App\Models\User;

class GamePolicy
{
    public function view(User $user, Game $game): bool
    {
        return $game->user_id === $user->id;
    }

    public function update(User $user, Game $game): bool
    {
        return $this->view($user, $game);
    }

    public function delete(User $user, Game $game): bool
    {
        return $this->view($user, $game);
    }
}
