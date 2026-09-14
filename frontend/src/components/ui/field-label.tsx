import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/* ============================================================
   ველის ლეიბლი — სავალდებულოს ნიშანი + ინფო-აიქონი (Tasks §2.2 / §2.3).

   ⚠️ **ერთი კომპონენტი ორივე პუნქტისთვის, განზრახ.** ორივე „აიქონი
   ლეიბლის გვერდით, ჰოვერზე ახსნა"-ა; ცალკე რომ გაკეთებულიყო, ერთ ველზე
   ორი სხვადასხვა სტილის აიქონი აღმოჩნდებოდა.

   ⚠️ **წყარო `useModuleFields()`-ია და არა ხელით დაწერილი `*`** — ე.ი.
   მოდულის გვერდზე ველის „სავალდებულოდ" მონიშვნა ფორმაზე **ავტომატურად**
   ჩნდება. ძველი `<span className="text-destructive"> *</span>` სწორედ ის
   იყო, რაც თითო ფორმაზე ხელით იწერებოდა.

   ⚠️ **trigger `<button type="button">`-ია** — ფორმის შიგნით `<button>`
   ტიპის გარეშე submit-ია, ე.ი. ერთი ჰოვერის მაგივრად ჩანაწერი შეინახებოდა.
   ============================================================ */

export function FieldHint({
  hint,
  required,
  className,
}: {
  /** ახსნა გაუგებარ ველზე (§2.3) — მაგ. ბორდგეიმის „მექანიკები" */
  hint?: string
  /** სავალდებულო ველი (§2.2) — აიქონი წითელია */
  required?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  if (!hint && !required) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-label={required ? t('form.requiredHint') : hint}
          className={cn(
            'inline-grid size-4 shrink-0 cursor-help place-items-center rounded-md align-text-bottom transition-colors',
            required
              ? 'text-destructive hover:bg-destructive/15'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            className,
          )}
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {required && <p className="font-medium text-destructive">{t('form.requiredHint')}</p>}
        {hint && <p className={cn(required && 'mt-1')}>{hint}</p>}
      </TooltipContent>
    </Tooltip>
  )
}

export function FieldLabel({
  htmlFor,
  required,
  hint,
  className,
  children,
}: {
  htmlFor?: string
  required?: boolean
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Label htmlFor={htmlFor} className={cn('inline-flex items-center gap-1', className)}>
      {children}
      <FieldHint required={required} hint={hint} />
    </Label>
  )
}
