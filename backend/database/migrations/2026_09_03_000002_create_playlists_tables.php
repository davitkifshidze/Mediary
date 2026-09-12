<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * პლეილისტები (Tasks 15) — მუსიკა ვიდეოების ქვეშ, მინიმალური ვერსია.
 *
 * ⚠️ **ცალკე „სიმღერის" ცხრილი განზრახ არ იქმნება.** სიმღერას სჭირდება
 * სახელი, ფოტო და YouTube-ის ბმული — ეს სამივე `videos`-ს უკვე აქვს
 * (`title`, `thumbnail_path`, `url`), თანაც `VideoUrl`-ის allowlist-ით,
 * კვოტის მრიცხველითა და ძებნით ერთად. ამიტომ სიმღერა = `videos`-ის რიგი,
 * ხოლო ახალი მხოლოდ **პლეილისტი** და მისი pivot-ია.
 *
 * `visibility` პლეილისტზეც არის და არა მარტო ვიდეოზე: Tasks 16-ის მიხედვით
 * **პლეილისტი გაზიარებადი ერთეულია** („საერთო პლეილისტები" დამთხვევებში).
 *
 * თანმიმდევრობა ორ დონეზეა: `playlists.sort_order` — პლეილისტების რიგი,
 * `playlist_video.sort_order` — სიმღერების რიგი კონკრეტულ პლეილისტში.
 * ერთი და იგივე ვიდეო რამდენიმე პლეილისტში შეიძლება იყოს, თითოეულში
 * საკუთარი პოზიციით — ამიტომ რიგი pivot-ზეა და არა `videos`-ზე.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('playlists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedInteger('sort_order')->default(0);
            // Tasks 16.5 — ყოველ ახალ ცხრილს ხილვადობა თავიდანვე
            $table->string('visibility', 20)->default('private');
            $table->timestamps();

            // ერთ ანგარიშზე ორი ერთნაირი სახელი აზრს არ აქვს
            $table->unique(['user_id', 'name']);
            $table->index(['user_id', 'sort_order']);
            $table->index('visibility');
        });

        Schema::create('playlist_video', function (Blueprint $table) {
            $table->id();
            $table->foreignId('playlist_id')->constrained()->cascadeOnDelete();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['playlist_id', 'video_id']);
            $table->index(['playlist_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('playlist_video');
        Schema::dropIfExists('playlists');
    }
};
