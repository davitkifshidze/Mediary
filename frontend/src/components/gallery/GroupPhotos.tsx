import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  fetchGalleryPhotos,
  type GalleryPhotoFilters,
  type GallerySort,
} from '@/api/gallery'
import { PHOTO_PAGE_ALL, PHOTO_PAGE_DEFAULT } from '@/components/ui/photo-grid'
import { Button } from '@/components/ui/button'
import { GalleryPhotoGrid } from '@/components/gallery/GalleryPhotoGrid'
import { SortPick } from '@/components/gallery/SortPick'

/* ============================================================
   ერთი ჯგუფის შიგთავსი — **ერთი კომპონენტი ოთხივე ჭრილისთვის** (§8.5).

   მსახიობის ჯგუფი, წყაროს ჯგუფი, მომწოდებლის ჯგუფი და ჩანაწერის ჯგუფი —
   ყველა ერთსა და იმავე endpoint-ს ეკითხება (`GET /gallery/photos`), მხოლოდ
   ფილტრი განსხვავდება. ოთხი ასლი ოთხნაირად დაითვლიდა გვერდებს.

   ⚠️ **lightbox მთელ ჯგუფს ხედავს და არა მიმდინარე გვერდს** (§3.7) —
   ბოლო სურათზე „შემდეგი" ახალ გვერდზე უნდა გადავიდეს.
   ============================================================ */

/** „ყველა" სერვერზე ჭერით მიდის — იხ. `GalleryController::MAX_PER_PAGE` */
const ALL_PER_PAGE = 1000

export function GroupPhotos({
  title,
  subtitle,
  /** მუდმივი ახსნა აიქონად — `subtitle` ცოცხალ ფაქტს რჩება (Tasks §3) */
  hint,
  filters,
  cacheKey,
  onBack,
  actions,
  showOwner,
  emptyText,
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
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(PHOTO_PAGE_DEFAULT)
  const [sort, setSort] = useState<GallerySort>('new')
  /* ⚠️ სიდი **ერთხელ იბადება** და გვერდებს შორის არ იცვლება: უამისოდ მე-2
     გვერდი პირველზე უკვე ნანახ ფოტოებს გამოიტანდა. */
  const [seed] = useState(() => Math.floor(Math.random() * 100000))

  const query = useQuery({
    queryKey: ['gallery-photos', cacheKey, page, perPage, sort, seed],
    queryFn: () =>
      fetchGalleryPhotos({
        ...filters,
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

      <GalleryPhotoGrid
        images={query.data?.data ?? []}
        lightboxImages={allQ.data?.data}
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

      {meta && meta.last_page > 1 && (
        <Pager page={meta.page} lastPage={meta.last_page} total={meta.total} onChange={setPage} />
      )}
    </section>
  )
}

export function Pager({
  page,
  lastPage,
  total,
  onChange,
}: {
  page: number
  lastPage: number
  total: number
  onChange: (page: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-xs tabular-nums text-muted-foreground">
        {t('gallery.pageOf', { page, last: lastPage, total })}
      </span>
      <Button
        variant="outline"
        size="icon"
        disabled={page >= lastPage}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
