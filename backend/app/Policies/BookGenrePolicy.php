<?php

namespace App\Policies;

use App\Models\BookGenre;
use App\Models\User;

class BookGenrePolicy
{
    public function view(User $user, BookGenre $genre): bool
    {
        return $genre->user_id === $user->id;
    }

    public function update(User $user, BookGenre $genre): bool
    {
        return $this->view($user, $genre);
    }

    public function delete(User $user, BookGenre $genre): bool
    {
        return $this->view($user, $genre);
    }
}
