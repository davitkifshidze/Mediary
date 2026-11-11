import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EmptyArt, type EmptyKind } from './empty-art'

/* ============================================================
   ცარიელი მდგომარეობა — ერთი კომპონენტი ყველა მოდულზე.

   ⚠️ **ადრე ცარიელი სექცია უბრალოდ ცარიელი იყო** — ან ერთი ნაცრისფერი
   წინადადება („ჩანაწერები არ არის"), ან საერთოდ არაფერი. ორივე ერთსა და
   იმავე კითხვას ტოვებდა: *რატომ* არაფერია — ჯერ არაფერი დამიმატებია თუ
   ფილტრმა ჩამოჭრა? ამიტომ ამ ბლოკს **სამი ნაწილი** აქვს: რა მდგომარეობაა
   (`title`), რატომ (`hint`) და **რა არის შემდეგი ღილაკი** (`actions`).

   ⚠️ **ღილაკს კომპონენტი არ გამოიგონებს** — ის გამომძახებელს ეკუთვნის:
   ერთგან „დამატებაა", სხვაგან „ფილტრის მოხსნა", და ზოგან ორივე. აქ
   მხოლოდ ადგილი და ვიზუალია, თორემ ცხრა მოდულის სპეციფიკა ერთ კომპონენტში
   ჩაიკარგებოდა.

   ⚠️ **ნახატი მოძრაობს** (`empty-art.tsx`): `kind` ამბობს, *რა* არის ცარიელი —
   ფოტო, ვიდეო, სია, ძებნის შედეგი, ბმული, ფაილი, შეტყობინება. თავისი აიქონის
   მქონე ადგილი (`icon`) აიქონს იტოვებს — ისიც ნელა ტივტივებს მფეთქავ წრეში.

   ⚠️ **სამი ზომა** — ცარიელი ტექსტი აღარსად წერია უბრალო აბზაცად
   (`scripts/empty-states.mjs`): `page` — გვერდის ან დიდი სექციის ბლოკი
   წყვეტილი ჩარჩოთი; `compact` — ბარათის, ფანჯრის ან ცხრილის შიგნით, ჩარჩოს
   გარეშე; `line` — ერთი სტრიქონი პატარა ნახატით (მენიუ, ფილტრის სია, ვიწრო
   პანელი).
   ============================================================ */

type EmptySize = 'page' | 'compact' | 'line'

const BOX: Record<EmptySize, string> = {
  page: 'flex-col justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center',
  compact: 'flex-col justify-center px-4 py-6 text-center',
  line: 'gap-2.5 py-1.5 text-left',
}

/** ნახატის სიგანე; სიმაღლე პროპორციისაა (120 : 88) */
const ART: Record<EmptySize, string> = {
  page: 'w-[120px]',
  compact: 'w-[76px]',
  line: 'w-9 shrink-0',
}

const ICON: Record<EmptySize, string> = {
  page: 'size-14 [&_svg]:size-6',
  compact: 'size-10 [&_svg]:size-5',
  line: 'size-6 shrink-0 [&_svg]:size-3.5',
}

export function EmptyState({
  kind,
  icon,
  title,
  hint,
  actions,
  size = 'page',
  className,
}: {
  /** რა არის ცარიელი — ნახატს ირჩევს; `icon`-ისა და მის გარეშე — ცარიელი თარო */
  kind?: EmptyKind
  /** საკუთარი აიქონი იმ ადგილისთვის, რომელსაც შვიდი სახეობიდან არცერთი ერგება */
  icon?: ReactNode
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  size?: EmptySize
  className?: string
}) {
  const art =
    kind || !icon ? (
      <span className={cn('fb-empty-art block', ART[size])} data-kind={kind ?? 'list'}>
        <EmptyArt kind={kind ?? 'list'} />
      </span>
    ) : (
      <span className={cn('fb-empty-icon relative grid place-items-center text-muted-foreground', ICON[size])}>
        <span className="ea-halo absolute inset-0 rounded-full bg-muted" />
        <span className="ea-float relative grid place-items-center">{icon}</span>
      </span>
    )

  if (size === 'line') {
    return (
      <div className={cn('flex items-center', BOX.line, className)} data-empty-state="line">
        {art}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )
  }

  const page = size === 'page'
  return (
    <div className={cn('flex items-center', BOX[size], className)} data-empty-state={size}>
      {art}

      {page ? (
        <h2 className="mt-4 text-base font-semibold">{title}</h2>
      ) : (
        <p className="mt-2.5 text-sm font-medium text-muted-foreground">{title}</p>
      )}
      {hint && (
        <p className={cn('max-w-md text-muted-foreground', page ? 'mt-1 text-sm' : 'mt-1 text-xs')}>{hint}</p>
      )}
      {actions && (
        <div className={cn('flex flex-wrap items-center justify-center gap-2', page ? 'mt-4' : 'mt-3')}>{actions}</div>
      )}
    </div>
  )
}
