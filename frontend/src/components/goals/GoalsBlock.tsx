import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Plus, Target } from 'lucide-react'
import { fetchGoals } from '@/api/goals'
import { GoalCard } from '@/components/goals/GoalCard'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { toolAccent } from '@/lib/toolSections'

/* ============================================================
   **მიზნები მთავარ გვერდზე** — კომპაქტური ბლოკი: მიმდინარე მიზნების ფილები და
   „ყველა მიზანი →". დამატება, რედაქტირება და ისტორია `/goals`-ზეა.

   ⚠️ ბლოკი **თვითონ კითხულობს** თავის მონაცემს (`/goals?scope=active`) და არა მთავარი
   გვერდის ჯამიდან: გამორთული ბლოკი მოთხოვნას საერთოდ არ აგზავნის.
   ⚠️ ცარიელზეც ჩანს — „მიზანი ჯერ არ დაგისახავს" თვითონ პასუხია — ოღონდ ერთ ხაზად.
   ============================================================ */

/** მთავარზე რამდენი ფილა ეტევა; დანარჩენი — `/goals`-ზე */
const SHOWN = 3

export function GoalsBlock() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({ queryKey: ['goals', 'active'], queryFn: () => fetchGoals('active') })

  if (isLoading) return null

  const goals = (data?.data ?? []).filter((goal) => goal.state !== 'upcoming')
  const shown = goals.slice(0, SHOWN)

  return (
    <section aria-label={t('goals.title')} style={toolAccent('goals')} className="mb-6 rounded-md border border-border bg-card p-4" data-testid="goals-block">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
          <Target className="size-4 shrink-0 text-[var(--mod)]" />
          <span className="truncate">{t('goals.title')}</span>
          {goals.length > SHOWN && <span className="text-xs font-normal text-muted-foreground">{t('goals.blockMore', { count: goals.length - SHOWN })}</span>}
        </h2>
        <Link to="/goals" className={buttonVariants({ variant: 'outline', size: 'sm' })} data-testid="goals-all">
          {t('goals.all')}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          size="line"
          kind="list"
          title={t('goals.blockEmpty')}
          actions={
            <Link to="/goals" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Plus className="size-3.5" />
              {t('goals.add')}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((goal) => (
            <li key={goal.id}>
              <GoalCard goal={goal} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
