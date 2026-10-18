import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { StatNamed, StatStatus } from '@/api/stats'

/* ============================================================
   **სტატისტიკიდან სიაზე**.

   შენი სიტყვები: „სტატისტიკაში რომ დააჭერ რომელიმე კატეგორიას ან რამეს,
   შეგეძლოს, რომ გალინკო შესაბამის გვერდზე, შესაბამისი ფილტრით".

   ⚠️ **ბმული ერთ ადგილას იწყობა — აქ.** პარამეტრის სახელები სიის გვერდების
   წესია (თითო გვერდი URL-იდან თავის ფილტრს კითხულობს: მედია ჟანრს `slug`-ით,
   ვიდეო ტიპს `type`-ით, კურსი სტატუსს `status`-ით …), ე.ი. მათ გვერდებთან
   ახლოს ვინახავთ და არა სერვერზე; სერვერი მხოლოდ ჟანრის `slug`-ს ამატებს.

   ⚠️ **ზოლი და სია ერთ სვეტს ითვლის** — თვე „როდის დავასრულე"-ა (`done`),
   მედიაზე ნახვების ჟურნალი (`watched`), ქულა — **შენი** (`my_rating_*`);
   ფილტრები `LibraryStats::drill()`-შია და ზოლის რიცხვს ემთხვევა.
   ============================================================ */

/** URL-ის ჭრილი, რომელსაც სტატისტიკის ზოლი სიაში ტოვებს (`LibraryStats::drill()`) */
const DRILL_KEYS = ['done', 'watched', 'year_min', 'year_max', 'my_rating_min', 'my_rating_max'] as const

const MEDIA = ['movie', 'series', 'anime']

/** ჟანრის/კატეგორიის/ტიპის პარამეტრი სიის გვერდზე; პირადი მოდული — `category` */
const CLASSIFIER_PARAM: Record<string, string> = {
  movie: 'genre',
  series: 'genre',
  anime: 'genre',
  video: 'type',
  song: 'genre',
  book: 'genre',
  game: 'genre',
  board_game: 'genre',
  note: 'category',
  bookmark: 'category',
  course: 'category',
  place: 'category',
}

/** კურსსა და ადგილს სტატუსი ფილტრის პანელშია (`?status=`), სხვებს — საიდბარის სექცია (`?view=`) */
const STATUS_PARAM: Record<string, string> = { course: 'status', place: 'status' }

/** რომელ მოდულს აქვს სია, რომელიც ჭრილს იღებს (გალერეას და მორიგეობას — არა) */
function listed(module: string): boolean {
  return module in CLASSIFIER_PARAM || /^c\d+-/.test(module)
}

function link(route: string, params: Record<string, string>): string {
  return `${route}?${new URLSearchParams(params).toString()}`
}

export function statusLink(module: string, route: string, status: StatStatus): string | null {
  if (!status.key || !listed(module)) return null
  return link(route, { [STATUS_PARAM[module] ?? 'view']: status.key })
}

/** ჟანრი/კატეგორია/ტიპი; „სხვა" (`id = 0`) ერთი ჟანრი არაა — ბმული არ აქვს */
export function genreLink(module: string, route: string, row: StatNamed): string | null {
  if (!row.id || !listed(module)) return null
  if (MEDIA.includes(module)) return row.slug ? link(route, { genre: row.slug }) : null
  return link(route, { [CLASSIFIER_PARAM[module] ?? 'category']: String(row.id) })
}

export function yearLink(module: string, route: string, year: number): string | null {
  return listed(module) ? link(route, { year_min: String(year), year_max: String(year) }) : null
}

/** ქულის კალათა `round()`-ია (6.5 → 7), ე.ი. 7-ის ზოლი 6.5…7.4-ია */
export function ratingLink(module: string, route: string, score: number): string | null {
  if (!listed(module)) return null
  return link(route, { my_rating_min: (score - 0.5).toFixed(1), my_rating_max: (score + 0.4).toFixed(1) })
}

/** თვე: მედია — ნახვები, სხვა — დასრულება; მორიგეობა — იმ თვის კალენდარი */
export function monthLink(module: string, route: string, year: number, month: number): string | null {
  const ym = `${year}-${String(month).padStart(2, '0')}`
  if (module === 'duty') return link(route, { date: `${ym}-01` })
  if (!listed(module)) return null
  return link(route, { [MEDIA.includes(module) ? 'watched' : 'done']: ym })
}

/**
 * სიის გვერდისთვის — სტატისტიკიდან მოსული ჭრილი API-ის ფილტრად
 * (`{ ...filters, ...drill }`). ⚠️ `except` — რასაც გვერდი თვითონ კითხულობს
 * (მედიის წელი ფილტრის პანელშია).
 */
export function useDrillParams(except: readonly string[] = []): Record<string, string> {
  const [params] = useSearchParams()
  const key = params.toString()

  return useMemo(() => {
    const found = new URLSearchParams(key)
    return Object.fromEntries(
      DRILL_KEYS.filter((k) => !except.includes(k) && found.get(k)).map((k) => [k, found.get(k) as string]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, except.join(',')])
}

/** ჩიპის სახე: რა ჭრილია და რომელი პარამეტრები იშლება მასთან ერთად */
export interface DrillChip {
  kind: 'done' | 'watched' | 'year' | 'rating'
  value: string
  keys: string[]
}

/** აქტიური ჭრილები ჩიპებად — წლის და ქულის წყვილი ერთ ჩიპად */
export function drillChips(drill: Record<string, string>): DrillChip[] {
  const chips: DrillChip[] = []
  if (drill.done) chips.push({ kind: 'done', value: drill.done, keys: ['done'] })
  if (drill.watched) chips.push({ kind: 'watched', value: drill.watched, keys: ['watched'] })

  const range = (min?: string, max?: string) => (min && max ? (min === max ? min : `${min}–${max}`) : min ? `≥ ${min}` : `≤ ${max}`)
  if (drill.year_min || drill.year_max) {
    chips.push({ kind: 'year', value: range(drill.year_min, drill.year_max), keys: ['year_min', 'year_max'] })
  }
  if (drill.my_rating_min || drill.my_rating_max) {
    const min = Number(drill.my_rating_min)
    const max = Number(drill.my_rating_max)
    // ერთი კალათა (6.5…7.4) ერთ ქულად იკითხება — „7"
    const whole = Number.isFinite(min) && Number.isFinite(max) && Math.abs(max - min - 0.9) < 0.01
    chips.push({
      kind: 'rating',
      value: whole ? String(Math.round(min + 0.5)) : range(drill.my_rating_min, drill.my_rating_max),
      keys: ['my_rating_min', 'my_rating_max'],
    })
  }
  return chips
}
