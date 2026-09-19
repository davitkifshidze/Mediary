<?php

namespace Tests\Feature;

use App\Services\Bookmarks\LinkMetadata;
use App\Support\SafeHttp;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ბუკმარკის მეტამონაცემი — ფარდობითი მისამართის ამოხსნა (Tasks BUG-25).**
 *
 * ⚠️ **ჰოსტი ლიტერალური IP-ია** (`203.0.113.10`, RFC 5737): `SafeHttp` ჰოსტს
 * ნამდვილად ხსნის, ე.ი. `example.com` ტესტს ქსელზე დამოკიდებულს გახდიდა —
 * `SafeHttpTest`-ის იგივე წესი.
 */
class LinkMetadataTest extends TestCase
{
    private const HOST = 'http://203.0.113.10';

    private function fetchWith(string $pageUrl, string $head): array
    {
        Http::fake([
            '*' => Http::response("<html><head>{$head}</head><body></body></html>", 200, [
                'Content-Type' => 'text/html; charset=utf-8',
            ]),
        ]);

        return (new LinkMetadata(new SafeHttp))->fetch($pageUrl);
    }

    /**
     * სამივე ფარდობითი ფორმა — RFC 3986 §5.2.
     *
     * ⚠️ **დახრილის გარეშე დაწყებული გზა გვერდის საქაღალდეს ეკუთვნის.**
     * ძველი კოდი მას ჰოსტის ფესვთან ითვლიდა, ე.ი. `img/x.png` ბლოგის
     * პოსტზე `…/img/x.png`-ის ნაცვლად `…ge/img/x.png` ხდებოდა და სურათი
     * გატეხილი იყო.
     *
     * @return array<string, array{string, string, string}>
     */
    public static function relativeForms(): array
    {
        return [
            'root-relative' => ['/blog/post/', '/x.png', self::HOST.'/x.png'],
            'directory-relative' => ['/blog/post/', 'img/x.png', self::HOST.'/blog/post/img/x.png'],
            'parent-relative' => ['/blog/post/', '../x.png', self::HOST.'/blog/x.png'],
            'dot-relative' => ['/blog/post/', './img/x.png', self::HOST.'/blog/post/img/x.png'],
            // ⚠️ ბაზის გზა ფაილია — საქაღალდე მისი მშობელია და არა თვითონ
            'base is a file' => ['/blog/post.html', 'img/x.png', self::HOST.'/blog/img/x.png'],
            'base is the root' => ['/', 'img/x.png', self::HOST.'/img/x.png'],
            'protocol relative' => ['/blog/post/', '//cdn.example.com/x.png', 'http://cdn.example.com/x.png'],
            'already absolute' => ['/blog/post/', 'https://cdn.example.com/x.png', 'https://cdn.example.com/x.png'],
            // ფესვზე ზემოთ ასვლა ვერ ხდება (RFC: ასეთი სეგმენტი უბრალოდ ქრება)
            'above the root' => ['/', '../../x.png', self::HOST.'/x.png'],
        ];
    }

    #[DataProvider('relativeForms')]
    public function test_a_relative_image_resolves_against_the_page(string $basePath, string $image, string $expected): void
    {
        $meta = $this->fetchWith(self::HOST.$basePath, '<meta property="og:image" content="'.$image.'">');

        $this->assertSame($expected, $meta['image_url']);
    }

    /** favicon იმავე გზით ამოიხსნება — იგივე ბაგი იქაც იყო */
    public function test_a_relative_favicon_resolves_against_the_page(): void
    {
        $meta = $this->fetchWith(
            self::HOST.'/blog/post/',
            '<link rel="icon" href="icons/fav.png">',
        );

        $this->assertSame(self::HOST.'/blog/post/icons/fav.png', $meta['favicon_url']);
    }

    /**
     * ⚠️ **პორტი არ იკარგება**: `parse_url` მას ცალკე ველად აბრუნებს და
     * ძველი კოდი მხოლოდ `host`-ს კითხულობდა, ე.ი. `:8080` ჩუმად ქრებოდა.
     */
    public function test_the_port_survives(): void
    {
        $meta = $this->fetchWith(
            'http://203.0.113.10:8080/blog/post/',
            '<meta property="og:image" content="/x.png">',
        );

        $this->assertSame('http://203.0.113.10:8080/x.png', $meta['image_url']);
    }

    /** `<link>`-ის გარეშე ნაგულისხმევი `/favicon.ico` ფესვზეა და პორტსაც ინახავს */
    public function test_the_default_favicon_is_the_host_root(): void
    {
        $meta = $this->fetchWith('http://203.0.113.10:8080/blog/post/', '<title>x</title>');

        $this->assertSame('http://203.0.113.10:8080/favicon.ico', $meta['favicon_url']);
    }
}
