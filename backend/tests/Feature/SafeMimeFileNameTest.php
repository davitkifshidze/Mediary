<?php

namespace Tests\Feature;

use App\Support\SafeMime;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ფაილის სახელი პასუხის ჰედერში.**
 *
 * ⚠️ ფოტოს თავდაპირველი სახელი ხშირად გვერდის სათაურია და დახრილ ხაზს შეიცავს
 * („AC/DC — live.jpg"). Symfony ასეთ სახელზე გამონაკლისს ისვრის, ე.ი. ფაილის
 * გაცემა 500-ით მთავრდებოდა და ჩაკეტილი ალბომის ფოტო გატეხილ სურათად ჩანდა.
 * მოწმდება სამივე კარი (`response`, `download`, `fileResponse`): დახრილი ხაზი ტირედ
 * იქცევა, დანარჩენი სახელი — ქართულიც — ხელუხლებელია, ცარიელი სახელი ფაილისაზე ბრუნდება.
 */
class SafeMimeFileNameTest extends TestCase
{
    private const PATH = 'gallery/locked/photo.jpg';

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('private');
        // ნამდვილი JPEG-ის თავი — ტიპი შიგთავსიდან დგინდება
        Storage::disk('private')->put(self::PATH, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));
    }

    public function test_a_slash_in_the_name_becomes_a_dash_on_every_door(): void
    {
        $disk = Storage::disk('private');
        $name = 'AC/DC \\ live — კონცერტი.jpg';

        foreach ([
            SafeMime::response($disk, self::PATH, $name),
            SafeMime::download($disk, self::PATH, $name),
            SafeMime::fileResponse($disk, self::PATH, $name),
        ] as $response) {
            $this->assertSame(200, $response->getStatusCode());
            $disposition = (string) $response->headers->get('Content-Disposition');

            // დახრილი ხაზი აღარ არის; ქართული სახელი UTF-8 ფორმით რჩება
            $this->assertStringNotContainsString('/', $disposition);
            $this->assertStringNotContainsString('\\', $disposition);
            $this->assertStringContainsString(rawurlencode('AC-DC - live — კონცერტი.jpg'), $disposition);
        }
    }

    public function test_an_ordinary_name_is_untouched_and_an_empty_one_falls_back_to_the_file(): void
    {
        $disk = Storage::disk('private');

        $plain = (string) SafeMime::download($disk, self::PATH, 'poster.jpg')->headers->get('Content-Disposition');
        $this->assertStringContainsString('filename=poster.jpg', $plain);

        // მხოლოდ დახრილი ხაზებისგან შემდგარი სახელი ცარიელად ითვლება — ფაილის საკუთარი სახელი
        $fallback = (string) SafeMime::fileResponse($disk, self::PATH, ' / ')->headers->get('Content-Disposition');
        $this->assertStringContainsString('photo.jpg', $fallback);
    }
}
