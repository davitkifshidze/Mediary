<?php

namespace App\Policies;

use App\Models\BookmarkCategory;
use App\Models\User;

class BookmarkCategoryPolicy
{
    public function view(User $user, BookmarkCategory $category): bool
    {
        return $category->user_id === $user->id;
    }

    public function update(User $user, BookmarkCategory $category): bool
    {
        return $this->view($user, $category);
    }

    public function delete(User $user, BookmarkCategory $category): bool
    {
        return $this->view($user, $category);
    }
}
