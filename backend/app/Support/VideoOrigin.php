<?php

namespace App\Support;

use App\Models\Course;
use App\Models\Video;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * **საიდან მოვიდა ვიდეო** — რომელი მოდულის რომელი ჩანაწერიდან.
 *
 * წყარო ის ჩანაწერია, რომლის ფანჯრიდანაც ვიდეო ვიდეოებში დაემატა (ბუკმარკი,
 * თამაში, ფილმი, მსახიობი…), ან კურსი, რომლის ფლეილისტიდანაც შეიქმნა. ბარათი
 * და ფანჯარა ამით წერს „წყარო: ბუკმარკი — <სახელი> →".
 *
 * ⚠️ **ტიპების სია გალერეის მშობლებისაა + კურსი**: ვიდეოს ვებძებნა სწორედ იმ
 * ჩანაწერებიდან იხსნება, რომლებსაც გალერეა აქვთ (`GalleryParent`).
 *
 * ⚠️ **წყარო ჩვეულებრივი query-ით იძებნება** (`owner` · `trash` · `record_lock`
 * scope-ებით): სხვისი, ურნაში მყოფი ან დამალული ჩანაწერის სახელი არ გადის —
 * ბარათზე მაშინ მხოლოდ მოდული წერია.
 */
final class VideoOrigin
{
    public const COURSE = 'course';

    /** @return list<string> */
    public static function keys(): array
    {
        return [...GalleryParent::keys(), self::COURSE];
    }

    /** ვალიდაციის წესი — `in:cast_member,movie,…,course` */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::keys());
    }

    public static function query(string $type): ?Builder
    {
        return $type === self::COURSE ? Course::query() : GalleryParent::query($type);
    }

    /** წყაროს ჩანაწერი — მხოლოდ ჩემი (მსახიობი გლობალური ლექსიკონია) */
    public static function find(string $type, int $id): ?Model
    {
        return self::query($type)?->whereKey($id)->first();
    }

    /**
     * სიის ვიდეოებს წყაროს ბარათი ერთად ებმება — თითო ტიპზე ერთი query.
     *
     * @param  iterable<Video>  $videos
     */
    public static function attach(iterable $videos): void
    {
        $byType = [];

        foreach ($videos as $video) {
            if ($video->origin_type && $video->origin_id) {
                $byType[$video->origin_type][] = (int) $video->origin_id;
            }
        }

        $records = [];
        foreach ($byType as $type => $ids) {
            foreach (self::query((string) $type)?->whereKey(array_unique($ids))->get() ?? [] as $record) {
                $records[$type.':'.$record->getKey()] = $record;
            }
        }

        foreach ($videos as $video) {
            $video->setRelation('originCard', self::build($video, $records[$video->origin_type.':'.$video->origin_id] ?? null));
        }
    }

    /**
     * ერთი ვიდეოს წყარო (`VideoResource`). სიაში წინასწარ მიბმულს იყენებს,
     * ცალკე ვიდეოზე (შექმნა, გახსნა) თვითონ პოულობს.
     *
     * @return array{kind: string, id: int, module: ?string, title: ?string, title_ka: ?string}|null
     */
    public static function card(Video $video): ?array
    {
        if ($video->relationLoaded('originCard')) {
            return $video->getRelation('originCard');
        }

        if (! $video->origin_type || ! $video->origin_id) {
            return null;
        }

        return self::build($video, self::find($video->origin_type, (int) $video->origin_id));
    }

    /** @return array{kind: string, id: int, module: ?string, title: ?string, title_ka: ?string}|null */
    private static function build(Video $video, ?Model $record): ?array
    {
        $type = $video->origin_type;

        if (! $type || ! $video->origin_id) {
            return null;
        }

        return [
            // მსახიობი ინტერფეისში `actor`-ია (გალერეის `owner.kind`-ის იგივე ფორმა)
            'kind' => $type === GalleryParent::ACTOR ? 'actor' : $type,
            'id' => (int) $video->origin_id,
            'module' => $type === self::COURSE ? self::COURSE : GalleryParent::module($type),
        ] + RecordTitle::of($record);
    }
}
