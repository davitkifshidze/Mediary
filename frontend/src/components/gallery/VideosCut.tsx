import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, ExternalLink, Images, Play, Search, User, Video } from 'lucide-react'
import {
  deleteGalleryVideo,
  fetchGalleryVideoModules,
  fetchGalleryVideoRecords,
  fetchGalleryVideos,
  type GalleryVideo as GalleryVideoItem,
  type GalleryVideoRecord,
  type GalleryVideoSort,
} from '@/api/gallery'
import type { VideoPlatform } from '@/api/videos'
import { useDateFormat } from '@/lib/dates'
import { isAllowedEmbed } from '@/lib/embed'
import { usePages } from '@/lib/paged'
import { errorMessage } from '@/lib/errors'
import { tintStyle } from '@/lib/gameMeta'
import { moduleName, useModules } from '@/lib/modules'
import { usePlayer, type PlayerItem } from '@/lib/player'
import { useContentLang } from '@/lib/settings'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { Select, SelectContent, SelectFitValue, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ModuleIcon } from '@/components/ModuleIcon'

/* ============================================================
   შენახული **ვიდეო-ბმულები** — ჩანაწერებზე (და მსახიობებზე) მიბმული ვებ-ვიდეოები.

   ⚠️ **ეს ვიდეოს მოდული არ არის.** ვიდეოს მოდული შენი ბიბლიოთეკაა; აქ ჩანაწერზე ან
   მსახიობზე მიბმული ბმულებია, რომლებიც ვებძებნამ მოიტანა — ე.ი. გალერეის ნაწილი.

   ⚠️ **სამი საფეხური**: მოდულების დიდი ბარათები → ერთი მოდულის ჩანაწერები →
   ერთი ჩანაწერის ვიდეოები. საფეხური მისამართშია (`?module=` · `?record=`), ე.ი.
   ბრაუზერის „უკან" წინა საფეხურზე აბრუნებს და ბმული გაზიარებადია. ძებნა ნებისმიერ
   საფეხურზე ბრტყელ შედეგს აჩვენებს (მოდულის შიგნით — იმ მოდულში).

   ⚠️ **დაკვრა საერთო დამკვრელშია**: გვერდის გადართვა დაკვრას არ წყვეტს.
   `kind: 'link'` ნიშნავს, რომ მრიცხველი არ არსებობს — ბმულს `videos` ცხრილში
   ჩანაწერი არ აქვს. ⚠️ ესკიზი დაშორებული URL-ია და ბლარის გარეშე ჩანს.
   ============================================================ */

const SORTS: GalleryVideoSort[] = ['new', 'old', 'title']

/** გვერდზე — ბადის 4 სვეტის (და 3-ისა და 2-ის) ჯერადი */
const VIDEO_PAGE_SIZE = 24

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

/** მოდულის სახელი, ფერი და ხატულა — მსახიობი მოდული არ არის და თავისას ამბობს */
function useKindMeta() {
  const { t, i18n } = useTranslation()
  const { all } = useModules()

  return (kind: string) => {
    const module = all.find((m) => m.key === (kind === 'actor' ? 'gallery' : kind))

    return {
      label: kind === 'actor' ? t('gallery.inner.actors') : module ? moduleName(module, i18n.language) : kind,
      color: module?.color ?? null,
      icon: kind === 'actor' ? 'User' : (module?.icon ?? 'Images'),
    }
  }
}

export function VideosCut() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const kindMeta = useKindMeta()
  const lang = useContentLang(useTranslation().i18n.language)

  const module = params.get('module')
  const record = Number(params.get('record')) || null

  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<GalleryVideoSort>('new')
  /** ჩანაწერის სათაური მესამე საფეხურის სათაურისთვის (სიიდან; პირდაპირ ბმულზე — ვიდეოდან) */
  const [recordTitle, setRecordTitle] = useState<string | null>(null)

  // ძებნა აკრეფისას, 350 ms ჩამორჩენით — ვიდეოების მოდულის იგივე წესი
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const go = (next: { module?: string | null; record?: number | null }) => {
    setQ('')
    setTerm('')
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(next)) {
        if (value == null) out.delete(key)
        else out.set(key, String(value))
      }
      return out
    })
  }

  const openRecord = (item: GalleryVideoRecord) => {
    setRecordTitle((lang === 'ka' ? item.title_ka : null) ?? item.title ?? item.title_ka)
    go({ record: item.id })
  }

  const level = module && record ? 'videos' : module ? 'records' : 'modules'
  const meta = module ? kindMeta(module) : null

  return (
    <div>
      {/* სად ვარ: უკან + საფეხურის სათაური */}
      {module && (
        <div className="mb-4 flex flex-wrap items-center gap-3" data-testid="video-crumbs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (level === 'videos' ? go({ record: null }) : go({ module: null, record: null }))}
          >
            <ArrowLeft className="size-4" />
            {level === 'videos' ? meta?.label : t('gallery.videoLevels.modules')}
          </Button>
          <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold" style={meta?.color ? ({ '--mod': meta.color } as React.CSSProperties) : undefined}>
            <ModuleIcon name={meta?.icon ?? 'Images'} className="size-4 shrink-0 text-[var(--mod)]" />
            <span className="truncate">{level === 'videos' ? (recordTitle ?? `#${record}`) : meta?.label}</span>
          </h2>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('gallery.videoSearch')} className="h-10 pl-8" />
        </div>
        {/* დალაგება — მხოლოდ იქ, სადაც ვიდეოების სიაა */}
        {(level === 'videos' || term) && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{t('sort.label')}</span>
            <Select value={sort} onValueChange={(next) => setSort(next as GalleryVideoSort)}>
              <SelectTrigger className="h-9 w-auto min-w-32 text-sm">
                <SelectFitValue labels={SORTS.map((key) => t(`gallery.videoSort.${key}`))} />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`gallery.videoSort.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
      </div>

      {level === 'videos' ? (
        <VideoList owner={`${module}:${record}`} term={term} sort={sort} onTitle={setRecordTitle} />
      ) : term ? (
        // ძებნა: ბრტყელი შედეგი — მოდულის შიგნით იმ მოდულში, ზემოთ ყველგან
        <VideoList type={module ?? undefined} term={term} sort={sort} withOwner />
      ) : level === 'records' ? (
        <RecordLevel kind={module!} onOpen={openRecord} />
      ) : (
        <ModuleLevel onOpen={(kind) => go({ module: kind })} />
      )}
    </div>
  )
}

/* ---------- 1. მოდულების დიდი ბარათები ---------- */

function ModuleLevel({ onOpen }: { onOpen: (kind: string) => void }) {
  const { t } = useTranslation()
  const kindMeta = useKindMeta()
  const query = useQuery({ queryKey: ['gallery-videos', 'modules'], queryFn: fetchGalleryVideoModules })

  if (query.isLoading) return <GridSkeleton count={3} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" />
  if (query.isError) return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />

  const modules = query.data ?? []

  if (!modules.length) return <EmptyState kind="video" title={t('gallery.noVideos')} hint={t('gallery.noVideosHint')} />

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="video-modules">
      {modules.map((item) => {
        const meta = kindMeta(item.kind)

        return (
          <li key={item.kind}>
            <button
              data-kind="card"
              data-module={item.kind}
              type="button"
              onClick={() => onOpen(item.kind)}
              className="group flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-[var(--mod)]"
              style={meta.color ? ({ '--mod': meta.color } as React.CSSProperties) : undefined}
            >
              <Cover src={item.thumbnails[0] ?? null} />
              <span className="flex items-center gap-3 p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-[var(--mod)]/15 text-[var(--mod)]">
                  <ModuleIcon name={meta.icon} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold">{meta.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('gallery.videoLevels.moduleCount', { videos: item.videos, records: item.records })}
                  </span>
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/* ---------- 2. ერთი მოდულის ჩანაწერები ---------- */

function RecordLevel({ kind, onOpen }: { kind: string; onOpen: (record: GalleryVideoRecord) => void }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  const query = usePages({
    queryKey: ['gallery-videos', 'records', kind],
    fetchPage: (page) =>
      fetchGalleryVideoRecords({ type: kind, page, per_page: VIDEO_PAGE_SIZE }).then((r) => ({
        items: r.data,
        total: r.meta.total,
        lastPage: r.meta.last_page,
      })),
  })

  if (query.isLoading) return <GridSkeleton count={8} className={GRID} />
  if (!query.items.length) return <EmptyState kind="video" title={t('gallery.noVideos')} hint={t('gallery.noVideosHint')} />

  return (
    <>
      <ul className={GRID} data-testid="video-records">
        {query.items.map((item) => {
          const title = (lang === 'ka' ? item.title_ka : null) ?? item.title ?? item.title_ka ?? `#${item.id}`

          return (
            <li key={item.id}>
              <button
                data-kind="card"
                type="button"
                onClick={() => onOpen(item)}
                className="flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/50"
              >
                <Cover src={item.thumbnail} />
                <span className="block p-3">
                  <span className="line-clamp-2 text-sm font-medium leading-snug" title={title}>
                    {title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{t('gallery.videoLevels.videoCount', { count: item.videos })}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <Pagination {...query.pagination} />
    </>
  )
}

/* ---------- 3. ვიდეოები (ერთი ჩანაწერის, ან ძებნის შედეგი) ---------- */

function VideoList({
  owner,
  type,
  term,
  sort,
  withOwner,
  onTitle,
}: {
  /** `movie:12` · `actor:5` — ერთი ჩანაწერის ვიდეოები */
  owner?: string
  /** ძებნა ერთი მოდულის შიგნით */
  type?: string
  term: string
  sort: GalleryVideoSort
  /** ბარათზე მფლობელის ჩიპი (ბრტყელი შედეგი) */
  withOwner?: boolean
  onTitle?: (title: string | null) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { date } = useDateFormat()
  const { all: modules } = useModules()
  const player = usePlayer()

  const query = usePages({
    queryKey: ['gallery-videos', { owner, type, term, sort }],
    fetchPage: (page) =>
      fetchGalleryVideos({ page, per_page: VIDEO_PAGE_SIZE, q: term || undefined, owner, type, sort }).then((r) => ({
        items: r.data,
        total: r.meta.total,
        lastPage: r.meta.last_page,
      })),
  })

  const items = query.items
  const ownerTitle = items[0]?.owner.title ?? null

  // პირდაპირ ბმულით გახსნილ საფეხურზე სათაური ვიდეოდან მოდის
  useEffect(() => {
    if (owner && ownerTitle) onTitle?.(ownerTitle)
  }, [owner, ownerTitle, onTitle])

  const remove = useMutation({
    mutationFn: (id: number) => deleteGalleryVideo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery-videos'] })
      qc.invalidateQueries({ queryKey: ['gallery-summary'] })
      toast({ title: t('gallery.videoDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const toItem = (video: GalleryVideoItem): PlayerItem => ({
    kind: 'link',
    id: video.id,
    title: video.title ?? video.url,
    subtitle: video.channel ?? video.owner.title ?? null,
    url: video.url,
    embedUrl: video.embed_url,
    platform: (video.platform ?? 'other') as VideoPlatform,
    thumbnail: video.thumbnail_url,
    duration: video.duration,
  })

  const playFrom = (index: number) => player.play(items.map(toItem), index, t('gallery.videosTitle'))

  const openOwner = (video: GalleryVideoItem) =>
    video.owner.kind === 'actor'
      ? navigate(`/actors/${video.owner.id}`)
      : navigate(`/gallery/records/${video.owner.kind}/${video.owner.id}`, {
          state: { title: video.owner.title ?? undefined, from: '/gallery/videos' },
        })

  const accentOf = (video: GalleryVideoItem) =>
    modules.find((m) => m.key === (video.owner.kind === 'actor' ? 'gallery' : video.owner.kind))?.color ?? null

  const iconOf = (video: GalleryVideoItem) =>
    video.owner.kind === 'actor' ? 'User' : (modules.find((m) => m.key === video.owner.kind)?.icon ?? 'Images')

  if (query.isLoading) return <GridSkeleton count={8} className={GRID} />

  if (!items.length) {
    return (
      <EmptyState
        kind={term ? 'search' : 'video'}
        title={term ? t('gallery.videoNoMatch') : t('gallery.noVideos')}
        hint={term ? t('gallery.videoNoMatchHint') : t('gallery.noVideosHint')}
      />
    )
  }

  return (
    <>
      <ul className={GRID}>
        {items.map((video, index) => {
          const playable = isAllowedEmbed(video.embed_url)
          const play = () => (playable ? playFrom(index) : window.open(video.url, '_blank', 'noreferrer'))
          const actions: MenuAction[] = [
            { key: 'play', label: t('playback.play'), icon: MENU_ICONS.play, run: play },
            {
              key: 'owner',
              label: t(video.owner.kind === 'actor' ? 'gallery.actorPage' : 'gallery.openRecord'),
              icon: MENU_ICONS.open,
              run: () => openOwner(video),
            },
            { key: 'source', label: t('photos.infoOpen'), icon: MENU_ICONS.link, run: () => window.open(video.url, '_blank', 'noreferrer') },
            {
              key: 'delete',
              label: t('actions.delete'),
              icon: MENU_ICONS.delete,
              danger: true,
              separator: true,
              run: async () => {
                const ok = await confirm({
                  title: t('gallery.videoDeleteTitle'),
                  description: t('gallery.videoDeleteHint'),
                  confirmText: t('confirm.delete'),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(video.id)
              },
            },
          ]

          return (
            <RecordContextMenu key={video.id} actions={actions}>
              <li className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card" data-testid="gallery-video-card">
                <button
                  type="button"
                  onClick={play}
                  aria-label={video.title ?? video.url}
                  className="group relative block aspect-video w-full cursor-pointer overflow-hidden bg-muted"
                >
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-muted-foreground">
                      <Video className="size-8" />
                    </span>
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="size-10 text-white" />
                  </span>
                  {video.duration ? (
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs text-white">
                      {formatDuration(video.duration)}
                    </span>
                  ) : null}
                </button>

                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug" title={video.title ?? video.url}>
                    {video.title ?? video.url}
                  </h3>
                  <p className="flex min-h-4 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
                    {video.channel && <span className="min-w-0 truncate">{video.channel}</span>}
                    {video.published_at && (
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <CalendarDays className="size-3" />
                        {date(video.published_at)}
                      </span>
                    )}
                  </p>
                  {/* მფლობელის ჩიპი — მხოლოდ ბრტყელ შედეგში: ჩანაწერის საფეხურზე ის სათაურშია */}
                  {withOwner && (
                    <button
                      data-kind="chip"
                      type="button"
                      onClick={() => openOwner(video)}
                      className="inline-flex max-w-full cursor-pointer items-center gap-1.5 self-start rounded-md border px-2 py-0.5 text-[11px] font-medium"
                      style={tintStyle(accentOf(video)) ?? undefined}
                      data-testid="video-owner"
                    >
                      <ModuleIcon name={iconOf(video)} className="size-3" />
                      <span className="truncate">{video.owner.title ?? `#${video.owner.id}`}</span>
                    </button>
                  )}

                  <div className="mt-auto flex items-center gap-1 border-t border-border pt-2">
                    <Button variant="outline" size="sm" onClick={play}>
                      <Play className="size-3.5" />
                      {t('playback.play')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openOwner(video)}>
                      {video.owner.kind === 'actor' ? <User className="size-3.5" /> : <Images className="size-3.5" />}
                      {t(video.owner.kind === 'actor' ? 'gallery.videoOwnerActor' : 'gallery.videoOwnerRecord')}
                    </Button>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'ml-auto')}
                    >
                      <ExternalLink className="size-3.5" />
                      {t('photos.infoOpen')}
                    </a>
                  </div>
                </div>
              </li>
            </RecordContextMenu>
          )
        })}
      </ul>
      <Pagination {...query.pagination} />
    </>
  )
}

/* ---------- საერთო ნაწილები ---------- */

/** ბარათის ყდა — ბოლო ვიდეოს ესკიზი (დაშორებული URL), ან ცარიელი ნიშანი */
function Cover({ src }: { src: string | null }) {
  return (
    <span className="block aspect-video w-full overflow-hidden bg-muted">
      {src ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center text-muted-foreground">
          <Video className="size-8" />
        </span>
      )}
    </span>
  )
}

function GridSkeleton({ count, className }: { count: number; className: string }) {
  return (
    <ul className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="aspect-video animate-pulse bg-muted/60" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/50" />
          </div>
        </li>
      ))}
    </ul>
  )
}
