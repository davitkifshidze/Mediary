<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AuditLog;
use App\Models\Module;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Storage\StorageMeter;
use App\Support\PublicDomain;
use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * ავტორიზაცია SPA cookie რეჟიმში (Sanctum stateful) — ტოკენი ფრონტზე არ ინახება,
 * სესია httpOnly ქუქშია. login-ამდე ფრონტი იძახებს GET /sanctum/csrf-cookie-ს.
 */
class AuthController extends Controller
{
    public function __construct(private StorageMeter $meter, private AuditLogger $audit) {}

    /**
     * რეგისტრაცია ღიაა (შეთანხმებული), მაგრამ ანგარიში „ცარიელი" იქმნება:
     * ეძლევა მხოლოდ `enabled_by_default` მოდულები, დანარჩენს ითხოვს ადმინისგან.
     * პირველი რეგისტრირებული ავტომატურად super_admin-ია (bootstrap).
     */
    public function register(Request $request)
    {
        if (! config('mediary.allow_registration')) {
            return response()->json(['message' => 'registration_disabled'], 403);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'first_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $isFirst = User::count() === 0;

        $user = new User;
        $user->fill($data);
        $user->password = Hash::make($data['password']);
        $user->assignRole($isFirst ? 'super_admin' : 'user');
        $user->is_active = true;
        $user->save();

        $defaults = Module::where('is_active', true)
            ->when(! $isFirst, fn ($q) => $q->where('enabled_by_default', true))
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();
        $user->modules()->sync($defaults);

        Auth::login($user, remember: true);
        $this->regenerateSession($request);

        // §4.1 — შესვლა/გასვლა მოდელის მოვლენა არ არის, ე.ი. ცხადად იწერება
        $this->audit->log(AuditLog::ACTION_REGISTER, [
            'module' => 'account',
            'subject_type' => 'user',
            'subject_id' => $user->id,
            'subject_label' => $user->username,
        ]);

        return (new UserResource($user->load('modules', 'role')))->response()->setStatusCode(201);
    }

    /** login — email ან username */
    public function login(Request $request)
    {
        $data = $request->validate([
            'login' => ['required', 'string'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $field = filter_var($data['login'], FILTER_VALIDATE_EMAIL) ? 'email' : 'username';

        if (! Auth::attempt([$field => $data['login'], 'password' => $data['password']], $request->boolean('remember', true))) {
            throw ValidationException::withMessages(['login' => __('auth.failed')]);
        }

        if (! Auth::user()->is_active) {
            Auth::logout();
            throw ValidationException::withMessages(['login' => 'account_disabled']);
        }

        $this->regenerateSession($request);

        $this->audit->log(AuditLog::ACTION_LOGIN, [
            'module' => 'account',
            'subject_type' => 'user',
            'subject_id' => Auth::id(),
            'subject_label' => Auth::user()->username,
        ]);

        return new UserResource(Auth::user()->load('modules', 'role'));
    }

    public function logout(Request $request)
    {
        // ⚠️ **სესიის გაუქმებამდე** — შემდეგ `Auth::user()` ცარიელია და
        // ლოგი „ვინ გავიდა"-ს ვეღარ იტყოდა
        $this->audit->log(AuditLog::ACTION_LOGOUT, [
            'module' => 'account',
            'subject_type' => 'user',
            'subject_id' => $request->user()?->id,
            'subject_label' => $request->user()?->username,
        ]);

        Auth::guard('web')->logout();

        // ⚠️ იგივე დაცვა, რაც `regenerateSession()`-ს — იხ. მისი შენიშვნა
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }

    /**
     * სესიის ID-ის განახლება შესვლისას — **session fixation**-ის დაცვა.
     *
     * ⚠️ **`hasSession()` აუცილებელია** (აუდიტი 2026-09-14): `/api/*`-ს სესია
     * მხოლოდ მაშინ აქვს, როცა რექვესთი **stateful** დომენიდან მოვიდა
     * (`EnsureFrontendRequestsAreStateful` + `SANCTUM_STATEFUL_DOMAINS`).
     * სხვა შემთხვევაში `$request->session()` **`RuntimeException`-ს** აგდებდა,
     * ე.ი. შესვლა/რეგისტრაცია **500**-ს აბრუნებდა სუფთა პასუხის ნაცვლად —
     * და `SANCTUM_STATEFUL_DOMAINS`-ის არასწორი კონფიგურაცია ყველაზე
     * ძნელად ამოსაცნობ შეცდომად იქცეოდა.
     *
     * ⚠️ სწორედ ეს აფერხებდა ავტორიზაციის ტესტის დაწერას: `postJson()`
     * stateful არ არის, ე.ი. `/auth/register` ტესტიდან ყოველთვის 500 იყო.
     *
     * სესიის არქონისას განახლებას აზრი არ აქვს — დასაცავი არაფერია.
     */
    private function regenerateSession(Request $request): void
    {
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }
    }

    /** მიმდინარე მომხმარებელი — ფრონტის bootstrap-ისთვის */
    public function me(Request $request)
    {
        return new UserResource($request->user()->load('modules', 'role'));
    }

    /** პროფილი — სახელი/გვარი/username/email + ავატარი (multipart, _method=PATCH) */
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'first_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'username' => ['sometimes', 'required', 'string', 'max:255', 'alpha_dash', Rule::unique('users', 'username')->ignore($user->id)],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'avatar' => ['nullable', 'image', 'max:4096'],
            'remove_avatar' => ['nullable', 'boolean'],
            // Tasks 16.1 — საჯარო პროფილი. `bio` და გადამრთველი აქვეა, რადგან
            // ორივე „ჩემი პროფილია" და ერთსა და იმავე ფორმაში ივსება.
            'bio' => ['nullable', 'string', 'max:1000'],
            'profile_visibility' => ['nullable', Rule::in(PublicDomain::VALUES)],
        ]);

        foreach (['name', 'first_name', 'last_name', 'username', 'email', 'bio'] as $f) {
            if (array_key_exists($f, $data)) {
                $user->{$f} = $data[$f] ?: null;
            }
        }

        // ⚠️ ცალკე: ცარიელი მნიშვნელობა აქ „არ შეცვალო"-ს ნიშნავს და არა `private`-ს —
        // multipart-ის გამო ველი შეიძლება საერთოდ არ მოვიდეს.
        if (! empty($data['profile_visibility'])) {
            $user->profile_visibility = $data['profile_visibility'];
        }

        // 17.1 — ავატარიც კვოტაზე გადის (`deleteUpload`/`storeUpload` მრიცხველს თვითონ ცვლის)
        if ($request->boolean('remove_avatar')) {
            $this->meter->deleteUpload($user->id, $user->avatar_path);
            $user->avatar_path = null;
        }

        if ($request->hasFile('avatar')) {
            $this->meter->deleteUpload($user->id, $user->avatar_path);
            $user->avatar_path = $this->meter->storeUpload($user, $request->file('avatar'), StorageFolder::AVATARS);
        }

        $user->save();

        return new UserResource($user->load('modules', 'role'));
    }

    public function updatePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        if (! Hash::check($data['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages(['current_password' => 'current_password_wrong']);
        }

        $request->user()->forceFill(['password' => Hash::make($data['password'])])->save();

        /* ⚠️ **სხვა სესიებიც უქმდება** (აუდიტი 2026-09-14). პაროლი სწორედ
           იმიტომ იცვლება, რომ ძველი კომპრომეტირებულია — ძველი სესია კი
           `SESSION_LIFETIME`-ის ბოლომდე ცოცხალი რჩებოდა.
           ⚠️ მხოლოდ სესიის არსებობისას: `/api/*`-ს ის მხოლოდ stateful
           დომენიდან აქვს (იგივე წესი, რაც `regenerateSession()`-ს). */
        if ($request->hasSession()) {
            Auth::logoutOtherDevices($data['password']);
        }

        return response()->noContent();
    }

    /** per-user პარამეტრები (E1 — localStorage-ის ნაცვლად ბაზაში) */
    public function updateSettings(Request $request)
    {
        /* ⚠️ **ზომას ჭერი სჭირდება** (აუდიტი 2026-09-14): `settings` JSON
           სვეტია, ყოველ `/auth/me`-ზე იკითხება და `AuditObserver`-ის გავლით
           **მთლიანად** ეწერება `audit_logs.new_values`-შიც — ე.ი. ერთი დიდი
           მოთხოვნა ორივეს აბერებდა. `UserSettings`-ს ცნობილი გასაღებების
           სია ისედაც აქვს, ე.ი. ასეულზე მეტი აქ ვერ იქნება. */
        $data = $request->validate(['settings' => ['required', 'array', 'max:200']]);

        // `settings` fillable-ში არ არის (მასობრივი შევსება არ გვინდა) — forceFill
        $request->user()->forceFill(['settings' => $data['settings']])->save();

        return response()->json(['settings' => $request->user()->settings]);
    }
}
