<?php

namespace Tests\Feature;

use App\Support\ModuleTables;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * **ყოველ ცხრილს პატრონი ჰყავს.**
 *
 * ⚠️ სქემა ყველა მიგრაციის შემდეგაა — ახალი ცხრილი, რომელიც `ModuleTables`-ში
 * არ ჩაიწერა, ბაზის ექსპორტის ფანჯარაში „უპატრონოდ" დარჩებოდა და მისი
 * მოდული მის გარეშე გადავიდოდა.
 */
class ModuleTablesTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function schemaTables(): array
    {
        $names = array_map(
            fn (string $t) => str_contains($t, '.') ? substr($t, strrpos($t, '.') + 1) : $t,
            Schema::getTableListing(),
        );

        return array_values(array_filter($names, fn (string $t) => ! str_starts_with($t, 'sqlite_')));
    }

    public function test_every_table_belongs_to_a_module_a_shared_group_or_the_system(): void
    {
        $orphans = array_values(array_filter($this->schemaTables(), fn (string $t) => ModuleTables::owner($t) === null));

        $this->assertSame([], $orphans, 'ცხრილი `ModuleTables`-ში არ წერია: '.implode(', ', $orphans));
    }

    public function test_the_registry_names_no_table_that_does_not_exist(): void
    {
        $missing = array_values(array_diff(ModuleTables::all(), $this->schemaTables()));

        $this->assertSame([], $missing, 'რეესტრში წერია, სქემაში კი არ არის: '.implode(', ', $missing));
    }

    public function test_no_table_has_two_owners_and_every_group_used_exists(): void
    {
        $seen = [];
        foreach ([...array_values(ModuleTables::MODULES), ...array_values(ModuleTables::SHARED), ModuleTables::SYSTEM] as $tables) {
            foreach ($tables as $table) {
                $this->assertArrayNotHasKey($table, $seen, "{$table} ორ ადგილასაა");
                $seen[$table] = true;
            }
        }

        foreach (ModuleTables::USES as $module => $groups) {
            $this->assertArrayHasKey($module, ModuleTables::MODULES);
            foreach ($groups as $group) {
                $this->assertArrayHasKey($group, ModuleTables::SHARED, "{$module} → {$group}");
            }
        }
        $this->assertSame([], array_values(array_diff(array_keys(ModuleTables::MODULES), array_keys(ModuleTables::USES))));
    }

    /** შენი მაგალითი — ფილმებს სხვა ცხრილებიც სჭირდება */
    public function test_movies_bring_their_translations_genres_cast_and_gallery(): void
    {
        $needed = ModuleTables::requires('movies');

        foreach (['movies', 'movie_translations', 'movie_field_values', 'genres', 'genreables', 'cast_members', 'castables', 'gallery_images', 'statuses'] as $table) {
            $this->assertContains($table, $needed);
        }
        $this->assertNotContains('users', $needed);
        $this->assertNotContains('books', $needed);

        // საერთო ცხრილი — მხოლოდ თავისი ჯგუფი; სისტემისა — მხოლოდ თვითონ
        $this->assertSame(['genres', 'genre_translations', 'genreables'], ModuleTables::requires('genreables'));
        $this->assertSame(['users'], ModuleTables::requires('users'));

        $closure = ModuleTables::closure(['books', 'users']);
        $this->assertContains('book_notes', $closure);
        $this->assertContains('users', $closure);
        $this->assertNotContains('movies', $closure);
    }
}
