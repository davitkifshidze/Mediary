import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import {
  Check,
  ChevronDown,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Images,
  Link2,
  Loader2,
  Plus,
  Search,
  Tags,
} from 'lucide-react'
import {
  createBookmark,
  deleteBookmark,
  fetchBookmark,
  fetchBookmarkCategories,
  fetchBookmarks,
  fetchLinkMetadata,
  markBookmarkVisited,
  setBookmarkStatus,
  toggleBookmarkFavorite,
  updateBookmark,
  uploadBookmarkFiles,
  type Bookmark,
  type BookmarkCategory,
  type BookmarkFilters,
  type BookmarkInput,
  type BookmarkLink,
  type BookmarkStatus,
  type LinkMetadata,
} from '@/api/bookmarks'
import { storageUrl } from '@/lib/api'
import { bookmarkKey, useBookmarkRefresh } from '@/lib/bookmarks'
import { usePendingUploads } from '@/lib/pendingUploads'
import { keyRows, unkeyRows, type Keyed } from '@/lib/rowKeys'
import { useModuleFields } from '@/lib/fields'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { statusByKey, statusName, useStatuses } from '@/lib/statuses'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { BookmarkDetail } from '@/components/BookmarkDetail'
import { BookmarkLinkDialog, BookmarkLinksEditor } from '@/components/BookmarkLinks'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PendingFilesSection } from '@/components/PendingFiles'
import { RecordActionBar } from '@/components/RecordActionBar'
import { PosterUploader } from '@/components/PosterUploader'
import { BookmarkCategoryDialog } from '@/components/BookmarkCategoryDialog'
import { TagSelect } from '@/components/TagSelect'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { useFilterDraft } from '@/lib/filters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { favoriteAction, MENU_ICONS, RecordContextMenu, statusActions, type MenuAction } from '@/components/ui/record-menu'
import { Input } from '@/components/ui/input'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormGrid, FormSection } from '@/components/ui/form-layout'
import { QuickFill } from '@/components/ui/quick-fill'
import { Textarea } from '@/components/ui/textarea'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModalShell } from '@/components/ui/modal-shell'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { VisitCount } from '@/components/RecordVisits'
import { cn } from '@/lib/utils'
import { StatusBadge, StatusLabel } from '@/components/StatusBadge'

/* ============================================================
   ბუკმარკების მოდული (`bookmark`, Tasks §18 — `DECISIONS.md` §10).

   ⚠️ სექციები საიდბარშია (`?view=`) და პანელში მხოლოდ კატეგორია/ტეგია —
   Tasks 3-ის წესი, იგივე რაც ჩანაწერებზე.

   ⚠️ Tasks §36.1 — **სათაურსა და ფოტოზე დაჭერა ფანჯარას ხსნის და არა ბმულს**
   (`BookmarkDetail`); გარე ბმული რიგის „ბმული" ღილაკით (§29-ის ზოლი) და
   ფანჯრის შიგნით იხსნება — ორივე იმავე „გახსნის" მთვლელს ზრდის.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'domain', 'visited', 'visits'] as const

/** პანელის ფილტრები — „ცარიელი" და მისი ტიპი ერთ ადგილას (`lib/filters.ts`) */
const EMPTY_FILTERS = { categories: [] as string[], tags: [] as string[] }
type PanelFilters = typeof EMPTY_FILTERS

export function BookmarksPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §6.4 — სექციები, ბეჯი და ფორმა ერთსა და იმავე ლექსიკონს კითხულობს
  const { data: statuses = [] } = useStatuses('bookmark')
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const search = params.toString()
  const view = params.get('view') ?? 'all'

  // მოქმედი ფილტრი მისამართშია (2.2-ის მოდელი): საიდბარი და პანელი ერთსა და იმავეს ხედავს
  const categories = useMemo(
    () => new URLSearchParams(search).get('category')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const tags = useMemo(
    () => new URLSearchParams(search).get('tag')?.split(',').filter(Boolean) ?? [],
    [search],
  )

  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<Bookmark | 'new' | null>(null)
  /* Tasks §36.1 — დეტალის ფანჯარა id-ით: ჩანაწერი სიიდან იკითხება, ფილტრს მიღმა
     მდგომი კი (`?open=<id>`) — ცალკე (`['bookmark', id]`) */
  const [detail, setDetail] = useState<{ id: number; focus?: 'gallery'; seed?: Bookmark } | null>(null)
  // Tasks §36.5 — „ბმულის დამატება" მარჯვენა კლიკიდან, ფორმის გარეშე
  const [linkFor, setLinkFor] = useState<Bookmark | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  // §6.4 — „ყველა"/„რჩეული" სტატუსები არაა; დანარჩენი ლექსიკონის გასაღებია
  const isStatusView = view !== 'all' && view !== 'favorite'

  const filters: BookmarkFilters = {
    q: term || undefined,
    category_id: categories.length ? categories.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    status: isStatusView ? view : undefined,
    favorite: view === 'favorite' ? true : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['bookmarks', filters, limit],
    queryFn: () => fetchBookmarks({ ...filters, per_page: limit }),
    // „მეტის ჩვენებაზე" ბადე არ უნდა დაიცალოს და თავიდან აეწყოს
    placeholderData: keepPreviousData,
  })
  const categoriesQ = useQuery({ queryKey: ['bookmark-categories'], queryFn: fetchBookmarkCategories })
  const bookmarks = useMemo(() => query.data?.items ?? [], [query.data])
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.data?.total ?? 0
  const allCategories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data])

  // საიდბარის „დამატება" → `?new=1`
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      navigate({ pathname: '/bookmarks', search: '' }, { replace: true })
    }
  }, [params, navigate])

  /* Tasks §36.1 — ღრმა ბმული `?open=<id>` (ვიდეოს §19.6-ის პატერნი). ⚠️ პარამეტრი
     მაშინვე იშლება, თორემ ფანჯრის დახურვა და „უკან" მას ხელახლა გახსნიდა. */
  useEffect(() => {
    const open = Number(params.get('open'))
    if (!open) return

    const next = new URLSearchParams(params)
    next.delete('open')
    setParams(next, { replace: true })
    setDetail({ id: open })
  }, [params, setParams])

  const listed = detail ? bookmarks.find((b) => b.id === detail.id) : undefined
  const detailQ = useQuery({
    queryKey: bookmarkKey(detail?.id ?? 0),
    queryFn: () => fetchBookmark(detail!.id),
    // სიაში მყოფს ცალკე მოთხოვნა არ სჭირდება — ფანჯარა სიის ახალ ობიექტს ხედავს
    enabled: detail != null && !listed,
  })
  /* ⚠️ `seed` — გახსნისას ნანახი ობიექტი: სექციიდან გასული ჩანაწერი (მაგ. „რჩეულში"
     რჩეულის მოხსნა) ფანჯარას ცალკე წაკითხვამდე არ უნდა აქრობდეს და თავიდან ხატავდეს */
  const shown = detail ? (listed ?? detailQ.data ?? detail.seed ?? null) : null

  // ⚠️ სხვისი ან წაშლილი ბუკმარკი 404-ია — ფანჯარა ცარიელი არ უნდა დარჩეს
  useEffect(() => {
    if (!detailQ.error) return
    toast({ title: errorMessage(detailQ.error), variant: 'error' })
    setDetail(null)
  }, [detailQ.error, toast])

  const openDetail = (bookmark: Bookmark, focus?: 'gallery') => setDetail({ id: bookmark.id, focus, seed: bookmark })

  // ⚠️ სიაც და ცალკე წაკითხული ჩანაწერიც (`lib/bookmarks.ts`)
  const invalidate = useBookmarkRefresh()

  const favorite = useMutation({
    mutationFn: toggleBookmarkFavorite,
    onSuccess: invalidate,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: BookmarkStatus }) => setBookmarkStatus(id, next),
    onSuccess: invalidate,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
  /* Tasks §24.3 — ⚠️ „ნანახის" მთვლელის ჩავარდნა აქამდე **ჩუმად** იკარგებოდა:
     ბმული იხსნებოდა, რიცხვი კი არ იზრდებოდა და მიზეზი არსად ჩანდა. */
  const visited = useMutation({
    mutationFn: markBookmarkVisited,
    onSuccess: invalidate,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
  const remove = useMutation({
    mutationFn: deleteBookmark,
    onSuccess: (_, id) => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['bookmark-categories'] })
      // წაშლილის ფანჯარა იხურება — ურნაში გადასული ჩანაწერი აღარ ჩანს
      setDetail((d) => (d?.id === id ? null : d))
      toast({ title: t('bookmarks.deleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** წაშლა — ერთი დადასტურება რიგის ღილაკისთვისაც და კონტექსტური მენიუსთვისაც */
  const askDelete = async (bookmark: Bookmark) => {
    const ok = await confirm({
      title: t('bookmarks.deleteTitle'),
      description: t('bookmarks.deleteHint', { name: bookmark.title }),
      confirmText: t('actions.delete'),
      variant: 'destructive',
    })
    if (ok) remove.mutate(bookmark.id)
  }

  /** ცნობილი ტეგები — არსებულ ჩანაწერებზე დაგროვილი + უკვე გაფილტრული */
  const knownTags = useMemo(() => {
    const set = new Map<string, string>()
    bookmarks.forEach((b) => b.tags.forEach((tag) => set.set(tag.toLowerCase(), tag)))
    tags.forEach((tag) => set.set(tag.toLowerCase(), tag))
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [bookmarks, tags])

  /* ---------- ფილტრის გაშვება ---------- */

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const writeFilters = (next: PanelFilters) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.categories.length) p.set('category', next.categories.join(','))
    if (next.tags.length) p.set('tag', next.tags.join(','))
    setPanelOpen(false)
    navigate({ pathname: '/bookmarks', search: p.toString() })
  }

  /* მონახაზი, „ცვლილებაა?", გასუფთავება და მრიცხველი — ერთი აღწერა
     `lib/filters.ts`-ში. ⚠️ `clear()` **ორივე მხარეს** ასუფთავებს
     (მონახაზსაც და მისამართსაც) — ადრე მხოლოდ მისამართს წერდა და უკვე
     სუფთა მისამართზე დაჭერილი „გასუფთავება" ჩუმად არაფერს აკეთებდა. */
  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(
    { categories, tags },
    EMPTY_FILTERS,
    writeFilters,
  )

  const toggle = (key: 'categories' | 'tags', value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: on ? [...d[key], value] : d[key].filter((x) => x !== value),
    }))

  const onlyCategory =
    categories.length === 1
      ? allCategories.find((x) => String(x.id) === categories[0])
      : undefined

  const heading =
    view === 'favorite'
      ? t('filter.favorite')
      : statusByKey(statuses, view)
        ? statusName(statusByKey(statuses, view), lang)
        : onlyCategory
          ? dictionaryName(onlyCategory, lang)
          : t('bookmarks.title')

  return (
    <PageContainer>
      <PageHeader
        module="bookmark"
        title={heading}
        subtitle={t('bookmarks.count', { count: total })}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="w-56 pl-9"
                    placeholder={t('bookmarks.searchPlaceholder')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {query.isFetching && term !== '' && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {t('bookmarks.searchHint')}
              </TooltipContent>
            </Tooltip>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`bookmarks.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Link
              to="/dictionaries/bookmark-categories"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Tags className="size-4" />
              {t('bookmarkCategories.manage')}
            </Link>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('bookmarks.add')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {/* ⚠️ §2.4 — ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
              წინადადება ეწერა და არ ჩანდა, ფილტრმა ჩამოჭრა თუ მართლა ცარიელია. */}
          {!query.isLoading && !bookmarks.length && (
            <EmptyState
              title={term ? t('bookmarks.noResults', { q: term }) : t('bookmarks.empty')}
              hint={term || activeCount > 0 ? t('empty.filteredHint') : t('empty.addHint')}
              actions={
                <>
                  {activeCount > 0 && (
                    <Button variant="outline" onClick={clear}>
                      {t('filter.clear')}
                    </Button>
                  )}
                  <Button onClick={() => setEditing('new')}>
                    <Plus className="size-4" />
                    {t('bookmarks.add')}
                  </Button>
                </>
              }
            />
          )}

          <ul className="space-y-2">
            {bookmarks.map((bookmark) => {
              const image = storageUrl(bookmark.image)
              /* Tasks §7 → §36.5 — ერთი სია (`record-menu`): გახსნა (ფანჯარა) · ბმულის გახსნა ·
                 სტატუსი ▸ · რჩეული · ბმულის დამატება · გალერეა · — · რედაქტირება · წაშლა */
              const actions: MenuAction[] = [
                { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => openDetail(bookmark) },
                {
                  key: 'link',
                  label: t('actions.openLink'),
                  icon: MENU_ICONS.link,
                  run: () => {
                    window.open(bookmark.url, '_blank', 'noopener,noreferrer')
                    visited.mutate(bookmark.id)
                  },
                },
                statusActions(t('bookmarks.status'), statuses, bookmark.status, lang, (key) =>
                  status.mutate({ id: bookmark.id, next: key }),
                ),
                favoriteAction(bookmark.is_favorite, () => favorite.mutate(bookmark.id), t),
                { key: 'add-link', label: t('bookmarks.addLink'), icon: Plus, run: () => setLinkFor(bookmark) },
                { key: 'gallery', label: t('bookmarks.galleryTitle'), icon: Images, run: () => openDetail(bookmark, 'gallery') },
                { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(bookmark) },
                { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: () => void askDelete(bookmark) },
              ]
              return (
                <RecordContextMenu key={bookmark.id} actions={actions}>
                <li
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
                >
                  {/* Tasks §36.1 — ფოტო და სათაური **ფანჯარას** ხსნის და არა ბმულს */}
                  <button
                    type="button"
                    onClick={() => openDetail(bookmark)}
                    aria-label={t('actions.open')}
                    className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted"
                    data-testid="bookmark-thumb"
                  >
                    {image ? (
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : bookmark.favicon_url ? (
                      <img src={bookmark.favicon_url} alt="" className="size-6" />
                    ) : (
                      <Globe className="size-5 text-muted-foreground" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openDetail(bookmark)}
                      className="block max-w-full truncate text-left text-sm font-medium hover:text-primary"
                      title={bookmark.title}
                      data-testid="bookmark-title"
                    >
                      {bookmark.title}
                    </button>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
                      {bookmark.domain && <span className="truncate">{bookmark.domain}</span>}
                      {bookmark.category && (
                        <span className="inline-flex items-center gap-1">
                          <ModuleIcon name={bookmark.category.icon} className="size-3" />
                          {dictionaryName(bookmark.category, lang)}
                        </span>
                      )}
                      {bookmark.visit_count > 0 && (
                        <span>{t('bookmarks.visits', { count: bookmark.visit_count })}</span>
                      )}
                      {/* Tasks §36.3 — დამატებითი ბმულების რიცხვი */}
                      {(bookmark.links?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="size-3" />
                          {t('bookmarks.linksCount', { count: bookmark.links.length })}
                        </span>
                      )}
                    </p>
                    {bookmark.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {bookmark.description}
                      </p>
                    )}
                    {bookmark.tags.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {bookmark.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>

                  {/* Tasks §29.1 → §36.2 — ერთი ზოლი ყველა სიაზე: სტატუსი (§16.4 ჩამოსაშლელი) · რჩეული ·
                      ფაილები (ფოტოები — ფანჯარა გალერეაზე) · ბმული (იგივე „გახსნის" მთვლელით) ·
                      რედაქტირება · წაშლა. ⚠️ ბმულის პატარა ღილაკი რჩება — ვინც პირდაპირ გახსნას
                      ეჩვევა, ერთი დაჭერით მიდის. */}
                  <RecordActionBar
                    before={
                      <>
                        {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი (§24.2 — რიგის ზომით) */}
                        <VisibilityBadge value={bookmark.visibility} size="row" />
                        <VisitCount value={bookmark.visits_count} />
                      </>
                    }
                    status={
                      <ActionMenu
                        label={t('bookmarks.statusChange')}
                        trigger={
                          <button type="button" className="cursor-pointer rounded-md">
                            {/* Tasks §16.4 — ერთი სიგანის ჩამოსაშლელი: `StatusBadge` აიქონითა და ფერით, ისარი ბოლოში */}
                            {bookmark.status ? (
                              <StatusBadge
                                status={bookmark.status}
                                size="row"
                                className="min-w-36 justify-between"
                                trailing={<ChevronDown className="size-3.5 shrink-0 opacity-70" />}
                              />
                            ) : (
                              <Badge size="row" className="min-w-36 justify-between bg-secondary">
                                {t('bookmarks.noStatus')}
                                <ChevronDown className="size-3.5 shrink-0 opacity-70" />
                              </Badge>
                            )}
                          </button>
                        }
                      >
                        {/* §6.4 — სია ლექსიკონიდან */}
                        {statuses.map((s) => (
                          <ActionMenuClose key={s.id} asChild>
                            <button
                              type="button"
                              className={actionItemClass()}
                              onClick={() => status.mutate({ id: bookmark.id, next: s.key })}
                            >
                              <Check
                                className={cn('size-3.5', bookmark.status?.id === s.id ? 'opacity-100' : 'opacity-0')}
                              />
                              <StatusLabel status={s} />
                            </button>
                          </ActionMenuClose>
                        ))}
                      </ActionMenu>
                    }
                    favorite={{
                      active: bookmark.is_favorite,
                      pending: favorite.isPending && favorite.variables === bookmark.id,
                      onToggle: () => favorite.mutate(bookmark.id),
                    }}
                    // §36.4 — ჩემი ფოტოები + ვებიდან მოტანილი: ფანჯარა გალერეის სექციაზე იხსნება
                    files={{
                      count: (bookmark.files_count ?? 0) + (bookmark.photos_count ?? 0),
                      onOpen: () => openDetail(bookmark, 'gallery'),
                    }}
                    link={{
                      href: bookmark.url,
                      label: t('actions.link'),
                      icon: ExternalLink,
                      title: bookmark.url,
                      onOpen: () => visited.mutate(bookmark.id),
                    }}
                    onEdit={() => setEditing(bookmark)}
                    onDelete={() => void askDelete(bookmark)}
                  />
                </li>
                </RecordContextMenu>
              )
            })}
          </ul>

          <ShowMore shown={bookmarks.length} total={total} onMore={showMore} loading={query.isFetching} />
        </div>

        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => apply(draft)}
          onClear={clear}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* „ყველა"/სტატუსები აქ განზრახ არ არის (Tasks 3) — ისინი საიდბარის სექციებია */}
          <FilterGroup title={t('filter.types')} count={draft.categories.length}>
            <FilterOptionList>
              {allCategories.map((category) => (
                <FilterOption
                  key={category.id}
                  label={dictionaryName(category, lang)}
                  count={category.bookmarks_count}
                  checked={draft.categories.includes(String(category.id))}
                  onChange={(on) => toggle('categories', String(category.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('filter.tags')} count={draft.tags.length}>
            <FilterOptionList>
              {knownTags.map((tag) => (
                <FilterOption
                  key={tag}
                  label={`#${tag}`}
                  checked={draft.tags.includes(tag)}
                  onChange={(on) => toggle('tags', tag, on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>
        </FilterPanel>
      </div>

      {/* Tasks §36.1 — დეტალის ფანჯარა; რედაქტირება მის თავზე იხსნება (მოდალები ეწყობა) */}
      {detail && shown && (
        <BookmarkDetail
          bookmark={shown}
          focus={detail.focus}
          onClose={() => setDetail(null)}
          onEdit={() => setEditing(shown)}
          onDelete={() => void askDelete(shown)}
        />
      )}

      {linkFor && (
        <BookmarkLinkDialog
          bookmark={bookmarks.find((b) => b.id === linkFor.id) ?? linkFor}
          onClose={() => setLinkFor(null)}
        />
      )}

      {editing && (
        <BookmarkForm
          bookmark={editing === 'new' ? null : editing}
          allTags={knownTags}
          categories={allCategories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['bookmark-categories'] })
            setEditing(null)
          }}
        />
      )}
    </PageContainer>
  )
}

/* ============================================================
   ფორმა — ბმული + მეტამონაცემის ავტომატური შევსება.
   ============================================================ */

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'bookmark-form'

function BookmarkForm({
  bookmark,
  allTags,
  categories,
  onClose,
  onSaved,
}: {
  bookmark: Bookmark | null
  allTags: string[]
  categories: BookmarkCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §6.4 — სექციები, ბეჯი და ფორმა ერთსა და იმავე ლექსიკონს კითხულობს
  const { data: statuses = [] } = useStatuses('bookmark')
  const { toast } = useToast()
  // §6 — რომელი არჩევითი ველი ჩანს ამ ფორმაზე
  const fields = useModuleFields('bookmark')

  const [form, setForm] = useState({
    title: bookmark?.title ?? '',
    url: bookmark?.url ?? '',
    description: bookmark?.description ?? '',
    categoryId: bookmark?.category_id ? String(bookmark.category_id) : '',
    // §6.4 — გასაღები; ცარიელი = ნაგულისხმევი (backend დაადებს)
    status: bookmark?.status?.key ?? '',
    tags: bookmark?.tags ?? [],
  })
  /* ⚠️ Tasks §36.4 — `image` სამიდან ერთია: ატვირთული ფოტოს გზა (`bookmarks/…`),
     გალერეიდან არჩეულის გზა (`gallery/…`) ან გვერდის og:image. დაშორებულად მხოლოდ
     `http(s)` ითვლება — თორემ გალერეის გზა `image_url`-ად გაიგზავნებოდა და `url`-ის
     წესი შენახვას 422-ით ჩააგდებდა. */
  const [imageUrl, setImageUrl] = useState<string | null>(
    bookmark?.image && /^https?:\/\//i.test(bookmark.image) ? bookmark.image : null,
  )
  const [faviconUrl, setFaviconUrl] = useState<string | null>(bookmark?.favicon_url ?? null)
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(storageUrl(bookmark?.image))
  const [removeThumb, setRemoveThumb] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<LinkMetadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [newCategory, setNewCategory] = useState(false)
  const lastFetched = useRef<string>(bookmark?.url ?? '')
  const qc = useQueryClient()
  // §26.5 — დამატებითი ველები ახალ ჩანაწერზე; ჩავარდნისას შექმნილი რჩება
  const extras = useRecordExtras('bookmark', bookmark)
  /* Tasks §36.3 — დამატებითი ბმულები; რიგს სტაბილური გასაღები აქვს (`lib/rowKeys.ts`),
     გაგზავნამდე იჭრება (`unkeyRows`) */
  const [links, setLinks] = useState<Keyed<BookmarkLink>[]>(() => keyRows(bookmark?.links ?? []))
  /* Tasks §36.4 — ფოტოები **შექმნისთანავე** (კურსისა და ადგილის §29.3-ის პატერნი): შენახვამდე
     ბრაუზერშია, შენახვისას ჯერ ბუკმარკი, მერე ფოტოები სათითაოდ. ⚠️ ჩავარდნა ბუკმარკს არ
     აუქმებს — ფანჯარა ღია რჩება, „შენახვა" ხელახლა ცდის. */
  const pending = usePendingUploads<'image'>()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  /**
   * ბმულის ჩასმისთანავე ვცდილობთ სათაურის/აღწერის/ფოტოს წამოღებას.
   * ივსება **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არ ვაბათილებთ.
   */
  const loadMeta = async (url: string) => {
    const clean = url.trim()
    if (!clean || clean === lastFetched.current || !/^https?:\/\//i.test(clean)) return
    lastFetched.current = clean
    setMetaLoading(true)
    try {
      const m = await fetchLinkMetadata(clean)
      setMeta(m)
      setForm((f) => ({
        ...f,
        title: f.title || (m.title ?? ''),
        description: f.description || (m.description ?? ''),
      }))
      if (!imageUrl && m.image_url) setImageUrl(m.image_url)
      if (!faviconUrl && m.favicon_url) setFaviconUrl(m.favicon_url)
    } catch {
      // ჩავარდნა ნორმალურია — გვერდი შეიძლება დახურული იყოს; ხელით შევსება რჩება
    } finally {
      setMetaLoading(false)
    }
  }

  const save = useMutation({
    mutationFn: (input: BookmarkInput) =>
      extras.current ? updateBookmark(extras.current.id, input) : createBookmark(input),
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['bookmarks'] })
        toast({ title: done.message, variant: 'error' })

        return
      }

      if (pending.items.length) {
        const failed = await pending.run(
          (_kind, file) => uploadBookmarkFiles(saved.id, [file]),
          (done, total) => setProgress({ done, total }),
        )
        setProgress(null)
        qc.invalidateQueries({ queryKey: ['bookmark-files', saved.id] })
        qc.invalidateQueries({ queryKey: ['bookmarks'] })
        qc.invalidateQueries({ queryKey: ['storage'] })

        if (failed.length) {
          toast({ title: t('uploads.failed', { names: failed.map((f) => f.file.name).join(', ') }), variant: 'error' })

          return
        }
      }

      toast({ title: t('bookmarks.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })


  /* ⚠️ **დამალულ ველზე წითელი ტექსტი არავის უნახავს** (Tasks §4.1): ბლოკი
     `hidden`-ითაა, ე.ი. შეცდომა DOM-შია და ეკრანზე არა — ღილაკი „შენახვა"
     ვიზუალურად არაფერს აკეთებდა. ამიტომ ასეთი ველი თოსტით სახელდება. */
  const warnHidden = (missing: string[]) => {
    const hidden = hiddenPicks(missing, fields.shows)

    if (hidden.length > 0) {
      toast({
        title: t('validation.hiddenRequired', {
          fields: hidden.map((key) => fields.label(key)).join(', '),
        }),
        variant: 'error',
      })
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    /* ⚠️ სტატუსიც და კატეგორიაც სავალდებულოა — შემოწმება ქსელამდე,
       რათა პასუხი იმავე წამს იყოს; backend-ის 422 მეორე კარიბჭეა. */
    const picked = pickErrors(
      { status: form.status, category_id: form.categoryId },
      t('validation.pickOne'),
    )
    if (Object.keys(picked).length > 0) {
      setErrors(picked)
      warnHidden(Object.keys(picked))

      return
    }

    setErrors({})

    // ⚠️ `TagSelect` უკვე ჭრის და ატყობინებს (§2.6) — ეს გარანტიაა
    const { tags } = dedupeTags(form.tags)

    save.mutate({
      title: form.title,
      url: form.url,
      description: form.description || null,
      category_id: form.categoryId ? Number(form.categoryId) : null,
      status: form.status || undefined,
      tags,
      // Tasks §36.3 — ცარიელმისამართიანი რიგი არ იგზავნება
      links: unkeyRows(links.filter((l) => l.url.trim())),
      image_url: imageUrl,
      favicon_url: faviconUrl,
      thumbnail,
      remove_thumbnail: removeThumb,
    })
  }

  return (
    <ModalShell title={t(bookmark ? 'bookmarks.edit' : 'bookmarks.add')} onClose={onClose} wide>
      {/* Tasks §28.1 — **ორი სვეტი, სქროლის გარეშე**: მარცხნივ ბმული → სათაური → აღწერა,
          მარჯვნივ მთავარი ფოტო (§14-ის `fill` — ზუსტად კატეგორიისა და სტატუსის სიმაღლე)
          და მის გვერდით კატეგორია/სტატუსი, ქვემოთ ტეგები. 5:7 — მარჯვენა სვეტს ფოტოც
          უჭირავს და ველებიც. ⚠️ ვიწროზე (<lg) სვეტები ერთმანეთს ადგება და ფორმა
          ძველებურად, ერთ სვეტად იკითხება; ფოტო `sm`-დან ისევ ველების გვერდითაა. */}
      <form id={FORM_ID} onSubmit={submit} className="mt-4 grid gap-6 lg:grid-cols-12" data-testid="bookmark-form-grid">
        <div className="space-y-6 lg:col-span-5" data-testid="bookmark-form-left">
          {/* §26.2 — ბმულიან მოდულში სწრაფი შევსება თვითონ ბმულის ველია.
              ⚠️ `url` `locked`-ია (§6.5) — ბუკმარკის იდენტობა თვითონ ბმულია;
              ჩაკეტვის მოხსნა ცხადი ქმედებაა (§4), ამიტომ `shows()` აქაც ისმის. */}
          <QuickFill
            show={fields.shows('url')}
            title={fields.label('url')}
            htmlFor="b-url"
            required
            hint={fields.hint('url')}
            icon={<Link2 className="size-3.5 text-primary" />}
          >
            <div className="relative">
              <Input
                id="b-url"
                autoFocus={!bookmark}
                placeholder="https://example.com/article"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                onBlur={(e) => loadMeta(e.target.value)}
              />
              {metaLoading && (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {errors.url && <p className="mt-1 text-xs text-destructive">{errors.url}</p>}
            {meta?.site_name && <p className="mt-1 text-xs text-muted-foreground">{meta.site_name}</p>}
          </QuickFill>

          <FormSection title={t('form.sections.basic')}>
            <FormField {...fields.field('title')} htmlFor="b-title" error={errors.title}>
              <Input
                id="b-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </FormField>

            {/* ⚠️ §26 — საერთო `Textarea` (აქამდე ნედლი `<textarea>` იყო სხვა ჩარჩოთი და ფონით) */}
            <FormField {...fields.field('description')} htmlFor="b-desc">
              <Textarea
                id="b-desc"
                rows={FORM_TEXT_ROWS}
                autoGrow
                placeholder={fields.placeholder('description')}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </FormField>
          </FormSection>
        </div>

        <div className="space-y-4 lg:col-span-7" data-testid="bookmark-form-right">
          {/* §26 → §28.1 — მთავარი ფოტო კლასიფიკაციის გვერდითაა: `fill` ყუთს კატეგორიისა და
              სტატუსის სიმაღლეს აძლევს (§14.1), ტეგები კი ქვემოთ, სრული სიგანით */}
          <FormSection
            title={t('form.sections.classification')}
            media={
              fields.shows('thumbnail') && (
                <>
                  <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
                    {fields.label('thumbnail')}
                  </FieldLabel>
                  <PosterUploader
                    fill
                    variant="wide"
                    preview={thumbPreview ?? imageUrl}
                    hint={t('bookmarks.thumbnailHint')}
                    onSelect={(file) => {
                      setThumbnail(file)
                      setThumbPreview(URL.createObjectURL(file))
                      setRemoveThumb(false)
                    }}
                    onClear={() => {
                      setThumbnail(null)
                      setThumbPreview(null)
                      setRemoveThumb(true)
                    }}
                  />
                </>
              )
            }
          >
            {/* კატეგორია — per-user ლექსიკონიდან, გვერდით „ახალი" */}
            <FormField {...fields.field('category')} htmlFor="b-category" error={errors.category_id}>
              <div className="flex gap-1">
                <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger id="b-category" className={errors.category_id ? 'border-destructive' : undefined}>
                    <SelectValue placeholder={t('validation.choose')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {dictionaryName(category, lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setNewCategory(true)}
                  title={t('bookmarkCategories.add')}
                  aria-label={t('bookmarkCategories.add')}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </FormField>

            {/* §16.3 — პუნქტები აიქონითა და ფერით (`StatusLabel`) */}
            <FormField {...fields.field('status')} htmlFor="b-status" error={errors.status}>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger id="b-status" className={errors.status ? 'border-destructive' : undefined}>
                  <SelectValue placeholder={t('validation.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.key}>
                      <StatusLabel status={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </FormSection>

          <FormGrid>
            <FormField
              {...fields.field('tags')}
              hint={joinHints(fields.hint('tags'), t('videos.tagsDedupeHint'))}
              htmlFor="b-tags"
            >
              <TagSelect
                inputId="b-tags"
                value={form.tags}
                options={allTags}
                onChange={(next) => setForm((f) => ({ ...f, tags: next }))}
              />
            </FormField>
          </FormGrid>
        </div>

        {/* Tasks §36.3 — დამატებითი ბმულები სრული სიგანით (მაღაზია, ფასი, მიმოხილვა…);
            ჩასმისას §15-ის მეტა-მონაცემი წარწერას და favicon-ს ავსებს */}
        <FormSection
          title={t('form.sections.details')}
          className={cn('lg:col-span-12', !fields.shows('links') && 'hidden')}
        >
          <FormField {...fields.field('links')}>
            <BookmarkLinksEditor links={links} onChange={setLinks} errors={errors} />
          </FormField>
        </FormSection>

        {/* §36.4 — ფოტოები ახალ ბუკმარკზე; არსებულს დეტალის ფანჯარაში აქვს */}
        {!bookmark && (
          <div className="lg:col-span-12">
            <PendingFilesSection
              pending={pending}
              title={t('bookmarks.photosTitle')}
              hint={t('uploads.pendingHint')}
              kinds={[{ kind: 'image', label: t('bookmarks.photosTitle'), icon: ImageIcon }]}
            />
          </div>
        )}
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები; ახალ ჩანაწერზე მონახაზი */}
      <CustomFieldsCard
        module="bookmark"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      {progress && (
        <p className="mt-3 text-xs text-muted-foreground">{t('uploads.progress', { done: progress.done, total: progress.total })}</p>
      )}

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />

      {/* სწრაფი „ახალი კატეგორია" — შენახვისთანავე select-ში ირჩევა */}
      {newCategory && (
        <BookmarkCategoryDialog
          category={null}
          onClose={() => setNewCategory(false)}
          onSaved={(saved) => setForm((f) => ({ ...f, categoryId: String(saved.id) }))}
        />
      )}
    </ModalShell>
  )
}
