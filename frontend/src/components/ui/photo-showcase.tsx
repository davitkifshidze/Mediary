import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
   **ფოტოების ვიტრინა — Steam-ის მაღაზიის გვერდივით**.

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
   blob-ს მოითხოვს (`PhotoGrid`-ის `privateDisk`); როცა ეს სხვა
   მოდულს დასჭირდება, ის აქ ემატება და არა მეორე ასლში.

   ⚠️ **გვერდიგვერდ** (შენი სიტყვები: „ფოტო ძალიან დიდია… უფრო მცირე იყოს, მარჯვნივ
   სია ყველა ფოტოსი, რაც დაეტევა, დანარჩენი — სქროლით"): მთავარი ფოტო `sm`-იდან
   ნახევარ სიგანეზეა (`lg`-ზე 55%), ესკიზები მარჯვნივ სვეტად — სვეტის სიმაღლე
   მთავარი ფოტოსია (შიგნით აბსოლუტური სქროლი), ტელეფონზე ზოლად ქვემოთ.
   ⚠️ **ავტოსლაიდი** ყოველ წამში (`autoplay`, ნაგულისხმევად ჩართული — ერთი
   ვიტრინაა რვა ფანჯარაში); ჩერდება ჰოვერზე და ლაითბოქსის ღიაობისას. აქტიური
   ესკიზი **მხოლოდ თავის სვეტში** სქროლდება — `scrollIntoView` ფანჯარასაც
   ამოძრავებდა და კითხვისას გვერდი ყოველ წამში ხტებოდა.
   ============================================================ */

/** ავტოსლაიდის ბიჯი (ms) */
const AUTOPLAY_MS = 1000

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
  autoplay = true,
  className,
}: {
  items: ShowcaseItem[]
  /** ცარიელი ვიტრინის ადგილი (მაგ. `EmptyState`) */
  empty?: ReactNode
  /** მიმდინარე (დიდი) ფოტოს წაშლა — დადასტურება გამომძახებლისაა */
  onDelete?: (id: number) => void
  /** ფოტოები თავისით ცვლის ერთმანეთს (ყოველ წამში); `false` — მხოლოდ ხელით */
  autoplay?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const strip = useRef<HTMLDivElement>(null)

  // ⚠️ წაშლის შემდეგ ინდექსი სიის ბოლოს მიღმა შეიძლება დარჩეს
  const current = items.length ? Math.min(index, items.length - 1) : 0
  const shown = items[current]
  const count = items.length
  const running = autoplay && count > 1 && !hovered && !open

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setIndex((i) => (Math.min(i, count - 1) + 1) % count), AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [running, count])

  /* აქტიური ესკიზი ხილვად ადგილზე — მხოლოდ სვეტის/ზოლის სქროლით (იხ. ზემოთ) */
  useEffect(() => {
    const box = strip.current
    const thumb = box?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!box || !thumb || typeof box.scrollTo !== 'function') return
    box.scrollTo({
      top: thumb.offsetTop - (box.clientHeight - thumb.clientHeight) / 2,
      left: thumb.offsetLeft - (box.clientWidth - thumb.clientWidth) / 2,
      behavior: 'smooth',
    })
  }, [current])

  const slides: Slide[] = useMemo(
    () => items.map((item) => ({ src: storageUrl(item.src) ?? '', alt: item.title ?? '' })),
    [items],
  )

  if (!shown) return <>{empty}</>

  return (
    <div
      className={cn('sm:flex sm:gap-3', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid="photo-showcase"
    >
      <div className="group relative shrink-0 overflow-hidden rounded-lg bg-muted sm:w-1/2 lg:w-[55%]" data-testid="showcase-main">
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

      {/* ⚠️ ესკიზები მხოლოდ მაშინ, როცა არჩევანი არსებობს: `sm`-იდან მარჯვნივ სვეტად
          (სიმაღლე — მთავარი ფოტოსი, შიგნით აბსოლუტური სქროლი), ტელეფონზე ზოლად ქვემოთ */}
      {items.length > 1 && (
        <div className="relative mt-2 sm:mt-0 sm:min-w-0 sm:flex-1">
          <div
            ref={strip}
            className="fb-scroll flex gap-2 overflow-x-auto pb-1 sm:absolute sm:inset-0 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:pb-0 sm:pr-1"
            data-testid="showcase-thumbs"
          >
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={item.title ?? `${i + 1}`}
                aria-current={i === current}
                className={cn(
                  'h-16 w-28 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 transition-opacity sm:aspect-video sm:h-auto sm:w-full',
                  i === current ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <img src={storageUrl(item.src) ?? ''} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            ))}
          </div>
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
