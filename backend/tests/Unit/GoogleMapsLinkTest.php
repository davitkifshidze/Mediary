<?php

namespace Tests\Unit;

use App\Support\GoogleMapsLink;
use PHPUnit\Framework\TestCase;

/**
 * **Google Maps-ის ბმულის ამოკითხვა** (ქსელის გარეშე).
 */
class GoogleMapsLinkTest extends TestCase
{
    public function test_a_place_link_gives_the_name_and_the_exact_point_over_the_view_centre(): void
    {
        $link = GoogleMapsLink::parse('https://www.google.com/maps/place/%E1%83%9E%E1%83%98%E1%83%A5%E1%83%A2%E1%83%9D%E1%83%92%E1%83%A0%E1%83%90%E1%83%9B%E1%83%90/@41.7100,44.8000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.7151234!4d44.8270987!16s');

        $this->assertSame('პიქტოგრამა', $link['name']);
        // `!3d!4d` — ადგილის წერტილი; `@` — მხოლოდ ხედის ცენტრი
        $this->assertSame(41.7151234, $link['lat']);
        $this->assertSame(44.8270987, $link['lng']);
        // `0x0:0x0` ცარიელი ჩანაცვლებაა და არა ადგილის ID
        $this->assertNull($link['cid']);
    }

    /**
     * შენი ორი ბმული: ბიზნესის გრძელი ბმული (FTID აქ საილუსტრაციოა) და მოკლე ბმულის გაშლილი სახე
     * (`maps.app.goo.gl/FhvBRiHwZmeqbWo6A` → 302, ცოცხლად გადამოწმებული).
     *
     * ⚠️ FTID-ის მეორე ნახევარი CID-ია — 64-ბიტიანი უნიშნო რიცხვი, `hexdec()`
     * მას დაამრგვალებდა; `!19s` — Google-ის Place ID.
     */
    public function test_real_links_give_the_point_and_the_google_ids(): void
    {
        $long = GoogleMapsLink::parse('https://www.google.com/maps/place/Pictograma/@41.7004779,44.7994278,17z/data=!3m1!4b1!4m6!3m5!1s0x40440ce731f82b1d:0x1a2b3c4d5e6f7081!8m2!3d41.7004779!4d44.8020027!16s%2Fg%2F11c5r3xk0q');
        $this->assertSame('Pictograma', $long['name']);
        $this->assertSame([41.7004779, 44.8020027], [$long['lat'], $long['lng']]);
        $this->assertSame('1885667171979194497', $long['cid']);

        $short = GoogleMapsLink::parse('https://www.google.com/maps/place/31+Atoneli+St/data=!4m7!3m6!1s0x40440ce731f82b1d:0x9e4f761a61b9ff48!8m2!3d41.7005149!4d44.8017788!16s%2Fg%2F11bw4n4hy5!19sChIJHSv4MecMREARSP-5YRp2T54?entry=tts');
        $this->assertSame(
            ['name' => '31 Atoneli St', 'lat' => 41.7005149, 'lng' => 44.8017788, 'cid' => '11407466236833562440', 'place_id' => 'ChIJHSv4MecMREARSP-5YRp2T54'],
            $short,
        );
    }

    /** `?cid=`, `?q=place_id:`, `query_place_id`, მარშრუტის დანიშნულება */
    public function test_cid_place_id_and_route_links(): void
    {
        $this->assertSame(
            ['name' => null, 'lat' => null, 'lng' => null, 'cid' => '11407466236833562440', 'place_id' => null],
            GoogleMapsLink::parse('https://maps.google.com/?cid=11407466236833562440'),
        );
        $this->assertSame(
            ['name' => null, 'lat' => null, 'lng' => null, 'cid' => null, 'place_id' => 'ChIJHSv4MecMREARSP-5YRp2T54'],
            GoogleMapsLink::parse('https://www.google.com/maps/search/?api=1&q=place_id:ChIJHSv4MecMREARSP-5YRp2T54'),
        );
        $this->assertSame(
            'ChIJHSv4MecMREARSP-5YRp2T54',
            GoogleMapsLink::parse('https://www.google.com/maps/search/?api=1&query=Pictograma&query_place_id=ChIJHSv4MecMREARSP-5YRp2T54')['place_id'],
        );

        // მარშრუტი: სახელი, წერტილი და ID — **დანიშნულებისაა** და არა საიდანისა
        $route = GoogleMapsLink::parse('https://www.google.com/maps/dir/Tbilisi+Mall/Pictograma,+31+Atoneli+St/@41.73,44.78,13z/data=!3m1!4b1!4m13!4m12!1m5!1m1!1s0x40440d0000000001:0x1111111111111111!2m2!1d44.7551!2d41.7799!1m5!1m1!1s0x40440ce731f82b1d:0x9e4f761a61b9ff48!2m2!1d44.8017788!2d41.7005149');
        $this->assertSame('Pictograma, 31 Atoneli St', $route['name']);
        $this->assertSame([41.7005149, 44.8017788], [$route['lat'], $route['lng']]);
        $this->assertSame('11407466236833562440', $route['cid']);

        $this->assertSame('Narikala', GoogleMapsLink::parse('https://www.google.com/maps/dir/?api=1&destination=Narikala')['name']);
    }

    public function test_the_view_centre_and_the_query_forms(): void
    {
        $this->assertSame(
            ['name' => 'Pictogram Tbilisi', 'lat' => 41.71, 'lng' => 44.82, 'cid' => null, 'place_id' => null],
            GoogleMapsLink::parse('https://www.google.com/maps/place/Pictogram+Tbilisi/@41.71,44.82,15z'),
        );
        $this->assertSame(
            ['name' => 'khinkali', 'lat' => 41.7, 'lng' => 44.8, 'cid' => null, 'place_id' => null],
            GoogleMapsLink::parse('https://www.google.com/maps/search/khinkali/@41.7,44.8,14z'),
        );
        $this->assertSame(
            ['name' => null, 'lat' => 41.7151, 'lng' => 44.8271, 'cid' => null, 'place_id' => null],
            GoogleMapsLink::parse('https://maps.google.com/?q=41.7151,44.8271'),
        );
        $this->assertSame(
            ['name' => 'Narikala', 'lat' => null, 'lng' => null, 'cid' => null, 'place_id' => null],
            GoogleMapsLink::parse('https://www.google.ge/maps?q=Narikala'),
        );
    }

    public function test_short_links_and_consent_pages(): void
    {
        $this->assertTrue(GoogleMapsLink::isShort('https://maps.app.goo.gl/AbCdEf123'));
        $this->assertTrue(GoogleMapsLink::isShort('https://goo.gl/maps/AbCdEf123'));
        $this->assertFalse(GoogleMapsLink::isShort('https://goo.gl/other'));
        // მოკლე ბმული ქსელის გარეშე არ იკითხება
        $this->assertNull(GoogleMapsLink::parse('https://maps.app.goo.gl/AbCdEf123'));

        $this->assertSame(
            'https://www.google.com/maps/place/X/@41.7,44.8,15z',
            GoogleMapsLink::unwrap('https://consent.google.com/ml?continue=https://www.google.com/maps/place/X/@41.7,44.8,15z&gl=GE'),
        );
        // 429-ის „sorry" გვერდიც ბმულს `continue`-ში ინახავს
        $this->assertSame(
            'https://www.google.com/maps/place/X/@41.7,44.8,15z',
            GoogleMapsLink::unwrap('https://www.google.com/sorry/index?continue='.urlencode('https://www.google.com/maps/place/X/@41.7,44.8,15z').'&q=EgQ'),
        );
        $this->assertSame('https://www.google.com/search?q=x', GoogleMapsLink::unwrap('https://www.google.com/search?q=x'));
    }

    public function test_other_links_are_not_maps(): void
    {
        $this->assertNull(GoogleMapsLink::parse('https://example.com/maps/place/X/@41.7,44.8,15z'));
        $this->assertNull(GoogleMapsLink::parse('https://www.google.com/search?q=pictogram'));
        $this->assertFalse(GoogleMapsLink::looksLike('https://www.openstreetmap.org/#map=15/41.7/44.8'));
    }
}
