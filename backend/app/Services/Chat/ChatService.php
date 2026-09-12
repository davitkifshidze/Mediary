<?php

namespace App\Services\Chat;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Models\UserBlock;
use App\Services\Storage\StorageMeter;
use Illuminate\Http\Exceptions\HttpResponseException;
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
     */
    public function between(User $me, User $other): Conversation
    {
        $this->guard($me, $other);

        /* ⚠️ „ზუსტად ეს ორი" **`whereDoesntHave`-ით** ითქმის და არა
           `withCount` + `having`-ით: sqlite (ტესტები) `having`-ს
           არა-აგრეგატულ query-ზე არ იღებს, და აზრიც უფრო ცხადია —
           „ორივე მონაწილეობს და მესამე არავინაა". */
        $existing = Conversation::whereHas('participants', fn ($q) => $q->whereKey($me->id))
            ->whereHas('participants', fn ($q) => $q->whereKey($other->id))
            ->whereDoesntHave('participants', fn ($q) => $q->whereNotIn('users.id', [$me->id, $other->id]))
            ->first();

        if ($existing) {
            return $existing;
        }

        return DB::transaction(function () use ($me, $other) {
            $conversation = Conversation::create([]);
            $conversation->participants()->attach([$me->id, $other->id]);

            return $conversation->load('participants');
        });
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
     */
    public function deleteMessage(Message $message, User $me, string $scope): Message
    {
        if ($scope === 'both' && $message->user_id !== $me->id) {
            $this->fail('not_the_author', 403);
        }

        $message->forceFill([
            'removed_at' => now(),
            'removed_by' => $me->id,
            'removed_scope' => $scope,
        ])->save();

        return $message;
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
            ->where(function ($q) use ($user) {
                $q->whereNull('messages.removed_at')
                    ->orWhere(function ($s) use ($user) {
                        $s->where('messages.removed_scope', 'self')
                            ->where('messages.removed_by', '!=', $user->id);
                    });
            })
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
