import type { CSSProperties } from 'react'
import type { Status } from '@/api/types'

/* ============================================================
   **სტატუსის ფერი — თითოეულს თავისი** (Tasks §16.1).

   შენი სიტყვები: „დასრულებული და დაარქივებული რატომაა ორივე ერთი ფერი;
   ყველას სხვადასხვა ფერი უნდა ჰქონდეს და აიქონი". აქამდე ფერი **როლით**
   ირჩეოდა (`statusTone`), ე.ი. ორი `done` სტატუსი ერთ მწვანეში იხატებოდა.
   `statuses.color` სვეტი არსებობდა, მაგრამ არავინ ხატავდა.

   ფერი **ორი სახისაა**: პალიტრის გასაღები (`c1`…`c12` — CSS-ცვლადები
   `--status-c1…c12`, ორივე თემაში თავისი მნიშვნელობით) ან `#rrggbb`.
   ⚠️ **როლის ფერი ნაგულისხმევად რჩება** — `color` ცარიელზე ბეჯი ისევ
   `statusTone`-ის კლასებს იყენებს, ე.ი. აქაური ყველა ფუნქცია `undefined`-ს
   აბრუნებს და არსებული კლასები მოქმედებს; `color`-ზე კი inline `style`
   კლასებს ზემოდან ადგება.

   ⚠️ Tailwind-ის კლასი ფერის ცვლადიდან ვერ დაიბადება, ამიტომ `style`:
   რბილი ფონი `color-mix`-ით (15 %), აქტიური — სავსე, არააქტიური — წყვეტილი
   ჩარჩო და 10 % ფონი (`STATUS_ACTIVE/INACTIVE/BADGE`-ის იგივე სამი სახე).
   ============================================================ */

export const STATUS_PALETTE = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12'] as const

export type StatusPaletteKey = (typeof STATUS_PALETTE)[number]

const HEX = /^#[0-9a-f]{6}$/i

/** `c7` → `var(--status-c7)`, `#2f6b8f` → როგორც არის; უცნობი/ცარიელი → `null` */
export function resolveStatusColor(color: string | null | undefined): string | null {
  if (!color) return null
  if ((STATUS_PALETTE as readonly string[]).includes(color)) return `var(--status-${color})`
  if (HEX.test(color)) return color
  return null
}

/** სტატუსის საკუთარი ფერი (CSS-მნიშვნელობა) ან `null` — მაშინ როლის ფერი მოქმედებს */
export function statusColor(status: Pick<Status, 'color'> | null | undefined): string | null {
  return resolveStatusColor(status?.color)
}

export type StatusLook = 'badge' | 'active' | 'inactive' | 'icon'

/**
 * inline სტილი საკუთარი ფერისთვის; `undefined` — ფერი არ არის და კლასები რჩება.
 * `badge` — რბილი ფონი და ფერადი ტექსტი; `active` — სავსე; `inactive` — წყვეტილი
 * ჩარჩო; `icon` — მხოლოდ ფერი (მენიუს/სელექტის აიქონი).
 */
export function statusStyle(status: Pick<Status, 'color'> | null | undefined, look: StatusLook): CSSProperties | undefined {
  const color = statusColor(status)
  if (!color) return undefined

  switch (look) {
    case 'badge':
      return { backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color }
    case 'active':
      return { backgroundColor: color, borderColor: color, color: '#fff' }
    case 'inactive':
      return {
        borderColor: `color-mix(in oklab, ${color} 50%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        color,
      }
    case 'icon':
      return { color }
  }
}

/** გრაფიკის სეგმენტის ფერი — საკუთარი, თუ არის; სხვაგვარად მომწოდებლის ტონი */
export function statusFillColor(status: Pick<Status, 'color'> | null | undefined, fallback: string): string {
  return statusColor(status) ?? fallback
}
