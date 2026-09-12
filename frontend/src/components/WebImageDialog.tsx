import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckSquare, Download, Loader2, Search, Square, Users } from 'lucide-react'
import {
  importWebImages,
  searchWebImages,
  webSearchStatus,
  type SerpImage,
  type SerpImportTarget,
  type SerpQuota,
  type SerpSource,
} from '@/api/web'
import { errorMessage, isApiCode } from '@/lib/errors'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
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

   ## §8.4 — ვის მიება ფოტო
   მოთხოვნა: „თუ ფილმზე ხარ შესული და კონკრეტულ მსახიობს მონიშნავ ან
   რამდენიმეს, ამ მსახიობებზე დაანაწილოს შესაბამისი ფოტოები; თუ ვერ
   გაირკვა — ზოგადად ფილმზე ჩააგდოს".

   ⚠️ **წესი სერვერზეა ერთხელ** (სახელით დამთხვევა სათაურსა და ბმულში) —
   ე.ი. ტესტდება და ქართულ სახელსაც ცნობს. აქ მხოლოდ **არჩევანია**: ვის
   შორის დაანაწილოს და (სურვილისამებრ) თითო ფოტოს ხელით გადაწერა.

   ⚠️ **ხელით გადაწერა ნატიური `<select>`-ია** და არა Radix-ის — ის portal-ს
   არ საჭიროებს, ე.ი. მოდალის შიგნით z-index-ის და `pointer-events`-ის
   არცერთი ხაფანგი არ ეხება (იხ. `lib/layers.ts`-ის ისტორია).
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
  const [items, setItems] = useState<SerpImage[]>([])
  const [sources, setSources] = useState<SerpSource[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [quota, setQuota] = useState<SerpQuota | null>(null)
  const [searched, setSearched] = useState(false)

  /** §8.4 — რომელ მსახიობებზე ნაწილდება */
  const [distribute, setDistribute] = useState<number[]>([])
  /** ფოტოს გასაღები → ხელით არჩეული მსახიობი (`AUTO` = სერვერის გადაწყვეტილება) */
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  const people = context?.people ?? []

  // ⚠️ სტატუსი **კვოტას არ ხარჯავს** (`GET /account`)
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['web', 'status'],
    queryFn: webSearchStatus,
    staleTime: 60_000,
  })

  const available = status?.sources.images ?? []
  const selected = engines.length ? engines : available.slice(0, 1).map((e) => e.key)

  const search = useMutation({
    mutationFn: () => searchWebImages({ query: query.trim(), engines: selected, limit: 40 }),
    onSuccess: (data) => {
      setItems(data.items)
      setSources(data.sources)
      setQuota(data.quota)
      setPicked(new Set())
      setOverrides({})
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

  // ⚠️ **„გასაღები არ არის" ≠ „ვებძებნა არ მუშაობს"** — უფასო კატალოგი რჩება
  if (!statusLoading && status && available.length === 0) {
    return (
      <ModalShell title={title} onClose={onClose} wide>
        <p className="mt-4 text-sm text-muted-foreground">{t('errors.serpapi_unavailable')}</p>
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="mt-4 space-y-4">
        {/* ---------- კონტექსტი: სახელი + ამ ჩანაწერის მსახიობები (§5.2) ---------- */}
        {context && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t('web.contextAdd')}</span>
              <QueryChip label={context.base} onClick={() => setQuery(context.base)} />
              {people.map((person) => (
                <QueryChip
                  key={person.id}
                  label={person.name}
                  // ⚠️ **ემატება და არ ანაცვლებს** — „ფილმი + მსახიობი" სწორედ
                  // ის შეკითხვაა, რომელსაც §5.2 ითხოვს
                  onClick={() =>
                    setQuery((cur) =>
                      cur.toLowerCase().includes(person.name.toLowerCase())
                        ? cur
                        : `${cur.trim()} ${person.name}`.trim(),
                    )
                  }
                />
              ))}
            </div>
            {context.attachesTo && (
              <p className="text-xs text-muted-foreground">
                {t('web.attachesTo', { name: context.attachesTo })}
              </p>
            )}
          </div>
        )}

        {/* ---------- §8.4 — განაწილება მსახიობებზე ---------- */}
        {people.length > 0 && (
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium">{t('web.distributeTitle')}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-xs"
                onClick={() =>
                  setDistribute((cur) => (cur.length === people.length ? [] : people.map((p) => p.id)))
                }
              >
                {distribute.length === people.length ? t('photos.clear') : t('photos.selectAll')}
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => togglePerson(person.id)}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors',
                    distribute.includes(person.id)
                      ? 'border-primary bg-secondary text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {person.name}
                </button>
              ))}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {distribute.length ? t('web.distributeOn', { count: distribute.length }) : t('web.distributeOff')}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('web.queryPlaceholder')}
            // ⚠️ Enter = ძებნა (ღილაკის ტოლფასი); აკრეფისას ავტომატური ძებნა არასდროსაა
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (query.trim()) search.mutate()
              }
            }}
          />
          <Button
            type="button"
            onClick={() => search.mutate()}
            disabled={!query.trim() || search.isPending || available.length === 0}
          >
            {search.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {t('web.search')}
          </Button>
        </div>

        <WebSourcePicker
          engines={available}
          selected={selected}
          onChange={setEngines}
          quota={quota ?? (status ? { used: status.used, limit: status.limit, remaining: status.remaining } : null)}
          disabled={search.isPending}
        />

        {/* ⚠️ სამი მდგომარეობა და სამივე სხვადასხვა ტექსტია */}
        {offline.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <AlertTriangle className="size-3.5" />
            {t('web.sourceOffline', { engines: offline.join(', ') })}
          </p>
        )}
        {searched && items.length === 0 && dropped > 0 && (
          <p className="text-xs text-muted-foreground">{t('web.foundUnusable', { count: dropped })}</p>
        )}
        {searched && items.length === 0 && dropped === 0 && offline.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('web.nothingFound')}</p>
        )}

        {items.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPicked(allPicked ? new Set() : new Set(items.map(keyOf)))}
              >
                {allPicked ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                {t(allPicked ? 'photos.clear' : 'photos.selectAll')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('web.selected', { count: picked.size })}
              </span>
            </div>

            <div className="fb-scroll grid max-h-[45vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => {
                const key = keyOf(item)
                const on = picked.has(key)

                return (
                  <div
                    key={key}
                    className={cn(
                      'group relative overflow-hidden rounded-lg border bg-muted text-left transition-all',
                      on ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary/50',
                    )}
                  >
                    <button type="button" onClick={() => toggle(item)} className="block w-full cursor-pointer">
                      <span className="block aspect-square w-full overflow-hidden">
                        {/* ესკიზი სიისთვის, ორიგინალი ჩამოტვირთვისთვის (§7.6.5).
                            ⚠️ **ბლარი არსად** — შენი პირობა. */}
                        <img
                          src={item.thumbnail ?? item.original ?? ''}
                          alt={item.title ?? ''}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </span>
                      <span className="block space-y-0.5 p-1.5">
                        <span className="block truncate text-[11px] text-muted-foreground" title={item.title ?? ''}>
                          {item.domain ?? item.title ?? '—'}
                        </span>
                        <span className="block text-[10px] text-muted-foreground/80">
                          {item.engines.map((e) => engineName(available, e)).join(' · ')}
                          {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                          {item.license ? ` · ${item.license}` : ''}
                        </span>
                      </span>
                    </button>

                    {/* §8.4 — ხელით გადაწერა; ჩანს მხოლოდ განაწილების დროს */}
                    {distribute.length > 0 && on && (
                      <select
                        value={overrides[key] ?? AUTO}
                        onChange={(e) =>
                          setOverrides((cur) => ({ ...cur, [key]: e.target.value }))
                        }
                        className="w-full cursor-pointer border-t border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground outline-none focus:text-foreground"
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
                    )}

                    {on && (
                      <span className="absolute right-1.5 top-1.5 rounded bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                        ✓
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
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

/** ერთი ჩიპი — შეკითხვას ავსებს, ძებნას **არ** უშვებს (ბიუჯეტის წესი) */
function QueryChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      {label}
    </button>
  )
}

/** ერთეულის ვინაობა — ორიგინალი ლინკი (backend-იც ამით ცნობს დუბლს) */
function keyOf(item: SerpImage): string {
  return item.original ?? item.link ?? item.thumbnail ?? ''
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
