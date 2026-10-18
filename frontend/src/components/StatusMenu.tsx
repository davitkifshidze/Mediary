import { Check, ChevronDown } from 'lucide-react'
import type { Status } from '@/api/types'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { EnumStatusBadge, EnumStatusLabel, StatusBadge, StatusLabel } from '@/components/StatusBadge'
import type { EnumStatusDomain } from '@/lib/statuses'
import { cn } from '@/lib/utils'

/* ============================================================
   **enum-სტატუსის ჩამოსაშლელი — ერთი სიგანის ღილაკივით**.

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

/* ============================================================
   **ლექსიკონის სტატუსის ჩამოსაშლელი** — იგივე ფორმა, რაც
   ბუკმარკსა და პირად მოდულს რიგში აქვს: ტრიგერი `StatusBadge size="row"`-ია
   (`min-w-36`, ისარი ბოლოში), სია — ლექსიკონის სტატუსები აიქონითა და ფერით,
   არჩეულზე ✓. ვიდეოს სტრიქონსა და ბადეს სჭირდება (ბარათს სტატუსი ბეჯებშია).
   ============================================================ */

export function DictionaryStatusMenu({
  status,
  statuses,
  label,
  emptyLabel,
  onChange,
}: {
  status: Status | null
  statuses: readonly Status[]
  /** ტრიგერის `aria-label` */
  label: string
  /** სტატუსის გარეშე ჩანაწერის ტექსტი */
  emptyLabel: string
  onChange: (key: string) => void
}) {
  return (
    <ActionMenu
      label={label}
      trigger={
        <button type="button" className="cursor-pointer rounded-md">
          {status ? (
            <StatusBadge
              status={status}
              size="row"
              className="min-w-36 justify-between"
              trailing={<ChevronDown className="size-3.5 shrink-0 opacity-70" />}
            />
          ) : (
            <Badge size="row" className="min-w-36 justify-between bg-secondary">
              {emptyLabel}
              <ChevronDown className="size-3.5 shrink-0 opacity-70" />
            </Badge>
          )}
        </button>
      }
    >
      {statuses.map((s) => (
        <ActionMenuClose key={s.id} asChild>
          <button type="button" className={actionItemClass()} onClick={() => onChange(s.key)}>
            <Check className={cn('size-3.5', status?.id === s.id ? 'opacity-100' : 'opacity-0')} />
            <StatusLabel status={s} />
          </button>
        </ActionMenuClose>
      ))}
    </ActionMenu>
  )
}
