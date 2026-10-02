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
  Link2,
  Loader2,
  SquarePen,
  Plus,
  Search,
  Tags,
  Trash2,
} from 'lucide-react'
import {
  createBookmark,
  deleteBookmark,
  fetchBookmarkCategories,
  fetchBookmarks,
  fetchLinkMetadata,
  markBookmarkVisited,
  setBookmarkStatus,
  toggleBookmarkFavorite,
  updateBookmark,
  type Bookmark,
  type BookmarkCategory,
  type BookmarkFilters,
  type BookmarkInput,
  type BookmarkStatus,
  type LinkMetadata,
} from '@/api/bookmarks'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { statusByKey, statusName, statusTone, useStatuses } from '@/lib/statuses'
import { STATUS_BADGE } from '@/lib/statusStyles'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModuleIcon } from '@/components/ModuleIcon'
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
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { contextMenuItems, favoriteAction, MENU_ICONS, statusActions } from '@/components/ui/record-menu'
import { Input } from '@/components/ui/input'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
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
import { FavoriteButton } from '@/components/ui/favorite-button'
import { VisitCount } from '@/components/RecordVisits'
import { cn } from '@/lib/utils'

/* ============================================================
   ბუკმარკების მოდული (`bookmark`, Tasks §18 — `DECISIONS.md` §10).

   ⚠️ სექციები საიდბარშია (`?view=`) და პანელში მხოლოდ კატეგორია/ტეგია —
   Tasks 3-ის წესი, იგივე რაც ჩანაწერებზე.
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
  const [params] = useSearchParams()

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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bookmarks'] })

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
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['bookmark-categories'] })
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
              return (
                /* Tasks §24.1 — მარჯვენა კლიკის მენიუ (`MovieCard`-ის ყალიბით): გახსნა ·
                   სტატუსი · რჩეული · რედაქტირება · წაშლა */
                <ContextMenu key={bookmark.id}>
                <ContextMenuTrigger asChild>
                <li
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
                >
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => visited.mutate(bookmark.id)}
                    aria-label={t('bookmarks.open')}
                    className="group relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted"
                  >
                    {image ? (
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : bookmark.favicon_url ? (
                      <img src={bookmark.favicon_url} alt="" className="size-6" />
                    ) : (
                      <Globe className="size-5 text-muted-foreground" />
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <ExternalLink className="size-5 text-white" />
                    </span>
                  </a>

                  <div className="min-w-0 flex-1">
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => visited.mutate(bookmark.id)}
                      className="block truncate text-sm font-medium hover:text-primary"
                      title={bookmark.title}
                    >
                      {bookmark.title}
                    </a>
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

                  {/* Tasks §24.2 — ⚠️ **ერთი სიმაღლე რიგში**: სტატუსი, „საჯარო" და ღილაკები
                      `sm`-ის ზომისაა (აქამდე 32px სელექთი, 20px ნიშანი და 40px ღილაკები
                      ერთმანეთის გვერდით). სტატუსი ახლა **ნიშანია**, რომელიც დაჭერით
                      სტატუსების მენიუს ხსნის — სელექთი ქრება. */}
                  <div className="flex shrink-0 items-center gap-1">
                    <ActionMenu
                      label={t('bookmarks.statusChange')}
                      trigger={
                        <button type="button" className="cursor-pointer rounded-md">
                          <Badge
                            size="row"
                            className={cn(
                              'min-w-28 justify-center',
                              bookmark.status ? STATUS_BADGE[statusTone(bookmark.status)] : 'bg-secondary',
                            )}
                          >
                            {bookmark.status ? statusName(bookmark.status, lang) : t('bookmarks.noStatus')}
                            <ChevronDown className="size-3.5 opacity-70" />
                          </Badge>
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
                            {statusName(s, lang)}
                          </button>
                        </ActionMenuClose>
                      ))}
                    </ActionMenu>

                    {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი (§24.2 — რიგის ზომით) */}
                    <VisibilityBadge value={bookmark.visibility} size="row" />

                    {/* Tasks §8 — რჩეული ტექსტით და ფერით, ერთი ზომით */}
                    <VisitCount value={bookmark.visits_count} />
                    <FavoriteButton
                      active={bookmark.is_favorite}
                      pending={favorite.isPending && favorite.variables === bookmark.id}
                      onToggle={() => favorite.mutate(bookmark.id)}
                    />
                    <Button variant="edit" size="sm" onClick={() => setEditing(bookmark)}>
                      <SquarePen className="size-3.5" />
                      {t('actions.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      aria-label={t('actions.delete')}
                      onClick={() => askDelete(bookmark)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
                </ContextMenuTrigger>

                {/* Tasks §7 — ერთი სია (`record-menu`): ბმულის გახსნა · სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა */}
                <ContextMenuContent>
                  {contextMenuItems([
                    {
                      key: 'open',
                      label: t('bookmarks.open'),
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
                    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(bookmark) },
                    { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: () => askDelete(bookmark) },
                  ])}
                </ContextMenuContent>
                </ContextMenu>
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
  const [imageUrl, setImageUrl] = useState<string | null>(
    bookmark?.image && !bookmark.image.startsWith('bookmarks/') ? bookmark.image : null,
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
      image_url: imageUrl,
      favicon_url: faviconUrl,
      thumbnail,
      remove_thumbnail: removeThumb,
    })
  }

  return (
    <ModalShell title={t(bookmark ? 'bookmarks.edit' : 'bookmarks.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
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

        {/* §26 — მთავარი ფოტო ზემოთაა, ძირითად ველებთან ერთად */}
        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('thumbnail') && (
              <>
                <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
                  {fields.label('thumbnail')}
                </FieldLabel>
                <PosterUploader
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

        <FormSection title={t('form.sections.classification')}>
          {/* კატეგორია — per-user ლექსიკონიდან, გვერდით „ახალი" */}
          <FormField size="half" {...fields.field('category')} htmlFor="b-category" error={errors.category_id}>
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

          <FormField size="half" {...fields.field('status')} htmlFor="b-status" error={errors.status}>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger id="b-status" className={errors.status ? 'border-destructive' : undefined}>
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.key}>
                    {statusName(s, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

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
        </FormSection>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები; ახალ ჩანაწერზე მონახაზი */}
      <CustomFieldsCard
        module="bookmark"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

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
