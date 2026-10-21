import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import {
  fetchGalleryPhotos,
  type GalleryPhotoFilters,
  type GallerySort,
} from '@/api/gallery'
import { PHOTO_PAGE_ALL, PHOTO_PAGE_DEFAULT } from '@/components/ui/photo-grid'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { GalleryPhotoGrid } from '@/components/gallery/GalleryPhotoGrid'
import { LockedPhotos } from '@/components/gallery/LockedPhotos'
import { SortPick } from '@/components/gallery/SortPick'
import { CutTabs } from '@/components/ui/cut-tabs'

/* ============================================================
   ერთი ჯგუფის შიგთავსი — **ერთი კომპონენტი ოთხივე ჭრილისთვის**.

   მსახიობის ჯგუფი, წყაროს ჯგუფი, მომწოდებლის ჯგუფი და ჩანაწერის ჯგუფი —
   ყველა ერთსა და იმავე endpoint-ს ეკითხება (`GET /gallery/photos`), მხოლოდ
   ფილტრი განსხვავდება. ოთხი ასლი ოთხნაირად დაითვლიდა გვერდებს.

   ⚠️ **lightbox მთელ ჯგუფს ხედავს და არა მიმდინარე გვერდს** —
   ბოლო სურათზე „შემდეგი" ახალ გვერდზე უნდა გადავიდეს.
   ============================================================ */

/** „ყველა" სერვერზე ჭერით მიდის — იხ. `GalleryController::MAX_PER_PAGE` */
const ALL_PER_PAGE = 1000

export function GroupPhotos({
  title,
  subtitle,
  /** მუდმივი ახსნა აიქონად — `subtitle` ცოცხალ ფაქტს რჩება */
  hint,
  filters,
  cacheKey,
  onBack,
  actions,
  showOwner,
  emptyText,
  onUnlock,
  categories,
}: {
  title: ReactNode
  subtitle?: ReactNode
  hint?: ReactNode
  /** `owner` · `from` · `provider` — რომელი ჯგუფია */
  filters: GalleryPhotoFilters
  /** ქეშის გასაღები — ფილტრის უნიკალური სახელი */
  cacheKey: string
  onBack?: () => void
  actions?: ReactNode
  showOwner?: boolean
  emptyText?: string
  /** ჩაკეტილ ალბომში „პაროლის შეყვანა" */
  onUnlock?: () => void
  /**
   * კადრი · პოსტერი · ლოგო · მსახიობი ჩანართები (`category` სერვერულ
   * ფილტრად), რიცხვებით მთელი ჯგუფიდან. ჩანაწერის გვერდსა და ბიბლიოთეკას ერთი კომპონენტი.
   */
  categories?: boolean
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(PHOTO_PAGE_DEFAULT)
  const [sort, setSort] = useState<GallerySort>('new')
  /* ⚠️ სიდი **ერთხელ იბადება** და გვერდებს შორის არ იცვლება: უამისოდ მე-2
     გვერდი პირველზე უკვე ნანახ ფოტოებს გამოიტანდა. */
  const [seed] = useState(() => Math.floor(Math.random() * 100000))
  const [category, setCategory] = useState<string>('all')
  const categoryFilter = categories && category !== 'all' ? { category } : {}

  const query = useQuery({
    queryKey: ['gallery-photos', cacheKey, category, page, perPage, sort, seed],
    queryFn: () =>
      fetchGalleryPhotos({
        ...filters,
        ...categoryFilter,
        sort,
        seed: sort === 'random' ? seed : undefined,
        page,
        per_page: perPage === PHOTO_PAGE_ALL ? ALL_PER_PAGE : perPage,
      }),
  })

  const allQ = useQuery({
    queryKey: ['gallery-photos', cacheKey, 'all', sort, seed],
    queryFn: () =>
      fetchGalleryPhotos({
        ...filters,
        sort,
        seed: sort === 'random' ? seed : undefined,
        per_page: ALL_PER_PAGE,
      }),
  })

  const meta = query.data?.meta

  /* ⚠️ **ჩაკეტილი ალბომი ცარიელი აღარაა — ის ბლარიან ფილებად იხატება**.
     ადრე სერვერი 423-ს აბრუნებდა და ბადე საერთოდ
     არ იხატებოდა; შენი მითითებით ახლა რიგები ჩანს (მხოლოდ `id` და
     ზომები), პაროლის ღილაკი კი აქვეა. */
  const locked = query.data && 'locked' in query.data ? query.data : null
  const photos = query.data && !('locked' in query.data) ? query.data.data : []
  const everything = allQ.data && !('locked' in allQ.data) ? allQ.data.data : undefined
  // ლაითბოქსი არჩეული ჩანართის ფოტოებს ფურცლავს, რიცხვები კი მთელი ჯგუფისაა
  const lightbox =
    everything && categories && category !== 'all'
      ? everything.filter((image) => !image.locked && image.category === category)
      : everything
  const present = (['backdrop', 'poster', 'logo', 'actor'] as const)
    .map((key) => ({ key, count: (everything ?? []).filter((image) => !image.locked && image.category === key).length }))
    .filter((entry) => entry.count > 0)

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {t('actions.back')}
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate font-display text-lg font-semibold">{title}</h2>
            {hint}
          </div>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <SortPick value={sort} onChange={(next) => { setSort(next); setPage(1) }} />
        {actions}
      </div>

      {categories && present.length > 1 && (
        <div className="mb-4">
          <CutTabs
            size="sm"
            layout="inline"
            options={[
              { key: 'all', label: t('filter.all'), count: everything?.length },
              ...present.map((entry) => ({ key: entry.key, label: t(`gallery.category.${entry.key}`), count: entry.count })),
            ]}
            value={category}
            onChange={(key) => {
              setCategory(key)
              setPage(1)
            }}
          />
        </div>
      )}

      {locked ? (
        <LockedPhotos photos={locked.data} total={locked.meta.total} onUnlock={onUnlock} />
      ) : query.isError ? (
        /* სერვერის ვარდნა ≠ „ფოტო ჯერ არ არის" */
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <GalleryPhotoGrid
          images={photos}
          lightboxImages={lightbox}
          loading={query.isLoading}
          showOwner={showOwner}
          emptyText={emptyText}
          pageSize={perPage}
          onPageSizeChange={(size) => {
            setPerPage(size)
            setPage(1)
          }}
          total={meta?.total}
        />
      )}

      {meta && meta.last_page > 1 && (
        // ნომრები; „მეტის ნახვა" ფოტოს ბადეში რაოდენობის არჩევაა
        <Pagination page={meta.page} lastPage={meta.last_page} total={meta.total} onPage={setPage} />
      )}
    </section>
  )
}
