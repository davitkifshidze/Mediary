import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useModules, moduleName } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { cn } from '@/lib/utils'

/* ============================================================
   გვერდის ჰედერი — ერთი კომპონენტი ყველა გვერდისთვის (33 გამოძახება).

   ⚠️ **ცენტრირებული ბანერი მოიხსნა (Tasks §2.2).** ის გაუგებრობით გაჩნდა:
   „სათაურის შეცვლაში" მარჯვენა ფილტრის პანელი იგულისხმებოდა და არა
   სათაური. შედეგად ყოველი სექცია (გადაუწყვეტელი · საყურებელი · რჩეული)
   ეკრანის მესამედს იკავებდა და სია ქვევით ეშვებოდა. ახლა **კომპაქტური,
   მარცხნივ სწორებული ზოლია**: აიქონი + მოდული + სექცია მარცხნივ,
   მოქმედებები მარჯვნივ, ერთ ხაზზე.

   ⚠️ **„სად ვდგავარ" ორ დონეზე იკითხება** — ზემოთ წვრილად **მოდულის**
   სახელი (ფილმები / სერიალები / ანიმე), ქვემოთ მსხვილად **სექციისა**
   („რჩეული"). ადრე მხოლოდ სექცია ეწერა, ე.ი. სამი მედია-დომენის „რჩეული"
   ერთმანეთისგან არ განსხვავდებოდა. მოდულის ხაზი **თვითონ ქრება**, როცა
   სათაური ისედაც მოდულის სახელია — თორემ „ვიდეოები / ვიდეოები" გამოვიდოდა.

   ⚠️ **ფონის ფერი მოდულს ეკუთვნის** (`modules.color`, `/modules/{key}`-ზე
   ინიშნება) და არა გვერდს — ბიბლიოთეკა, ფორმა და ლექსიკონი ერთ ფერშია.

   ⚠️ **ფერი inline `style`-ითაა და არა Tailwind-ის კლასით**: მნიშვნელობა
   ბაზიდან მოდის, ე.ი. `bg-[#6366f1]` კომპილაციისას არ არსებობს და Tailwind
   მას ვერ დააგენერირებდა. `color-mix()` ფონს გამჭვირვალეს ხდის, ე.ი. მუქ
   და ნათელ თემაზე ერთნაირად კითხვადია.
   ============================================================ */

export function PageHeader({
  title,
  subtitle,
  /** მოდულის key — აქედან მოდის ფონი, აიქონი და ზედა ხაზი (`undefined` = ნეიტრალური) */
  module,
  actions,
  /** მარცხნივ — უკან დაბრუნების ბმული და მისთანები */
  before,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  module?: string
  actions?: ReactNode
  before?: ReactNode
  className?: string
}) {
  const { i18n } = useTranslation()
  const { all } = useModules()
  const found = module ? all.find((m) => m.key === module) : undefined
  const color = found?.color ?? null

  // ზედა წვრილი ხაზი — მოდულის სახელი; სათაურის გამეორებას ვერიდებით
  const name = found ? moduleName(found, i18n.language) : null
  const eyebrow = name && !(typeof title === 'string' && title.trim() === name.trim()) ? name : null

  return (
    <header
      className={cn(
        'mb-5 rounded-xl border border-border px-4 py-3',
        !color && 'bg-card',
        className,
      )}
      style={
        color
          ? {
              // 10% — ზოლი დაბალია, ე.ი. სუსტი ტონიც საკმარისად ჩანს
              backgroundColor: `color-mix(in oklab, ${color} 10%, var(--card))`,
              borderColor: `color-mix(in oklab, ${color} 30%, var(--border))`,
            }
          : undefined
      }
    >
      {before && <div className="mb-2">{before}</div>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {found && (
          <span
            className="grid size-10 shrink-0 place-items-center rounded-lg"
            style={color ? { backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` } : undefined}
          >
            <ModuleIcon name={found.icon} className="size-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="truncate font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
