import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Clapperboard, Loader2, Play, Plus, Sparkles } from 'lucide-react'
import { fetchSoon, fetchUpcoming, UPCOMING_PAGE_SIZE, type SoonItem, type SoonTrailer, type UpcomingItem } from '@/api/soon'
import { useDateFormat } from '@/lib/dates'
import { mediaKey, mediaOf, type MediaType } from '@/lib/media'
import { usePages } from '@/lib/paged'
import { usePlayer, type PlayerItem } from '@/lib/player'
import { useContentLang } from '@/lib/settings'
import { soonLine } from '@/lib/soon'
import type { VideoPlatform } from '@/api/videos'
import { PosterImage } from '@/components/PosterImage'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { useQueue } from '@/components/ui/queue'

/* ============================================================
   **„მალე"** — გამოუსვლელი სათაურები (ფილმი · სერიალი · ანიმე).

   ორი ჩანართი:
   · **ჩემი სათაურები** — რაც უკვე დავამატე და ჯერ წინ არის: ფილმის პრემიერა,
     სერიალის / ანიმეს პირველი ეთერი ან შემდეგი სეზონი / სერია;
   · **TMDB-ზე მალე** — გამოცხადებული, ჯერ გამოუსვლელი სათაურები; „დამატება"
     „აღმოჩენის" იმავე რიგით მიდის (`useQueue().enqueue`).

   ⚠️ **თრეილერი აპის ფლეიერში იკვრება** (`usePlayer`), `kind: 'link'`-ით —
   ნახვის მრიცხველი არ არსებობს, ეს `videos`-ის ჩანაწერი არ არის. ღილაკი მხოლოდ
   იქ ჩანს, სადაც თრეილერი არის.

   ⚠️ ბადე `<main>`-ის `@container`-ს მიჰყვება — იგივე ზღვრები, რაც პოსტერების
   ბადეს (`MovieGrid`), ე.ი. დამკვრელის პანელით მიწოლილ გვერდზე სვეტები იკლებს.
   ============================================================ */

const GRID = 'grid grid-cols-2 gap-x-4 gap-y-6 @2xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5 @7xl:grid-cols-6'

type Tab = 'mine' | 'tmdb'

/** თრეილერი ფლეიერის რიგის ერთეულად; `id` — ჩანაწერის ან TMDB-ის id (მხოლოდ გასაღებისთვის) */
function trailerItem(id: number, title: string, trailer: SoonTrailer, thumbnail: string | null): PlayerItem {
  return {
    kind: 'link',
    id,
    title,
    subtitle: null,
    url: trailer.url,
    embedUrl: trailer.embed_url,
    platform: (trailer.platform ?? 'other') as VideoPlatform,
    thumbnail,
    duration: null,
  }
}

export function SoonView({ type }: { type: MediaType }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('mine')
  const { apiBase } = mediaOf(type)

  // ⚠️ ჩემი სია ჩანართის გარეთ იკითხება: მისი რიცხვი ჩანართზეც წერია
  const mine = useQuery({ queryKey: [type, 'soon'], queryFn: () => fetchSoon(apiBase) })

  return (
    <PageContainer>
      <PageHeader module={type} title={t('soon.section')} hint={<InfoHint info={t(mediaKey('soon.hint', type))} />} />

      <div className="mb-5">
        <CutTabs
          layout="inline"
          options={[
            { key: 'mine', label: t('soon.tab.mine'), count: mine.data?.length, icon: Clapperboard, color: 'var(--mod)' },
            { key: 'tmdb', label: t('soon.tab.tmdb'), hint: t('soon.tab.tmdbHint'), icon: Sparkles, color: 'var(--tool-sync)' },
          ]}
          value={tab}
          onChange={(key) => setTab(key as Tab)}
        />
      </div>

      {tab === 'mine' ? (
        mine.isLoading ? (
          <div className="text-muted-foreground">{t('api.loading')}</div>
        ) : mine.isError ? (
          <QueryErrorState error={mine.error} onRetry={() => void mine.refetch()} />
        ) : mine.data?.length ? (
          <div className={GRID}>
            {mine.data.map((item) => (
              <MineCard key={item.id} item={item} type={type} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CalendarClock className="size-6" />}
            title={t('soon.emptyTitle')}
            hint={t('soon.emptyHint')}
            actions={
              <Button variant="outline" onClick={() => setTab('tmdb')}>
                <Sparkles className="size-4" />
                {t('soon.tab.tmdb')}
              </Button>
            }
          />
        )
      ) : (
        <TmdbTab type={type} />
      )}
    </PageContainer>
  )
}

/** „დარჩა N დღე" — პოსტერის კუთხეში; უთარიღოზე არ იხატება */
function DaysBadge({ days }: { days: number | null }) {
  const { t } = useTranslation()
  if (days == null) return null

  return (
    <span
      className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white"
      data-testid="soon-days"
    >
      {days <= 0 ? t('soon.today') : days === 1 ? t('soon.tomorrow') : t('soon.daysLeft', { count: days })}
    </span>
  )
}

function TrailerButton({ onPlay }: { onPlay: () => void }) {
  const { t } = useTranslation()

  return (
    <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onPlay} data-testid="soon-trailer">
      <Play className="size-4" />
      {t('detail.trailer')}
    </Button>
  )
}

function MineCard({ item, type }: { item: SoonItem; type: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const fmt = useDateFormat()
  const player = usePlayer()
  const { detailBase } = mediaOf(type)

  const title = (lang === 'ka' ? item.title_ka : item.title_en) || item.title_en || item.title_ka || ''
  const to = `${detailBase}/${item.id}`

  return (
    <article data-testid="soon-card">
      <Link to={to} className="group block">
        <div className="relative overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-border transition group-hover:shadow-lg group-hover:ring-foreground/30">
          <div className="aspect-[2/3]">
            <PosterImage src={item.poster} alt={title} className="h-full w-full" />
          </div>
          <DaysBadge days={item.days} />
        </div>
        <h3 className="mt-2.5 font-display text-[15px] font-medium leading-snug transition-colors group-hover:text-gold">
          {title}
        </h3>
      </Link>
      {/* რა გამოდის და როდის: „12 დეკ 2026 · ახალი სეზონი 4" · „თარიღი უცნობია · მზადდება" */}
      <p className="mt-1 text-xs text-muted-foreground">{soonLine(item, t, fmt.date)}</p>
      {item.status && (
        <div className="mt-1.5">
          <StatusBadge status={item.status} className="max-w-full" />
        </div>
      )}
      {item.trailer && (
        <TrailerButton
          onPlay={() => player.play([trailerItem(item.id, title, item.trailer!, item.poster)], 0, t('detail.trailer'))}
        />
      )}
    </article>
  )
}

function TmdbTab({ type }: { type: MediaType }) {
  const { t } = useTranslation()

  const list = usePages({
    queryKey: ['discover-upcoming', type],
    fetchPage: (page) => fetchUpcoming(type, page),
    pageSize: UPCOMING_PAGE_SIZE,
  })

  if (list.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t('soon.tmdbLoading')}
      </div>
    )
  }

  // გასაღების არქონა და TMDB-ის ჩავარდნა თავის ტექსტს ამბობს (`lib/errors.ts`)
  if (list.isError) return <QueryErrorState error={list.error} onRetry={list.refetch} />

  if (!list.items.length) {
    return <EmptyState icon={<CalendarClock className="size-6" />} title={t('soon.tmdbEmpty')} />
  }

  return (
    <>
      <div className={GRID}>
        {list.items.map((item) => (
          <TmdbCard key={item.tmdb_id} item={item} type={type} />
        ))}
      </div>
      <Pagination {...list.pagination} />
    </>
  )
}

function TmdbCard({ item, type }: { item: UpcomingItem; type: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const fmt = useDateFormat()
  const player = usePlayer()
  const { enqueue, isQueued } = useQueue()
  const { detailBase } = mediaOf(type)

  const title = (lang === 'ka' ? item.title_ka : null) || item.title
  const genres = item.genres.map((g) => (lang === 'ka' ? g.name_ka || g.name_en : g.name_en)).slice(0, 2)
  const busy = isQueued(item.tmdb_id, type)

  const poster = (
    <div className="relative overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-border">
      <div className="aspect-[2/3]">
        <PosterImage src={item.poster} alt={title} className="h-full w-full" />
      </div>
      {item.owned && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-status-watched px-1.5 py-0.5 text-[11px] font-medium text-white">
          {t('discover.added')}
        </span>
      )}
    </div>
  )

  return (
    <article data-testid="soon-tmdb-card">
      {item.owned && item.record_id ? <Link to={`${detailBase}/${item.record_id}`}>{poster}</Link> : poster}
      <h3 className="mt-2.5 font-display text-[15px] font-medium leading-snug">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {[item.date ? fmt.date(item.date) : t('soon.dateUnknown'), ...genres].join(' · ')}
      </p>
      {item.trailer && (
        <TrailerButton
          onPlay={() => player.play([trailerItem(item.tmdb_id, title, item.trailer!, item.poster)], 0, t('detail.trailer'))}
        />
      )}
      {!item.owned && (
        <Button size="sm" className="mt-2 w-full" disabled={busy} onClick={() => enqueue([{ tmdbId: item.tmdb_id, title }], type)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {busy ? t('queue.queued') : t('actor.add')}
        </Button>
      )}
    </article>
  )
}
