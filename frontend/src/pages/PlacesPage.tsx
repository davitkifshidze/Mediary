import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Image as ImageIcon, Link2, Loader2, Map as MapIcon, MapPin, Plus, Search, Star } from 'lucide-react'
import {
  PLACE_STATUSES,
  createPlace,
  deletePlace,
  fetchPlaceCategories,
  fetchPlaceCountries,
  fetchPlaces,
  lookupPlace,
  placeFromLink,
  reverseGeocode,
  searchPlaces,
  setPlaceStatus,
  togglePlaceFavorite,
  updatePlace,
  type Place,
  type PlaceCandidate,
  type PlaceCategory,
  type PlaceFileKind,
  type PlaceFilters,
  type PlaceInput,
  type PlaceSource,
  type PlaceStatus,
  uploadPlaceFiles,
} from '@/api/places'
import { storageUrl } from '@/lib/api'
import { useDrillParams } from '@/lib/statsLinks'
import { RICH_TEXT_MAX } from '@/lib/richText'
import { useModuleFields } from '@/lib/fields'
import { useFilterDraft } from '@/lib/filters'
import { LIST_PAGE_SIZE, usePagedList } from '@/lib/paged'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useDateFormat } from '@/lib/dates'
import { useContentLang } from '@/lib/settings'
import { PlaceDetail } from '@/components/PlaceDetail'
import { FormMapPick } from '@/components/PlaceMapLazy'
import { PendingFilesSection } from '@/components/PendingFiles'
import { RecordActionBar } from '@/components/RecordActionBar'
import { EnumStatusMenu } from '@/components/StatusMenu'
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
import { RatingBadge } from '@/components/ui/star-rating'
import { Button } from '@/components/ui/button'
import { RichText } from '@/components/ui/rich-text'
import { DatePicker } from '@/components/ui/date-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { InfoHint } from '@/components/ui/info-hint'
import { Textarea } from '@/components/ui/textarea'
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
import { usePendingUploads } from '@/lib/pendingUploads'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RecordList, RecordView } from '@/components/RecordView'
import { ViewToggle } from '@/components/ui/view-toggle'
import { useRecordLayout } from '@/lib/recordLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pagination } from '@/components/ui/pagination'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   ადგილების მოდული (`place`).

   ⚠️ **სტატუსი enum-ია** (ორი მნიშვნელობა), ე.ი. საიდბარის სექციები
   წიგნის/თამაშის/კურსის რიგშია: „ყველა · რჩეული · დამატება",
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
  // ხედი მოდულზე ინახება; ნაგულისხმევი — ახლანდელი ხედი
  const [layout, setLayout] = useRecordLayout('place', 'rows')

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

  const drill = useDrillParams()
  const filters: PlaceFilters = {
    q: term || undefined,
    category_id: categories.length ? categories.join(',') : undefined,
    country: countries.length ? countries.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    status: statuses.length ? statuses.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    sort: sort === 'newest' ? undefined : sort,
    // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, წელი, შენი ქულა)
    ...drill,
  }

  // გვერდზე 10: ნომრები + „მეტის ჩვენება"; მიმდინარე გვერდი `?page=`-შია
  const query = usePagedList({
    queryKey: ['places', filters],
    fetchPage: (page) => fetchPlaces({ ...filters, page, per_page: LIST_PAGE_SIZE }),
  })
  const categoriesQ = useQuery({ queryKey: ['place-categories'], queryFn: fetchPlaceCategories })
  const countriesQ = useQuery({ queryKey: ['place-countries'], queryFn: fetchPlaceCountries })

  const places = query.items
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.total
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
            {/* ბარათები · ბადე · სტრიქონები (მოდულზე ინახება) */}
            <ViewToggle value={layout} onChange={setLayout} />
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
              <RecordList layout={layout}>
                {places.map((place) => {
                  const askDelete = async () => {
                    if (
                      await confirm({
                        title: t('places.delete'),
                        description: t('places.deleteHint', { name: place.name }),
                        variant: 'destructive',
                      })
                    ) {
                      remove.mutate(place.id)
                    }
                  }
                  /* მარჯვენა ღილაკის მენიუ: გახსნა · რუკა · სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა */
                  const actions: MenuAction[] = [
                    { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => setDetail(place) },
                    ...(place.map_url
                      ? [{ key: 'map', label: t('places.openMap'), icon: MapIcon, run: () => window.open(place.map_url!, '_blank', 'noopener,noreferrer') }]
                      : []),
                    {
                      key: 'status',
                      label: t('places.status'),
                      sub: PLACE_STATUSES.map((s) => ({
                        key: `status:${s}`,
                        label: t(`places.statuses.${s}`),
                        checked: place.status === s,
                        run: () => status.mutate({ id: place.id, next: s }),
                      })),
                    },
                    favoriteAction(place.is_favorite, () => favorite.mutate(place.id), t),
                    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(place) },
                    { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: askDelete },
                  ]
                  return (
                    /* ერთი აღწერა სამ განლაგებაში; სტატუსი და ქულა ზოლშია */
                    <RecordView
                      key={place.id}
                      title={place.name}
                      onOpen={() => setDetail(place)}
                      openLabel={place.name}
                      photo={place.photo ? (storageUrl(place.photo) ?? place.photo) : null}
                      rowPhotoClassName="size-16"
                      placeholder={<MapPin className="size-6" />}
                      titleAside={<VisibilityBadge value={place.visibility} />}
                      meta={[
                        place.city,
                        place.country,
                        place.category ? dictionaryName(place.category, lang) : null,
                        place.visited_at ? formatDate(place.visited_at) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      extra={
                        place.address && <p className="mt-0.5 truncate text-xs text-muted-foreground">{place.address}</p>
                      }
                      tags={place.tags}
                      actions={actions}
                      onEdit={() => setEditing(place)}
                      /* ერთი ზოლი: შეფასება (უშეფასებოზე არაფერი) · რუკა (კოორდინატის გარეშე
                         უხილავი სლოტი) · სტატუსი (ჩამოსაშლელი) · რჩეული · ფაილები · რედაქტირება ·
                         წაშლა — ყველა h-9 */
                      bar={
                        <RecordActionBar
                          before={
                            <>
                              <RatingBadge value={place.rating} size="row" className="mr-1" />
                            </>
                          }
                          status={
                            <EnumStatusMenu
                              domain="place"
                              value={place.status}
                              options={PLACE_STATUSES}
                              label={t('places.status')}
                              onChange={(next) => status.mutate({ id: place.id, next })}
                            />
                          }
                          favorite={{
                            active: place.is_favorite,
                            pending: favorite.isPending && favorite.variables === place.id,
                            onToggle: () => favorite.mutate(place.id),
                          }}
                          files={{ count: place.files_count ?? 0, onOpen: () => setDetail(place) }}
                          link={{ href: place.map_url, label: t('actions.map'), icon: MapIcon, title: t('places.openMap') }}
                          onEdit={() => setEditing(place)}
                          onDelete={() => void askDelete()}
                        />
                      }
                    />
                  )
                })}
              </RecordList>

              <Pagination {...query.pagination} />
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
          {/* ⚠️ სტატუსი **აქ არის და არა საიდბარში**: enum-სტატუსიან მოდულებს სექციები არ აქვთ */}
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

      {/* სია ახლდება რჩეულის/ფაილის შემდეგ, მოდალს ახალი ობიექტი უნდა მიუვიდეს */}
      {detail && <PlaceDetail place={places.find((p) => p.id === detail.id) ?? detail} onClose={() => setDetail(null)} />}

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
    // რიცხვი ან `null` (`RatingSelect`)
    rating: place?.rating ?? null,
    visitedAt: place?.visited_at ?? '',
    tags: place?.tags ?? [],
    // წყაროდან; საათები ფორმაში თითო ხაზზე
    phone: place?.phone ?? '',
    website: place?.website ?? '',
    hours: (place?.opening_hours ?? []).join('\n'),
  })
  /** წყაროს რეიტინგი (Google 0–5) — **შენი ქულა არ არის**, ფორმაში მხოლოდ ჩანს */
  const [sourceRating, setSourceRating] = useState({
    rating: place?.source_rating ?? null,
    count: place?.source_rating_count ?? null,
  })
  /** წყაროს ფოტოები: შენახვისას გალერეაში, პირველი — მთავარი (ფოტო თუ არ გაქვს) */
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(
    place?.photo ? (storageUrl(place.photo) ?? place.photo) : null,
  )
  const [removePhoto, setRemovePhoto] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const qc = useQueryClient()
  // დამატებითი ველები ახალ ადგილზეც (აქამდე მხოლოდ რედაქტირებისას ჩანდა)
  const extras = useRecordExtras('place', place)
  /* ფაილები **შექმნისთანავე** (`lib/pendingUploads.ts`): შენახვისას ჯერ ადგილი,
     მერე ფაილები სათითაოდ; ჩავარდნა ადგილს არ აუქმებს — ფანჯარა ღია რჩება. */
  const pending = usePendingUploads<PlaceFileKind>()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  /* ---- წყაროები: Google Places → SerpApi → Serper → Nominatim ---- */
  const [lookupQuery, setLookupQuery] = useState(place?.name ?? '')
  const [results, setResults] = useState<PlaceCandidate[] | null>(null)
  const [resultsFrom, setResultsFrom] = useState<PlaceSource | null>(null)
  /** წერისას შემოთავაზება — მხოლოდ Google-ის გასაღებით; სერვერი `live: false`-ს თუ იტყვის, Enter-ზე გადავდივართ */
  const [liveOn, setLiveOn] = useState(true)
  /** ⚠️ რედაქტირებისას ველში სახელი უკვე წერია — შემოთავაზება მხოლოდ შენი აკრეფიდან იწყება */
  const [typed, setTyped] = useState(false)
  // Google-ის ავტოშევსების სესია: შემოთავაზებები და არჩეულის დეტალები ერთ სესიად ითვლება
  const session = useMemo(() => globalThis.crypto?.randomUUID?.() ?? `s${Date.now()}`, [])
  const liveSeq = useRef(0)
  const [mapLink, setMapLink] = useState('')
  /** პინის გადათრევის შემდეგ ნაპოვნი მისამართი — „განახლება?" */
  const [addressOffer, setAddressOffer] = useState<{ address: string | null; city: string | null; country: string | null } | null>(null)
  /** პრევიუ წყაროს ფოტოა (და არა შენი ატვირთული/შენახული) — ახალი არჩევა მას ცვლის */
  const [sourcePreview, setSourcePreview] = useState(false)

  /*
   * ⚠️ **წერისას — მხოლოდ Google** (`live`): SerpApi/Serper თითო ძებნაზე კრედიტს ხარჯავს,
   * Nominatim-ის პოლიტიკა autocomplete-ს კრძალავს. მცირე პაუზით; ძველი პასუხი
   * ახალს არ გადაეწერება (`liveSeq`); შეცდომა ჩუმია — ცხადი ძებნა (Enter) რჩება.
   */
  useEffect(() => {
    const q = lookupQuery.trim()
    if (!typed || !liveOn || q.length < 3) return
    const timer = window.setTimeout(async () => {
      const mine = ++liveSeq.current
      try {
        const res = await searchPlaces(q, { live: true, session })
        if (mine !== liveSeq.current) return
        if (!res.live) {
          setLiveOn(false)

          return
        }
        setResults(res.results)
        setResultsFrom('google')
      } catch {
        // წერისას ტოსტი ხმაური იქნებოდა — Enter-ით ძებნა შეცდომას ცხადად იტყვის
      }
    }, 450)

    return () => window.clearTimeout(timer)
  }, [lookupQuery, typed, liveOn, session])

  /** ცხადი ძებნა (Enter / ღილაკი) — წყაროების ჯაჭვი, ფორმის ქალაქით */
  const lookup = useMutation({
    mutationFn: () => {
      liveSeq.current++

      return searchPlaces(lookupQuery.trim(), { city: form.city.trim() || null })
    },
    onSuccess: (res) => {
      setResults(res.results)
      setResultsFrom(res.source ?? null)
      if (!res.live) setLiveOn(false)
    },
    // ⚠️ „წყარო არ პასუხობს" ცალკე შეტყობინებაა და არა ცარიელი სია
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** წყაროს კატეგორია („რესტორანი") → შენი კატეგორია სახელით, თუ ასეთი გაქვს */
  const matchCategory = (kind: string | null): string => {
    const k = kind?.trim().toLowerCase()
    if (!k) return ''
    const hit = categories.find((c) =>
      [c.name_ka, c.name_en].some((n) => {
        const name = n?.trim().toLowerCase()
        return !!name && (name === k || k.includes(name) || name.includes(k))
      }),
    )

    return hit ? String(hit.id) : ''
  }

  /**
   * მონახაზი → ფორმა. ⚠️ **შენი სახელი არ გადაიწერება**; დანარჩენი წყაროსია
   * (მისამართი, ქალაქი, კოორდინატები, ტელეფონი, საათები…), კატეგორია — მხოლოდ
   * ცარიელზე; ფოტო — მხოლოდ თუ შენი არ აირჩიე.
   */
  const applyDraft = (d: PlaceCandidate) => {
    setForm((f) => ({
      ...f,
      name: f.name || d.name || f.name,
      address: d.address ?? f.address,
      city: d.city ?? f.city,
      country: d.country ?? f.country,
      lat: d.lat != null ? String(d.lat) : f.lat,
      lng: d.lng != null ? String(d.lng) : f.lng,
      // OSM-ის იდენტობა მხოლოდ OSM-იდან მოსულს აქვს — სხვა წყაროზე ძველი იშლება
      osmId: d.osm_id ?? '',
      osmType: d.osm_type ?? '',
      phone: d.phone ?? f.phone,
      website: d.website ?? f.website,
      hours: d.hours.length ? d.hours.join('\n') : f.hours,
      categoryId: f.categoryId || matchCategory(d.kind),
    }))
    if (d.rating != null) setSourceRating({ rating: d.rating, count: d.rating_count })
    if (d.photos.length) setGalleryUrls(d.photos)
    if (d.photo && !photo && (!preview || sourcePreview)) {
      setPreview(d.photo)
      setSourcePreview(true)
      setRemovePhoto(false)
    }
    setResults(null)
    setAddressOffer(null)
    toast({ title: t('places.candidateTaken'), variant: 'success' })
  }

  /** კანდიდატი → დეტალები (Google-ის შემოთავაზებას სახელის გარდა არაფერი აქვს; OSM-ისა უკვე სრულია) */
  const take = useMutation({
    mutationFn: (c: PlaceCandidate) =>
      c.source === 'nominatim' ? Promise.resolve(c) : lookupPlace(c, lookupQuery.trim(), session),
    onSuccess: applyDraft,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** Google Maps-ის ბმული (მოკლეც) → ფორმა */
  const fromLink = useMutation({
    mutationFn: (url: string) => placeFromLink(url),
    onSuccess: applyDraft,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
  const readLink = (raw: string) => {
    const url = raw.trim()
    if (/^https?:\/\//i.test(url) && !fromLink.isPending) fromLink.mutate(url)
  }

  /** „41.7151, 44.8271" (Google-იდან დაკოპირებული) → ორი ველი */
  const pasteCoords = (raw: string): boolean => {
    const m = raw.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/)
    if (!m || Math.abs(Number(m[1])) > 90 || Math.abs(Number(m[2])) > 180) return false
    setForm((f) => ({ ...f, lat: m[1], lng: m[2] }))

    return true
  }

  /** პინი გადაათრიე → მისამართი იმ წერტილზე; ფორმაში მხოლოდ „განახლებით" ჩაიწერება */
  const movePin = (lat: number, lng: number) => {
    setForm((f) => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }))
    void reverseGeocode(lat, lng)
      .then((found) => {
        const differs = (found.address && found.address !== form.address) || (found.city && found.city !== form.city)
        setAddressOffer(differs ? found : null)
      })
      .catch(() => setAddressOffer(null))
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

      if (pending.items.length) {
        const failed = await pending.run(
          (kind, file) => uploadPlaceFiles(saved.id, kind, [file]),
          (done, total) => setProgress({ done, total }),
        )
        setProgress(null)
        qc.invalidateQueries({ queryKey: ['place-files', saved.id] })
        qc.invalidateQueries({ queryKey: ['places'] })
        qc.invalidateQueries({ queryKey: ['storage'] })

        if (failed.length) {
          toast({ title: t('uploads.failed', { names: failed.map((f) => f.file.name).join(', ') }), variant: 'error' })

          return
        }
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

    // submit-ზე დუბლი უხმოდ იჭრება: `TagSelect` უკვე გააფრთხილა, აქ მხოლოდ გარანტია
    const { tags } = dedupeTags(form.tags)

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
      // `null` („გარეშე") სერვერამდე ცარიელ სტრიქონად მიდის და ქულას შლის
      rating: form.rating,
      visited_at: form.visitedAt || null,
      tags,
      photo,
      remove_photo: removePhoto,
      phone: form.phone.trim() || null,
      website: form.website.trim() || null,
      opening_hours: form.hours.split('\n').map((line) => line.trim()).filter(Boolean),
      source_rating: sourceRating.rating,
      source_rating_count: sourceRating.count,
      // შენი ატვირთული ფოტო მთავარია; წყაროს ფოტოები მაინც გალერეაში ჩამოდის
      gallery_urls: galleryUrls,
    })
  }

  return (
    <ModalShell title={t(place ? 'places.edit' : 'places.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* წყაროთი მოძებნა, ყველა ფორმის ერთი ბლოკით; ხელით შევსება ყოველთვის ღიაა.
            ზემოთ Google Maps-ის ბმული (წესი: ბმული ფორმის თავში),
            ქვემოთ სახელით ძებნა — Google-ის გასაღებით წერისას, მის გარეშე Enter-ით */}
        <QuickFill
          title={t('places.lookupTitle')}
          hint={joinHints(t('places.lookupHint'), liveOn ? undefined : t('places.liveOffHint'))}
          htmlFor="p-lookup"
        >
          <div className="relative mb-2">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="p-maplink"
              className="pl-9"
              value={mapLink}
              placeholder={t('places.linkPlaceholder')}
              aria-label={t('places.linkLabel')}
              onChange={(e) => setMapLink(e.target.value)}
              onPaste={(e) => readLink(e.clipboardData.getData('text'))}
              onBlur={(e) => readLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  readLink(mapLink)
                }
              }}
            />
            {fromLink.isPending && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <QuickFillSearch
            id="p-lookup"
            value={lookupQuery}
            onChange={(v) => {
              setTyped(true)
              setLookupQuery(v)
            }}
            onSearch={() => lookup.mutate()}
            busy={lookup.isPending || take.isPending}
            placeholder={t('places.lookupPlaceholder')}
            buttonLabel={t('places.lookupAction')}
          />

          {results != null && results.length === 0 && <QuickFillMessage>{t('places.lookupEmpty')}</QuickFillMessage>}

          {results != null && results.length > 0 && (
            <QuickFillResults label={resultsFrom ? t('places.resultsFrom', { source: t(`places.sources.${resultsFrom}`) }) : undefined}>
              {results.map((c) => (
                <QuickFillCandidate
                  key={`${c.source}:${c.source_id}`}
                  image={c.photo}
                  shape={results.some((r) => r.photo) ? 'square' : 'none'}
                  title={c.name}
                  meta={[
                    c.address,
                    c.kind,
                    c.rating != null ? `★ ${c.rating}${c.rating_count ? ` (${c.rating_count})` : ''}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPick={() => take.mutate(c)}
                  disabled={take.isPending}
                />
              ))}
            </QuickFillResults>
          )}
        </QuickFill>

        {/* ფოტო ზემოთაა, სახელსა და აღწერასთან ერთად */}
        <FormSection
          title={t('form.sections.basic')}
          mediaVariant="wide"
          mediaLabel={
            <FieldLabel required={fields.required('photo')} hint={fields.hint('photo')}>
              {fields.label('photo')}
            </FieldLabel>
          }
          media={
            fields.shows('photo') && (
              <PosterUploader
                fill
                preview={preview}
                variant="wide"
                onSelect={(file) => {
                  setPhoto(file)
                  setRemovePhoto(false)
                  setSourcePreview(false)
                  setPreview(URL.createObjectURL(file))
                }}
                onClear={() => {
                  setPhoto(null)
                  setRemovePhoto(true)
                  setPreview(null)
                  // წყაროს ფოტოს მოხსნა მის ჩამოტვირთვასაც აუქმებს
                  if (sourcePreview) setGalleryUrls([])
                  setSourcePreview(false)
                }}
              />
            )
          }
        >
          {/* ⚠️ სახელი `locked`-ია — ყოველთვის სავალდებულო */}
          <FormField {...fields.field('name')} required htmlFor="p-name" error={errors.name}>
            <Input
              id="p-name"
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('description')} htmlFor="p-description">
            <RichText
              id="p-description"
              label={fields.label('description')}
              maxLength={RICH_TEXT_MAX}
              placeholder={fields.placeholder('description')}
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            />
          </FormField>
        </FormSection>

        {/* ⚠️ `required` აღარ წერია ხელით: ნიშანი ველების კონსტრუქტორიდან
            მოდის (სავალდებულობას `pickErrors` ამოწმებს, როგორც ყველა ფორმაში) */}
        {/* სტატუსი · კლასიფიკატორი · შეფასება · ვიზიტი ოთხ მეოთხედად, ტეგები ქვემოთ:
            შეფასების ჩამოსაშლელი (`RatingSelect`) მეოთხედში ეტევა და მეზობლების `h-10`-ისაა */}
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

          {/* ჩამოსაშლელი „★ 1…10" + ხელით ჩასაწერი წილადი */}
          <FormField size="quarter" {...fields.field('rating')} htmlFor="p-rating" error={errors.rating}>
            <RatingSelect
              id="p-rating"
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

          {/* წყაროდან ივსება (Google Maps), ხელითაც */}
          <FormField size="half" {...fields.field('phone')} htmlFor="p-phone" error={errors.phone}>
            <Input
              id="p-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('website')} htmlFor="p-website" error={errors.website}>
            <Input
              id="p-website"
              type="url"
              placeholder="https://"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('opening_hours')} htmlFor="p-hours">
            <Textarea
              id="p-hours"
              rows={3}
              placeholder={t('places.hoursPlaceholder')}
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
            />
            {sourceRating.rating != null && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="source-rating">
                <Star className="size-3.5 fill-current text-[var(--gold)]" />
                {t('places.sourceRating', {
                  rating: sourceRating.rating,
                  count: sourceRating.count ?? 0,
                })}
                <InfoHint info={t('places.sourceRatingHint')} />
              </p>
            )}
          </FormField>

          {/* ⚠️ კოორდინატი **ერთი ველია** კატალოგში (`coords`): განცალკევებული
              გრძედი უაზროა და მისი დამალვა ნახევრად გატეხილ ფორმას დატოვებდა. */}
          <FormField
            {...fields.field('coords')}
            hint={joinHints(fields.hint('coords'), t('places.coordsHint'))}
            htmlFor="p-lat"
            error={[errors.lat, errors.lng].filter(Boolean).join(' ')}
          >
            {/* Google-იდან დაკოპირებული „41.7151, 44.8271" ერთ ველში; ცალ-ცალკე ველებიც რჩება */}
            <Input
              className="mb-2"
              aria-label={t('places.coordsPaste')}
              placeholder={t('places.coordsPastePlaceholder')}
              onPaste={(e) => {
                if (pasteCoords(e.clipboardData.getData('text'))) e.preventDefault()
              }}
              onChange={(e) => pasteCoords(e.target.value)}
            />
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
            {/* რუკა მარკერით: გადათრევით ან დაწკაპუნებით კოორდინატი ზუსტდება (ლეიზი ჩანკი) */}
            <FormMapPick lat={form.lat} lng={form.lng} onPick={movePin} />
            {/* პინის ახალ წერტილზე სხვა მისამართია — ჩაიწეროს? */}
            {addressOffer && (
              <div
                className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs"
                data-testid="address-offer"
              >
                <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  {t('places.addressOffer', { address: addressOffer.address ?? addressOffer.city ?? '' })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      address: addressOffer.address ?? f.address,
                      city: addressOffer.city ?? f.city,
                      country: addressOffer.country ?? f.country,
                    }))
                    setAddressOffer(null)
                  }}
                >
                  {t('places.addressUpdate')}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAddressOffer(null)}>
                  {t('places.addressKeep')}
                </Button>
              </div>
            )}
          </FormField>
        </FormSection>

        {/* ფაილები ახალ ადგილზე; არსებულს დეტალის ფანჯარაში აქვს */}
        {!place && (
          <PendingFilesSection
            pending={pending}
            title={t('places.files')}
            hint={t('uploads.pendingHint')}
            kinds={[
              { kind: 'image', label: t('places.fileKinds.image'), icon: ImageIcon },
              { kind: 'doc', label: t('places.fileKinds.doc'), icon: FileText },
            ]}
          />
        )}
      </form>

      {/* დამატებითი ველები **ახალ ადგილზეც** (აქამდე მხოლოდ
          რედაქტირებისას ჩანდა); ახალზე მონახაზია და ადგილთან ერთად ინახება */}
      <CustomFieldsCard
        module="place"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      {progress && (
        <p className="mt-3 text-xs text-muted-foreground">{t('uploads.progress', { done: progress.done, total: progress.total })}</p>
      )}

      {/* ⚠️ „ინახება…" შენახვისას — აქამდე „შენახვა" ეწერა და ღილაკი უმოქმედოს ჰგავდა */}
      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
