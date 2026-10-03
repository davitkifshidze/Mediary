import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, DownloadCloud, Globe, Images, Maximize2, Search, Star, Trash2, User, Video } from 'lucide-react'
import {
  fetchActorGalleryImages,
  fetchGalleryGroups,
  type GalleryGroup,
  type GalleryGroupBy,
  type GalleryParentKind,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { useDeleteGroupPhotos } from '@/lib/galleryDelete'
import { MEDIA_NAV_KEY, type MediaType } from '@/lib/media'
import type { PhotoAction } from '@/lib/photoActions'
import { sectionGalleryGroups, sortGalleryGroups } from '@/lib/galleryGroups'
import { useContentLang } from '@/lib/settings'
import { isMediaKey, useModules } from '@/lib/modules'
import { statusName, useMergedStatuses } from '@/lib/statuses'
import { useFilterDraft } from '@/lib/filters'
import { tintStyle } from '@/lib/gameMeta'
import { fetchGenres } from '@/api/media'
import { cn, formatBytes } from '@/lib/utils'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectFitValue, SelectItem, SelectTrigger } from '@/components/ui/select'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { StatusBadge } from '@/components/StatusBadge'
import { FilterGroup, FilterOption, FilterOptionList, FilterPanel, FilterRange, FilterTrigger } from '@/components/FilterPanel'
import { LayoutToggle } from '@/components/gallery/LayoutToggle'
import {
  GALLERY_GROUP_SECTIONS,
  GALLERY_GROUP_SORTS,
  type GalleryGroupSection,
  type GalleryGroupSort,
} from '@/lib/galleryGroups'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { PhotoStack } from '@/components/ui/photo-stack'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { CutTabs } from '@/components/ui/cut-tabs'
import { WebImageDialog } from '@/components/WebImageDialog'
import { WebVideoDialog } from '@/components/WebVideoDialog'

/* ============================================================
   ჯგუფების ჭრილი — **ერთი კომპონენტი ოთხივესთვის** (§8.5).

   `record` · `actor` · `source` (რომელი დომენიდან) · `provider` (რომელმა
   წყარომ მოიტანა). ოთხივე ერთსა და იმავე endpoint-ს ეკითხება და ერთსა და
   იმავე დასტად იხატება — განსხვავება მხოლოდ ფილტრებსა და მოქმედებებშია.

   ⚠️ **ჩამოტვირთვა ჯგუფშივეა** (§8.5): „მასობრივი ჩამოტვირთვის" ბლოკი
   იმიტომ იყო ცუდი, რომ სკოუპს ხელახლა ალაგებინებდა იქ, სადაც ის უკვე
   ცნობილია — ჯგუფის ბარათზე კონტექსტი უკვე არსებობს.

   ⚠️ **ვებძებნა მხოლოდ იქ, სადაც მიბმის მისამართია** — „წყაროს" და
   „მომწოდებლის" ჯგუფი დომენია და არა ერთეული, ე.ი. ფოტოს მიბმა არსად აქვს.

   ## ეტაპი 2
   ⚠️ **დომენის ტაბი აქ არ არის — ის `RecordsCut`-შია.** ამ კომპონენტს
   `type`/`from` **პროპად** მოსდის, რომ იგივე სია მსახიობების ცალკე ჭრილმაც
   გამოიყენოს (იქ ტაბი არ არის) და ორი ასლი არ გაჩნდეს.

   ⚠️ **დალაგება და სექციებად დაყოფა ფრონტზეა** (`lib/galleryGroups.ts`):
   ორივე ეკრანზე დაწერილ სახელს ეყრდნობა (`contentLang`), რომელსაც სერვერი
   ვერ იცნობს.

   ## 2026-09-13-ის ნაკრები, ეტაპი 2
   ⚠️ **ბარათის მოქმედებები ერთი სიაა** (`groupActions()`): ქვედა ზოლის
   ღილაკებიც და **მარჯვენა კლიკის მენიუც** აქედან იხატება. ორი ასლი
   აუცილებლად გაშორდებოდა — ერთში „წაშლა" იქნებოდა, მეორეში არა.
   ============================================================ */


/** პანელის ფილტრები — „ცარიელი" და მისი ტიპი ერთ ადგილას (`lib/filters.ts`) */
const EMPTY_PANEL = { genres: [] as string[], statuses: [] as string[], yearMin: '', yearMax: '' }

/** მსახიობებს წელი არ აქვთ — „წლით" დალაგება ჩუმად არაფერს გააკეთებდა */
const ACTOR_SORTS: readonly GalleryGroupSort[] = ['photos', 'photos_asc', 'title', 'bytes']

function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (next: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="hidden sm:inline">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-auto min-w-36 text-sm">
          <SelectFitValue labels={options.map((option) => option.label)} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

export function GroupsCut({
  by,
  type,
  from,
  domains,
  onDownloadRecord,
  onDownloadActor,
}: {
  by: Extract<GalleryGroupBy, 'record' | 'actor' | 'source' | 'provider'>
  /** ჩანაწერების ჭრილის დომენის ტაბი */
  type?: GalleryParentKind
  /** მსახიობების ჭრილის დომენის ტაბი — ვინც ამ დომენში თამაშობს */
  from?: MediaType
  /** რომელი დომენების ჟანრი/სტატუსი ივარგებს ფილტრში */
  domains?: GalleryParentKind[]
  /** ჩანაწერზე ჩამოტვირთვა — დიალოგს გვერდი ხსნის (სკოუპი უკვე ცნობილია) */
  onDownloadRecord?: (group: GalleryGroup) => void
  /** მსახიობზე ჩამოტვირთვა პარამეტრებით */
  onDownloadActor?: (group: GalleryGroup) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()

  /* ---------- Tasks §25.2 — ფილტრები `FilterPanel` + `useFilterDraft`-ზე ----------
     ⚠️ **„ფოტოიანი / უფოტო / ყველა“ URL-შია** (`?have=`): დომენის ბარათების
     რიცხვებიც (`RecordsCut`) ამას კითხულობს, ე.ი. „უფოტოზე" გადასვლა მათაც
     ცვლის — აქამდე ისინი `have:'with'`-ზე იყო მიბმული. ზოლის კონტროლები
     (ძებნა, რჩეული, ხედი, დალაგება, დაჯგუფება) უმალ მოქმედებენ, პანელის
     სია (ჟანრი, სტატუსი, წელი) კი „გაფილტვრა“-ზე. */
  const { all: modules } = useModules()
  const [q, setQ] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [layout, setLayout] = useState<'grouped' | 'mixed'>('grouped')
  const [sort, setSort] = useState<GalleryGroupSort>('photos')
  const [section, setSection] = useState<GalleryGroupSection>('none')
  const [panelOpen, setPanelOpen] = useState(false)
  const [applied, setApplied] = useState(EMPTY_PANEL)
  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(applied, EMPTY_PANEL, (next) => {
    setApplied(next)
    setPanelOpen(false)
  })
  const [gender, setGender] = useState<'all' | 'female' | 'male'>('all')
  /**
   * §28 — შეკრებილი სექციები.
   *
   * ⚠️ **შეკრებილები ინახება და არა გაშლილები**: ახალი სექცია (ახალი ჟანრი,
   * ახალი წელი) გაშლილი უნდა დაიბადოს — თორემ ფილტრის შეცვლაზე ეკრანი
   * უცებ ცარიელდებოდა და ეს „აღარაფერია"-დ იკითხებოდა.
   */
  const [closed, setClosed] = useState<Set<string>>(new Set())
  /* Tasks §3.1 — ⚠️ **გახსნილი ჯგუფი URL-შია** (`?open=movie:12`) და არა `useState`-ში:
     ჩანაწერის გალერეიდან „უკან" დაბრუნებისას კომპონენტი თავიდან იტვირთება და
     მხოლოდ URL-იდან იცის, რა იყო გახსნილი; ბრაუზერის „უკან"-იც ჯგუფს ხურავს,
     რადგან გახსნა ისტორიაში ცალკე ჩანაწერია. თვითონ ჯგუფი `open`-ად ქვემოთ
     ითვლება — სიიდან, გასაღებით (`keyFor`). */
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const haveParam = params.get('have')
  const have: 'with' | 'without' | 'all' = haveParam === 'without' || haveParam === 'all' ? haveParam : 'with'
  const setHave = (next: 'with' | 'without' | 'all') =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        if (next === 'with') n.delete('have')
        else n.set('have', next)
        n.delete('open')
        return n
      },
      { replace: true },
    )
  const mediaDomains = (by === 'record' ? (domains ?? (type ? [type] : [])) : []).filter(isMediaKey)
  const genresQ = useQuery({
    queryKey: ['genres', mediaDomains.length === 1 ? mediaDomains[0] : 'all'],
    // §25.2 — ერთი დომენი → **დომენის** ჟანრები; „ყველა" — გლობალური სია
    queryFn: () => fetchGenres(mediaDomains.length === 1 ? mediaDomains[0] : undefined),
    enabled: mediaDomains.length > 0,
  })
  const statuses = useMergedStatuses(mediaDomains)
  const genreLabel = (slug: string) => {
    const genre = genresQ.data?.find((g) => g.slug === slug)
    return genre ? (lang === 'ka' ? genre.name_ka || genre.name_en : genre.name_en || genre.name_ka) || slug : slug
  }
  // პანელის სია დომენის ცვლილებაზე ინულდება — სხვა დომენის ჟანრი აქ არაფერს ჭრის
  useEffect(() => {
    setApplied(EMPTY_PANEL)
  }, [type, from])
  const [webOn, setWebOn] = useState<GalleryGroup | null>(null)
  const [videoOn, setVideoOn] = useState<GalleryGroup | null>(null)

  /* ⚠️ სერვერს მხოლოდ ის მიაქვს, რაც **სიას ჭრის**; დალაგება და სექციები
     ქვემოთ, უკვე ჩამოტვირთულ სიაზე კეთდება — ე.ი. მათი შეცვლა ახალ
     მოთხოვნას არ იწვევს. */
  const query = {
    type: by === 'record' ? type : undefined,
    from: by === 'actor' ? from : undefined,
    q: q.trim() || undefined,
    gender: by === 'actor' && gender !== 'all' ? gender : undefined,
    have: by === 'record' ? have : undefined,
    genre: by === 'record' && applied.genres.length ? applied.genres.join(',') : undefined,
    status: by === 'record' && applied.statuses.length ? applied.statuses.join(',') : undefined,
    favorite: by === 'record' && favorite ? true : undefined,
    year_min: by === 'record' && applied.yearMin ? Number(applied.yearMin) : undefined,
    year_max: by === 'record' && applied.yearMax ? Number(applied.yearMax) : undefined,
    previews: 5,
  } as const

  const groupsQ = useQuery({
    queryKey: ['gallery-groups', by, query],
    queryFn: () => fetchGalleryGroups(by, query),
  })

  /**
   * **„არეული" ხედის ბრტყელი ფილტრი (§28).**
   *
   * ⚠️ ის **იმავე სკოუპს** უნდა აღწერდეს, რასაც დასტები: `parent` ამბობს,
   * ვის ჰკიდია ფოტო, `type`/`from` კი დომენს ჭრის. `from=movie` +
   * `parent=actor` ზუსტად „ფილმების მსახიობების ფოტოებია" — რადგან
   * `from` ჯერ ჩანაწერსაც და მის შემადგენლობასაც აერთიანებს, `parent`
   * კი მათგან მსახიობებს ტოვებს.
   */
  const flatFilters =
    by === 'actor'
      ? ({ parent: 'actor', from } as const)
      : ({ parent: 'record', type } as const)

  /** მსახიობზე ჩამოტვირთვა პირდაპირ ერთი გამოძახებაა (ნაგულისხმევი პარამეტრებით) */
  const quickActor = useMutation({
    mutationFn: (id: number) => fetchActorGalleryImages(id),
    onSuccess: (result) => {
      ;['gallery-photos', 'gallery-groups', 'gallery-summary'].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({
        title: result.added ? t('gallery.fetchedCount', { count: result.added }) : t('gallery.actorNothingNew'),
        variant: result.added ? 'success' : 'info',
      })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const titleOf = (group: GalleryGroup) => {
    if (group.from) return t(MEDIA_NAV_KEY[group.from])
    if (group.provider) return t(`photos.source.${group.provider}`, group.provider)
    return (lang === 'ka' ? group.title_ka || group.title : group.title || group.title_ka) || `#${group.id}`
  }

  /**
   * ჯგუფის შიგნით შესვლა — ორი მისამართი, ერთი ფორმა.
   *
   * ⚠️ Tasks §6.3 — ჩანაწერის ჯგუფი **მხოლოდ მისი საკუთარი ფოტოებია** (`with_cast: false`):
   * backend `owner=movie:ID`-ზე ნაგულისხმევად მსახიობების ფოტოებსაც აბრუნებდა, ე.ი.
   * ბარათი „12 ფოტოს" წერდა, შიგნით მეტი ჩანდა, „ჯგუფის წაშლა" კი **მსახიობების
   * ფოტოებსაც შლიდა** — ისინი სხვა ფილმებშიც ჩანან და თავისი დასტა აქვთ.
   */
  const filtersFor = (group: GalleryGroup) => {
    if (group.from) return { from: group.from }
    if (group.provider) return { provider: group.provider }
    if (group.kind === 'actor') return { owner: `actor:${group.id}` }
    return { owner: `${group.kind}:${group.id}`, with_cast: false as const }
  }

  const keyFor = (group: GalleryGroup) =>
    group.from ? `from:${group.from}` : group.provider ? `provider:${group.provider}` : `${group.kind}:${group.id}`

  /* გახსნილი ჯგუფი — URL-ის `open`-ით (§3.1). ⚠️ სანამ სია იტვირთება, ჯგუფი
     ჯერ ვერ მოიძებნება — `openPending` ჩონჩხს აჩვენებს, თორემ ერთი წამით სია
     გაიელვებდა და მერე „ჩავარდებოდა" ჯგუფში. */
  const openKey = params.get('open')
  const open = openKey ? (groupsQ.data?.groups.find((g) => keyFor(g) === openKey) ?? null) : null
  const openPending = !!openKey && !open && groupsQ.isLoading
  const setOpen = (group: GalleryGroup | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (group) next.set('open', keyFor(group))
      else next.delete('open')
      return next
    })
  /** საიდან მოვედით — ჩანაწერის გალერეის „უკან"-ისთვის (§3.2) */
  const here = `${location.pathname}${location.search}`

  /**
   * ჯგუფის **ყველა** ფოტოს წაშლა.
   *
   * ⚠️ **ლოგიკა `lib/galleryDelete.ts`-შია** (2026-09-16): ალბომების ჭრილსაც
   * ზუსტად იგივე დასჭირდა, ე.ი. აქ დატოვებული მეორე ასლი ერთ დღეს
   * გაშორდებოდა — ერთგან ქეშის გაუქმება დაემატებოდა, მეორეგან არა.
   *
   * ⚠️ **დადასტურება დათვლილია** (`group.photos`) — „წყაროს"/„მომწოდებლის"
   * ჭრილში ჯგუფი მთელი დომენია და რიცხვის დანახვის გარეშე ეს მოქმედება
   * ბრმა იქნებოდა.
   */
  const removeGroup = useDeleteGroupPhotos()

  /**
   * ბარათის მოქმედებები — **ერთი სია ღილაკებისთვისაც და მენიუსთვისაც**.
   *
   * ⚠️ **პუნქტი, რომელიც ვერ იმუშავებს, საერთოდ არ იხატება**: „წყაროს" და
   * „მომწოდებლის" ჯგუფი დომენია და არა ერთეული, ე.ი. არც მისი გვერდი
   * არსებობს და არც ფოტოს მიბმის მისამართი (ვებძებნა).
   */
  const groupActions = (group: GalleryGroup): PhotoAction[] => {
    const isActor = group.kind === 'actor'
    const isRecord = !group.from && !group.provider && !isActor

    const list: PhotoAction[] = [
      { key: 'open', label: t('gallery.openGroup'), icon: Maximize2, run: () => setOpen(group) },
    ]

    if (group.has_tmdb) {
      list.push({
        key: 'fetch',
        label: t('gallery.fetch'),
        icon: DownloadCloud,
        quick: true,
        run: () =>
          isActor
            ? onDownloadActor
              ? onDownloadActor(group)
              : quickActor.mutate(group.id)
            : onDownloadRecord?.(group),
      })
    }

    if (isActor) {
      list.push({
        key: 'actorPage',
        label: t('gallery.actorPage'),
        icon: User,
        run: () => navigate(`/actors/${group.id}`),
      })
    }

    if (isRecord) {
      list.push({
        key: 'record',
        label: t('gallery.openRecord'),
        icon: Images,
        /* ⚠️ სათაური **state-ით** მიჰყვება — არა-მედია მშობელს დეტალის
           endpoint არ აქვს (იხ. ჯგუფის შიგნითა ზოლი ქვემოთ) */
        run: () =>
          navigate(`/gallery/records/${group.kind}/${group.id}`, { state: { title: titleOf(group), from: here } }),
      })
    }

    if (isActor || isRecord) {
      list.push(
        { key: 'web', label: t('web.searchPhotos'), icon: Globe, run: () => setWebOn(group) },
        { key: 'webVideo', label: t('web.searchVideos'), icon: Video, run: () => setVideoOn(group) },
      )
    }

    if (group.photos > 0) {
      list.push({
        key: 'delete',
        label: t('gallery.deleteGroup', { count: group.photos }),
        icon: Trash2,
        danger: true,
        run: async () => {
          const ok = await confirm({
            title: t('gallery.deleteGroupTitle'),
            description: t('gallery.deleteGroupHint', {
              count: group.photos,
              name: titleOf(group),
            }),
            confirmText: t('confirm.delete'),
            variant: 'destructive',
          })
          if (ok) removeGroup.mutate(filtersFor(group))
        },
      })
    }

    return list
  }

  const groups = useMemo(
    () => sortGalleryGroups(groupsQ.data?.groups ?? [], sort, titleOf, lang),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- titleOf ყოველ რენდერზე ახალია და მხოლოდ lang-ზეა დამოკიდებული
    [groupsQ.data, sort, lang],
  )

  const sections = useMemo(
    () => sectionGalleryGroups(groups, by === 'record' ? section : 'none', lang, t('gallery.unknownSection')),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t ენის ცვლილებაზე იცვლება, რასაც lang უკვე ფარავს
    [groups, section, by, lang],
  )

  // §25.1 — ბარათის აქცენტი მოდულის ფერია; მსახიობი გალერეის მოდულისაა
  const accentOf = (group: GalleryGroup): string | null => {
    const key = group.kind === 'actor' ? 'gallery' : group.from ? group.from : group.kind
    return modules.find((m) => m.key === key)?.color ?? null
  }

  /** ერთი სექციის შეკრება/გაშლა */
  const toggleSection = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /** ⚠️ „ყველას შეკრება" ორმხრივია: სრულად შეკრებილზე იგივე ღილაკი შლის */
  const toggleAll = (keys: string[]) =>
    setClosed((prev) => (prev.size >= keys.length ? new Set() : new Set(keys)))

  /**
   * ვებძებნის ორი დიალოგი (ეტაპი 3, **ცოცხალი ხარვეზის შესწორება**).
   *
   * ⚠️ **ორივე შტოში უნდა დაიხატოს.** ისინი ადრე მხოლოდ ჯგუფების **სიის**
   * დაბრუნებაში იდო, ღილაკები კი — გახსნილი ჯგუფის შტოში, რომელიც `if (open)`-ით
   * **ადრე ბრუნდება**. ე.ი. მსახიობის (ან ჩანაწერის) ჯგუფში შესვლისას
   * „ფოტოები ვებიდან"/„ვიდეოს ძებნა" `state`-ს ცვლიდა და **არაფერი ხდებოდა** —
   * ზუსტად ის, რაზეც მითითება იყო: „არ იხსნება, არაფერი".
   */
  const dialogs = (
    <>
      {webOn && (
        <WebImageDialog
          target={webOn.kind === 'actor' ? 'cast_member' : (webOn.kind as 'movie')}
          id={webOn.id}
          initialQuery={titleOf(webOn)}
          title={t('web.searchPhotosFor', { name: titleOf(webOn) })}
          context={{ base: titleOf(webOn), attachesTo: titleOf(webOn) }}
          onClose={() => setWebOn(null)}
          onImported={() => {
            ;['gallery-photos', 'gallery-groups', 'gallery-summary'].forEach((key) =>
              qc.invalidateQueries({ queryKey: [key] }),
            )
          }}
        />
      )}

      {videoOn && (
        <WebVideoDialog
          target={videoOn.kind === 'actor' ? 'cast_member' : (videoOn.kind as 'movie')}
          id={videoOn.id}
          initialQuery={titleOf(videoOn)}
          title={t('web.searchVideosFor', { name: titleOf(videoOn) })}
          onClose={() => setVideoOn(null)}
        />
      )}
    </>
  )

  // URL-ში ჯგუფი წერია, სია კი ჯერ არ ჩამოსულა — ჩონჩხი და არა სიის გაელვება (§3.1)
  if (openPending) return <GalleryStackSkeleton aspect={by === 'actor' ? 'portrait' : 'wide'} />

  if (open) {
    const isActor = open.kind === 'actor'
    const isRecord = !open.from && !open.provider && !isActor

    const inner = (
      <GroupPhotos
        title={titleOf(open)}
        subtitle={t('gallery.photos', { count: open.photos })}
        filters={filtersFor(open)}
        cacheKey={keyFor(open)}
        onBack={() => setOpen(null)}
        /* §25.4 — კადრი/პოსტერი/ლოგო/მსახიობი ჩანართები ბიბლიოთეკაშიც */
        categories={isRecord}
        showOwner={!!open.from || !!open.provider}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {isActor && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/actors/${open.id}`)}>
                <User className="size-4" />
                {t('gallery.actorPage')}
              </Button>
            )}
            {/* ⚠️ სათაური **state-ით** მიჰყვება: არა-მედია მშობელს (სიმღერა ·
                წიგნი · თამაში) დეტალის endpoint არ აქვს, ე.ი. ის გვერდი მის
                სახელს სხვაგვარად ვერ გაიგებდა და ვებძებნა ცარიელი ველით
                გაიხსნებოდა. */}
            {isRecord && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/gallery/records/${open.kind}/${open.id}`, {
                    state: { title: titleOf(open), from: here },
                  })
                }
              >
                <Images className="size-4" />
                {t('gallery.openRecord')}
              </Button>
            )}
            {open.has_tmdb && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (isActor ? onDownloadActor?.(open) : onDownloadRecord?.(open))}
              >
                <DownloadCloud className="size-4" />
                {t('gallery.fetchMore')}
              </Button>
            )}
            {(isActor || isRecord) && (
              <>
                <Button variant="outline" size="sm" onClick={() => setWebOn(open)}>
                  <Globe className="size-4" />
                  {t('web.searchPhotos')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setVideoOn(open)}>
                  <Video className="size-4" />
                  {t('web.searchVideos')}
                </Button>
              </>
            )}
          </div>
        }
      />
    )

    return (
      <>
        {inner}
        {dialogs}
      </>
    )
  }

  const card = (group: GalleryGroup) => {
    const actions = groupActions(group)
    const fetch = actions.find((action) => action.key === 'fetch')
    const busy =
      (quickActor.isPending && quickActor.variables === group.id) ||
      (removeGroup.isPending && removeGroup.variables === group)
    const accent = accentOf(group)
    const isRecord = by === 'record'

    /* §25.1 — ქვედა ზოლი ერთი სიმაღლის (h-9) ორი ღილაკით — „გახსნა", „ჩამოტვირთვა" —
       და `⋯` მენიუთი (იგივე სია, რაც მარჯვენა კლიკს აქვს, §7) */
    return (
      <li key={keyFor(group)}>
        <PhotoStack
          title={titleOf(group)}
          subtitle={by === 'record' && lang === 'ka' && group.title && group.title_ka ? group.title : undefined}
          label={`${t('gallery.photos', { count: group.photos })} · ${formatBytes(group.bytes)}`}
          count={group.photos}
          images={groupsQ.data?.previews[keyFor(group)] ?? []}
          aspect={by === 'actor' ? 'portrait' : 'wide'}
          // შერეული ფორმატი (წყარო/მომწოდებელი) — არ იჭრება, მუქ ფონზე ჯდება
          fit={by === 'source' || by === 'provider' ? 'contain' : 'cover'}
          accent={accent}
          chips={
            isRecord && group.genres?.length ? (
              <>
                {group.genres.slice(0, 3).map((genre) => (
                  <span
                    key={genre.slug}
                    className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px]"
                    style={tintStyle(accent) ?? undefined}
                  >
                    {(lang === 'ka' ? genre.name_ka || genre.name_en : genre.name_en || genre.name_ka) || genre.slug}
                  </span>
                ))}
              </>
            ) : undefined
          }
          meta={
            isRecord && (group.year || group.status || group.favorite) ? (
              <>
                {group.year ? <span className="tabular-nums">{group.year}</span> : null}
                {group.status && <StatusBadge status={group.status} className="h-6 px-2 text-[11px]" />}
                {group.favorite && <Star className="size-3.5 fill-current text-favorite" aria-label={t('filter.favorite')} />}
              </>
            ) : undefined
          }
          onClick={() => setOpen(group)}
          actions={
            <>
              <Button variant="outline" size="sm" className="min-w-0 flex-1" disabled={busy} onClick={() => setOpen(group)}>
                <Maximize2 className="size-3.5" />
                <span className="truncate">{t('actions.open')}</span>
              </Button>
              {fetch && (
                <Button variant="outline" size="sm" className="min-w-0 flex-1" disabled={busy} onClick={fetch.run}>
                  <DownloadCloud className="size-3.5" />
                  <span className="truncate">{t('gallery.fetchShort')}</span>
                </Button>
              )}
              <ActionMenu label={t('actions.more')}>
                {actions.map((action) => (
                  <ActionMenuClose key={action.key} asChild>
                    <button
                      type="button"
                      className={actionItemClass(action.danger ? 'destructive' : undefined)}
                      disabled={busy}
                      onClick={action.run}
                    >
                      <action.icon className="size-3.5" />
                      {action.label}
                    </button>
                  </ActionMenuClose>
                ))}
              </ActionMenu>
            </>
          }
          menu={actions.map((action) => (
            <Fragment key={action.key}>
              {action.danger && <ContextMenuSeparator />}
              <ContextMenuItem
                onSelect={action.run}
                disabled={busy}
                className={action.danger ? 'text-destructive focus:bg-destructive/10' : undefined}
              >
                <action.icon className="size-3.5" />
                {action.label}
              </ContextMenuItem>
            </Fragment>
          ))}
        />
      </li>
    )
  }

  const grid = (items: GalleryGroup[]) => (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map(card)}</ul>
  )

  return (
    <>
      <section>
        {/* §24.2 — „ყველა / მსახიობი ქალები / მსახიობი კაცები" ბარათებად.
            ⚠️ რიცხვი **ფასეტურია** (სერვერი მას სქესის ფილტრის გარეშე
            ითვლის), თორემ „ქალების" არჩევისთანავე „კაცები" ნულზე
            ჩამოვიდოდა და ბარათი პასუხს აღარ გასცემდა. */}
        {by === 'actor' && (
          <div className="mb-4">
            <CutTabs
              label={t('gallery.castScope')}
              options={(['all', 'female', 'male'] as const).map((key) => ({
                key,
                label: key === 'all' ? t('gallery.cast.all') : t(`gallery.cast.${key}`),
                count: groupsQ.data?.facets?.gender?.[key],
              }))}
              value={gender}
              onChange={(key) => setGender(key as 'all' | 'female' | 'male')}
            />
          </div>
        )}

        {/* ⚠️ „წყაროს"/„მომწოდებლის" ჭრილში ჯგუფი **დომენია** — იქ არც ძებნას
            აქვს აზრი და არც ჟანრს, ამიტომ ფილტრის ზოლი მხოლოდ ორ ჭრილშია.
            §25.2 — ზოლი ერთი სიმაღლისაა (h-10 ძებნა, h-9 კონტროლები), სია `FilterPanel`-შია. */}
        {by === 'record' && (
          <div className="mb-3">
            <CutTabs
              size="sm"
              layout="inline"
              options={(['with', 'without', 'all'] as const).map((key) => ({ key, label: t(`gallery.have.${key}`) }))}
              value={have}
              onChange={(key) => setHave(key as 'with' | 'without' | 'all')}
            />
          </div>
        )}

        {(by === 'record' || by === 'actor') && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('gallery.searchPlaceholder')} className="h-10 pl-8" />
              </div>
              {by === 'record' && (
                /* §25.2 — რჩეული ზოლის ჩიპია ყველა დომენზე (წიგნზეც), h-9 */
                <Chip active={favorite} className="h-9" icon={<Star className="size-3.5" />} onClick={() => setFavorite((v) => !v)}>
                  {t('filter.favorite')}
                </Chip>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <LayoutToggle value={layout} onChange={setLayout} />
                <Pick
                  label={t('gallery.groupSort.label')}
                  value={sort}
                  options={(by === 'actor' ? ACTOR_SORTS : GALLERY_GROUP_SORTS).map((key) => ({ value: key, label: t(`gallery.groupSort.${key}`) }))}
                  onChange={(next) => setSort(next as GalleryGroupSort)}
                />
                {by === 'record' && (
                  <Pick
                    label={t('gallery.groupSection.label')}
                    value={section}
                    options={GALLERY_GROUP_SECTIONS.map((key) => ({ value: key, label: t(`gallery.groupSection.${key}`) }))}
                    onChange={(next) => setSection(next as GalleryGroupSection)}
                  />
                )}
                {sections.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => toggleAll(sections.map((x) => x.key))}>
                    {closed.size >= sections.length ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />}
                    {t(closed.size >= sections.length ? 'gallery.expandAll' : 'gallery.collapseAll')}
                  </Button>
                )}
                {mediaDomains.length > 0 && <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />}
              </div>
            </div>

            {/* არჩეული — პანელის გარეთაც ჩანს (§2.3-ის წესი), ჯვრით */}
            {activeCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {applied.genres.map((slug) => (
                  <Chip key={slug} active remove onClick={() => setApplied({ ...applied, genres: applied.genres.filter((x) => x !== slug) })}>
                    {genreLabel(slug)}
                  </Chip>
                ))}
                {applied.statuses.map((key) => (
                  <Chip key={key} active remove onClick={() => setApplied({ ...applied, statuses: applied.statuses.filter((x) => x !== key) })}>
                    {statusName(statuses.find((status) => status.key === key), lang) || key}
                  </Chip>
                ))}
                {(applied.yearMin || applied.yearMax) && (
                  <Chip active remove onClick={() => setApplied({ ...applied, yearMin: '', yearMax: '' })}>
                    {`${applied.yearMin || '…'} – ${applied.yearMax || '…'}`}
                  </Chip>
                )}
              </div>
            )}
          </div>
        )}

        {mediaDomains.length > 0 && (
          <FilterPanel
            activeCount={activeCount}
            dirty={dirty}
            onApply={() => apply(draft)}
            onClear={clear}
            open={panelOpen}
            onOpenChange={setPanelOpen}
          >
            <FilterGroup title={t('filter.genres')} count={draft.genres.length}>
              <FilterOptionList>
                {(genresQ.data ?? []).map((genre) => (
                  <FilterOption
                    key={genre.slug}
                    label={genreLabel(genre.slug)}
                    checked={draft.genres.includes(genre.slug)}
                    onChange={(on) =>
                      setDraft((d) => ({ ...d, genres: on ? [...d.genres, genre.slug] : d.genres.filter((x) => x !== genre.slug) }))
                    }
                  />
                ))}
              </FilterOptionList>
            </FilterGroup>
            {statuses.length > 0 && (
              <FilterGroup title={t('filter.statuses')} count={draft.statuses.length}>
                <FilterOptionList>
                  {statuses.map((status) => (
                    <FilterOption
                      key={status.key}
                      label={statusName(status, lang)}
                      checked={draft.statuses.includes(status.key)}
                      onChange={(on) =>
                        setDraft((d) => ({ ...d, statuses: on ? [...d.statuses, status.key] : d.statuses.filter((x) => x !== status.key) }))
                      }
                    />
                  ))}
                </FilterOptionList>
              </FilterGroup>
            )}
            <FilterGroup title={t('filter.year')} count={(draft.yearMin ? 1 : 0) + (draft.yearMax ? 1 : 0)}>
              <FilterRange
                label={t('filter.year')}
                from={draft.yearMin}
                to={draft.yearMax}
                onFrom={(value) => setDraft((d) => ({ ...d, yearMin: value }))}
                onTo={(value) => setDraft((d) => ({ ...d, yearMax: value }))}
                fromPlaceholder={t('filter.from')}
                toPlaceholder={t('filter.to')}
                min={1888}
                max={2100}
              />
            </FilterGroup>
          </FilterPanel>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {by === 'source' && <InfoHint info={t('gallery.bySourceHint')} />}
          {by === 'provider' && <InfoHint info={t('gallery.byProviderHint')} />}
          <span className="ml-auto text-xs text-muted-foreground">
            {t('gallery.groupCount', { count: groups.length })}
          </span>
        </div>

        {/* §28 — „არეული": იმავე სკოუპის ფოტოები ბრტყელ ბადეზე */}
        {layout === 'mixed' && (by === 'record' || by === 'actor') ? (
          <GroupPhotos
            title={t('gallery.allPhotos')}
            hint={<InfoHint info={t('gallery.mixedHint')} />}
            filters={flatFilters}
            cacheKey={`flat:${by}:${type ?? from ?? 'all'}`}
            showOwner
          />
        ) : groupsQ.isLoading ? (
          <GalleryStackSkeleton aspect={by === 'actor' ? 'portrait' : 'wide'} />
        ) :!groups.length ? (
          <EmptyState
            icon={<Images className="size-6" />}
            title={have === 'without' ? t('gallery.allHavePhotos') : t('gallery.noPhotosYet')}
            hint={q ? t('gallery.emptyFiltered') : t('gallery.emptyHint')}
          />
        ) : sections.length ? (
          <div className="space-y-6">
            {sections.map((section) => {
              const key = section.key || 'unknown'
              const shut = closed.has(key)

              return (
                <div key={key}>
                  {/* ⚠️ სათაური **ღილაკია** (§28 — „შეკრება"): ცალკე პატარა
                      ისარი სენსორულ ეკრანზე პრაქტიკულად მიუწვდომელია */}
                  <button
                    type="button"
                    onClick={() => toggleSection(key)}
                    className="mb-2 flex w-full items-center gap-2 text-left text-sm font-semibold"
                  >
                    <ChevronDown
                      className={cn('size-4 transition-transform', shut && '-rotate-90')}
                    />
                    {section.label}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {section.groups.length}
                    </span>
                  </button>
                  {!shut && grid(section.groups)}
                </div>
              )
            })}
          </div>
        ) : (
          grid(groups)
        )}
      </section>

      {dialogs}
    </>
  )
}
