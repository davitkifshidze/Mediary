import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/* ============================================================
   ხანგრძლივობის შეყვანა (Tasks §2.5) — ერთი კომპონენტი ყველგან.

   ⚠️ **„წამების ერთი ველი" აღარ არსებობს.** ადრე ვიდეოსა და სიმღერას
   `type="number"` ეწერა წამებში (3735 = ?), ე.ი. მომხმარებელს თვითონ უნდა
   გადაეყვანა. ახლა **წუთი + წამი** შედის, ხოლო საათი — გადამრთველით.

   ⚠️ **ბაზაში ისევ წამები ინახება.** კომპონენტი მხოლოდ შეყვანის ფორმაა:
   `value`/`onChange` წამებია, ე.ი. არც API, არც სქემა არ იცვლება.

   ⚠️ **საათის სეგმენტი თვითონ ჩნდება, თუ მნიშვნელობა ≥ 1 სთ** — ფილმის
   115 წუთს ხელით გადამრთველის ძებნა არ უნდა სჭირდებოდეს; გადამრთველი
   მაშინაა საჭირო, როცა **ცარიელიდან** გრძელ ჩანაწერს შეიყვან.

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
  return {
    h: String(Math.floor(seconds / 3600)),
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
  className,
}: {
  id?: string
  /** მნიშვნელობა **`unit`-ის ერთეულში** (`null` = მითითებული არაა) */
  value: number | null
  onChange: (value: number | null) => void
  /** სვეტის ერთეული — რაც `value`/`onChange`-ში დადის */
  unit?: Unit
  className?: string
}) {
  const { t } = useTranslation()
  const factor = unit === 'minutes' ? 60 : 1
  const seconds = value == null ? null : value * factor
  const out = (next: number | null) => onChange(next == null ? null : Math.round(next / factor))

  const [parts, setParts] = useState<Parts>(() => toParts(seconds))
  const [hours, setHours] = useState(() => (seconds ?? 0) >= 3600)

  // გარედან შემოსული მნიშვნელობა (probe, „სწრაფი შევსება", რედაქტირება)
  useEffect(() => {
    const next = toParts(seconds)
    setParts((prev) => (toSeconds(prev) === seconds ? prev : next))
    if ((seconds ?? 0) >= 3600) setHours(true)
  }, [seconds])

  const set = (key: keyof Parts, raw: string) => {
    const clean = raw.replace(/[^\d]/g, '')
    const next = { ...parts, [key]: clean }
    setParts(next)
    out(toSeconds(next))
  }

  const segment = (key: keyof Parts, label: string, max: number, first = false) => (
    <span className="flex items-center gap-1">
      <Input
        id={first ? id : undefined}
        className="w-16 text-center tabular-nums"
        inputMode="numeric"
        maxLength={key === 'h' ? 3 : 2}
        placeholder="0"
        aria-label={label}
        value={parts[key]}
        onChange={(e) => set(key, e.target.value)}
        onBlur={() => {
          // 90 წამი → 1 წთ 30 წმ (გადავარდნის ნორმალიზება)
          if (key !== 'h' && Number(parts[key]) > max) out(toSeconds(parts))
          setParts(toParts(toSeconds(parts)))
        }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  )

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {hours && segment('h', t('duration.hours'), 99, true)}
      {segment('m', t('duration.minutes'), 59, !hours)}
      {unit === 'seconds' && segment('s', t('duration.seconds'), 59)}

      {/* გადამრთველი — „2 სთ 20 წთ 10 წმ"-ის შესაყვანად (§2.5) */}
      <button
        type="button"
        onClick={() => setHours((on) => !on)}
        className={cn(
          'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
          hours ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted',
        )}
        // ⚠️ საათი მნიშვნელობით არ იშლება: ჩამალვა საათებს დაკარგავდა
        disabled={hours && (seconds ?? 0) >= 3600}
        title={t(hours ? 'duration.hideHours' : 'duration.showHours')}
      >
        <Clock className="size-3.5" />
        {t(hours ? 'duration.hideHours' : 'duration.showHours')}
      </button>
    </div>
  )
}
