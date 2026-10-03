import { Check, ChevronDown } from 'lucide-react'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { EnumStatusBadge, EnumStatusLabel } from '@/components/StatusBadge'
import type { EnumStatusDomain } from '@/lib/statuses'
import { cn } from '@/lib/utils'

/* ============================================================
   **enum-სტატუსის ჩამოსაშლელი — ერთი სიგანის ღილაკივით** (Tasks §16.4 → §29.1).

   შენი სიტყვები: „„მიმდინარე“ და „დასრულებული“ ერთნაირი სიგრძის ღილაკივით
   ჩამოსაშლელი". დასაჭერი თვითონ ბეჯია (`EnumStatusBadge size="row"`,
   `min-w-36`, ისარი ბოლოში), სია — პუნქტები აიქონითა და ფერით
   (`EnumStatusLabel`), არჩეულზე ✓. ზუსტად ის, რაც ბუკმარკს ლექსიკონის
   სტატუსზე აქვს — აქ წიგნის, თამაშის, კურსისა და ადგილის enum-ისთვის.

   ⚠️ `Select h-9 w-36` აღარ არის: ის სხვა ჩარჩოთი და სხვა ტექსტით იხატებოდა
   და რიგში ერთადერთი „ფორმის ველი" იყო ღილაკებს შორის.
   ============================================================ */

export function EnumStatusMenu<S extends string>({
  domain,
  value,
  options,
  label,
  onChange,
  className,
}: {
  domain: EnumStatusDomain
  value: S
  options: readonly S[]
  /** ტრიგერის `aria-label` — „სტატუსი" მოდულის ენაზე */
  label: string
  onChange: (next: S) => void
  className?: string
}) {
  return (
    <ActionMenu
      label={label}
      trigger={
        <button type="button" className={cn('cursor-pointer rounded-md', className)}>
          <EnumStatusBadge
            domain={domain}
            status={value}
            size="row"
            className="min-w-36 justify-between"
            trailing={<ChevronDown className="size-3.5 shrink-0 opacity-70" />}
          />
        </button>
      }
    >
      {options.map((s) => (
        <ActionMenuClose key={s} asChild>
          <button type="button" className={actionItemClass()} onClick={() => onChange(s)}>
            <Check className={cn('size-3.5', value === s ? 'opacity-100' : 'opacity-0')} />
            <EnumStatusLabel domain={domain} status={s} />
          </button>
        </ActionMenuClose>
      ))}
    </ActionMenu>
  )
}
