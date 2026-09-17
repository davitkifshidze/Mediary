<?php

use App\Http\Middleware\EnsureAdminAccess;
use App\Http\Middleware\EnsureModuleEnabled;
use App\Http\Middleware\EnsureModulePermission;
use App\Http\Middleware\EnsureRecordOwnership;
use App\Http\Middleware\EnsureSuperAdmin;
use App\Http\Middleware\SetSecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // SPA cookie ავტორიზაცია: stateful დომენებიდან (SANCTUM_STATEFUL_DOMAINS)
        // მოსულ /api/* რექვესთს სესია + CSRF ემატება, დანარჩენი token-ით მუშაობს.
        $middleware->statefulApi();

        /*
         * **მოთხოვნების ჭერი მთელ `/api`-ზე** (აუდიტი 2026-09-14, §A1).
         *
         * ⚠️ აქამდე `throttle` პროექტში **არსად არ იყო** — ღია რეგისტრაციის
         * პირობებში ეს იმას ნიშნავდა, რომ პაროლის ბრუტფორსს არაფერი აჩერებდა.
         *
         * ⚠️ ლიმიტი თვითონ `AppServiceProvider::rateLimiters()`-შია და არა აქ:
         * ის **ანგარიშზეა** დაყრდნობილი (`$request->user()`) და არა IP-ზე,
         * ე.ი. ჭერის განსაზღვრას რექვესთის კონტექსტი სჭირდება. ცალკეული
         * ძვირი endpoint-ები ამის **გარდა** თავის ჭერს იღებენ
         * (`throttle:web-search`, `throttle:translate`, …) — ისინი
         * `routes/api.php`-შია და გლობალურს ცვლიან კი არა, ემატებიან.
         */
        $middleware->throttleApi('api');

        /*
         * **მფლობელობის მეორე ფენა** (აუდიტი 2026-09-14, §A5).
         *
         * ⚠️ **`append` და არა `prepend`**: შემოწმებას route-ზე მიბმული
         * **მოდელები** სჭირდება, ისინი კი `SubstituteBindings`-მდე ჯერ კიდევ
         * სტრიქონებია — ადრე გაშვებულ middleware-ს შესამოწმებელი არაფერი
         * ექნებოდა და კარიბჭე ჩუმად ცარიელი იქნებოდა.
         *
         * ⚠️ **ჯგუფზე დგას და არა კონტროლერებში.** ჩვიდმეტი policy კლასი
         * სწორედ იმიტომ იდო წლის განმავლობაში გამოუძახებელი, რომ ცხადი
         * `$this->authorize()` ყოველ ახალ endpoint-ზე ხელახლა უნდა
         * დაწერილიყო — იგივე მიზეზი, რის გამოც აუდიტ-ლოგი observer-ის ერთი
         * ციკლით ებმევა.
         */
        $middleware->api(append: [EnsureRecordOwnership::class]);

        // SEC-04 — `nosniff` ყოველ პასუხზე; ⚠️ გლობალურად (იხ. კლასის docblock)
        $middleware->append(SetSecurityHeaders::class);

        $middleware->alias([
            'module' => EnsureModuleEnabled::class,
            // მოდულის შიდა CRUD უფლება (Tasks 1.6) — `module`-ი წვდომაა, ეს კი უფლება
            'permission' => EnsureModulePermission::class,
            // ადმინის სექციაზე წვდომა როლიდან (Tasks 1.6) — `super_admin` ისედაც გადის
            'admin_access' => EnsureAdminAccess::class,
            'super_admin' => EnsureSuperAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        /*
         * ⚠️ **PHP-ის ატვირთვის ჭერი ჩუმად კლავდა მოთხოვნას** (2026-09-14).
         * `post_max_size`-ზე დიდი სხეული PHP-მ **მთლიანად** ჩამოაგდო: `$_POST`
         * და `$_FILES` ცარიელი მოდიოდა, ე.ი. ვალიდაცია 422-ს წერდა „ფაილი
         * სავალდებულოა"-ზე — მაშინ როცა ფაილი ნამდვილად შერჩეული იყო.
         * ზუსტად ასე ვარდებოდა დიდი PDF და რამდენიმე ფოტო ერთად.
         *
         * ⚠️ **ეს ცალკე კოდია და არა კვოტის 413** (`storage_quota_exceeded`):
         * ორი სრულიად სხვადასხვა ზღვარია — სერვერის ერთი მოთხოვნის ჭერი და
         * ანგარიშის საცავი. ერთ შეტყობინებაში რომ გაერთიანებულიყო, „ადგილი
         * აღარ გაქვს" დაეწერებოდა იმას, ვისაც ადგილი ბევრი აქვს.
         *
         * ⚠️ ჭერი **თვითონ ვერსად წერია** — `ini_get()`-იდან მოდის, თორემ
         * `php.ini`-ის შეცვლისთანავე ტექსტი მოტყუებას დაიწყებდა.
         */
        $exceptions->render(function (PostTooLargeException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            /* ⚠️ `message` **არის** მანქანური კოდი — `lib/errors.ts` სწორედ მას
               კითხულობს (`storage_quota_exceeded`-ის კონვენცია). */
            return response()->json([
                'message' => 'upload_too_large',
                'limit' => ini_get('post_max_size'),
                'file_limit' => ini_get('upload_max_filesize'),
            ], 413);
        });
    })->create();
