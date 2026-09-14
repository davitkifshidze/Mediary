import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ============================================================
   ნაბიჯად დაყოფილი სექცია დიალოგში (ეტაპი 5, 2026-09-13).

   ⚠️ **ვებძებნის დიალოგი ერთ სქროლზე იყო**: კონტექსტის ჩიპები, განაწილების
   ბლოკი, ძებნის ველი, წყაროების ამრჩევი, სამი გაფრთხილება და ბადე — ყველა
   ერთნაირი წონის ტექსტით, ერთმანეთზე მიწყობილი. ეკრანზე ვერ იკითხებოდა
   *რა რის შემდეგ* კეთდება, ამიტომაც რჩებოდა შეუმჩნეველი, რომ ჯერ ძებნაა,
   მერე მონიშვნა და მხოლოდ ბოლოს — ჩამოტვირთვა.

   ⚠️ **ნომერი კომპონენტს არ გამოუგონია** — გამომძახებელი გადასცემს, რადგან
   ნაბიჯი შეიძლება საერთოდ არ არსებობდეს (განაწილება მხოლოდ მაშინაა, როცა
   ჩანაწერს მსახიობები ჰყავს), და მაშინ შემდეგი ნომერი უნდა წაიწიოს.

   ⚠️ **`action` სათაურის რიგშია და არა სხეულში** — „ყველას მონიშვნა",
   „მონიშნულია N" და „ყველა ერთად" სექციის შესახებ ამბობენ რაღაცას და არა
   მის შიგთავსში არიან; სხეულში ჩასმულები ბადეს/სიას სცილდებოდნენ.
   ============================================================ */

export function StepSection({
  step,
  title,
  hint,
  action,
  className,
  children,
}: {
  step: number
  title: ReactNode
  /** ერთი წინადადება სათაურის ქვეშ — რას ნიშნავს ეს ნაბიჯი ან რა მდგომარეობაშია */
  hint?: ReactNode
  /** ღილაკი/მრიცხველი სათაურის მარჯვნივ */
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card/40 p-4 sm:p-5', className)}>
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-px grid size-6 shrink-0 place-items-center rounded-md bg-secondary text-[11px] font-semibold tabular-nums text-foreground"
        >
          {step}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>

        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </header>

      <div className="mt-4">{children}</div>
    </section>
  )
}
