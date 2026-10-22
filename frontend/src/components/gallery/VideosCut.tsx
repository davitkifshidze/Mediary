import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ExternalLink, Images, Play, Search, User, Video } from 'lucide-react'
import {
  deleteGalleryVideo,
  fetchGalleryVideos,
  type GalleryVideo as GalleryVideoItem,
  type GalleryVideoGroup,
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
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { Select, SelectContent, SelectFitValue, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ModuleIcon } from '@/components/ModuleIcon'
import { LayoutToggle, type GalleryLayout } from '@/components/gallery/LayoutToggle'

/* ============================================================
   შენახული **ვიდეო-ბმულები** — თავიდან გადაკეთებული.

   შენი სიტყვები: „გალერეაში ვიდეოების გვერდიც ძალიან მახინჯია, გამითანამედროვე".

   ⚠️ **ეს ვიდეოს მოდული არ არის.** ვიდეოს მოდული შენი ბიბლიოთეკაა
   (ტიპები, ძებნა, სტატისტიკა); აქ კი ჩანაწერზე ან **მსახიობზე** მიბმული
   ბმულებია, რომლებიც ვებძებნამ მოიტანა — ე.ი. გალერეის ნაწილია.

   ⚠️ **ვერტიკალური ბარათების ბადე** (აქამდე ჰორიზონტალური `h-20 w-32` ესკიზებით):
   `aspect-video` ესკიზი ხანგრძლივობითა და Play-ით, სათაური ორ ხაზად, არხი ·
   თარიღი, მფლობელის ჩიპი მოდულის ფერით; ღილაკები **ტექსტით** (დაკვრა · ჩანაწერი ·
   წყარო), წაშლა — კონტექსტურ მენიუში. ზედა ზოლში მოდულის ტაბები (ფერით,
   ხატულით და რიცხვით — `facets.types`, ბიბლიოთეკის ჭრილივით), ძებნა, დალაგება,
   „დაჯგუფებული / არეული" (`LayoutToggle`, როგორც სხვა ჭრილებში) და დაჯგუფება
   „ჩანაწერით · მოდულით". ⚠️ დაჯგუფების რიგი **სერვერზეა** (`group`) — ჯგუფი
   გვერდებზე აღარ იხლიჩება; სექციებად კი მიმდინარე გვერდი იყოფა.

   ⚠️ **დაკვრა საერთო დამკვრელშია**: გვერდის გადართვა დაკვრას არ
   წყვეტს. `kind: 'link'` ნიშნავს, რომ მრიცხველი არ არსებობს — ბმულს
   `videos` ცხრილში ჩანაწერი არ აქვს.

   ⚠️ **ესკიზი დაშორებული URL-ია** და ბლარის გარეშე ჩანს (შენი პირობა).
   ============================================================ */

const SORTS: GalleryVideoSort[] = ['new', 'old', 'title']
const VIDEO_GROUPS: GalleryVideoGroup[] = ['record', 'module']

/** გვერდზე — ბადის 4 სვეტის (და 3-ისა და 2-ის) ჯერადი */
const VIDEO_PAGE_SIZE = 24

export function VideosCut() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { date } = useDateFormat()
  const { all: modules } = useModules()
  const player = usePlayer()

  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [facets, setFacets] = useState<Partial<Record<string, number>>>({})
  /** მოდულის ტაბი — `movie` · … · `actor` (ფოტოების `type`-ის იგივე სია) */
  const [type, setType] = useState<string>('all')
  const [sort, setSort] = useState<GalleryVideoSort>('new')
  const [layout, setLayout] = useState<GalleryLayout>('grouped')
  const [grouping, setGrouping] = useState<GalleryVideoGroup>('record')
  const group = layout === 'grouped' ? grouping : undefined

  // ძებნა აკრეფისას, 350 ms ჩამორჩენით — ვიდეოების მოდულის იგივე წესი
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(q.trim())
    }, 350)
    return () => clearTimeout(timer)
  }, [q])

  /* 24 = 4 სვეტის ჯერადი (6 რიგი); ნომრები + „მეტის ჩვენება" — ფილტრის შეცვლა პირველ გვერდზე აბრუნებს */
  const query = usePages({
    queryKey: ['gallery-videos', { term, type, sort, group }],
    fetchPage: (page) =>
      fetchGalleryVideos({
        page,
        per_page: VIDEO_PAGE_SIZE,
        q: term || undefined,
        type: type === 'all' ? undefined : type,
        sort,
        group,
      }).then((r) => {
        // მოდულის ტაბების რიცხვები — მოდულის ფილტრამდე, ყოველ გვერდზე ერთნაირი
        setFacets(r.facets?.types ?? {})
        return { items: r.data, total: r.meta.total, lastPage: r.meta.last_page }
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

  const items = query.items

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

  /* დაჯგუფება: მიმდინარე გვერდის ბმულები ჩანაწერის ან მოდულის სექციებად,
     რიგი — როგორც სერვერმა დაალაგა (`group`) */
  const sectionKey = (video: GalleryVideoItem) =>
    grouping === 'module' ? video.owner.kind : `${video.owner.kind}:${video.owner.id}`
  const sections = useMemo(() => {
    if (!group) return null
    const map = new Map<string, { key: string; video: GalleryVideoItem; items: GalleryVideoItem[] }>()
    items.forEach((video) => {
      const key = sectionKey(video)
      const bucket = map.get(key) ?? { key, video, items: [] }
      bucket.items.push(video)
      map.set(key, bucket)
    })
    return [...map.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sectionKey მხოლოდ grouping-ზეა დამოკიდებული
  }, [items, group, grouping])

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

  /** მოდულის სახელი სექციისა და ტაბისთვის (მსახიობი — ცალკე) */
  const moduleLabel = (kind: string) => {
    if (kind === 'actor') return t('gallery.inner.actors')
    const module = modules.find((m) => m.key === kind)
    return module ? moduleName(module, i18n.language) : kind
  }
  const moduleKinds = Object.keys(facets).filter((key) => key !== 'all' && (facets[key] ?? 0) > 0)

  const toolbar = (
    <div className="mb-4 space-y-3">
      {/* მოდულის ტაბები — ფერით, ხატულით და რიცხვით (ბიბლიოთეკის ჭრილივით) */}
      {moduleKinds.length > 0 && (
        <CutTabs
          label={t('gallery.domainScope')}
          options={[
            { key: 'all', label: t('filter.all'), count: facets.all },
            ...moduleKinds.map((kind) => {
              const module = modules.find((m) => m.key === (kind === 'actor' ? 'gallery' : kind))
              return {
                key: kind,
                label: moduleLabel(kind),
                count: facets[kind] ?? 0,
                color: module?.color ?? null,
                node: <ModuleIcon name={kind === 'actor' ? 'User' : (module?.icon ?? 'Images')} className="size-4 text-[var(--mod)]" />,
              }
            }),
          ]}
          value={type}
          onChange={setType}
        />
      )}
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
          {/* „დაჯგუფებული / არეული" — სხვა ჭრილების იგივე გადამრთველი */}
          <LayoutToggle value={layout} onChange={setLayout} />
          {layout === 'grouped' && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="hidden sm:inline">{t('gallery.groupSection.label')}</span>
              <Select value={grouping} onValueChange={(next) => setGrouping(next as GalleryVideoGroup)}>
                <SelectTrigger className="h-9 w-auto min-w-32 text-sm" data-testid="video-grouping">
                  <SelectFitValue labels={VIDEO_GROUPS.map((key) => t(`gallery.videoGroup.${key}`))} />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_GROUPS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`gallery.videoGroup.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
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
          title={term || type !== 'all' ? t('gallery.videoNoMatch') : t('gallery.noVideos')}
          hint={term || type !== 'all' ? t('gallery.videoNoMatchHint') : t('gallery.noVideosHint')}
        />
      ) : sections ? (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.key}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ModuleIcon name={iconOf(section.video)} className="size-4" />
                <span className="truncate">
                  {grouping === 'module' ? moduleLabel(section.video.owner.kind) : (section.video.owner.title ?? `#${section.video.owner.id}`)}
                </span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{section.items.length}</span>
              </h3>
              {grid(section.items)}
            </section>
          ))}
        </div>
      ) : (
        grid(items)
      )}

      {!query.isLoading && <Pagination {...query.pagination} />}

    </div>
  )
}
