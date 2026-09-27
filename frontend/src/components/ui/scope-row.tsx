import type { ReactNode } from 'react'
import { RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

/* ============================================================
   **ფარგლების რადიო-რიგი** — radio + (არჩეულზე) თავისი ქვე-ფორმა.

   ⚠️ **სამი ასლი ერთ ფაილად** (Tasks §39): სინქრონიზაციის, თარგმნისა და
   გალერეის ჩამოტვირთვის ფანჯრებს ასო-ასო ერთი და იგივე `ScopeRow` ჰქონდა,
   მეოთხე მომხმარებელი კი (მსახიობების ფარგლები) ახალ ასლს დაბადებდა.

   ⚠️ **ბარათი აქ არ გამოდგება** — `CLAUDE.md`-ის „რა არ ხდება ბარათი":
   ყოველი ვარიანტი **თავის ქვე-ფორმას** შლის (ჩანაწერების ამრჩევი, „N დღე"),
   რასაც ბარათების რიგი ვერ იტევს, და `RadioGroup` აქ სწორი სემანტიკაა.
   ============================================================ */

export function ScopeRow<T extends string>({
  value,
  active,
  label,
  hint,
  children,
}: {
  value: T
  active: T
  label: string
  /** ვარიანტის საკუთარი ქვეხაზი — ვარიანტი თავის ახსნას თვითონ ამბობს (§8-ის წესი) */
  hint?: string
  children?: ReactNode
}) {
  const selected = active === value

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        selected ? 'border-primary bg-secondary/50' : 'border-border',
      )}
    >
      {/* select/multi-select <label>-ში ვერ ჯდება — მასზე დაჭერა radio-ს ააქტიურებდა */}
      <label className={cn('flex cursor-pointer gap-3', hint ? 'items-start' : 'items-center')}>
        <RadioGroupItem value={value} className={hint ? 'mt-0.5' : undefined} />
        <span className="min-w-0">
          <span className="text-sm font-medium">{label}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
      </label>
      {selected && children && <div className="mt-2 pl-8">{children}</div>}
    </div>
  )
}
