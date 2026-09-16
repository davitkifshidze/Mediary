import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { InfoHint } from '@/components/ui/info-hint'

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

   ⚠️ **სხეული `ui/info-hint.tsx`-შია და აქ თხელი გარსი დარჩა** (Tasks §3).
   ორი მიზეზი: გვერდის დონის ახსნებს **იგივე** აიქონი და იგივე ქცევა
   სჭირდებათ, და ძველი `Tooltip` **შეხებაზე საერთოდ არ იხსნებოდა** —
   ე.ი. 179 გამოძახების ადგილი ტელეფონზე უჩუმრად უტექსტო იყო.
   ⚠️ **სავალდებულოს ნიშანი წითელი `i`-დან წითელ სამკუთხედად შეიცვალა**
   (შენი პასუხი, 2026-09-16): ორივე კრიტიკული ნიშანი ერთი ფიგურა უნდა
   იყოს მთელ აპში, თორემ „წითელი" ორ სხვადასხვა რამეს ნიშნავს.
   ============================================================ */

export function FieldHint({
  hint,
  required,
  className,
}: {
  /** ახსნა გაუგებარ ველზე (§2.3) — მაგ. ბორდგეიმის „ბმულები" */
  hint?: string
  /** სავალდებულო ველი (§2.2) — წითელი სამკუთხედი */
  required?: boolean
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <InfoHint
      info={hint}
      critical={required ? t('form.requiredHint') : undefined}
      className={className}
    />
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
