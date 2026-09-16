import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ScopeCard, ScopeGroup, type ScopeCardSize } from '@/components/ui/scope-card'
import { cutStyle } from '@/lib/cutStyle'

/* ============================================================
   **ერთი სიის ურთიერთგამომრიცხავი ჭრილები — ბარათებად** (Tasks §2).

   შენი სიტყვები: „ჩანაწერების გვერდზე ეს ყველა, აქტიური, შეჩერებული,
   დასრულებული ქარდის მსგავს ტაბებად გადააკეთე შესაბამისი ფერებით და
   აიქონებით"; „ყველგან სადაც არის ტაბების მსგავსი რამ ან გადამრთველი".

   ⚠️ **ეს `GalleryScope`-ია, გაგანზოგადებული და გადმოტანილი.** კომპონენტი
   უკვე არსებობდა და ზუსტად ამას აკეთებდა, უბრალოდ `components/gallery/`-ში
   იჯდა და მისი ხატულების რუკა გალერეისა იყო. ცხრა სხვა ჭრილს იგივე
   სჭირდებოდა, ე.ი. ან ის ამოვიდოდა `ui/`-ში, ან მეორე ასლი დაიბადებოდა.

   ⚠️ **სახელიც შეიცვალა და ეს დაბრკოლების მოხსნაა**: `GalleryScope`
   **ტიპიც** იყო (`api/gallery.ts` — ჩამოტვირთვის სკოუპი), ე.ი. ერთ
   ფაილში ორივეს იმპორტი სახელს ეჯახებოდა.

   ⚠️ **ხატულა და ფერი რეესტრიდან მოდის** (`lib/cutStyle.ts`), თუ
   ამრჩევმა თავისი არ მისცა. მოდულის ჭრილებს **მოდულის** ფერი და ხატულა
   აქვთ (`modules.color` + `ModuleIcon`), ამიტომ `color`/`node` ორივე
   არჩევითია და რეესტრს ანაცვლებს.

   ⚠️ **`count === undefined` ≠ `count: 0`** — პირველი ნიშნავს „ამ ჭრილს
   რიცხვი არ აქვს" (`/purge`-ის წესი), მეორე კი „ცარიელია". ნულიანი
   ბარათი რჩება და კლიკადია, მხოლოდ ფერს კარგავს.
   ============================================================ */

export interface CutOption {
  key: string
  label: string
  /** ფასეტური მთვლელი; `undefined` = ამ ჭრილს რიცხვი არ აქვს */
  count?: number
  /** რიცხვის ნაცვლად — მოკლე ახსნა */
  hint?: string
  /** რეესტრის ხატულის ნაცვლად */
  icon?: LucideIcon
  /**
   * მზა ხატულა — მოდულის თავისი (`ModuleIcon`), რომელიც `LucideIcon` არაა.
   *
   * ⚠️ **`icon`-ს ანაცვლებს და არა ემატება**: ორივე რომ დაგვეხატა,
   * დომენის ბარათს ორი ხატულა ექნებოდა და არჩევანი ორაზროვანი გახდებოდა.
   */
  node?: ReactNode
  /** რეესტრის ტონის ნაცვლად — მაგ. `modules.color` */
  color?: string | null
  disabled?: boolean
}

export function CutTabs({
  label,
  options,
  value,
  onChange,
  size,
  layout,
}: {
  label?: string
  options: CutOption[]
  value: string
  onChange: (key: string) => void
  size?: ScopeCardSize
  layout?: 'grid' | 'inline'
}) {
  return (
    <ScopeGroup label={label} layout={layout}>
      {options.map((option) => {
        const fallback = cutStyle(option.key)
        const Icon = option.icon ?? fallback.icon

        return (
          <ScopeCard
            key={option.key}
            active={value === option.key}
            color={option.color ?? fallback.color}
            icon={option.node ?? <Icon className="size-4 text-[var(--mod)]" />}
            label={option.label}
            count={option.count}
            hint={option.hint}
            size={size}
            disabled={option.disabled}
            onClick={() => onChange(option.key)}
          />
        )
      })}
    </ScopeGroup>
  )
}
