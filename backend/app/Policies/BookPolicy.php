<?php

namespace App\Policies;

use App\Models\Book;
use App\Models\User;

class BookPolicy
{
    public function view(User $user, Book $book): bool
    {
        return $book->user_id === $user->id;
    }

    public function update(User $user, Book $book): bool
    {
        return $this->view($user, $book);
    }

    public function delete(User $user, Book $book): bool
    {
        return $this->view($user, $book);
    }
}
