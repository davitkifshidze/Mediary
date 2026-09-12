<?php

use App\Models\Module;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **მოდული „ჩანაწერები"** (Tasks §13) — საჭირო ინფორმაცია + შეხსენებები.
 *
 * ⚠️ **მოდულის key `note`-ია, ცხრილი კი `note_entries`.** 2026-09-03-ის წესით
 * უნივერსალური `notes` ცხრილი აღარ არსებობს (თითო სექციას თავისი აქვს:
 * `video_notes`, `book_notes`…), ე.ი. სახელი `notes` **დაკავებულია აზრობრივად** —
 * ის „სხვა ჩანაწერზე მიმაგრებულ ჩანიშვნას" ნიშნავს და არა დამოუკიდებელ ერთეულს.
 *
 * ხუთი ცხრილი:
 *  · `note_categories` — **per-user ლექსიკონი** („რას ეხება", §13.1);
 *  · `note_entries` — ჩანაწერი; `visibility` თავიდანვე (16.5);
 *  · `note_entry_files` — სქრინშოტი/ფოტო/ვიდეო/დოკუმენტი (§13.1, კვოტაზე გადის);
 *  · `note_reminders` — შეხსენებები (§13.2);
 *  · `note_notifications` — მიწოდების რიგი და ჟურნალი (§13.3).
 *
 * ⚠️ **`visibility` აქ სხვა მნიშვნელობისაა** (§13.1): ეს მოდული პირად
 * დოკუმენტებს ინახავს, ე.ი. `private` არა მხოლოდ default-ია — საჯარო პროფილზე
 * მოდული **საერთოდ არ გამოჩნდება** და „დამთხვევებში" არასდროს მონაწილეობს (16.1).
 *
 * ⚠️ **შეხსენების დროს სასაათე სარტყელი თან ახლავს** (`timezone`). აპლიკაცია
 * UTC-ზე მუშაობს (`config/app.php`), ე.ი. „ყოველ დღე 09:00" სარტყლის გარეშე
 * თბილისში 13:00-ზე გაისროდა. `once` რეჟიმი აბსოლუტურ დროს ინახავს
 * (`remind_at`, UTC), დანარჩენები კი `time_of_day`+`timezone`-ს — და
 * `NoteReminder::computeNextAt()` ერთადერთი ადგილია, სადაც ეს ორი ერთდება.
 */
return new class extends Migration
{
    /** საწყისი კატეგორიები — იგივე სია `NoteCategory::DEFAULTS`-შია */
    private const CATEGORIES = [
        ['key' => 'documents', 'name_ka' => 'დოკუმენტები', 'name_en' => 'Documents', 'icon' => 'FileText'],
        ['key' => 'instructions', 'name_ka' => 'ინსტრუქციები', 'name_en' => 'Instructions', 'icon' => 'ListChecks'],
        ['key' => 'ideas', 'name_ka' => 'იდეები', 'name_en' => 'Ideas', 'icon' => 'Lightbulb'],
        ['key' => 'work', 'name_ka' => 'სამსახური', 'name_en' => 'Work', 'icon' => 'Briefcase'],
        ['key' => 'personal', 'name_ka' => 'პირადი', 'name_en' => 'Personal', 'icon' => 'User'],
        ['key' => 'shopping', 'name_ka' => 'შესყიდვები', 'name_en' => 'Shopping', 'icon' => 'ShoppingCart'],
    ];

    public function up(): void
    {
        Schema::create('note_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key', 60);
            $table->string('name_ka');
            $table->string('name_en');
            $table->string('icon', 60)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'key']);
        });

        Schema::create('note_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // §13.1: სახელი · რას ეხება (კატეგორია + ტეგები) · აღწერა „რისთვისაა"
            $table->string('title');
            $table->foreignId('category_id')->nullable()->constrained('note_categories')->nullOnDelete();
            $table->json('tags')->nullable();
            $table->text('description')->nullable();

            // რამდენიმე ბმული — JSON მასივი `[{label, url}]` (ბორდგეიმის მაღაზიების წესი)
            $table->json('links')->nullable();

            // „როდისთვის მჭირდება" — deadline
            $table->dateTime('due_at')->nullable();

            // ღია | დასრულებული | დაარქივებული
            $table->string('status', 20)->default('open');
            $table->boolean('is_favorite')->default(false);

            // ⚠️ §13: აქ პირადი დოკუმენტებია — `private` მკაცრი წესია და არა უბრალოდ default
            $table->string('visibility', 20)->default('private');
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'is_favorite']);
            $table->index(['user_id', 'category_id']);
            $table->index(['user_id', 'due_at']);
            $table->index('visibility');
        });

        Schema::create('note_entry_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('note_entry_id')->constrained()->cascadeOnDelete();
            // სქრინშოტი/ფოტო = image, ვიდეო = video, დანარჩენი = doc (§13.1)
            $table->enum('kind', ['image', 'video', 'doc'])->default('doc');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'kind']);
            $table->index(['note_entry_id', 'sort_order']);
        });

        Schema::create('note_reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('note_entry_id')->constrained()->cascadeOnDelete();

            // ერთჯერადი | ინტერვალი | ყოველდღიური | ყოველკვირეული (§13.2)
            $table->string('mode', 20)->default('once');
            // `once` — აბსოლუტური მომენტი UTC-ში
            $table->dateTime('remind_at')->nullable();
            // ⚠️ პერიოდი **ველია და არა ჩაშენებული კონსტანტა** (§13.2)
            $table->unsignedInteger('interval_minutes')->nullable();
            // `daily`/`weekly` — დღის დრო + კვირის დღე (0 = კვირა, ISO-ს გარეშე, Carbon-ის წესი)
            $table->time('time_of_day')->nullable();
            $table->unsignedTinyInteger('weekday')->nullable();
            // ⚠️ სარტყელი ჩანაწერზეა — აპლიკაცია UTC-ია, user კი არა
            $table->string('timezone', 64)->default('UTC');

            // ბრაუზერი | ტელეგრამი | ელფოსტა (§13.3)
            $table->json('channels')->nullable();
            $table->boolean('is_active')->default(true);

            // ⚠️ **ერთადერთი ველი, რომელსაც დისპეტჩერი ეკითხება** — ინდექსიც მასზეა
            $table->dateTime('next_at')->nullable();
            $table->dateTime('last_sent_at')->nullable();
            $table->unsignedInteger('sent_count')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'next_at']);
            $table->index(['user_id', 'note_entry_id']);
        });

        Schema::create('note_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('note_entry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('note_reminder_id')->nullable()->constrained()->nullOnDelete();

            $table->string('channel', 20);              // browser | telegram | email
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('status', 20)->default('pending');  // pending | sent | failed
            $table->text('error')->nullable();

            $table->dateTime('scheduled_for');
            $table->dateTime('sent_at')->nullable();
            // ბრაუზერის არხზე „წაკითხული" = user-მა შეტყობინება ნახა
            $table->dateTime('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'channel', 'read_at']);
            $table->index(['user_id', 'status']);
        });

        $this->seedCategories();

        Module::updateOrCreate(['key' => 'note'], [
            'name_ka' => 'ჩანაწერები',
            'name_en' => 'Notes',
            'description_ka' => 'საჭირო ინფორმაცია ერთ ადგილას — ბმულები, ფაილები, ვადები და შეხსენებები.',
            'description_en' => 'Everything you need to remember — links, files, deadlines and reminders.',
            'icon' => 'NotebookPen',
            'route_base' => '/notes',
            'api_base' => '/notes',
            'morph_alias' => 'note',
            'enabled_by_default' => false,
            // ბორდგეიმები 39-ზეა, გალერეა 40-ზე
            'sort_order' => 41,
        ]);
    }

    /** არსებულ ანგარიშებს საწყისი ლექსიკონი (ლენივი შევსებაც არსებობს) */
    private function seedCategories(): void
    {
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::CATEGORIES as $i => $category) {
                DB::table('note_categories')->insert($category + [
                    'user_id' => $userId,
                    'sort_order' => $i + 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Module::where('key', 'note')->delete();

        Schema::dropIfExists('note_notifications');
        Schema::dropIfExists('note_reminders');
        Schema::dropIfExists('note_entry_files');
        Schema::dropIfExists('note_entries');
        Schema::dropIfExists('note_categories');
    }
};
