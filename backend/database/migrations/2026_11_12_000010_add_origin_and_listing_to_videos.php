<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ვიდეოს წარმოშობა და „ვიდეოების სიაშია თუ არა".**
 *
 * ყოველ ვიდეოს ერთი სახლი აქვს. ვიდეოების მოდულში ჩანს ის, რაც ბმულით ხელით
 * დაემატა, და ის, რაც სხვა მოდულიდან ცხადად გადმოვიდა („ვიდეოებში დამატება") —
 * ასეთს წყარო აწერია (`origin_type` + `origin_id`: რომელი მოდულის რომელი
 * ჩანაწერიდან). კურსის ფლეილისტიდან შექმნილი ვიდეო კურსში ცხოვრობს
 * (`listed = false`) და ვიდეოებში მხოლოდ „გადატანით" ხვდება.
 *
 * ⚠️ `origin_id`-ს უცხო გასაღები არ აქვს: წყარო ნებისმიერი მოდულის ჩანაწერია
 * (პოლიმორფული), წაშლილ წყაროზე კი ვიდეო რჩება — უბრალოდ წარწერა ქრება.
 *
 * არსებული რიგები: ფლეილისტის პოზიციის მქონე კურსის ვიდეო სიიდან გადის
 * (კურსში რჩება, არაფერი იშლება); ხელით მიბმული (პოზიციის გარეშე) — რჩება.
 * წყარო აღდგება, სადაც შეიძლება: კურსი `course_id`-დან, ჩანაწერი — იმავე
 * ბმულის გალერეის ვიდეოდან.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->string('origin_type', 60)->nullable()->after('course_id');
            $table->unsignedBigInteger('origin_id')->nullable()->after('origin_type');
            $table->boolean('listed')->default(true)->after('origin_id');
            $table->index(['user_id', 'listed']);
        });

        DB::table('videos')->whereNotNull('course_id')->update([
            'origin_type' => 'course',
            'origin_id' => DB::raw('course_id'),
        ]);
        DB::table('videos')->whereNotNull('course_id')->where('sort_order', '>', 0)->update(['listed' => false]);

        $pairs = DB::table('videos as v')
            ->join('gallery_videos as g', function ($join) {
                $join->on('g.url', '=', 'v.url')->on('g.user_id', '=', 'v.user_id');
            })
            ->whereNull('v.origin_type')
            ->whereNotNull('g.videoable_type')
            ->orderBy('g.id')
            ->get(['v.id as video_id', 'g.videoable_type', 'g.videoable_id']);

        $done = [];
        foreach ($pairs as $pair) {
            // ერთი ბმული რამდენიმე ჩანაწერზეც შეიძლება ეკიდოს — პირველი (უძველესი) ითვლება
            if (isset($done[$pair->video_id])) {
                continue;
            }
            $done[$pair->video_id] = true;

            DB::table('videos')->where('id', $pair->video_id)->update([
                'origin_type' => $pair->videoable_type,
                'origin_id' => $pair->videoable_id,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'listed']);
            $table->dropColumn(['origin_type', 'origin_id', 'listed']);
        });
    }
};
