import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/videoDuration'

/* ============================================================
   ხანგრძლივობის შეყვანა (Tasks §2.5 → Tasks §39) — ერთი კომპონენტი ყველგან.

   ⚠️ **„წამების ერთი ველი" აღარ არსებობს.** ადრე ვიდეოსა და სიმღერას
   `type="number"` ეწერა წამებში (3735 = ?), ე.ი. მომხმარებელს თვითონ უნდა
   გადაეყვანა. ახლა **საათი + წუთი + წამი** შედის.

   ⚠️ **ბაზაში ისევ წამები ინახება.** კომპონენტი მხოლოდ შეყვანის ფორმაა:
   `value`/`onChange` წამებია, ე.ი. არც API, არც სქემა არ იცვლება.

   ## Tasks §39 — „საათებს რომ ვაწვები, ქვევით ხტება"
   ⚠️ **ერთი ჩარჩო, ერთი ხაზი** (`h-10`, როგორც მეზობელი ველები): სეგმენტები
   ჩარჩოს შიგნით უჩარჩოო ველებია, ერთეულები პატარად მათ გვერდით. ადრე სამი
   ცალკე `Input` + „საათებით" ღილაკი `flex-wrap`-ში იდგა — ~314 px-იან
   ველში ღილაკი ქვედა ხაზზე ჩადიოდა, ჯამი კი (ფორმის ცალკე `<span>`) —
   კიდევ უფრო ქვემოთ.
   ⚠️ **საათის სეგმენტი ყოველთვის ჩანს** (ცარიელი = 0) — გადამრთველი აღარ
   არის, ე.ი. ჩართვაზე არაფერი ემატება და არაფერი ხტება.
   ⚠️ **ჯამი კომპონენტის ნაწილია** — ჩარჩოს მარჯვენა ბოლოს, ჩამქრალად
   (`1:05:30`; წუთების რეჟიმში — „2 სთ 15 წთ"). ვიწრო ველში ის თვითონ
   იმალება (container query) — ხაზზე გადასვლის ნაცვლად.

   ⚠️ სეგმენტები **ლოკალურ სტრიქონულ state-შია** და არა წამებიდან
   გამოთვლილი: `mm` ველში „0"-ის აკრეფა წამებს ნულავს და გამოთვლილი
   სეგმენტი კურსორს გადაახტუნებდა. წამებში აწყობა მხოლოდ ცვლილებაზე ხდება.

   ⚠️ **ერთეული `unit`-ითაა და არა კომპონენტის ასლით.** სვეტები სხვადასხვა
   ერთეულშია (`videos.duration`/`songs.duration` — წამები;
   `movies.runtime`/`board_games.playtime_*` — წუთები), ე.ი. მეორე ასლი
   მაშინვე გაცდებოდა. `minutes` რეჟიმში **წამის სეგმენტი არ ჩანს** — ფილმის
   ხანგრძლივობას წამი არ აქვს და გამოჩენა მონაცემს ჩუმად დაამრგვალებდა.
   ============================================================ */

type Unit = 'seconds' | 'minutes'

interface Parts {
  h: string
  m: string
  s: string
}

function toParts(seconds: number | null): Parts {
  if (!seconds || seconds < 0) return { h: '', m: '', s: '' }
  const h = Math.floor(seconds / 3600)
  return {
    // ⚠️ საათი ცარიელია, როცა 0-ია — „0 სთ 5 წთ" ზედმეტი ნულია
    h: h ? String(h) : '',
    m: String(Math.floor((seconds % 3600) / 60)),
    s: String(Math.floor(seconds % 60)),
  }
}

function toSeconds(parts: Parts): number | null {
  const n = (raw: string) => {
    const value = Number(raw)
    return raw.trim() === '' || !Number.isFinite(value) || value < 0 ? 0 : Math.floor(value)
  }
  const total = n(parts.h) * 3600 + n(parts.m) * 60 + n(parts.s)
  // სამივე ცარიელი → „მითითებული არაა", არა 0
  return parts.h.trim() === '' && parts.m.trim() === '' && parts.s.trim() === '' ? null : total || null
}

export function DurationInput({
  id,
  value,
  onChange,
  unit = 'seconds',
  total = true,
  prefix,
  className,
}: {
  id?: string
  /** მნიშვნელობა **`unit`-ის ერთეულში** (`null` = მითითებული არაა) */
  value: number | null
  onChange: (value: number | null) => void
  /** სვეტის ერთეული — რაც `value`/`onChange`-ში დადის */
  unit?: Unit
  /** ჯამი ჩარჩოს მარჯვენა ბოლოს (ნაგულისხმევად — კი) */
  total?: boolean
  /** პატარა წარწერა ჩარჩოს დასაწყისში (მაგ. „მინ." / „მაქს." ერთ ხაზზე მდგარ წყვილში) */
  prefix?: string
  className?: string
}) {
  const { t } = useTranslation()
  const factor = unit === 'minutes' ? 60 : 1
  const seconds = value == null ? null : value * factor
  const out = (next: number | null) => onChange(next == null ? null : Math.round(next / factor))
  const minutes = useRef<HTMLInputElement>(null)

  const [parts, setParts] = useState<Parts>(() => toParts(seconds))

  // გარედან შემოსული მნიშვნელობა (probe, „სწრაფი შევსება", რედაქტირება)
  useEffect(() => {
    const next = toParts(seconds)
    setParts((prev) => (toSeconds(prev) === seconds ? prev : next))
  }, [seconds])

  const set = (key: keyof Parts, raw: string) => {
    const clean = raw.replace(/[^\d]/g, '')
    const next = { ...parts, [key]: clean }
    setParts(next)
    out(toSeconds(next))
  }

  const current = toSeconds(parts)
  const sum =
    current == null
      ? null
      : unit === 'seconds'
        ? formatDuration(current)
        : [
            current >= 3600 ? `${Math.floor(current / 3600)} ${t('duration.hours')}` : null,
            `${Math.floor((current % 3600) / 60)} ${t('duration.minutes')}`,
          ]
            .filter(Boolean)
            .join(' ')

  const segment = (key: keyof Parts, label: string, ref?: typeof minutes) => (
    // ⚠️ `<label>` — ერთეულზე დაჭერაც თავის სეგმენტს ააქტიურებს
    <label className="flex shrink-0 cursor-text items-baseline gap-0.5">
      <input
        ref={ref}
        id={key === 'h' ? id : undefined}
        className={cn('bg-transparent text-center text-sm tabular-nums outline-none placeholder:text-muted-foreground/60', key === 'h' ? 'w-8' : 'w-6')}
        inputMode="numeric"
        maxLength={key === 'h' ? 3 : 2}
        placeholder="0"
        aria-label={prefix ? `${prefix} — ${label}` : label}
        value={parts[key]}
        onChange={(e) => set(key, e.target.value)}
        onBlur={() => {
          // 90 წამი → 1 წთ 30 წმ (გადავარდნის ნორმალიზება)
          const next = toParts(toSeconds(parts))
          if (next.h !== parts.h || next.m !== parts.m || next.s !== parts.s) setParts(next)
        }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </label>
  )

  /* ჩარჩოს ცარიელ ადგილზე (ჯამზე, სეგმენტებს შორის) დაჭერა წუთებს ააქტიურებს —
     ის ველი, რომელიც ყველაზე ხშირად იწერება */
  const focusMinutes = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('label')) return
    e.preventDefault()
    minutes.current?.focus()
  }

  return (
    <div
      className={cn(
        '@container flex h-10 w-full min-w-0 cursor-text flex-nowrap items-center gap-1.5 overflow-hidden rounded-md border border-border bg-card px-3 shadow-sm',
        className,
      )}
      onMouseDown={focusMinutes}
      data-testid="duration-input"
    >
      {prefix && <span className="shrink-0 text-xs text-muted-foreground">{prefix}</span>}
      {segment('h', t('duration.hours'))}
      {segment('m', t('duration.minutes'), minutes)}
      {unit === 'seconds' && segment('s', t('duration.seconds'))}

      {total && sum && (
        // ⚠️ ვიწრო ველში ჯამი იმალება და არა ქვედა ხაზზე გადადის
        <span className="ml-auto shrink-0 truncate pl-1 text-xs tabular-nums text-muted-foreground @max-[14rem]:hidden" data-testid="duration-total">
          {sum}
        </span>
      )}
    </div>
  )
}
