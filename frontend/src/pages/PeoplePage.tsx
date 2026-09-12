import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Lock, Search, Sparkles, Users } from 'lucide-react'
import { fetchMatchRanking, type MatchRankingRow } from '@/api/publicProfile'
import { storageUrl } from '@/lib/api'
import { isApiCode } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/* ============================================================
   „ვისთან ჰგავს ჩემი გემოვნება" (Tasks §16.2) — საჯარო პროფილების
   კატალოგი, მსგავსების რეიტინგით.

   ⚠️ **ეს კატალოგიცაა და არა მარტო რეიტინგი.** §16.2 ითხოვს „საჯარო
   პროფილების ძებნა/კატალოგს", რომელიც 16.1-ს არ ჰქონდა — ე.ი. პროფილი,
   რომელთანაც ჯერ არაფერი გვაქვს საერთო, უნდა მოიძებნებოდეს. ასეთები
   ბოლოში ჩამოდიან, ნულოვანი დამთხვევით.

   ⚠️ **პროცენტი Jaccard-ია** (საერთო ÷ გაერთიანება) — იგივე, რაც
   `MatchPanel`-ზე. ორ ადგილას ორი ფორმულა ერთსა და იმავე ეკრანზე
   სხვადასხვა რიცხვს აჩვენებდა.
   ============================================================ */

export function PeoplePage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [term, setTerm] = useState('')

  const ranking = useQuery({
    queryKey: ['match-ranking', term],
    queryFn: () => fetchMatchRanking(term.trim() || undefined),
    retry: false,
    // ძებნისას სია არ „ციმციმებს" — ძველი შედეგი რჩება, სანამ ახალი მოვა
    placeholderData: keepPreviousData,
  })

  // ჩემი პროფილი დახურულია — ცალკე მდგომარეობაა და არა „ვერავინ მოიძებნა"
  if (isApiCode(ranking.error, 'profile_not_public')) {
    return (
      <PageContainer width="narrow">
        <Header />
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Lock className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">{t('matches.needPublicTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('matches.needPublicHint')}</p>
          <Link to="/profile" className="mt-4 inline-block text-sm text-primary hover:underline">
            {t('publicProfile.title')}
          </Link>
        </div>
      </PageContainer>
    )
  }

  const data = ranking.data

  return (
    <PageContainer>
      <Header />

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('people.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      {ranking.isLoading && (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && data.items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {term ? t('people.noResults') : t('people.empty')}
        </p>
      )}

      <ul className="space-y-2">
        {data?.items.map((row) => (
          <ProfileRow key={row.profile.username} row={row} modules={data.modules} lang={lang} />
        ))}
      </ul>

      {/* ⚠️ ჭერი ცხადად ითქვას — თორემ სია „სრულად" გამოიყურება */}
      {data?.truncated && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t('people.truncated', { shown: data.items.length, total: data.total })}
        </p>
      )}
    </PageContainer>
  )
}

function Header() {
  const { t } = useTranslation()
  return (
    <>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Users className="size-5 text-muted-foreground" />
            {t('people.title')}
          </span>
        }
        subtitle={t('people.subtitle')}
      />
    </>
  )
}

function ProfileRow({
  row,
  modules,
  lang,
}: {
  row: MatchRankingRow
  modules: Record<string, { name_ka: string; name_en: string; icon: string }>
  lang: 'ka' | 'en'
}) {
  const { t } = useTranslation()
  const p = row.profile
  const avatar = p.avatar_path ? storageUrl(p.avatar_path) : null

  return (
    <li>
      <Link
        to={`/u/${p.username}`}
        className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
      >
        {avatar ? (
          <img src={avatar} alt={p.display_name} className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold uppercase">
            {p.display_name.slice(0, 2)}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.display_name}</span>
          <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
          {/* რომელ სექციაში დაემთხვა — კომპაქტურად; სრული დაშლა პროფილზეა */}
          {row.domains.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {row.domains.map((d) => {
                // შედარებად დომენებზე key მოდულის key-ს ემთხვევა (`playlist` აქ არ არის)
                const m = modules[d.domain]
                const name = m ? (lang === 'ka' ? m.name_ka : m.name_en) : d.domain
                return (
                  <span key={d.domain} className="rounded bg-muted px-1.5 py-0.5">
                    {name} · {d.shared}
                  </span>
                )
              })}
            </span>
          )}
        </span>

        <span className="shrink-0 text-right">
          <span
            className={cn(
              'flex items-center justify-end gap-1 text-lg font-semibold tabular-nums',
              row.shared > 0 ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {row.shared > 0 && <Sparkles className="size-4" />}
            {row.percent}%
          </span>
          <span className="block text-xs text-muted-foreground">
            {t('matches.sharedTotal', { count: row.shared })}
          </span>
        </span>
      </Link>
    </li>
  )
}
