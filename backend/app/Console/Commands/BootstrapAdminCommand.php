<?php

namespace App\Console\Commands;

use App\Models\Module;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * პირველი super_admin-ის შექმნა (I4). არსებული single-user მონაცემები
 * სწორედ ამ ანგარიშს მიება (იხ. 2026_08_28_000002_add_user_ownership).
 */
class BootstrapAdminCommand extends Command
{
    protected $signature = 'mediary:bootstrap-admin
        {--name= : სახელი}
        {--email= : ელფოსტა}
        {--username= : მომხმარებელი}
        {--password= : პაროლი}
        {--promote : არსებული ელფოსტის მქონე მომხმარებელი გახადე super_admin}';

    protected $description = 'ქმნის პირველ სუპერ-ადმინს და ურთავს ყველა მოდულს';

    public function handle(): int
    {
        $email = $this->option('email') ?: $this->ask('ელფოსტა');
        $existing = User::where('email', $email)->first();

        if ($existing && ! $this->option('promote')) {
            $this->error("მომხმარებელი {$email} უკვე არსებობს. გამოიყენე --promote.");

            return self::FAILURE;
        }

        if ($existing) {
            $existing->update(['role' => 'super_admin', 'is_active' => true]);
            $this->attachModules($existing);
            $this->info("✔ {$email} გახდა super_admin (id={$existing->id}).");

            return self::SUCCESS;
        }

        $name = $this->option('name') ?: $this->ask('სახელი');
        $username = $this->option('username') ?: $this->ask('მომხმარებელი (username)');
        $password = $this->option('password') ?: $this->secret('პაროლი');

        $validator = Validator::make(
            compact('name', 'email', 'username', 'password'),
            [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email', 'unique:users,email'],
                'username' => ['required', 'string', 'max:255', 'unique:users,username'],
                'password' => ['required', Password::min(8)],
            ]
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'username' => $username,
            'password' => Hash::make($password),
        ]);
        $user->forceFill(['role' => 'super_admin', 'is_active' => true])->save();

        $this->attachModules($user);

        $this->info("✔ სუპერ-ადმინი შეიქმნა: {$user->email} (id={$user->id}).");
        $this->line('  შემდეგი ნაბიჯი: php artisan migrate  — არსებული ჩანაწერები ამ ანგარიშს მიება.');

        return self::SUCCESS;
    }

    private function attachModules(User $user): void
    {
        if (! Module::exists()) {
            $this->warn('modules ცხრილი ცარიელია — გაუშვი `php artisan db:seed --class=ModulesSeeder`.');

            return;
        }

        $ids = Module::pluck('id')->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])->all();
        $user->modules()->syncWithoutDetaching($ids);
    }
}
