import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Puzzle } from 'lucide-react'
import { fetchDashboard, type DashboardCard } from '@/api/dashboard'
import { useAuth } from '@/lib/auth'
import { useModules } from '@/lib/modules'
import { CountUp } from '@/components/CountUp'
import { ModuleIcon } from '@/components/ModuleIcon'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { UpcomingCard } from '@/components/UpcomingCard'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/**
 * მთავარი რიცხვები — **ცალკე ჩანქად** (2026-09-19).
 *
 * ⚠️ **გრაფიკების ბიბლიოთეკა ≈104 kB gzip-ია და დეშბორდი სადესანტო
 * გვერდია** — ჩვეულებრივი იმპორტი მას ყოველ შესვლაზე ბარათების **წინ**
 * ჩამოტვირთავდა, ე.ი. აპის პირველი ეკრანი ერთი ბლოკის გამო დაელოდებოდა.
 * `lazy()`-თ ბარათები მაშინვე იხატება და ჯამი ერთ მომენტში მოგვიანებით
 * ჩნდება.
 *
 * ⚠️ **ლოკალური `Suspense` სავალდებულოა.** `lazy()` უახლოეს საზღვარს
 * ეკიდება; მისი გარეშე მთელი გვერდი `App.tsx`-ის ფოლბექზე ჩავარდებოდა —
 * ე.ი. სწორედ ის „ცივი სტარტი" დაბრუნდებოდა, რასაც მარშრუტების დაყოფა
 * გაურბის. `fallback={null}` იმიტომ, რომ ბლოკი ცარიელზე ისედაც ქრება.
 */
const DashboardStats = lazy(() =>
  import('@/components/DashboardStats').then((m) => ({ default: m.DashboardStats })),
)

/* ============================================================
   დეშბორდი — მთავარი გვერდი (Tasks 2).

   ადრე `/` ფილმების ბიბლიოთეკა იყო; ახლა ეს მოდულების მიმოხილვაა.
   გადაწყდა (19.10): **ჯერ მხოლოდ რაოდენობა**, count-up ანიმაციით.
   ============================================================ */

/**
 * ერთი მოდულის ბარათი.
 *
 * ⚠️ **ფერი `modules.color`-იდან მოდის და არა ბარათიდან** (Tasks §2.1): იგივე
 * წყარო, რასაც `PageHeader` კითხულობს, ე.ი. მოდული მთავარ გვერდზეც და თავის
 * გვერდზეც ერთ ფერშია. მეორე სია („დეშბორდის ფერები") ერთ დღეს აცდებოდა.
 *
 * ⚠️ **ფერი inline `style`-ითაა** — მნიშვნელობა ბაზიდან მოდის, ე.ი.
 * `bg-[#6366f1]`-ს Tailwind ვერ დააგენერირებდა (`PageHeader`-ის იგივე წესი).
 */
function Card({ card, lang, color }: { card: DashboardCard; lang: string; color: string | null }) {
  const name = (lang === 'ka' ? card.name_ka : card.name_en) || card.name_en

  return (
    <Link
      to={card.route_base}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={
        color
          ? {
              backgroundColor: `color-mix(in oklab, ${color} 8%, var(--card))`,
              borderColor: `color-mix(in oklab, ${color} 28%, var(--border))`,
            }
          : undefined
      }
    >
      {/* ფერადი ზოლი მარცხნივ — მოდული ერთი შეხედვით იცნობა */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: color ?? 'var(--border)' }}
        aria-hidden
      />

      <div className="flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"
          style={color ? { backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` } : undefined}
        >
          <ModuleIcon name={card.icon} className="size-5" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-4 font-display text-4xl font-semibold leading-none tracking-tight tabular-nums">
        {card.count === null ? '—' : <CountUp value={card.count} />}
      </div>
    </Link>
  )
}

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { all } = useModules()

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  })

  return (
    <PageContainer>
      {/* ⚠️ ქვესათაური („რა გაქვს და სად გაჩერდი.") **მოხსნილია** — §2.1 */}
      <PageHeader title={t('dashboard.title', { name: user?.first_name || user?.display_name })} />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!isLoading && !cards.length && (
        <EmptyState
          icon={<Puzzle className="size-6" />}
          title={t('modules.emptyTitle')}
          hint={t('modules.emptyHint')}
          actions={
            <Link to="/modules" className={buttonVariants()}>
              {t('modules.title')}
            </Link>
          }
        />
      )}

      {/* ===== „მალე" (FEAT-10) — ბარათებზე **მაღლა** =====
          ⚠️ ბარათები „რა მაქვს"-ს პასუხობენ და მუდმივია; ეს ბლოკი კი
          თარიღიანია და ამიტომ დროში მალე ფუჭდება — ქვემოთ მას ვერავინ
          ნახავდა. ცარიელზე კომპონენტი თვითონ ქრება. */}
      {!isLoading && <UpcomingCard />}

      {/* ===== მთავარი რიცხვები (FEAT-08 → 2026-09-19) =====
          ⚠️ **„მალე"-ს ქვემოთ და ბარათებზე მაღლა.** ზემოთ თარიღიანი და
          მალე მჭკნარი ინფორმაციაა, აქ — ჯამები (არ ბერდება), ქვემოთ კი
          ნავიგაცია. ცარიელ ბიბლიოთეკაზე კომპონენტი თვითონ ქრება. */}
      <Suspense fallback={null}>{!isLoading && <DashboardStats />}</Suspense>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card
            key={card.key}
            card={card}
            lang={i18n.language}
            color={all.find((m) => m.key === card.key)?.color ?? null}
          />
        ))}
      </div>
    </PageContainer>
  )
}
