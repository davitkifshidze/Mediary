<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Module;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * ავტორიზაცია SPA cookie რეჟიმში (Sanctum stateful) — ტოკენი ფრონტზე არ ინახება,
 * სესია httpOnly ქუქშია. login-ამდე ფრონტი იძახებს GET /sanctum/csrf-cookie-ს.
 */
class AuthController extends Controller
{
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
        $user->role = $isFirst ? 'super_admin' : 'user';
        $user->is_active = true;
        $user->save();

        $defaults = Module::where('is_active', true)
            ->when(! $isFirst, fn ($q) => $q->where('enabled_by_default', true)->where('is_sensitive', false))
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();
        $user->modules()->sync($defaults);

        Auth::login($user, remember: true);
        $request->session()->regenerate();

        return (new UserResource($user->load('modules')))->response()->setStatusCode(201);
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
            throw ValidationException::withMessages(['login' => 'ანგარიში გათიშულია — მიმართე ადმინისტრატორს.']);
        }

        $request->session()->regenerate();

        return new UserResource(Auth::user()->load('modules'));
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    /** მიმდინარე მომხმარებელი — ფრონტის bootstrap-ისთვის */
    public function me(Request $request)
    {
        return new UserResource($request->user()->load('modules'));
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
        ]);

        foreach (['name', 'first_name', 'last_name', 'username', 'email'] as $f) {
            if (array_key_exists($f, $data)) {
                $user->{$f} = $data[$f] ?: null;
            }
        }

        if ($request->boolean('remove_avatar') && $user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
            $user->avatar_path = null;
        }

        if ($request->hasFile('avatar')) {
            if ($user->avatar_path) {
                Storage::disk('public')->delete($user->avatar_path);
            }
            $user->avatar_path = $request->file('avatar')->store('avatars', 'public');
        }

        $user->save();

        return new UserResource($user->load('modules'));
    }

    public function updatePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        if (! Hash::check($data['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages(['current_password' => 'მიმდინარე პაროლი არასწორია.']);
        }

        $request->user()->update(['password' => Hash::make($data['password'])]);

        return response()->noContent();
    }

    /** per-user პარამეტრები (E1 — localStorage-ის ნაცვლად ბაზაში) */
    public function updateSettings(Request $request)
    {
        $data = $request->validate(['settings' => ['required', 'array']]);

        // `settings` fillable-ში არ არის (მასობრივი შევსება არ გვინდა) — forceFill
        $request->user()->forceFill(['settings' => $data['settings']])->save();

        return response()->json(['settings' => $request->user()->settings]);
    }
}
