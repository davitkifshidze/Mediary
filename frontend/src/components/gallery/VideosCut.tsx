import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ExternalLink, Images, Play, Search, User, Video } from 'lucide-react'
import {
  deleteGalleryVideo,
  fetchGalleryVideos,
  type GalleryVideo as GalleryVideoItem,
  type GalleryVideoOwnerType,
  type GalleryVideoSort,
} from '@/api/gallery'
import type { VideoPlatform } from '@/api/videos'
import { useDateFormat } from '@/lib/dates'
import { isAllowedEmbed } from '@/lib/embed'
import { errorMessage } from '@/lib/errors'
import { tintStyle } from '@/lib/gameMeta'
import { useModules } from '@/lib/modules'
import { usePlayer, type PlayerItem } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Pager } from '@/components/ui/pager'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { Select, SelectContent, SelectFitValue, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ModuleIcon } from '@/components/ModuleIcon'

/* ============================================================
   შენახული **ვიდეო-ბმულები** (§8.1/§8.4) — Tasks §25.5-ით თავიდან.

   შენი სიტყვები: „გალერეაში ვიდეოების გვერდიც ძალიან მახინჯია, გამითანამედროვე".

   ⚠️ **ეს ვიდეოს მოდული არ არის.** ვიდეოს მოდული შენი ბიბლიოთეკაა
   (ტიპები, ძებნა, სტატისტიკა); აქ კი ჩანაწერზე ან **მსახიობზე** მიბმული
   ბმულებია, რომლებიც ვებძებნამ მოიტანა — ე.ი. გალერეის ნაწილია.

   ⚠️ **ვერტიკალური ბარათების ბადე** (აქამდე ჰორიზონტალური `h-20 w-32` ესკიზებით):
   `aspect-video` ესკიზი ხანგრძლივობითა და Play-ით, სათაური ორ ხაზად, არხი ·
   თარიღი, მფლობელის ჩიპი მოდულის ფერით; ღილაკები **ტექსტით** (დაკვრა · ჩანაწერი ·
   წყარო), წაშლა — კონტექსტურ მენიუში (§7). ზედა ზოლში ძებნა, „მფლობელი“ ჭრილი
   (ყველა · ჩანაწერი · მსახიობი), დალაგება და დაჯგუფება „ჩანაწერის მიხედვით“ —
   ძებნა/ფილტრი/დალაგება სერვერზეა (`q`, `owner_type`, `sort`), დაჯგუფება
   მიმდინარე გვერდზე ფრონტზე.

   ⚠️ **დაკვრა საერთო დამკვრელშია** (§7.2): გვერდის გადართვა დაკვრას არ
   წყვეტს. `kind: 'link'` ნიშნავს, რომ მრიცხველი არ არსებობს — ბმულს
   `videos` ცხრილში ჩანაწერი არ აქვს.

   ⚠️ **ესკიზი დაშორებული URL-ია** და ბლარის გარეშე ჩანს (შენი პირობა).
   ============================================================ */

const SORTS: GalleryVideoSort[] = ['new', 'old', 'title']

export function VideosCut() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { date } = useDateFormat()
  const { all: modules } = useModules()
  const player = usePlayer()

  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [owner, setOwner] = useState<'all' | GalleryVideoOwnerType>('all')
  const [sort, setSort] = useState<GalleryVideoSort>('new')
  const [grouping, setGrouping] = useState<'flat' | 'owner'>('flat')

  // ძებნა აკრეფისას, 350 ms ჩამორჩენით — ვიდეოების მოდულის იგივე წესი
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(q.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [q])

  const query = useQuery({
    queryKey: ['gallery-videos', { page, term, owner, sort }],
    queryFn: () =>
      fetchGalleryVideos({
        page,
        per_page: 24,
        q: term || undefined,
        owner_type: owner === 'all' ? undefined : owner,
        sort,
      }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteGalleryVideo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery-videos'] })
      qc.invalidateQueries({ queryKey: ['gallery-summary'] })
      toast({ title: t('gallery.videoDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const items = useMemo(() => query.data?.data ?? [], [query.data])
  const meta = query.data?.meta

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

  const ownerKey = (video: GalleryVideoItem) => `${video.owner.kind}:${video.owner.id}`

  /* §25.5 — დაჯგუფება „ჩანაწერის მიხედვით": მიმდინარე გვერდის ბმულები მფლობელის
     სექციებად, რიგი — როგორც სერვერმა მოიტანა */
  const sections = useMemo(() => {
    if (grouping !== 'owner') return null
    const map = new Map<string, { key: string; video: GalleryVideoItem; items: GalleryVideoItem[] }>()
    items.forEach((video) => {
      const key = ownerKey(video)
      const bucket = map.get(key) ?? { key, video, items: [] }
      bucket.items.push(video)
      map.set(key, bucket)
    })
    return [...map.values()]
  }, [items, grouping])

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

  const toolbar = (
    <div className="mb-4 space-y-3">
      <CutTabs
        size="sm"
        layout="inline"
        label={t('gallery.videoOwner')}
        options={[
          { key: 'all', label: t('filter.all') },
          { key: 'record', label: t('gallery.videoOwnerRecord') },
          { key: 'actor', label: t('gallery.videoOwnerActor') },
        ]}
        value={owner}
        onChange={(key) => {
          setOwner(key as 'all' | GalleryVideoOwnerType)
          setPage(1)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('gallery.videoSearch')} className="h-10 pl-8" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{t('sort.label')}</span>
            <Select
              value={sort}
              onValueChange={(next) => {
                setSort(next as GalleryVideoSort)
                setPage(1)
              }}
            >
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
          <CutTabs
            size="sm"
            layout="inline"
            options={[
              { key: 'flat', label: t('gallery.videoFlat') },
              { key: 'owner', label: t('gallery.videoByOwner') },
            ]}
            value={grouping}
            onChange={(key) => setGrouping(key as 'flat' | 'owner')}
          />
        </div>
      </div>
    </div>
  )

  const card = (video: GalleryVideoItem, index: number) => {
    const playable = isAllowedEmbed(video.embed_url)
    const accent = accentOf(video)
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
            {/* მფლობელის ჩიპი — მოდულის ფერით და ხატულით */}
            <button
              type="button"
              onClick={() => openOwner(video)}
              className="inline-flex max-w-full cursor-pointer items-center gap-1.5 self-start rounded-md border px-2 py-0.5 text-[11px] font-medium"
              style={tintStyle(accent) ?? undefined}
              data-testid="video-owner"
            >
              <ModuleIcon name={iconOf(video)} className="size-3" />
              <span className="truncate">{video.owner.title ?? `#${video.owner.id}`}</span>
            </button>

            <div className="mt-auto flex items-center gap-1 border-t border-border pt-2">
              <Button variant="ghost" size="sm" onClick={play}>
                <Play className="size-3.5" />
                {t('playback.play')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openOwner(video)}>
                {video.owner.kind === 'actor' ? <User className="size-3.5" /> : <Images className="size-3.5" />}
                {t(video.owner.kind === 'actor' ? 'gallery.videoOwnerActor' : 'gallery.videoOwnerRecord')}
              </Button>
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'ml-auto text-muted-foreground')}
              >
                <ExternalLink className="size-3.5" />
                {t('photos.infoOpen')}
              </a>
            </div>
          </div>
        </li>
      </RecordContextMenu>
    )
  }

  const grid = (list: GalleryVideoItem[]) => (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {list.map((video) => card(video, items.indexOf(video)))}
    </ul>
  )

  return (
    <div>
      {toolbar}

      {query.isLoading ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="aspect-video animate-pulse bg-muted/60" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/50" />
              </div>
            </li>
          ))}
        </ul>
      ) : !items.length ? (
        <EmptyState
          icon={<Video className="size-6" />}
          title={term || owner !== 'all' ? t('gallery.videoNoMatch') : t('gallery.noVideos')}
          hint={term || owner !== 'all' ? t('gallery.videoNoMatchHint') : t('gallery.noVideosHint')}
        />
      ) : sections ? (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.key}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ModuleIcon name={iconOf(section.video)} className="size-4" />
                <span className="truncate">{section.video.owner.title ?? `#${section.video.owner.id}`}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{section.items.length}</span>
              </h3>
              {grid(section.items)}
            </section>
          ))}
        </div>
      ) : (
        grid(items)
      )}

      {meta && meta.last_page > 1 && (
        <Pager page={meta.page} lastPage={meta.last_page} total={meta.total} onChange={setPage} />
      )}

    </div>
  )
}
