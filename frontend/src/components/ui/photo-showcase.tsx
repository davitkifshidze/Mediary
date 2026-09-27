import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Lightbox, { type Slide } from 'yet-another-react-lightbox'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import { Trash2 } from 'lucide-react'
import { storageUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'

/* ============================================================
   **ფოტოების ვიტრინა — Steam-ის მაღაზიის გვერდივით** (Tasks §22.2, Q35).

   შენი სიტყვები: „ფოტოები ბოლოშია — ზემოთ გააკეთე, კარგი ზომით";
   გადაწყვეტილება: **პირველი დიდად, დანარჩენი ქვემოთ ზოლად; დაჭერით —
   სრულ ეკრანზე; ზოლში დაჭერა დიდ სურათს ცვლის.**

   ⚠️ **ეს `PhotoGrid`-ის ჩამნაცვლებელი არ არის** — ბადე ბიბლიოთეკაა
   (მონიშვნა, გვერდები, ჩამოტვირთვა, გადატანა), ეს კი ჩანაწერის დეტალის
   ვიტრინაა: ერთი ფოტო ყურადღების ცენტრში და დანარჩენი ხელის გაწვდენაზე.
   ⚠️ **ლაითბოქსი იგივე ბიბლიოთეკაა** (`yet-another-react-lightbox`,
   იგივე z-index — `--yarl__portal_zindex: 80`), ე.ი. სრულ ეკრანზე ორი
   სხვადასხვა ქცევა არ იბადება. ⚠️ მასში გადასვლა დიდ სურათსაც ცვლის —
   დახურვისას იქ ხვდები, სადაც გაჩერდი.

   ⚠️ **საჯარო დისკისთვისაა** (`storageUrl`) — პრივატული ფაილის ჩვენება
   blob-ს მოითხოვს (`PhotoGrid`-ის `privateDisk`); როცა §26 ამას სხვა
   მოდულზე გაავრცელებს, ის აქ ემატება და არა მეორე ასლში.
   ============================================================ */

export interface ShowcaseItem {
  id: number
  src: string
  title?: string | null
}

const PLUGINS = [Zoom, Thumbnails, Counter, Fullscreen]

export function PhotoShowcase({
  items,
  empty,
  onDelete,
  className,
}: {
  items: ShowcaseItem[]
  /** ცარიელი ვიტრინის ადგილი (მაგ. `EmptyState`) */
  empty?: ReactNode
  /** მიმდინარე (დიდი) ფოტოს წაშლა — დადასტურება გამომძახებლისაა */
  onDelete?: (id: number) => void
  className?: string
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)

  // ⚠️ წაშლის შემდეგ ინდექსი სიის ბოლოს მიღმა შეიძლება დარჩეს
  const current = items.length ? Math.min(index, items.length - 1) : 0
  const shown = items[current]

  const slides: Slide[] = useMemo(
    () => items.map((item) => ({ src: storageUrl(item.src) ?? '', alt: item.title ?? '' })),
    [items],
  )

  if (!shown) return <>{empty}</>

  return (
    <div className={className}>
      <div className="group relative overflow-hidden rounded-lg bg-muted">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('photos.open')}
          className="block aspect-video w-full cursor-zoom-in"
        >
          <img src={storageUrl(shown.src) ?? ''} alt={shown.title ?? ''} className="size-full object-cover" />
        </button>

        {items.length > 1 && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-xs tabular-nums text-white">
            {current + 1} / {items.length}
          </span>
        )}

        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(shown.id)}
            aria-label={t('actions.delete')}
            title={t('actions.delete')}
            className="absolute right-2 top-2 grid size-8 cursor-pointer place-items-center rounded-md bg-black/55 text-white hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {/* ⚠️ ზოლი მხოლოდ მაშინ, როცა არჩევანი არსებობს */}
      {items.length > 1 && (
        <div className="fb-scroll mt-2 flex gap-2 overflow-x-auto pb-1">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={item.title ?? `${i + 1}`}
              aria-current={i === current}
              className={cn(
                'h-16 w-28 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 transition-opacity',
                i === current ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <img src={storageUrl(item.src) ?? ''} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <Lightbox
          open
          close={() => setOpen(false)}
          index={current}
          on={{ view: ({ index: next }) => setIndex(next) }}
          slides={slides}
          plugins={PLUGINS}
          thumbnails={{ position: 'bottom', showToggle: true }}
          zoom={{ maxZoomPixelRatio: 4 }}
        />
      )}
    </div>
  )
}
