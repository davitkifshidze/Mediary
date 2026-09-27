import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2, Search, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FieldHint } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/* ============================================================
   **სწრაფი შევსების ერთი ბლოკი** (Tasks §26.2).

   TMDB · Open Library · RAWG · BGG · Nominatim · ბმულის შემოწმება — ყველა
   ფორმის თავში ერთი და იგივე ბარათი. აქამდე სამი სხვადასხვა სტილი იყო
   (ფილმს წყვეტილი ჩარჩო და ჯადოსნური ჯოხი, წიგნს/თამაშს/სამაგიდოს უბრალო
   ბარათი, ადგილს — ჩარჩოს გარეშე ველი), შედეგები კი ერთგან ბადედ,
   მეორეგან სიად იხატებოდა.

   ⚠️ **ბარათი კონტეინერია და არა ლოგიკა**: ძებნა, არჩევა და დრაფტის
   შერწყმა მოდულისაა (TMDB-ს კანდიდატები სჭირდება, BGG-ს მაღაზიებიც,
   ვიდეოს — ბმულის ჩასმა). აქ მხოლოდ ის წერია, რაც ყველგან ერთნაირია:
   სათაური, ველი + ღილაკი, შეტყობინება და შედეგების ბადე.

   ⚠️ **ბმულიან მოდულებში (ვიდეო, სიმღერა, ბუკმარკი, კურსი) სწრაფი შევსება
   თვითონ ბმულის ველია** — ჩასმისთანავე ივსება დანარჩენი. ამიტომ ბარათს
   `required`-იც აქვს: იქ ის ფორმის ნამდვილი ველია და არა ინსტრუმენტი.
   ============================================================ */

export function QuickFill({
  title,
  hint,
  htmlFor,
  required,
  icon,
  show = true,
  children,
}: {
  title: string
  hint?: string
  htmlFor?: string
  /** ბმულიან მოდულში ბარათი ფორმის ველიცაა (`url`) */
  required?: boolean
  icon?: ReactNode
  show?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn('rounded-xl border border-dashed border-primary/40 bg-secondary/40 p-4', !show && 'hidden')}>
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
        {icon ?? <Wand2 className="size-3.5 text-primary" />}
        {title}
        <FieldHint hint={hint} required={required} />
      </Label>
      {children}
    </div>
  )
}

/**
 * ველი + „ძებნა" — Enter ძებნას ნიშნავს და **ფორმას არ ინახავს**.
 */
export function QuickFillSearch({
  id,
  value,
  onChange,
  onSearch,
  busy,
  placeholder,
  buttonLabel,
  autoFocus,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  busy?: boolean
  placeholder?: string
  buttonLabel?: string
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const ready = value.trim() !== '' && !busy

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // ⚠️ ფორმის submit-ს ვაჩერებთ — Enter აქ „ძებნას" ნიშნავს
            e.preventDefault()
            if (ready) onSearch()
          }
        }}
      />
      <Button type="button" className="shrink-0" disabled={!ready} onClick={onSearch}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        {buttonLabel ?? t('form.lookupBtn')}
      </Button>
    </div>
  )
}

/**
 * ბარათის შეტყობინება — `info` (ვერაფერი მოიძებნა, ხელით შეავსე),
 * `error` (წყარო ვერ გაიხსნა) ან `warn` (წყარო მიუწვდომელია — ცხადად და
 * არა ცარიელ სიად, თორემ „ასეთი ჩანაწერი არ არსებობს" წაიკითხებოდა).
 */
export function QuickFillMessage({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error'
  children: ReactNode
}) {
  if (tone === 'warn') {
    return (
      <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        {children}
      </p>
    )
  }

  return (
    <p className={cn('mt-2 text-xs', tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  )
}

/** შედეგების ბადე — ყველა წყაროს ერთი ფორმა */
export function QuickFillResults({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      {label && <p className="mb-2 text-xs text-muted-foreground">{label}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

const THUMB: Record<'poster' | 'wide' | 'square', string> = {
  poster: 'h-14 w-10',
  wide: 'h-10 w-16',
  square: 'size-12',
}

/** ერთი კანდიდატი — სურათი, სახელი, მოკლე ფაქტები */
export function QuickFillCandidate({
  image,
  shape = 'poster',
  title,
  meta,
  onPick,
  disabled,
}: {
  image?: string | null
  /** `none` — წყაროს სურათი საერთოდ არ აქვს (ადგილი): ცარიელი ფილა ხმაური იქნებოდა */
  shape?: 'poster' | 'wide' | 'square' | 'none'
  title: string
  meta?: ReactNode
  onPick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:border-primary disabled:cursor-wait disabled:opacity-60"
    >
      {shape === 'none' ? null : image ? (
        <img src={image} alt="" className={cn(THUMB[shape], 'shrink-0 rounded object-cover')} />
      ) : (
        <span className={cn(THUMB[shape], 'shrink-0 rounded bg-muted')} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
      </span>
    </button>
  )
}
