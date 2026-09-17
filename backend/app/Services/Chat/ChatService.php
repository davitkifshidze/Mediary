<?php

namespace App\Services\Chat;

use App\Models\Conversation;
use App\Models\ConversationNickname;
use App\Models\Message;
use App\Models\MessageHide;
use App\Models\MessageReaction;
use App\Models\User;
use App\Models\UserBlock;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * **ჩატის წესები ერთ ადგილას (Tasks §16.3).**
 *
 * კონტროლერი მხოლოდ HTTP-ს ამუშავებს; ვის ვის შეუძლია მიწეროს და როდის —
 * ეს ფაილი წყვეტს. ორი წესი, რომელთა გაფანტვა ძვირი დაჯდებოდა:
 *
 * ⚠️ **მიწერა მხოლოდ ორ საჯარო პროფილს შორის შეიძლება** (§16.3) — იგივე
 * კარიბჭე, რაც დამთხვევებს (§16.2). არასაჯარო მხარეზე პასუხი
 * **409 `profile_not_public`**-ია და არა 404: მდგომარეობა გამოსწორებადია
 * და user-მა უნდა იცოდეს, რა შეცვალოს.
 *
 * ⚠️ **დაბლოკვა ორივე მიმართულებით კრძალავს წერას.** დაბლოკვა ცალმხრივი
 * ფაქტია (A-მ B დაბლოკა), მაგრამ თუ მხოლოდ A-ს შევუზღუდავდით, B
 * განაგრძობდა წერას იმისთვის, ვინც სწორედ ამიტომ დაბლოკა.
 */
class ChatService
{
    public function __construct(private StorageMeter $meter) {}

    /**
     * ორ მხარეს შორის არსებული საუბარი, ან ახლის შექმნა.
     *
     * ⚠️ **გახსნაც ამოწმებს წესებს** და არა მხოლოდ გაგზავნა: სხვაგვარად
     * დაბლოკილი მხარე ცარიელ საუბარს მაინც გახსნიდა და „აქ რატომ ვერ
     * ვწერ"-ის ნაცვლად გაუგებარ ეკრანს დაინახავდა.
     *
     * ⚠️ **უნიკალურობას სქემა იცავს და არა ეს კითხვა** (Tasks BUG-07).
     * ადრე „არსებობს?" მხოლოდ `SELECT` იყო, ე.ი. ორი ტაბი (ან polling +
     * ხელით გახსნა) ერთსა და იმავე წამში ორივე „არა"-ს იღებდა და **ორი**
     * საუბარი იქმნებოდა — ძაფი სამუდამოდ იყოფოდა. ახლა `pair_key`-ს unique
     * ინდექსი აქვს: წაკითხვა სწრაფი გზაა, ჩაწერაზე კი ბაზა წყვეტს.
     */
    public function between(User $me, User $other): Conversation
    {
        $this->guard($me, $other);

        $key = Conversation::pairKey($me->id, $other->id);

        /* ⚠️ **`pair_key`-ით და აღარ სამმაგი `whereHas`-ით.** ძველი ფორმა
           („ორივე მონაწილეობს და მესამე არავინაა") სწორი იყო, მაგრამ მას
           შეზღუდვაში ვერ ჩასვამდი; ერთი სვეტი კი ინდექსდება. მიგრაციამდე
           შექმნილ ან ორზე მეტმონაწილიან რიგს `pair_key` არ აქვს — ის ისედაც
           1:1 საუბარი არ არის. */
        if ($existing = Conversation::where('pair_key', $key)->first()) {
            return $existing;
        }

        try {
            return DB::transaction(function () use ($me, $other, $key) {
                $conversation = Conversation::create(['pair_key' => $key]);
                $conversation->participants()->attach([$me->id, $other->id]);

                return $conversation->load('participants');
            });
        } catch (UniqueConstraintViolationException) {
            /* გვასწრეს. ⚠️ `INSERT` ინდექსზე დაელოდა მეორე ტრანზაქციის
               დასრულებას, ე.ი. ამ მომენტისთვის მონაწილეებიც უკვე ჩაწერილია —
               თორემ ცარიელ საუბარს დავაბრუნებდით. */
            return Conversation::where('pair_key', $key)->firstOrFail()->load('participants');
        }
    }

    /**
     * შეტყობინების გაგზავნა.
     *
     * ⚠️ **წესები აქაც მოწმდება.** საუბარი შეიძლება დაბლოკვამდე გაიხსნა —
     * ერთხელ გავლილი შემოწმება სამუდამო ნებართვა არ არის.
     */
    public function send(
        Conversation $conversation,
        User $author,
        string $type,
        ?string $body,
        array $attachment = [],
    ): Message {
        $other = $conversation->otherThan($author->id);
        if ($other) {
            $this->guard($author, $other);
        }

        $message = $conversation->messages()->create([
            'user_id' => $author->id,
            'type' => $type,
            'body' => $body,
            ...$attachment,
        ]);

        $conversation->forceFill(['last_message_at' => $message->created_at])->save();

        // ავტორისთვის საკუთარი შეტყობინება წაკითხულია — თორემ
        // გაგზავნისთანავე საკუთარივე badge აენთებოდა
        $conversation->participants()->updateExistingPivot($author->id, [
            'last_read_at' => $message->created_at,
        ]);

        return $message;
    }

    /**
     * **მიმაგრებული ფაილის წაშლა (`DECISIONS.md` §1 — „ქრება ორივესთან").**
     *
     * ფაილი დისკიდან ქრება და გამგზავნის კვოტა თავისუფლდება; **შეტყობინების
     * რიგი რჩება** და ორივე მხარეს ნაცრისფერ „ფაილი წაშლილია"-დ იხატება.
     * ასე საუბრის ძაფი იკითხება და ადგილიც მართლა თავისუფლდება.
     *
     * ⚠️ **მხოლოდ ავტორს შეუძლია.** ფაილი მისი კვოტიდან იხარჯება, ე.ი.
     * მიმღების მიერ წაშლა ჩუმად სხვის ადგილს ათავისუფლებდა.
     */
    public function deleteAttachment(Message $message, User $me): Message
    {
        if ($message->user_id !== $me->id) {
            $this->fail('not_the_author', 403);
        }

        if ($message->attachment_path) {
            /* ⚠️ კვოტიდან **ჩაწერილი** `attachment_size` თავისუფლდება და არა
               დისკიდან წაკითხული ზომა — ზუსტად ის, რაც ატვირთვისას დაითვალა
               (`StoredFile`-ის იგივე წესი). სხვაგვარად ორი წყარო გაჩნდებოდა
               და მრიცხველი ნელ-ნელა აცდებოდა. */
            $this->meter->deleteUpload(null, $message->attachment_path);
            $this->meter->addFor((int) $message->user_id, -(int) $message->attachment_size);
        }

        // ⚠️ `attachment_size` განზრახ ნულდება: ის კვოტის ანარეკლია და
        // წაშლის შემდეგ „ჯერ კიდევ 4 MB"-ს ვერ იტყვის. სახელი რჩება, რომ
        // ჩანაცვლებამ თქვას, **რა** იყო წაშლილი.
        $message->forceFill([
            'attachment_path' => null,
            'attachment_mime' => null,
            'attachment_size' => null,
        ])->save();

        return $message;
    }

    /**
     * **წერილის წაშლა (Tasks §4.6)** — `self` (მხოლოდ ჩემთან) ან `both`.
     *
     * ⚠️ **რიგი ბაზაში რჩება** — §4.6-ის პირდაპირი მოთხოვნა („წაშლილი
     * წერილი ბაზაში მაინც რჩება, რომ საჭიროების შემთხვევაში ამოღება
     * შეიძლებოდეს"). ე.ი. ეს დამალვაა და არა `delete`; რა, ვინ, ვის,
     * როდის და **რა მეთოდით** — ყველაფერი რჩება.
     *
     * ⚠️ **`both` მხოლოდ ავტორს შეუძლია.** სხვისი წერილის ყველასთვის
     * გაქრობა მიმოწერის გადაწერაა; საკუთარ თავთან დამალვა კი ყველას
     * შეუძლია — ეს მხოლოდ მის ხედს ეხება.
     *
     * ⚠️ **ფაილი დისკზე რჩება და კვოტიდან არ თავისუფლდება.** ის აღდგენის
     * ნაწილია; ადგილის გასათავისუფლებლად ცალკე, ცხადი მოქმედება არსებობს
     * (`deleteAttachment()`), რომელიც სწორედ ფაილს შლის.
     *
     * ⚠️ **ორი სკოუპი ორ სხვადასხვა ადგილას იწერება** (აუდიტი 2026-09-14, §B2)
     * და ეს არ არის დეტალი: `both` შეტყობინების ფაქტია (ავტორმა წაშალა
     * ყველასთვის), `self` კი **მაყურებლის**. ერთ საერთო სამეულში —
     * `removed_at`/`removed_by` — ორივე რომ ეწერა, **მეორე მონაწილის
     * დამალვა პირველისას აუქმებდა**: B მალავდა, მერე A მალავდა, `removed_by`
     * გადაეწერებოდა და წერილი B-სთან ისევ ჩნდებოდა.
     */
    public function deleteMessage(Message $message, User $me, string $scope): Message
    {
        if ($scope === 'both') {
            if ($message->user_id !== $me->id) {
                $this->fail('not_the_author', 403);
            }

            $message->forceFill([
                'removed_at' => now(),
                'removed_by' => $me->id,
            ])->save();

            return $message;
        }

        /* ⚠️ `firstOrCreate` და არა `create`: ორჯერ დამალვა ერთი და იგივე
           ქმედებაა და უნიკალურ ინდექსზე 500-ით არ უნდა დასრულდეს. */
        MessageHide::firstOrCreate(
            ['message_id' => $message->getKey(), 'user_id' => $me->id],
            ['hidden_at' => now()],
        );

        return $message->load('hides');
    }

    /** წაკითხულად ნიშვნა — მრიცხველი ამაზე დგას */
    public function markRead(Conversation $conversation, User $user): void
    {
        $conversation->participants()->updateExistingPivot($user->id, ['last_read_at' => now()]);
    }

    /**
     * წაუკითხავი შეტყობინებები ამ user-ისთვის, საუბრებად დაშლილი.
     *
     * ⚠️ **საკუთარი შეტყობინება არასდროს ითვლება** — თორემ გაგზავნისთანავე
     * ჰედერის badge აენთებოდა.
     *
     * @return array<int, int> conversation_id => რაოდენობა
     */
    public function unreadCounts(User $user): array
    {
        return DB::table('messages')
            ->join('conversation_user', function ($join) use ($user) {
                $join->on('conversation_user.conversation_id', '=', 'messages.conversation_id')
                    ->where('conversation_user.user_id', '=', $user->id);
            })
            ->where('messages.user_id', '!=', $user->id)
            // §4.6 — წაშლილი წერილი ბაზაში რჩება, მაგრამ წაუკითხავად აღარ ითვლება
            ->whereNull('messages.removed_at')
            /* ⚠️ **ჩემთვის დამალულიც წაუკითხავი აღარ არის** (§B2). `NOT EXISTS`
               და არა `leftJoin`: join-ი `COUNT(*)`-ს გააორმაგებდა იმ დღეს,
               როცა ერთ წერილს ორი დამალვა ექნება. */
            ->whereNotExists(fn ($q) => $q
                ->selectRaw('1')
                ->from('message_hides')
                ->whereColumn('message_hides.message_id', 'messages.id')
                ->where('message_hides.user_id', $user->id))
            ->where(function ($q) {
                $q->whereNull('conversation_user.last_read_at')
                    ->orWhereColumn('messages.created_at', '>', 'conversation_user.last_read_at');
            })
            ->groupBy('messages.conversation_id')
            ->selectRaw('messages.conversation_id, COUNT(*) as total')
            ->pluck('total', 'messages.conversation_id')
            ->map(fn ($n) => (int) $n)
            ->all();
    }

    /* ---------- დადუმება (Tasks §10.5) ---------- */

    /**
     * **დადუმება/ჩართვა.** `$until === null` = სამუდამოდ.
     *
     * ⚠️ **ორი სვეტია და არა ერთი**: „სამუდამოდ" სენტინელ-თარიღით
     * („3000 წელი") არ უნდა გამოიხატოს — `muted_at` ამბობს *რომ* დადუმდა,
     * `muted_until` კი *სანამ*.
     */
    public function mute(Conversation $conversation, User $user, ?Carbon $until = null): void
    {
        $conversation->participants()->updateExistingPivot($user->id, [
            'muted_at' => now(),
            'muted_until' => $until,
        ]);
    }

    public function unmute(Conversation $conversation, User $user): void
    {
        $conversation->participants()->updateExistingPivot($user->id, [
            'muted_at' => null,
            'muted_until' => null,
        ]);
    }

    /**
     * დადუმებულია თუ არა **ახლა**.
     *
     * ⚠️ **გასული ვადა ჩუმად ითვლება ჩართულად** და ცალკე გასუფთავებას არ
     * ითხოვს: ერთი `where` ყოველთვის სწორ პასუხს იძლევა, cron-ი კი, რომელიც
     * ვადებს წმენდს, ერთი კიდევ გასაშვები პროცესი იქნებოდა.
     */
    public function isMuted(Conversation $conversation, User $user): bool
    {
        $pivot = $conversation->participants()->whereKey($user->id)->first()?->pivot;

        if (! $pivot || $pivot->muted_at === null) {
            return false;
        }

        return $pivot->muted_until === null || Carbon::parse($pivot->muted_until)->isFuture();
    }

    /**
     * **ჰედერის badge — დადუმებულის გარეშე (§10.5).**
     *
     * ⚠️ **რიგის რიცხვი პატიოსანი რჩება**: დადუმება ნიშნავს „ნუ მაწუხებ"
     * და არა „დამალე". ამიტომ `unreadCounts()` ხელუხლებელია და მხოლოდ
     * **ჯამი** ჭრის დადუმებულებს.
     */
    public function unreadTotal(User $user): int
    {
        $muted = $this->mutedConversationIds($user);

        $counts = $this->unreadCounts($user);

        foreach ($muted as $id) {
            unset($counts[$id]);
        }

        return array_sum($counts);
    }

    /** @return list<int> */
    public function mutedConversationIds(User $user): array
    {
        return DB::table('conversation_user')
            ->where('user_id', $user->id)
            ->whereNotNull('muted_at')
            ->where(fn ($q) => $q->whereNull('muted_until')->orWhere('muted_until', '>', now()))
            ->pluck('conversation_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /* ---------- დაპინვა (Tasks §10.7) ---------- */

    /** რამდენი პინი ეტევა ერთ საუბარში */
    public const PIN_LIMIT = 20;

    /**
     * **დაპინვა/მოხსნა — ორივე მონაწილეს შეუძლია.**
     *
     * ⚠️ განსხვავებით „ორივესთვის წაშლისგან", პინი **დესტრუქციული არაა** და
     * საუბრის დონეზე დგას — ე.ი. ავტორობას არ ითხოვს. სამაგიეროდ ვინ
     * დააპინა, იწერება: `pinned_by`.
     */
    public function pin(Message $message, User $me, bool $pinned): Message
    {
        if ($pinned && ! $message->isPinned()) {
            $count = Message::where('conversation_id', $message->conversation_id)
                ->whereNotNull('pinned_at')
                ->count();

            if ($count >= self::PIN_LIMIT) {
                $this->fail('pin_limit_reached', 422);
            }
        }

        $message->forceFill([
            'pinned_at' => $pinned ? now() : null,
            'pinned_by' => $pinned ? $me->id : null,
        ])->save();

        return $message;
    }

    /* ---------- რეაქციები (Tasks §10.10) ---------- */

    /**
     * **რეაქციის დადება/შეცვლა/მოხსნა.** `$emoji === null` = მოხსნა.
     *
     * ⚠️ **თითო ადამიანზე ერთი** — იმავე ემოჯის ხელახალი დაჭერა მოხსნაა
     * (Messenger-ის ქცევა), სხვისი კი ჩანაცვლება. `updateOrCreate` სწორედ
     * ამიტომაა და არა `create`: უნიკალურ ინდექსზე 500 არ უნდა დაბრუნდეს.
     */
    public function react(Message $message, User $me, ?string $emoji): void
    {
        $existing = MessageReaction::where('message_id', $message->id)
            ->where('user_id', $me->id)
            ->first();

        if ($emoji === null || ($existing && $existing->emoji === $emoji)) {
            $existing?->delete();

            return;
        }

        MessageReaction::updateOrCreate(
            ['message_id' => $message->id, 'user_id' => $me->id],
            ['emoji' => $emoji],
        );
    }

    /* ---------- ნიკნეიმები (Tasks §10.11) ---------- */

    /**
     * **ნიკნეიმი — მხოლოდ ჩემს ხედში.**
     *
     * ⚠️ ცარიელი მნიშვნელობა **შლის** რიგს და არ წერს ცარიელ სტრიქონს:
     * „ნიკნეიმი არ აქვს" და „ნიკნეიმი ცარიელია" ერთი ფაქტია.
     */
    public function setNickname(Conversation $conversation, User $me, User $target, ?string $nickname): void
    {
        $nickname = $nickname !== null ? trim($nickname) : null;

        if ($nickname === null || $nickname === '') {
            ConversationNickname::where('conversation_id', $conversation->id)
                ->where('user_id', $me->id)
                ->where('target_user_id', $target->id)
                ->delete();

            return;
        }

        ConversationNickname::updateOrCreate(
            [
                'conversation_id' => $conversation->id,
                'user_id' => $me->id,
                'target_user_id' => $target->id,
            ],
            ['nickname' => $nickname],
        );
    }

    /**
     * ამ საუბარში ჩემი დარქმეული სახელები: `target_user_id => nickname`.
     *
     * @return array<int, string>
     */
    public function nicknames(Conversation $conversation, User $me): array
    {
        return ConversationNickname::where('conversation_id', $conversation->id)
            ->where('user_id', $me->id)
            ->pluck('nickname', 'target_user_id')
            ->all();
    }

    /* ---------- დაბლოკვა ---------- */

    public function block(User $me, User $other): void
    {
        UserBlock::firstOrCreate(['user_id' => $me->id, 'blocked_user_id' => $other->id]);
    }

    public function unblock(User $me, User $other): void
    {
        UserBlock::where('user_id', $me->id)->where('blocked_user_id', $other->id)->delete();
    }

    /** დაბლოკილია თუ არა **რომელიმე** მიმართულებით (იხ. კლასის შენიშვნა) */
    public function blockedBetween(User $a, User $b): bool
    {
        return UserBlock::where(function ($q) use ($a, $b) {
            $q->where('user_id', $a->id)->where('blocked_user_id', $b->id);
        })->orWhere(function ($q) use ($a, $b) {
            $q->where('user_id', $b->id)->where('blocked_user_id', $a->id);
        })->exists();
    }

    /** დავბლოკე თუ არა **მე** ეს ადამიანი (UI-ს ღილაკისთვის) */
    public function iBlocked(User $me, User $other): bool
    {
        return UserBlock::where('user_id', $me->id)->where('blocked_user_id', $other->id)->exists();
    }

    /* ---------- კარიბჭე ---------- */

    /**
     * ⚠️ ერთადერთი ადგილი, სადაც წყდება „შეიძლება თუ არა მიწერა".
     * გახსნაც და გაგზავნაც ორივე აქ გადის.
     */
    public function guard(User $me, User $other): void
    {
        if ($me->id === $other->id) {
            $this->fail('cannot_chat_with_self', 422);
        }

        if ($me->profile_visibility !== 'public' || $other->profile_visibility !== 'public') {
            $this->fail('profile_not_public', 409);
        }

        if ($this->blockedBetween($me, $other)) {
            $this->fail('chat_blocked', 403);
        }
    }

    /** მეორე მხარის მოძებნა username-ით — არააქტიური/არარსებული 404-ია */
    public function resolve(string $username): ?User
    {
        return User::where('username', $username)->where('is_active', true)->first();
    }

    private function fail(string $code, int $status): never
    {
        throw new HttpResponseException(response()->json(['message' => $code], $status));
    }
}
