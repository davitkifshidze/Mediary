import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

/* ============================================================
   გრაფიკების საერთო ნაწილები (FEAT-08 → 2026-09-19).

   ⚠️ **ბიბლიოთეკა SVG-ზეა და არა canvas-ზე და ეს არჩევანის მთავარი
   მიზეზია.** მთელი აპის თემა CSS-ცვლადებია (`var(--mod)`, `color-mix()`),
   ხოლო SVG-ის `fill`/`stroke` ცვლადს პირდაპირ კითხულობს — ე.ი. ბნელი
   თემა უფასოდ მუშაობს. canvas-ს (chart.js) ფერი **რიცხვად** სჭირდება,
   ე.ი. JS-ს თემა უნდა წაეკითხა და გადართვაზე ხელახლა დაეხატა — ზუსტად
   ის გზა, რომელზეც `useTheme()`-ს ამ პროექტში უკვე უარი ეთქვა.

   ⚠️ **ჭრილები ერთ ფაილშია, რომ ღერძი, ბადე და ტულტიპი ერთხელ
   განისაზღვროს.** ხუთი ჭრილი ხუთჯერ რომ წერდეს „რა ფერისაა ბადე",
   პირველივე შეცვლა ოთხს გამორჩებოდა.

   ⚠️ **ბადე და ღერძი მთლიანი თმისებრი ხაზია და არა წყვეტილი** — წყვეტილი
   „ზღვარს" ან „პროგნოზს" ნიშნავს, აქ კი უბრალოდ ბადეა.
   ============================================================ */

/** ბადის ფერი — ზედაპირიდან ერთი ტონით განსხვავებული */
export const CHART_GRID = 'var(--border)'

/** ღერძის წარწერა — ტექსტის ტოკენი და არა სერიის ფერი */
export const CHART_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 } as const

/** ზოლის მომრგვალებული ბოლო (4px) — საბაზისო ხაზზე მიმაგრებული */
export const BAR_RADIUS_X: [number, number, number, number] = [0, 4, 4, 0]
export const BAR_RADIUS_Y: [number, number, number, number] = [4, 4, 0, 0]

/**
 * გრაფიკის ჩარჩო.
 *
 * ⚠️ **სიმაღლე ღერძის ზოლსაც მოიცავს.** `ResponsiveContainer`-ს ფიქსირებული
 * მშობელი სჭირდება (პროცენტული სიმაღლე უმშობლოდ 0-ია), ხოლო თუ სიმაღლეში
 * მხოლოდ ნახაზს ჩავთვლით, ქვედა წარწერები ჩაიჭრება და ბარათში პატარა
 * ვერტიკალური სქროლი გაჩნდება.
 */
export function ChartFrame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  )
}

export interface TipRow {
  label: string
  value: number
  tone?: string | null
}

/**
 * ტულტიპი — თითო ნიშნულზე.
 *
 * ⚠️ **recharts-ის ნაგულისხმევი ტულტიპი inline სტილებზეა** (თეთრი ფონი,
 * შავი ჩარჩო), ე.ი. ბნელ თემაზე თეთრი ლაქაა. ამიტომ საკუთარია, აპის
 * ტოკენებით — იგივე ზედაპირი, რაც `Popover`-ს.
 */
export function ChartTip({ title, rows }: { title?: string; rows: TipRow[] }) {
  if (!rows.length) return null

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {title && <div className="mb-1 font-medium text-popover-foreground">{title}</div>}
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: row.tone ?? 'var(--mod)' }}
              aria-hidden
            />
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto font-medium tabular-nums text-popover-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * ღერძის წარწერის შემოკლება.
 *
 * ⚠️ **`mb`-უსაფრთხო არაა საჭირო — `slice` აქ სიმბოლოებზე მუშაობს** (JS-ის
 * სტრიქონი UTF-16-ია და მხედრული BMP-შია), ე.ი. ქართული ასო არ იჭრება.
 * სრული სახელი ტულტიპშია, ამიტომ შემოკლება ინფორმაციას არ კარგავს.
 */
export function clipLabel(value: string, max = 14): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
