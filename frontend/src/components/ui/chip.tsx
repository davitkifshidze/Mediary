import type { ComponentProps, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================
   ჩიპი — გადამრთველი პილული (2026-09-12).

   ⚠️ **თორმეტი ასლი იყო.** ერთი და იგივე სტრიქონი —
   `cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors`
   + „აქტიურზე `border-primary bg-secondary`" — ხელით ეწერა გალერეის
   კატეგორიებს, ჯგუფების სქესის რიგს, ჩამოტვირთვის დიალოგის ოთხ რიგს,
   ვებძებნის ხალხს, ლექსიკონების გადამრჩევს, ხილვადობის მენეჯერს,
   საცავის ბიბლიოთეკასა და საჯარო პროფილს. ამიტომ იყვნენ სხვადასხვანაირად
   ჩაჭყლეტილი: `px-2 py-0.5`, `px-2.5 py-1`, `px-3 py-1`, `px-3 py-1.5`,
   `px-4 py-1.5` — ხუთი განსხვავებული პადინგი ერთსა და იმავე ელემენტზე.

   ⚠️ **პადინგი განზრახ გაიზარდა** — „უფრო დიდი პადინგი" შენი პირდაპირი
   მითითებაა; აქ ის ერთხელ წერია და თორმეტივე ადგილს ეხება.

   ⚠️ **რადიუსი `rounded-md`-ია და არა `rounded-full` (2026-09-13, ეტაპი 4).**
   აქ ადრე ეწერა „ჩიპი პილულაა და წრე უნდა დარჩეს" — სწორედ ეს დაშვება იყო
   მცდარი: შენ დასახელებული ხუთივე მაგალითი (`ფილმები` · `ყველა` ·
   `კადრი 14` · `სერიალები` · `ფოტოიანი`) ჩიპია, ე.ი. „ისევ მრგვალია"
   ზუსტად ამ ხაზს ნიშნავდა. `rounded-md` = `var(--radius)` = **5px**, ერთი
   წყაროდან (`index.css`-ის `@theme inline`) — ლიტერალი `rounded-[5px]`
   არსად იწერება.
   ============================================================ */

export type ChipSize = 'sm' | 'md'

const SIZES: Record<ChipSize, string> = {
  sm: 'gap-1.5 px-3 py-1.5 text-xs',
  md: 'gap-2 px-4 py-2 text-sm',
}

export function Chip({
  active,
  size = 'sm',
  icon,
  count,
  remove,
  className,
  children,
  ...props
}: {
  active?: boolean
  size?: ChipSize
  icon?: ReactNode
  /** რიცხვი ჩიპის ბოლოში — „კადრი 14" (0-იანი კატეგორია საერთოდ არ იხატება) */
  count?: number | null
  /**
   * ბოლოში მოხსნის ჯვარი — ფილტრების პანელის „მონიშნულის მოხსნა" (შენი
   * მითითება, 2026-09-14: „x მარჯვენა მხარეს გადაიტანე და ჰოვერზე წითელი").
   *
   * ⚠️ **ჯვარი ცალკე ღილაკი არ არის და ვერც იქნება** — ჩიპი თვითონაა
   * `<button>`, ღილაკი ღილაკში კი არასწორი HTML-ია. ის *ნიშანია*: ჩიპზე
   * დაჭერა ისედაც მოხსნაა, ჯვარი კი ამას ამბობს და ჰოვერზე წითლდება.
   */
  remove?: boolean
  children: ReactNode
} & Omit<ComponentProps<'button'>, 'children'>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'group/chip inline-flex shrink-0 cursor-pointer items-center rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        SIZES[size],
        active
          ? 'border-primary bg-secondary text-foreground'
          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{children}</span>
      {count != null && (
        <span
          className={cn(
            'rounded-md px-1.5 py-px text-[11px] leading-none tabular-nums',
            active ? 'bg-primary/15 text-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
      {remove && (
        <span
          aria-hidden
          className="-mr-1 grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors group-hover/chip:bg-destructive/10 group-hover/chip:text-destructive"
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  )
}

/** ჩიპების რიგი — ერთი დაშორება ყველგან */
export function ChipRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}
