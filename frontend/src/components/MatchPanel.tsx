import { useState } from 'react'
import { statusName } from '@/lib/statuses'
import type { Status } from '@/api/types'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2, Lock, Sparkles } from 'lucide-react'
import {
  fetchMatchItems,
  fetchMatches,
  type MatchDomainKey,
  type MatchRow,
} from '@/api/publicProfile'
import { storageUrl } from '@/lib/api'
import { isApiCode } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   დამთხვევები ორ საჯარო პროფილს შორის (Tasks §16.2).

   ⚠️ **მხოლოდ `public` ჩანაწერები ითვლება — ორივე მხრიდან.** ეს §16.2-ის
   ცხადი წესია და backend-ზე იმით არის უზრუნველყოფილი, რომ ორივე მხარე
   იმავე სამფენოვან query-ზე გადის, რაც საჯარო პროფილს კვებავს.

   ⚠️ **პროცენტი Jaccard-ია** (საერთო ÷ გაერთიანება). „საერთო ÷ ჩემი"
   ასიმეტრიულია: ვისაც ორი ფილმი აქვს და ორივე საერთოა, 100%-ს მიიღებდა.
   ============================================================ */

export function MatchPanel({ username }: { username: string }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [open, setOpen] = useState<MatchDomainKey | null>(null)

  const summary = useQuery({
    queryKey: ['matches', username],
    queryFn: () => fetchMatches(username),
    retry: false,
  })

  // ჩემი პროფილი დახურულია — ცალკე მდგომარეობაა და არა „ვერაფერი მოიძებნა"
  if (isApiCode(summary.error, 'profile_not_public')) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <Lock className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">{t('matches.needPublicTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('matches.needPublicHint')}</p>
        <Link to="/profile" className="mt-4 inline-block text-sm text-primary hover:text-primary/70">
          {t('publicProfile.title')}
        </Link>
      </div>
    )
  }

  if (summary.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (summary.isError || !summary.data) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{t('matches.empty')}</p>
  }

  const { domains, total, modules } = summary.data

  // შედარებად დომენებზე key = მოდულის key (`playlist` ერთადერთი გამონაკლისი
  // იყო და ის შედარებადი არაა) — ე.ი. რუკა აქ არ სჭირდება
  const label = (row: MatchRow) => {
    const m = modules[row.domain]
    return m ? (lang === 'ka' ? m.name_ka : m.name_en) : row.domain
  }

  if (!domains.length || total.shared === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{t('matches.empty')}</p>
  }

  return (
    <div className="pb-10">
      {/* ---------- ჯამი ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
        <div className="grid size-16 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <span className="text-lg font-semibold tabular-nums">{Math.round(total.percent)}%</span>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <Sparkles className="size-4 text-primary" />
            {t('matches.sharedTotal', { count: total.shared })}
            <InfoHint info={t('matches.percentHint')} />
          </p>
        </div>
      </div>

      {/* ---------- დომენებად ---------- */}
      <div className="space-y-2">
        {domains.map((row) => (
          <div key={row.domain} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setOpen((d) => (d === row.domain ? null : row.domain))}
              disabled={row.shared === 0}
              className={cn(
                'flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm',
                row.shared > 0 ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60',
              )}
            >
              <span className="min-w-0 flex-1 font-medium">{label(row)}</span>

              {/* ⚠️ `both_done === null` = დომენს სტატუსი არ აქვს (ვიდეო/სიმღერა) */}
              {row.both_done !== null && row.both_done > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-primary">
                  <Check className="size-3.5" />
                  {t(`matches.done.${row.domain}`, { count: row.both_done })}
                </span>
              )}

              <span className="text-xs text-muted-foreground">
                {t('matches.sharedOf', { shared: row.shared, mine: row.mine, theirs: row.theirs })}
              </span>
              <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">
                {row.percent}%
              </span>
            </button>

            {open === row.domain && <MatchItems username={username} domain={row.domain} />}
          </div>
        ))}
      </div>
    </div>
  )
}

/** ერთი დომენის საერთო ჩანაწერები — ორივე მხარის სტატუსით */
function MatchItems({ username, domain }: { username: string; domain: MatchDomainKey }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  const { data, isLoading } = useQuery({
    queryKey: ['matches', username, domain],
    queryFn: () => fetchMatchItems(username, domain),
  })

  if (isLoading) {
    return (
      <div className="grid place-items-center py-8">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data?.length) {
    return <p className="px-4 pb-4 text-xs text-muted-foreground">{t('matches.empty')}</p>
  }

  return (
    <ul className="border-t border-border">
      {data.map((card) => {
        const title =
          (lang === 'ka' ? card.title_ka : card.title_en) ||
          card.title_en ||
          card.title_ka ||
          '—'
        const image = storageUrl(card.image)

        return (
          <li
            key={`${card.domain}-${card.id}`}
            className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0"
          >
            <span className="h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
              {image && <img src={image} alt="" loading="lazy" className="size-full object-cover" />}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{title}</span>
              {card.year && <span className="text-xs text-muted-foreground">{card.year}</span>}
            </span>

            {card.both_done && <Check className="size-4 shrink-0 text-primary" />}

            {/* ორივე მხარის სტატუსი გვერდიგვერდ — სწორედ ეს არის „დამთხვევის ხედი" */}
            <span className="shrink-0 text-right text-xs text-muted-foreground">
              <span className="block">
                {t('matches.you')}: {statusLabel(t, lang, card.domain, card.mine.status, card.mine.rating)}
              </span>
              <span className="block">
                @{username}: {statusLabel(t, lang, card.domain, card.status ?? null, card.rating ?? null)}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * სტატუსის ლეიბლი — ⚠️ **ორი მექანიზმი ერთდროულად** (§6.4).
 *
 * ლექსიკონიან დომენებზე სტატუსი **ობიექტია** და სახელი მასშივე მოდის:
 * ის მფლობელის ლექსიკონშია და მნახველი მას სხვაგან ვერსად წაიკითხავდა.
 * `enum`-იან სამზე (წიგნი · თამაში · ბორდგეიმი) კი i18n-ის სივრცე
 * დომენზეა დამოკიდებული, ზუსტად ისე, როგორც `PurgePage`-ში.
 * სტატუსის გარეშე დომენზე მხოლოდ ქულა რჩება.
 */
const STATUS_NAMESPACE: Record<string, string> = {
  game: 'games.statuses',
  book: 'books.statuses',
  board_game: 'boardGames.statuses',
}

function statusLabel(
  t: (key: string) => string,
  lang: string,
  domain: string,
  status: Status | string | null,
  rating: number | string | null,
): string {
  const parts: string[] = []

  if (status && typeof status === 'object') {
    parts.push(statusName(status, lang))
  } else if (status) {
    const ns = STATUS_NAMESPACE[domain]
    if (ns) parts.push(t(`${ns}.${status}`))
  }

  if (rating != null) parts.push(`★ ${rating}`)

  return parts.join(' · ') || '—'
}
