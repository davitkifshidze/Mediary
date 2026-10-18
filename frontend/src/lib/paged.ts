import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useInfiniteQuery, type QueryKey } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { PaginationProps } from '@/components/ui/pagination'

/* ============================================================
   სიების გვერდებად დაყოფა — ფრონტის მხარე.

   ⚠️ **მოდელი: „გვერდი 10 ჩანაწერით + მეტის ჩვენება"**. სერვერს თითო
   გვერდი ცალკე ეთხოვება (`page` + `per_page=10`), „მეტის ჩვენება" **შემდეგ
   გვერდს** ითხოვს და ქვემოთ უმატებს (`useInfiniteQuery`). ⚠️ ადრე იზრდებოდა
   `per_page` (60 → 120 → …), ბექენდი კი მას 500-ზე ჭრის — 500-ის შემდეგ ღილაკი
   ჩანდა და არაფერს აკეთებდა. ახლა ყოველი მოთხოვნა 10-ია და ჭერი ვერ შეგვხვდება.

   ⚠️ **მიმდინარე გვერდი მისამართშია** (`?page=`, `usePagedList`) — ჩანაწერის
   გახსნის შემდეგ „უკან" იმავე გვერდზე აბრუნებს; ნომერზე დაჭერა ისტორიაში
   ახალი ნაბიჯია, „მეტის ჩვენება" კი ნომერს ადგილზე ცვლის. ფილტრის შეცვლა
   (ძებნა, დალაგება, პანელი) პირველ გვერდზე აბრუნებს. ჩადგმული სია
   (დიალოგი, ჭრილი) მისამართს არ ეხება — `usePages`.

   ⚠️ **ხელით დალაგებული სია გვერდებად არ იყოფა**: ჩანაწერი
   გვერდებს შორის ვერ გადაიტანება, ამიტომ ფლეილისტები ერთ სიად რჩება.
   ============================================================ */

/** გვერდის ზომა — ფიქსირებული */
export const LIST_PAGE_SIZE = 10

/** სიის query-პარამეტრები — ყველა მოდულის `Filters` ამას აფართოებს */
export interface ListParams {
  /** გვერდის ნომერი (1-დან) */
  page?: number
  /** რამდენი ჩანაწერი გვერდზე — `LIST_PAGE_SIZE` */
  per_page?: number
  /**
   * ⚠️ **მთელი სია.** მხოლოდ ოთხ გამომძახებელს სჭირდება — `/purge`-ის რიგს,
   * მასობრივ ცვლილებას, ჩანაწერების ამრჩევს და პლეილისტის ავზს. ბადეზე
   * მისი გამოყენება ზუსტად იმ პრობლემას აბრუნებს, რომლისთვისაც ეს დაიწერა.
   */
  all?: boolean
}

export interface Page<T> {
  items: T[]
  /** **გაფილტრული სიის** ჯამი და არა გვერდისა */
  total: number
  /** ბოლო გვერდის ნომერი (`meta.last_page`); მთელ სიაზე — 1 */
  lastPage: number
}

interface ListPayload<T> {
  data?: T[]
  meta?: { total?: number; last_page?: number }
}

/**
 * `{data, meta}` და `{data}` ერთი წაკითხვით.
 *
 * ⚠️ `all=1`-ზე ბექენდი **`meta`-ს არ აბრუნებს** (მთელი სია გვერდი არაა),
 * ამიტომ ჯამი იქ თვითონ სიის სიგრძეა, გვერდი კი ერთი.
 */
export function readPage<T>(payload: ListPayload<T>): Page<T> {
  const items = payload?.data ?? []

  return {
    items,
    total: payload?.meta?.total ?? items.length,
    lastPage: Math.max(1, payload?.meta?.last_page ?? 1),
  }
}

/** გვერდის ჩანაწერის ტიპი — `fetchPage`-ის პასუხიდან გამოიყვანება */
type ItemOf<P> = P extends Page<infer T> ? T : never

export interface PagedList<T, P = Page<T>> {
  items: T[]
  total: number
  isLoading: boolean
  isFetching: boolean
  /** პირველი ჩატვირთული გვერდის სრული პასუხი — ფასეტები, ფილტრის ვარიანტები (მსახიობები) */
  first: P | undefined
  /** `<Pagination {...list.pagination} />` */
  pagination: PaginationProps
}

interface PagedOptions<P> {
  /** ფილტრებიანი გასაღები — მისი ცვლილება პირველ გვერდზე აბრუნებს */
  queryKey: QueryKey
  fetchPage: (page: number) => Promise<P>
  enabled?: boolean
  /** ფოკუსზე ხელახლა კითხვა (გაზიარების გვერდი მას თიშავს — ყველა ჩატვირთული გვერდი ხელახლა მოვიდოდა) */
  refetchOnWindowFocus?: boolean
  /**
   * პირველი გვერდი უკვე ხელთაა (ურნის ჯამური სია თითო ჯგუფის პირველ 10-ს შეიცავს) — მოთხოვნა
   * მხოლოდ შემდეგ გვერდებზე მიდის. ⚠️ `staleTime: Infinity` — თორემ მონტაჟზევე ხელახლა მოითხოვდა;
   * `invalidateQueries` მას მაინც განაახლებს.
   */
  initial?: P
}

/** საერთო ნაწილი: `start`-იდან ჩატვირთული გვერდები და „მეტის ჩვენება" */
function usePageRange<P extends Page<unknown>>(
  { queryKey, fetchPage, enabled = true, refetchOnWindowFocus, initial }: PagedOptions<P>,
  start: number,
  goTo: (page: number, replace?: boolean) => void,
  onMore: (page: number) => void,
): PagedList<ItemOf<P>, P> {
  const query = useInfiniteQuery({
    queryKey: [...queryKey, 'from', start],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: start,
    getNextPageParam: (last, _all, param) => (param < last.lastPage ? param + 1 : undefined),
    // ⚠️ ფილტრის/გვერდის შეცვლაზე ძველი სია ჩანს, სანამ ახალი მოვა — ბადე არ იცლება
    placeholderData: keepPreviousData,
    enabled,
    ...(refetchOnWindowFocus === undefined ? {} : { refetchOnWindowFocus }),
    ...(initial && start === 1 ? { initialData: { pages: [initial], pageParams: [1] }, staleTime: Infinity } : {}),
  })

  const pages = query.data?.pages
  const params = query.data?.pageParams as number[] | undefined
  const from = params?.[0] ?? start
  const page = params?.[params.length - 1] ?? start
  const lastPage = Math.max(1, pages?.[pages.length - 1]?.lastPage ?? 1)
  const total = pages?.[pages.length - 1]?.total ?? 0
  const items = useMemo(() => (pages ?? []).flatMap((p) => p.items) as ItemOf<P>[], [pages])

  /* გვერდი, რომელიც აღარ არსებობს (`?page=50` სამგვერდიან სიაზე, ან ბოლო
     გვერდის ბოლო ჩანაწერი წაიშალა) — ბოლო არსებულზე გადავდივართ */
  const settled = query.isSuccess && !query.isFetching && !query.isPlaceholderData
  useEffect(() => {
    if (settled && from > lastPage) goTo(lastPage, true)
  }, [settled, from, lastPage, goTo])

  const { fetchNextPage, isFetchingNextPage } = query
  const more = useCallback(() => {
    // ⚠️ ჩავარდნილ მოთხოვნაზე ნომერი მისამართში არ წინდება — გვერდი ხომ არ ჩამოვიდა
    void fetchNextPage().then((result) => {
      if (!result.isError) onMore(page + 1)
    })
  }, [fetchNextPage, onMore, page])

  return {
    items,
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    first: pages?.[0],
    pagination: {
      page,
      from,
      lastPage,
      total,
      onPage: (p) => goTo(p),
      onMore: more,
      moreLoading: isFetchingNextPage,
    },
  }
}

/** გვერდის თავში — ნომერზე დაჭერისას სია თავიდან უნდა ჩანდეს */
function scrollTop() {
  document.scrollingElement?.scrollTo?.({ top: 0, behavior: 'smooth' })
}

/**
 * **მთავარი სია** — მიმდინარე გვერდი `?page=`-შია.
 *
 * ⚠️ ფილტრის შეცვლისას მისამართში ძველი `page` შეიძლება დარჩეს (პანელი
 * არსებულ პარამეტრებს აკოპირებს) — ასეთი გვერდი პირველზე ბრუნდება. „უკან"
 * კი, რომელიც ფილტრსაც და გვერდსაც ერთად ცვლის, მისამართის გვერდს იღებს.
 */
export function usePagedList<P extends Page<unknown>>(options: PagedOptions<P>): PagedList<ItemOf<P>, P> {
  const [params, setParams] = useSearchParams()
  const urlPage = Math.max(1, Math.floor(Number(params.get('page'))) || 1)
  const key = JSON.stringify(options.queryKey)

  const [range, setRange] = useState({ key, start: urlPage })
  const seen = useRef({ key, url: urlPage })
  /** ჩვენი ჩაწერილი გვერდი — მისამართის ცვლილებაზე დიაპაზონი თავიდან არ დაიწყოს */
  const own = useRef<number | null>(null)

  const write = useCallback(
    (page: number, replace: boolean) => {
      own.current = page
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (page > 1) next.set('page', String(page))
          else next.delete('page')
          return next
        },
        { replace },
      )
    },
    [setParams],
  )

  useEffect(() => {
    const was = seen.current
    seen.current = { key, url: urlPage }

    if (own.current === urlPage && was.key === key) {
      own.current = null
      return
    }
    own.current = null

    // ფილტრი შეიცვალა, გვერდი კი ძველია — თავიდან
    if (was.key !== key && was.url === urlPage && urlPage > 1) {
      setRange({ key, start: 1 })
      write(1, true)
      return
    }
    setRange({ key, start: urlPage })
  }, [key, urlPage, write])

  // ⚠️ გარდამავალ რენდერზე (ფილტრი უკვე ახალია, ეფექტი ჯერ არ გაშვებულა) — იგივე წესი
  const start = range.key === key ? range.start : seen.current.url === urlPage ? 1 : urlPage

  const goTo = useCallback(
    (page: number, replace = false) => {
      setRange({ key, start: page })
      write(page, replace)
      if (!replace) scrollTop()
    },
    [key, write],
  )
  const onMore = useCallback((page: number) => write(page, true), [write])

  return usePageRange(options, start, goTo, onMore)
}

/** **ჩადგმული სია** (დიალოგი, ჭრილი, საჯარო გვერდის ბლოკი) — გვერდი მისამართს არ ეხება */
export function usePages<P extends Page<unknown>>(options: PagedOptions<P>): PagedList<ItemOf<P>, P> {
  const key = JSON.stringify(options.queryKey)
  const [range, setRange] = useState({ key, start: 1 })
  const start = range.key === key ? range.start : 1

  const goTo = useCallback((page: number) => setRange({ key, start: page }), [key])
  const onMore = useCallback(() => {}, [])

  return usePageRange(options, start, goTo, onMore)
}

/**
 * **ბრაუზერში მყოფი სია** (ცხრილი, ვებძებნის შედეგები, ფოტოს ბადე) — იგივე ნომრები და
 * „მეტის ჩვენება", ოღონდ მოთხოვნის გარეშე: ნაჩვენებია `from…to` გვერდები. `size` 0 —
 * ყველა ერთად (ნომრების გარეშე). სიის შემცირებისას დიაპაზონი ბოლო გვერდზე ჩამოდის.
 */
export function useClientPages<T>(items: readonly T[], size: number) {
  const [range, setRange] = useState({ from: 1, to: 1 })
  const lastPage = size > 0 ? Math.max(1, Math.ceil(items.length / size)) : 1
  const from = Math.min(range.from, lastPage)
  const to = Math.min(Math.max(range.to, from), lastPage)

  const shown = useMemo(() => (size > 0 ? items.slice((from - 1) * size, to * size) : [...items]), [items, size, from, to])

  const pagination: PaginationProps = {
    page: to,
    from,
    lastPage,
    total: items.length,
    onPage: (page) => setRange({ from: page, to: page }),
    onMore: () => setRange({ from, to: Math.min(lastPage, to + 1) }),
  }

  /** ფილტრის/ზომის შეცვლაზე — პირველი გვერდი */
  const reset = useCallback(() => setRange({ from: 1, to: 1 }), [])

  return { shown, pagination, reset, from }
}
