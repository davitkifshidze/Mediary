/* ============================================================
   დამკვრელის რიგის სუფთა წესები (Tasks §35.2) — ამოღება და გადალაგება.

   ⚠️ **მიმდინარე ჩანაწერი `uid`-ით იცნობა და არა ინდექსით.** ინდექსი
   გადალაგებაზეც და ამოღებაზეც იცვლება — ინდექსით დამახსოვრებული
   „რომელზე ვდგავართ" მაშინ ჩუმად სხვა სიმღერაზე გადავიდოდა, სცენა კი
   ახალს ჩართავდა. `uid` რიგში ჩასმისას იბადება (`lib/player.tsx`), ე.ი.
   ერთი და იგივე ჩანაწერი რიგში ორჯერაც რომ იყოს, მაინც ორი ერთეულია.

   ⚠️ React-ისგან დამოუკიდებელია, რომ ტესტი კომპონენტის მიმაგრების გარეშე
   ამოწმებდეს ზუსტად იმას, რაც ყველაზე ადვილად ფუჭდება.
   ============================================================ */

export interface Keyed {
  uid: number
}

export interface Removal<T extends Keyed> {
  queue: T[]
  /** ახალი მიმდინარე (`null` — რიგი დაცარიელდა) */
  current: number | null
  /**
   * ⚠️ **მიმდინარე ამოიღეს და მის ადგილს შემდეგი იკავებს** — ის უნდა
   * ჩაირთოს (ზუსტად „გამოტოვების" ქცევა). ბოლო ამოღებულზე `false`-ია:
   * რიგი დამთავრდა, ე.ი. წინაზე ვჩერდებით და თავიდან **არ** ვუკრავთ.
   */
  restart: boolean
}

export function removeEntry<T extends Keyed>(queue: T[], uid: number, current: number | null): Removal<T> {
  const at = queue.findIndex((entry) => entry.uid === uid)
  if (at < 0) return { queue, current, restart: false }

  const rest = queue.filter((entry) => entry.uid !== uid)
  if (!rest.length) return { queue: rest, current: null, restart: false }

  // სხვა ამოიღეს — ვინც უკრავდა, ის აგრძელებს
  if (uid !== current) return { queue: rest, current, restart: false }

  // ⚠️ `at` ახლა შემდეგ ჩანაწერზე მიუთითებს — ამოღებულის ადგილი მან დაიკავა
  if (at < rest.length) return { queue: rest, current: rest[at].uid, restart: true }
  return { queue: rest, current: rest[rest.length - 1].uid, restart: false }
}

/**
 * რიგი ახალი თანმიმდევრობით (`useDragReorder`-ის სრული სია).
 *
 * ⚠️ **სხვა შემადგენლობა `null`-ია** და არა „რაც ემთხვევა": გამოტოვებული
 * `uid` ჩუმ ამოღებას ნიშნავდა, ზედმეტი — ჩუმ დამატებას. ორივე შეცდომაა,
 * რომელიც მომხმარებელს არ მოუთხოვია.
 */
export function reorderEntries<T extends Keyed>(queue: T[], uids: number[]): T[] | null {
  if (uids.length !== queue.length || new Set(uids).size !== uids.length) return null

  const byUid = new Map(queue.map((entry) => [entry.uid, entry]))
  const next: T[] = []
  for (const uid of uids) {
    const entry = byUid.get(uid)
    if (!entry) return null
    next.push(entry)
  }
  return next
}
