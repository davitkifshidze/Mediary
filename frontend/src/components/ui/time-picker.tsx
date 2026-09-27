import { useMemo } from 'react'
import { DateInput, DateSegment, TimeField } from 'react-aria-components'
import { Time } from '@internationalized/date'
import { useTranslation } from 'react-i18next'
import { Clock, X } from 'lucide-react'
import { parseClock, TimeWheelPopover } from '@/components/ui/time-wheel'
import { cn } from '@/lib/utils'

/* ============================================================
   დროის ამრჩევი (2026-09-15 → Tasks §23, 2026-09-27).

   ⚠️ **რას ცვლის: `<input type="time">`.** ის ბრაუზერის საკუთარი ვიჯეტია —
   ყოველ ბრაუზერში სხვანაირად გამოიყურება, საათის ხატულას თვითონ ხატავს
   (მუქ თემაზე ხშირად საერთოდ არ ჩანს) და მის შიგთავსს CSS ვერ სწვდება.
   ე.ი. ერთადერთი ველი იყო მთელ აპში, რომელიც აპს არ ჰგავდა.

   ⚠️ **ორი ნაწილი და ორივე ერთსა და იმავე `HH:mm`-ს წერს:**
   · **სეგმენტებიანი ველი** — `react-aria-components`-ის `TimeField`
     (headless: მარკაპი ჩვენია, ისრები/აკრეფა/`aria` — მისი). ზუსტი დროისა
     და ხელმისაწვდომობის მთავარი გზა.
   · **საათის ხატულა → ბორბლები** (`TimeWheelPopover`, §23.1): სწრაფი
     არჩევა საათივით, popover-ში, რომელიც გარეთ დაჭერაზე, დადასტურებაზე და
     `Escape`-ზე იხურება. ⚠️ აქამდე აქ ქვემოთ გაშლადი ბლოკი იყო, რომელიც
     **მხოლოდ ხატულით** იკეტებოდა და `Escape` მთელ მოდალს ხურავდა — სწორედ
     ეს იყო შენი შენიშვნა.

   ⚠️ **ველი `h-10`-ია** — დანარჩენი ველების სიმაღლე (§23.1; აქამდე ~32px).

   ⚠️ **მნიშვნელობა რჩება `HH:mm` სტრიქონად** — ზუსტად ის, რასაც ბექენდი
   იღებს (`times_of_day`, `remind_at`). `Time` ობიექტი მხოლოდ კომპონენტის
   შიგნით არსებობს, თორემ ორი ფორმატი ორ ადგილას დაიწყებდა ცხოვრებას.
   ============================================================ */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `"09:00"` → `Time` (არასწორი ან ცარიელი → `null`) */
function parse(value: string | null | undefined): Time | null {
  const clock = parseClock(value)

  return clock ? new Time(clock[0], clock[1]) : null
}

export function TimePicker({
  id,
  value,
  onChange,
  /** ბორბლების ხატულა საერთოდ არ იხატება — მხოლოდ ველი */
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

  const time = useMemo(() => parse(value), [value])

  const emit = (next: Time | null) => onChange(next ? `${pad(next.hour)}:${pad(next.minute)}` : null)

  return (
    <div
      className={cn(
        'inline-flex h-10 items-center gap-1 rounded-md border border-input bg-transparent px-2',
        className,
      )}
    >
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
          className="grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground"
        >
          <X className="size-3" />
        </button>
      )}

      {!compact && (
        <TimeWheelPopover value={value} onConfirm={(v) => onChange(v)} align="end">
          <button
            type="button"
            aria-label={t('dates.pickTime')}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground data-[state=open]:text-foreground"
          >
            <Clock className="size-4" />
          </button>
        </TimeWheelPopover>
      )}
    </div>
  )
}
