import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
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
  PLACE_MAX_RATING,
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
import { EnumStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { RatingSelect } from '@/components/ui/rating-select'
import { ModalShell } from '@/components/ui/modal-shell'
import {
  QuickFill,
  QuickFillCandidate,
  QuickFillMessage,
  QuickFillResults,
  QuickFillSearch,
} from '@/components/ui/quick-fill'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShowMore } from '@/components/ui/show-more'
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
                        <EnumStatusBadge domain="place" status={place.status} />
                        {place.rating != null && (
                          <Badge className="bg-secondary tabular-nums">
                            {place.rating}/{PLACE_MAX_RATING}
                          </Badge>
                        )}
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
                          className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
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
                        variant="edit"
                        size="sm"
                        onClick={() => setEditing(place)}
                      >
                        <SquarePen className="size-3.5" />
                        {t('actions.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
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

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'place-form'

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
    // Tasks §25.2 — რიცხვი ან `null` (`RatingSelect`)
    rating: place?.rating ?? null,
    visitedAt: place?.visited_at ?? '',
    tags: place?.tags ?? [],
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(
    place?.photo ? (storageUrl(place.photo) ?? place.photo) : null,
  )
  const [removePhoto, setRemovePhoto] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const qc = useQueryClient()
  // §26.5 — დამატებითი ველები ახალ ადგილზეც (აქამდე მხოლოდ რედაქტირებისას ჩანდა)
  const extras = useRecordExtras('place', place)

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
    mutationFn: (input: PlaceInput) =>
      extras.current ? updatePlace(extras.current.id, input) : createPlace(input),
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['places'] })
        toast({ title: done.message, variant: 'error' })

        return
      }

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
      // §25.3 — `null` („გარეშე") სერვერამდე ცარიელ სტრიქონად მიდის და ქულას შლის
      rating: form.rating,
      visited_at: form.visitedAt || null,
      tags,
      photo,
      remove_photo: removePhoto,
    })
  }

  return (
    <ModalShell title={t(place ? 'places.edit' : 'places.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* §26.2 — წყაროთი მოძებნა, ყველა ფორმის ერთი ბლოკით; ხელით შევსება ყოველთვის ღიაა */}
        <QuickFill title={t('places.lookupTitle')} hint={t('places.lookupHint')} htmlFor="p-lookup">
          <QuickFillSearch
            id="p-lookup"
            value={lookupQuery}
            onChange={setLookupQuery}
            onSearch={() => lookup.mutate()}
            busy={lookup.isPending}
            placeholder={t('places.lookupPlaceholder')}
            buttonLabel={t('places.lookupAction')}
          />

          {results != null && results.length === 0 && <QuickFillMessage>{t('places.lookupEmpty')}</QuickFillMessage>}

          {results != null && results.length > 0 && (
            <QuickFillResults>
              {results.map((c) => (
                <QuickFillCandidate
                  key={`${c.osm_type}:${c.osm_id}`}
                  shape="none"
                  title={c.name}
                  meta={[c.address, c.kind].filter(Boolean).join(' · ')}
                  onPick={() => takeCandidate(c)}
                />
              ))}
            </QuickFillResults>
          )}
        </QuickFill>

        {/* §26 — ფოტო ზემოთაა, სახელსა და აღწერასთან ერთად */}
        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('photo') && (
              <>
                <FieldLabel required={fields.required('photo')} hint={fields.hint('photo')}>
                  {fields.label('photo')}
                </FieldLabel>
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
              </>
            )
          }
        >
          {/* ⚠️ სახელი `locked`-ია (§6.5) — ყოველთვის სავალდებულო */}
          <FormField {...fields.field('name')} required htmlFor="p-name" error={errors.name}>
            <Input
              id="p-name"
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('description')} htmlFor="p-description">
            <Textarea
              id="p-description"
              rows={FORM_TEXT_ROWS}
              placeholder={fields.placeholder('description')}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
        </FormSection>

        {/* ⚠️ §26 — `required` აღარ წერია ხელით: ნიშანი ველების კონსტრუქტორიდან
            მოდის (სავალდებულობას `pickErrors` ამოწმებს, როგორც ყველა ფორმაში) */}
        <FormSection title={t('form.sections.classification')}>
          <FormField size="quarter" {...fields.field('status')} htmlFor="p-status" error={errors.status}>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as PlaceStatus }))}>
              <SelectTrigger id="p-status" className={errors.status ? 'border-destructive' : undefined}>
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
          </FormField>

          <FormField size="quarter" {...fields.field('category')} htmlFor="p-category" error={errors.category_id}>
            <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
              <SelectTrigger id="p-category" className={errors.category_id ? 'border-destructive' : undefined}>
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
          </FormField>

          {/* Tasks §25.2 — რიცხვითი ველი (0–10, ათწილადით) ამრჩევად იქცა */}
          <FormField size="quarter" {...fields.field('rating')} htmlFor="p-rating" error={errors.rating}>
            <RatingSelect
              id="p-rating"
              max={PLACE_MAX_RATING}
              value={form.rating}
              invalid={!!errors.rating}
              onChange={(rating) => setForm((f) => ({ ...f, rating }))}
            />
          </FormField>

          <FormField size="quarter" {...fields.field('visited_at')} htmlFor="p-visited">
            <DatePicker
              id="p-visited"
              value={form.visitedAt}
              onChange={(v) => setForm((f) => ({ ...f, visitedAt: v ?? '' }))}
            />
          </FormField>

          <FormField {...fields.field('tags')} htmlFor="p-tags">
            <TagSelect
              inputId="p-tags"
              value={form.tags}
              onChange={(v) => setForm((f) => ({ ...f, tags: v }))}
              options={allTags}
            />
          </FormField>
        </FormSection>

        <FormSection title={t('form.sections.details')}>
          <FormField {...fields.field('address')} htmlFor="p-address">
            <Input
              id="p-address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('city')} htmlFor="p-city">
            <Input id="p-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </FormField>

          <FormField size="half" {...fields.field('country')} htmlFor="p-country">
            <Input
              id="p-country"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            />
          </FormField>

          {/* ⚠️ კოორდინატი **ერთი ველია** კატალოგში (`coords`): განცალკევებული
              გრძედი უაზროა და მისი დამალვა ნახევრად გატეხილ ფორმას დატოვებდა. */}
          <FormField
            {...fields.field('coords')}
            hint={joinHints(fields.hint('coords'), t('places.coordsHint'))}
            htmlFor="p-lat"
            error={[errors.lat, errors.lng].filter(Boolean).join(' ')}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                id="p-lat"
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
          </FormField>
        </FormSection>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები **ახალ ადგილზეც** (აქამდე მხოლოდ
          რედაქტირებისას ჩანდა); ახალზე მონახაზია და ადგილთან ერთად ინახება */}
      <CustomFieldsCard
        module="place"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      {/* ⚠️ „ინახება…" შენახვისას — აქამდე „შენახვა" ეწერა და ღილაკი უმოქმედოს ჰგავდა */}
      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
