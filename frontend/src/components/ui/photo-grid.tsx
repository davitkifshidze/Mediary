import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Lightbox, { type Slide } from 'yet-another-react-lightbox'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Square,
  SquareDashed,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { storageUrl } from '@/lib/api'
import { usePrivateFileUrl } from '@/components/PrivateFile'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'

/* ============================================================
   ფოტოს ბადე + ბიბლიოთეკის lightbox + მონიშვნები (Tasks §2.9).

   ⚠️ **ერთი კომპონენტი ოთხივე ადგილისთვის** — გალერეა (§3), ჩანაწერის
   გვერდი, მსახიობის გვერდი და პროფილის „ატვირთული ფაილები" (§6.2). ეს
   სწორედ ის პუნქტია, სადაც ოთხი ასლი ოთხნაირად მოიქცეოდა.

   ⚠️ **თვითნაკეთი მოდალი წაშლილია** — `yet-another-react-lightbox`
   plugin-ებით: სლაიდშოუ · zoom · ესკიზები · მრიცხველი · სრული ეკრანი.

   ⚠️ **მონიშვნა და ფიქსირებული ბადე ბიბლიოთეკის გარეთაა** — ბიბლიოთეკა ამას
   არ აკეთებს (§2.9-ის შენიშვნა). ე.ი. ბადე ჩვენია, მხოლოდ გახსნილი ხედი მისი.

   ⚠️ **ესკიზი ყოველთვის ერთსა და იმავე ჩარჩოშია** (`aspect-*` + `object-cover`):
   რეალური ზომა ბადეს არ ცვლის, ე.ი. ღილაკები აღარ ცურავს.

   ⚠️ **პრივატული დისკის ფაილი blob-ად იკითხება** (`usePrivateFileUrl`) და
   თითო უჯრა თვითონ ჭრის თავისას — hook-ს ციკლში ვერ დავიძახებთ, ამიტომ
   უჯრა ცალკე კომპონენტია და მისამართს `onResolved`-ით აბრუნებს (lightbox-ს
   ისიც სჭირდება).
   ============================================================ */

/** ერთი სტრიქონი „ფოტოს შესახებ" პანელში (§4.3) */
export interface PhotoInfoRow {
  label: string
  value: string
  /** გარე ბმული (ორიგინალის გვერდი) — ტექსტის ნაცვლად ბმული დაიხატება */
  href?: string | null
}

export interface PhotoItem {
  id: number
  /** public URL (`/storage/…`) ან პრივატული API-ს გზა (`/note-files/12`) */
  src: string
  title?: string | null
  subtitle?: string | null
  /**
   * „რა ვიცით ამ ფოტოზე" (§4.3) — ზომა, სახელი, ვისია, წყარო, თარიღი.
   *
   * ⚠️ **სტრიქონებს გამომძახებელი აწყობს** და არა ბადე: მას არ იცის, რომ
   * გალერეის ფოტოს მშობელი აქვს, პროფილის ფაილს კი მოდული — ერთი „ჭკვიანი"
   * ბადე ორივეს არასწორად დაასათაურებდა.
   */
  info?: PhotoInfoRow[]
  /** სურათზე მისაწერი ნიშანი (მაგ. გალერეის თემა) */
  badge?: ReactNode
  /** ვერტიკალური კადრი — პოსტერი/მსახიობი */
  portrait?: boolean
  size?: number | null
  width?: number | null
  height?: number | null
}

const PLUGINS = [Slideshow, Zoom, Thumbnails, Counter, Fullscreen]

/**
 * „რამდენი ფოტო გამოჩნდეს" — **ერთი ნაკრები ყველგან, სადაც ფოტო ჩანს**
 * (user-ის მოთხოვნა). `0` = „ყველა".
 *
 * ⚠️ სწორედ იმიტომაა `PhotoGrid`-ში და არა ცალკე კომპონენტად ყოველ გვერდზე,
 * რომ გალერეამ, ჩანაწერმა, მსახიობმა და პროფილის ფაილებმა ერთნაირად
 * მოიქცნენ — ოთხი ასლი ოთხნაირად დაითვლიდა.
 */
export const PHOTO_PAGE_SIZES = [10, 20, 30, 40, 50] as const

export const PHOTO_PAGE_ALL = 0

/** ნაგულისხმევი — 20 (ადრე ბადეზე ან ყველაფერი იყო, ან ჩაჭედილი 8) */
export const PHOTO_PAGE_DEFAULT = 20

/** ჩიპების რიგი: 10 · 20 · 30 · 40 · 50 · ყველა */
export function PhotoPageSizePick({
  value,
  onChange,
  total,
  className,
}: {
  value: number
  onChange: (size: number) => void
  /** სულ რამდენი ფოტოა — პატარა სიაზე არჩევანს აზრი არ აქვს */
  total: number
  className?: string
}) {
  const { t } = useTranslation()

  if (total <= PHOTO_PAGE_SIZES[0]) return null

  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      <span className="mr-0.5 text-xs text-muted-foreground">{t('photos.show')}</span>
      {[...PHOTO_PAGE_SIZES, PHOTO_PAGE_ALL].map((size) => (
        <button
          key={size}
          type="button"
          onClick={() => onChange(size)}
          className={cn(
            'cursor-pointer rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors',
            value === size
              ? 'border-primary bg-secondary text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {size === PHOTO_PAGE_ALL ? t('photos.showAll') : size}
        </button>
      ))}
    </span>
  )
}

export function PhotoGrid({
  items,
  lightboxItems,
  privateDisk,
  onDelete,
  onPrimary,
  primaryId,
  emptyText,
  lightboxExtra,
  className,
  pageSize,
  onPageSizeChange,
  total,
  extraTools,
}: {
  items: PhotoItem[]
  /**
   * გახსნილი ხედის სრული სია, თუ ბადე გვერდებადაა დაჭრილი (Tasks §3.7):
   * ისრებით გადასვლა **გვერდის საზღვარს კვეთს**. მითითების გარეშე
   * lightbox მხოლოდ იმას ხედავს, რაც ბადეზეა.
   */
  lightboxItems?: PhotoItem[]
  /** ფაილები პრივატულ დისკზეა (`notes/`, `chat/`) — blob-ად იკითხება */
  privateDisk?: boolean
  /** წაშლა — **ერთსაც და მონიშნულებსაც ერთი ხელმოწერით** */
  onDelete?: (ids: number[]) => void
  onPrimary?: (id: number) => void
  primaryId?: number | null
  emptyText?: string
  /** გახსნილ ფოტოზე დამატებითი კონტროლი (გალერეის თემის select) */
  lightboxExtra?: (item: PhotoItem) => ReactNode
  className?: string
  /**
   * „რამდენი გამოჩნდეს" — **ორი რეჟიმი**:
   *  · `onPageSizeChange`-ით → **მართული**: გვერდებს სერვერი ჭრის (გალერეის
   *    გვერდი), ბადე მხოლოდ არჩევანს ხატავს;
   *  · მის გარეშე → **თვითონ ჭრის** მიღებულ სიას და თავისი გვერდები აქვს
   *    (ჩანაწერი, მსახიობი, პროფილის ფაილები — მათ სერვერული გვერდები არ აქვთ).
   */
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  /**
   * სულ რამდენი ფოტოა — **მართულ რეჟიმში სავალდებულო**: ბადეს მხოლოდ
   * მიმდინარე გვერდი აქვს ხელში, ე.ი. თვითონ ვერ იცის, ღირს თუ არა
   * „რამდენი გამოჩნდეს" არჩევანის ჩვენება.
   */
  total?: number
  /** ხელსაწყოების ზოლში დამატებული კონტროლი (მაგ. თემის მინიჭება მონიშნულებზე) */
  extraTools?: ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  /** id → ნამდვილი მისამართი (პრივატულზე blob) */
  const [resolved, setResolved] = useState<Record<number, string>>({})
  /** არამართული რეჟიმის საკუთარი მდგომარეობა */
  const [ownSize, setOwnSize] = useState(pageSize ?? PHOTO_PAGE_DEFAULT)
  const [page, setPage] = useState(1)

  const controlled = !!onPageSizeChange
  const size = controlled ? (pageSize ?? PHOTO_PAGE_DEFAULT) : ownSize
  const lastPage = size === PHOTO_PAGE_ALL ? 1 : Math.max(1, Math.ceil(items.length / size))

  // სიის შეცვლაზე (ფილტრი, წაშლა) გვერდი უნდა დაბრუნდეს თავში, თორემ
  // „მე-4 გვერდი" ცარიელი დარჩება და ბადე უმიზეზოდ ცარიელი გამოჩნდება
  useEffect(() => {
    setPage((cur) => Math.min(cur, lastPage))
  }, [lastPage])

  // ბადის შეცვლაზე მონიშვნა ძველ id-ებზე რჩებოდა და „წაშალე მონიშნულები"
  // უკვე არარსებულს შლიდა
  useEffect(() => {
    setSelected((cur) => cur.filter((id) => items.some((i) => i.id === id)))
  }, [items])

  const urlOf = (item: PhotoItem) =>
    privateDisk ? resolved[item.id] : (storageUrl(item.src) ?? item.src)

  /** ამ გვერდზე დახატული უჯრები — მართულ რეჟიმში სერვერმა უკვე დაჭრა */
  const shown = useMemo(() => {
    if (controlled || size === PHOTO_PAGE_ALL) return items
    const from = (page - 1) * size
    return items.slice(from, from + size)
  }, [controlled, items, page, size])

  /**
   * გახსნილი ხედის სია — ბადეზე მეტიც შეიძლება იყოს (§3.7).
   * ⚠️ არამართულ რეჟიმში lightbox **მთელ სიას** ხედავს და არა მიმდინარე
   * გვერდს, ე.ი. ისრები გვერდის საზღვარს კვეთს.
   */
  const viewable = lightboxItems ?? items

  const slides: Slide[] = useMemo(
    () =>
      viewable.map((item) => ({
        src: urlOf(item) ?? '',
        alt: item.title ?? '',
        width: item.width ?? undefined,
        height: item.height ?? undefined,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewable, resolved, privateDisk],
  )

  const allSelected = items.length > 0 && selected.length === items.length
  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  /**
   * ჩამოტვირთვა — თითო ფაილი თავისი `<a download>`-ით, თანმიმდევრობით.
   * ⚠️ zip-ად შეკვრა ბიბლიოთეკას მოითხოვდა (jszip ~100 kB); §2.9 ამას არ ითხოვს.
   */
  const download = (ids: number[]) => {
    ids.forEach((id, index) => {
      const item = items.find((i) => i.id === id)
      const url = item && urlOf(item)
      if (!url) return
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = url
        a.download = item.title ?? String(id)
        document.body.appendChild(a)
        a.click()
        a.remove()
      }, index * 250)
    })
  }

  const targets = selected.length ? selected : items.map((i) => i.id)

  return (
    <div className={className}>
      {/* ---------- ხელსაწყოები ---------- */}
      {items.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant={picking ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setPicking((on) => !on)
              setSelected([])
            }}
          >
            <SquareDashed className="size-3.5" />
            {t(picking ? 'photos.pickOff' : 'photos.pickOn')}
          </Button>

          {picking && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelected(allSelected ? [] : items.map((i) => i.id))}
              >
                {allSelected ? <Square className="size-3.5" /> : <CheckSquare className="size-3.5" />}
                {t(allSelected ? 'photos.clear' : 'photos.selectAll')}
              </Button>
              <span className="mr-1 text-xs text-muted-foreground">
                {t('photos.selected', { count: selected.length })}
              </span>
            </>
          )}

          <Button type="button" variant="outline" size="sm" onClick={() => download(targets)}>
            <Download className="size-3.5" />
            {t(selected.length ? 'photos.downloadSelected' : 'photos.downloadAll', {
              count: targets.length,
            })}
          </Button>

          {onDelete && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => onDelete(targets)}
            >
              <Trash2 className="size-3.5" />
              {t(selected.length ? 'photos.deleteSelected' : 'photos.deleteAll', {
                count: targets.length,
              })}
            </Button>
          )}

          {extraTools}

          {/* „რამდენი გამოჩნდეს" — ყველგან, სადაც ფოტო ჩანს */}
          <PhotoPageSizePick
            className="ml-auto"
            value={size}
            total={total ?? items.length}
            onChange={(next) => {
              setPage(1)
              if (onPageSizeChange) onPageSizeChange(next)
              else setOwnSize(next)
            }}
          />
        </div>
      )}

      {!items.length ? (
        <p className="text-sm text-muted-foreground">{emptyText ?? t('photos.empty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((item, index) => (
            <PhotoCell
              key={item.id}
              item={item}
              index={index}
              privateDisk={privateDisk}
              picking={picking}
              checked={selected.includes(item.id)}
              isPrimary={primaryId != null && primaryId === item.id}
              // ⚠️ ინდექსი **გახსნილი სიისაა** და არა ბადისა — გვერდებისას ისინი სხვაობს
              onOpen={() =>
                picking ? toggle(item.id) : setOpen(viewable.findIndex((x) => x.id === item.id))
              }
              onPrimary={onPrimary && (() => onPrimary(item.id))}
              onDelete={onDelete && (() => onDelete([item.id]))}
              onResolved={(url) => setResolved((cur) => (cur[item.id] === url ? cur : { ...cur, [item.id]: url }))}
            />
          ))}
        </ul>
      )}

      {/* გვერდები — მხოლოდ არამართულ რეჟიმში (მართულს სერვერის pager აქვს) */}
      {!controlled && lastPage > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('gallery.pageOf', { page, last: lastPage, total: items.length })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {open != null && (
        <Lightbox
          open
          close={() => setOpen(null)}
          index={open}
          on={{ view: ({ index }) => setOpen(index) }}
          slides={slides}
          plugins={PLUGINS}
          // ⚠️ „ყველას ჩვენება" — ესკიზების ზოლი გახსნილივე რჩება (§2.9)
          thumbnails={{ position: 'bottom', showToggle: true }}
          slideshow={{ delay: 3500 }}
          zoom={{ maxZoomPixelRatio: 4 }}
          toolbar={{
            buttons: [
              ...(lightboxExtra && viewable[open]
                ? [<span key="extra">{lightboxExtra(viewable[open])}</span>]
                : []),
              'close',
            ],
          }}
        />
      )}
    </div>
  )
}

/** ერთი უჯრა — პრივატულ დისკზე თვითონ ჭრის blob-ს (hook ციკლში არ ეშვება) */
function PhotoCell({
  item,
  index,
  privateDisk,
  picking,
  checked,
  isPrimary,
  onOpen,
  onPrimary,
  onDelete,
  onResolved,
}: {
  item: PhotoItem
  index: number
  privateDisk?: boolean
  picking: boolean
  checked: boolean
  isPrimary: boolean
  onOpen: () => void
  onPrimary?: () => void
  onDelete?: () => void
  onResolved: (url: string) => void
}) {
  const { t } = useTranslation()
  const [info, setInfo] = useState(false)
  const blob = usePrivateFileUrl(privateDisk ? item.src : null)
  const url = privateDisk ? blob.url : (storageUrl(item.src) ?? item.src)

  useEffect(() => {
    if (url) onResolved(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return (
    <li
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card transition-colors',
        checked ? 'border-primary' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={item.title ?? String(index + 1)}
        /* ფიქსირებული ჩარჩო — რეალური ზომა ბადეს არ ცვლის (§2.9) */
        className={cn('block w-full cursor-pointer bg-muted', item.portrait ? 'aspect-[2/3]' : 'aspect-video')}
      >
        {url && (
          <img
            src={url}
            alt={item.title ?? ''}
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        )}
      </button>

      {picking && (
        <span
          className={cn(
            'pointer-events-none absolute right-2 top-2 grid size-6 place-items-center rounded-md',
            checked ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-muted-foreground',
          )}
        >
          {checked ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
        </span>
      )}

      {item.badge && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          {item.badge}
        </span>
      )}

      {/* ---------- „ფოტოს შესახებ" (§4.3) ---------- */}
      {info && !!item.info?.length && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-background/95 p-3 text-xs backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setInfo(false)}
            aria-label={t('confirm.cancel')}
            className="absolute right-2 top-2 cursor-pointer rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
          <dl className="space-y-1 pr-6">
            {item.info.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{row.label}</dt>
                <dd className="truncate">
                  {row.href ? (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      {row.value}
                    </a>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="min-w-0 text-xs text-muted-foreground">
          <span className="block truncate">{item.subtitle ?? item.title}</span>
          {item.size != null && formatBytes(item.size)}
        </span>
        <span className="flex shrink-0 gap-1">
          {!!item.info?.length && (
            <button
              type="button"
              onClick={() => setInfo((on) => !on)}
              title={t('photos.info')}
              className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Info className="size-3.5" />
            </button>
          )}
          {onPrimary && (
            <button
              type="button"
              onClick={onPrimary}
              disabled={isPrimary}
              title={isPrimary ? t('gallery.isPrimary') : t('gallery.setPrimary')}
              className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default"
            >
              <Star className={isPrimary ? 'size-3.5 fill-primary text-primary' : 'size-3.5'} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title={t('confirm.delete')}
              className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      </div>
    </li>
  )
}
