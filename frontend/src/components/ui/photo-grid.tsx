import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Lightbox, { type Slide } from 'yet-another-react-lightbox'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Video from 'yet-another-react-lightbox/plugins/video'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import {
  CheckSquare,
  Download,
  Film,
  ImageOff,
  Lock,
  MoreHorizontal,
  MoveRight,
  Play,
  Square,
  SquareDashed,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { storageUrl } from '@/lib/api'
import { LOCKED_PHOTO_PLACEHOLDER } from '@/lib/lockedPhoto'
import { photoActions, type PhotoAction } from '@/lib/photoActions'
import { formatDuration } from '@/lib/videoDuration'
import { EmptyState } from '@/components/ui/empty-state'
import { PageSizePick } from '@/components/ui/page-size-pick'
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
import { FavoriteButton } from '@/components/ui/favorite-button'
import { Pagination } from '@/components/ui/pagination'
import { useClientPages } from '@/lib/paged'
import { PAGE_ALL, PHOTO_COLUMNS, PHOTO_PER_PAGE_MAX, usePhotoPageSize } from '@/lib/pageSize'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'

/* ============================================================
   ფოტოს ბადე + ბიბლიოთეკის lightbox + მონიშვნები.

   ⚠️ **ერთი კომპონენტი ოთხივე ადგილისთვის** — გალერეა, ჩანაწერის
   გვერდი, მსახიობის გვერდი და პროფილის „ატვირთული ფაილები". ეს
   სწორედ ის პუნქტია, სადაც ოთხი ასლი ოთხნაირად მოიქცეოდა.

   ⚠️ **თვითნაკეთი მოდალი წაშლილია** — `yet-another-react-lightbox`
   plugin-ებით: სლაიდშოუ · zoom · ესკიზები · მრიცხველი · სრული ეკრანი.

   ⚠️ **მონიშვნა და ფიქსირებული ბადე ბიბლიოთეკის გარეთაა** — ბიბლიოთეკა ამას
   არ აკეთებს. ე.ი. ბადე ჩვენია, მხოლოდ გახსნილი ხედი მისი.

   ⚠️ **ესკიზი ყოველთვის ერთსა და იმავე ჩარჩოშია** (`aspect-*` + `object-cover`):
   რეალური ზომა ბადეს არ ცვლის, ე.ი. ღილაკები აღარ ცურავს.

   ⚠️ **პრივატული დისკის ფაილი blob-ად იკითხება** (`usePrivateFileUrl`) და
   თითო უჯრა თვითონ ჭრის თავისას — hook-ს ციკლში ვერ დავიძახებთ, ამიტომ
   უჯრა ცალკე კომპონენტია და მისამართს `onResolved`-ით აბრუნებს (lightbox-ს
   ისიც სჭირდება).
   ============================================================ */

/** ერთი სტრიქონი „ფოტოს შესახებ" პანელში */
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
   * ასლი SPA-ში ერთ დღეს დაშორდებოდა.
   */
  private?: boolean
  title?: string | null
  subtitle?: string | null
  /**
   * „რა ვიცით ამ ფოტოზე" — ზომა, სახელი, ვისია, წყარო, თარიღი.
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
  /**
   * **ვიდეო** — უჯრა მის ესკიზს (`src`) ხატავს „▶"-ით და
   * ხანგრძლივობით, ლაითბოქსი კი `<video>`-ით უკრავს.
   *
   * ⚠️ `video.src` **პირდაპირი მისამართია** და არა blob: 300-მეგაბაიტიანი
   * ფაილი დაკვრამდე მთლიანად მეხსიერებაში ჩაიტვირთებოდა; პირდაპირ მისამართს
   * ბრაუზერი Range-ით კითხულობს (გადახვევაც ასე მუშაობს).
   */
  video?: { src: string; mime?: string | null; duration?: number | null }
  /** რჩეულია (`onFavorite` ცვლის) */
  favorite?: boolean
  /**
   * **სრული ზომის ფოტო ლაითბოქსისთვის** — ბადე `src`-ს (ესკიზს)
   * ხატავს, გახსნილი ხედი კი ამას. ⚠️ პირდაპირი მისამართია (ქუქით, როგორც
   * `video.src`): 15-მეგაბაიტიანი ფოტოს blob-ად წაკითხვა ყოველ გადასვლაზე
   * მეხსიერებას შეჭამდა.
   */
  full?: string
  /**
   * **ჩამოტვირთვის პირდაპირი მისამართი** — სერვერი `attachment`-ით
   * და ორიგინალი სახელით აბრუნებს; ⚠️ blob-ის გარეშე, რადგან 300-მეგაბაიტიანი
   * ვიდეო მეხსიერებაში არ უნდა ჩაიტვირთოს.
   */
  downloadUrl?: string
}

/** ამ სიგანიდან ფოტოს ზომა ლაითბოქსს გადაეცემა (ზუმის საზღვარი); ქვემოთ — ეკრანამდე იზრდება */
const LIGHTBOX_NATIVE_FROM = 1200

const PLUGINS = [Slideshow, Zoom, Thumbnails, Counter, Fullscreen, Video]

/* „რამდენი ფოტო გამოჩნდეს" — **ერთი ამრჩევი ყველგან, სადაც ფოტო ჩანს** (`PageSizePick`):
   4 სვეტის ჯერადები (12 · 16 · 20 · 24 · 32 · 48 · 80, ნაგულისხმევი 16) + „ყველა" + „სხვა";
   არჩევანი ბრაუზერშია (`usePhotoPageSize`). ⚠️ ჭერი სერვერისაა და არა ბადისა — მართულ
   რეჟიმში რიცხვი `per_page`-ად მიდის, რომელსაც `GalleryController::MAX_PER_PAGE` 1000-ზე
   ჩერდება (`PHOTO_PER_PAGE_MAX`). ადრე ზომები 10-ის ჯერადი იყო — 10 ფოტო = 4 + 4 + 2. */

/**
 * გახსნილი სლაიდის რამდენ მეზობელს წამოვიღებთ წინასწარ.
 *
 * ⚠️ პრივატულ ბადეზე უჯრა blob-ს მხოლოდ ეკრანზე გამოჩენისას კითხულობს,
 * lightbox-ში ისრით გადასვლა კი ეკრანს გარეთ დარჩენილ სლაიდზეც მიდის —
 * ბუფერის გარეშე ის ცარიელი დარჩებოდა.
 */
const PRELOAD_AROUND = 2

/** ჩამოტვირთვისთვის ხელით შექმნილი object URL-ის სიცოცხლე */
const REVOKE_AFTER_MS = 10_000

export function PhotoGrid({
  items,
  lightboxItems,
  privateDisk,
  readOnly,
  onDelete,
  onMove,
  onLocked,
  onPrimary,
  primaryId,
  onFavorite,
  extraActions,
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
   * გახსნილი ხედის სრული სია, თუ ბადე გვერდებადაა დაჭრილი:
   * ისრებით გადასვლა **გვერდის საზღვარს კვეთს**. მითითების გარეშე
   * lightbox მხოლოდ იმას ხედავს, რაც ბადეზეა.
   */
  lightboxItems?: PhotoItem[]
  /** ფაილები პრივატულ დისკზეა (`notes/`, `chat/`) — blob-ად იკითხება */
  privateDisk?: boolean
  /**
   * **კითხვის რეჟიმი — მხოლოდ ნახვა** (საჯარო პროფილის გალერეა).
   *
   * რჩება ის, რაც ფოტოს **სანახავად** სჭირდება: ლაითბოქსი, პირადი ფაილის
   * blob-ად წაკითხვა და ჩაკეტილი ფილა პაროლით (`onLocked`). ქრება
   * ხელსაწყოთა ზოლი (მონიშვნა · „ყველას ჩამოტვირთვა" · „რამდენი
   * გამოჩნდეს" · `extraTools`) და უჯრის მოქმედებები — ჩამოტვირთვა,
   * ორიგინალი, მონიშვნა.
   *
   * ⚠️ **ჩამწერ მოქმედებებს (`onDelete` · `onMove` · `onPrimary`) ბადე თვითონ
   * აშორებს** და არა მხოლოდ გამომძახებლის კეთილსინდისიერებით: ეს რეჟიმი
   * სხვის გვერდს ემსახურება, სადაც წაშლის ღილაკი არასდროს უნდა გაჩნდეს.
   *
   * ⚠️ **გვერდებს აქ გამომძახებელი ჭრის** („მეტის ჩვენება" სერვერიდან), ამიტომ
   * ის `pageSize={PAGE_ALL}`-ს გადასცემს — „რამდენი გამოჩნდეს" არჩევანი
   * ხომ ზოლთან ერთად ქრება.
   */
  readOnly?: boolean
  /** წაშლა — **ერთსაც და მონიშნულებსაც ერთი ხელმოწერით** */
  onDelete?: (ids: number[]) => void
  /**
   * გადატანა (მშობელი · ალბომი · უკატეგორიო).
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
  /** რჩეულის გადართვა (უჯრის ნიშანი და მენიუს პუნქტი) */
  onFavorite?: (id: number) => void
  /**
   * **მოდულის საკუთარი პუნქტები** (წარწერა) — გადატანისა და
   * წაშლის **წინ** ჯდება; `targets` მონიშვნის წესითაა (იხ. `photoActions()`).
   */
  extraActions?: (item: PhotoItem, targets: number[]) => PhotoAction[]
  emptyText?: string
  /** ცარიელი მდგომარეობის ხატულა/ახსნა/ღილაკები — იხ. `ui/empty-state.tsx` */
  emptyIcon?: ReactNode
  emptyHint?: ReactNode
  emptyActions?: ReactNode
  /**
   * გახსნილ ფოტოზე დამატებითი კონტროლი (მაგ. პირადი გალერეის „წარწერა").
   *
   * ⚠️ `close` ლაითბოქსს ხურავს: ლაითბოქსი (`--yarl__portal_zindex: 80`) მოდალზე
   * (60/61) მაღლაა, ე.ი. მისგან გახსნილი ფანჯარა მის ქვეშ დარჩებოდა.
   */
  lightboxExtra?: (item: PhotoItem, close: () => void) => ReactNode
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
   * ⚠️ **ref და არა state**. ყოველი უჯრის blob სხვა დროს
   * ჩნდება, ე.ი. state-ის შემთხვევაში 50-უჯრიანი ბადე `PhotoGrid`-ს
   * **50-ჯერ** ხატავდა თავიდან — ყოველ ჯერზე ყველა უჯრასთან და `slides`
   * memo-ს გადათვლასთან ერთად (მეზობლების წინასწარ წამოღებასთან ერთად ეს კვადრატულად იზრდებოდა).
   *
   * ⚠️ **რენდერისთვის ის საერთოდ არ არის საჭირო**: უჯრა თავის მისამართს
   * თვითონ იღებს (`usePrivateFileUrl`), რუკას კი მხოლოდ ორი მკითხველი
   * ჰყავს — `slides` (გახსნილი ხედი) და `download()` (ივენთ-ჰენდლერი).
   */
  const resolved = useRef<Record<number, string>>({})
  /** გადახატვის ბიძგი მხოლოდ მაშინ, როცა გახსნილ ხედს ახალი მისამართი სჭირდება */
  const [slideVersion, setSlideVersion] = useState(0)
  /* არამართული რეჟიმი: ბრაუზერში შენახული ზომა; ფიქსირებული `pageSize` (მაგ. „ყველა") — საწყისი */
  const [storedSize, setStoredSize] = usePhotoPageSize()
  const [ownSize, setOwnSize] = useState(pageSize)

  /* ⚠️ კითხვის რეჟიმში ჩამწერი მოქმედებები აქვე ქრება — ზოლიც და უჯრაც ამ
     სამს კითხულობს და არა პროპებს (იხ. `readOnly`) */
  const remove = readOnly ? undefined : onDelete
  const move = readOnly ? undefined : onMove
  const makePrimary = readOnly ? undefined : onPrimary
  const favorite = readOnly ? undefined : onFavorite

  const controlled = !!onPageSizeChange
  const size = controlled ? (pageSize ?? storedSize) : (ownSize ?? storedSize)
  /* ნომრები + „მეტის ჩვენება" (`useClientPages`); მართულ რეჟიმში სერვერი ჭრის.
     ⚠️ სიის შემცირებისას (ფილტრი, წაშლა) დიაპაზონი ბოლო არსებულ გვერდზე ჩამოდის — „მე-4
     გვერდი" ცარიელი აღარ რჩება */
  const pages = useClientPages(items, controlled ? PAGE_ALL : size)

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
   * მეზობლების blob-ები სწორედ მაშინ ჩნდება (წინასწარი
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
  const shown = pages.shown

  /**
   * გახსნილი ხედის სია — ბადეზე მეტიც შეიძლება იყოს.
   * ⚠️ არამართულ რეჟიმში lightbox **მთელ სიას** ხედავს და არა მიმდინარე
   * გვერდს, ე.ი. ისრები გვერდის საზღვარს კვეთს.
   */
  /* ⚠️ **ჩაკეტილი გახსნილ ხედში არ შედის** (2026-09-20): მისამართი არ
     აქვს, ე.ი. სლაიდი ცარიელი იქნებოდა და ისრებით მასზე გაჩერება
     „ლაითბოქსი გატყდა"-დ წაიკითხებოდა. */
  const viewable = (lightboxItems ?? items).filter((item) => !item.locked)

  /**
   * გახსნილი სლაიდი და მისი მეზობლები — მათი blob უჯრის ხილვადობის
   * მიუხედავად უნდა წამოვიდეს.
   *
   * ⚠️ მოქმედებს მხოლოდ **დახატულ** უჯრებზე: `viewable` ბადეზე მეტიც
   * შეიძლება იყოს, და სხვა გვერდის ფოტოს აქამდეც არ ჰქონდა
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
      viewable.map((item): Slide => item.video ? {
        /* ვიდეო `<video>`-ით; ⚠️ ზომა აუცილებელია (ბიბლიოთეკა ჩარჩოს მისით
           ზომავს), უცნობზე — 16:9 */
        type: 'video',
        sources: [{ src: item.video.src, type: item.video.mime ?? 'video/mp4' }],
        poster: urlOf(item) || undefined,
        width: item.width ?? 1280,
        height: item.height ?? 720,
      } : {
        // სრული ფოტო, თუ არის (ბადეში ესკიზია)
        src: item.full ?? urlOf(item) ?? '',
        alt: item.title ?? '',
        /* ⚠️ **პატარა ფოტოს ზომები არ გადაეცემა**: ლაითბოქსი ზუსტ ზომას
           ზღვრად იღებს და 600-პიქსელიანი ფოტო ეკრანის შუაში პატარა რჩებოდა. ზომების
           გარეშე ის ეკრანამდე იზრდება (`imageFit: contain`), დიდზე კი ზომა რჩება — ზუმის
           საზღვრისთვის. */
        width: item.width && item.width >= LIGHTBOX_NATIVE_FROM ? item.width : undefined,
        height: item.width && item.width >= LIGHTBOX_NATIVE_FROM ? (item.height ?? undefined) : undefined,
      }),
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
   * ⚠️ zip-ად შეკვრა ბიბლიოთეკას მოითხოვდა (jszip ~100 kB) და ეს საჭირო არ არის.
   *
   * ⚠️ **პრივატულზე ფაილი საჭიროების შემთხვევაში აქვე წამოვიდება**:
   * `resolved`-ში მხოლოდ **დახატული და ეკრანზე გამოჩენილი**
   * უჯრების blob-ებია, „ყველას მონიშვნა" კი სხვა გვერდსაც და ეკრანს გარეთ
   * დარჩენილსაც მოიცავს — ისინი ადრე **ჩუმად გამოტოვდებოდა** (ეს ხარვეზი
   * გვერდებისთვის აქამდეც არსებობდა).
   */
  const download = (ids: number[]) => {
    ids.forEach((id, index) => {
      const item = items.find((i) => i.id === id)
      if (!item) return

      setTimeout(async () => {
        /* ორიგინალი პირდაპირი მისამართით (`attachment`); ესკიზის blob-ს არ ვიღებთ */
        if (item.downloadUrl) {
          const link = document.createElement('a')
          link.href = item.downloadUrl
          link.download = item.title ?? String(id)
          document.body.appendChild(link)
          link.click()
          link.remove()

          return
        }

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
      {/* ---------- ხელსაწყოები ----------
          ⚠️ კითხვის რეჟიმში ზოლი საერთოდ არ არის: მასში ყველაფერი ან მონიშვნას,
          ან მასობრივ მოქმედებას, ან გვერდების ზომას ეხება — სამივე მფლობელისაა. */}
      {items.length > 0 && !readOnly && (
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

          {move && (
            <Button type="button" variant="outline" size="sm" onClick={() => move(targets)}>
              <MoveRight className="size-3.5" />
              {t(selected.length ? 'gallery.moveSelected' : 'gallery.moveAll', {
                count: targets.length,
              })}
            </Button>
          )}

          {remove && (
            <Button
              type="button"
              variant="destructiveOutline"
              size="sm"
              onClick={() => remove(targets)}
            >
              <Trash2 className="size-3.5" />
              {t(selected.length ? 'photos.deleteSelected' : 'photos.deleteAll', {
                count: targets.length,
              })}
            </Button>
          )}

          {extraTools}

          {/* „რამდენი გამოჩნდეს" — ყველგან, სადაც ფოტო ჩანს */}
          <PageSizePick
            className="ml-auto"
            size="sm"
            columns={PHOTO_COLUMNS}
            max={PHOTO_PER_PAGE_MAX}
            value={size}
            total={total ?? items.length}
            onChange={(next) => {
              pages.reset()
              if (onPageSizeChange) onPageSizeChange(next)
              else if (ownSize !== undefined) setOwnSize(next)
              else setStoredSize(next)
            }}
          />
        </div>
      )}

      {!items.length ? (
        /* ⚠️ **ცარიელი ბადე ცენტრირებული ბლოკია და არა ერთი ნაცრისფერი წინადადება**
           (შენი მითითება, 2026-09-12). `EmptyState` სწორედ ამისთვის დაიწერა,
           ბადემ კი მას არ იყენებდა — ე.ი. ცხრა მოდულზე მოწესრიგებული
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
              /* ⚠️ **მონიშნულზე მოქმედება მთელ მონიშვნაზეა**: მონიშნულ
                 ფოტოზე „წაშლა" ნიშნავს „ყველა მონიშნული", არამონიშნულზე —
                 მხოლოდ ამ ერთს. შეუქცევად მოქმედებაზე ორაზროვნება დაუშვებელია. */
              targets={selected.includes(item.id) && selected.length ? selected : [item.id]}
              /* ⚠️ ინდექსი **გახსნილი სიისაა** და არა ბადისა — გვერდებისას ისინი სხვაობს.
                 ⚠️ „გახსნა" ყოველთვის ლაითბოქსია: მონიშვნის რეჟიმის შემთხვევა
                 სურათის ღილაკშია, თორემ მენიუს „გახსნა" ზოგჯერ მონიშვნას
                 ნიშნავდა და პუნქტი თავის სახელს ატყუებდა. */
              onOpen={() => setOpen(viewable.findIndex((x) => x.id === item.id))}
              /* ⚠️ კითხვის რეჟიმში მონიშვნა და ჩამოტვირთვა არ არსებობს — უჯრა
                 მათ პუნქტებს ვეღარ დახატავს (`photoActions()`-ის წესი) */
              onToggle={readOnly ? undefined : () => toggle(item.id)}
              onDownload={readOnly ? undefined : download}
              readOnly={readOnly}
              onPrimary={
                makePrimary && item.canPrimary !== false ? () => makePrimary(item.id) : undefined
              }
              onFavorite={favorite ? () => favorite(item.id) : undefined}
              extraActions={readOnly ? undefined : extraActions}
              onMove={move}
              onDelete={remove}
              onResolved={noteResolved}
            />
            ),
          )}
        </ul>
      )}

      {/* გვერდები — მხოლოდ არამართულ რეჟიმში (მართულს სერვერის pager აქვს) */}
      {!controlled && pages.pagination.lastPage > 1 && <Pagination className="mt-4" {...pages.pagination} />}

      {open != null && (
        <Lightbox
          open
          close={() => setOpen(null)}
          index={open}
          on={{ view: ({ index }) => setOpen(index) }}
          slides={slides}
          plugins={PLUGINS}
          // ფოტო ყოველთვის ცენტრშია და ეკრანამდე იზრდება
          carousel={{ imageFit: 'contain' }}
          // ⚠️ „ყველას ჩვენება" — ესკიზების ზოლი გახსნილივე რჩება
          thumbnails={{ position: 'bottom', showToggle: true }}
          slideshow={{ delay: 3500 }}
          zoom={{ maxZoomPixelRatio: 4 }}
          video={{ controls: true, playsInline: true, preload: 'metadata' }}
          toolbar={{
            buttons: [
              ...(lightboxExtra && viewable[open]
                ? [<span key="extra">{lightboxExtra(viewable[open], () => setOpen(null))}</span>]
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
 * ## მოქმედებები
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

  /* ⚠️ **ფიქსირებული ჩარჩო, როგორც ჩვეულებრივ უჯრას** (`object-cover`):
     რეალური პროპორცია რიგებს უთანასწოროს ხდიდა და განბლოკვის შემდეგ უჯრა ფორმას
     იცვლიდა — ბადე ხტებოდა. */
  return (
    <li className="relative flex h-full flex-col justify-center overflow-hidden rounded-xl border border-border bg-muted">
      <button
        type="button"
        onClick={onOpen}
        title={t('gallery.albumUnlock')}
        aria-label={t('gallery.albumUnlock')}
        className={cn(
          'relative block w-full cursor-pointer',
          item.portrait ? 'aspect-[2/3]' : 'aspect-video',
        )}
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
  readOnly,
  preload,
  picking,
  checked,
  isPrimary,
  targets,
  onOpen,
  onToggle,
  onDownload,
  onPrimary,
  onFavorite,
  extraActions,
  onMove,
  onDelete,
  onResolved,
}: {
  item: PhotoItem
  index: number
  privateDisk?: boolean
  /** კითხვის რეჟიმი — „ორიგინალიც" ქრება (იხ. `PhotoGrid`-ის `readOnly`) */
  readOnly?: boolean
  /** გახსნილი სლაიდის მეზობელია — blob ხილვადობის მოლოდინის გარეშე მოდის */
  preload: boolean
  picking: boolean
  checked: boolean
  isPrimary: boolean
  /** რომელ id-ებზე იმოქმედებს ჩამოტვირთვა/წაშლა — იხ. მონიშვნის წესი ზემოთ */
  targets: number[]
  onOpen: () => void
  /** მითითების გარეშე (კითხვის რეჟიმი) უჯრა არ ინიშნება */
  onToggle?: () => void
  /** მითითების გარეშე (კითხვის რეჟიმი) ჩამოტვირთვის პუნქტი არ იხატება */
  onDownload?: (ids: number[]) => void
  onPrimary?: () => void
  onFavorite?: () => void
  extraActions?: (item: PhotoItem, targets: number[]) => PhotoAction[]
  onMove?: (ids: number[]) => void
  onDelete?: (ids: number[]) => void
  /** ⚠️ id-საც გადმოსცემს, რომ მშობლის callback სტაბილური იყოს */
  onResolved: (id: number, url: string) => void
}) {
  const { t } = useTranslation()
  const [info, setInfo] = useState(false)

  /* ⚠️ **პრივატული ფაილი მხოლოდ ეკრანზე გამოჩენისას იკითხება.**
     `loading="lazy"` აქ არაფერს შველის — მისამართი blob-ია და fetch-ს JS
     აკეთებს, ე.ი. „ყველა"-ს არჩევაზე ბადე ერთდროულად ასობით ავტორიზებულ
     `GET`-ს უშვებდა: გვერდი 600/წთ გლობალურ ლიმიტზე **თავად ითროთლებოდა**
     და მეხსიერებაც blob-ებით ივსებოდა. */
  const [tileRef, inView] = useInViewOnce<HTMLLIElement>()
  const blob = usePrivateFileUrl(privateDisk && (inView || preload) ? item.src : null)
  const url = privateDisk ? blob.url : (storageUrl(item.src) ?? item.src)

  useEffect(() => {
    if (url) onResolved(item.id, url)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- მისამართის მოსვლაზე ვატყობინებთ ერთხელ; onResolved სტაბილურია
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
    onDownload: onDownload && (() => onDownload(targets)),
    /* ⚠️ **ორიგინალი პრივატულზე არ იხატება** — იქ მისამართი blob-ია და ახალ
       ტაბში გახსნილი ბმული ამ გვერდთან ერთად კვდება; წესი `photoActions()`-შია,
       ე.ი. ერთხელ წერია და ტესტიც აქვს. კითხვის რეჟიმში კი საერთოდ არ არის —
       ფოტოს სანახავად ლაითბოქსი საკმარისია (zoom · სრული ეკრანი). */
    onOriginal: !readOnly && url ? () => window.open(url, '_blank', 'noopener,noreferrer') : undefined,
    onToggle,
    onFavorite,
    favorite: item.favorite,
    extra: extraActions?.(item, targets),
    onMove: onMove && (() => onMove(targets)),
    onDelete: onDelete && (() => onDelete(targets)),
  })

  /* ⚠️ **მხოლოდ „გახსნა" მენიუ არ არის** (კითხვის რეჟიმი): იმავეს
     სურათზე დაჭერაც აკეთებს, ე.ი. ერთპუნქტიანი „⋯" და მარჯვენა კლიკის მენიუ
     მხოლოდ იმავე ღილაკს გაიმეორებდა. მართვის რეჟიმში სიაში ყოველთვის მეტია
     (ჩამოტვირთვა, მონიშვნა), ე.ი. იქ აქედან არაფერი იცვლება. */
  const menu = actions.length > 1
  const quick = actions.filter((action) => action.quick)
  const caption = item.subtitle ?? item.title

  /* ⚠️ ცარიელი ქვედა ზოლი არ იხატება: კითხვის რეჟიმში შეიძლება არც წარწერა
     იყოს და არც მოქმედება, ცარიელი ზოლი კი ყველა ფილას ერთსა და იმავე
     უაზრო კიდეს მიაბამდა. */
  const footer = menu || quick.length > 0 || isPrimary || !!caption || item.size != null

  return (
    <ContextMenu>
      {/* ⚠️ მენიუს გარეშე მარჯვენა კლიკი ბრაუზერისაა — `disabled` Radix-ს
          `preventDefault()`-ს აღარ აკეთებინებს და ცარიელი მენიუ არ ჩნდება */}
      <ContextMenuTrigger asChild disabled={!menu}>
        <li
          ref={tileRef}
          /* ⚠️ **`flex h-full flex-col`**: ერთ რიგში პორტრეტი ლანდშაფტის გვერდითაა და
             ბადე უჯრას რიგის სიმაღლემდე ჭიმავს — ფოტო ახლა შუაშია (`flex-1`
             ჩარჩო), წარწერა და ღილაკები კი რიგის ყველა უჯრაში ერთ ქვედა ხაზზე */
          className={cn(
            'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-colors',
            checked ? 'border-primary' : 'border-border',
          )}
        >
          <div className="flex flex-1 flex-col justify-center bg-muted/40">
          <button
            type="button"
            // მონიშვნის რეჟიმში სურათზე დაჭერა ნიშნავს „მონიშნე", და არა „გახსენი"
            onClick={picking ? onToggle : onOpen}
            aria-label={item.title ?? String(index + 1)}
            /* ფიქსირებული ჩარჩო — რეალური ზომა ბადეს არ ცვლის */
            className={cn('relative block w-full cursor-pointer bg-muted', item.portrait ? 'aspect-[2/3]' : 'aspect-video')}
          >
            {url && (
              <img
                src={url}
                alt={item.title ?? ''}
                loading="lazy"
                className="size-full object-cover transition-transform group-hover:scale-[1.02]"
              />
            )}
            {/* ვიდეო: ესკიზის გარეშე (ffmpeg არ არის) — ხატულა; ესკიზზე — „▶" და ხანგრძლივობა */}
            {item.video && !url && (
              <span className="absolute inset-0 grid place-items-center text-muted-foreground">
                <Film className="size-8" />
              </span>
            )}
            {item.video && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="grid size-11 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm">
                  <Play className="ml-0.5 size-5 fill-current" />
                </span>
              </span>
            )}
            {item.video?.duration ? (
              <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                {formatDuration(item.video.duration)}
              </span>
            ) : null}
          </button>
          </div>
          {item.favorite && (
            <span
              className="pointer-events-none absolute left-2 top-2 grid size-6 place-items-center rounded-md bg-black/55 text-favorite"
              title={t('filter.favorite')}
            >
              <Star className="size-3.5 fill-current" />
            </span>
          )}

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

          {/* ---------- „ფოტოს შესახებ" ---------- */}
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

          {footer && (
            <div className="mt-auto space-y-2 px-2.5 py-2">
              {(caption || item.size != null || isPrimary) && (
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {/* ⚠️ „ეს მთავარია" **ნიშანია და არა ღილაკი** — მოქმედება, რომელიც ვერ იმუშავებს, სიაშიც აღარაა */}
                  {isPrimary && (
                    <Star className="size-3.5 shrink-0 fill-primary text-primary" aria-label={t('gallery.isPrimary')} />
                  )}
                  <span className="truncate">{caption}</span>
                  {item.size != null && <span className="ml-auto shrink-0 tabular-nums">{formatBytes(item.size)}</span>}
                </p>
              )}

              {/* რჩეული · წაშლა — `h-9` ღილაკები ტექსტით (ჩანაწერის ბარათის ზომა) + ⋯;
                  დანარჩენი (გახსნა, შესახებ, მთავარად, ჩამოტვირთვა…) მენიუშია */}
              {(quick.length > 0 || menu) && (
                <div className="flex items-center gap-1.5 [&>*]:h-9" data-testid="photo-actions">
                  {quick.map((action) =>
                    action.key === 'favorite' ? (
                      <FavoriteButton key={action.key} active={!!item.favorite} onToggle={action.run} className="min-w-0 flex-1" />
                    ) : (
                      <Button
                        key={action.key}
                        type="button"
                        variant={action.danger ? 'destructiveOutline' : 'outline'}
                        size="sm"
                        className="min-w-0 flex-1"
                        title={action.label}
                        onClick={action.run}
                      >
                        <action.icon className={cn('size-3.5', action.iconClassName)} />
                        <span className="truncate">{action.key === 'delete' ? t('confirm.delete') : action.label}</span>
                      </Button>
                    ),
                  )}

                  {/* ⚠️ **„⋯" კლავიატურის გზაა** — მარჯვენა კლიკი მალსახმობია და არა
                      ერთადერთი კარი (სენსორული ეკრანი, Tab-ნავიგაცია) */}
                  {menu && (
                    <ActionMenu
                      label={t('actions.more')}
                      trigger={
                        <Button type="button" variant="outline" size="sm" className="ml-auto w-9 shrink-0 px-0 text-muted-foreground">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      }
                    >
                      {actions.map((action) => (
                        <ActionMenuClose key={action.key} asChild>
                          <button
                            type="button"
                            onClick={action.run}
                            className={actionItemClass(action.danger ? 'destructive' : undefined)}
                          >
                            <action.icon className={cn('size-3.5', action.iconClassName)} />
                            {action.label}
                          </button>
                        </ActionMenuClose>
                      ))}
                    </ActionMenu>
                  )}
                </div>
              )}
            </div>
          )}
        </li>
      </ContextMenuTrigger>

      {/* ⚠️ იგივე სია — მარჯვენა კლიკზე. `LAYER_POPUP` `ContextMenuContent`-შია,
          ე.ი. ბადე მოდალის ან ლაითბოქსის შიგნითაც სწორად იხატება. */}
      <ContextMenuContent>
        {actions.map((action) => (
          <Fragment key={action.key}>
            {action.danger && <ContextMenuSeparator />}
            <ContextMenuItem
              onSelect={action.run}
              className={action.danger ? 'text-destructive focus:bg-destructive/10' : undefined}
            >
              <action.icon className={cn('size-3.5', action.iconClassName)} />
              {action.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
