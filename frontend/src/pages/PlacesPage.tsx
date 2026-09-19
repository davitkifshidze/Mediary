import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MapPin,
  Map as MapIcon,
  Paperclip,
  Plus,
  Search,
  SquarePen,
  Star,
  Trash2,
} from 'lucide-react'
import {
  PLACE_STATUSES,
  createPlace,
  deletePlace,
  fetchPlaceCandidates,
  fetchPlaceCategories,
  fetchPlaceCountries,
  fetchPlaces,
  setPlaceStatus,
  togglePlaceFavorite,
  updatePlace,
  type Place,
  type PlaceCandidate,
  type PlaceCategory,
  type PlaceFilters,
  type PlaceInput,
  type PlaceStatus,
} from '@/api/places'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { useFilterDraft } from '@/lib/filters'
import { useListLimit } from '@/lib/paged'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useDateFormat } from '@/lib/dates'
import { useContentLang } from '@/lib/settings'
import { PlaceDetail } from '@/components/PlaceDetail'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { PosterUploader } from '@/components/PosterUploader'
import { TagSelect } from '@/components/TagSelect'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel } from '@/components/ui/field-label'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShowMore } from '@/components/ui/show-more'
import { StepSection } from '@/components/ui/step-section'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   ადგილების მოდული (`place`, FEAT-26).

   ⚠️ **სტატუსი enum-ია** (ორი მნიშვნელობა), ე.ი. საიდბარის სექციები
   წიგნის/თამაშის/კურსის რიგშია: „ყველა · რჩეული · დამატება" (§6.1),
   ხოლო სტატუსით ფილტრი პანელშია.

   ⚠️ **Nominatim-ის ძებნა მხოლოდ ცხადი დაწკაპუნებით ხდება** და არასდროს
   აკრეფისას: წყარო წამში ერთ მოთხოვნას უშვებს (ვებძებნის იგივე წესი —
   ძებნა ღილაკია და არა გვერდითი ეფექტი).
   ============================================================ */

const SORTS = ['newest', 'oldest', 'name', 'rating', 'visited'] as const

interface PanelFilters {
  categories: string[]
  countries: string[]
  tags: string[]
  statuses: string[]
}

const EMPTY_FILTERS: PanelFilters = { categories: [], countries: [], tags: [], statuses: [] }

/** სტატუსის ტონი — მწვანე ნანახს */
const STATUS_TONE: Record<PlaceStatus, string> = {
  to_visit: 'bg-secondary text-muted-foreground',
  visited: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
}

export function PlacesPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { date: formatDate } = useDateFormat()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const view = params.get('view') ?? 'all'
  const search = params.toString()

  const categories = useMemo(
    () => new URLSearchParams(search).get('category')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const countries = useMemo(
    () => new URLSearchParams(search).get('country')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const tags = useMemo(
    () => new URLSearchParams(search).get('tag')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const statuses = useMemo(
    () => new URLSearchParams(search).get('status')?.split(',').filter(Boolean) ?? [],
    [search],
  )

  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<Place | 'new' | null>(null)
  const [detail, setDetail] = useState<Place | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: PlaceFilters = {
    q: term || undefined,
    category_id: categories.length ? categories.join(',') : undefined,
    country: countries.length ? countries.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    status: statuses.length ? statuses.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['places', filters, limit],
    queryFn: () => fetchPlaces({ ...filters, per_page: limit }),
    placeholderData: keepPreviousData,
  })
  const categoriesQ = useQuery({ queryKey: ['place-categories'], queryFn: fetchPlaceCategories })
  const countriesQ = useQuery({ queryKey: ['place-countries'], queryFn: fetchPlaceCountries })

  const places = useMemo(() => query.data?.items ?? [], [query.data])
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.data?.total ?? 0
  const allCategories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data])
  const allCountries = useMemo(() => countriesQ.data ?? [], [countriesQ.data])

  // საიდბარის „დამატება" → `?new=1`
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      navigate({ pathname: '/places', search: '' }, { replace: true })
    }
  }, [params, navigate])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['places'] })
    qc.invalidateQueries({ queryKey: ['place-countries'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: togglePlaceFavorite, onSuccess: invalidate, onError: fail })
  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: PlaceStatus }) => setPlaceStatus(id, next),
    onSuccess: invalidate,
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: deletePlace,
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['place-categories'] })
      toast({ title: t('places.deleted'), variant: 'success' })
    },
    onError: fail,
  })

  const knownTags = useMemo(() => {
    const set = new Map<string, string>()
    places.forEach((p) => p.tags.forEach((tag) => set.set(tag.toLowerCase(), tag)))
    tags.forEach((tag) => set.set(tag.toLowerCase(), tag))
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [places, tags])

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const writeFilters = (next: PanelFilters) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.categories.length) p.set('category', next.categories.join(','))
    if (next.countries.length) p.set('country', next.countries.join(','))
    if (next.tags.length) p.set('tag', next.tags.join(','))
    if (next.statuses.length) p.set('status', next.statuses.join(','))
    setPanelOpen(false)
    navigate({ pathname: '/places', search: p.toString() })
  }

  const applied = useMemo<PanelFilters>(
    () => ({ categories, countries, tags, statuses }),
    [categories, countries, tags, statuses],
  )
  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(
    applied,
    EMPTY_FILTERS,
    writeFilters,
  )

  const toggle = (key: keyof PanelFilters, value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: on ? [...d[key], value] : d[key].filter((x) => x !== value),
    }))

  return (
    <PageContainer>
      <PageHeader
        module="place"
        title={view === 'favorite' ? t('filter.favorite') : t('places.title')}
        subtitle={t('places.count', { count: total })}
        actions={
          <>
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                className="w-full pl-9 sm:w-56"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as (typeof SORTS)[number])}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`places.sort_${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('places.add')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
          ) : places.length === 0 ? (
            <EmptyState
              icon={<MapPin className="size-6" />}
              title={activeCount > 0 || term ? t('places.emptyFiltered') : t('places.empty')}
              hint={activeCount > 0 || term ? t('places.emptyFilteredHint') : t('places.emptyHint')}
              actions={
                activeCount > 0 || term ? (
                  <Button variant="outline" onClick={() => { setQ(''); clear() }}>
                    {t('filter.clear')}
                  </Button>
                ) : (
                  <Button onClick={() => setEditing('new')}>
                    <Plus className="size-4" />
                    {t('places.add')}
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ul className="space-y-3">
                {places.map((place) => (
                  <li
                    key={place.id}
                    className="flex gap-4 rounded-xl border border-border bg-card p-4"
                  >
                    <button
                      type="button"
                      onClick={() => setDetail(place)}
                      className="size-16 shrink-0 overflow-hidden rounded-md bg-muted"
                      aria-label={place.name}
                    >
                      {place.photo ? (
                        <img
                          src={storageUrl(place.photo) ?? place.photo}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center">
                          <MapPin className="size-6 text-muted-foreground" />
                        </span>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDetail(place)}
                          className="min-w-0 truncate text-left font-medium hover:text-primary"
                        >
                          {place.name}
                        </button>
                        <Badge className={STATUS_TONE[place.status]}>
                          {t(`places.statuses.${place.status}`)}
                        </Badge>
                        {place.rating && <Badge className="bg-secondary">★ {place.rating}</Badge>}
                        <VisibilityBadge value={place.visibility} />
                      </div>

                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                          place.city,
                          place.country,
                          place.category ? dictionaryName(place.category, lang) : null,
                          place.visited_at ? formatDate(place.visited_at) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>

                      {place.address && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{place.address}</p>
                      )}

                      {place.tags.length > 0 && (
                        <p className="mt-1.5 truncate text-xs text-muted-foreground">
                          {place.tags.map((tag) => `#${tag}`).join(' ')}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-start gap-1">
                      <Select
                        value={place.status}
                        onValueChange={(v) => status.mutate({ id: place.id, next: v as PlaceStatus })}
                      >
                        <SelectTrigger className="h-9 w-32" aria-label={t('places.status')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLACE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {t(`places.statuses.${s}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* ⚠️ `<a>` და არა `Button asChild` — `ui/button.tsx`-ს
                          `asChild` არ აქვს. რუკა გარე სერვისია (OSM). */}
                      {place.map_url && (
                        <a
                          href={place.map_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t('places.openMap')}
                          className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MapIcon className="size-4" />
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetail(place)}
                        aria-label={t('places.files')}
                      >
                        <Paperclip className="size-4" />
                        <span className="w-3 text-[11px] tabular-nums">
                          {place.files_count || ''}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => favorite.mutate(place.id)}
                        aria-label={t('filter.favorite')}
                      >
                        <Star
                          className={cn('size-4', place.is_favorite && 'fill-current text-[var(--favorite)]')}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(place)}
                        aria-label={t('actions.edit')}
                      >
                        <SquarePen className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: t('places.delete'),
                              description: t('places.deleteHint', { name: place.name }),
                              variant: 'destructive',
                            })
                          ) {
                            remove.mutate(place.id)
                          }
                        }}
                        aria-label={t('actions.delete')}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              <ShowMore
                shown={places.length}
                total={total}
                onMore={showMore}
                loading={query.isFetching}
              />
            </>
          )}
        </div>

        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => apply(draft)}
          onClear={clear}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* ⚠️ სტატუსი **აქ არის და არა საიდბარში** — §6.1-ის წესი */}
          <FilterGroup title={t('places.status')} count={draft.statuses.length}>
            <FilterOptionList>
              {PLACE_STATUSES.map((s) => (
                <FilterOption
                  key={s}
                  label={t(`places.statuses.${s}`)}
                  checked={draft.statuses.includes(s)}
                  onChange={(on) => toggle('statuses', s, on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('places.categories')} count={draft.categories.length}>
            <FilterOptionList>
              {allCategories.map((c) => (
                <FilterOption
                  key={c.id}
                  label={dictionaryName(c, lang)}
                  count={c.places_count}
                  checked={draft.categories.includes(String(c.id))}
                  onChange={(on) => toggle('categories', String(c.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          {allCountries.length > 0 && (
            <FilterGroup title={t('places.country')} count={draft.countries.length}>
              <FilterOptionList>
                {allCountries.map((c) => (
                  <FilterOption
                    key={c.name}
                    label={c.name}
                    count={c.count}
                    checked={draft.countries.includes(c.name)}
                    onChange={(on) => toggle('countries', c.name, on)}
                  />
                ))}
              </FilterOptionList>
            </FilterGroup>
          )}

          {knownTags.length > 0 && (
            <FilterGroup title={t('filter.tags')} count={draft.tags.length}>
              <FilterOptionList>
                {knownTags.map((tag) => (
                  <FilterOption
                    key={tag}
                    label={tag}
                    checked={draft.tags.includes(tag)}
                    onChange={(on) => toggle('tags', tag, on)}
                  />
                ))}
              </FilterOptionList>
            </FilterGroup>
          )}
        </FilterPanel>
      </div>

      {detail && <PlaceDetail place={detail} onClose={() => setDetail(null)} />}

      {editing && (
        <PlaceForm
          place={editing === 'new' ? null : editing}
          allTags={knownTags}
          categories={allCategories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['place-categories'] })
            setEditing(null)
          }}
        />
      )}
    </PageContainer>
  )
}

/* ---------- ფორმა ---------- */

function PlaceForm({
  place,
  allTags,
  categories,
  onClose,
  onSaved,
}: {
  place: Place | null
  allTags: string[]
  categories: PlaceCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  const fields = useModuleFields('place')

  const [form, setForm] = useState({
    name: place?.name ?? '',
    address: place?.address ?? '',
    city: place?.city ?? '',
    country: place?.country ?? '',
    lat: place?.lat != null ? String(place.lat) : '',
    lng: place?.lng != null ? String(place.lng) : '',
    osmId: place?.osm_id ?? '',
    osmType: place?.osm_type ?? '',
    description: place?.description ?? '',
    // ⚠️ ცარიელი სტრიქონი და არა პირველი კატეგორია: ჩუმად წინასწარშევსებული
    // პასუხი არჩევანი არაა (2026-09-16-ის წესი)
    categoryId: place?.category_id ? String(place.category_id) : '',
    status: (place?.status ?? '') as PlaceStatus | '',
    rating: place?.rating ?? '',
    visitedAt: place?.visited_at ?? '',
    tags: place?.tags ?? [],
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(
    place?.photo ? (storageUrl(place.photo) ?? place.photo) : null,
  )
  const [removePhoto, setRemovePhoto] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  /* ---- Nominatim ---- */
  const [lookupQuery, setLookupQuery] = useState(place?.name ?? '')
  const [results, setResults] = useState<PlaceCandidate[] | null>(null)

  /**
   * ⚠️ **ძებნა ცხადი ღილაკია** და არა აკრეფის გვერდითი ეფექტი: Nominatim
   * წამში ერთ მოთხოვნას უშვებს, ე.ი. ყოველ ასოზე გასვლა IP-ის დაბლოკვის
   * გზაა (ვებძებნის იგივე წესი).
   */
  const lookup = useMutation({
    mutationFn: () => fetchPlaceCandidates(lookupQuery.trim()),
    onSuccess: setResults,
    // ⚠️ „წყარო არ პასუხობს" ცალკე შეტყობინებაა და არა ცარიელი სია
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** კანდიდატის აღება — **მხოლოდ ცარიელი ველები არ გადაეწერება სახელს** */
  const takeCandidate = (c: PlaceCandidate) => {
    setForm((f) => ({
      ...f,
      name: f.name || c.name,
      address: c.address ?? f.address,
      city: c.city ?? f.city,
      country: c.country ?? f.country,
      lat: String(c.lat),
      lng: String(c.lng),
      osmId: c.osm_id,
      osmType: c.osm_type,
    }))
    setResults(null)
    toast({ title: t('places.candidateTaken'), variant: 'success' })
  }

  const save = useMutation({
    mutationFn: (input: PlaceInput) => (place ? updatePlace(place.id, input) : createPlace(input)),
    onSuccess: () => {
      toast({ title: t('places.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    /* ⚠️ სტატუსიც და კატეგორიაც სავალდებულოა — შემოწმება ქსელამდე,
       backend-ის 422 მეორე კარიბჭეა. */
    const picked = pickErrors(
      { status: form.status, category_id: form.categoryId },
      t('validation.pickOne'),
    )

    if (Object.keys(picked).length > 0) {
      setErrors(picked)

      const hidden = hiddenPicks(Object.keys(picked), fields.shows)
      if (hidden.length > 0) {
        toast({
          title: t('validation.hiddenRequired', {
            fields: hidden.map((key) => fields.label(key)).join(', '),
          }),
          variant: 'error',
        })
      }

      return
    }

    setErrors({})

    const { tags, removed } = dedupeTags(form.tags)
    if (removed > 0) {
      setForm((f) => ({ ...f, tags }))
      toast({ title: t('tags.duplicate', { count: removed }), variant: 'info' })
    }

    save.mutate({
      name: form.name,
      address: form.address || null,
      city: form.city || null,
      country: form.country || null,
      /* ⚠️ `=== ''` და არა truthy: **ნული ნამდვილი კოორდინატია** */
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
      osm_id: form.osmId || null,
      osm_type: form.osmType || null,
      description: form.description || null,
      category_id: form.categoryId ? Number(form.categoryId) : null,
      status: form.status as PlaceStatus,
      rating: form.rating ? Number(form.rating) : null,
      visited_at: form.visitedAt || null,
      tags,
      photo,
      remove_photo: removePhoto,
    })
  }

  return (
    <ModalShell title={t(place ? 'places.edit' : 'places.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {/* ნაბიჯი 1 — წყაროთი მოძებნა; ხელით შევსება ყოველთვის ღიაა */}
        <StepSection step={1} title={t('places.lookupTitle')} hint={t('places.lookupHint')}>
          <div className="flex gap-2">
            <Input
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder={t('places.lookupPlaceholder')}
              onKeyDown={(e) => {
                // ⚠️ Enter-მა ფორმა არ უნდა გაგზავნოს — ეს ძებნაა
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (lookupQuery.trim()) lookup.mutate()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={lookup.isPending || !lookupQuery.trim()}
              onClick={() => lookup.mutate()}
            >
              {lookup.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {t('places.lookupAction')}
            </Button>
          </div>

          {results != null && results.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{t('places.lookupEmpty')}</p>
          )}

          {results != null && results.length > 0 && (
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto fb-scroll">
              {results.map((c) => (
                <li key={`${c.osm_type}:${c.osm_id}`}>
                  <button
                    type="button"
                    onClick={() => takeCandidate(c)}
                    className="w-full rounded-md border border-border p-2 text-left transition-colors hover:border-primary"
                  >
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.address, c.kind].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </StepSection>

        <div className={fields.shows('name') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="p-name" required hint={fields.hint('name')}>
            {fields.label('name')}
          </FieldLabel>
          <Input
            id="p-name"
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fields.shows('status') ? undefined : 'hidden'}>
            <FieldLabel required hint={fields.hint('status')}>{fields.label('status')}</FieldLabel>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as PlaceStatus }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {PLACE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`places.statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.status && <p className="mt-1 text-xs text-destructive">{errors.status}</p>}
          </div>

          <div className={fields.shows('category') ? undefined : 'hidden'}>
            <FieldLabel required hint={fields.hint('category')}>{fields.label('category')}</FieldLabel>
            <Select
              value={form.categoryId}
              onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {dictionaryName(c, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category_id && (
              <p className="mt-1 text-xs text-destructive">{errors.category_id}</p>
            )}
          </div>

          <div className={fields.shows('city') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="p-city">{fields.label('city')}</FieldLabel>
            <Input
              id="p-city"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>

          <div className={fields.shows('country') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="p-country">{fields.label('country')}</FieldLabel>
            <Input
              id="p-country"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            />
          </div>

          <div className={fields.shows('rating') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="p-rating">{fields.label('rating')}</FieldLabel>
            <Input
              id="p-rating"
              type="number"
              min={0}
              max={10}
              step="0.1"
              value={form.rating}
              onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
            />
          </div>

          <div className={fields.shows('visited_at') ? undefined : 'hidden'}>
            <FieldLabel hint={fields.hint('visited_at')}>{fields.label('visited_at')}</FieldLabel>
            <DatePicker
              value={form.visitedAt}
              onChange={(v) => setForm((f) => ({ ...f, visitedAt: v ?? '' }))}
            />
          </div>
        </div>

        <div className={fields.shows('address') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="p-address">{fields.label('address')}</FieldLabel>
          <Input
            id="p-address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </div>

        {/* ⚠️ კოორდინატი **ერთი ველია** კატალოგში (`coords`): განცალკევებული
            გრძედი უაზროა და მისი დამალვა ნახევრად გატეხილ ფორმას დატოვებდა. */}
        <div className={fields.shows('coords') ? undefined : 'hidden'}>
          <Label className="flex items-center gap-1.5">
            {fields.label('coords')}
            <InfoHint info={t('places.coordsHint')} />
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              type="number"
              step="any"
              min={-90}
              max={90}
              aria-label={t('places.lat')}
              placeholder={t('places.lat')}
              value={form.lat}
              onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
            />
            <Input
              type="number"
              step="any"
              min={-180}
              max={180}
              aria-label={t('places.lng')}
              placeholder={t('places.lng')}
              value={form.lng}
              onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
            />
          </div>
          {errors.lat && <p className="mt-1 text-xs text-destructive">{errors.lat}</p>}
          {errors.lng && <p className="mt-1 text-xs text-destructive">{errors.lng}</p>}
        </div>

        <div className={fields.shows('photo') ? undefined : 'hidden'}>
          <Label>{fields.label('photo')}</Label>
          <PosterUploader
            preview={preview}
            variant="wide"
            onSelect={(file) => {
              setPhoto(file)
              setRemovePhoto(false)
              setPreview(URL.createObjectURL(file))
            }}
            onClear={() => {
              setPhoto(null)
              setRemovePhoto(true)
              setPreview(null)
            }}
          />
        </div>

        <div className={fields.shows('description') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="p-description">{fields.label('description')}</FieldLabel>
          <Textarea
            id="p-description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className={fields.shows('tags') ? undefined : 'hidden'}>
          <FieldLabel>{fields.label('tags')}</FieldLabel>
          <TagSelect
            value={form.tags}
            onChange={(v) => setForm((f) => ({ ...f, tags: v }))}
            options={allTags}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('actions.save')}
          </Button>
        </div>
      </form>

      {/* §6 ფაზა 3 — მორგებული ველები საკუთარ თავს ინახავს (ფორმის გარეთ) */}
      {place && <CustomFieldsCard module="place" recordId={place.id} />}
    </ModalShell>
  )
}
