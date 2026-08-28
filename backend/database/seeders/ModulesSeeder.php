<?php

namespace Database\Seeders;

use App\Models\Module;
use Illuminate\Database\Seeder;

/**
 * მოდულების რეესტრი (I2). ფილმები/სერიალები — პირველი ორი „plug-in".
 * ახალი მოდულის დამატება = ერთი ჩანაწერი აქ (იხ. docs/I7-*.md, §7.3 recipe).
 */
class ModulesSeeder extends Seeder
{
    public function run(): void
    {
        $modules = [
            [
                'key' => 'movie',
                'name_ka' => 'ფილმები',
                'name_en' => 'Movies',
                'description_ka' => 'ფილმების პირადი კატალოგი TMDB-ის მონაცემებით.',
                'description_en' => 'Personal movie catalog enriched from TMDB.',
                'icon' => 'Film',
                'route_base' => '/',
                'api_base' => '/movies',
                'morph_alias' => 'movie',
                // შეთანხმებული ქცევა: რეგისტრაცია ღიაა, მოდულები კი მოთხოვნით ირთვება —
                // ახალი ანგარიში „ცარიელია" და ადმინს სთხოვს ჩართვას (ApprovalRequest).
                'enabled_by_default' => false,
                'sort_order' => 10,
            ],
            [
                'key' => 'series',
                'name_ka' => 'სერიალები',
                'name_en' => 'Series',
                'description_ka' => 'სერიალების კატალოგი სეზონებითა და ეპიზოდებით.',
                'description_en' => 'TV series catalog with seasons and episodes.',
                'icon' => 'Tv',
                'route_base' => '/series',
                'api_base' => '/series',
                'morph_alias' => 'series',
                // შეთანხმებული ქცევა: რეგისტრაცია ღიაა, მოდულები კი მოთხოვნით ირთვება —
                // ახალი ანგარიში „ცარიელია" და ადმინს სთხოვს ჩართვას (ApprovalRequest).
                'enabled_by_default' => false,
                'sort_order' => 20,
            ],
            [
                'key' => 'video',
                'name_ka' => 'ვიდეოები',
                'name_en' => 'Videos',
                'description_ka' => 'ვიდეოების ბმულები ნებისმიერი წყაროდან — YouTube, Vimeo, პირდაპირი ფაილი.',
                'description_en' => 'Video links from any source — YouTube, Vimeo, direct files.',
                'icon' => 'Video',
                'route_base' => '/videos',
                'api_base' => '/videos',
                'morph_alias' => 'video',
                'enabled_by_default' => false,
                'sort_order' => 30,
            ],
            [
                // 18+ — ცალკე მოდული, რომელსაც სუპერ-ადმინი კონკრეტულ user-ს რთავს (I5).
                // საკუთარი გვერდი არ აქვს: `video`-ს შიგნით ხსნის 18+ ჩანაწერებს.
                'key' => 'video_adult',
                'name_ka' => 'ვიდეოები 18+',
                'name_en' => 'Videos 18+',
                'description_ka' => 'სრულწლოვანთა კონტენტი ვიდეოების მოდულში. საჭიროებს „ვიდეოებს" და ასაკის დადასტურებას.',
                'description_en' => 'Adult content inside the videos module. Requires “Videos” and an age confirmation.',
                'icon' => 'Sparkles',
                'route_base' => '/videos',
                'api_base' => '/videos',
                'morph_alias' => null,
                'is_sensitive' => true,
                'enabled_by_default' => false,
                'sort_order' => 31,
            ],
        ];

        foreach ($modules as $m) {
            Module::updateOrCreate(['key' => $m['key']], $m);
        }
    }
}
