<?php

namespace Database\Seeders;

use App\Models\Genre;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class GenresSeeder extends Seeder
{
    /** სრული ჟანრების სია ორ ენაზე (slug-ით ვამთხვევთ არსებულს) */
    public function run(): void
    {
        // [tmdb_id|null, name_en, name_ka]
        $genres = [
            [28, 'Action', 'მოქმედება'],
            [12, 'Adventure', 'სათავგადასავლო'],
            [16, 'Animation', 'ანიმაცია'],
            [35, 'Comedy', 'კომედია'],
            [80, 'Crime', 'კრიმინალური'],
            [99, 'Documentary', 'დოკუმენტური'],
            [18, 'Drama', 'დრამა'],
            [10751, 'Family', 'საოჯახო'],
            [14, 'Fantasy', 'ფენტეზი'],
            [36, 'History', 'ისტორიული'],
            [27, 'Horror', 'საშინელება'],
            [10402, 'Music', 'მუსიკალური'],
            [9648, 'Mystery', 'მისტიკა'],
            [10749, 'Romance', 'რომანტიკა'],
            [878, 'Science Fiction', 'სამეცნიერო ფანტასტიკა'],
            [10770, 'TV Movie', 'სატელევიზიო ფილმი'],
            [53, 'Thriller', 'თრილერი'],
            [10752, 'War', 'საომარი'],
            [37, 'Western', 'ვესტერნი'],
            // დამატებითი (TMDB-ს გარეშე)
            [null, 'Erotica', 'ეროტიკა'],
            [null, 'Biography', 'ბიოგრაფია'],
            [null, 'Sport', 'სპორტული'],
            [null, 'Musical', 'მიუზიკლი'],
            [null, 'Superhero', 'სუპერგმირული'],
            [null, 'Anime', 'ანიმე'],
            [null, 'Noir', 'ნუარი'],
            [null, 'Disaster', 'კატასტროფა'],
            [null, 'Detective', 'დეტექტივი'],
            [null, 'Melodrama', 'მელოდრამა'],
            [null, 'Short', 'მოკლემეტრაჟიანი'],
            [null, 'Psychological', 'ფსიქოლოგიური'],
        ];

        foreach ($genres as [$tmdbId, $en, $ka]) {
            $genre = Genre::updateOrCreate(
                ['slug' => Str::slug($en)],
                ['tmdb_id' => $tmdbId],
            );
            $genre->setTranslation('en', $en);
            $genre->setTranslation('ka', $ka);
        }
    }
}
