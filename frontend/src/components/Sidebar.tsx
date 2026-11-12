import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ArchiveRestore,
  ArrowLeftRight,
  BellRing,
  ChartColumn,
  ChevronDown,
  Clapperboard,
  DownloadCloud,
  Inbox,
  KeyRound,
  Languages,
  LayoutDashboard,
  Library,
  ListChecks,
  MessageSquare,
  ListMusic,
  Plus,
  Puzzle,
  ScrollText,
  Share2,
  ShieldCheck,
  Tags,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { MEDIA, mediaFromPath, type MediaType } from '@/lib/media'
import {
  MODULE_ACCENT_FALLBACK,
  PAGE_MODULE_KEYS,
  isMediaKey,
  modAccent,
  moduleName,
  useModules,
} from '@/lib/modules'
import { TOOL_SECTIONS, toolAccent } from '@/lib/toolSections'
import { fetchChatUnread } from '@/api/chat'
import { useAuth } from '@/lib/auth'
import { useSettings } from '@/lib/settings'
import { fetchPendingCount, type ModuleInfo } from '@/api/account'
import { ModuleIcon } from './ModuleIcon'
// გალერეის ჭრილების ერთადერთი სია (გვერდზეც იგივეა)
import { GALLERY_CUTS } from '@/lib/galleryCuts'
import { ACTOR_VIEWS, actorViewOf, actorViewPath } from '@/lib/actorViews'
import { PERSONAL_CUTS } from '@/lib/personalCuts'
import { cn } from '@/lib/utils'
import { statusName, useCustomStatusMap, useStatusMap } from '@/lib/statuses'
import {
  ALL_SECTION_COLOR,
  FAVORITE_SECTION_COLOR,
  arrangeSections,
  layoutFor,
  pseudoSectionsFor,
  sectionSearch,
} from '@/lib/statusSections'
import { STATUS_PALETTE, statusColor } from '@/lib/statusColor'
// ⚠️ `App.tsx` ამას ისედაც სტატიკურად აიმპორტებს — ე.ი. საწყის chunk-ს არაფერი ემატება
import { DICTIONARIES } from '@/lib/dictionaries'
import { useContentLang } from '@/lib/settings'
import { isStatusDomain, type StatusDomainKey } from '@/api/statuses'
import { isCustomModule } from '@/lib/customModules'


/**
 * საიდბარის ერთი სექცია.
 * რიგი და ხილვადობა `lib/statusSections.ts`-იდან მოდის — „ყველა" და „რჩეული"
 * ნაგულისხმევად პირველი/ბოლოა, მაგრამ მომხმარებელი ლექსიკონის გვერდზე
 * მათ ადგილს ცვლის და ნებისმიერ სექციას მალავს.
 */
/** მოდულის ქვეპუნქტი; ⚠️ `color` სავალდებულოა — იხ. `SubItem` */
type VideoSection = {
  id: string
  label: string
  icon?: string | null
  color: string
  search: string
  /** ბმული ცალკე გვერდზე (მოდულის მისამართს ემატება) — პუნქტი სიას არ ავიწროებს */
  path?: string
}

/**
 * დომენი მხოლოდ დომენის საკუთარი მარშრუტებისთვის — /genres, /status, /actors
 * არც ერთ დომენს არ ეკუთვნის, ამიტომ null (სექციების ავტო-გადართვა არ უნდა გამოიწვიოს).
 * ⚠️ `/` აღარ ეკუთვნის ფილმებს — ის დეშბორდია.
 */
function domainFromRoute(pathname: string): MediaType | null {
  return mediaFromPath(pathname)
}

/* ============================================================
   **მოდულის ფერი საიდბარში.**

   ფერი `modules.color`-შია (გლობალური სვეტი, არა `module_user.settings`) და
   აქ **იმავე `useModules()`-იდან** მოდის, საიდანაც სახელი და ხატულა — ფრონტზე
   მეორე სია იმავე დღეს გაშორდებოდა ბაზას.

   ⚠️ **Tailwind კლასს hex-იდან ვერ დაბადებს**: `border-l-[#6366f1]` კომპილაციისას
   არ არსებობს. ამიტომ ფერი inline `style`-ით ორ CSS-ცვლადად ჩამოდის
   (`--mod` და მისი სუსტი ტონი `--mod-soft`), კლასები კი სტატიკურია
   (`hover:border-l-[var(--mod)]`) — ჰოვერი მხოლოდ CSS-ით ითქმება, JS-ით არა.

   ⚠️ **ცვლადი მემკვიდრეობით მიდის**: `<nav>`-ზე ნაგულისხმევად ოქროსფერია,
   ე.ი. `color === null`-ზე რიგი დღევანდელ სახეს ინარჩუნებს და
   დეშბორდიც იმავე ენაზე ლაპარაკობს.

   ⚠️ **ფერი აქცენტია და არა ტექსტის ფერი** — მხოლოდ მარცხენა ხაზი, ხატულა და
   აქტიური ქვე-პუნქტის სუსტი ფონი; ღია მწვანე სახელს ნათელ თემაზე წაუკითხავს
   გახდიდა.
   ============================================================ */
/* ⚠️ **`border-l-transparent` მხოლოდ არააქტიურ ვარიანტშია და არა აქ.**
   ორივე კლასი `border-left-color`-ს წერს ერთი და იმავე სპეციფიკურობით, CSS-ში
   კი `.border-l-transparent` **`.border-l-[var(--mod)]`-ის შემდეგ** დგება
   (შემოწმდა `dist/assets/*.css`-ში) — ე.ი. საერთო კლასში დატოვებული ის
   აქტიურ ხაზს ჩუმად გამჭვირვალეს ტოვებდა. სიგანე (`border-l-2`) საერთოა,
   რომ რიგები 2px-ით არ იცვლებოდნენ. */
const MODULE_ROW =
  'flex w-full cursor-pointer items-center gap-2 rounded-md border-l-2 px-2.5 py-2 text-sm font-semibold transition-colors'
const MODULE_ROW_ACTIVE = 'border-l-[var(--mod)] text-foreground'
const MODULE_ROW_IDLE =
  'border-l-transparent text-muted-foreground hover:border-l-[var(--mod)] hover:text-foreground'
/* ============================================================
   **ქვე-პუნქტისა და ინსტრუმენტის რიგი — აქტიური მდგომარეობა (2026-09-15).**

   შენი სიტყვები: „ქვედა მენიუებში, როდესაც შესულია, არ ეტყობა, რომ იმ
   მენიუზე დგას — რომელია აქტიური". ორი სხვადასხვა ხარვეზი იყო:

   1. **ინსტრუმენტების რიგებს (ლექსიკონები, სინქრონი, ჩატი, ადმინის
      ხუთეული…) აქტიური მდგომარეობა საერთოდ არ ჰქონდათ** — `/roles`-ზე
      მდგომიც ზუსტად ისე იხატებოდა, როგორც დანარჩენი თოთხმეტი. ფერი
      მხოლოდ ჰოვერზე ჩნდებოდა, ე.ი. თაგვის აღებისთანავე ქრებოდა.
   2. **ქვე-პუნქტის მონიშვნა `--mod-soft`-ით ხდებოდა** (16%) — თითქმის
      უხილავი, თანაც ხაზის გარეშე, ე.ი. „ნანახი" და „ყველა" ერთნაირად
      გამოიყურებოდა.

   ⚠️ **ორივე ერთსა და იმავე ენაზე ლაპარაკობს, რითიც მოდულის რიგები**:
   მარცხენა 2px ხაზი მოდულის ფერში + იმავე ფერის ფონი + ხატულა აქცენტში.
   მესამე ვიზუალური ენა აქ ზუსტად იმას დაბადებდა, რასაც შენიშვნა ასწორებს.

   ⚠️ **ფონი `--mod-fill`-ია და არა `--mod-soft`** — იხ. `lib/modules.tsx`:
   სუსტი ტონი ბარათის ხატულის ფილისაა, მონიშვნას კი ძლიერი სჭირდება.

   ⚠️ **`border-l-transparent` მხოლოდ არააქტიურ ვარიანტშია** (მოდულის
   რიგების იგივე ხაფანგი): ორივე კლასი `border-left-color`-ს წერს ერთი და
   იმავე სპეციფიკურობით, CSS-ში კი `.border-l-transparent` შემდეგ დგება —
   საერთო კლასში დატოვებული ის აქტიურ ხაზს ჩუმად გამჭვირვალეს ტოვებს.
   ============================================================ */
const SUB_ROW =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-md border-l-2 px-3 py-1.5 text-sm transition-colors'
const SUB_ROW_ACTIVE = 'border-l-[var(--mod)] bg-[var(--mod-fill)] font-semibold text-foreground'
const SUB_ROW_IDLE =
  'border-l-transparent text-muted-foreground hover:bg-muted hover:text-foreground'

/** შეხსენებებისა და ფლეილისტების პუნქტები — მოდულის სექციებს შორის დგას */
const PLAYLISTS_COLOR = 'var(--tool-chat)'
const REMINDERS_COLOR = 'var(--status-towatch)'

/**
 * **ქვეპუნქტი — ერთი კომპონენტი, და ფერი მასში სავალდებულოა.**
 *
 * ⚠️ აიქონი **ყოველთვის** ფერადია და არა მხოლოდ აქტიურ მდგომარეობაში: ადრე
 * არააქტიური პუნქტის აიქონი ნაცრისფერი იყო, ე.ი. მენიუ ერთი ნაცრისფერი სვეტი
 * ჩანდა და სტატუსის საკუთარი ფერი (`statuses.color`) საერთოდ არ გამოიყენებოდა.
 * `color` ტიპით სავალდებულოა — ფერის გარეშე პუნქტი ვეღარ დაიწერება: სტატუსი
 * თავის ფერს აწვდის, ფსევდო-განყოფილება და ჭრილი — თავის აღწერაში ჩაწერილს
 * (`statusSections.ts`, `galleryCuts.ts`, `personalCuts.ts`).
 *
 * ⚠️ აქტიური პუნქტი ხაზითა და ფონით ჩანს (მოდულის ფერში), აიქონი კი თავის
 * ფერს ინარჩუნებს — „რომელია" და „რომელზე ვდგავარ" ორი სხვადასხვა ნიშანია.
 * ⚠️ ფერი inline `style`-ია: Tailwind კლასს ცვლადიდან ვერ დაბადებს.
 */
function SubItem({
  active,
  color,
  icon,
  label,
  to,
  onClick,
}: {
  active: boolean
  /** აიქონის ფერი — CSS-მნიშვნელობა (`var(--…)` ან `#rrggbb`) */
  color: string
  /** მოდულის აიქონის სახელი (`ModuleIcon`) ან lucide-კომპონენტი */
  icon: string | LucideIcon | null | undefined
  label: string
  /** ბმული; მის გარეშე პუნქტი ღილაკია (მისამართს `onClick` ცვლის) */
  to?: string
  onClick: () => void
}) {
  const Icon = typeof icon === 'string' || icon == null ? null : icon
  const body = (
    <>
      {Icon ? (
        <Icon className="size-4 shrink-0" style={{ color }} />
      ) : (
        <ModuleIcon name={icon as string | null | undefined} className="size-4 shrink-0" style={{ color }} />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </>
  )
  const className = cn(SUB_ROW, active ? SUB_ROW_ACTIVE : SUB_ROW_IDLE)

  return to !== undefined ? (
    <Link to={to} onClick={onClick} className={className} data-sub-item>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className} data-sub-item>
      {body}
    </button>
  )
}

/**
 * „დამატება" — **მოქმედებაა და არა ჭრილი**, ე.ი. აქტიური მდგომარეობა არ
 * აქვს: ის მისამართს არ შეესაბამება, უბრალოდ ფორმას ხსნის.
 */
const SUB_ADD = cn(SUB_ROW, 'border-l-transparent text-primary hover:bg-muted')

/** ინსტრუმენტების რიგი (მოდულების მიღმა) — იგივე ენა, სხვა ზომა */
const TOOL_ROW =
  'flex w-full items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors [&>svg]:text-[var(--mod)]'
const TOOL_ROW_ACTIVE = 'border-l-[var(--mod)] bg-[var(--mod-fill)] font-medium text-foreground'
const TOOL_ROW_IDLE =
  'border-l-transparent text-muted-foreground hover:border-l-[var(--mod)] hover:bg-muted hover:text-foreground'

/* ⚠️ `modAccent()` `lib/modules.tsx`-შია — იმავე ცვლადებს აუდიტ-ლოგის
   ბარათებიც კითხულობს, ე.ი. ორი ასლი გაშორდებოდა.
   ფერის გარეშე მოდული ცვლადს **არ** წერს და `<nav>`-ის ოქროსფერს იმემკვიდრებს. */

/**
 * **ინსტრუმენტების რიგის ტონები** (2026-09-15, შენი მითითებით).
 *
 * ⚠️ **ოჯახებად და არა თითო თავისი ფერით.** თერთმეტივეს უნიკალური ფერი
 * რომ მიგვეცა, ფერი აზრს დაკარგავდა — რიგი ცისარტყელა გამოვიდოდა.
 * ამიტომ ტონი *ჯგუფს* ეკუთვნის: ჩემი ლექსიკონი ოქროსფერია, გლობალური
 * ჟანრები ქარვისფერი (ეს ორი განზრახ ჰგავს და მაინც განსხვავდება — იხ.
 * ქვემოთ კომენტარი), მონაცემთა ოპერაციები ლურჯი/ნარინჯისფერი, სოციალური
 * ფენა იისფერი, ადმინის ხუთეული ერთი ნეიტრალური მელნისფერი, წაშლა წითელი.
 *
 * ⚠️ **მნიშვნელობები თემის ტოკენებია და არა hex-ები** — მუქ თემაზე
 * თვითონვე იცვლება და მეორე პალიტრა არ იბადება.
 *
 * ⚠️ **ანიმაცია აქ არ იწერება**: ხატულები `index.css`-ის გლობალურ წესს
 * ემორჩილება (თითოეულს თავისი მოძრაობა აქვს) — რიგს მხოლოდ ფერი სჭირდება.
 */
/* ინსტრუმენტების ფერები **საერთო რეესტრიდან** (`lib/toolSections.ts`).
   ⚠️ აქ დაწერილი პირადი რუკა გვერდის ჰედერს ვერ სწვდებოდა, ე.ი. იმავე
   სექციას საიდბარი ფერავდა და სათაური — არა; ორი ასლი კი პირველივე
   ცვლილებაზე დაშორდებოდა. */

/**
 * **„ყველა · რჩეული · დამატება" — სტატუსის სექციების გარეშე**.
 *
 * ⚠️ წიგნზე, სამაგიდოსა და თამაშზე ეს **შეგნებული გადახრაა საერთო წესიდან**
 * (შენი მითითებით): სტატუსით ჭრა ფილტრების პანელშია. კურსი და ადგილი
 * მოგვიანებით შემოვიდა — აქამდე მენიუში ჩვეულებრივი ბმული იყო, ე.ი. „რჩეული" და
 * „დამატება" მხოლოდ გვერდიდან იყო მისაწვდომი, თუმცა ორივე გვერდი
 * `?view=favorite`-სა და `?new=1`-ს უკვე კითხულობდა.
 */
const FAVORITE_ONLY_MODULES: ReadonlySet<string> = new Set(['book', 'board_game', 'game', 'course', 'place'])

/** საკუთარი გვერდის მქონე არა-მედია მოდულები (`App.tsx`-ის რეესტრი) — ერთი რიგის ციკლისთვის */
const PAGE_KEYS: ReadonlySet<string> = new Set(PAGE_MODULE_KEYS)

/** `<nav>`-ის ნაგულისხმევი აქცენტი — `lib/modules.tsx`-იდან, ერთი წყარო */
const NAV_DEFAULT_ACCENT = MODULE_ACCENT_FALLBACK

/**
 * ნავიგაცია. ლოგო, ენა/თემა და პროფილი ჰედერშია — აქ მხოლოდ მენიუა.
 * უჯრის (mobile drawer) მდგომარეობა `AppShell`-შია, რომ ჰედერის ჰამბურგერმაც მართოს.
 */
export function Sidebar({
  drawerOpen,
  onDrawerChange,
}: {
  drawerOpen: boolean
  onDrawerChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { mediaModules, pageModules, customModules, enabled, has } = useModules()
  const { settings } = useSettings()
  const lang = useContentLang(i18n.language)
  /* სტატუსები per-user ლექსიკონია, ე.ი. სექციები აქედან იგება.
     ⚠️ `useStatusMap` ყოველთვის ექვს query-ს ქმნის და მხოლოდ `enabled`-ს ცვლის —
     ციკლის შიგნით პირობითი hook რიგს გატეხდა. */
  const statusMap = useStatusMap(enabled.map((m) => m.key))
  /* პირადი მოდულების ლექსიკონები: მათი რიცხვი ცვალებადია, ამიტომ ცალკე
     (`useQueries`), იმავე ქეშის გასაღებით, რასაც ფორმა და კლასიფიკატორი კითხულობს */
  const customStatusMap = useCustomStatusMap(customModules.map((m) => m.key as StatusDomainKey))
  const { isAdmin, canAdmin } = useAuth()
  const setDrawerOpen = onDrawerChange
  // პირველ შესვლაზე ყველა სექცია ჩაკეცილია
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const routeDomain = domainFromRoute(location.pathname)
  const isLibraryRoute = !!routeDomain && location.pathname === MEDIA[routeDomain].libraryPath
  // `?view=`-ის გარეშე ბიბლიოთეკა ნაგულისხმევ სექციას ხსნის —
  // მონიშვნაც იმავეს უნდა მიჰყვეს, თორემ „ყველა" აირჩეოდა ცრუდ
  const viewParam = params.get('view') ?? settings.defaultView

  /**
   * ჩანაწერის გვერდზე `?view=` აღარ არის, ამიტომ მონიშვნა „ყველაზე" ხტებოდა.
   * ვიმახსოვრებთ, რომელი კატეგორიიდან შემოვედით და დეტალურ გვერდზე იმას ვინარჩუნებთ.
   */
  const [lastView, setLastView] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!isLibraryRoute || !routeDomain) return
    setLastView((v) => (v[routeDomain] === viewParam ? v : { ...v, [routeDomain]: viewParam }))
  }, [isLibraryRoute, routeDomain, viewParam])

  const activeView = isLibraryRoute
    ? viewParam
    : routeDomain
      ? (lastView[routeDomain] ?? 'all')
      : 'all'

  /* ⚠️ **ტიპებისა და ჟანრების ჩამოტვირთვა აქედან მოიხსნა.**
     საიდბარი ლექსიკონის სრულ სიას აღარ აჩვენებს, ე.ი. მისი წაკითხვაც
     აღარ სჭირდება — ორი ზედმეტი რექვესთი ყოველ გვერდის გახსნაზე. სიები
     ფილტრების პანელშია, სადაც ისინი მართლა გამოიყენება. */

  // ჩატის წაუკითხავი; polling მსუბუქია (მხოლოდ რიცხვი)
  const { data: chatUnread = 0 } = useQuery({
    queryKey: ['chat-unread'],
    queryFn: fetchChatUnread,
    refetchInterval: 30_000,
  })

  // ადმინის badge — რამდენი მოთხოვნაა რიგში
  const { data: pending = 0 } = useQuery({
    queryKey: ['pending-count'],
    queryFn: fetchPendingCount,
    // endpoint მოთხოვნების სექციისაა და არა „ადმინის" ზოგადად
    enabled: canAdmin('requests'),
    refetchInterval: 60_000,
  })

  // დომენის შეცვლაზე: აქტიური სექცია გაიშალოს, დანარჩენი ჩაიკეცოს.
  const prevDomain = useRef(routeDomain)
  useEffect(() => {
    if (!routeDomain || routeDomain === prevDomain.current) return
    prevDomain.current = routeDomain
    setOpen(Object.fromEntries(mediaModules.map((m) => [m.type, m.type === routeDomain])))
  }, [routeDomain, mediaModules])

  /**
   * **მიმდინარე მარშრუტის განყოფილება თვითონ იშლება** (2026-09-15).
   *
   * ⚠️ აქტიური ქვე-პუნქტის მონიშვნას აზრი არ აქვს, თუ განყოფილება
   * დაკეცილია: `/videos`-ზე შესული ხედავდა ჩაკეცილ „ვიდეოებს" და ვერ
   * ხედავდა, რომელ ჭრილში იდგა. მედია-დომენებს ეს უკვე ჰქონდათ
   * (`prevDomain`-ის ეფექტი) — დანარჩენებს არა.
   *
   * ⚠️ **მხოლოდ ხსნის და არასოდეს კეცავს**: ხელით გახსნილი მეორე
   * განყოფილება მომხმარებლის განზრახვაა და მარშრუტის შეცვლა მას არ
   * ეკუთვნის (მედიის ეფექტისგან განსხვავებით, სადაც დომენი მართლა იცვლება).
   */
  const routeSection = useMemo(() => {
    // პლეილისტები სიმღერების ქვე-სექციაა, გალერეას კი `route_base`-ს მიღმა ჭრილები აქვს
    if (location.pathname.startsWith('/playlists')) return 'song'
    if (location.pathname.startsWith('/gallery')) return 'gallery'
    // პირადი მოდულიც (`/c/{key}`) თავის განყოფილებას ხსნის
    const m = [...pageModules, ...customModules].find(
      (x) => location.pathname === x.route_base || location.pathname.startsWith(`${x.route_base}/`),
    )
    return m?.key ?? null
  }, [location.pathname, pageModules, customModules])

  useEffect(() => {
    if (!routeSection) return
    setOpen((o) => (o[routeSection] ? o : { ...o, [routeSection]: true }))
  }, [routeSection])

  const setView = (libraryPath: string, v: string) => {
    const n = new URLSearchParams()
    if (v !== 'all') n.set('view', v)
    navigate({ pathname: libraryPath, search: n.toString() })
    setDrawerOpen(false)
  }

  /**
   * **სექციები აღარ წერია კოდში.** სტატუსი per-user ლექსიკონია,
   * ე.ი. საიდბარის ჭრილებიც მისგან იგება: ყველა → *მისი* სტატუსები → რჩეული.
   * ⚠️ „ყველა" და „რჩეული" სტატუსები **არაა** — ისინი ფსევდო-განყოფილებებია.
   *
   * ⚠️ **რიგი და დამალვა ლექსიკონის გვერდის `arrangeSections()`-იდანაა**,
   * ზუსტად იმავე ფუნქციიდან, რომელიც `/dictionaries/<domain>-statuses`-ის სიას
   * ხატავს — ორ ადგილას ხელით რომ ეწერა, გვერდი ერთ რიგს აჩვენებდა,
   * საიდბარი მეორეს. დამალული სექცია **მხოლოდ აქ** ქრება.
   *
   * ⚠️ **მოდულის შიგნით ლექსიკონის არცერთი ბმული აღარ არის** (შენი მითითება:
   * ჯერ სტატუსებზე 2026-09-14, მერე დანარჩენებზე 2026-09-15). სტატუსები,
   * ტიპები, ჟანრები და კატეგორიები ერთ სექციაშია — `/dictionaries` —, ე.ი.
   * მოდულში ჩაწერილი „მართვა" იმას იმეორებდა, რაც იქ ისედაც ბარათად წერია,
   * და ერთსა და იმავე გვერდზე ორ გზას ბადებდა. წაიშალა შვიდივე: ვიდეოს
   * ტიპები, სიმღერის/წიგნის/ბორდგეიმის/თამაშის ჟანრები, ჩანაწერისა და
   * ბუკმარკის კატეგორიები.
   *
   * ⚠️ **სექციები რჩება და ეს არ არის შეუსაბამობა**: ისინი ფილტრია
   * („ნანახი", „რჩეული"), და არა მართვა — ე.ი. სიას ჭრიან და არა ლექსიკონს.
   */
  const sectionsFor = (domain: StatusDomainKey): VideoSection[] =>
    arrangeSections(
      (isStatusDomain(domain) ? statusMap[domain] : customStatusMap[domain]) ?? [],
      // ⚠️ პირად გასაღებზე `PSEUDO_SECTIONS[domain]` `undefined` იქნებოდა
      pseudoSectionsFor(domain),
      layoutFor(enabled, domain),
    )
      .filter((row) => !row.hidden)
      .map((row, index) =>
        row.kind === 'status'
          ? {
              id: row.id,
              label: statusName(row.status, lang),
              icon: row.status.icon ?? 'Circle',
              /* სტატუსის საკუთარი ფერი. ⚠️ სერვერი უფერო სტატუსს აღარ ქმნის
                 (`Status::booted()`); სათადარიგო პალიტრის ფერი მხოლოდ ძველი ქეშისთვისაა */
              color: statusColor(row.status) ?? `var(--status-${STATUS_PALETTE[index % STATUS_PALETTE.length]})`,
              search: sectionSearch(row),
            }
          : {
              id: row.id,
              label: t(row.pseudo.labelKey),
              icon: row.pseudo.icon,
              color: row.pseudo.color,
              search: sectionSearch(row),
              path: row.pseudo.path,
            },
      )

  /**
   * **ინსტრუმენტის რიგი — აქტიურის ჩათვლით** (2026-09-15, შენი შენიშვნა).
   *
   * ⚠️ **აქტიური მდგომარეობა აქამდე საერთოდ არ იყო**: თოთხმეტივე რიგი
   * ერთნაირად იხატებოდა და ფერი მხოლოდ ჰოვერზე ჩნდებოდა — ე.ი. `/roles`-ზე
   * მდგომი ვერ ხედავდა, რომ როლებში იყო.
   *
   * ⚠️ **შესატყვისობა ქვე-მისამართებსაც იჭერს** (`/users/3`, `/modules/song`,
   * `/chat/12`, `/dictionaries/video-types`): ზუსტი ტოლობა ჩანაწერის
   * გვერდზე მონიშვნას ჩააქრობდა, ე.ი. „შევედი და მენიუ ჩამქრალია".
   *
   * ⚠️ `[&>svg]:text-[var(--mod)]` — ხატულა რიგის აქცენტში, ზუსტად ისე,
   * როგორც მოდულების რიგებში. ფერს თითო ბმული `lib/toolSections.ts`-იდან
   * წერს inline `style`-ით (Tailwind კლასს ცვლადიდან ვერ დაბადებს), ხოლო
   * ფერის უქონელი პუნქტი `<nav>`-ის ოქროსფერს იმემკვიდრებს.
   */
  const onPath = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)

  // ⚠️ დამატებითი კლასის არგუმენტი მოიხსნა ქვეწარწერასთან ერთად — ის მხოლოდ
  // ლექსიკონების ორხაზიან რიგს სჭირდებოდა, ე.ი. ახლა თექვსმეტივე რიგი ერთია
  const toolLink = (path: string) =>
    cn(TOOL_ROW, onPath(path) ? TOOL_ROW_ACTIVE : TOOL_ROW_IDLE)

  /** „ყველა" · „რჩეული" — ფსევდო-განყოფილებები სტატუსის ლექსიკონის გარეშე */
  const favoriteSections: VideoSection[] = [
    { id: 'all', label: t('filter.all'), icon: 'LayoutGrid', color: ALL_SECTION_COLOR, search: '' },
    { id: 'favorite', label: t('filter.favorite'), icon: 'Star', color: FAVORITE_SECTION_COLOR, search: 'view=favorite' },
  ]

  /**
   * **მოდულის ჩამოშლადი განყოფილება — ერთი განსაზღვრება**.
   *
   * ⚠️ ეს ბლოკი რვაჯერ იყო ხელით დაწერილი: წიგნი, სამაგიდო და თამაში
   * სიტყვასიტყვით ერთნაირი იყო, სიმღერა, ჩანაწერი, ბუკმარკი და ვიდეო კი
   * მხოლოდ სექციების წყაროთი და ერთი დამატებითი რიგით განსხვავდებოდა —
   * ე.ი. კურსისა და ადგილის დამატება მეცხრე და მეათე ასლი იქნებოდა.
   *
   * ⚠️ ქვე-პუნქტი მხოლოდ მოდულის **ზუსტ** მისამართზე ინთება (`route_base`);
   * მოდულის რიგის მონიშვნას `active` ცვლის (სიმღერა პლეილისტებზეც აქტიურია).
   * `extra` სექციებსა და „დამატებას" შორის დგება (პლეილისტები, შეხსენებები).
   */
  const moduleSection = (
    m: ModuleInfo,
    sections: VideoSection[],
    { active, extra }: { active?: boolean; extra?: ReactNode } = {},
  ) => {
    const onModule = location.pathname === m.route_base
    const sectionOpen = !!open[m.key]
    const activeSection = onModule ? (params.get('view') ?? 'all') : null

    return (
      <div key={m.key} style={modAccent(m.color)}>
        <button
          data-kind="accordion"
          onClick={() => setOpen((o) => ({ ...o, [m.key]: !o[m.key] }))}
          aria-expanded={sectionOpen}
          className={cn(MODULE_ROW, (active ?? onModule) ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE)}
        >
          <ModuleIcon name={m.icon} className="size-4 shrink-0 text-[var(--mod)]" />
          <span className="flex-1 text-left">{moduleName(m, i18n.language)}</span>
          <ChevronDown
            className={cn('size-4 shrink-0 transition-transform', sectionOpen ? '' : '-rotate-90')}
          />
        </button>

        {sectionOpen && (
          <div className="mb-1 ml-2 space-y-0.5 border-l border-border pl-2">
            {sections.map((sec) => (
              <SubItem
                key={sec.id}
                active={activeSection === sec.id}
                color={sec.color}
                icon={sec.icon}
                label={sec.label}
                onClick={() => {
                  navigate({ pathname: m.route_base, search: sec.search })
                  setDrawerOpen(false)
                }}
              />
            ))}
            {extra}
            <Link
              to={`${m.route_base}?new=1`}
              onClick={() => setDrawerOpen(false)}
              className={SUB_ADD}
            >
              <Plus className="size-4 shrink-0" />
              {t('actions.addShort')}
            </Link>
          </div>
        )}
      </div>
    )
  }

  /** მოდულის ქვეგვერდზე ვდგავართ (`/movies/sync`) და არა სიაზე ან ჩანაწერზე */
  const onSubPage = (libraryPath: string) => location.pathname === `${libraryPath}/sync`

  /** მედია-დომენის განყოფილება — სექციები სტატუსის ლექსიკონიდან */
  const mediaSection = (m: ModuleInfo, type: MediaType) => {
    const d = MEDIA[type]
    const isActiveDomain = routeDomain === type
    const sectionOpen = !!open[type]
    return (
      <div key={m.key} style={modAccent(m.color)}>
        <button
          data-kind="accordion"
          onClick={() => setOpen((o) => ({ ...o, [type]: !o[type] }))}
          aria-expanded={sectionOpen}
          className={cn(
            MODULE_ROW,
            isActiveDomain ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE,
          )}
        >
          <ModuleIcon name={m.icon} className="size-4 shrink-0 text-[var(--mod)]" />
          <span className="flex-1 text-left">{moduleName(m, i18n.language)}</span>
          <ChevronDown
            className={cn('size-4 shrink-0 transition-transform', sectionOpen ? '' : '-rotate-90')}
          />
        </button>

        {sectionOpen && (
          <div className="mb-1 ml-2 space-y-0.5 border-l border-border pl-2">
            {sectionsFor(type).map((sec) => {
              /* **ბმული ცალკე გვერდზე** („სინქრონიზაცია"): სიას არ ავიწროებს, თავის გვერდს
                 ხსნის. ⚠️ იმ გვერდზე სიის სექციები არ ინთება — ორი აქტიური პუნქტი ტყუილია. */
              if (sec.path) {
                return (
                  <SubItem
                    key={sec.id}
                    active={location.pathname === `${d.libraryPath}${sec.path}`}
                    color={sec.color}
                    icon={sec.icon}
                    label={sec.label}
                    to={`${d.libraryPath}${sec.path}`}
                    onClick={() => setDrawerOpen(false)}
                  />
                )
              }

              const active = isActiveDomain && !onSubPage(d.libraryPath) && activeView === sec.id
              return (
                <SubItem
                  key={sec.id}
                  active={active}
                  color={sec.color}
                  icon={sec.icon}
                  label={sec.label}
                  onClick={() => setView(d.libraryPath, sec.id)}
                />
              )
            })}
            <Link
              to={`${d.detailBase}/new`}
              onClick={() => setDrawerOpen(false)}
              className={SUB_ADD}
            >
              <Plus className="size-4 shrink-0" />
              {t('actions.addShort')}
            </Link>
          </div>
        )}
      </div>
    )
  }

  /** არა-მედია მოდული — ვიდეოებსა და სიმღერებს თავისი სექციები აქვს */
  const pageSection = (m: ModuleInfo) => {
    /* ---------- წიგნი · სამაგიდო · თამაში · კურსი · ადგილი ---------- */
    if (FAVORITE_ONLY_MODULES.has(m.key)) return moduleSection(m, favoriteSections)

    /* ---------- სიმღერები: „ყველა" · „რჩეული" · პლეილისტები ----------
       ⚠️ ჟანრების სია აქ აღარაა — ფილტრების პანელშია; პლეილისტები
       სიმღერების ქვე-სექციაა (2026-09-03), ე.ი. მოდულის რიგი მათზეც ინთება. */
    if (m.key === 'song') {
      return moduleSection(m, favoriteSections, {
        active: location.pathname === m.route_base || location.pathname.startsWith('/playlists'),
        extra: (
          <SubItem
            active={location.pathname.startsWith('/playlists')}
            color={PLAYLISTS_COLOR}
            icon={ListMusic}
            label={t('playlists.title')}
            to="/playlists"
            onClick={() => setDrawerOpen(false)}
          />
        ),
      })
    }

    /* ---------- ჩანაწერები: სექციები ლექსიკონიდან + შეხსენებები ----------
       შეხსენებებს თავისი სექცია აქვს (ჩანაწერის ფორმიდან ის
       მთლიანად მოიხსნა; პლეილისტების პრეცედენტი). */
    if (m.key === 'note') {
      return moduleSection(m, sectionsFor('note'), {
        extra: (
          <SubItem
            active={location.pathname === '/notes/reminders'}
            color={REMINDERS_COLOR}
            icon={BellRing}
            label={t('notes.remindersTitle')}
            to="/notes/reminders"
            onClick={() => setDrawerOpen(false)}
          />
        ),
      })
    }

    /* ---------- ბუკმარკები: სექციები ლექსიკონიდან ---------- */
    if (m.key === 'bookmark') return moduleSection(m, sectionsFor('bookmark'))

    /* ---------- ვიდეოები: სექციები ლექსიკონიდან ----------
       ⚠️ ტიპების სია და „ტიპების მართვა" აქ აღარაა (ლექსიკონი `/dictionaries`-შია);
       „ჩამოტვირთულები" ფსევდო-განყოფილებაა (`PSEUDO_SECTIONS.video`) და
       „რჩეულის" მსგავსად დამალვადი და გადასატანია. */
    if (m.key === 'video') return moduleSection(m, sectionsFor('video'))

    /* ---------- გალერეა: ქვე-მენიუ ----------
       ⚠️ **ერთ დროს ქვე-პუნქტი მართლაც აღარ იყო** (ერთადერთი „თემების
       მართვა" მოიხსნა), მაგრამ მერე გალერეა ერთი გვერდიდან **ხუთ
       ჭრილად** გაიშალა — ე.ი. ქვე-მენიუ ისევ გახდა საჭირო და ესაა
       შენი პირდაპირი მოთხოვნა („გვერდითა ქვე მენიუს გაუკეთე გალერიას").

       ⚠️ **სია `GALLERY_CUTS`-იდან მოდის** და ხელით აქ არ იწერება:
       გვერდზე იგივე სეგმენტებია და ორი ასლი ერთ დღეს გაშორდებოდა. */
    if (m.key === 'gallery') {
      const sectionOpen = !!open.gallery
      const onGallery = location.pathname.startsWith('/gallery')

      return (
        <div key={m.key} style={modAccent(m.color)}>
          <button
            data-kind="accordion"
            onClick={() => setOpen((o) => ({ ...o, gallery: !o.gallery }))}
            aria-expanded={sectionOpen}
            className={cn(
              MODULE_ROW,
              onGallery ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE,
            )}
          >
            <ModuleIcon name={m.icon} className="size-4 shrink-0 text-[var(--mod)]" />
            <span className="flex-1 text-left">{moduleName(m, i18n.language)}</span>
            <ChevronDown
              className={cn('size-4 shrink-0 transition-transform', sectionOpen ? '' : '-rotate-90')}
            />
          </button>

          {sectionOpen && (
            <div className="mb-1 ml-2 space-y-0.5 border-l border-border pl-2">
              {GALLERY_CUTS.map((cut) => (
                <SubItem
                  key={cut.key}
                  // ⚠️ „ყველა" მხოლოდ ზუსტ მისამართზეა აქტიური, თორემ
                  // ყოველ ქვე-გვერდზე ორი პუნქტი აინთებოდა
                  active={cut.key === 'all' ? location.pathname === cut.path : location.pathname.startsWith(cut.path)}
                  color={cut.color}
                  icon={cut.icon}
                  /* ⚠️ სახელი ერთი გასაღებიდან მოდის: ადრე „ჩანაწერები" ჩართული
                     მოდულების სახელებისგან იგებოდა, რაც ტაბისთვის გრძელი იყო და
                     მაინც არასრული — შიგნით სიმღერაც ზის და წიგნიც */
                  label={t(`gallery.cut.${cut.key}`)}
                  to={cut.path}
                  onClick={() => setDrawerOpen(false)}
                />
              ))}
            </div>
          )}
        </div>
      )
    }

    /* ---------- პირადი გალერეა: ქვე-მენიუ ----------
       ⚠️ გალერეის ფორმა — სია `PERSONAL_CUTS`-იდან (გვერდის სეგმენტებიც იგივეა);
       ადამიანისა და ალბომის გვერდზე შესაბამისი ჭრილი რჩება მონიშნული. */
    if (m.key === 'personal') {
      const sectionOpen = !!open.personal
      const onPersonal = location.pathname === '/personal' || location.pathname.startsWith('/personal/')
      // ფესვი (`/personal`) „ყველა"-ა; პიროვნებისა და ალბომის გვერდზე მათი ჭრილი რჩება მონიშნული
      const activeCut = location.pathname.startsWith('/personal/albums')
        ? 'albums'
        : location.pathname.startsWith('/personal/people')
          ? 'people'
          : 'media'

      return (
        <div key={m.key} style={modAccent(m.color)}>
          <button
            data-kind="accordion"
            onClick={() => setOpen((o) => ({ ...o, personal: !o.personal }))}
            aria-expanded={sectionOpen}
            className={cn(MODULE_ROW, onPersonal ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE)}
          >
            <ModuleIcon name={m.icon} className="size-4 shrink-0 text-[var(--mod)]" />
            <span className="flex-1 text-left">{moduleName(m, i18n.language)}</span>
            <ChevronDown className={cn('size-4 shrink-0 transition-transform', sectionOpen ? '' : '-rotate-90')} />
          </button>

          {sectionOpen && (
            <div className="mb-1 ml-2 space-y-0.5 border-l border-border pl-2">
              {PERSONAL_CUTS.map((cut) => (
                <SubItem
                  key={cut.key}
                  active={onPersonal && activeCut === cut.key}
                  color={cut.color}
                  icon={cut.icon}
                  label={t(`personal.cut.${cut.key}`)}
                  to={cut.path}
                  onClick={() => setDrawerOpen(false)}
                />
              ))}
            </div>
          )}
        </div>
      )
    }

    /* ---------- სხვა მოდული — ჩვეულებრივი ბმული ---------- */
    return (
      <Link
        key={m.key}
        to={m.route_base}
        style={modAccent(m.color)}
        onClick={() => setDrawerOpen(false)}
        className={cn(
          MODULE_ROW,
          // ქვე-გვერდზეც აქტიური რჩება (მაგ. `/gallery/movie/12`)
          location.pathname === m.route_base ||
            location.pathname.startsWith(`${m.route_base}/`)
            ? MODULE_ROW_ACTIVE
            : MODULE_ROW_IDLE,
        )}
      >
        <ModuleIcon name={m.icon} className="size-4 shrink-0 text-[var(--mod)]" />
        {moduleName(m, i18n.language)}
      </Link>
    )
  }

  /* ჩაშენებულები და პირადები ცალ-ცალკე (პირადები — ქვემოთ, ჯგუფად) */
  const builtInModules = enabled.filter((m) => !isCustomModule(m))
  const myModules = enabled.filter((m) => isCustomModule(m))

  /* მსახიობების გვერდი; მსახიობის შიდა გვერდზეც (`/actors/:id`) აქტიურია.
     ქვემენიუ: ყველა · რჩეულები · გალერეა (`ACTOR_VIEWS` — გვერდის იგივე რუკა). */
  const lastMediaKey = [...enabled].reverse().find((m) => isMediaKey(m.key))?.key
  const ActorsIcon = TOOL_SECTIONS.actors.icon
  const onActors = location.pathname === '/actors' || location.pathname.startsWith('/actors/')
  const actorsOpen = !!open.actors
  // ხედი მხოლოდ სიის მისამართზე ითვლება — მსახიობის გვერდზე ქვეპუნქტი არ ინთება
  const actorsView = location.pathname === '/actors' ? actorViewOf(params.get('view')) : null
  const actorsRow = (
    <div style={toolAccent('actors')}>
      <button
        data-kind="accordion"
        onClick={() => setOpen((o) => ({ ...o, actors: !o.actors }))}
        aria-expanded={actorsOpen}
        className={cn(MODULE_ROW, onActors ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE)}
      >
        <ActorsIcon className="size-4 shrink-0 text-[var(--mod)]" />
        <span className="flex-1 text-left">{t('actors.title')}</span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', actorsOpen ? '' : '-rotate-90')} />
      </button>

      {actorsOpen && (
        <div className="mb-1 ml-2 space-y-0.5 border-l border-border pl-2">
          {ACTOR_VIEWS.map((view) => (
            <SubItem
              key={view.key}
              active={actorsView === view.key}
              color={view.color}
              icon={view.icon}
              label={t(`actors.view.${view.key}`)}
              to={actorViewPath(view.key)}
              onClick={() => setDrawerOpen(false)}
            />
          ))}
        </div>
      )}
    </div>
  )

  const nav = (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto" style={NAV_DEFAULT_ACCENT}>
        {/* დეშბორდი ყოველთვის პირველია */}
        <Link
          to="/"
          onClick={() => setDrawerOpen(false)}
          className={cn(
            MODULE_ROW,
            location.pathname === '/'
              ? MODULE_ROW_ACTIVE
              : MODULE_ROW_IDLE,
          )}
        >
          <LayoutDashboard className="size-4 shrink-0 text-[var(--mod)]" />
          {t('dashboard.nav')}
        </Link>

        {/* ⚠️ **ერთი რიგი**: მედია და დანარჩენი მოდულები ერთმანეთში
            ერევა, `enabled`-ის რიგით — სერვერი მას პირადი რიგით ალაგებს
            (`ModuleOrder::sort()`), ე.ი. `/modules`-ის და მთავარის ბარათების
            იგივე რიგია. ადრე ჯერ ყველა მედია იხატებოდა და მერე დანარჩენი,
            ამიტომ ფილმს სიმღერის შემდეგ ვერანაირი რიგი ვერ დააყენებდა.
            ⚠️ გვერდის გარეშე მოდული (ვერც მედიაა, ვერც `PAGE_MODULE_KEYS`-შია)
            არ იხატება — მისი მარშრუტი `App.tsx`-ში არ არსებობს. */}
        {/* ⚠️ პირადი მოდული „ყველა · სტატუსები · რჩეული · დამატება"-ს იღებს
            (ჩანაწერისა და ბუკმარკის წესი), სექციები — მისივე ლექსიკონიდან.
            ⚠️ პირადები **ჩაშენებულების ქვემოთ, ცალკე ჯგუფად**
            („ჩემი მოდულები"), თავისი რიგით; ჩაშენებულები — თავისით. */}
        {builtInModules.map((m) => {
          const row = isMediaKey(m.key) ? mediaSection(m, m.key) : PAGE_KEYS.has(m.key) ? pageSection(m) : null

          /* „მსახიობები" მედიის ქვეშაა: **ბოლო მედია-მოდულის შემდეგ**
             (რიგი პირადია — მედია შეიძლება სხვებში იყოს გაბნეული). */
          return m.key === lastMediaKey ? (
            <Fragment key={m.key}>
              {row}
              {actorsRow}
            </Fragment>
          ) : (
            row
          )
        })}

        {myModules.length > 0 && (
          <div className="pt-2" data-testid="sidebar-my-modules">
            <p className="px-3 pb-1 text-[11px] font-medium text-muted-foreground">{t('customModules.mineTitle')}</p>
            {myModules.map((m) => moduleSection(m, sectionsFor(m.key as StatusDomainKey)))}
          </div>
        )}

        <div className="my-2 border-t border-border" />

        {/* **ლექსიკონები ინსტრუმენტების პირველი რიგია**, `/genres`-ზე
            ზემოთ. ⚠️ ორი მართლა სხვადასხვა რამაა და სწორედ ამიტომ დგანან
            გვერდიგვერდ: `/genres` **გლობალური** TMDB-ის ჟანრებია (ყველა
            ანგარიშისთვის ერთი, წაშლა ადმინის დასტურს ითხოვს), `/dictionaries`
            კი **ჩემი** სტატუსები, ჟანრები, ტიპები და კატეგორიები.
            ⚠️ ხატულაც ამას ამბობს: `Library` („ჩემი სიების თარო") vs `Tags`.
            ⚠️ **ქვეწარწერა მოიხსნა (შენი მითითება, 2026-09-15).** ის ერთადერთი
            ორხაზიანი პუნქტი იყო მთელ ნავიგაციაში, ე.ი. თვითონვე ამტყუნებდა
            იმ წესს, რომელსაც მენიუ ეყრდნობა — რიგი ერთი ხაზია. განმარტება
            თავის ადგილას, ინდექსის გვერდის ქვესათაურში რჩება (`navHint`),
            სადაც წაკითხვა უფასოა და მენიუს სიმაღლეს არ ზრდის. */}
        {(DICTIONARIES.some((d) => has(d.module)) || customModules.length > 0) && (
          <Link
            to="/dictionaries"
            onClick={() => setDrawerOpen(false)}
            style={toolAccent('dictionaries')}
            className={toolLink('/dictionaries')}
          >
            <Library className="size-4 shrink-0" />
            {t('dictionaries.title')}
          </Link>
        )}
        {mediaModules.length > 0 && (
          <Link to="/genres" onClick={() => setDrawerOpen(false)} style={toolAccent('genres')} className={toolLink('/genres')}>
            <Tags className="size-4 shrink-0" />
            {t('genres.manage')}
          </Link>
        )}
        {/* მასობრივი ოპერაციები ვიდეოებსაც ეხება (ტიპი/ტეგები),
            ე.ი. მედია-მოდულის გარეშეც სჭირდება ბმული */}
        {(mediaModules.length > 0 || pageModules.some((m) => m.key === 'video')) && (
          <Link to="/status" onClick={() => setDrawerOpen(false)} style={toolAccent('bulk')} className={toolLink('/status')}>
            <ListChecks className="size-4 shrink-0" />
            {t('bulkStatus.manage')}
          </Link>
        )}
        {/* სინქრონი პარამეტრებიდან ცალკე გვერდზე გავიდა (queue გლობალურია);
            TMDB მხოლოდ მედია-დომენებს ეხება */}
        {mediaModules.length > 0 && (
          <Link to="/sync" onClick={() => setDrawerOpen(false)} style={toolAccent('sync')} className={toolLink('/sync')}>
            <DownloadCloud className="size-4 shrink-0" />
            {t('sync.title')}
          </Link>
        )}
        {/* თარგმანები. ორენოვანი სქემა მხოლოდ მედია-დომენებს აქვთ
            (ჟანრებიც მათი ლექსიკონია), ე.ი. იმავე პირობაზე ჩანს, რაც სინქრონი. */}
        {mediaModules.length > 0 && (
          <Link to="/translations" onClick={() => setDrawerOpen(false)} style={toolAccent('translations')} className={toolLink('/translations')}>
            <Languages className="size-4 shrink-0" />
            {t('translate.title')}
          </Link>
        )}
        {/* სტატისტიკა. „რა გავაკეთე" — დეშბორდის („რა მაქვს")
            წყვილი და არა შემცვლელი; ამიტომ ცალკე სექციაა. */}
        <Link to="/stats" onClick={() => setDrawerOpen(false)} style={toolAccent('stats')} className={toolLink('/stats')}>
          <ChartColumn className="size-4 shrink-0" />
          {t('stats.title')}
        </Link>
        {/* „ექსპორტ & იმპორტი" — ორივე ერთ სექციაში.
            ⚠️ **პირობის გარეშე ჩანს**: ექსპორტი ყველა ჩართულ მოდულს ეხება,
            იმპორტის ფორმატები კი სამ სხვადასხვას (ფილმი · წიგნი · თამაში) —
            რომელს, თვითონ ფაილი წყვეტს და უფლებას სერვერი ამოწმებს. */}
        <Link to="/transfer" onClick={() => setDrawerOpen(false)} style={toolAccent('transfer')} className={toolLink('/transfer')}>
          <ArrowLeftRight className="size-4 shrink-0" />
          {t('transfer.title')}
        </Link>
        {/* კალათა.
            ⚠️ **პირობის გარეშე ჩანს**: წაშლილი ჩანაწერი ათივე მოდულიდან
            აქ ხვდება, ე.ი. „რომელი მოდული მაქვს" აქ არასწორი კითხვაა —
            სერვერი ისედაც მხოლოდ იმ დომენებს აბრუნებს, რომლებზეც წაშლის
            უფლება მაქვს და რაღაც წაშლილი მიდევს. */}
        <Link to="/trash" onClick={() => setDrawerOpen(false)} style={toolAccent('trash')} className={toolLink('/trash')}>
          <ArchiveRestore className="size-4 shrink-0" />
          {t('trash.title')}
        </Link>
        {/* „მონაცემები": ჩემი გასაღებები და ლიმიტები.
            ⚠️ **პირობის გარეშე ჩანს**: TMDB-ს მედია-მოდულები იყენებენ,
            RAWG-ს თამაშები, YouTube-ს ვიდეო — ე.ი. „რომელი მოდული მაქვს"
            კითხვაზე პასუხი ყოველთვის „რომელიღაც"-ია, ხოლო კვოტა და
            გასაღები ანგარიშის საკითხია და არა ბიბლიოთეკისა. */}
        <Link to="/credentials" onClick={() => setDrawerOpen(false)} style={toolAccent('credentials')} className={toolLink('/credentials')}>
          <KeyRound className="size-4 shrink-0" />
          {t('credentials.title')}
        </Link>
        {/* „გაზიარების ბმულები" — შენი მითითებით „მონაცემების" ქვემოთ.
            ⚠️ **ერთადერთი შესასვლელია**: მოდულების სათაურის ღილაკი და „ექსპორტ &
            იმპორტის" ჩანართი მოიხსნა. ⚠️ **პირობის გარეშე ჩანს** — ბმული თითქმის
            ყველა მოდულს ეხება, ხოლო რომელს შეგიძლია გააზიარო, ფანჯარა თვითონ ამბობს. */}
        <Link to="/share-links" onClick={() => setDrawerOpen(false)} style={toolAccent('share')} className={toolLink('/share-links')}>
          <Share2 className="size-4 shrink-0" />
          {t('share.listTitle')}
        </Link>
        {/* „ვისთან ჰგავს ჩემი გემოვნება". მოდულზე დამოკიდებული
            არაა: სოციალური ფენა ბიბლიოთეკის შიგთავსს არ ეკითხება. */}
        <Link to="/people" onClick={() => setDrawerOpen(false)} style={toolAccent('people')} className={toolLink('/people')}>
          <Users className="size-4 shrink-0" />
          {t('people.title')}
        </Link>
        {/* ჩატი; წაუკითხავის მრიცხველი ჰედერშივე ჩანს */}
        <Link to="/chat" onClick={() => setDrawerOpen(false)} style={toolAccent('chat')} className={toolLink('/chat')}>
          <MessageSquare className="size-4 shrink-0" />
          <span className="flex-1">{t('chat.title')}</span>
          {chatUnread > 0 && (
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs leading-none text-primary-foreground">
              {chatUnread}
            </span>
          )}
        </Link>
        {/* პარამეტრები განზრახ აქ არ არის: ერთადერთი შესვლის წერტილი
            პროფილის ჩამოსაშლელია (`Header.tsx`), მარშრუტი `/settings` უცვლელია. */}
        <Link to="/modules" onClick={() => setDrawerOpen(false)} style={toolAccent('modules')} className={toolLink('/modules')}>
          <Puzzle className="size-4 shrink-0" />
          {t('modules.title')}
        </Link>

        {/* „ადმინი" ერთიანი ბმული აღარაა; ოთხი ცალკე სექციაა */}
        <Link to="/requests" onClick={() => setDrawerOpen(false)} style={toolAccent('requests')} className={toolLink('/requests')}>
          <Inbox className="size-4 shrink-0" />
          <span className="flex-1">{t('admin.requests')}</span>
          {canAdmin('requests') && pending > 0 && (
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs leading-none text-primary-foreground">
              {pending}
            </span>
          )}
        </Link>

        {/* თითო სექცია ცალკე უფლებაზეა და აღარ ერთ „ადმინზე" */}
        {canAdmin('users') && (
          <Link to="/users" onClick={() => setDrawerOpen(false)} style={toolAccent('users')} className={toolLink('/users')}>
            <Users className="size-4 shrink-0" />
            {t('admin.users')}
          </Link>
        )}
        {canAdmin('roles') && (
          <Link to="/roles" onClick={() => setDrawerOpen(false)} style={toolAccent('roles')} className={toolLink('/roles')}>
            <ShieldCheck className="size-4 shrink-0" />
            {t('roles.title')}
          </Link>
        )}
        {/* აუდიტ-ლოგი; ცალკე უფლებაა (`admin:audit`) */}
        {canAdmin('audit') && (
          <Link to="/audit" onClick={() => setDrawerOpen(false)} style={toolAccent('audit')} className={toolLink('/audit')}>
            <ScrollText className="size-4 shrink-0" />
            {t('audit.title')}
          </Link>
        )}
        {/* ბაზის ასლები „ექსპორტ & იმპორტის" „ბაზის" ჩანართშია
            (მხოლოდ super_admin-ს უჩანს); ცალკე რიგი აღარ არის. */}
        {/* ⚠️ მასობრივი წაშლა **მხოლოდ** super_admin-ისაა (სხვისი ბიბლიოთეკის
            წაშლაა) — ის სექციის უფლებით არ იხსნება. დესტრუქციულია, ბოლოშია. */}
        {isAdmin && (
          <Link to="/purge" onClick={() => setDrawerOpen(false)} style={toolAccent('purge')} className={toolLink('/purge')}>
            <Trash2 className="size-4 shrink-0" />
            {t('purge.title')}
          </Link>
        )}
      </nav>

    </>
  )

  return (
    <>
      {/* ===== Desktop sidebar (ჰედერი 3.5rem-ია, ამიტომ sticky top-14) ===== */}
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-5 lg:flex">
        {nav}
      </aside>

      {/* ===== Mobile drawer ===== */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fb-overlay fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm lg:hidden" />
          <DialogPrimitive.Content className="fb-drawer fixed inset-y-0 left-0 z-[81] flex w-64 max-w-[85vw] flex-col border-r border-border bg-card px-3 py-5 shadow-xl focus:outline-none lg:hidden">
            <div className="mb-6 flex items-center justify-between px-2">
              <DialogPrimitive.Title className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
                  <Clapperboard className="size-[18px]" />
                </span>
                <span className="font-display text-[22px] font-semibold leading-none tracking-tight">
                  {t('app.title')}
                </span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="close"
                className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            {nav}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
