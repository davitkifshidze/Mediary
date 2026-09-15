import type { ReactNode } from 'react'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { cn } from '@/lib/utils'

/* ============================================================
   **ჭრილის ბარათი — ერთი ვიზუალი ოთხივე სექციისთვის** (2026-09-15).

   შენი სიტყვები: „მოთხოვნებში რომაა (რიგი, დამტკიცებული, უარყოფილი,
   ყველა) მინდა მსგავსი ვიზუალის იყოს, რაც მაქვს აუდიტ-ლოგში ტაბებ
   ქარდების სახით, ასევე სტატუსის მასობრივ შეცვლაშიც, ასევე მასობრივ
   წაშლაშიც".

   ⚠️ **ბარათი აუდიტიდან აქ ამოვიდა და იქ ასლი არ დარჩა.** ოთხივე გვერდი
   ერთსა და იმავე კითხვას სვამს („რომელ ჭრილში ვდგავარ"), ე.ი. ხატულის
   ზომა, ფერის ჩამოსვლა, აქტიურის მონიშვნა და ნულის ქცევა **ერთ ადგილას**
   უნდა ეწეროს — ოთხი ასლი პირველივე შესწორებაზე დაშორდებოდა და
   „აუდიტში ასეა, მოთხოვნებში სხვანაირად" ზუსტად ის იქნებოდა, რასაც
   მოთხოვნა ასწორებს.

   ⚠️ **ფერი inline `style`-ით ჩამოდის და არა კლასით** — Tailwind კლასს
   hex-იდან ვერ დაბადებს (`border-[#6366f1]` კომპილაციისას არ არსებობს),
   ამიტომ მნიშვნელობა ორ CSS-ცვლადში ზის, კლასები კი სტატიკურია.

   ⚠️ **მეორე ხაზი ან რიცხვია, ან მინიშნება, ან არაფერი.** აუდიტსა და
   მოთხოვნებს რიცხვი აქვთ (ფასეტური მთვლელი), მასობრივ წაშლას კი — არა:
   `/purge` **სხვისი** ბიბლიოთეკიდან შლის, ე.ი. ჩემი ჩანაწერების რიცხვი
   იქ ტყუილი იქნებოდა. ამიტომ `count` არასავალდებულოა და არა „0".

   ⚠️ **ნულიანი ბარათი რჩება და კლიკადია** — მხოლოდ ფერს კარგავს.
   „აქ არაფერი მომხდარა" პასუხია და არა დასამალი ფაქტი.

   ⚠️ **ანიმაცია აქ არ იწერება**: ბარათი `<button>`-ია, ე.ი. ხატულებს
   `index.css`-ის გლობალური წესი ისედაც ამოძრავებს (ურნა ირხევა, კალამი
   წერს). აქ დამატებული `hover:scale` მას გადაახურებდა.
   ============================================================ */

export function ScopeCard({
  active,
  color,
  icon,
  label,
  count,
  hint,
  onClick,
}: {
  active: boolean
  /** მოდულის/მოქმედების ტონი; `null` = მშობლის ნაგულისხმევი (ოქროსფერი) */
  color?: string | null
  icon: ReactNode
  label: string
  /** ფასეტური მთვლელი; `undefined` = ამ ჭრილს რიცხვი არ აქვს */
  count?: number
  /** რიცხვის ნაცვლად — მოკლე ახსნა (მაგ. „ფოტოები რჩება") */
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={modAccent(color) ?? MODULE_ACCENT_FALLBACK}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-left transition-colors',
        active
          ? 'border-[var(--mod)] bg-[var(--mod-soft)] text-foreground'
          : 'border-border hover:border-[var(--mod)]',
        !active && count === 0 && 'opacity-60',
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', active ? 'font-semibold' : 'font-medium')}>
          {label}
        </span>
        {count !== undefined && (
          <span className="block text-xs tabular-nums text-muted-foreground">{count}</span>
        )}
        {count === undefined && hint && (
          <span className="block truncate text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  )
}

/**
 * ბარათების ბადე — სათაურიანი ჯგუფი.
 *
 * ⚠️ სათაურზე `uppercase` განზრახ არ დგას: CSS-ის `text-transform`
 * მხედრულს **მთავრულად** აქცევს (იგივე წესი, რაც `FilterPanel`-ს აქვს).
 */
export function ScopeGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div>
      {label && <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {children}
      </div>
    </div>
  )
}
