<?php

namespace Tests;

use App\Services\Credentials\CredentialStore;
use App\Support\AlbumLock;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * ⚠️ **`CredentialStore`-ის რექვესთის ქეში სტატიკურია** (Tasks §21), ე.ი.
     * ერთ PHP პროცესში მიმდინარე ტესტებს შორის გადადის. `RefreshDatabase`-თან
     * ერთად ეს ჩუმი ცდომილებაა: მეორე ტესტის `id = 1` მომხმარებელი პირველის
     * დამახსოვრებულ (უკვე წაშლილ) გასაღებს მიიღებდა.
     */
    protected function setUp(): void
    {
        parent::setUp();

        CredentialStore::forget();
        // ⚠️ იგივე ხაფანგი: `AlbumLock`-ის მემოც სტატიკურია (ჩაკეტილი
        // ალბომების სია), ე.ი. წინა ტესტის `id = 1` მომხმარებლის პასუხი
        // შემდეგზე გადავიდოდა და ლოკი შემთხვევით „უკვე გახსნილი" იქნებოდა
        AlbumLock::flush();
    }
}
