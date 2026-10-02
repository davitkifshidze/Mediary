/* ============================================================
   **გადალაგების არითმეტიკა** (Tasks §11) — React-ის გარეშე, რომ ვიჯეტი და
   ტესტი ერთსა და იმავეს ითვლიდნენ. `Sortable` (`components/ui/sortable.tsx`)
   drag & drop-ზე `arrayMove`-ს იძახებს; აქაური ორი ფუნქცია მენიუს
   „ერთით წინ/უკან"-ს და ოპტიმისტურ ქეშს ემსახურება.
   ============================================================ */

/**
 * `id` ერთი პოზიციით წინ (−1) ან უკან (+1). `null` — გადაადგილება არ მოხდა
 * (პირველს წინ არ აქვს, ბოლოს — უკან), ე.ი. სერვერზე არაფერი იგზავნება.
 */
export function moveWithin<T>(ids: readonly T[], id: T, delta: number): T[] | null {
  const index = ids.indexOf(id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= ids.length || delta === 0) return null

  const next = [...ids]
  next.splice(target, 0, next.splice(index, 1)[0])
  return next
}

/**
 * სია ახალი რიგით — ოპტიმისტური ქეშისთვის, სანამ სერვერი უპასუხებს.
 * რიგში არმყოფი ელემენტი ბოლოში რჩება თავისი თანმიმდევრობით.
 */
export function sortByIds<T, K>(items: readonly T[], ids: readonly K[], key: (item: T) => K): T[] {
  const rank = new Map<K, number>(ids.map((id, i) => [id, i]))
  const missing = items.length

  return [...items].sort((a, b) => (rank.get(key(a)) ?? missing) - (rank.get(key(b)) ?? missing))
}
