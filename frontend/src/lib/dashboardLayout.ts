/* ============================================================
   **მთავარი გვერდის განლაგება** (`users.settings.dashboard`).

   მორგება რედაქტირების რეჟიმია და არა თავისუფალი ბადე: ერთეულების **რიგი**, თითოს
   **ჩართვა / გამორთვა** და **სიგანე** (მთელი · ნახევარი · მესამედი). ერთეული ან ბლოკია
   (მიზნები, „ვაგრძელებ"…), ან ერთი მოდულის ბარათი (`module:<key>`) — მოდულების ბარათები
   თითო ცალკეა, საკუთარი რიგით, მენიუს რიგისგან დამოუკიდებლად.

   ⚠️ **შენახული სია ყოველთვის ნორმალიზდება** (`normalizeLayout`): გამორთული მოდულის
   ბარათი და მიუწვდომელი ბლოკი ქრება, ახალი მოდული ან ბლოკი **ბოლოში** ემატება
   ნაგულისხმევი მნიშვნელობებით. ე.ი. `null` (არაფერი შენახულა) და ძველი ვერსიის სია
   ერთი და იმავე გზით იკითხება.
   ⚠️ ნაგულისხმევი რიგი დღევანდელ გვერდს იმეორებს: მიზნები → მოდულების ბარათები →
   ახალი ბლოკები. ბლოკი, რომელსაც საჩვენებელი არაფერი აქვს, თვითონ იმალება.
   ============================================================ */

const DASHBOARD_BLOCKS = ['goals', 'continue', 'recent', 'soon', 'reminders'] as const

export type DashboardBlock = (typeof DASHBOARD_BLOCKS)[number]

export const DASHBOARD_WIDTHS = ['full', 'half', 'third'] as const

export type DashboardWidth = (typeof DASHBOARD_WIDTHS)[number]

export interface DashboardItem {
  /** ბლოკის გასაღები ან `module:<key>` */
  id: string
  on: boolean
  width: DashboardWidth
}

const MODULE_PREFIX = 'module:'

const moduleItemId = (key: string) => `${MODULE_PREFIX}${key}`

/** `module:book` → `book`; ბლოკზე — `null` */
export function itemModule(id: string): string | null {
  return id.startsWith(MODULE_PREFIX) ? id.slice(MODULE_PREFIX.length) : null
}

const isWidth = (value: unknown): value is DashboardWidth => (DASHBOARD_WIDTHS as readonly unknown[]).includes(value)

/** ბლოკი მთელ სიგანეზეა, მოდულის ბარათი — მესამედზე (დღევანდელი ბადე) */
const defaultWidth = (id: string): DashboardWidth => (itemModule(id) ? 'third' : 'full')

/**
 * ნაგულისხმევი განლაგება: მიზნები, მოდულების ბარათები, მერე დანარჩენი ბლოკები.
 *
 * @param modules ჩემი მოდულები, მთავარი გვერდის რიგით
 * @param blocks ბლოკები, რომლებსაც ეს ანგარიში იყენებს (მოდული ჩართულია)
 */
export function defaultLayout(modules: readonly string[], blocks: readonly DashboardBlock[]): DashboardItem[] {
  const ids = [
    ...blocks.filter((b) => b === 'goals'),
    ...modules.map(moduleItemId),
    ...blocks.filter((b) => b !== 'goals'),
  ]

  return ids.map((id) => ({ id, on: true, width: defaultWidth(id) }))
}

/**
 * შენახული სია → ის, რაც დღეს შეიძლება დაიხატოს.
 *
 * - უცნობი, გამეორებული ან მიუწვდომელი ერთეული ქრება;
 * - სიაში არმყოფი მოდული ან ბლოკი ბოლოში ემატება, ჩართული.
 */
export function normalizeLayout(saved: unknown, modules: readonly string[], blocks: readonly DashboardBlock[]): DashboardItem[] {
  if (!Array.isArray(saved)) return defaultLayout(modules, blocks)

  const allowed = new Set<string>([...blocks, ...modules.map(moduleItemId)])
  const seen = new Set<string>()
  const out: DashboardItem[] = []

  for (const row of saved as unknown[]) {
    if (!row || typeof row !== 'object') continue
    const { id, on, width } = row as Partial<DashboardItem>
    if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) continue

    seen.add(id)
    out.push({ id, on: on !== false, width: isWidth(width) ? width : defaultWidth(id) })
  }

  for (const id of allowed) {
    if (!seen.has(id)) out.push({ id, on: true, width: defaultWidth(id) })
  }

  return out
}

/** ორი განლაგება ერთია? — „შეუნახავი ცვლილებები"-ს და „ნაგულისხმევზე დაბრუნება"-ს სჭირდება */
export function sameLayout(a: readonly DashboardItem[], b: readonly DashboardItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.on === b[i].on && item.width === b[i].width)
}

/**
 * ბადე ექვს სვეტზეა: მთელი — 6, ნახევარი — 3, მესამედი — 2. საშუალო ეკრანზე ორი
 * სვეტია (მთელი ორივეს იკავებს), ტელეფონზე — ერთი, იმავე რიგით.
 */
export const WIDTH_CLASS: Record<DashboardWidth, string> = {
  full: 'sm:col-span-2 lg:col-span-6',
  half: 'sm:col-span-1 lg:col-span-3',
  third: 'sm:col-span-1 lg:col-span-2',
}
