import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { DayPicker, type DateRange } from 'react-day-picker'
import { ka, enUS } from 'react-day-picker/locale'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAYER_POPUP } from '@/lib/layers'
import { useDateFormat } from '@/lib/dates'
import { Input } from '@/components/ui/input'
import 'react-day-picker/style.css'

/* ============================================================
   თარიღის პიქერი (Tasks §2.8) — ერთი კომპონენტი მთელ პროექტზე.

   ⚠️ **ბიბლიოთეკა `react-day-picker`-ია და ახალი არ ემატება** (§2.8-ის
   გადაწყვეტილება): სამივე რეჟიმი — ერთი თარიღი, რამდენიმე თარიღი,
   პერიოდი — მასშივეა, ე.ი. dnd-kit-ის ჯიშის მეორე დამოკიდებულება
   1.4 MB bundle-ს არ ეხება.

   ⚠️ **სამი ექსპორტია და არა ერთი `mode` prop.** `value` ტიპი რეჟიმზეა
   დამოკიდებული (`string` / `string[]` / `{from,to}`); ერთ კომპონენტში
   ეს discriminated union-ს მოითხოვდა და ყოველ გამომძახებელს `as`-ს
   აწერდა.

   ⚠️ **ფორმატი ლოკალური სტრიქონია** (`YYYY-MM-DD`, დროსთან ერთად
   `YYYY-MM-DDTHH:mm`) — **ზუსტად ის, რასაც `<input type="date">` და
   `lib/utils`-ის `toDateTimeLocal`/`fromDateTimeLocal` იყენებს, ე.ი.
   ჩანაცვლება drop-in-ია და UTC-ს გადაყვანა ისევ ერთ ადგილას რჩება.
   `toISOString()` განზრახ არ გამოიყენება: თბილისის ღამის საათებში
   ერთი დღით უკან გადაიხტებოდა (იგივე ხაფანგი, რაც `lib/dates.ts`-შია).
   ============================================================ */

/** `Date` → `YYYY-MM-DD` ლოკალურად (არა UTC-ში) */
function toISODate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** `YYYY-MM-DD[THH:mm]` → `Date` (ლოკალური), არასწორზე `undefined` */
function fromISODate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const [datePart] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

function useCalendarProps() {
  const { i18n } = useTranslation()
  return {
    locale: i18n.language === 'ka' ? ka : enUS,
    // კვირა ორშაბათიდან — ქართული და ევროპული წესი
    weekStartsOn: 1 as const,
    showOutsideDays: true,
    className: 'fb-rdp',
  }
}

/** გახსნადი ბუდე — trigger + კალენდარი popover-ში */
function CalendarPopover({
  id,
  text,
  placeholder,
  onClear,
  children,
}: {
  id?: string
  text: string | null
  placeholder: string
  onClear?: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <PopoverPrimitive.Trigger asChild>
          {/* ⚠️ `type="button"` — ფორმის შიგნით ტიპის გარეშე submit-ია */}
          <button
            id={id}
            type="button"
            className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <span className={cn('truncate', !text && 'text-muted-foreground')}>
              {text ?? placeholder}
            </span>
            <CalendarDays className="size-4 shrink-0 opacity-60" />
          </button>
        </PopoverPrimitive.Trigger>
        {text && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="×"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            LAYER_POPUP,
            'fb-content rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl focus:outline-none',
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * ერთი თარიღი (`YYYY-MM-DD`), სურვილისამებრ საათითაც
 * (`YYYY-MM-DDTHH:mm` — `<input type="datetime-local">`-ის ფორმატი).
 */
export function DatePicker({
  id,
  value,
  onChange,
  withTime,
  placeholder,
}: {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  /** დროის ველიც გამოჩნდეს (ჩანაწერის „როდისთვის", შეხსენება) */
  withTime?: boolean
  placeholder?: string
}) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const calendar = useCalendarProps()

  const selected = fromISODate(value)
  const time = value?.includes('T') ? value.split('T')[1].slice(0, 5) : ''

  const emit = (date: Date | undefined, nextTime = time) => {
    if (!date) return onChange(null)
    const day = toISODate(date)
    // ⚠️ დროის გარეშე შენახვა 00:00-ს ნიშნავს; ველი ცარიელი რომ იყოს,
    // backend-ის `date_format` ვალიდაცია ჩავარდებოდა
    onChange(withTime ? `${day}T${nextTime || '09:00'}` : day)
  }

  return (
    <CalendarPopover
      id={id}
      text={value ? (withTime ? `${fmt.date(value)} · ${time}` : fmt.date(value)) : null}
      placeholder={placeholder ?? t('dates.pick')}
      onClear={() => onChange(null)}
    >
      <DayPicker {...calendar} mode="single" selected={selected} onSelect={(d) => emit(d)} />
      {withTime && (
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">{t('dates.time')}</span>
          <Input
            type="time"
            className="w-28"
            value={time}
            onChange={(e) => emit(selected ?? new Date(), e.target.value)}
          />
        </div>
      )}
    </CalendarPopover>
  )
}

/** რამდენიმე კონკრეტული თარიღი (`YYYY-MM-DD`-ების მასივი) */
export function DateMultiPicker({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const calendar = useCalendarProps()

  const selected = value.map((v) => fromISODate(v)).filter((d): d is Date => Boolean(d))

  return (
    <CalendarPopover
      id={id}
      text={value.length ? value.map((v) => fmt.date(v)).join(', ') : null}
      placeholder={placeholder ?? t('dates.pickMany')}
      onClear={() => onChange([])}
    >
      <DayPicker
        {...calendar}
        mode="multiple"
        selected={selected}
        onSelect={(days) => onChange((days ?? []).map(toISODate).sort())}
      />
    </CalendarPopover>
  )
}

export interface DateRangeValue {
  from: string | null
  to: string | null
}

/** პერიოდი — `{ from, to }` (`YYYY-MM-DD`); აუდიტ-ლოგის ფილტრი (§4.7) */
export function DateRangePicker({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const calendar = useCalendarProps()

  const selected: DateRange | undefined = value.from
    ? { from: fromISODate(value.from), to: fromISODate(value.to) }
    : undefined

  const text = value.from ? `${fmt.date(value.from)} – ${value.to ? fmt.date(value.to) : '…'}` : null

  return (
    <CalendarPopover
      id={id}
      text={text}
      placeholder={placeholder ?? t('dates.pickRange')}
      onClear={() => onChange({ from: null, to: null })}
    >
      <DayPicker
        {...calendar}
        mode="range"
        numberOfMonths={2}
        selected={selected}
        onSelect={(range) =>
          onChange({
            from: range?.from ? toISODate(range.from) : null,
            to: range?.to ? toISODate(range.to) : null,
          })
        }
      />
    </CalendarPopover>
  )
}
