<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\UploadLimits;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ატვირთვის ლიმიტები** (2026-09-14).
 *
 * ⚠️ შვიდი კონტროლერი ერთსა და იმავე რიცხვებს იმეორებდა და **ინტერფეისში
 * არსად ეწერა** — ატვირთვა 422-ით ვარდებოდა და მიზეზი არ ჩანდა. ეს ტესტი
 * ორ ფაქტს იჭერს: რუკა ერთია და **ნამდვილი ჭერი PHP-ს ითვალისწინებს**.
 */
class UploadLimitsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
    }

    /**
     * ⚠️ **ჭერი ორი რიცხვის მინიმუმია** — აპისა და `php.ini`-ის. სწორედ ეს
     * იყო ხარვეზის გული: `php.ini` 2M-ზე იდგა, აპი კი 100 MB-ს ჰპირდებოდა.
     */
    public function test_the_effective_limit_never_exceeds_the_php_ceiling(): void
    {
        $serverKb = (int) (UploadLimits::serverMaxBytes() / 1024);

        foreach (array_keys(UploadLimits::KINDS) as $kind) {
            $this->assertLessThanOrEqual(
                $serverKb,
                UploadLimits::effectiveKb($kind),
                "„{$kind}".'"-ის ჭერი PHP-ის ლიმიტს აღემატება',
            );
            $this->assertLessThanOrEqual(UploadLimits::maxKb($kind), UploadLimits::effectiveKb($kind));
        }
    }

    /**
     * ⚠️ `image`-ს `mimes` **არ აქვს** — მას Laravel-ის `image` წესი იცავს
     * (ნამდვილი სურათი და არა გაფართოება); დანარჩენებს კი აქვს.
     */
    public function test_rules_carry_the_right_guard_per_kind(): void
    {
        $image = UploadLimits::rule('image');
        $this->assertContains('image', $image);
        $this->assertEmpty(array_filter($image, fn ($r) => str_starts_with((string) $r, 'mimes:')));

        $doc = UploadLimits::rule('doc');
        $this->assertNotEmpty(array_filter($doc, fn ($r) => str_starts_with((string) $r, 'mimes:')));
        $this->assertContains('max:'.UploadLimits::effectiveKb('doc'), $doc);

        // უცნობი სახეობა `doc`-ზე ეშვება და არა შეცდომაზე
        $this->assertSame($doc, UploadLimits::rule('რაღაც'));
    }

    /** ⚠️ ლიმიტები მოდულზე დამოკიდებული არაა — user-ს არც ერთი მოდული არ სჭირდება */
    private function makeUser(string $name): User
    {
        return User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ])->refresh();
    }

    /** ინტერფეისს იგივე რიცხვები მიაქვს, რასაც ვალიდაცია ამოწმებს */
    public function test_the_endpoint_reports_every_kind(): void
    {
        $user = $this->makeUser('uploader');

        $data = $this->actingAs($user)
            ->getJson('/api/uploads/limits')
            ->assertOk()
            ->json('data');

        $this->assertSame(
            array_keys(UploadLimits::KINDS),
            array_column($data['kinds'], 'kind'),
        );

        foreach ($data['kinds'] as $kind) {
            $this->assertSame(
                UploadLimits::effectiveKb($kind['kind']) * 1024,
                $kind['max_bytes'],
            );
        }

        $this->assertSame(UploadLimits::MAX_FILES, $data['max_files']);
        $this->assertNotEmpty($data['server']['upload_max_filesize']);
    }
}
