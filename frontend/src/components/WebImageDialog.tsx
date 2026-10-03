import { useMemo, useRef, useState } from 'react'
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
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  WEB_MAX_PAGES,
  WEB_MAX_PHOTOS,
  importWebImages,
  notImported,
  WEB_IMPORT_CHUNK,
  searchWebImages,
  webSearchStatus,
  type SerpEngine,
  type SerpImage,
  type SerpImportResult,
  type SerpImportTarget,
  type SerpQuota,
  type SerpSearchResult,
  type SerpSource,
} from '@/api/web'
import type { CastMember } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { credentialShortName } from '@/lib/credentials'
import { errorMessage, isApiCode } from '@/lib/errors'
import type { MediaType } from '@/lib/media'
import { cn, formatBytes } from '@/lib/utils'
import { hasTerm, toggleTerm } from '@/lib/webQuery'
import { CastMemberDialog } from '@/components/CastMemberDialog'
import { CredentialMissingNotice } from '@/components/CredentialMissingNotice'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Pager } from '@/components/ui/pager'
import { PHOTO_PAGE_ALL, PHOTO_PAGE_DEFAULT, PhotoPageSizePick } from '@/components/ui/photo-grid'
import { StepSection } from '@/components/ui/step-section'
import { Label } from '@/components/ui/label'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'
import { WebSearchCost, WebSourcePicker } from '@/components/WebSourcePicker'

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
   ⚠️ **ნაბიჯის ნომერი გამომძახებელთანაა** (`STEP`), რადგან განაწილება
   მხოლოდ მაშინ არსებობს, როცა მასში ვინმე შეიძლება იყოს — ე.ი. „შედეგები"
   ხან მესამეა, ხან მეოთხე. ორ ადგილას დაწერილი ნომერი აუცილებლად გაშორდებოდა.

   ⚠️ **ცარიელი პასუხი `EmptyState`-ია და არა ნაცრისფერი წინადადება**, და
   „სცადე სხვა წყარო" **ღილაკებია**. ⚠️ ძებნას ისევ **მხოლოდ დაჭერა** უშვებს.

   ## §8.4 — ვის მიება ფოტო
   ⚠️ **წესი სერვერზეა ერთხელ** (სახელით დამთხვევა სათაურსა და ბმულში) —
   ე.ი. ტესტდება და ქართულ სახელსაც ცნობს. აქ მხოლოდ **არჩევანია**: ვის
   შორის დაანაწილოს და (სურვილისამებრ) თითო ფოტოს ხელით გადაწერა.

   ⚠️ **ხელით გადაწერა ნატიური `<select>`-ია** და არა Radix-ის — ის portal-ს
   არ საჭიროებს, ე.ი. მოდალის შიგნით z-index-ის და `pointer-events`-ის
   არცერთი ხაფანგი არ ეხება (იხ. `lib/layers.ts`-ის ისტორია).

   ## Tasks §19 (2026-09-27)
   ⚠️ **ჩიპები გადამრთველებია** (19.1, `lib/webQuery.ts`): შეკითხვაში უკვე
   მყოფი სახელი აქტიურია და დაჭერით ამოიღება; ველს „გასუფთავება" ცლის,
   ჩიპები კი რჩება. ⚠️ **ხარჯი სათაურის ზოლშია** (19.2) — ის მიმაგრებულია
   და შედეგების გადახვევისას არ ქრება. ⚠️ **„+ მსახიობი"** (19.3) იმავე
   `CastMemberDialog`-ს ხსნის, რასაც ჩანაწერის გვერდი; დამატებული ფილმის
   შემადგენლობაშიც ჩნდება (Q13) და აქ მაშინვე მონიშნულია. ⚠️ **„აჩვენე"
   უკვე ჩამოსულ შედეგებს ჰყოფს** (19.4) — ახალი ძებნის გარეშე; „კიდევ
   ჩამოიტანე" ახალი ძებნაა, ე.ი. ცალკე ღილაკია და ფასს თვითონ ამბობს.
   ⚠️ **„ყველას მონიშვნა" ყველა ჩამოსულს ნიშნავს** და არა მიმდინარე
   გვერდს (19.5) — შემოტანა კი ნაწილებად მიდის, ერთი პროგრესით (§4.3).
   ============================================================ */

/** კონტექსტი, საიდანაც შეკითხვა იწყება (§5.2) */
export interface WebImageContext {
  /** ჩანაწერის/მსახიობის სახელი — საწყისი შეკითხვა და პირველი ჩიპი */
  base: string
  /** ამ ჩანაწერის მსახიობები — ჩიპი შეკითხვას ავსებს **და** განაწილებაში მონაწილეობს */
  people?: { id: number; name: string }[]
  /** ვის მიება ჩამოწერილი ფოტო (ცხადად ეწერება) */
  attachesTo?: string
  /**
   * Tasks §19.3 — რომელ ჩანაწერს მიება განაწილებიდან დამატებული მსახიობი.
   * ⚠️ შემადგენლობა მხოლოდ მედია-დომენს აქვს; მის გარეშე „+ მსახიობი" არ
   * იხატება (წიგნს, თამაშს, ადგილს მსახიობი არ ჰყავს).
   */
  castRecord?: { type: MediaType; id: number }
  /** მსახიობი დაემატა — გამომძახებელმა ჩანაწერის შემადგენლობა ხელახლა წაიკითხოს */
  onCastAdded?: () => void
  /**
   * Tasks §22.2 — სწრაფი ჩიპები შეკითხვისთვის („პერსონაჟები", „ყდები"…): იგივე
   * გადამრთველები, რაც მსახიობებს, ოღონდ განაწილებაში არ მონაწილეობენ.
   */
  terms?: string[]
}

/** სენტინელი — „სერვერმა გადაწყვიტოს" */
const AUTO = 'auto'

/** Serper ერთ გვერდზე 100-მდე შედეგს აბრუნებს — backend-ის `SerperImages::PER_PAGE` */
const SERPER_PER_PAGE = 100

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
  const { can } = useAuth()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState(initialQuery)
  /** ⚠️ ბოლო **წარმატებული** ძებნის შეკითხვა — „კიდევ" მას აგრძელებს, ველს კი არა */
  const [lastQuery, setLastQuery] = useState('')
  const [engines, setEngines] = useState<string[]>([])
  /* ⚠️ **რაოდენობა და გვერდები ხელით შეიყვანება** (შენი მითითება, 2026-09-14).
     `limit` — სულ რამდენი ფოტო მინდა, `pages` — რამდენ გვერდს ვთხოვ წყაროს.
     **თითო გვერდი Serper-ის ერთი credit-ია**, ე.ი. ეს არჩევანი ფულს ხარჯავს.
     ⚠️ ნაგულისხმევი მცირეა განზრახ: „50 გვერდი" ერთი დაჭერით 50 credit-ია. */
  const [limit, setLimit] = useState(100)
  const [pages, setPages] = useState(5)
  const [items, setItems] = useState<SerpImage[]>([])
  const [sources, setSources] = useState<SerpSource[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [quota, setQuota] = useState<SerpQuota | null>(null)
  const [searched, setSearched] = useState(false)
  /** §19.4 — რამდენი ჩანს ერთ გვერდზე (`0` = ყველა) და რომელი გვერდია */
  const [pageSize, setPageSize] = useState(PHOTO_PAGE_DEFAULT)
  const [page, setPage] = useState(1)

  /** §8.4 — რომელ მსახიობებზე ნაწილდება */
  const [distribute, setDistribute] = useState<number[]>([])
  /** ფოტოს გასაღები → ხელით არჩეული მსახიობი (`AUTO` = სერვერის გადაწყვეტილება) */
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  /** §19.3 — აქვე დამატებული მსახიობები (ჩანაწერის ხელახალ წაკითხვამდე) */
  const [added, setAdded] = useState<{ id: number; name: string }[]>([])
  const [castOpen, setCastOpen] = useState(false)
  /**
   * ბოლო იმპორტის შედეგი — **ეკრანზე რჩება** და არა მხოლოდ ტოსტში.
   *
   * ⚠️ „ჩამოიწერა 0 · ჩავარდა 6" ზუსტად ის პასუხია, რომელსაც „ვებიდან
   * არაფერი შედის" ითხოვს: hotlink-ის დაცვა ჩვეულებრივი ამბავია და
   * `failed` შეცდომა არ არის — მაგრამ თუ ეს რიცხვი ტოსტთან ერთად ქრება,
   * მიზეზი მოსახერხებელ დროს ვეღარ იკითხება.
   */
  const [result, setResult] = useState<SerpImportResult | null>(null)

  /* ⚠️ **ჩანაწერის მსახიობები + აქვე დამატებულები, id-ით გაერთიანებული** —
     ჩანაწერის ხელახალი წაკითხვის შემდეგ დამატებული ორივე სიაში იქნება და
     ორჯერ არ უნდა დაიხატოს. */
  const people = useMemo(() => {
    const out = [...(context?.people ?? [])]
    for (const person of added) if (!out.some((p) => p.id === person.id)) out.push(person)
    return out
  }, [context?.people, added])

  const castRecord = context?.castRecord
  /** ⚠️ მიბმა ჩანაწერის რედაქტირებაა — `update` უფლებას ითხოვს (`RecordCastController`-ის წესი) */
  const canAddCast = !!castRecord && can(castRecord.type, 'update')

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
   * §19.2 — Serper-ის credit-ების **ჭერი** ამ ძებნაზე: backend-იც ზუსტად ასე
   * ჭრის (`min(pages, ceil(limit / 100))`), ე.ი. ზედმეტ გვერდს არ ყიდულობს.
   */
  const credits = pagedSelected
    ? Math.min(clampNum(pages, 1, WEB_MAX_PAGES, 1), Math.ceil(clampNum(limit, 1, WEB_MAX_PHOTOS, 100) / SERPER_PER_PAGE))
    : 0
  const shownQuota =
    quota ?? (status ? { used: status.used, limit: status.limit, remaining: status.remaining } : null)

  /** ტოსტის ტექსტი — რა დაიხარჯა მართლა (SerpApi-ის ძებნა და Serper-ის credit ცალ-ცალკე) */
  const spendLine = (data: SerpSearchResult<SerpImage>) => {
    const serperCredits = data.sources.reduce((sum, s) => sum + (s.credits ?? 0), 0)
    const parts = [
      data.spent > 0 ? t('web.spent', { count: data.spent }) : null,
      serperCredits > 0 ? t('web.spentCredits', { count: serperCredits }) : null,
    ].filter(Boolean)

    if (parts.length) return parts.join(' · ')
    // ⚠️ „ქეშიდან" მხოლოდ მაშინ, როცა მართლა ქეშიდანაა — უფასო წყაროც „არაფერი დახარჯულა"-ა
    return data.sources.length && data.sources.every((s) => s.cached) ? t('web.fromCache') : t('web.spentNothing')
  }

  /**
   * ⚠️ ძებნა **პარამეტრს იღებს** და არა მხოლოდ `selected`-ს: „ძებნა
   * Google-ით" ღილაკი წყაროსაც ცვლის და მაშინვე ეძებს, `setEngines()`-ის
   * შედეგი კი ამავე რენდერში ჯერ არ ჩანს — არჩევანის გადაცემის გარეშე
   * ძველი წყაროთი მოიძებნებოდა და ერთი ძებნა ტყუილად დაიხარჯებოდა.
   */
  const search = useMutation({
    mutationFn: (vars: { q: string; engines?: string[] }) =>
      searchWebImages({
        query: vars.q,
        engines: vars.engines ?? selected,
        limit: clampNum(limit, 1, WEB_MAX_PHOTOS, 100),
        pages: clampNum(pages, 1, WEB_MAX_PAGES, 1),
      }),
    onSuccess: (data, vars) => {
      setItems(data.items)
      setSources(data.sources)
      setQuota(data.quota)
      setLastQuery(vars.q)
      setPicked(new Set())
      setOverrides({})
      setResult(null)
      setSearched(true)
      setPage(1)
      // ⚠️ ხარჯი ცხადად ითქვას — ქეშიდან მოსული ძებნა უფასოა და ესეც უნდა ჩანდეს
      toast({ title: spendLine(data), variant: data.items.length ? 'success' : 'info' })
      qc.invalidateQueries({ queryKey: ['web', 'status'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const runSearch = (override?: string[]) => {
    const q = query.trim()
    if (q) search.mutate({ q, engines: override })
  }

  /** §19.4 — ვისაც გაგრძელება აქვს (Serper — შემდეგი გვერდი, Commons — offset) */
  const continuable = sources.filter((s) => s.next != null)
  const moreCredits = continuable.some((s) => engineOf(available, s.engine)?.paged) ? 1 : 0

  /**
   * „კიდევ ჩამოიტანე" — **ახალი ძებნაა**, ოღონდ მხოლოდ ახალი ნაწილისა.
   *
   * ⚠️ backend-ი მხოლოდ იმ წყაროებს უშვებს, ვისაც `next` ჰქონდა, და Serper-ზე
   * **მხოლოდ შემდეგ გვერდს** ყიდულობს — უფრო დიდი `limit`-ით ხელახალი ძებნა
   * უკვე ნაყიდ გვერდებს თავიდან დახარჯავდა. ⚠️ შეკითხვა **ბოლო ძებნისაა**,
   * ველისა კი არა: შეცვლილი ველი ძველ შედეგებს სხვა შეკითხვის შედეგებს
   * შეურევდა.
   */
  const more = useMutation({
    mutationFn: () =>
      searchWebImages({
        query: lastQuery,
        cursor: Object.fromEntries(continuable.map((s) => [s.engine, s.next as number])),
        limit: SERPER_PER_PAGE,
        pages: 1,
      }),
    onSuccess: (data) => {
      const before = items.length
      const merged = mergeImages(items, data.items)

      setItems(merged)
      setSources((cur) => mergeSources(cur, data.sources))
      setQuota(data.quota)
      // ⚠️ ახალი ფოტოები იქ ჩანს, სადაც იწყება — თორემ „კიდევ" ეკრანზე არაფერს ცვლიდა
      if (pageSize !== PHOTO_PAGE_ALL && merged.length > before) setPage(Math.floor(before / pageSize) + 1)

      toast({
        title: merged.length > before ? t('web.moreFound', { count: merged.length - before }) : t('web.moreNothing'),
        description: spendLine(data),
        variant: merged.length > before ? 'success' : 'info',
      })
      qc.invalidateQueries({ queryKey: ['web', 'status'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** Tasks §4.3 — ნაწილებად შემოტანის ერთი პროგრესი (`null` = არ მიმდინარეობს) */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const importing = useMutation({
    mutationFn: () =>
      importWebImages(
        {
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
        },
        (done, total) => setProgress({ done, total }),
      ),
    onSettled: () => setProgress(null),
    onSuccess: (res) => {
      setResult(res)
      const missed = notImported(res, picked.size)
      toast({
        title: t('web.imported', { count: res.added }),
        description: [
          // ⚠️ კვოტამ შუაში გააჩერა — რამდენი შემოვიდა და რამდენი არა, ორივე ითქვას
          res.quota_exceeded && missed > 0 ? t('web.importQuotaStopped', { count: missed }) : null,
          // §8.4 — სად წავიდა: „ჰელენა 3 · ფილმი 7"
          assignedLine(res.assigned, people, context?.attachesTo, t),
          res.thumbnails > 0 ? t('web.importedThumbnails', { count: res.thumbnails }) : null,
          res.failed > 0 ? t('web.importFailed', { count: res.failed }) : null,
          res.skipped > 0 ? t('web.importSkipped', { count: res.skipped }) : null,
          res.bytes > 0 ? formatBytes(res.bytes) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        variant: res.quota_exceeded ? 'error' : res.added > 0 ? 'success' : 'info',
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

  /** §19.3 — დამატებული მსახიობი სიაში **მაშინვე მონიშნულია** */
  const onCastAdded = (member: CastMember) => {
    setAdded((cur) => (cur.some((p) => p.id === member.id) ? cur : [...cur, { id: member.id, name: member.name }]))
    setDistribute((cur) => (cur.includes(member.id) ? cur : [...cur, member.id]))
    context?.onCastAdded?.()
  }

  const allPicked = items.length > 0 && picked.size === items.length

  /** §19.4 — მიმდინარე გვერდი უკვე ჩამოსული შედეგებიდან (ახალი ძებნის გარეშე) */
  const lastPage = pageSize === PHOTO_PAGE_ALL ? 1 : Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, lastPage)
  const shown =
    pageSize === PHOTO_PAGE_ALL ? items : items.slice((current - 1) * pageSize, current * pageSize)

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
  const hasDistribute = people.length > 0 || canAddCast
  const STEP = { query: 1, sources: 2, distribute: 3, results: hasDistribute ? 4 : 3 }

  /* Tasks §30.6 — რომელ ფასიან წყაროს აკლია **ჩემი** გასაღები. ⚠️ სიიდან ისინი
     უბრალოდ ქრებიან, ე.ი. ამის თქმის გარეშე უცნობი დარჩებოდა, რატომ ჩანს
     მხოლოდ Wikimedia და სად უნდა ჩაიწეროს გასაღები. */
  const missingKeys = status?.missing ?? []

  // ⚠️ **„გასაღები არ არის" ≠ „ვებძებნა არ მუშაობს"** — უფასო კატალოგი რჩება
  if (!statusLoading && status && available.length === 0) {
    return (
      <ModalShell title={title} onClose={onClose} wide>
        {missingKeys.length ? (
          <CredentialMissingNotice provider={missingKeys[0]} className="mt-4" />
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t('errors.serpapi_unavailable')}</p>
        )}
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </ModalFooter>
      </ModalShell>
    )
  }

  const busy = search.isPending || more.isPending

  return (
    <>
      <ModalShell
        title={title}
        onClose={onClose}
        wide
        aside={<WebSearchCost engines={available} selected={selected} quota={shownQuota} credits={credits} />}
      >
        <div className="mt-5 space-y-3">
          {/* ---------- 1. რას ვეძებთ (შეკითხვა + კონტექსტის ჩიპები, §5.2) ---------- */}
          <StepSection step={STEP.query} title={t('web.stepQuery')}>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('web.queryPlaceholder')}
                // ⚠️ Enter = ძებნა (ღილაკის ტოლფასი); აკრეფისას ავტომატური ძებნა არასდროსაა
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runSearch()
                  }
                }}
              />
              {/* §19.1 — ველი იცლება, ჩიპები რჩება; ფოკუსი ველში ბრუნდება */}
              <Button
                type="button"
                variant="ghost"
                disabled={!query}
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
              >
                <X className="size-4" />
                {t('actions.clear')}
              </Button>
              <Button
                type="button"
                onClick={() => runSearch()}
                disabled={!query.trim() || busy || available.length === 0}
              >
                {search.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {t('web.search')}
              </Button>
            </div>

            {context && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">{t('web.contextAdd')}</p>
                <ChipRow>
                  {/* ⚠️ ჩანაწერის სახელი **თავში** ჯდება — ის შეკითხვის საფუძველია */}
                  <QueryChip
                    label={context.base}
                    active={hasTerm(query, context.base)}
                    onClick={() => setQuery((cur) => toggleTerm(cur, context.base, 'start'))}
                  />
                  {people.map((person) => (
                    <QueryChip
                      key={person.id}
                      label={person.name}
                      active={hasTerm(query, person.name)}
                      // ⚠️ „ფილმი + მსახიობი" სწორედ ის შეკითხვაა, რომელსაც §5.2 ითხოვს
                      onClick={() => setQuery((cur) => toggleTerm(cur, person.name, 'end'))}
                    />
                  ))}
                  {/* §22.2 — თემატური ჩიპები (წიგნის პერსონაჟები, ყდები…) */}
                  {(context.terms ?? []).map((term) => (
                    <QueryChip
                      key={term}
                      label={term}
                      active={hasTerm(query, term)}
                      onClick={() => setQuery((cur) => toggleTerm(cur, term, 'end'))}
                    />
                  ))}
                </ChipRow>
              </div>
            )}
          </StepSection>

          {/* ---------- 2. სად ვეძებთ ---------- */}
          <StepSection step={STEP.sources} title={t('web.stepSources')}>
            <WebSourcePicker engines={available} selected={selected} onChange={setEngines} disabled={busy} />

            {missingKeys.length > 0 && (
              <CredentialMissingNotice provider={missingKeys[0]} className="mt-3">
                {t('web.missingKeys', { names: missingKeys.map(credentialShortName).join(', ') })}
              </CredentialMissingNotice>
            )}

            {/* ⚠️ **ხელით შესაყვანი ორი რიცხვი** — ჩაშენებული 40 აღარაა.
                „გვერდები" მხოლოდ იმ წყაროს ეხება, რომელსაც ისინი აქვს (Serper);
                დანარჩენებზე ველი გამორთულია, რომ ცრუ დაპირება არ იყოს. */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="web-limit" className="flex items-center gap-1.5">
                  {t('web.limitLabel')} <InfoHint info={t('web.limitHint', { max: WEB_MAX_PHOTOS })} />
                </Label>
                <Input
                  id="web-limit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={WEB_MAX_PHOTOS}
                  value={limit}
                  disabled={busy}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </div>

              <div>
                {/* ⚠️ „თითო გვერდი ერთი კრედიტია" ეკრანზე უნდა ეწეროს (Tasks DEBT-17) */}
                <Label htmlFor="web-pages" className="inline-flex items-center gap-1">
                  {t('web.pagesLabel')}
                  {pagedSelected && <InfoHint critical={t('web.pagesCostWarn')} />}
                </Label>
                <Input
                  id="web-pages"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={WEB_MAX_PAGES}
                  value={pages}
                  disabled={busy || !pagedSelected}
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
                <>
                  {/* §19.3 — ჩანაწერის შემადგენლობას ემატება (Q13) */}
                  {canAddCast && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setCastOpen(true)}>
                      <UserPlus className="size-4" />
                      {t('cast.add')}
                    </Button>
                  )}
                  {people.length > 0 && (
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
                  )}
                </>
              }
            >
              {people.length > 0 ? (
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
              ) : (
                <p className="text-xs text-muted-foreground">{t('web.distributeNoCast')}</p>
              )}
            </StepSection>
          )}

          {/* ---------- 4. შედეგები ---------- */}
          <StepSection
            step={STEP.results}
            title={t('web.stepResults')}
            status={items.length > 0 ? t('web.found', { count: items.length }) : undefined}
            action={
              items.length > 0 ? (
                <>
                  {/* §19.4 — „აჩვენე" უკვე ჩამოსულს ჰყოფს და ახალ ძებნას არ უშვებს */}
                  <PhotoPageSizePick
                    value={pageSize}
                    total={items.length}
                    onChange={(size) => {
                      setPageSize(size)
                      setPage(1)
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{t('web.selected', { count: picked.size })}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPicked(allPicked ? new Set() : new Set(items.map(keyOf)))}
                  >
                    {allPicked ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                    {/* ⚠️ §19.5 — **ყველა ჩამოსული** და არა მიმდინარე გვერდი: რიცხვი ამას ამბობს */}
                    {allPicked ? t('photos.clear') : t('web.selectAllCount', { count: items.length })}
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
                          disabled={busy}
                          onClick={() => {
                            setEngines([engine.key])
                            runSearch([engine.key])
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
                {shown.map((item) => {
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
                              Google-ის ესკიზები (`encrypted-tbn0.gstatic.com`) მონიშნულ
                              სურათებზე **თვითონ მოდის დაბუნდოვნებული** — ეს ჩვენი CSS
                              არასდროს ყოფილა. ⚠️ `onError` **აუცილებელია**: hotlink-ის
                              დაცვა ჩვეულებრივი ამბავია — მის გარეშე ბადეში ტეხილი
                              სურათები გამოჩნდებოდა. */}
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

            {items.length > 0 && lastPage > 1 && (
              <Pager className="mt-4" page={current} lastPage={lastPage} total={items.length} onChange={setPage} />
            )}

            {/* §19.4 — ახალი ძებნა, ე.ი. ცალკე ღილაკი, რომელიც ფასს თვითონ ამბობს */}
            {items.length > 0 && continuable.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => more.mutate()}>
                  {more.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {t('web.fetchMore')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {moreCredits > 0 ? t('web.costSerper', { count: moreCredits }) : t('web.moreFree')}
                </span>
              </div>
            )}
          </StepSection>
        </div>

        <ModalFooter>
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
            {progress && progress.total > WEB_IMPORT_CHUNK
              ? t('web.importProgress', { done: progress.done, total: progress.total })
              : t('web.download', { count: picked.size })}
          </Button>
        </ModalFooter>
      </ModalShell>

      {/* ⚠️ **ჩადგმული მოდალია** — `ModalShell`-ის დასტა ამ ფანჯარას მალავს
          (მონტირებულს ტოვებს) და დახურვაზე უკან აბრუნებს; შედეგები ადგილზეა. */}
      {castOpen && castRecord && (
        <CastMemberDialog
          type={castRecord.type}
          recordId={castRecord.id}
          onClose={() => setCastOpen(false)}
          onAdded={onCastAdded}
        />
      )}
    </>
  )
}

/**
 * შეკითხვის ჩიპი (§19.1) — არააქტიური „+"-ით ამატებს, აქტიური ჯვრით ამოიღებს.
 * ⚠️ ჯვარი ნიშანია და არა ცალკე ღილაკი (`Chip`-ის `remove`) — ჩიპი თვითონაა ღილაკი.
 */
function QueryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Chip active={active} remove={active} icon={active ? undefined : <Plus className="size-3" />} onClick={onClick}>
      {label}
    </Chip>
  )
}

/** ერთეულის ვინაობა — ორიგინალი ლინკი (backend-იც ამით ცნობს დუბლს) */
function keyOf(item: SerpImage): string {
  return item.original ?? item.link ?? item.thumbnail ?? ''
}

/**
 * „კიდევ"-ის პასუხის შერწყმა (§19.4) — **დუბლი ერთდება** და მისი წყაროები
 * ერთ სიაში იკრიბება (სერვერის `search()`-ის იგივე წესი, ოღონდ ნაწილებს შორის).
 */
function mergeImages(current: SerpImage[], incoming: SerpImage[]): SerpImage[] {
  const out = [...current]
  const index = new Map(out.map((item, i) => [keyOf(item), i]))

  for (const item of incoming) {
    const at = index.get(keyOf(item))
    if (at === undefined) {
      index.set(keyOf(item), out.length)
      out.push(item)
    } else {
      out[at] = { ...out[at], engines: [...new Set([...out[at].engines, ...item.engines])] }
    }
  }

  return out
}

/** წყაროების მრიცხველები ნაწილებს შორის ჯამდება; `next` კი ახალ პასუხს ეკუთვნის */
function mergeSources(current: SerpSource[], incoming: SerpSource[]): SerpSource[] {
  const out = [...current]

  for (const row of incoming) {
    const at = out.findIndex((s) => s.engine === row.engine)
    if (at === -1) {
      out.push(row)
      continue
    }
    const prev = out[at]
    out[at] = {
      ...row,
      count: prev.count + row.count,
      dropped: prev.dropped + row.dropped,
      credits: (prev.credits ?? 0) + (row.credits ?? 0),
    }
  }

  return out
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

function engineOf(engines: SerpEngine[], key: string): SerpEngine | undefined {
  return engines.find((e) => e.key === key)
}

function engineName(engines: SerpEngine[], key: string): string {
  return engineOf(engines, key)?.name ?? key
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
