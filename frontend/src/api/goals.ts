import { api } from '@/lib/api'

/* ============================================================
   **მიზნები** — „ამ პერიოდში ამდენი დავასრულო" ერთ მოდულზე.

   მიზანი რიგია (`goals` ცხრილი): მოდული · პერიოდი · რიცხვი · სურვილისამებრ პირობა
   (მოდულის კლასიფიკატორის ერთი რიგი — ჟანრი, კატეგორია, ტიპი) · სახელი.
   ⚠️ პროგრესი, ტემპი და მდგომარეობა **სერვერზე ითვლება** (`GoalBook`) — იმავე
   წყაროდან, რითაც სტატისტიკა; აქ მხოლოდ იხატება.
   ============================================================ */

/** backend-ის `Goal::PERIODS`-ის სარკე */
export const GOAL_PERIODS = ['year', 'month', 'week', 'custom'] as const

export type GoalPeriod = (typeof GOAL_PERIODS)[number]

/** `upcoming` — ჯერ არ დაწყებულა · `active` · `achieved` · `failed` — ვადა გავიდა */
export type GoalState = 'upcoming' | 'active' | 'achieved' | 'failed'

export interface GoalClassifier {
  id: number
  name_ka: string | null
  name_en: string | null
}

export interface Goal {
  id: number
  module: string
  name: string | null
  period: GoalPeriod
  /** `Y-m-d` — პერიოდის პირველი და ბოლო დღე (ორივე ითვლება) */
  starts_on: string
  ends_on: string
  target: number
  classifier_id: number | null
  classifier: Omit<GoalClassifier, 'id'> | null
  done: number
  state: GoalState
  /** პერიოდი გავიდა — ისტორიაა */
  past: boolean
  days_total: number
  days_left: number
  /** თანაბარი ტემპით დღეს რამდენი უნდა იყოს; `null` — მიზანი აქტიური არ არის */
  expected: number | null
  /** `done − expected`: დადებითი — გრაფიკს უსწრებ, უარყოფითი — ჩამორჩები */
  pace: number | null
}

export interface GoalInput {
  module: string
  name: string | null
  period: GoalPeriod
  /** წელი/თვე/კვირა — ნებისმიერი დღე იმ პერიოდიდან; საკუთარი — პირველი დღე */
  starts_on: string
  ends_on?: string | null
  target: number
  classifier_id: number | null
}

export interface GoalList {
  data: Goal[]
  /** მოდულები, რომლებზეც მიზნის დასმა შეიძლება (ჩართული და დასრულების თარიღის მქონე) */
  modules: string[]
}

export async function fetchGoals(scope?: 'active' | 'history'): Promise<GoalList> {
  const { data } = await api.get('/goals', { params: scope ? { scope } : {} })
  return data
}

export async function fetchGoalClassifiers(module: string): Promise<GoalClassifier[]> {
  const { data } = await api.get('/goals/classifiers', { params: { module } })
  return data.data
}

export async function createGoal(input: GoalInput): Promise<Goal> {
  const { data } = await api.post('/goals', input)
  return data.data
}

export async function updateGoal(id: number, input: GoalInput): Promise<Goal> {
  const { data } = await api.put(`/goals/${id}`, input)
  return data.data
}

export async function deleteGoal(id: number): Promise<void> {
  await api.delete(`/goals/${id}`)
}
