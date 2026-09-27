/* ============================================================
   ვებძებნის შეკითხვის ჩიპები — ჩამატება და ამოღება (Tasks §19.1).

   შენი მოთხოვნა: „„შეკითხვას დაამატე“ — პირველი ფილმის ან მსახიობის
   სახელია, სადაც ვართ, ეგ კარგია, მაგრამ სრული გასუფთავების ღილაკიც იყოს".

   ⚠️ **ჩიპი გადამრთველია**: შეკითხვაში უკვე მყოფი სახელი აქტიურად იხატება
   და ხელახლა დაჭერით **ამოიღება**. ადრე პირველი ჩიპი შეკითხვას ანაცვლებდა,
   დანარჩენები კი მხოლოდ ამატებდნენ — ე.ი. მსახიობის ამოსაღებად ტექსტი
   ხელით უნდა წაგეშალა.

   ⚠️ **სახელი მთელ სიტყვად ითვლება** (საზღვრები — ინტერვალი ან პუნქტუაცია).
   `includes()` „Ann"-ს „Anna Karenina"-ში იპოვიდა, ჩიპი აქტიური გახდებოდა და
   დაჭერა სიტყვის ნაწილს ამოჭრიდა.

   ⚠️ **`RegExp` არ იწერება შეკითხვიდან** — სახელში `(` ან `*` შეიძლება იყოს
   (`highlightParts`-ის წესი); ძებნა `indexOf`-ით მიდის.
   ============================================================ */

/** სიტყვის საზღვარი — სტრიქონის კიდე, ინტერვალი ან პუნქტუაცია */
const SEPARATORS = ' \t\n,.;:!?()[]{}"\'„“”«»-–—/|&+'

function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || SEPARATORS.includes(ch)
}

/**
 * სად დგას სახელი შეკითხვაში მთელ სიტყვად (`-1` = არსად).
 *
 * ⚠️ რეგისტრი არ ითვლება. `toLowerCase()` იშვიათად სიგრძეს ცვლის (თურქული
 * `İ`) — მაშინ ინდექსი ორიგინალს ვეღარ დაემთხვეოდა, ამიტომ ასეთ სტრიქონზე
 * ზუსტი რეგისტრით ვეძებთ.
 */
export function findTerm(query: string, term: string): number {
  const needle = term.trim()
  if (!needle) return -1

  const lowered = query.toLowerCase()
  const exact = lowered.length !== query.length || needle.toLowerCase().length !== needle.length
  const hay = exact ? query : lowered
  const pin = exact ? needle : needle.toLowerCase()

  for (let from = 0; ; ) {
    const at = hay.indexOf(pin, from)
    if (at === -1) return -1
    if (isBoundary(hay[at - 1]) && isBoundary(hay[at + pin.length])) return at
    from = at + 1
  }
}

export function hasTerm(query: string, term: string): boolean {
  return findTerm(query, term) !== -1
}

/** ზედმეტი ინტერვალები ერთდება — ამოღების შემდეგ „ორმაგი ხვრელი" არ რჩება */
function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function removeTerm(query: string, term: string): string {
  const at = findTerm(query, term)
  if (at === -1) return query

  return tidy(`${query.slice(0, at)} ${query.slice(at + term.trim().length)}`)
}

/**
 * სახელის ჩამატება. `start` — ჩანაწერის/მსახიობის სახელი (ის შეკითხვის
 * საფუძველია), `end` — მსახიობები, რომლებიც მას აზუსტებენ.
 */
export function addTerm(query: string, term: string, where: 'start' | 'end' = 'end'): string {
  const clean = term.trim()
  if (!clean || hasTerm(query, clean)) return query

  return tidy(where === 'start' ? `${clean} ${query}` : `${query} ${clean}`)
}

/** ჩიპზე დაჭერა: თუ უკვე შეკითხვაშია — ამოიღე, თუ არა — ჩაამატე */
export function toggleTerm(query: string, term: string, where: 'start' | 'end' = 'end'): string {
  return hasTerm(query, term) ? removeTerm(query, term) : addTerm(query, term, where)
}
