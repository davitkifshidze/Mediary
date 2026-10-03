import { useTranslation } from 'react-i18next'
import { STATUS_PALETTE } from '@/lib/statusColor'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   **ფერის ამრჩევი — 12 ტონის პალიტრა + „ფერის გარეშე“** (Tasks §16.1 → §19.2).

   ⚠️ **სტატუსის დიალოგიდან გამოვიდა**: ვიდეოს ტიპს (§19.2) და ჟანრებს (§24.3)
   იგივე პალიტრა სჭირდებათ — მეორე ასლი ერთ კვირაში დაშორდებოდა. მნიშვნელობა
   პალიტრის გასაღებია (`c1…c12`, `lib/statusColor.ts`), `null` — „ფერი არ
   არის“: სტატუსზე ეს როლის ფერს ნიშნავს, ტიპზე — ნაცრისფერ ბეჯს, ამიტომ
   წარწერა გამომძახებლისაა (`noneLabel`).
   ============================================================ */

export function ColorPick({
  value,
  onChange,
  noneLabel,
  label,
  hint,
  error,
  className,
}: {
  value: string | null
  onChange: (value: string | null) => void
  /** რა ერქვას `null`-ს — „როლის ფერი“ · „ფერის გარეშე“ */
  noneLabel: string
  label?: string
  hint?: string
  error?: string
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div className={className}>
      {label && (
        <Label className="flex items-center gap-1.5">
          {label} {hint && <InfoHint info={hint} />}
        </Label>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          onClick={() => onChange(null)}
          className={cn(
            'h-8 cursor-pointer rounded-md border px-2.5 text-xs font-medium transition-colors',
            !value ? 'border-primary bg-secondary text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {noneLabel}
        </button>
        {STATUS_PALETTE.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            aria-label={t('statuses.colorPick', { n: key.slice(1) })}
            title={t('statuses.colorPick', { n: key.slice(1) })}
            onClick={() => onChange(key)}
            style={{ backgroundColor: `var(--status-${key})` }}
            className={cn(
              'size-8 cursor-pointer rounded-md border-2 transition-transform',
              value === key ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105',
            )}
          />
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
