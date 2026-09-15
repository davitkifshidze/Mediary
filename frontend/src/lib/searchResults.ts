import type { SearchItem } from '@/api/search'

/* ============================================================
   ძებნის შედეგის ორი წმინდა წესი — ხაზგასმა და მისამართი.

   ⚠️ **ორივე `lib/`-შია და არა კომპონენტში**, რადგან ორივეს **ორი**
   გამომძახებელი ჰყავს: ჰედერის ჩამოსაშლელი სია და `/search` გვერდი. ერთი
   ფუნქციის ორი ასლი ერთ კვირაში დაშორდებოდა — ერთგან „ნაპოვნი" ხაზგასმული
   იქნებოდა, მეორეგან არა.
   ============================================================ */

/** ტექსტის ნაჭერი: დამთხვეული მონაკვეთები და მათ შორის ჩვეულებრივი ტექსტი */
export interface HighlightPart {
  text: string
  hit: boolean
}

/**
 * **დამთხვევის ნაწილებად დაშლა.**
 *
 * ⚠️ **`toLowerCase()`-ით და არა `RegExp`-ით.** მომხმარებლის ტექსტი
 * პირდაპირ შაბლონში რომ ჩაგვესვა, `(`, `*` ან `[` რეგულარულ გამოსახულებას
 * გატეხავდა (ან სულ სხვას იპოვიდა) — ე.ი. ძებნა ჩუმად სხვა კითხვას
 * უპასუხებდა. ქართულს რეგისტრი არ აქვს, ინგლისურს კი `toLowerCase()`
 * სავსებით ჰყოფნის.
 *
 * ⚠️ **ცარიელი ტერმინი ერთ ნაჭერს აბრუნებს** და არა უსასრულო ციკლს —
 * `indexOf('')` ყოველთვის 0-ია.
 */
export function highlightParts(text: string, term: string): HighlightPart[] {
  const needle = term.trim().toLowerCase()
  if (!needle || !text) return [{ text, hit: false }]

  const hay = text.toLowerCase()
  const parts: HighlightPart[] = []
  let from = 0

  for (;;) {
    const at = hay.indexOf(needle, from)
    if (at === -1) break

    if (at > from) parts.push({ text: text.slice(from, at), hit: false })
    parts.push({ text: text.slice(at, at + needle.length), hit: true })
    from = at + needle.length
  }

  if (from < text.length) parts.push({ text: text.slice(from), hit: false })

  return parts.length ? parts : [{ text, hit: false }]
}

/** დომენები, რომელთა ჩანაწერსაც საკუთარი გვერდი აქვს */
const MEDIA_DOMAINS = ['movie', 'series', 'anime']

/**
 * **სად მიდის შედეგზე დაწკაპუნება.**
 *
 * ⚠️ **მოდულის ფესვი გამომძახებლისგან მოდის** (`GET /api/modules`) და არა
 * აქედან — მისამართების მეორე ასლი ერთ დღეს დაშორდებოდა (`/movies` vs
 * `/movie`). აქ მხოლოდ **სამი გამონაკლისია**, რომლებიც მოდულები არ არიან:
 * მსახიობი (გლობალური ლექსიკონი), პლეილისტი (სიმღერების შიგნით) და
 * გალერეის ვიდეო.
 *
 * ⚠️ **მედიის გარდა სექციის გვერდზე `?q=`-ით მივდივართ** და არა ჩანაწერის
 * მისამართზე: იმ მოდულებში ჩანაწერი მოდალურ ფანჯარაში იხსნება, ე.ი.
 * პირდაპირი ბმული არ არსებობს — ძებნით გახსნილი სექცია კი სწორედ იმ
 * ჩანაწერს აჩვენებს.
 */
export function resultPath(item: SearchItem, routeBase: string | undefined): string | null {
  if (item.domain === 'cast') return `/actors/${item.id}`
  if (item.domain === 'playlist') return `/playlists/${item.id}`
  if (item.domain === 'gallery') return '/gallery/videos'

  if (!routeBase) return null

  if (MEDIA_DOMAINS.includes(item.domain)) return `${routeBase}/${item.id}`

  return `${routeBase}?q=${encodeURIComponent(item.title)}`
}
