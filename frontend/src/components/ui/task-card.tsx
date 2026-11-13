import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { modAccent } from '@/lib/modules'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   **საქმის ბარათი** — „რას აკეთებს და რა მდგომარეობაშია" ერთი შეხედვით.

   სინქრონიზაციის გვერდები ტექსტიანი ყუთი იყო ღილაკით: რა რას აკეთებს და რამდენია
   გასაკეთებელი, მხოლოდ ფანჯრის გახსნის შემდეგ ჩანდა. ბარათს აქვს თავისი აიქონი და
   ფერი, ერთი წინადადება, **რიცხვი** (რამდენია გასაშვები) და მთავარი ღილაკი; ქვედა
   ზოლის მარჯვენა მხარე ბოლო შედეგისაა.

   ⚠️ **ფერი inline `style`-ით ჩამოდის** (`modAccent()` → `--mod`, `--mod-soft`):
   მნიშვნელობა CSS-ცვლადია და Tailwind მისგან კლასს ვერ დაბადებს.
   ⚠️ **რიცხვის სამი მდგომარეობა**: რიცხვი · `undefined` (ჯერ იტვირთება — ტირე, რომ
   ბარათი არ ხტოდეს) · `null` (ამ ბარათს რიცხვი არ აქვს — ადგილიც არ რჩება).
   ⚠️ გრძელი ახსნა `info`-შია (`i`) და არა ბარათის ტექსტში — ბარათზე ერთი წინადადებაა.
   ============================================================ */

export function TaskCard({
  color,
  icon: Icon,
  title,
  info,
  text,
  count,
  countLabel,
  actions,
  footer,
  children,
  className,
  'data-testid': testId,
}: {
  /** აქცენტი — CSS-ფერი (`var(--tool-sync)`) */
  color: string
  icon: LucideIcon
  title: string
  /** ვრცელი ახსნა `i`-ში (უკვე ნათარგმნი) */
  info?: string
  /** ერთი წინადადება — რას აკეთებს */
  text: string
  count?: number | null
  /** რას ითვლის რიცხვი — მის ქვეშ, წვრილად */
  countLabel?: string
  /** მთავარი ღილაკი (ღილაკები) — ქვედა ზოლის მარცხენა მხარე */
  actions?: ReactNode
  /** ქვედა ზოლის მარჯვენა მხარე — მაგ. ბოლო გაშვება */
  footer?: ReactNode
  /** ბარათის საკუთარი შიგთავსი ტექსტსა და ქვედა ზოლს შორის (გადამრთველი, პროგრესი) */
  children?: ReactNode
  className?: string
  'data-testid'?: string
}) {
  return (
    <section
      style={modAccent(color)}
      className={cn('flex flex-col rounded-lg border border-border bg-card p-4', className)}
      data-testid={testId}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] text-[var(--mod)]">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 font-display text-base font-semibold">
            <span className="min-w-0 truncate">{title}</span>
            {info && <InfoHint info={info} />}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
        </div>
        {count !== null && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold leading-none tabular-nums text-[var(--mod)]" data-testid="task-card-count">
              {count === undefined ? '—' : count}
            </div>
            {countLabel && <div className="mt-1 max-w-28 text-xs text-muted-foreground">{countLabel}</div>}
          </div>
        )}
      </div>

      {children}

      {(actions || footer) && (
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4">
          {actions}
          {footer && <div className="ml-auto min-w-0">{footer}</div>}
        </div>
      )}
    </section>
  )
}
