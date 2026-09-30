import type { ModuleInfo } from '@/api/account'

/* ============================================================
   **მოდულების რიგი** (Tasks §36).

   რიგს სერვერი წყვეტს (`App\Support\ModuleOrder::sort()`): `GET /modules`,
   `GET /dashboard` და `/admin/modules` უკვე დალაგებული მოდის, ე.ი. აქ
   დალაგება **არ** ხდება — მხოლოდ ორი კითხვა, რასაც `/modules`-ის გვერდი
   სვამს: „როგორია საერთო რიგი" და „განსხვავდება თუ არა ჩემი მისგან".
   ============================================================ */

type Ordered = Pick<ModuleInfo, 'id' | 'key' | 'sort_order'>

/**
 * **საერთო რიგი** — სუპერადმინის `modules.sort_order`, მერე `id` (სერვერის
 * `sort()`-ის მეორე საფეხური). ყველა `ModuleInfo` მას თავისი `sort_order`-ით
 * ატარებს, ე.ი. ცალკე მოთხოვნა არ სჭირდება.
 */
export function sharedOrder(list: readonly Ordered[]): string[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((m) => m.key)
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i])
}

/**
 * **ჩემი რიგი საერთოსგან განსხვავდება** — მაშინ ჩანს „ნაგულისხმევზე
 * დაბრუნება" (და სუპერადმინს „ყველასთვის ნაგულისხმევად").
 *
 * ⚠️ **„პირადი რიგი მაქვს" და „ის განსხვავდება" სხვადასხვა ფაქტია**, და
 * ღილაკს მეორე სჭირდება: საერთოს იდენტური პირადი რიგის „დაბრუნება"
 * ეკრანზე არაფერს შეცვლის — ე.ი. ღილაკი იტყუებოდა.
 */
export function isCustomOrder(list: readonly Ordered[]): boolean {
  return !sameOrder(
    list.map((m) => m.key),
    sharedOrder(list),
  )
}

/**
 * სიის დალაგება გასაღებების რიგით — **ოპტიმისტური ქეშისთვის**, რომ
 * ჩამოგდებული ბარათი პასუხის მოსვლამდე უკან არ ხტებოდეს.
 *
 * ⚠️ ჩამოუთვლელი ელემენტი ბოლოს დგება და **არ იკარგება** (სერვერის იგივე
 * წესი) — ქეშიდან ჩუმად გამქრალი მოდული საიდბარიდანაც გაქრებოდა.
 */
export function arrangeByKeys<T extends { key: string }>(list: readonly T[], keys: readonly string[]): T[] {
  const byKey = new Map(list.map((m) => [m.key, m]))
  const listed = new Set(keys)

  return [...keys.flatMap((key) => byKey.get(key) ?? []), ...list.filter((m) => !listed.has(m.key))]
}
