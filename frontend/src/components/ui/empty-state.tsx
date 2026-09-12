import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================
   ცარიელი მდგომარეობა (Tasks §2.4) — ერთი კომპონენტი ყველა მოდულზე.

   ⚠️ **ადრე ცარიელი სექცია უბრალოდ ცარიელი იყო** — ან ერთი ნაცრისფერი
   წინადადება („ჩანაწერები არ არის"), ან საერთოდ არაფერი. ორივე ერთსა და
   იმავე კითხვას ტოვებდა: *რატომ* არაფერია — ჯერ არაფერი დამიმატებია თუ
   ფილტრმა ჩამოჭრა? ამიტომ ამ ბლოკს **სამი ნაწილი** აქვს: რა მდგომარეობაა
   (`title`), რატომ (`hint`) და **რა არის შემდეგი ღილაკი** (`actions`).

   ⚠️ **ღილაკს კომპონენტი არ გამოიგონებს** — ის გამომძახებელს ეკუთვნის:
   ერთგან „დამატებაა", სხვაგან „ფილტრის მოხსნა", და ზოგან ორივე. აქ
   მხოლოდ ადგილი და ვიზუალია, თორემ ცხრა მოდულის სპეციფიკა ერთ კომპონენტში
   ჩაიკარგებოდა.
   ============================================================ */

export function EmptyState({
  icon,
  title,
  hint,
  actions,
  className,
}: {
  /** ნაგულისხმევი — ნეიტრალური „ცარიელი ყუთი" */
  icon?: ReactNode
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="size-6" />}
      </span>

      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      {hint && <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>}
      {actions && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  )
}
