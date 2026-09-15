import { api } from '@/lib/api'

/* ============================================================
   ჯვარედინი ძებნა — `GET /api/search`.

   ⚠️ **ეს არ ცვლის სექციების საკუთარ ძებნას.** მოდულის შიგნით ძებნა
   ფილტრებთან ერთად მუშაობს და სრულ სიას აბრუნებს; ეს კი „სად ვახსენე ეს
   სიტყვა" კითხვას პასუხობს — ყველა მოდული ერთდროულად, ნაჭრებით.

   ⚠️ **`matches` პასუხის მთავარი ნაწილია და არა დამატება.** სათაურების სია
   არ ამბობს *რატომ* მოვიდა ჩანაწერი — ნაჭერი კი ზუსტად იმ ადგილს აჩვენებს,
   სადაც დამთხვევაა (აღწერა, შენიშვნა, ციტატა, ტეგი, მსახიობი, ფაილი).

   ⚠️ **ხაზგასმა SPA-ს საქმეა** — სერვერი სუფთა ტექსტს აბრუნებს (ნედლი HTML
   არსად არ გადაეცემა), სიტყვას `highlightParts()` პოულობს.
   ============================================================ */

/** ერთი დამთხვევა: რომელ ველში და როგორ გამოიყურება მისი გარემო */
export interface SearchMatch {
  /** `title` · `description` · `note` · `cast` … — ლეიბლი `search.field.*`-შია */
  field: string
  text: string
}

export interface SearchItem {
  id: number
  /** დომენი — `movie` … `cast`, `playlist`, `gallery` (მოდულის key ყოველთვის არაა) */
  domain: string
  /** მოდული, რომელსაც დომენი ეკუთვნის (`cast`-ს არ აქვს) */
  module: string | null
  title: string
  subtitle: string | null
  /** ჩვენს დისკზე მდებარე სურათი (`storageUrl()`) */
  image: string | null
  /** გარე სურათი (გალერეის ვიდეოს თამბნეილი) */
  image_url: string | null
  matches: SearchMatch[]
}

export interface SearchGroup {
  key: string
  module: string | null
  /** ⚠️ **ჯამი და არა `items.length`** — „კიდევ N არის" სწორედ აქედან ჩანს */
  total: number
  items: SearchItem[]
}

export interface SearchResult {
  query: string
  total: number
  groups: SearchGroup[]
}

export interface SearchOptions {
  /** თითო დომენიდან რამდენი შედეგი (სერვერის ჭერი 100) */
  perModule?: number
  /** მხოლოდ ერთი დომენი — გვერდის „მეტის ჩვენება" */
  domain?: string
  signal?: AbortSignal
}

export async function globalSearch(q: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const { data } = await api.get<SearchResult>('/search', {
    params: { q, per_module: opts.perModule, domain: opts.domain },
    signal: opts.signal,
  })

  return data
}
