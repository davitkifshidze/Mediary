import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  ImageOff,
  Lock,
  MoveRight,
  Square,
  SquareDashed,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { storageUrl } from '@/lib/api'
import { LOCKED_PHOTO_PLACEHOLDER } from '@/lib/lockedPhoto'
import { photoActions } from '@/lib/photoActions'
import { EmptyState } from '@/components/ui/empty-state'
import { NumberPick } from '@/components/ui/number-pick'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { fetchPrivateObjectUrl, usePrivateFileUrl } from '@/components/PrivateFile'
import { useInViewOnce } from '@/lib/inView'
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
  /**
   * **ეს ფოტო პირად დისკზეა** — `src` API-ის მარშრუტია და blob-ად უნდა
   * წაიკითხოს (`usePrivateFileUrl`).
   *
   * ⚠️ **თითო ფოტოზე და არა მთელ ბადეზე.** `privateDisk` ბადის დროშაა და
   * იმ ერთგვაროვან შემთხვევას ემსახურება, სადაც ყველა რიგი პირადია
   * (`note`-ის მოდულის ჭრილი). გალერეა კი **შერეულია**: სესიაში გახსნილი
   * ალბომის ფაილები `gallery/locked`-შია, დანარჩენები `gallery/images`-ში —
   * ე.ი. ერთი ბადის დროშა ერთ ნახევარს ყოველთვის ტყუოდა და პრივატული
   * მისამართი `storageUrl()`-ში ხვდებოდა: `/storage/gallery/images/788/file`,
   * რომელიც არსად არსებობს (`/storage/*` პირად დისკს ვერ წვდება).
   *
   * ⚠️ **ფაქტი სერვერისაა** (`GalleryImageResource.private`) — `PRIVATE_ROOTS`-ის
   * ასლი SPA-ში ერთ დღეს დაშორდებოდა (§17.5-ის დაწერილი წესი).
   */
  private?: boolean
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
  /**
   * „მთავარად დაყენება" ამ ფოტოზე შესაძლებელია.
   *
   * ⚠️ **მსახიობის ფოტოზე ეს `false`-ია** — `cast_members.photo_path`
   * გლობალური სვეტია და backend 422-ს აბრუნებს. აქამდე ღილაკი იხატებოდა,
   * დაჭერა კი ჩუმად არაფერს აკეთებდა (`GalleryPanel` მას თვითონ ყლაპავდა).
   */
  canPrimary?: boolean
  size?: number | null
  width?: number | null
  height?: number | null
  /**
   * **ჩაკეტილი ალბომის ფოტო — ფაილის გარეშე (2026-09-20).**
   *
   * შენი მითითება: „როდესაც ჩაკეტილ კატეგორიაში იქნება, ყველა ფოტოში
   * ჩანდეს დაბლარულად და თუ პაროლს არ შეიყვან, არ გამოჩნდება".
   *
   * ⚠️ **`src` ასეთ რიგზე ცარიელია** — სერვერი ბილიკს არ აგზავნის. ამიტომ
   * უჯრა ერთ სტატიკურ ბლარს ხატავს, დაჭერა კი `onLocked`-ს ეძახის
   * (პაროლის ფანჯარა გამომძახებლისაა: ბადემ ალბომები არ იცის).
   *
   * ⚠️ **ასეთი ფოტო არც იხსნება, არც ინიშნება და არც იშლება**: ლაითბოქსში
   * ცარიელი სლაიდი იქნებოდა, ხოლო „მონიშნულების წაშლა/ჩამოტვირთვა"
   * იმაზე იმოქმედებდა, რასაც ვერც ხედავ.
   */
  locked?: boolean
  /** რომელი ალბომის პაროლი უნდა იკითხოს `onLocked`-მა */
  albumId?: number | null
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

/**
 * ⚠️ **ჭერი სერვერისაა და არა ბადისა** — მართულ რეჟიმში ეს რიცხვი
 * `per_page`-ად მიდის, რომელსაც `GalleryController::MAX_PER_PAGE` 1000-ზე
 * ჩერდება; ხელით ჩაწერილი 5000 იქ 422-ს დააბრუნებდა.
 */
const PHOTO_PAGE_MAX = 1000

/**
 * გახსნილი სლაიდის რამდენ მეზობელს წამოვიღებთ წინასწარ (Tasks PERF-09).
 *
 * ⚠️ პრივატულ ბადეზე უჯრა blob-ს მხოლოდ ეკრანზე გამოჩენისას კითხულობს,
 * lightbox-ში ისრით გადასვლა კი ეკრანს გარეთ დარჩენილ სლაიდზეც მიდის —
 * ბუფერის გარეშე ის ცარიელი დარჩებოდა.
 */
const PRELOAD_AROUND = 2

/** ჩამოტვირთვისთვის ხელით შექმნილი object URL-ის სიცოცხლე */
const REVOKE_AFTER_MS = 10_000

/**
 * „რამდენი გამოჩნდეს" — **სელექტი მზა რიცხვებით + „სხვა"** (შენი მითითება,
 * 2026-09-13). ადრე ექვსი ჩიპის რიგი იყო, ე.ი. არჩევანი ფიქსირებულ ხუთ
 * რიცხვს ებმებოდა და ხელსაწყოთა ზოლის ნახევარს ჭამდა.
 *
 * ⚠️ **ეს `NumberPick`-ია და არა საკუთარი სელექტი** — იმავე კონტროლს
 * იყენებს გალერეის ჩამოტვირთვის დიალოგი; ორი ასლი „სხვა"-ს ორნაირად
 * მოაქცევდა.
 *
 * ⚠️ **ნული აქ „ყველა"-ა და არა „არცერთი"** (`noneLabel`), და სიის
 * **ბოლოშია** (`noneLast`) — „10 · 20 · 30 · 40 · 50 · ყველა · სხვა"
 * ზუსტად ისე იკითხება, როგორც ითხოვე.
 */
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
    <span className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-muted-foreground">{t('photos.show')}</span>
      <NumberPick
        value={value}
        onChange={onChange}
        options={[...PHOTO_PAGE_SIZES]}
        allowNone
        noneLabel={t('photos.showAll')}
        noneLast
        size="sm"
        min={1}
        max={PHOTO_PAGE_MAX}
      />
    </span>
  )
}

export function PhotoGrid({
  items,
  lightboxItems,
  privateDisk,
  onDelete,
  onMove,
  onLocked,
  onPrimary,
  primaryId,
  emptyText,
  emptyIcon,
  emptyHint,
  emptyActions,
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
  /**
   * §26.3 — გადატანა (მშობელი · ალბომი · უკატეგორიო).
   *
   * ⚠️ **ცალკე პროპია და არა `extraTools`-ში ჩადებული ღილაკი**: მოქმედებას
   * **მონიშნული** სჭირდება, `extraTools` კი უბრალო `ReactNode`-ია და
   * მონიშვნას ვერ ხედავს. `onDelete`-ის იგივე ხელმოწერა.
   */
  onMove?: (ids: number[]) => void
  /**
   * ჩაკეტილ ფილაზე დაჭერა — პაროლის ფანჯარა (2026-09-20).
   *
   * ⚠️ **ბადე ალბომს არ ხსნის თვითონ**: `ui/` არაფერს იცის გალერეის
   * ალბომებზე და არც უნდა იცოდეს (`PhotoGrid` პროფილის ფაილებსაც ემსახურება).
   */
  onLocked?: (item: PhotoItem) => void
  onPrimary?: (id: number) => void
  primaryId?: number | null
  emptyText?: string
  /** ცარიელი მდგომარეობის ხატულა/ახსნა/ღილაკები — იხ. `ui/empty-state.tsx` */
  emptyIcon?: ReactNode
  emptyHint?: ReactNode
  emptyActions?: ReactNode
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
  /**
   * id → ნამდვილი მისამართი (პრივატულზე blob).
   *
   * ⚠️ **ref და არა state** (Tasks PERF-13). ყოველი უჯრის blob სხვა დროს
   * ჩნდება, ე.ი. state-ის შემთხვევაში 50-უჯრიანი ბადე `PhotoGrid`-ს
   * **50-ჯერ** ხატავდა თავიდან — ყოველ ჯერზე ყველა უჯრასთან და `slides`
   * memo-ს გადათვლასთან ერთად (PERF-09-თან ერთად ეს კვადრატულად იზრდებოდა).
   *
   * ⚠️ **რენდერისთვის ის საერთოდ არ არის საჭირო**: უჯრა თავის მისამართს
   * თვითონ იღებს (`usePrivateFileUrl`), რუკას კი მხოლოდ ორი მკითხველი
   * ჰყავს — `slides` (გახსნილი ხედი) და `download()` (ივენთ-ჰენდლერი).
   */
  const resolved = useRef<Record<number, string>>({})
  /** გადახატვის ბიძგი მხოლოდ მაშინ, როცა გახსნილ ხედს ახალი მისამართი სჭირდება */
  const [slideVersion, setSlideVersion] = useState(0)
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

  /**
   * პირადია თუ არა **ეს** ფოტო.
   *
   * ⚠️ ბადის `privateDisk` მხოლოდ ნაგულისხმევია: ერთგვაროვან ჭრილში
   * (ყველა რიგი პირადი) ის საკმარისია, შერეულში კი რიგის საკუთარი
   * პასუხი უპირატესია — თორემ ერთ ნახევარს მისამართი ეტყუება.
   */
  const isPrivate = (item: PhotoItem) => item.private ?? privateDisk ?? false

  const urlOf = (item: PhotoItem) =>
    isPrivate(item) ? resolved.current[item.id] : (storageUrl(item.src) ?? item.src)

  /**
   * უჯრამ მისამართი მიიღო.
   *
   * ⚠️ **გადახატვა მხოლოდ გახსნილ ლაითბოქსზე.** დახურულზე რუკას
   * არავინ კითხულობს, ე.ი. `setState` წმინდა ხარჯია; გახსნილზე კი
   * მეზობლების blob-ები სწორედ მაშინ ჩნდება (PERF-09-ის წინასწარი
   * წამოღება) და მათ გარეშე სლაიდი ცარიელი დარჩებოდა.
   *
   * ⚠️ დამოკიდებულება `lightboxOpen`-ია და არა ref: ასე callback-ის
   * იგივეობა სესიაზე ორჯერ იცვლება (გახსნა/დახურვა) და არა ყოველ
   * მისამართზე, ხოლო რენდერში ref-ის ჩაწერა (რასაც React არ ურჩევს)
   * საერთოდ არ გვჭირდება.
   */
  const lightboxOpen = open != null
  const noteResolved = useCallback(
    (id: number, url: string) => {
      if (resolved.current[id] === url) return
      resolved.current[id] = url

      if (lightboxOpen) setSlideVersion((v) => v + 1)
    },
    [lightboxOpen],
  )

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
  /* ⚠️ **ჩაკეტილი გახსნილ ხედში არ შედის** (2026-09-20): მისამართი არ
     აქვს, ე.ი. სლაიდი ცარიელი იქნებოდა და ისრებით მასზე გაჩერება
     „ლაითბოქსი გატყდა"-დ წაიკითხებოდა. */
  const viewable = (lightboxItems ?? items).filter((item) => !item.locked)

  /**
   * გახსნილი სლაიდი და მისი მეზობლები — მათი blob უჯრის ხილვადობის
   * მიუხედავად უნდა წამოვიდეს (Tasks PERF-09).
   *
   * ⚠️ მოქმედებს მხოლოდ **დახატულ** უჯრებზე: `viewable` ბადეზე მეტიც
   * შეიძლება იყოს (§3.7), და სხვა გვერდის ფოტოს აქამდეც არ ჰქონდა
   * მისამართი გახსნილ ხედში — ეს იმას არ ცვლის.
   */
  const preloadIds = useMemo(() => {
    if (open == null) return null

    const ids = new Set<number>()
    for (let i = open - PRELOAD_AROUND; i <= open + PRELOAD_AROUND; i += 1) {
      const item = viewable[i]
      if (item) ids.add(item.id)
    }

    return ids
  }, [open, viewable])

  const slides: Slide[] = useMemo(
    () =>
      viewable.map((item) => ({
        src: urlOf(item) ?? '',
        alt: item.title ?? '',
        width: item.width ?? undefined,
        height: item.height ?? undefined,
      })),
    /* ⚠️ `resolved` ref-ია, ე.ი. deps-ში ვერ იქნება. ხელახლა გათვლა ორ
       მომენტზეა საჭირო და ორივე აქ წერია: ლაითბოქსის გახსნა/გადასვლა
       (`open`) და გახსნილზე ახალი მისამართის მოსვლა (`slideVersion`). */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlOf ref-ს კითხულობს; გადათვლის ორივე ნამდვილი ტრიგერი (open, slideVersion) ჩამოთვლილია
    [viewable, privateDisk, open, slideVersion],
  )

  /**
   * **მოსანიშნი უჯრები — ჩაკეტილის გარეშე** (2026-09-20).
   *
   * ⚠️ `items`-ზე დაყრდნობილი „ყველას მონიშვნა" ჩაკეტილსაც მონიშნავდა და
   * `allSelected` ვერასდროს გახდებოდა `true` (ჩაკეტილი `targets`-ში არ
   * ხვდება), ე.ი. ღილაკი სამუდამოდ „მონიშნე ყველა" დარჩებოდა.
   */
  const selectable = useMemo(() => items.filter((item) => !item.locked), [items])

  const allSelected = selectable.length > 0 && selected.length === selectable.length

  /**
   * ⚠️ **მონიშვნა მონიშვნის რეჟიმსაც რთავს** (შენი მითითება, 2026-09-14).
   * მარჯვენა კლიკის მენიუდან „მონიშვნა" მხოლოდ `selected`-ს ცვლიდა, `picking`
   * კი ტულბარის ღილაკს ელოდა — ე.ი. ზედა ზოლში „მონიშნულების წაშლა/
   * ჩამოტვირთვა" საერთოდ არ ჩნდებოდა და მონიშვნა უსარგებლო იყო.
   */
  const toggle = (id: number) => {
    setPicking(true)
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  /**
   * ჩამოტვირთვა — თითო ფაილი თავისი `<a download>`-ით, თანმიმდევრობით.
   * ⚠️ zip-ად შეკვრა ბიბლიოთეკას მოითხოვდა (jszip ~100 kB); §2.9 ამას არ ითხოვს.
   *
   * ⚠️ **პრივატულზე ფაილი საჭიროების შემთხვევაში აქვე წამოვიდება**
   * (Tasks PERF-09): `resolved`-ში მხოლოდ **დახატული და ეკრანზე გამოჩენილი**
   * უჯრების blob-ებია, „ყველას მონიშვნა" კი სხვა გვერდსაც და ეკრანს გარეთ
   * დარჩენილსაც მოიცავს — ისინი ადრე **ჩუმად გამოტოვდებოდა** (ეს ხარვეზი
   * გვერდებისთვის აქამდეც არსებობდა).
   */
  const download = (ids: number[]) => {
    ids.forEach((id, index) => {
      const item = items.find((i) => i.id === id)
      if (!item) return

      setTimeout(async () => {
        const ready = urlOf(item)
        const fetched = ready || !isPrivate(item) ? null : await fetchPrivateObjectUrl(item.src)
        const url = ready ?? fetched
        if (!url) return

        const a = document.createElement('a')
        a.href = url
        a.download = item.title ?? String(id)
        document.body.appendChild(a)
        a.click()
        a.remove()

        // ⚠️ მხოლოდ **ჩვენ** შექმნილს ვათავისუფლებთ და დაყოვნებით: უჯრის
        // blob-ს თვითონ უჯრა უვლის, ხოლო `click()`-ის შემდეგ მაშინვე
        // გათავისუფლება ჩამოტვირთვას აწყვეტინებს
        if (fetched) setTimeout(() => URL.revokeObjectURL(fetched), REVOKE_AFTER_MS)
      }, index * 250)
    })
  }

  const targets = selected.length ? selected : selectable.map((i) => i.id)

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
                onClick={() => setSelected(allSelected ? [] : selectable.map((i) => i.id))}
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

          {onMove && (
            <Button type="button" variant="outline" size="sm" onClick={() => onMove(targets)}>
              <MoveRight className="size-3.5" />
              {t(selected.length ? 'gallery.moveSelected' : 'gallery.moveAll', {
                count: targets.length,
              })}
            </Button>
          )}

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
        /* ⚠️ **ცარიელი ბადე ცენტრირებული ბლოკია და არა ერთი ნაცრისფერი წინადადება**
           (შენი მითითება, 2026-09-12). `EmptyState` სწორედ ამისთვის დაიწერა
           §2.4-ში, ბადემ კი მას არ იყენებდა — ე.ი. ცხრა მოდულზე მოწესრიგებული
           ცარიელი მდგომარეობა გალერეაში, ჩანაწერზე, მსახიობზე და პროფილის
           ფაილებში ერთნაირად ირღვეოდა. `emptyIcon`/`emptyHint`/`emptyActions`
           გამომძახებელს ეკუთვნის — „დაამატე" და „ფილტრის მოხსნა" სხვადასხვა
           ადგილას სხვადასხვაა. */
        <EmptyState
          icon={emptyIcon ?? <ImageOff className="size-6" />}
          title={emptyText ?? t('photos.empty')}
          hint={emptyHint}
          actions={emptyActions}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((item, index) =>
            item.locked ? (
              <LockedPhotoCell
                key={item.id}
                item={item}
                onOpen={() => onLocked?.(item)}
              />
            ) : (
            <PhotoCell
              key={item.id}
              item={item}
              index={index}
              privateDisk={isPrivate(item)}
              preload={!!preloadIds?.has(item.id)}
              picking={picking}
              checked={selected.includes(item.id)}
              isPrimary={primaryId != null && primaryId === item.id}
              /* ⚠️ **მონიშნულზე მოქმედება მთელ მონიშვნაზეა** (ეტაპი 2): მონიშნულ
                 ფოტოზე „წაშლა" ნიშნავს „ყველა მონიშნული", არამონიშნულზე —
                 მხოლოდ ამ ერთს. შეუქცევად მოქმედებაზე ორაზროვნება დაუშვებელია. */
              targets={selected.includes(item.id) && selected.length ? selected : [item.id]}
              /* ⚠️ ინდექსი **გახსნილი სიისაა** და არა ბადისა — გვერდებისას ისინი სხვაობს.
                 ⚠️ „გახსნა" ყოველთვის ლაითბოქსია: მონიშვნის რეჟიმის შემთხვევა
                 სურათის ღილაკშია, თორემ მენიუს „გახსნა" ზოგჯერ მონიშვნას
                 ნიშნავდა და პუნქტი თავის სახელს ატყუებდა. */
              onOpen={() => setOpen(viewable.findIndex((x) => x.id === item.id))}
              onToggle={() => toggle(item.id)}
              onDownload={download}
              onPrimary={
                onPrimary && item.canPrimary !== false ? () => onPrimary(item.id) : undefined
              }
              onMove={onMove}
              onDelete={onDelete}
              onResolved={noteResolved}
            />
            ),
          )}
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

/**
 * ერთი უჯრა — პრივატულ დისკზე თვითონ ჭრის blob-ს (hook ციკლში არ ეშვება).
 *
 * ## ეტაპი 2 (2026-09-13)
 * ⚠️ **მოქმედებები სამივე გზით ერთი სიიდან იხატება** (`photoActions()`):
 * ქვედა ზოლის ხატულები · „⋮" მენიუ · **მარჯვენა კლიკი**. აქამდე ღილაკები
 * მხოლოდ ჰოვერზე იყო, ე.ი. სენსორულ ეკრანზე და კლავიატურით პრაქტიკულად
 * მიუწვდომელი, მარჯვენა კლიკი კი ბრაუზერის მენიუს ხსნიდა.
 */
/* ============================================================
   **ჩაკეტილი ფილა — ბლარი და პაროლი (2026-09-20).**

   ⚠️ **ცალკე კომპონენტია და არა `PhotoCell`-ის ადრეული `return`**, და ეს
   არა სტილის, არამედ hooks-ის საკითხია: `PhotoCell` ქვემოთ სამ hook-ს
   იძახის (ხილვადობა, blob, ეფექტი), ე.ი. შუაში გაჩერებული `return`
   პაროლის შეყვანის მომენტში — როცა **იგივე** `key` ჩაკეტილიდან
   ჩვეულებრივ უჯრად იქცევა — hook-ების რიგს შეცვლიდა და React გაწყდებოდა.
   სხვა ტიპის ელემენტს კი React თავისით ამაუნთებს ხელახლა.

   ⚠️ **აქ არაფერია ფაილზე დამოკიდებული და ეს განზრახულია**: ბილიკი
   პასუხში არ მოსულა, ე.ი. lightbox, „შესახებ", ჩამოტვირთვა, „მთავარად
   დაყენება" და წაშლა ვერაფერს გააკეთებდნენ — კონტექსტური მენიუ მხოლოდ
   ერთადერთ სათქმელს გადაფარავდა: „შეიყვანე პაროლი".

   ⚠️ **პროპორცია რიგის ზომებიდან მოდის** და არა ფიქსირებული ჩარჩოდან:
   პაროლის შეყვანის შემდეგ იმავე ადგილას ნამდვილი ფოტო ჯდება და ბადე
   არ უნდა ახტეს.
   ============================================================ */
function LockedPhotoCell({ item, onOpen }: { item: PhotoItem; onOpen: () => void }) {
  const { t } = useTranslation()

  return (
    <li className="relative overflow-hidden rounded-xl border border-border bg-muted">
      <button
        type="button"
        onClick={onOpen}
        title={t('gallery.albumUnlock')}
        aria-label={t('gallery.albumUnlock')}
        className={cn(
          'block w-full cursor-pointer',
          item.portrait ? 'aspect-[2/3]' : 'aspect-video',
        )}
        style={
          item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined
        }
      >
        <img src={LOCKED_PHOTO_PLACEHOLDER} alt="" aria-hidden className="size-full object-cover" />
        <span className="absolute inset-0 grid place-items-center">
          <Lock className="size-5 text-white/90 drop-shadow" />
        </span>
      </button>
    </li>
  )
}

function PhotoCell({
  item,
  index,
  privateDisk,
  preload,
  picking,
  checked,
  isPrimary,
  targets,
  onOpen,
  onToggle,
  onDownload,
  onPrimary,
  onMove,
  onDelete,
  onResolved,
}: {
  item: PhotoItem
  index: number
  privateDisk?: boolean
  /** გახსნილი სლაიდის მეზობელია — blob ხილვადობის მოლოდინის გარეშე მოდის */
  preload: boolean
  picking: boolean
  checked: boolean
  isPrimary: boolean
  /** რომელ id-ებზე იმოქმედებს ჩამოტვირთვა/წაშლა — იხ. მონიშვნის წესი ზემოთ */
  targets: number[]
  onOpen: () => void
  onToggle: () => void
  onDownload: (ids: number[]) => void
  onPrimary?: () => void
  onMove?: (ids: number[]) => void
  onDelete?: (ids: number[]) => void
  /** ⚠️ id-საც გადმოსცემს, რომ მშობლის callback სტაბილური იყოს (PERF-13) */
  onResolved: (id: number, url: string) => void
}) {
  const { t } = useTranslation()
  const [info, setInfo] = useState(false)

  /* ⚠️ **პრივატული ფაილი მხოლოდ ეკრანზე გამოჩენისას იკითხება (Tasks PERF-09).**
     `loading="lazy"` აქ არაფერს შველის — მისამართი blob-ია და fetch-ს JS
     აკეთებს, ე.ი. „ყველა"-ს არჩევაზე ბადე ერთდროულად ასობით ავტორიზებულ
     `GET`-ს უშვებდა: გვერდი 600/წთ გლობალურ ლიმიტზე **თავად ითროთლებოდა**
     და მეხსიერებაც blob-ებით ივსებოდა. */
  const [tileRef, inView] = useInViewOnce<HTMLLIElement>()
  const blob = usePrivateFileUrl(privateDisk && (inView || preload) ? item.src : null)
  const url = privateDisk ? blob.url : (storageUrl(item.src) ?? item.src)

  useEffect(() => {
    if (url) onResolved(item.id, url)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- მისამართის მოსვლაზე ვატყობინებთ ერთხელ; onResolved სტაბილურია (PERF-13)
  }, [url])

  const actions = photoActions({
    t,
    count: targets.length,
    privateDisk,
    isPrimary,
    picking,
    checked,
    onOpen,
    onInfo: item.info?.length ? () => setInfo((on) => !on) : undefined,
    onPrimary,
    onDownload: () => onDownload(targets),
    /* ⚠️ **ორიგინალი პრივატულზე არ იხატება** — იქ მისამართი blob-ია და ახალ
       ტაბში გახსნილი ბმული ამ გვერდთან ერთად კვდება; წესი `photoActions()`-შია,
       ე.ი. ერთხელ წერია და ტესტიც აქვს. */
    onOriginal: url ? () => window.open(url, '_blank', 'noopener,noreferrer') : undefined,
    onToggle,
    onMove: onMove && (() => onMove(targets)),
    onDelete: onDelete && (() => onDelete(targets)),
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          ref={tileRef}
          className={cn(
            'group relative overflow-hidden rounded-xl border bg-card transition-colors',
            checked ? 'border-primary' : 'border-border',
          )}
        >
          <button
            type="button"
            // მონიშვნის რეჟიმში სურათზე დაჭერა ნიშნავს „მონიშნე", და არა „გახსენი"
            onClick={picking ? onToggle : onOpen}
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

          {/* ⚠️ **`checked`-იც ხატავს ნიშანს და არა მხოლოდ `picking`** (შენი
              მითითება, 2026-09-14): მარჯვენა კლიკით მონიშნულ ფოტოს ჩარჩო
              ეცვლებოდა, პტიჩკა კი არა — ე.ი. „ზემოთ რიცხვი ჩანს, ფოტოზე
              არაფერი". ორივე პირობა საჭიროა: `picking` ცარიელ უჯრებზეც
              აჩვენებს ჩარჩოს, `checked` კი მაშინაც, თუ რეჟიმი ჯერ არ ჩართულა. */}
          {(picking || checked) && (
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
            <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
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
                          className="text-primary hover:text-primary/70"
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
            <span className="flex shrink-0 items-center gap-1">
              {/* ⚠️ „ეს მთავარია" **ნიშანია და არა გამორთული ღილაკი** — მოქმედება,
                  რომელიც ვერ იმუშავებს, სიაშიც აღარაა */}
              {isPrimary && (
                <span className="grid size-7 place-items-center" title={t('gallery.isPrimary')}>
                  <Star className="size-3.5 fill-primary text-primary" />
                </span>
              )}

              {actions
                .filter((action) => action.quick)
                .map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.run}
                    title={action.label}
                    aria-label={action.label}
                    className={cn(
                      'grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground',
                      action.danger
                        ? 'hover:bg-destructive/10 hover:text-destructive'
                        : 'hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <action.icon className="size-3.5" />
                  </button>
                ))}

              {/* ⚠️ **„⋯" კლავიატურის გზაა** — მარჯვენა კლიკი მალსახმობია და არა
                  ერთადერთი კარი (სენსორული ეკრანი, Tab-ნავიგაცია) */}
              <ActionMenu label={t('actions.more')}>
                {actions.map((action) => (
                  <ActionMenuClose key={action.key} asChild>
                    <button
                      type="button"
                      onClick={action.run}
                      className={actionItemClass(action.danger ? 'destructive' : undefined)}
                    >
                      <action.icon className="size-3.5" />
                      {action.label}
                    </button>
                  </ActionMenuClose>
                ))}
              </ActionMenu>
            </span>
          </div>
        </li>
      </ContextMenuTrigger>

      {/* ⚠️ იგივე სია — მარჯვენა კლიკზე. `LAYER_POPUP` `ContextMenuContent`-შია,
          ე.ი. ბადე მოდალის ან ლაითბოქსის შიგნითაც სწორად იხატება (§1.2). */}
      <ContextMenuContent>
        {actions.map((action) => (
          <Fragment key={action.key}>
            {action.danger && <ContextMenuSeparator />}
            <ContextMenuItem
              onSelect={action.run}
              className={action.danger ? 'text-destructive focus:bg-destructive/10' : undefined}
            >
              <action.icon className="size-3.5" />
              {action.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
