<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Status;
use App\Support\StatusDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * **ჩანაწერის სტატუსის შეცვლა — ერთი სხეული ოთხივე დომენზე (Tasks §6.4).**
 *
 * ⚠️ ფილმის, სერიალისა და ანიმეს კონტროლერები **სიტყვასიტყვით ერთნაირი
 * იყო** (განსხვავება: მოდელი, Resource და შეტყობინების ტექსტი), ვიდეოს კი
 * ახლა ისევე სჭირდება. ოთხი ასლი ოთხ ადგილს ნიშნავდა, სადაც „დასრულებულის"
 * წესი შეიძლება დაშორდეს — მით უმეტეს, რომ ის ახლა `role`-ზე დგას და არა
 * სახელზე.
 *
 * ⚠️ **სტატუსის სია კოდში აღარ წერია** — ის per-user ლექსიკონია, ე.ი.
 * ვალიდაცია `Status::rule()`-ზე გადის (გასაღები ამ ანგარიშის ლექსიკონში
 * უნდა არსებობდეს).
 */
abstract class RecordStatusController extends Controller
{
    /** `StatusDomain`-ის გასაღები — მოდელიც და მოდულიც აქედან იკითხება */
    abstract protected function domain(): string;

    /** @return class-string<JsonResource> */
    abstract protected function resource(): string;

    /**
     * ⚠️ **`protected` და არა `update()`.** მარშრუტს ბმა ტიპით უწევს
     * (`{movie}` → `Movie $movie`), PHP კი მშობლის `Model $record`-ის
     * კონკრეტულ ტიპზე დავიწროებას არ უშვებს — ამიტომ თითო კონტროლერს
     * თავისი სამსტრიქონიანი `update()` აქვს, სხეული კი ერთია.
     */
    protected function change(Request $request, Model $record): JsonResource
    {
        $data = $request->validate([
            'status' => ['required', 'string', Status::rule($this->domain())],
        ]);

        $record->applyStatusKey($data['status']);
        $record->save();

        $this->afterUpdate($record);

        $resource = $this->resource();

        return new $resource($this->loaded($record));
    }

    /**
     * მასობრივი შეცვლა — ან კონკრეტული `ids`, ან `from_status`-ის მქონე ყველა.
     *
     * ⚠️ ციკლი და არა `update()` query-ზე: ჩანაწერი მოდელით ინახება, რომ
     * `watched_at`-ის წესი და აუდიტ-ლოგი **ერთი გზით** გავიდეს.
     */
    public function bulkUpdate(Request $request): JsonResponse
    {
        $domain = $this->domain();

        $data = $request->validate([
            'status' => ['required', 'string', Status::rule($domain)],
            'ids' => ['array'],
            'ids.*' => ['integer'],
            'from_status' => ['nullable', 'string', Status::rule($domain)],
        ]);

        /** @var class-string<Model> $model */
        $model = StatusDomain::model($domain);
        $query = $model::query();

        if (! empty($data['ids'])) {
            $query->whereIn('id', $data['ids']);
        } elseif (! empty($data['from_status'])) {
            $query->statusKey($data['from_status']);
        } else {
            return response()->json(['message' => 'scope_required'], 422);
        }

        // სამიზნე სტატუსი ერთხელ იკითხება — თითო ჩანაწერზე ერთი query იქნებოდა
        $target = Status::forDomain($domain)->where('key', $data['status'])->firstOrFail();

        $updated = 0;
        foreach ($query->get() as $record) {
            $record->applyStatus($target);
            $record->save();
            $updated++;
        }

        return response()->json(['updated' => $updated]);
    }

    /* ---------- გადასაფარებელი ---------- */

    /** დომენის დამატებითი ლოგიკა (ფილმზე — ფრანჩაიზის გავრცელება) */
    protected function afterUpdate(Model $record): void {}

    /** პასუხისთვის საჭირო კავშირები */
    protected function loaded(Model $record): Model
    {
        return $record->load(['genres', 'cast']);
    }
}
