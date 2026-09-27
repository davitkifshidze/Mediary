import type { CSSProperties } from 'react'

/* ============================================================
   **გრაფიკის ფერი — ორივე თემაზე წაკითხვადი** (Tasks §28.4).

   შენი სიტყვები (Q19): ერთი ტონის ნაცვლად მოდულები აშკარად განსხვავებული
   ფერებით — **მოდულის საკუთარი ფერით** (`modules.color`, რასაც გვერდითა
   მენიუ ხატავს), ხოლო სადაც კონტრასტი არ ყოფნის, **იმავე ტონის**
   გამუქებული (ნათელ თემაზე) ან განათებული (მუქზე) ვარიანტით.

   ⚠️ **კონტრასტი WCAG 1.4.11-ით მოწმდება** — გრაფიკულ ობიექტს ზედაპირთან
   ≥ 3:1 სჭირდება. ფერი იცვლება მხოლოდ მაშინ, როცა ამას არ აკმაყოფილებს,
   ე.ი. ნორმალური ფერი ხელუხლებელი რჩება.

   ⚠️ **თემა CSS-ით ირჩევა და არა JS-ით** — `ui/chart.tsx`-ის წესი: SVG
   ცვლადს პირდაპირ კითხულობს, ე.ი. გადართვაზე ხელახლა დახატვა არ სჭირდება.
   აქ ორივე ვარიანტი **წინასწარ** გამოითვლება (`seriesVars`), ხოლო
   `index.css`-ის `.fb-series` / `.dark .fb-series` წესი ირჩევს, რომელი
   ჩანს. JS თემას არასდროს კითხულობს.
   ============================================================ */

/** `index.css`-ის `--card` ორივე თემაზე — გრაფიკი ამ ზედაპირზე იხატება */
export const CHART_SURFACE = { light: '#ffffff', dark: '#1e1a13' } as const

/** WCAG 1.4.11 — გრაფიკული ობიექტის მინიმალური კონტრასტი */
export const MIN_CONTRAST = 3

/** სერიების ადგილი `.fb-series`-ში (`index.css`) — მეტი ერთ გრაფიკზე არ დაგვჭირდება */
export const SERIES_SLOTS = 12

/** ფერის გარეშე მოდული — ნეიტრალური, მაგრამ მაინც განსხვავებული ტონები */
const FALLBACK = ['#6d6aa8', '#3b8a8a', '#b07a32', '#8a5a9b', '#4f7fa8', '#7d8a3b']

type Rgb = [number, number, number]

function parse(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null

  const n = parseInt(m[1], 16)

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** WCAG-ის ფარდობითი სიკაშკაშე */
function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** ორი ფერის კონტრასტი (1…21); უცნობ ფერზე — 1 */
export function contrast(a: string, b: string): number {
  const x = parse(a)
  const y = parse(b)
  if (!x || !y) return 1

  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p)

  return (hi + 0.05) / (lo + 0.05)
}

/**
 * **იმავე ტონის წაკითხვადი ვარიანტი** — ნათელ ზედაპირზე შავისკენ, მუქზე
 * თეთრისკენ, 5%-იანი ნაბიჯით, სანამ `min`-ს მიაღწევს.
 */
export function readable(color: string, surface: string, min = MIN_CONTRAST): string {
  const base = parse(color)
  const bg = parse(surface)
  if (!base || !bg) return color
  if (contrast(color, surface) >= min) return color

  const target: Rgb = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255]

  for (let step = 1; step <= 20; step++) {
    const w = step / 20
    const mixed = hex([0, 1, 2].map((i) => base[i] + (target[i] - base[i]) * w) as Rgb)
    if (contrast(mixed, surface) >= min) return mixed
  }

  return hex(target)
}

/**
 * სერიების CSS-ცვლადები — თითო სერიაზე ნათელი და მუქი ვარიანტი;
 * გრაფიკი `var(--series-N)`-ს კითხულობს (`seriesColor`).
 */
export function seriesVars(colors: (string | null | undefined)[]): CSSProperties {
  const vars: Record<string, string> = {}

  colors.slice(0, SERIES_SLOTS).forEach((color, i) => {
    const base = color && parse(color) ? color : FALLBACK[i % FALLBACK.length]
    vars[`--series-${i}-light`] = readable(base, CHART_SURFACE.light)
    vars[`--series-${i}-dark`] = readable(base, CHART_SURFACE.dark)
  })

  return vars as CSSProperties
}

export function seriesColor(index: number): string {
  return `var(--series-${index})`
}
