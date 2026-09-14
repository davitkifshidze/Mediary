import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Download,
  ImageOff,
  Loader2,
  Plus,
  Search,
  Square,
  Users,
} from 'lucide-react'
import {
  WEB_MAX_PAGES,
  WEB_MAX_PHOTOS,
  importWebImages,
  searchWebImages,
  webSearchStatus,
  type SerpImage,
  type SerpImportResult,
  type SerpImportTarget,
  type SerpQuota,
  type SerpSource,
} from '@/api/web'
import { errorMessage, isApiCode } from '@/lib/errors'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { StepSection } from '@/components/ui/step-section'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/feedback'
import { WebSourcePicker } from '@/components/WebSourcePicker'

/* ============================================================
   ვებიდან ფოტოს ძებნა და ჩამოტვირთვა (Tasks §7.5/§7.6 → **§8.4**).

   ⚠️ **ორივე მომხმარებელი ერთ დიალოგზეა** — მსახიობის ფოტოები ტეგებით და
   ჩანაწერის ფოტოები, როცა TMDB-ზე ცოტაა. ორი ასლი ორნაირად მოიქცეოდა,
   კვოტას კი ორივე ერთი და იმავე ბიუჯეტიდან ხარჯავს.

   ⚠️ **ძებნა მხოლოდ ღილაკზე** — არც გახსნაზე, არც აკრეფისას. 250 ძებნაა
   თვეში მთელ ანგარიშზე, ე.ი. ერთი „ჩუმი" გამოძახება ბიუჯეტს დღეებში აჭმევს.

   ⚠️ **ჩამოტვირთვა ცალკე ნაბიჯია** — ჯერ ნახე, მონიშნე, მერე ჩამოწერე:
   ჩამოტვირთული ფაილი **შენს კვოტას** ხარჯავს.

   ⚠️ **ცენზურა გამორთულია** (`safe=off`) და ესკიზი **ბლარის გარეშე** ჩანს —
   შენი პირდაპირი პირობა. კოდში შიგთავსის კლასიფიკაცია არ იწერება.

   ## ეტაპი 5 (2026-09-13) — ვიზუალი ნაბიჯებად
   შენი სიტყვები: „ესეც რაღაც ვიზუალი შემიცვალე — ბორდერები, პადინგები,
   ფერები". დიალოგი ერთ სქროლზე ყველაფერს ერთი წონით აწყობდა, ე.ი. თანრიგი
   („ჯერ ძებნა, მერე მონიშვნა, ბოლოს ჩამოტვირთვა") ეკრანზე არსად ჩანდა.

   ⚠️ **ნაბიჯის ნომერი გამომძახებელთანაა** (`STEP`), რადგან განაწილება
   მხოლოდ მაშინ არსებობს, როცა ჩანაწერს მსახიობები ჰყავს — ე.ი. „შედეგები"
   ხან მესამეა, ხან მეოთხე. ორ ადგილას დაწერილი ნომერი აუცილებლად გაშორდებოდა.

   ⚠️ **ცარიელი პასუხი `EmptyState`-ია და არა ნაცრისფერი წინადადება** —
   ეტაპ 1-ის წესი. და „სცადე სხვა წყარო" ახლა **ღილაკებია**: ტექსტი
   ეუბნებოდა რა ექნა, ღილაკი კი აკეთებს. ⚠️ ძებნას ისევ **მხოლოდ დაჭერა**
   უშვებს — ღილაკი ცხადი არჩევანია და არა ავტომატური ხელახალი მოთხოვნა.

   ## §8.4 — ვის მიება ფოტო
   მოთხოვნა: „თუ ფილმზე ხარ შესული და კონკრეტულ მსახიობს მონიშნავ ან
   რამდენიმეს, ამ მსახიობებზე დაანაწილოს შესაბამისი ფოტოები; თუ ვერ
   გაირკვა — ზოგადად ფილმზე ჩააგდოს".

   ⚠️ **წესი სერვერზეა ერთხელ** (სახელით დამთხვევა სათაურსა და ბმულში) —
   ე.ი. ტესტდება და ქართულ სახელსაც ცნობს. აქ მხოლოდ **არჩევანია**: ვის
   შორის დაანაწილოს და (სურვილისამებრ) თითო ფოტოს ხელით გადაწერა.

   ⚠️ **ხელით გადაწერა ნატიური `<select>`-ია** და არა Radix-ის — ის portal-ს
   არ საჭიროებს, ე.ი. მოდალის შიგნით z-index-ის და `pointer-events`-ის
   არცერთი ხაფანგი არ ეხება (იხ. `lib/layers.ts`-ის ისტორია). ეტაპ 5-ზე მან
   თავისი ადგილი მიიღო — ბარათის ქვედა ზოლი საკუთარი ბორდერით, და არა
   ესკიზზე მიკრული ნაცრისფერი ზოლი.
   ============================================================ */

/** კონტექსტი, საიდანაც შეკითხვა იწყება (§5.2) */
export interface WebImageContext {
  /** ჩანაწერის/მსახიობის სახელი — საწყისი შეკითხვა და პირველი ჩიპი */
  base: string
  /** ამ ჩანაწერის მსახიობები — ჩიპი შეკითხვას ავსებს **და** განაწილებაში მონაწილეობს */
  people?: { id: number; name: string }[]
  /** ვის მიება ჩამოწერილი ფოტო (ცხადად ეწერება) */
  attachesTo?: string
}

/** სენტინელი — „სერვერმა გადაწყვიტოს" */
const AUTO = 'auto'

export function WebImageDialog({
  target,
  id,
  initialQuery,
  title,
  context,
  onClose,
  onImported,
}: {
  target: SerpImportTarget
  id: number
  initialQuery: string
  title: string
  context?: WebImageContext
  onClose: () => void
  onImported?: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [query, setQuery] = useState(initialQuery)
  const [engines, setEngines] = useState<string[]>([])
  /* ⚠️ **რაოდენობა და გვერდები ხელით შეიყვანება** (შენი მითითება, 2026-09-14).
     ორი სხვადასხვა რიცხვია და არა ერთი: `limit` — სულ რამდენი ფოტო მინდა,
     `pages` — რამდენ გვერდს ვთხოვ წყაროს. **თითო გვერდი Serper-ის ერთი
     credit-ია**, ე.ი. ეს არჩევანი ფულს ხარჯავს და ამიტომ ცხადად წერია.
     ⚠️ ნაგულისხმევი მცირეა განზრახ: „50 გვერდი" ერთი დაჭერით 50 credit-ია. */
  const [limit, setLimit] = useState(100)
  const [pages, setPages] = useState(5)
  const [items, setItems] = useState<SerpImage[]>([])
  const [sources, setSources] = useState<SerpSource[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [quota, setQuota] = useState<SerpQuota | null>(null)
  const [searched, setSearched] = useState(false)

  /** §8.4 — რომელ მსახიობებზე ნაწილდება */
  const [distribute, setDistribute] = useState<number[]>([])
  /** ფოტოს გასაღები → ხელით არჩეული მსახიობი (`AUTO` = სერვერის გადაწყვეტილება) */
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  /**
   * ბოლო იმპორტის შედეგი — **ეკრანზე რჩება** და არა მხოლოდ ტოსტში.
   *
   * ⚠️ „ჩამოიწერა 0 · ჩავარდა 6" ზუსტად ის პასუხია, რომელსაც „ვებიდან
   * არაფერი შედის" ითხოვს: hotlink-ის დაცვა ჩვეულებრივი ამბავია და
   * `failed` შეცდომა არ არის — მაგრამ თუ ეს რიცხვი ტოსტთან ერთად ქრება,
   * მიზეზი მოსახერხებელ დროს ვეღარ იკითხება.
   */
  const [result, setResult] = useState<SerpImportResult | null>(null)

  const people = context?.people ?? []

  // ⚠️ სტატუსი **კვოტას არ ხარჯავს** (`GET /account`)
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['web', 'status'],
    queryFn: webSearchStatus,
    staleTime: 60_000,
  })

  const available = status?.sources.images ?? []
  const selected = engines.length ? engines : available.slice(0, 1).map((e) => e.key)
  /** გვერდები მხოლოდ იმ წყაროს აქვს, რომელსაც backend `paged`-ად აღნიშნავს */
  const pagedSelected = available.some((e) => e.paged && selected.includes(e.key))

  /**
   * ⚠️ ძებნა **პარამეტრს იღებს** და არა მხოლოდ `selected`-ს: „ძებნა
   * Google-ით" ღილაკი წყაროსაც ცვლის და მაშინვე ეძებს, `setEngines()`-ის
   * შედეგი კი ამავე რენდერში ჯერ არ ჩანს — არჩევანის გადაცემის გარეშე
   * ძველი წყაროთი მოიძებნებოდა და ერთი ძებნა ტყუილად დაიხარჯებოდა.
   */
  const search = useMutation({
    mutationFn: (override?: string[]) =>
      searchWebImages({
        query: query.trim(),
        engines: override ?? selected,
        limit: clampNum(limit, 1, WEB_MAX_PHOTOS, 100),
        pages: clampNum(pages, 1, WEB_MAX_PAGES, 1),
      }),
    onSuccess: (data) => {
      setItems(data.items)
      setSources(data.sources)
      setQuota(data.quota)
      setPicked(new Set())
      setOverrides({})
      setResult(null)
      setSearched(true)
      // ⚠️ ხარჯი ცხადად ითქვას — ქეშიდან მოსული ძებნა უფასოა და ესეც უნდა ჩანდეს
      toast({
        title: data.spent > 0 ? t('web.spent', { count: data.spent }) : t('web.fromCache'),
        variant: data.items.length ? 'success' : 'info',
      })
      qc.invalidateQueries({ queryKey: ['web', 'status'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const importing = useMutation({
    mutationFn: () =>
      importWebImages({
        target,
        id,
        distribute: distribute.length ? distribute : undefined,
        images: items
          .filter((i) => picked.has(keyOf(i)))
          .map((image) => {
            const manual = overrides[keyOf(image)]
            return manual && manual !== AUTO
              ? { ...image, target_id: Number(manual) }
              : image
          }),
      }),
    onSuccess: (res) => {
      setResult(res)
      toast({
        title: t('web.imported', { count: res.added }),
        description: [
          // §8.4 — სად წავიდა: „ჰელენა 3 · ფილმი 7"
          assignedLine(res.assigned, people, context?.attachesTo, t),
          res.thumbnails > 0 ? t('web.importedThumbnails', { count: res.thumbnails }) : null,
          res.failed > 0 ? t('web.importFailed', { count: res.failed }) : null,
          res.skipped > 0 ? t('web.importSkipped', { count: res.skipped }) : null,
          res.bytes > 0 ? formatBytes(res.bytes) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        variant: res.added > 0 ? 'success' : 'info',
      })
      setPicked(new Set())
      onImported?.()
    },
    onError: (e) => {
      // ⚠️ ადგილის ამოწურვა (413) ცალკე მდგომარეობაა: **ნაწილი ჩამოიტვირთა**
      if (isApiCode(e, 'storage_quota_exceeded') || isApiCode(e, 'module_quota_exceeded')) onImported?.()
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const toggle = (item: SerpImage) => {
    const key = keyOf(item)
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const togglePerson = (personId: number) =>
    setDistribute((cur) =>
      cur.includes(personId) ? cur.filter((x) => x !== personId) : [...cur, personId],
    )

  const allPicked = items.length > 0 && picked.size === items.length

  // „იპოვა, მაგრამ გამოუსადეგარი" — ცალკე მდგომარეობა და ცალკე ტექსტი
  const dropped = useMemo(() => sources.reduce((sum, s) => sum + s.dropped, 0), [sources])
  const offline = useMemo(() => sources.filter((s) => !s.ok).map((s) => s.engine), [sources])
  /**
   * რომელი წყაროები დარჩა გამოუყენებელი — ცარიელ პასუხზე სწორედ ისინი გამოსადეგარია.
   * ⚠️ `useMemo` განზრახ არაა: `available` ყოველ რენდერზე ახალი მასივია
   * (`status?.sources… ?? []`), ე.ი. მემოიზაცია ისედაც ყოველ ჯერზე გაიაროდა.
   */
  const others = available.filter((e) => !selected.includes(e.key))

  /** ⚠️ ნომერი ერთხელ ითვლება — განაწილების ნაბიჯი შეიძლება საერთოდ არ იყოს */
  const hasDistribute = people.length > 0
  const STEP = { query: 1, sources: 2, distribute: 3, results: hasDistribute ? 4 : 3 }

  // ⚠️ **„გასაღები არ არის" ≠ „ვებძებნა არ მუშაობს"** — უფასო კატალოგი რჩება
  if (!statusLoading && status && available.length === 0) {
    return (
      <ModalShell title={title} onClose={onClose} wide>
        <p className="mt-4 text-sm text-muted-foreground">{t('errors.serpapi_unavailable')}</p>
        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="mt-5 space-y-3">
        {/* ---------- 1. რას ვეძებთ (შეკითხვა + კონტექსტის ჩიპები, §5.2) ---------- */}
        <StepSection step={STEP.query} title={t('web.stepQuery')}>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('web.queryPlaceholder')}
              // ⚠️ Enter = ძებნა (ღილაკის ტოლფასი); აკრეფისას ავტომატური ძებნა არასდროსაა
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (query.trim()) search.mutate(undefined)
                }
              }}
            />
            <Button
              type="button"
              onClick={() => search.mutate(undefined)}
              disabled={!query.trim() || search.isPending || available.length === 0}
            >
              {search.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {t('web.search')}
            </Button>
          </div>

          {context && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">{t('web.contextAdd')}</p>
              <ChipRow>
                <Chip onClick={() => setQuery(context.base)}>{context.base}</Chip>
                {people.map((person) => (
                  <Chip
                    key={person.id}
                    icon={<Plus className="size-3" />}
                    // ⚠️ **ემატება და არ ანაცვლებს** — „ფილმი + მსახიობი" სწორედ
                    // ის შეკითხვაა, რომელსაც §5.2 ითხოვს
                    onClick={() =>
                      setQuery((cur) =>
                        cur.toLowerCase().includes(person.name.toLowerCase())
                          ? cur
                          : `${cur.trim()} ${person.name}`.trim(),
                      )
                    }
                  >
                    {person.name}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          )}
        </StepSection>

        {/* ---------- 2. სად ვეძებთ ---------- */}
        <StepSection step={STEP.sources} title={t('web.stepSources')}>
          <WebSourcePicker
            engines={available}
            selected={selected}
            onChange={setEngines}
            quota={quota ?? (status ? { used: status.used, limit: status.limit, remaining: status.remaining } : null)}
            disabled={search.isPending}
          />

          {/* ⚠️ **ხელით შესაყვანი ორი რიცხვი** — ჩაშენებული 40 აღარაა.
              „გვერდები" მხოლოდ იმ წყაროს ეხება, რომელსაც ისინი აქვს (Serper);
              დანარჩენებზე ველი გამორთულია, რომ ცრუ დაპირება არ იყოს. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="web-limit">{t('web.limitLabel')}</Label>
              <Input
                id="web-limit"
                type="number"
                inputMode="numeric"
                min={1}
                max={WEB_MAX_PHOTOS}
                value={limit}
                disabled={search.isPending}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('web.limitHint', { max: WEB_MAX_PHOTOS })}
              </p>
            </div>

            <div>
              <Label htmlFor="web-pages">{t('web.pagesLabel')}</Label>
              <Input
                id="web-pages"
                type="number"
                inputMode="numeric"
                min={1}
                max={WEB_MAX_PAGES}
                value={pages}
                disabled={search.isPending || !pagedSelected}
                onChange={(e) => setPages(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {pagedSelected ? t('web.pagesHint', { max: WEB_MAX_PAGES }) : t('web.pagesOnlySerper')}
              </p>
            </div>
          </div>
        </StepSection>

        {/* ---------- 3. §8.4 — განაწილება მსახიობებზე ---------- */}
        {hasDistribute && (
          <StepSection
            step={STEP.distribute}
            title={
              <span className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                {t('web.distributeTitle')}
              </span>
            }
            hint={distribute.length ? t('web.distributeOn', { count: distribute.length }) : t('web.distributeOff')}
            action={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDistribute((cur) => (cur.length === people.length ? [] : people.map((p) => p.id)))
                }
              >
                {distribute.length === people.length ? t('photos.clear') : t('photos.selectAll')}
              </Button>
            }
          >
            <ChipRow>
              {people.map((person) => (
                <Chip
                  key={person.id}
                  active={distribute.includes(person.id)}
                  onClick={() => togglePerson(person.id)}
                >
                  {person.name}
                </Chip>
              ))}
            </ChipRow>
          </StepSection>
        )}

        {/* ---------- 4. შედეგები ---------- */}
        <StepSection
          step={STEP.results}
          title={t('web.stepResults')}
          hint={items.length > 0 ? t('web.found', { count: items.length }) : undefined}
          action={
            items.length > 0 ? (
              <>
                <span className="text-xs text-muted-foreground">{t('web.selected', { count: picked.size })}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setPicked(allPicked ? new Set() : new Set(items.map(keyOf)))}
                >
                  {allPicked ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                  {t(allPicked ? 'photos.clear' : 'photos.selectAll')}
                </Button>
              </>
            ) : null
          }
        >
          {/* ⚠️ „არ პასუხობს" ბადესთან ერთადაც ჩანს: ერთმა წყარომ შეიძლება
              იმუშაოს და მეორემ არა — ნაპოვნის რაოდენობა ამას არ ამბობს */}
          {offline.length > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {t('web.sourceOffline', { engines: offline.join(', ') })}
            </p>
          )}

          {result && (
            <div
              className={cn(
                'mb-3 rounded-lg border px-3 py-2 text-xs',
                result.added > 0
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
              )}
            >
              {[
                t('web.imported', { count: result.added }),
                result.failed > 0 ? t('web.importFailed', { count: result.failed }) : null,
                result.skipped > 0 ? t('web.importSkipped', { count: result.skipped }) : null,
                result.thumbnails > 0 ? t('web.importedThumbnails', { count: result.thumbnails }) : null,
                // §8.4 — სად წავიდა („ჰელენა 3 · ფილმი 7"), სერვერის პასუხიდან
                assignedLine(result.assigned, people, context?.attachesTo, t),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}

          {items.length === 0 ? (
            /* ⚠️ სამი ცარიელი მდგომარეობა და სამივე სხვადასხვა ამბავია:
               ჯერ არ მოგიძებნია · იპოვა ლინკის გარეშე · ვერაფერი იპოვა */
            <EmptyState
              icon={searched ? <ImageOff className="size-6" /> : <Search className="size-6" />}
              title={searched ? t('web.nothingFound') : t('web.notSearchedYet')}
              hint={
                searched
                  ? dropped > 0
                    ? t('web.foundUnusable', { count: dropped })
                    : undefined
                  : t('web.notSearchedHint')
              }
              /* ⚠️ **ცარიელი პასუხი ჩიხი არ უნდა იყოს.** ნაგულისხმევი წყარო
                 უფასო Wikimedia-ა და მისი ტეგებით ძებნა სუსტია — ფილმის
                 სახელზე ხშირად ნამდვილად არაფერს პოულობს. დანარჩენი წყაროები
                 აქვე დგას ღილაკებად: ერთი დაჭერა წყაროსაც ცვლის და ეძებს. */
              actions={
                // ⚠️ ცარიელი მასივი `EmptyState`-ისთვის „არის" — ღილაკების
                // ცარიელი რიგი ზედმეტ ჰაერს დახატავდა
                searched && query.trim() && others.length > 0
                  ? others.map((engine) => (
                      <Button
                        key={engine.key}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={search.isPending}
                        onClick={() => {
                          setEngines([engine.key])
                          search.mutate([engine.key])
                        }}
                      >
                        <Search className="size-3.5" />
                        {t('web.searchWith', { engine: engine.name })}
                      </Button>
                    ))
                  : undefined
              }
            />
          ) : (
            <div className="fb-scroll grid max-h-[45vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => {
                const key = keyOf(item)
                const on = picked.has(key)

                return (
                  <div
                    key={key}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors',
                      on ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(item)}
                      className="flex flex-1 cursor-pointer flex-col text-left"
                    >
                      <span className="relative block aspect-square w-full overflow-hidden bg-muted">
                        {/* ⚠️ **ორიგინალი ჯერ, ესკიზი მხოლოდ სათადარიგოდ** (2026-09-14).
                            ადრე პირიქით იყო და სწორედ ეს იძლეოდა „ბლარს": Google-ის
                            ესკიზები (`encrypted-tbn0.gstatic.com`) მონიშნულ სურათებზე
                            **თვითონ მოდის დაბუნდოვნებული** — ეს ჩვენი CSS არასდროს
                            ყოფილა (`blur` კლასი კოდში არსად არის). ორიგინალი ნამდვილი
                            ფაილია და ბლარი მასზე არ დევს.
                            ⚠️ `onError` **აუცილებელია**: hotlink-ის დაცვა ჩვეულებრივი
                            ამბავია (იგივე მიზეზი, რის გამოც ჩამოტვირთვაც ესკიზზე
                            ეშვება) — მის გარეშე ბადეში ტეხილი სურათები გამოჩნდებოდა. */}
                        <img
                          src={item.original ?? item.thumbnail ?? ''}
                          alt={item.title ?? ''}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const img = e.currentTarget
                            if (item.thumbnail && img.src !== item.thumbnail) img.src = item.thumbnail
                          }}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />

                        {/* ზომა ესკიზზე — სწორედ ის ფაქტია, რომელზეც არჩევანი დგას */}
                        {item.width && item.height && (
                          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                            {item.width}×{item.height}
                          </span>
                        )}

                        <span
                          className={cn(
                            'absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-md border transition-colors',
                            on
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-white/70 bg-black/40 text-transparent',
                          )}
                        >
                          <Check className="size-3.5" />
                        </span>
                      </span>

                      <span className="block space-y-1 px-2.5 py-2">
                        <span className="block truncate text-xs font-medium" title={item.title ?? ''}>
                          {item.domain ?? item.title ?? '—'}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {[item.engines.map((e) => engineName(available, e)).join(' · '), item.license ?? null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </button>

                    {/* §8.4 — ხელით გადაწერა; ჩანს მხოლოდ განაწილების დროს */}
                    {distribute.length > 0 && on && (
                      <label className="flex items-center gap-1.5 border-t border-border bg-muted/40 px-2.5 py-1.5">
                        <Users className="size-3 shrink-0 text-muted-foreground" />
                        <select
                          value={overrides[key] ?? AUTO}
                          onChange={(e) => setOverrides((cur) => ({ ...cur, [key]: e.target.value }))}
                          className="w-full cursor-pointer truncate bg-transparent text-[11px] text-muted-foreground outline-none focus:text-foreground"
                          aria-label={t('web.assignLabel')}
                        >
                          <option value={AUTO}>{t('web.assignAuto')}</option>
                          {people
                            .filter((p) => distribute.includes(p.id))
                            .map((p) => (
                              <option key={p.id} value={String(p.id)}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </StepSection>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {context?.attachesTo && (
          // ⚠️ „ვის მიება" ჩამოტვირთვის ღილაკის გვერდითაა — იმ წამს, როცა
          // ეს ფაქტი მნიშვნელობას იძენს
          <p className="mr-auto text-xs text-muted-foreground">
            {t('web.attachesTo', { name: context.attachesTo })}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button
          type="button"
          onClick={() => importing.mutate()}
          disabled={picked.size === 0 || importing.isPending}
        >
          {importing.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {t('web.download', { count: picked.size })}
        </Button>
      </div>
    </ModalShell>
  )
}

/** ერთეულის ვინაობა — ორიგინალი ლინკი (backend-იც ამით ცნობს დუბლს) */
function keyOf(item: SerpImage): string {
  return item.original ?? item.link ?? item.thumbnail ?? ''
}

/**
 * ხელით შეყვანილი რიცხვის დაცვა.
 *
 * ⚠️ ცარიელი ველი `Number('')` → **0**-ია და არა „ნაგულისხმევი": ამის გარეშე
 * ცარიელ ველზე ძებნა 422-ს დააბრუნებდა (`min:1`) და მიზეზი არსად ჩანდა.
 */
function clampNum(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value) || value < min) return fallback

  return Math.min(Math.trunc(value), max)
}

function engineName(engines: { key: string; name: string }[], key: string): string {
  return engines.find((e) => e.key === key)?.name ?? key
}

/**
 * „სად წავიდა" — **სერვერის პასუხიდან** და არა ჩვენი ვარაუდიდან (§8.4).
 *
 * ⚠️ ფრონტში გამოთვლილი „ალბათ ასე დანაწილდა" ერთ დღეს სერვერის წესს
 * გაცდებოდა და მომხმარებელს არასწორს აჩვენებდა.
 */
function assignedLine(
  assigned: Record<string, number> | undefined,
  people: { id: number; name: string }[],
  recordName: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!assigned) return null

  const parts = Object.entries(assigned)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const [kind, rawId] = key.split(':')
      if (kind === 'cast_member') {
        const person = people.find((p) => p.id === Number(rawId))
        return `${person?.name ?? t('web.assignActor')} ${count}`
      }
      return `${recordName ?? t('web.assignRecord')} ${count}`
    })

  return parts.length > 1 ? parts.join(' · ') : null
}
