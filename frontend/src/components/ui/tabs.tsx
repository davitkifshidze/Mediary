import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================
   მარტივი კონტროლირებადი ტაბები (Tasks K1).
   Radix-ის `react-tabs` პაკეტი პროექტში არ არის — აქ მხოლოდ ის გვჭირდება,
   რაც ერთი ზოლი ღილაკებით და ერთი პანელია, ამიტომ თავად ვწერთ.
   ============================================================ */

export interface TabItem<T extends string = string> {
  value: T
  label: string
  /** მთვლელი ლეიბლის გვერდით (მაგ. ჩანაწერების რაოდენობა) */
  badge?: number | string
  disabled?: boolean
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="tablist" className={cn('flex flex-wrap gap-1 border-b border-border', className)}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            className={cn(
              '-mb-px cursor-pointer border-b-2 px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {it.label}
            {it.badge !== undefined && it.badge !== '' && (
              <span
                className={cn(
                  'ml-1.5 rounded-[5px] px-1.5 py-0.5 text-[11px]',
                  active ? 'bg-secondary' : 'bg-muted text-muted-foreground',
                )}
              >
                {it.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** ტაბის ზედა განმარტება — რას აკეთებს ეს სექცია (K1) */
export function TabInfo({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border border-dashed border-border bg-card/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
