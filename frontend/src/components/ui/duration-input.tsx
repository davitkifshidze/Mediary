import { useEffect, useState, type KeyboardEvent } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from '@ncdai/react-wheel-picker'
import '@ncdai/react-wheel-picker/style.css'
import { useTranslation } from 'react-i18next'
import { Check, Clock } from 'lucide-react'
import { LAYER_POPUP } from '@/lib/layers'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/videoDuration'
import { Button } from '@/components/ui/button'
import { NumberPick } from '@/components/ui/number-pick'
import { WHEEL_CLASSES } from '@/components/ui/time-wheel'

/* ============================================================
   **ხანგრძლივობის შეყვანა — ორი ფორმა, ერთეულის მიხედვით**.

   შენი სიტყვები: „ვიდეოს ხანგრძლივობა ესეთი ინფუთი საშინელებაა, რამე სხვა
   მოიფიქრე". სამი პატარა სეგმენტი (სთ/წთ/წმ) აღარ არის:

   · **წამები** (ვიდეო, სიმღერა) — **ერთი ველი**, რომელიც ტექსტს კითხულობს:
     `1:05:30`, `65:30`, `90` (წამი), `1სთ 5წთ`, `1h 5m 30s`. თუ აკრეფილი
     ფორმატირებულს არ ემთხვევა, გვერდით ექო ჩანს („= 1:05:30"), ველიდან
     გასვლისას კი ტექსტი თვითონ ფორმატირდება. საათის ხატულა — ბორბლები
     სთ/წთ/წმ (`TimeWheelPopover`-ის იგივე ბიბლიოთეკა და სტილი), მნიშვნელობა
     მხოლოდ დადასტურებაზე იწერება.
   · **წუთები** (ფილმი, სამაგიდო) — `NumberPick` მზა ვარიანტებით
     5·10·15·30·45·60·90·120 + „სხვა"; ნული/ცარიელი = „არ არის".

   ⚠️ `value`/`onChange` **სვეტის ერთეულშია** (`unit`): `videos.duration`/
   `songs.duration` — წამები, `movies.runtime`/`board_games.playtime_*` —
   წუთები. ფორმები და სერვერი არ იცვლება.
   ============================================================ */

type Unit = 'seconds' | 'minutes'

/** წუთებიანი ფორმების მზა ვარიანტები */
const MINUTE_PRESETS = [5, 10, 15, 30, 45, 60, 90, 120]

const UNIT_SECONDS: [RegExp, number][] = [
  [/^(h|hr|hrs|hours?|სთ|საათ\p{L}*)$/u, 3600],
  [/^(m|min|mins|minutes?|წთ|წუთ\p{L}*)$/u, 60],
  [/^(s|sec|secs|seconds?|წმ|წამ\p{L}*)$/u, 1],
]

/**
 * ტექსტი → წამები. `null` — ცარიელი (მითითებული არაა), `undefined` — ვერ წავიკითხე.
 * `1:05:30` · `65:30` (წთ:წმ) · `90` (წამი) · `1სთ 5წთ` · `1h 5m 30s`.
 */
export function parseDuration(raw: string): number | null | undefined {
  const text = raw.trim().toLowerCase()
  if (text === '') return null

  if (/^\d+(:\d{1,2}){1,2}$/.test(text)) {
    const parts = text.split(':').map(Number)
    const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]]
    // ⚠️ პირველი ნაწილი თავისუფალია (`65:30`), შემდეგები — 60-მდე
    if ((parts.length === 3 && m > 59) || s > 59) return undefined
    return h * 3600 + m * 60 + s || null
  }

  if (/^\d+$/.test(text)) return Number(text) || null

  let total = 0
  const tokens = [...text.matchAll(/(\d+)\s*([\p{L}]+)/gu)]
  const rest = text.replace(/(\d+)\s*([\p{L}]+)/gu, '').trim()
  if (tokens.length === 0 || rest !== '') return undefined
  for (const [, n, unit] of tokens) {
    const factor = UNIT_SECONDS.find(([re]) => re.test(unit))?.[1]
    if (!factor) return undefined
    total += Number(n) * factor
  }

  return total || null
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
  /** წამების ველში ფორმატირებული ექო (ნაგულისხმევად — კი) */
  total?: boolean
  /** პატარა წარწერა წინ (მაგ. „მინ." / „მაქს." ერთ ხაზზე მდგარ წყვილში) */
  prefix?: string
  className?: string
}) {
  return unit === 'minutes' ? (
    <MinutesPick id={id} value={value} onChange={onChange} prefix={prefix} className={className} />
  ) : (
    <SecondsField id={id} value={value} onChange={onChange} total={total} prefix={prefix} className={className} />
  )
}

/** წუთები — მზა ვარიანტები + „სხვა"; ⚠️ `NumberPick` ნულს „არ არის"-ად ხატავს, ჩვენ კი `null`-ად ვაბრუნებთ */
function MinutesPick({
  id,
  value,
  onChange,
  prefix,
  className,
}: {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  prefix?: string
  className?: string
}) {
  const { t } = useTranslation()
  const label = (n: number) => {
    const h = Math.floor(n / 60)
    const m = n % 60
    return [h ? `${h} ${t('duration.hours')}` : null, m || !h ? `${m} ${t('duration.minutes')}` : null].filter(Boolean).join(' ')
  }

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1.5', className)} data-testid="duration-input">
      {prefix && <span className="shrink-0 text-xs text-muted-foreground">{prefix}</span>}
      <NumberPick
        id={id}
        className="min-w-0 flex-1"
        value={value ?? 0}
        onChange={(n) => onChange(n > 0 ? n : null)}
        options={MINUTE_PRESETS}
        allowNone
        noneLabel={t('duration.none')}
        format={label}
        max={6000}
      />
    </div>
  )
}

function SecondsField({
  id,
  value,
  onChange,
  total,
  prefix,
  className,
}: {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  total: boolean
  prefix?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => formatDuration(value) ?? '')
  const parsed = parseDuration(text)
  const invalid = parsed === undefined

  // გარედან შემოსული მნიშვნელობა (ბმულის probe, რედაქტირება) — ტექსტს ვანაცვლებთ, თუ სხვას ამბობს
  useEffect(() => {
    setText((prev) => (parseDuration(prev) === value ? prev : (formatDuration(value) ?? '')))
  }, [value])

  const type = (raw: string) => {
    setText(raw)
    const next = parseDuration(raw)
    if (next !== undefined) onChange(next)
  }

  // აკრეფილი ფორმატირებულს არ ემთხვევა („90" → „1:30") — ექო ამბობს, როგორ წაიკითხა
  const echo = !invalid && parsed != null && text.trim() !== formatDuration(parsed) ? formatDuration(parsed) : null

  return (
    <div
      className={cn(
        '@container flex h-10 w-full min-w-0 items-center gap-1.5 rounded-md border bg-card pl-3 pr-1 shadow-sm',
        invalid ? 'border-destructive' : 'border-border',
        className,
      )}
      data-testid="duration-input"
    >
      {prefix && <span className="shrink-0 text-xs text-muted-foreground">{prefix}</span>}
      <input
        id={id}
        className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground/60"
        inputMode="text"
        placeholder="1:05:30"
        aria-label={prefix}
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => type(e.target.value)}
        onBlur={() => {
          if (!invalid) setText(formatDuration(parsed) ?? '')
        }}
      />
      {total && (echo || invalid) && (
        <span
          className={cn('shrink-0 truncate text-xs tabular-nums @max-[12rem]:hidden', invalid ? 'text-destructive' : 'text-muted-foreground')}
          data-testid="duration-total"
        >
          {invalid ? t('duration.invalid') : `= ${echo}`}
        </span>
      )}
      <DurationWheel
        value={invalid ? null : parsed}
        onConfirm={(seconds) => {
          setText(formatDuration(seconds) ?? '')
          onChange(seconds)
        }}
      />
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const range = (n: number, label: (i: number) => string): WheelPickerOption<number>[] =>
  Array.from({ length: n }, (_, i) => ({ value: i, label: label(i) }))
const HOURS = range(100, String)
const SIXTY = range(60, pad)

/** საათის ხატულა → სთ/წთ/წმ ბორბლები; ⚠️ მონახაზია — ველი მხოლოდ დადასტურებაზე იცვლება */
function DurationWheel({ value, onConfirm }: { value: number | null; onConfirm: (seconds: number | null) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [h, setH] = useState(0)
  const [m, setM] = useState(0)
  const [s, setS] = useState(0)

  // ყოველ გახსნაზე ველის ახლანდელი მნიშვნელობიდან
  useEffect(() => {
    if (!open) return
    const v = value ?? 0
    setH(Math.min(99, Math.floor(v / 3600)))
    setM(Math.floor((v % 3600) / 60))
    setS(v % 60)
  }, [open, value])

  const seconds = h * 3600 + m * 60 + s
  const confirm = () => {
    onConfirm(seconds || null)
    setOpen(false)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t('duration.pick')}
          title={t('duration.pick')}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:text-foreground"
          data-testid="duration-wheel"
        >
          <Clock className="size-4" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={4}
          onKeyDown={onKeyDown}
          className={cn(
            LAYER_POPUP,
            'fb-content w-80 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl focus:outline-none',
          )}
        >
          <WheelPickerWrapper>
            <div className="flex-1" role="group" aria-label={t('duration.hours')}>
              <WheelPicker options={HOURS} value={h} onValueChange={setH} classNames={WHEEL_CLASSES} />
            </div>
            <div className="flex-1" role="group" aria-label={t('duration.minutes')}>
              <WheelPicker options={SIXTY} value={m} onValueChange={setM} infinite classNames={WHEEL_CLASSES} />
            </div>
            <div className="flex-1" role="group" aria-label={t('duration.seconds')}>
              <WheelPicker options={SIXTY} value={s} onValueChange={setS} infinite classNames={WHEEL_CLASSES} />
            </div>
          </WheelPickerWrapper>
          <div className="mt-1 grid grid-cols-3 text-center text-xs text-muted-foreground">
            <span>{t('duration.hours')}</span>
            <span>{t('duration.minutes')}</span>
            <span>{t('duration.seconds')}</span>
          </div>

          <Button type="button" size="sm" className="mt-3 w-full" onClick={confirm} data-testid="duration-wheel-confirm">
            <Check className="size-3.5" />
            {t('duration.confirm', { time: formatDuration(seconds) ?? '0:00' })}
          </Button>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
