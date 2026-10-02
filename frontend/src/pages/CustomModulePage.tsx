import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ExternalLink,
  Link2,
  ListVideo,
  Loader2,
  Play,
  Plus,
  Search,
  SquarePen,
  Tags,
  Trash2,
} from 'lucide-react'
import type { ModuleInfo } from '@/api/account'
import type { LinkMetadata } from '@/api/bookmarks'
import {
  createCustomRecord,
  customCategoriesKey,
  deleteCustomRecord,
  fetchCustomCategories,
  fetchCustomLinkMetadata,
  fetchCustomRecord,
  fetchCustomRecords,
  setCustomRecordStatus,
  toggleCustomRecordFavorite,
  updateCustomRecord,
  type CustomCategory,
  type CustomRecord,
  type CustomRecordFilters,
  type CustomRecordInput,
} from '@/api/customRecords'
import type { StatusDomainKey } from '@/api/statuses'
import { storageUrl } from '@/lib/api'
import { customRecordItem, isPlayableRecord, usePlayer } from '@/lib/player'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { useModuleFields } from '@/lib/fields'
import { useFilterDraft } from '@/lib/filters'
import { useModules } from '@/lib/modules'
import { useListLimit } from '@/lib/paged'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { useContentLang } from '@/lib/settings'
import { statusByKey, statusName, statusTone, useStatuses } from '@/lib/statuses'
import { STATUS_BADGE } from '@/lib/statusStyles'
import { dedupeTags } from '@/lib/tags'
import { CustomCategoryDialog } from '@/components/CustomCategoryDialog'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { CustomRecordDetail } from '@/components/CustomRecordDetail'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PosterUploader } from '@/components/PosterUploader'
import { TagSelect } from '@/components/TagSelect'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { contextMenuItems, favoriteAction, MENU_ICONS, statusActions } from '@/components/ui/record-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { QuickFill } from '@/components/ui/quick-fill'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShowMore } from '@/components/ui/show-more'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { cn } from '@/lib/utils'

/* ============================================================
   **ინტერფეისიდან შექმნილი მოდულის გვერდი (Tasks §37.3).**

   ერთი გვერდი ყველა პირად მოდულზე — `/c/:key`. სია, ფილტრი, ფორმა და
   დეტალი **აღწერიდან** იხატება: სტატუსები მოდულის ლექსიკონიდან,
   კლასიფიკაცია (ჟანრი · ტიპი · კატეგორია) მისი კლასიფიკატორიდან, ველები
   ველების კონსტრუქტორიდან (ჩაშენებულიც და დამატებითიც).

   ⚠️ **ბუკმარკის გვერდის ყალიბი** (სიის რიგი, კონტექსტური მენიუ, ფილტრის
   პანელი, ფორმა): სექციები საიდბარშია (`?view=` — სტატუსი/რჩეული), პანელში
   მხოლოდ კლასიფიკაცია და ტეგია (Tasks 3-ის წესი).

   ⚠️ **სავალდებულოა, რაც არსებობს**: სტატუსი — თუ ლექსიკონი ცარიელი არაა,
   კლასიფიკაცია — თუ მოდულს აქვს და კლასიფიკატორში რამე წერია (backend-ის
   იგივე წესი, `CustomRecordController::validated()`). ცარიელი ლექსიკონით
   შექმნილ მოდულზე სავალდებულო ველი ვერასდროს შეივსებოდა.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'updated', 'title', 'finished'] as const

/** პანელის ფილტრები — „ცარიელი" და მისი ტიპი ერთ ადგილას (`lib/filters.ts`) */
const EMPTY_FILTERS = { categories: [] as string[], tags: [] as string[] }
type PanelFilters = typeof EMPTY_FILTERS

export function CustomModulePage() {
  const { key = '' } = useParams()
  const { t } = useTranslation()
  const { customModules, all, loading } = useModules()

  const module = customModules.find((m) => m.key === key)

  if (loading) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </PageContainer>
    )
  }

  if (!module) {
    // ⚠️ ადმინმა გამორთო — მონაცემები ხელუხლებელია, მიზეზი ცხადად ჩანს (37.8)
    const known = all.find((m) => m.key === key)

    return (
      <PageContainer>
        <EmptyState
          title={t(known?.disabled_by_admin ? 'customModules.disabledByAdminTitle' : 'modules.notFound')}
          hint={known?.disabled_by_admin ? t('customModules.disabledByAdminHint') : undefined}
          actions={
            <Link to="/modules" className={buttonVariants({ variant: 'outline' })}>
              {t('modules.title')}
            </Link>
          }
        />
      </PageContainer>
    )
  }

  // ⚠️ `key` აიძულებს ნულიდან აწყობას — მოდულის შეცვლაზე ფილტრი/ფორმა ძველზე არ დარჩეს
  return <CustomRecords key={module.key} module={module} />
}

function CustomRecords({ module }: { module: ModuleInfo }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const moduleKey = module.key as StatusDomainKey
  const classifies = !!module.definition?.classification
  const { data: statuses = [] } = useStatuses(moduleKey)
  const fields = useModuleFields(module.key)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const search = params.toString()
  const view = params.get('view') ?? 'all'
  const base = module.route_base

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
  const [editing, setEditing] = useState<CustomRecord | 'new' | null>(null)
  const [viewing, setViewing] = useState<CustomRecord | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const isStatusView = view !== 'all' && view !== 'favorite'

  const filters: CustomRecordFilters = {
    q: term || undefined,
    category_id: categories.length ? categories.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    status: isStatusView ? view : undefined,
    favorite: view === 'favorite' ? true : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['custom-records', module.key, filters, limit],
    queryFn: () => fetchCustomRecords(module.key, { ...filters, per_page: limit }),
    placeholderData: keepPreviousData,
  })
  const categoriesQ = useQuery({
    queryKey: customCategoriesKey(module.key),
    queryFn: () => fetchCustomCategories(module.key),
    enabled: classifies,
  })
  const records = useMemo(() => query.data?.items ?? [], [query.data])
  const total = query.data?.total ?? 0
  const allCategories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data])

  /* საიდბარის „დამატება" → `?new=1`; ძებნის შედეგი → `?open=<id>`. ⚠️ ჩანაწერი
     **id-ით** იკითხება — ის შეიძლება მიმდინარე ფილტრის გარეთ იყოს (FEAT-17-ის
     წესი), პარამეტრი კი მაშინვე იშლება, რომ „უკან" მას თავიდან არ ხსნიდეს. */
  useEffect(() => {
    const open = params.get('open')

    if (params.get('new')) {
      setEditing('new')
      navigate({ pathname: base, search: '' }, { replace: true })
    } else if (open && /^\d+$/.test(open)) {
      navigate({ pathname: base, search: '' }, { replace: true })
      fetchCustomRecord(module.key, Number(open))
        .then(setViewing)
        .catch((e) => toast({ title: errorMessage(e), variant: 'error' }))
    }
  }, [params, navigate, base, module.key, toast])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['custom-records', module.key] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const moduleTitle = (lang === 'ka' ? module.name_ka : module.name_en) || module.name_en || module.name_ka

  /* **§37.5 — ბმულიდან დაკვრა გლობალურ ფლეერში.** ⚠️ რიგი **მთელი გაფილტრული
     სიაა** და არა ჩატვირთული გვერდი (ვიდეოების წესი, §7.2) — მოთხოვნა მხოლოდ
     ცხად დაჭერაზეა; დასაკრავად ამოცნობილი ბმულის გარეშე ჩანაწერი რიგში არ ჯდება.
     წყარო თუ არ მოვიდა, ჩატვირთულს ვუკრავთ. */
  const player = usePlayer()
  const hasPlayable = records.some(isPlayableRecord)

  const playFrom = async (recordId?: number) => {
    let list = records

    try {
      const full = await qc.fetchQuery({
        queryKey: ['custom-records', module.key, filters, 'queue'],
        queryFn: () => fetchCustomRecords(module.key, { ...filters, all: true }),
      })
      list = full.items
    } catch {
      // ჩატვირთული სია რჩება
    }

    const playable = list.filter(isPlayableRecord)
    const index = recordId === undefined ? 0 : Math.max(0, playable.findIndex((r) => r.id === recordId))

    if (playable.length) player.play(playable.map(customRecordItem), index, moduleTitle)
  }

  const favorite = useMutation({
    mutationFn: (id: number) => toggleCustomRecordFavorite(module.key, id),
    onSuccess: invalidate,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) => setCustomRecordStatus(module.key, id, next),
    onSuccess: invalidate,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteCustomRecord(module.key, id),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: customCategoriesKey(module.key) })
      qc.invalidateQueries({ queryKey: ['trash'] })
      toast({ title: t('customModules.recordDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** წაშლა — ერთი დადასტურება რიგის ღილაკისთვისაც და კონტექსტური მენიუსთვისაც */
  const askDelete = async (record: CustomRecord) => {
    const ok = await confirm({
      title: t('customModules.recordDeleteTitle'),
      description: t('customModules.recordDeleteHint', { name: record.title }),
      confirmText: t('actions.delete'),
      variant: 'destructive',
    })
    if (ok) remove.mutate(record.id)
  }

  const knownTags = useMemo(() => {
    const set = new Map<string, string>()
    records.forEach((r) => r.tags.forEach((tag) => set.set(tag.toLowerCase(), tag)))
    tags.forEach((tag) => set.set(tag.toLowerCase(), tag))
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [records, tags])

  const writeFilters = (next: PanelFilters) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.categories.length) p.set('category', next.categories.join(','))
    if (next.tags.length) p.set('tag', next.tags.join(','))
    setPanelOpen(false)
    navigate({ pathname: base, search: p.toString() })
  }

  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(
    { categories, tags },
    EMPTY_FILTERS,
    writeFilters,
  )

  const toggle = (which: 'categories' | 'tags', value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [which]: on ? [...d[which], value] : d[which].filter((x) => x !== value),
    }))

  const onlyCategory =
    categories.length === 1 ? allCategories.find((x) => String(x.id) === categories[0]) : undefined

  const heading =
    view === 'favorite'
      ? t('filter.favorite')
      : statusByKey(statuses, view)
        ? statusName(statusByKey(statuses, view), lang)
        : onlyCategory
          ? dictionaryName(onlyCategory, lang)
          : moduleTitle

  const noun = fields.label('category')

  return (
    <PageContainer>
      <PageHeader
        module={module.key}
        title={heading}
        subtitle={t('customModules.count', { count: total })}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-56 pl-9"
                placeholder={t('customModules.searchPlaceholder')}
                aria-label={t('customModules.searchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {query.isFetching && term !== '' && (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-44" aria-label={t('customModules.sortLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`customModules.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            {/* §37.5 — მთელი (გაფილტრული) სიის დასაკრავი ბმულები რიგში */}
            {hasPlayable && (
              <Button variant="outline" onClick={() => playFrom()}>
                <ListVideo className="size-4" />
                {t('playback.playAll')}
              </Button>
            )}
            {classifies && (
              <Link
                to={`/dictionaries/${module.key}-categories`}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Tags className="size-4" />
                {t('customModules.manageClassifier', { noun })}
              </Link>
            )}
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('actions.addShort')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {!query.isLoading && !records.length && (
            <EmptyState
              title={term ? t('customModules.noResults', { q: term }) : t('customModules.empty')}
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
                    {t('actions.addShort')}
                  </Button>
                </>
              }
            />
          )}

          <ul className="space-y-2">
            {records.map((record) => {
              const image = storageUrl(record.image)

              return (
                <ContextMenu key={record.id}>
                  <ContextMenuTrigger asChild>
                    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setViewing(record)}
                        aria-label={t('customModules.open')}
                        className="grid h-12 w-12 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md bg-muted"
                      >
                        {image ? (
                          <img src={image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ModuleIcon name={module.icon} className="size-5 text-muted-foreground" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setViewing(record)}
                          className="block max-w-full cursor-pointer truncate text-left text-sm font-medium hover:text-primary"
                          title={record.title}
                        >
                          {record.title}
                        </button>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
                          {record.category && (
                            <span className="inline-flex items-center gap-1">
                              <ModuleIcon name={record.category.icon} className="size-3" />
                              {dictionaryName(record.category, lang)}
                            </span>
                          )}
                          {record.domain && <span className="truncate">{record.domain}</span>}
                        </p>
                        {record.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{record.description}</p>
                        )}
                        {record.tags.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {record.tags.map((tag) => (
                              <span key={tag} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px]">
                                #{tag}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {isPlayableRecord(record) && (
                          <button
                            type="button"
                            onClick={() => playFrom(record.id)}
                            aria-label={t('playback.play')}
                            title={t('playback.play')}
                            className="grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground hover:text-primary"
                          >
                            <Play className="size-4" />
                          </button>
                        )}
                        {record.url && (
                          <a
                            href={record.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('customModules.openLink')}
                            title={t('customModules.openLink')}
                            className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        )}

                        {statuses.length > 0 && (
                          <ActionMenu
                            label={t('customModules.statusChange')}
                            trigger={
                              <button type="button" className="cursor-pointer rounded-md">
                                <Badge
                                  size="row"
                                  className={cn(
                                    'min-w-28 justify-center',
                                    record.status ? STATUS_BADGE[statusTone(record.status)] : 'bg-secondary',
                                  )}
                                >
                                  {record.status ? statusName(record.status, lang) : t('customModules.noStatus')}
                                  <ChevronDown className="size-3.5 opacity-70" />
                                </Badge>
                              </button>
                            }
                          >
                            {statuses.map((s) => (
                              <ActionMenuClose key={s.id} asChild>
                                <button
                                  type="button"
                                  className={actionItemClass()}
                                  onClick={() => status.mutate({ id: record.id, next: s.key })}
                                >
                                  <Check className={cn('size-3.5', record.status?.id === s.id ? 'opacity-100' : 'opacity-0')} />
                                  {statusName(s, lang)}
                                </button>
                              </ActionMenuClose>
                            ))}
                          </ActionMenu>
                        )}

                        <VisibilityBadge value={record.visibility} size="row" />

                        {/* Tasks §8 — რჩეული ტექსტით და ფერით, ერთი ზომით */}
                        <FavoriteButton
                          active={record.is_favorite}
                          pending={favorite.isPending && favorite.variables === record.id}
                          onToggle={() => favorite.mutate(record.id)}
                        />
                        <Button variant="edit" size="sm" onClick={() => setEditing(record)}>
                          <SquarePen className="size-3.5" />
                          {t('actions.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          aria-label={t('actions.delete')}
                          onClick={() => askDelete(record)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  </ContextMenuTrigger>

                  {/* Tasks §7 — ერთი სია (`record-menu`): გახსნა · დაკვრა · ბმული · სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა */}
                  <ContextMenuContent>
                    {contextMenuItems([
                      { key: 'open', label: t('customModules.open'), icon: MENU_ICONS.open, run: () => setViewing(record) },
                      ...(isPlayableRecord(record)
                        ? [{ key: 'play', label: t('playback.play'), icon: MENU_ICONS.play, run: () => playFrom(record.id) }]
                        : []),
                      ...(record.url
                        ? [{ key: 'link', label: t('customModules.openLink'), icon: MENU_ICONS.link, run: () => window.open(record.url ?? '', '_blank', 'noopener,noreferrer') }]
                        : []),
                      ...(statuses.length > 0
                        ? [statusActions(t('customModules.status'), statuses, record.status, lang, (key) => status.mutate({ id: record.id, next: key }))]
                        : []),
                      favoriteAction(record.is_favorite, () => favorite.mutate(record.id), t),
                      { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(record) },
                      { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: () => askDelete(record) },
                    ])}
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </ul>

          <ShowMore shown={records.length} total={total} onMore={showMore} loading={query.isFetching} />
        </div>

        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => apply(draft)}
          onClear={clear}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {classifies && (
            <FilterGroup title={noun} count={draft.categories.length}>
              <FilterOptionList>
                {allCategories.map((category) => (
                  <FilterOption
                    key={category.id}
                    label={dictionaryName(category, lang)}
                    count={category.records_count}
                    checked={draft.categories.includes(String(category.id))}
                    onChange={(on) => toggle('categories', String(category.id), on)}
                  />
                ))}
              </FilterOptionList>
            </FilterGroup>
          )}

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

      {viewing && (
        <CustomRecordDetail
          module={module}
          record={viewing}
          onClose={() => setViewing(null)}
          // §37.5 — ფანჯარა იკეტება: მოდალის ქვეშ ჩართული ვიდეო არ ჩანდა (VideoDetail-ის წესი, §35.6)
          onPlay={
            isPlayableRecord(viewing)
              ? () => {
                  playFrom(viewing.id)
                  setViewing(null)
                }
              : undefined
          }
          onEdit={() => {
            setEditing(viewing)
            setViewing(null)
          }}
        />
      )}

      {editing && (
        <CustomRecordForm
          module={module}
          record={editing === 'new' ? null : editing}
          allTags={knownTags}
          categories={allCategories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: customCategoriesKey(module.key) })
            setEditing(null)
          }}
        />
      )}
    </PageContainer>
  )
}

/* ============================================================
   ფორმა — სათაური, ბმული (გვერდის მეტამონაცემით), მთავარი ფოტო, აღწერა,
   სტატუსი, კლასიფიკაცია, ტეგები და დამატებითი ველები.
   ============================================================ */

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'custom-record-form'

function CustomRecordForm({
  module,
  record,
  allTags,
  categories,
  onClose,
  onSaved,
}: {
  module: ModuleInfo
  record: CustomRecord | null
  allTags: string[]
  categories: CustomCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const moduleKey = module.key as StatusDomainKey
  const classifies = !!module.definition?.classification
  const { data: statuses = [] } = useStatuses(moduleKey)
  const { toast } = useToast()
  const qc = useQueryClient()
  const fields = useModuleFields(module.key)

  const [form, setForm] = useState({
    title: record?.title ?? '',
    url: record?.url ?? '',
    description: record?.description ?? '',
    categoryId: record?.category_id ? String(record.category_id) : '',
    status: record?.status?.key ?? '',
    tags: record?.tags ?? [],
  })
  const [imageUrl, setImageUrl] = useState<string | null>(record?.image_url ?? null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(storageUrl(record?.photo_path ?? null))
  const [removePhoto, setRemovePhoto] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<LinkMetadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [newCategory, setNewCategory] = useState(false)
  const lastFetched = useRef<string>(record?.url ?? '')
  // §26.5 — დამატებითი ველები ახალ ჩანაწერზე; ჩავარდნისას შექმნილი რჩება
  const extras = useRecordExtras(module.key, record)

  /**
   * ბმულის ჩასმისთანავე — სათაური/აღწერა/ფოტო გვერდიდან. ივსება **მხოლოდ
   * ცარიელი ველები** — ხელით შეყვანილს არ ვაბათილებთ (ბუკმარკის წესი).
   */
  const loadMeta = async (url: string) => {
    const clean = url.trim()
    if (!clean || clean === lastFetched.current || !/^https?:\/\//i.test(clean)) return
    lastFetched.current = clean
    setMetaLoading(true)
    try {
      const m = await fetchCustomLinkMetadata(module.key, clean)
      setMeta(m)
      setForm((f) => ({
        ...f,
        title: f.title || (m.title ?? ''),
        description: f.description || (m.description ?? ''),
      }))
      if (!imageUrl && m.image_url) setImageUrl(m.image_url)
    } catch {
      // ჩავარდნა ნორმალურია — გვერდი შეიძლება დახურული იყოს; ხელით შევსება რჩება
    } finally {
      setMetaLoading(false)
    }
  }

  const save = useMutation({
    mutationFn: (input: CustomRecordInput) =>
      extras.current ? updateCustomRecord(module.key, extras.current.id, input) : createCustomRecord(module.key, input),
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['custom-records', module.key] })
        toast({ title: done.message, variant: 'error' })

        return
      }

      toast({ title: t('customModules.recordSaved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  /* ⚠️ დამალულ ველზე წითელი ტექსტი არავის უნახავს (Tasks §4.1) — ასეთი ველი თოსტით სახელდება */
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

  const mustStatus = statuses.length > 0
  const mustCategory = classifies && categories.length > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    /* ⚠️ სავალდებულოა **მხოლოდ ის, რაც არსებობს** — backend-ის იგივე წესი.
       შემოწმება ქსელამდე, რომ პასუხი იმავე წამს იყოს; 422 მეორე კარიბჭეა. */
    const picked = pickErrors(
      {
        ...(mustStatus ? { status: form.status } : {}),
        ...(mustCategory ? { category_id: form.categoryId } : {}),
      },
      t('validation.pickOne'),
    )
    if (!form.title.trim() && !form.url.trim()) picked.title = t('customModules.titleOrLink')

    if (Object.keys(picked).length > 0) {
      setErrors(picked)
      warnHidden(Object.keys(picked).filter((k) => k !== 'title'))

      return
    }

    setErrors({})
    const { tags } = dedupeTags(form.tags)

    save.mutate({
      title: form.title,
      url: form.url || null,
      description: form.description || null,
      ...(classifies ? { category_id: form.categoryId ? Number(form.categoryId) : null } : {}),
      status: form.status || undefined,
      tags,
      image_url: imageUrl,
      photo,
      remove_photo: removePhoto,
    })
  }

  const noun = fields.label('category')

  return (
    <ModalShell title={t(record ? 'customModules.recordEdit' : 'customModules.recordAdd')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        <QuickFill
          show={fields.shows('url')}
          title={fields.label('url')}
          htmlFor="cr-url"
          required={fields.required('url')}
          hint={joinHints(fields.hint('url'), t('customModules.urlHint'))}
          icon={<Link2 className="size-3.5 text-primary" />}
        >
          <div className="relative">
            <Input
              id="cr-url"
              placeholder="https://"
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

        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('photo') && (
              <>
                <FieldLabel required={fields.required('photo')} hint={fields.hint('photo')}>
                  {fields.label('photo')}
                </FieldLabel>
                <PosterUploader
                  variant="wide"
                  preview={photoPreview ?? imageUrl}
                  onSelect={(file) => {
                    setPhoto(file)
                    setPhotoPreview(URL.createObjectURL(file))
                    setRemovePhoto(false)
                  }}
                  onClear={() => {
                    setPhoto(null)
                    setPhotoPreview(null)
                    setImageUrl(null)
                    setRemovePhoto(true)
                  }}
                />
              </>
            )
          }
        >
          <FormField {...fields.field('title')} required htmlFor="cr-title" error={errors.title}>
            <Input
              id="cr-title"
              autoFocus={!record}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('description')} htmlFor="cr-desc">
            <Textarea
              id="cr-desc"
              rows={FORM_TEXT_ROWS}
              autoGrow
              placeholder={fields.placeholder('description')}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
        </FormSection>

        <FormSection title={t('form.sections.classification')}>
          {classifies && (
            <FormField
              size="half"
              {...fields.field('category')}
              required={mustCategory}
              htmlFor="cr-category"
              error={errors.category_id}
            >
              <div className="flex gap-1">
                <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger id="cr-category" className={errors.category_id ? 'border-destructive' : undefined}>
                    <SelectValue placeholder={categories.length ? t('validation.choose') : t('customModules.classifierEmpty', { noun })} />
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
                  title={t('customModules.categoryAdd', { noun })}
                  aria-label={t('customModules.categoryAdd', { noun })}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </FormField>
          )}

          {statuses.length > 0 && (
            <FormField size="half" {...fields.field('status')} required={mustStatus} htmlFor="cr-status" error={errors.status}>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger id="cr-status" className={errors.status ? 'border-destructive' : undefined}>
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
          )}

          <FormField
            {...fields.field('tags')}
            hint={joinHints(fields.hint('tags'), t('videos.tagsDedupeHint'))}
            htmlFor="cr-tags"
          >
            <TagSelect
              inputId="cr-tags"
              value={form.tags}
              options={allTags}
              onChange={(next) => setForm((f) => ({ ...f, tags: next }))}
            />
          </FormField>
        </FormSection>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები; ახალ ჩანაწერზე მონახაზი */}
      <CustomFieldsCard module={module.key} recordId={extras.current?.id ?? null} draft={extras.draft} className="mt-6" />

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />

      {newCategory && (
        <CustomCategoryDialog
          moduleKey={module.key}
          noun={noun}
          category={null}
          onClose={() => setNewCategory(false)}
          onSaved={(saved) => setForm((f) => ({ ...f, categoryId: String(saved.id) }))}
        />
      )}
    </ModalShell>
  )
}
