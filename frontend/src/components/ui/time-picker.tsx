import { useMemo, useRef, useState } from 'react'
import { DateInput, DateSegment, TimeField } from 'react-aria-components'
import { Time } from '@internationalized/date'
import { useTranslation } from 'react-i18next'
import { Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================
   დროის ამრჩევი (2026-09-15).

   ⚠️ **რას ცვლის: `<input type="time">`.** ის ბრაუზერის საკუთარი ვიჯეტია —
   ყოველ ბრაუზერში სხვანაირად გამოიყურება, საათის ხატულას თვითონ ხატავს
   (მუქ თემაზე ხშირად საერთოდ არ ჩანს) და მის შიგთავსს CSS ვერ სწვდება.
   ე.ი. ერთადერთი ველი იყო მთელ აპში, რომელიც აპს არ ჰგავდა.

   ⚠️ **ბიბლიოთეკა: `react-aria-components`-ის `TimeField`** (+
   `@internationalized/date`). აღებულია იმიტომ, რომ ის **headless**-ია:
   მარკაპი და კლასები ჩვენია (იგივე ტოკენები, იგივე რადიუსი), ხოლო რთული
   ნაწილი — სეგმენტებზე ისრებით გადაადგილება, აკრეფა, `aria` როლები,
   ლოკალი — მისია. „ლამაზი, მაგრამ თავისი დიზაინის" ბიბლიოთეკა (MUI,
   Mantine, antd) აქ მთელ თემას მოიყოლებდა.

   ⚠️ **სეგმენტი და სვეტები ერთად დგას განზრახ.** სეგმენტებიანი ველი
   ზუსტი დროისთვისაა (17:43 აკრეფა ან ისრებით მიწევა), სვეტები კი სწრაფი
   არჩევისთვის — ორივე ერთსა და იმავე მნიშვნელობას წერს.

   ⚠️ **სვეტები *ჩაშლილი* ბლოკია და არა popover.** ეს ველი კალენდრის
   popover-ის შიგნითაც დგას (`DateTimePicker`) და მოდალშიც — popover
   popover-ში ან `overflow-y-auto`-თი მოჭრილი ფენა ზუსტად ის ხაფანგია,
   რაც `lib/layers.ts`-ში წერია. ჩაშლილი ბლოკი ვერსად ვერ მოიჭრება.

   ⚠️ **მნიშვნელობა რჩება `HH:mm` სტრიქონად** — ზუსტად ის, რასაც ბექენდი
   იღებს (`times_of_day`, `remind_at`). `Time` ობიექტი მხოლოდ კომპონენტის
   შიგნით არსებობს, თორემ ორი ფორმატი ორ ადგილას დაიწყებდა ცხოვრებას.
   ============================================================ */

/** სვეტში წუთების ბიჯი — 5 წუთი 12 რიგს იძლევა, ე.ი. სქროლის გარეშე იკითხება */
const MINUTE_STEP = 5

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `"09:00"` → `Time` (არასწორი ან ცარიელი → `null`) */
function parse(value: string | null | undefined): Time | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((value ?? '').trim())
  if (!m) return null

  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null

  return new Time(h, min)
}

export function TimePicker({
  id,
  value,
  onChange,
  /** სვეტების ბლოკი საერთოდ არ იხატება — მხოლოდ ველი */
  compact,
  /** გასუფთავების ჯვარი (როცა ცარიელი დრო ნებადართულია) */
  clearable,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  compact?: boolean
  clearable?: boolean
  className?: string
  'aria-label'?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const hourRef = useRef<HTMLDivElement>(null)

  const time = useMemo(() => parse(value), [value])

  const emit = (next: Time | null) => onChange(next ? `${pad(next.hour)}:${pad(next.minute)}` : null)

  const setHour = (h: number) => emit(new Time(h, time?.minute ?? 0))
  const setMinute = (m: number) => emit(new Time(time?.hour ?? 0, m))

  const cell = (active: boolean) =>
    cn(
      'cursor-pointer rounded-md px-2 py-1 text-center text-xs tabular-nums transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
    )

  return (
    <div className={cn('inline-flex flex-col gap-2', className)}>
      <div className="inline-flex items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/40">
        <TimeField
          id={id}
          aria-label={ariaLabel ?? t('dates.time')}
          value={time}
          onChange={(v) => emit(v ? new Time(v.hour, v.minute) : null)}
          /* ⚠️ 24-საათიანი ციკლი ცხადადაა მითითებული: აპში ყველგან `09:00`
             წერია, ბრაუზერის ლოკალი კი AM/PM-ს მოიტანდა და ერთ ეკრანზე
             ორი ფორმატი აღმოჩნდებოდა. */
          hourCycle={24}
          granularity="minute"
          shouldForceLeadingZeros
        >
          <DateInput className="flex items-center text-sm tabular-nums">
            {(segment) => (
              <DateSegment
                segment={segment}
                className={cn(
                  'rounded-[3px] px-0.5 outline-none tabular-nums',
                  'data-[focused]:bg-primary data-[focused]:text-primary-foreground',
                  'data-[placeholder]:text-muted-foreground',
                )}
              />
            )}
          </DateInput>
        </TimeField>

        {clearable && value && (
          <button
            type="button"
            onClick={() => emit(null)}
            aria-label={t('actions.clear')}
            className="grid size-5 cursor-pointer place-items-center rounded-md text-muted-foreground"
          >
            <X className="size-3" />
          </button>
        )}

        {!compact && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={t('dates.pickTime')}
            className={cn(
              'grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              open && 'bg-muted text-foreground',
            )}
          >
            <Clock className="size-3.5" />
          </button>
        )}
      </div>

      {open && !compact && (
        <div className="flex gap-2 rounded-md border border-border bg-popover p-2 shadow-sm">
          {/* საათები — გრძელი სია, ამიტომ სქროლი; მიმდინარე მონიშნულია */}
          <div ref={hourRef} className="fb-scroll grid max-h-44 grid-cols-2 gap-0.5 overflow-y-auto pr-1">
            {HOURS.map((h) => (
              <button key={h} type="button" className={cell(time?.hour === h)} onClick={() => setHour(h)}>
                {pad(h)}
              </button>
            ))}
          </div>

          <div className="w-px bg-border" />

          <div className="grid grid-cols-2 gap-0.5 self-start">
            {Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP).map((m) => (
              <button key={m} type="button" className={cell(time?.minute === m)} onClick={() => setMinute(m)}>
                {pad(m)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
