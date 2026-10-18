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
    }

    public function test_the_view_centre_and_the_query_forms(): void
    {
        $this->assertSame(
            ['name' => 'Pictogram Tbilisi', 'lat' => 41.71, 'lng' => 44.82],
            GoogleMapsLink::parse('https://www.google.com/maps/place/Pictogram+Tbilisi/@41.71,44.82,15z'),
        );
        $this->assertSame(
            ['name' => 'khinkali', 'lat' => 41.7, 'lng' => 44.8],
            GoogleMapsLink::parse('https://www.google.com/maps/search/khinkali/@41.7,44.8,14z'),
        );
        $this->assertSame(
            ['name' => null, 'lat' => 41.7151, 'lng' => 44.8271],
            GoogleMapsLink::parse('https://maps.google.com/?q=41.7151,44.8271'),
        );
        $this->assertSame(
            ['name' => 'Narikala', 'lat' => null, 'lng' => null],
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
    }

    public function test_other_links_are_not_maps(): void
    {
        $this->assertNull(GoogleMapsLink::parse('https://example.com/maps/place/X/@41.7,44.8,15z'));
        $this->assertNull(GoogleMapsLink::parse('https://www.google.com/search?q=pictogram'));
        $this->assertFalse(GoogleMapsLink::looksLike('https://www.openstreetmap.org/#map=15/41.7/44.8'));
    }
}
