import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Chevron, DateLib, DayPicker, type DateRange, type MonthCaptionProps } from 'react-day-picker'
import { ka, enUS } from 'react-day-picker/locale'
import { CalendarCheck, CalendarDays, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAYER_POPUP } from '@/lib/layers'
import { nowClock, nowLocal, todayLocal, useDateFormat } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { TimePicker } from '@/components/ui/time-picker'
import 'react-day-picker/style.css'

/* ============================================================
   თარიღის პიქერი — ერთი კომპონენტი მთელ პროექტზე.

   ⚠️ **ბიბლიოთეკა `react-day-picker`-ია და ახალი არ ემატება**:
   სამივე რეჟიმი — ერთი თარიღი, რამდენიმე თარიღი,
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

   ⚠️ **„დღეს" / „ახლა"** — კალენდრის ძირში ერთი ღილაკი: თარიღზე „დღეს",
   დროიანზე „ახლა" (დღეს + მიმდინარე სთ:წთ), პერიოდზე „დღეს" დასაწყისად.
   დროიან ველზე დღის არჩევა ცარიელ დროს **მიმდინარე** საათით ავსებს (აქამდე
   ყოველთვის 09:00 იწერებოდა). ველს თავად არ ავსებს — ცარიელი = უცნობი;
   წინასწარ შევსება გამომძახებლის საქმეა, იქ სადაც „ახლა" აზრიანია (შეხსენება).
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

/* ---------- თვე → წელი: კალენდრის თავიდან ზემოთ ასვლა ----------
   შენი სიტყვები: „თვე და წელი რომ არის თავში, რომ ვაწვები უნდა გამოდიოდეს
   მიმდინარე წლის თვეები და ზემოთ წელი ეწეროს; წელს რომ დავაწვები — წლების
   სია, ვირჩევ წელს, მერე იმ წლის თვეები, მერე იმ თვის რიცხვები".

   ⚠️ **ბიბლიოთეკის `captionLayout="dropdown"` არ გამოდგა** — ის ორ
   ჩამოსაშლელს ხატავს და არა ხედებს. ამიტომ თავის წარწერა (`MonthCaption`)
   ღილაკია, თვეებისა და წლების ბადეები კი ჩვენია; დღეების ხედი ისევ
   `DayPicker`-ია (`month` მართულია, რომ არჩეული თვე იქ გაიხსნას).
   ⚠️ წლები 12-12-ით (3 × 4, როგორც თვეები) ისრებით — დაბადების თარიღიც
   რამდენიმე დაჭერაშია. */

type CalendarView = 'days' | 'months' | 'years'

/** თავის დაჭერა — `MonthCaption` კომპონენტია, ამიტომ მოქმედება კონტექსტით მიდის */
const DrillContext = createContext<(month: Date) => void>(() => {})

function DrillCaption({ calendarMonth, displayIndex: _index, children, ...div }: MonthCaptionProps) {
  const { t } = useTranslation()
  const open = useContext(DrillContext)

  return (
    <div {...div}>
      <button
        type="button"
        className="fb-cal-drill"
        title={t('dates.pickMonth')}
        data-testid="calendar-caption"
        onClick={() => open(calendarMonth.date)}
      >
        {children}
      </button>
    </div>
  )
}

const DRILL_COMPONENTS = { MonthCaption: DrillCaption }

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

type CalendarProps = ReturnType<typeof useCalendarProps>

/**
 * კალენდრის ხედი: დღეები · თვეები · წლები. `dayPicker` — `DayPicker`-ის
 * დამატებითი პროპები, `panel` — თვეების/წლების ბადე (დღეების ხედში `null`).
 *
 * ⚠️ **ბადე დღეების ხედის ჩარჩოშია** — იგივე `rdp-root fb-rdp` ფესვი, თავი
 * (`rdp-month_caption`, მსხვილი წარწერა), ისრები (`rdp-nav` + ბიბლიოთეკის
 * `Chevron`, ფერადი) და დღის ღილაკის ზომა/ფერები (`fb-cal-cell`): ხედიდან
 * ხედზე გადასვლისას მხოლოდ შიგთავსი იცვლება.
 * ⚠️ **თვის სახელი კალენდრის ლოკალიდანაა** (`DateLib`, იგივე, რაც დღეების
 * თავს წერს) და არა ბრაუზერის `Intl`-იდან — ბრაუზერს ქართულის მონაცემები
 * შეიძლება არ ჰქონდეს და თვეები ინგლისურად ჩამოვიდოდა, თავი კი ქართულად.
 */
function useCalendarView(selected: Date | undefined, calendar: CalendarProps) {
  const { t } = useTranslation()
  const [view, setView] = useState<CalendarView>('days')
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()))
  const year = month.getFullYear()
  const today = new Date()

  const drill = useCallback((at: Date) => {
    setMonth(startOfMonth(at))
    setView('months')
  }, [])

  const cell = (active: boolean, current: boolean) => cn('fb-cal-cell', current && !active && 'fb-cal-today')

  const frame = (testId: string, label: string, onLabel: (() => void) | null, step: number, prev: string, next: string, grid: ReactNode) => (
    <div className={cn('rdp-root', calendar.className)} data-testid={testId}>
      <div className="rdp-months">
        <nav className="rdp-nav">
          <button type="button" aria-label={prev} className="rdp-button_previous" onClick={() => setMonth(new Date(year - step, month.getMonth(), 1))}>
            <Chevron orientation="left" className="rdp-chevron" />
          </button>
          <button type="button" aria-label={next} className="rdp-button_next" onClick={() => setMonth(new Date(year + step, month.getMonth(), 1))}>
            <Chevron orientation="right" className="rdp-chevron" />
          </button>
        </nav>
        <div className="rdp-month">
          <div className="rdp-month_caption">
            {onLabel ? (
              <button type="button" className="fb-cal-drill" onClick={onLabel} title={t('dates.pickYear')} data-testid="calendar-year">
                <span className="rdp-caption_label">{label}</span>
              </button>
            ) : (
              <span className="rdp-caption_label tabular-nums">{label}</span>
            )}
          </div>
          {/* ⚠️ სიგანე შიგთავსისაა (`w-max`): სამი თანაბარი სვეტი უგრძესი სახელის სიგანით —
              თვის სახელი სრულად ჩანს და ფანჯარა საჭიროებისამებრ ფართოვდება; ქვედა
              ზღვარი დღეების ბადის სიგანეა (7 × `--rdp-day-width`); ტელეფონზე ორი სვეტი, რომ ეკრანს არ გასცდეს */}
          <div className="mt-1 grid w-max min-w-[252px] grid-cols-2 gap-1 sm:grid-cols-3" data-testid="calendar-grid">
            {grid}
          </div>
        </div>
      </div>
    </div>
  )

  let panel: ReactNode = null

  if (view === 'months') {
    const lib = new DateLib({ locale: calendar.locale })
    panel = frame(
      'calendar-months',
      String(year),
      () => setView('years'),
      1,
      t('dates.prevYear'),
      t('dates.nextYear'),
      Array.from({ length: 12 }, (_, m) => {
        const active = selected?.getFullYear() === year && selected.getMonth() === m
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            className={cell(active, today.getFullYear() === year && today.getMonth() === m)}
            onClick={() => {
              setMonth(new Date(year, m, 1))
              setView('days')
            }}
          >
            {lib.format(new Date(year, m, 1), 'LLLL')}
          </button>
        )
      }),
    )
  } else if (view === 'years') {
    const from = Math.floor(year / 12) * 12
    panel = frame(
      'calendar-years',
      `${from} – ${from + 11}`,
      null,
      12,
      t('dates.prevYears'),
      t('dates.nextYears'),
      Array.from({ length: 12 }, (_, i) => from + i).map((y) => (
        <button
          key={y}
          type="button"
          aria-pressed={selected?.getFullYear() === y}
          className={cn(cell(selected?.getFullYear() === y, today.getFullYear() === y), 'tabular-nums')}
          onClick={() => {
            setMonth(new Date(y, month.getMonth(), 1))
            setView('months')
          }}
        >
          {y}
        </button>
      )),
    )
  }

  return {
    panel,
    dayPicker: { month, onMonthChange: (next: Date) => setMonth(startOfMonth(next)), components: DRILL_COMPONENTS },
    /** `DayPicker`-ს `DrillContext`-ით ახვევს — თავის დაჭერა თვეებზე ადის */
    wrap: (node: ReactNode) => <DrillContext.Provider value={drill}>{node}</DrillContext.Provider>,
  }
}

/** ერთი თარიღის კალენდარი — თავიდან თვეებსა და წლებზე ადის; არჩეული თვე იხსნება */
function SingleCalendar({
  calendar,
  selected,
  onSelect,
}: {
  calendar: CalendarProps
  selected: Date | undefined
  onSelect: (date: Date | undefined) => void
}) {
  const view = useCalendarView(selected, calendar)
  return view.panel ?? view.wrap(<DayPicker {...calendar} {...view.dayPicker} mode="single" selected={selected} onSelect={onSelect} />)
}

/** პერიოდის კალენდარი (ორი თვე) — იგივე ასვლა თავიდან */
function RangeCalendar({
  calendar,
  selected,
  onSelect,
}: {
  calendar: CalendarProps
  selected: DateRange | undefined
  onSelect: (range: DateRange | undefined) => void
}) {
  const view = useCalendarView(selected?.from, calendar)
  return (
    view.panel ??
    view.wrap(<DayPicker {...calendar} {...view.dayPicker} mode="range" numberOfMonths={2} selected={selected} onSelect={onSelect} />)
  )
}

/** გახსნადი ბუდე — trigger + კალენდარი popover-ში; `children` იღებს `close`-ს („დღეს"/„ახლა" ხურავს) */
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
  children: (close: () => void) => React.ReactNode
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
            className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm shadow-sm focus:outline-none"
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
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:text-foreground"
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
          {children(() => setOpen(false))}
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
    // backend-ის `date_format` ვალიდაცია ჩავარდებოდა — ცარიელ დროს მიმდინარე ავსებს
    onChange(withTime ? `${day}T${nextTime || nowClock()}` : day)
  }

  return (
    <CalendarPopover
      id={id}
      text={value ? (withTime ? `${fmt.date(value)} · ${time}` : fmt.date(value)) : null}
      placeholder={placeholder ?? t('dates.pick')}
      onClear={() => onChange(null)}
    >
      {(close) => (
        <>
          <SingleCalendar calendar={calendar} selected={selected} onSelect={(d) => emit(d)} />
          {withTime && (
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">{t('dates.time')}</span>
              <TimePicker value={time} onChange={(v) => emit(selected ?? new Date(), v ?? nowClock())} />
            </div>
          )}
          <div className="mt-2 flex border-t border-border pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="date-today"
              onClick={() => {
                onChange(withTime ? nowLocal() : todayLocal())
                close()
              }}
            >
              {withTime ? <Clock className="size-3.5" /> : <CalendarCheck className="size-3.5" />}
              {t(withTime ? 'dates.now' : 'dates.today')}
            </Button>
          </div>
        </>
      )}
    </CalendarPopover>
  )
}


export interface DateRangeValue {
  from: string | null
  to: string | null
}

/** პერიოდი — `{ from, to }` (`YYYY-MM-DD`); აუდიტ-ლოგის ფილტრი */
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
      {() => (
        <>
          <RangeCalendar
            calendar={calendar}
            selected={selected}
            onSelect={(range) =>
              onChange({
                from: range?.from ? toISODate(range.from) : null,
                to: range?.to ? toISODate(range.to) : null,
              })
            }
          />
          {/* „დღეს" — დასაწყისად; დასასრული რჩება, თუ დღევანდელის შემდეგაა (ღია რჩება — მეორე დღე ირჩევა) */}
          <div className="mt-2 flex border-t border-border pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="date-today"
              onClick={() => {
                const today = todayLocal()
                onChange({ from: today, to: value.to && value.to >= today ? value.to : null })
              }}
            >
              <CalendarCheck className="size-3.5" />
              {t('dates.today')}
            </Button>
          </div>
        </>
      )}
    </CalendarPopover>
  )
}
