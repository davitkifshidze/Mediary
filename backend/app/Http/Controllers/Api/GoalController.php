<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Goal;
use App\Services\Goals\GoalBook;
use App\Services\Stats\LibraryStats;
use App\Support\AppTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **მიზნები** — `/goals` გვერდი და მთავარი გვერდის კომპაქტური ბლოკი.
 *
 * მიზანი მხოლოდ იმ მოდულზე იქმნება, რომელიც ამ ანგარიშს ჩართული აქვს და რომელსაც
 * „როდის დავასრულე" თარიღი აქვს (`GoalBook::modules()`); პირობა — მოდულის
 * კლასიფიკატორის ერთი რიგი (ჟანრი, კატეგორია, ტიპი).
 *
 * ⚠️ სხვისი მიზანი 404-ია (`owner` scope). ჩანაწერის შინაარსი აქედან არ გადის —
 * მხოლოდ რიცხვები, ე.ი. ჩაკეტილი ჩანაწერი არც აქ ითვლება (`LibraryStats`).
 */
class GoalController extends Controller
{
    public function __construct(private readonly GoalBook $book, private readonly LibraryStats $stats) {}

    /**
     * სია პროგრესით. `scope`: `active` — მიმდინარე და მომავალი (მთავარი გვერდი),
     * `history` — გასული პერიოდები (შესრულებული და ჩავარდნილი), ცარიელი — ყველა.
     */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['scope' => ['nullable', Rule::in(['active', 'history'])]]);
        $user = $request->user();
        $modules = $this->book->modules($user);

        /* ⚠️ **ჭრილი SQL-შია, დათვლამდე.** ადრე ყველა მიზანი (300-მდე) იტვირთებოდა,
           თითოს პროგრესი ცალკე COUNT-ით ითვლებოდა და `scope` მხოლოდ ამის შემდეგ
           იჭრებოდა — მთავარი გვერდის ბლოკი ისტორიის მიზნებსაც ითვლიდა. „გასული" =
           დასრულების დღე დღევანდელზე ადრეა (`GoalBook::present()`-ის `past`). */
        $scope = $data['scope'] ?? null;
        $today = AppTime::now()->toDateString();

        $classifiers = [];
        $rows = Goal::query()
            ->whereIn('module', $modules)
            ->when($scope === 'active', fn ($q) => $q->where('ends_on', '>=', $today))
            ->when($scope === 'history', fn ($q) => $q->where('ends_on', '<', $today))
            // ისტორია — ახლიდან ძველისკენ
            ->when($scope === 'history', fn ($q) => $q->orderByDesc('ends_on'), fn ($q) => $q->orderBy('ends_on'))
            ->orderBy('id')
            ->get()
            ->map(function (Goal $goal) use ($user, &$classifiers) {
                $classifiers[$goal->module] ??= $goal->classifier_id ? $this->stats->classifiers($user, $goal->module) : null;

                return $this->book->present($user, $goal, $classifiers[$goal->module] ?? []);
            });

        return response()->json(['data' => $rows->values()->all(), 'modules' => $modules]);
    }

    /** მოდულის კლასიფიკატორი — მიზნის პირობის ამრჩევი */
    public function classifiers(Request $request): JsonResponse
    {
        $data = $request->validate(['module' => ['required', 'string', Rule::in($this->book->modules($request->user()))]]);

        $rows = [];
        foreach ($this->stats->classifiers($request->user(), $data['module']) as $id => $name) {
            $rows[] = ['id' => $id, ...$name];
        }

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_if(Goal::query()->count() >= Goal::MAX, 422, 'goal_limit');

        $goal = new Goal(['user_id' => $request->user()->id]);
        $this->fill($goal, $request);
        $goal->save();

        return response()->json(['data' => $this->one($request, $goal)], 201);
    }

    public function update(Request $request, Goal $goal): JsonResponse
    {
        $this->fill($goal, $request);
        $goal->save();

        return response()->json(['data' => $this->one($request, $goal)]);
    }

    public function destroy(Goal $goal): JsonResponse
    {
        $goal->delete();

        return response()->json(null, 204);
    }

    private function fill(Goal $goal, Request $request): void
    {
        $user = $request->user();

        $data = $request->validate([
            'module' => ['required', 'string', Rule::in($this->book->modules($user))],
            'name' => ['nullable', 'string', 'max:'.Goal::NAME_MAX],
            'period' => ['required', Rule::in(Goal::PERIODS)],
            // წელი/თვე/კვირა: ნებისმიერი დღე იმ პერიოდიდან; საკუთარი: პირველი დღე
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required_if:period,custom', 'nullable', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
            'target' => ['required', 'integer', 'min:1', 'max:100000'],
            'classifier_id' => ['nullable', 'integer'],
        ]);

        // ⚠️ პირობა ამ მოდულის კლასიფიკატორიდან უნდა იყოს — სხვა ლექსიკონის id ჩუმად ნულს დათვლიდა
        if (! empty($data['classifier_id'])) {
            abort_unless(isset($this->stats->classifiers($user, $data['module'])[(int) $data['classifier_id']]), 422, 'goal_classifier_unknown');
        }

        [$from, $to] = $this->book->range($data['period'], $data['starts_on'], $data['ends_on'] ?? null);

        $goal->fill([
            'module' => $data['module'],
            'name' => $data['name'] ?? null,
            'period' => $data['period'],
            'starts_on' => $from,
            'ends_on' => $to,
            'target' => (int) $data['target'],
            'classifier_id' => $data['classifier_id'] ?? null,
        ]);
    }

    /** @return array<string, mixed> */
    private function one(Request $request, Goal $goal): array
    {
        $user = $request->user();

        return $this->book->present($user, $goal, $goal->classifier_id ? $this->stats->classifiers($user, $goal->module) : []);
    }
}
