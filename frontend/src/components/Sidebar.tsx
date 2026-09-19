import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ArchiveRestore,
  BellRing,
  ChartColumn,
  ChevronDown,
  Clapperboard,
  DatabaseBackup,
  DownloadCloud,
  Import,
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
  ShieldCheck,
  Tags,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { MEDIA, mediaFromPath, type MediaType } from '@/lib/media'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { toolAccent } from '@/lib/toolSections'
import { fetchChatUnread } from '@/api/chat'
import { useAuth } from '@/lib/auth'
import { useSettings } from '@/lib/settings'
import { fetchPendingCount } from '@/api/account'
import { ModuleIcon } from './ModuleIcon'
// §8.5 — გალერეის ჭრილების ერთადერთი სია (გვერდზეც იგივეა)
import { GALLERY_CUTS } from '@/lib/galleryCuts'
import { cn } from '@/lib/utils'
import { statusName, useStatusMap } from '@/lib/statuses'
import { PSEUDO_SECTIONS, arrangeSections, layoutFor, sectionSearch } from '@/lib/statusSections'
// ⚠️ `App.tsx` ამას ისედაც სტატიკურად აიმპორტებს — ე.ი. საწყის chunk-ს არაფერი ემატება
import { DICTIONARIES } from '@/lib/dictionaries'
import { useContentLang } from '@/lib/settings'
import type { StatusDomain } from '@/api/statuses'


/**
 * საიდბარის ერთი სექცია (K7 → Tasks 5.1 → ეტაპი 8).
 * რიგი და ხილვადობა `lib/statusSections.ts`-იდან მოდის — „ყველა" და „რჩეული"
 * ნაგულისხმევად პირველი/ბოლოა, მაგრამ მომხმარებელი ლექსიკონის გვერდზე
 * მათ ადგილს ცვლის და ნებისმიერ სექციას მალავს.
 */
type VideoSection = { id: string; label: string; icon?: string | null; search: string }

/**
 * დომენი მხოლოდ დომენის საკუთარი მარშრუტებისთვის — /genres, /status, /actors
 * არც ერთ დომენს არ ეკუთვნის, ამიტომ null (სექციების ავტო-გადართვა არ უნდა გამოიწვიოს).
 * ⚠️ `/` აღარ ეკუთვნის ფილმებს — ის დეშბორდია (Tasks 2.2).
 */
function domainFromRoute(pathname: string): MediaType | null {
  return mediaFromPath(pathname)
}

/* ============================================================
   **მოდულის ფერი საიდბარში (ეტაპი 6).**

   ფერი `modules.color`-შია (გლობალური სვეტი, არა `module_user.settings`) და
   აქ **იმავე `useModules()`-იდან** მოდის, საიდანაც სახელი და ხატულა — ფრონტზე
   მეორე სია იმავე დღეს გაშორდებოდა ბაზას.

   ⚠️ **Tailwind კლასს hex-იდან ვერ დაბადებს**: `border-l-[#6366f1]` კომპილაციისას
   არ არსებობს. ამიტომ ფერი inline `style`-ით ორ CSS-ცვლადად ჩამოდის
   (`--mod` და მისი სუსტი ტონი `--mod-soft`), კლასები კი სტატიკურია
   (`hover:border-l-[var(--mod)]`) — ჰოვერი მხოლოდ CSS-ით ითქმება, JS-ით არა.

   ⚠️ **ცვლადი მემკვიდრეობით მიდის**: `<nav>`-ზე ნაგულისხმევად ოქროსფერია,
   ე.ი. `color === null`-ზე რიგი დღევანდელ სახეს ინარჩუნებს (პუნქტი 7) და
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
const SUB_ROW_ACTIVE =
  'border-l-[var(--mod)] bg-[var(--mod-fill)] font-semibold text-foreground [&>svg]:text-[var(--mod)]'
const SUB_ROW_IDLE =
  'border-l-transparent text-muted-foreground hover:bg-muted hover:text-foreground'

/** ქვე-პუნქტი — ერთი განსაზღვრება ოცივე გამოძახებისთვის */
const subRow = (active: boolean) => cn(SUB_ROW, active ? SUB_ROW_ACTIVE : SUB_ROW_IDLE)

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
   ბარათებიც კითხულობს (ეტაპი 10), ე.ი. ორი ასლი გაშორდებოდა.
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
/* §23 — ინსტრუმენტების ფერები **საერთო რეესტრიდან** (`lib/toolSections.ts`).
   ⚠️ აქ დაწერილი პირადი რუკა გვერდის ჰედერს ვერ სწვდებოდა, ე.ი. იმავე
   სექციას საიდბარი ფერავდა და სათაური — არა; ორი ასლი კი პირველივე
   ცვლილებაზე დაშორდებოდა. */

/** `<nav>`-ის ნაგულისხმევი აქცენტი — `lib/modules.tsx`-იდან, ერთი წყარო */
const NAV_DEFAULT_ACCENT = MODULE_ACCENT_FALLBACK

/**
 * ნავიგაცია. ლოგო, ენა/თემა და პროფილი ჰედერშია (K12) — აქ მხოლოდ მენიუა.
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
  const { mediaModules, pageModules, enabled, has } = useModules()
  const { settings } = useSettings()
  const lang = useContentLang(i18n.language)
  /* §6.4 — სტატუსები per-user ლექსიკონია, ე.ი. სექციები აქედან იგება.
     ⚠️ `useStatusMap` ყოველთვის ექვს query-ს ქმნის და მხოლოდ `enabled`-ს ცვლის —
     ციკლის შიგნით პირობითი hook რიგს გატეხდა. */
  const statusMap = useStatusMap(enabled.map((m) => m.key))
  const { isAdmin, canAdmin } = useAuth()
  const setDrawerOpen = onDrawerChange
  const videoView = params.get('view') ?? 'all'
  // პირველ შესვლაზე ყველა სექცია ჩაკეცილია
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const routeDomain = domainFromRoute(location.pathname)
  const isLibraryRoute = !!routeDomain && location.pathname === MEDIA[routeDomain].libraryPath
  // `?view=`-ის გარეშე ბიბლიოთეკა ნაგულისხმევ სექციას ხსნის (E4) —
  // მონიშვნაც იმავეს უნდა მიჰყვეს, თორემ „ყველა" აირჩეოდა ცრუდ
  const viewParam = params.get('view') ?? settings.defaultView

  /**
   * ჩანაწერის გვერდზე `?view=` აღარ არის, ამიტომ მონიშვნა „ყველაზე" ხტებოდა (Tasks K8).
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

  /* ⚠️ **ტიპებისა და ჟანრების ჩამოტვირთვა აქედან მოიხსნა (Tasks §2.7).**
     საიდბარი ლექსიკონის სრულ სიას აღარ აჩვენებს, ე.ი. მისი წაკითხვაც
     აღარ სჭირდება — ორი ზედმეტი რექვესთი ყოველ გვერდის გახსნაზე. სიები
     ფილტრების პანელშია, სადაც ისინი მართლა გამოიყენება. */

  // §16.3 — ჩატის წაუკითხავი; polling მსუბუქია (მხოლოდ რიცხვი)
  const { data: chatUnread = 0 } = useQuery({
    queryKey: ['chat-unread'],
    queryFn: fetchChatUnread,
    refetchInterval: 30_000,
  })

  // ადმინის badge — რამდენი მოთხოვნაა რიგში
  const { data: pending = 0 } = useQuery({
    queryKey: ['pending-count'],
    queryFn: fetchPendingCount,
    // Tasks 1.6 — endpoint მოთხოვნების სექციისაა და არა „ადმინის" ზოგადად
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
    const m = pageModules.find(
      (x) => location.pathname === x.route_base || location.pathname.startsWith(`${x.route_base}/`),
    )
    return m?.key ?? null
  }, [location.pathname, pageModules])

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
   * **სექციები აღარ წერია კოდში (Tasks §6.4).** სტატუსი per-user ლექსიკონია,
   * ე.ი. საიდბარის ჭრილებიც მისგან იგება: ყველა → *მისი* სტატუსები → რჩეული.
   * ⚠️ „ყველა" და „რჩეული" სტატუსები **არაა** — ისინი ფსევდო-განყოფილებებია.
   *
   * ⚠️ **ეტაპი 8: რიგი და დამალვა ლექსიკონის გვერდის `arrangeSections()`-იდანაა**,
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
  const sectionsFor = (domain: StatusDomain): VideoSection[] =>
    arrangeSections(statusMap[domain] ?? [], PSEUDO_SECTIONS[domain], layoutFor(enabled, domain))
      .filter((row) => !row.hidden)
      .map((row) =>
        row.kind === 'status'
          ? {
              id: row.id,
              label: statusName(row.status, lang),
              icon: row.status.icon ?? 'Circle',
              search: sectionSearch(row),
            }
          : { id: row.id, label: t(row.pseudo.labelKey), icon: row.pseudo.icon, search: sectionSearch(row) },
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

  const nav = (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto" style={NAV_DEFAULT_ACCENT}>
        {/* Tasks 2 — დეშბორდი ყოველთვის პირველია */}
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

        {mediaModules.map((m) => {
          const d = MEDIA[m.type]
          const isActiveDomain = routeDomain === m.type
          const sectionOpen = !!open[m.type]
          return (
            <div key={m.key} style={modAccent(m.color)}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [m.type]: !o[m.type] }))}
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
                  {sectionsFor(m.type).map((sec) => {
                    const active = isActiveDomain && activeView === sec.id
                    return (
                      <button
                        key={sec.id}
                        onClick={() => setView(d.libraryPath, sec.id)}
                        className={subRow(active)}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
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
        })}

        {/* არა-მედია მოდულები — ვიდეოებსა და სიმღერებს თავისი სექციები აქვს (K7) */}
        {pageModules.map((m) => {
          /* ---------- სიმღერები: „ყველა" · ჟანრები · „რჩეული" ---------- */
          if (m.key === 'song') {
            const onSongs = location.pathname === m.route_base
            const sectionOpen = !!open.song

            /* „ყველა" · „რჩეული" (Tasks §2.7 → §5.3).
               ⚠️ **ჟანრების სია აქ აღარაა** — ფილტრების პანელშია; საიდბარში
               მხოლოდ „ჟანრის მართვა" და პლეილისტები რჩება. */
            const sections: VideoSection[] = [
              { id: 'all', label: t('filter.all'), icon: 'LayoutGrid', search: '' },
              { id: 'favorite', label: t('filter.favorite'), icon: 'Star', search: 'view=favorite' },
            ]

            const activeSection = !onSongs ? null : videoView === 'favorite' ? 'favorite' : 'all'

            return (
              <div key={m.key} style={modAccent(m.color)}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, song: !o.song }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    MODULE_ROW,
                    onSongs || location.pathname.startsWith('/playlists')
                      ? MODULE_ROW_ACTIVE
                      : MODULE_ROW_IDLE,
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
                    {sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => {
                          navigate({ pathname: m.route_base, search: sec.search })
                          setDrawerOpen(false)
                        }}
                        className={subRow(activeSection === sec.id)}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
                    {/* პლეილისტები სიმღერების ქვე-სექციაა (2026-09-03) */}
                    <Link
                      to="/playlists"
                      onClick={() => setDrawerOpen(false)}
                      className={subRow(location.pathname.startsWith('/playlists'))}
                    >
                      <ListMusic className="size-4 shrink-0" />
                      {t('playlists.title')}
                    </Link>
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

          /* ---------- წიგნები: „ყველა" · სტატუსები · „რჩეული" (Tasks §12) ----------
             ⚠️ ჟანრები აქ **განზრახ არაა**: წიგნის მთავარი ღერძი კითხვის
             სტატუსია (როგორც ფილმებზე), ჟანრი კი ფილტრების პანელშია. */
          if (m.key === 'book') {
            const onBooks = location.pathname === m.route_base
            const sectionOpen = !!open.book

            /* ⚠️ **სტატუსები აქ განზრახ არ არის** (Tasks §6.1): წიგნზე,
               ბორდგეიმზე და თამაშზე გვერდითი მენიუ მხოლოდ „ყველა · რჩეული ·
               დამატებაა" — შეგნებული გადახრა საერთო წესიდან, user-ის
               მითითებით. სტატუსით ჭრა ფილტრების პანელში რჩება. */
            const sections: VideoSection[] = [
              { id: 'all', label: t('filter.all'), icon: 'LayoutGrid', search: '' },
              { id: 'favorite', label: t('filter.favorite'), icon: 'Star', search: 'view=favorite' },
            ]

            const activeSection = !onBooks ? null : (params.get('view') ?? 'all')

            return (
              <div key={m.key} style={modAccent(m.color)}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, book: !o.book }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    MODULE_ROW,
                    onBooks ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE,
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
                    {sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => {
                          navigate({ pathname: m.route_base, search: sec.search })
                          setDrawerOpen(false)
                        }}
                        className={subRow(activeSection === sec.id)}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
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

          /* ---------- ბორდგეიმები: „ყველა" · სტატუსები · „რჩეული" (Tasks §14) ----------
             იგივე წესი, რაც წიგნებზე: ჟანრი ფილტრების პანელშია, სექციები კი
             სტატუსებია („მაქვს" ყველაზე ხშირად საჭირო ხედია). */
          if (m.key === 'board_game') {
            const onGames = location.pathname === m.route_base
            const sectionOpen = !!open.board_game

            const sections: VideoSection[] = [
              { id: 'all', label: t('filter.all'), icon: 'LayoutGrid', search: '' },
              { id: 'favorite', label: t('filter.favorite'), icon: 'Star', search: 'view=favorite' },
            ]

            const activeSection = !onGames ? null : (params.get('view') ?? 'all')

            return (
              <div key={m.key} style={modAccent(m.color)}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, board_game: !o.board_game }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    MODULE_ROW,
                    onGames ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE,
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
                    {sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => {
                          navigate({ pathname: m.route_base, search: sec.search })
                          setDrawerOpen(false)
                        }}
                        className={subRow(activeSection === sec.id)}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
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

          /* ---------- თამაშები: „ყველა" · სტატუსები · „რჩეული" (Tasks §11) ----------
             იგივე წესი, რაც წიგნებსა და ბორდგეიმებზე: ჟანრი ფილტრების პანელშია,
             სექციები კი სტატუსებია („ვთამაშობ" ყველაზე ხშირად საჭირო ხედია). */
          if (m.key === 'game') {
            const onGames = location.pathname === m.route_base
            const sectionOpen = !!open.game

            const sections: VideoSection[] = [
              { id: 'all', label: t('filter.all'), icon: 'LayoutGrid', search: '' },
              { id: 'favorite', label: t('filter.favorite'), icon: 'Star', search: 'view=favorite' },
            ]

            const activeSection = !onGames ? null : (params.get('view') ?? 'all')

            return (
              <div key={m.key} style={modAccent(m.color)}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, game: !o.game }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    MODULE_ROW,
                    onGames ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE,
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
                    {sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => {
                          navigate({ pathname: m.route_base, search: sec.search })
                          setDrawerOpen(false)
                        }}
                        className={subRow(activeSection === sec.id)}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
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

          /* ---------- ჩანაწერები: „ყველა" · სტატუსები · „რჩეული" (Tasks §13) ----------
             იგივე წესი, რაც წიგნებზე: კატეგორია ფილტრების პანელშია, სექციები
             კი სტატუსებია („ღია" ყველაზე ხშირად საჭირო ხედია). */
          if (m.key === 'note') {
            const onNotes = location.pathname === m.route_base
            const sectionOpen = !!open.note

            // §6.4 — სექციები ლექსიკონიდან და აღარ `NOTE_STATUSES`-იდან
            const sections = sectionsFor('note')

            const activeSection = !onNotes ? null : (params.get('view') ?? 'all')

            return (
              <div key={m.key} style={modAccent(m.color)}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, note: !o.note }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    MODULE_ROW,
                    onNotes ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE,
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
                    {sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => {
                          navigate({ pathname: m.route_base, search: sec.search })
                          setDrawerOpen(false)
                        }}
                        className={subRow(activeSection === sec.id)}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
                    {/* ეტაპი 11.2 — შეხსენებებს თავისი სექცია აქვს (ჩანაწერის
                        ფორმიდან ის მთლიანად მოიხსნა; პლეილისტების პრეცედენტი) */}
                    <Link
                      to="/notes/reminders"
                      onClick={() => setDrawerOpen(false)}
                      className={subRow(location.pathname === '/notes/reminders')}
                    >
                      <BellRing className="size-4 shrink-0" />
                      {t('notes.remindersTitle')}
                    </Link>
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

          /* ---------- ბუკმარკები: „ყველა" · სტატუსები · „რჩეული" (Tasks §18) ----------
             იგივე წესი, რაც ჩანაწერებზე: კატეგორია ფილტრების პანელშია, სექციები
             კი სტატუსებია („წასაკითხი" ყველაზე ხშირად საჭირო ხედია). */
          if (m.key === 'bookmark') {
            const onBookmarks = location.pathname === m.route_base
            const sectionOpen = !!open.bookmark

            // §6.4 — სექციები ლექსიკონიდან და აღარ `BOOKMARK_STATUSES`-იდან
            const sections = sectionsFor('bookmark')

            const activeSection = !onBookmarks ? null : (params.get('view') ?? 'all')

            return (
              <div key={m.key} style={modAccent(m.color)}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, bookmark: !o.bookmark }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    MODULE_ROW,
                    onBookmarks ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE,
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
                    {sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => {
                          navigate({ pathname: m.route_base, search: sec.search })
                          setDrawerOpen(false)
                        }}
                        className={subRow(activeSection === sec.id)}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
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

          /* ---------- გალერეა: ქვე-მენიუ (Tasks §8.5) ----------
             ⚠️ **§4.5-ში ქვე-პუნქტი მართლაც აღარ იყო** (ერთადერთი „თემების
             მართვა" მოიხსნა), მაგრამ §8-ში გალერეა ერთი გვერდიდან **ხუთ
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
                      <Link
                        key={cut.key}
                        to={cut.path}
                        onClick={() => setDrawerOpen(false)}
                        className={subRow(
                          // ⚠️ „ყველა" მხოლოდ ზუსტ მისამართზეა აქტიური, თორემ
                          // ყოველ ქვე-გვერდზე ორი პუნქტი აინთებოდა
                          (cut.key === 'all' ? location.pathname === cut.path : location.pathname.startsWith(cut.path)),
                        )}
                      >
                        <cut.icon className="size-4 shrink-0" />
                        {/* ⚠️ სახელი ერთი გასაღებიდან მოდის (§27): ადრე
                            „ჩანაწერები" ჩართული მოდულების სახელებისგან
                            იგებოდა, რაც ტაბისთვის გრძელი იყო და მაინც
                            არასრული — შიგნით სიმღერაც ზის და წიგნიც */}
                        <span className="min-w-0 truncate">{t(`gallery.cut.${cut.key}`)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          if (m.key !== 'video') {
            return (
              <Link
                key={m.key}
                to={m.route_base}
                style={modAccent(m.color)}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  MODULE_ROW,
                  // ქვე-გვერდზეც აქტიური რჩება (მაგ. `/gallery/movie/12` — Tasks 10)
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

          const onVideos = location.pathname === m.route_base
          const sectionOpen = !!open.video

          /* „ყველა" · „რჩეული" (Tasks §2.7 → §5.4).
             ⚠️ **ტიპების სრული სია აქ აღარაა** — ის ლექსიკონია და ფილტრების
             პანელს ეკუთვნის; **„ტიპების მართვაც" აღარაა** (2026-09-15) —
             ლექსიკონი `/dictionaries`-შია. ერთი წესი ყველა მოდულზე:
             ყველა → სტატუსები → რჩეული → დამატება. */
          /* §6.4 — ვიდეოსაც სტატუსები აქვს; „ჩამოწერილები" მათ შორის ჯდება.
             §7.1 — ჩამოწერილები **ცალკე სექციაცაა და საერთო სიაშიც რჩება**
             (თასქის პირობა): აქ მხოლოდ ისინი ჩანს, „ყველაში" კი ხატულით
             გამოირჩევა, ე.ი. ერთი შეხედვით ჩანს, რომელია ლოკალური. */
          // ეტაპი 8 — „ჩამოწერილები" ფსევდო-განყოფილებაა (`PSEUDO_SECTIONS.video`):
          // „რჩეულის" მსგავსად დამალვადი და გადასატანი
          const sections = sectionsFor('video')

          const activeSection = !onVideos ? null : (params.get('view') ?? 'all')

          return (
            <div key={m.key} style={modAccent(m.color)}>
              <button
                onClick={() => setOpen((o) => ({ ...o, video: !o.video }))}
                aria-expanded={sectionOpen}
                className={cn(
                  MODULE_ROW,
                  onVideos ? MODULE_ROW_ACTIVE : MODULE_ROW_IDLE,
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
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        navigate({ pathname: m.route_base, search: s.search })
                        setDrawerOpen(false)
                      }}
                      className={subRow(activeSection === s.id)}
                    >
                      <ModuleIcon name={s.icon} className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">{s.label}</span>
                    </button>
                  ))}
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
        })}

        <div className="my-2 border-t border-border" />

        {/* ეტაპი 9 — **ლექსიკონები ინსტრუმენტების პირველი რიგია**, `/genres`-ზე
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
        {DICTIONARIES.some((d) => has(d.module)) && (
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
        {/* Tasks 4 — მასობრივი ოპერაციები ვიდეოებსაც ეხება (ტიპი/ტეგები),
            ე.ი. მედია-მოდულის გარეშეც სჭირდება ბმული */}
        {(mediaModules.length > 0 || pageModules.some((m) => m.key === 'video')) && (
          <Link to="/status" onClick={() => setDrawerOpen(false)} style={toolAccent('bulk')} className={toolLink('/status')}>
            <ListChecks className="size-4 shrink-0" />
            {t('bulkStatus.manage')}
          </Link>
        )}
        {/* L2 — სინქრონი პარამეტრებიდან ცალკე გვერდზე გავიდა (queue გლობალურია);
            TMDB მხოლოდ მედია-დომენებს ეხება */}
        {mediaModules.length > 0 && (
          <Link to="/sync" onClick={() => setDrawerOpen(false)} style={toolAccent('sync')} className={toolLink('/sync')}>
            <DownloadCloud className="size-4 shrink-0" />
            {t('sync.title')}
          </Link>
        )}
        {/* Tasks 7 — თარგმანები. ორენოვანი სქემა მხოლოდ მედია-დომენებს აქვთ
            (ჟანრებიც მათი ლექსიკონია), ე.ი. იმავე პირობაზე ჩანს, რაც სინქრონი. */}
        {mediaModules.length > 0 && (
          <Link to="/translations" onClick={() => setDrawerOpen(false)} style={toolAccent('translations')} className={toolLink('/translations')}>
            <Languages className="size-4 shrink-0" />
            {t('translate.title')}
          </Link>
        )}
        {/* FEAT-08 — სტატისტიკა. „რა გავაკეთე" — დეშბორდის („რა მაქვს")
            წყვილი და არა შემცვლელი; ამიტომ ცალკე სექციაა. */}
        <Link to="/stats" onClick={() => setDrawerOpen(false)} style={toolAccent('stats')} className={toolLink('/stats')}>
          <ChartColumn className="size-4 shrink-0" />
          {t('stats.title')}
        </Link>
        {/* FEAT-07 — გარე სერვისის CSV-ის იმპორტი.
            ⚠️ **პირობის გარეშე ჩანს**: ცნობადი ფორმატები სამ სხვადასხვა
            მოდულს ეხება (ფილმი · წიგნი · თამაში), ე.ი. „მედია-მოდული მაქვს
            თუ არა" აქ არასწორი კითხვაა — რომელ მოდულს ეხება, თვითონ ფაილი
            წყვეტს და უფლებას სერვერი ამოწმებს. */}
        <Link to="/import" onClick={() => setDrawerOpen(false)} style={toolAccent('import')} className={toolLink('/import')}>
          <Import className="size-4 shrink-0" />
          {t('import.title')}
        </Link>
        {/* FEAT-11 — კალათა.
            ⚠️ **პირობის გარეშე ჩანს**: წაშლილი ჩანაწერი ათივე მოდულიდან
            აქ ხვდება, ე.ი. „რომელი მოდული მაქვს" აქ არასწორი კითხვაა —
            სერვერი ისედაც მხოლოდ იმ დომენებს აბრუნებს, რომლებზეც წაშლის
            უფლება მაქვს და რაღაც წაშლილი მიდევს. */}
        <Link to="/trash" onClick={() => setDrawerOpen(false)} style={toolAccent('trash')} className={toolLink('/trash')}>
          <ArchiveRestore className="size-4 shrink-0" />
          {t('trash.title')}
        </Link>
        {/* Tasks §21 — „მონაცემები": ჩემი გასაღებები და ლიმიტები.
            ⚠️ **პირობის გარეშე ჩანს**: TMDB-ს მედია-მოდულები იყენებენ,
            RAWG-ს თამაშები, YouTube-ს ვიდეო — ე.ი. „რომელი მოდული მაქვს"
            კითხვაზე პასუხი ყოველთვის „რომელიღაც"-ია, ხოლო კვოტა და
            გასაღები ანგარიშის საკითხია და არა ბიბლიოთეკისა. */}
        <Link to="/credentials" onClick={() => setDrawerOpen(false)} style={toolAccent('credentials')} className={toolLink('/credentials')}>
          <KeyRound className="size-4 shrink-0" />
          {t('credentials.title')}
        </Link>
        {/* Tasks §16.2 — „ვისთან ჰგავს ჩემი გემოვნება". მოდულზე დამოკიდებული
            არაა: სოციალური ფენა ბიბლიოთეკის შიგთავსს არ ეკითხება. */}
        <Link to="/people" onClick={() => setDrawerOpen(false)} style={toolAccent('people')} className={toolLink('/people')}>
          <Users className="size-4 shrink-0" />
          {t('people.title')}
        </Link>
        {/* Tasks §16.3 — ჩატი; წაუკითხავის მრიცხველი ჰედერშივე ჩანს */}
        <Link to="/chat" onClick={() => setDrawerOpen(false)} style={toolAccent('chat')} className={toolLink('/chat')}>
          <MessageSquare className="size-4 shrink-0" />
          <span className="flex-1">{t('chat.title')}</span>
          {chatUnread > 0 && (
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs leading-none text-primary-foreground">
              {chatUnread}
            </span>
          )}
        </Link>
        {/* პარამეტრები განზრახ აქ არ არის (L1): ერთადერთი შესვლის წერტილი
            პროფილის ჩამოსაშლელია (`Header.tsx`), მარშრუტი `/settings` უცვლელია. */}
        <Link to="/modules" onClick={() => setDrawerOpen(false)} style={toolAccent('modules')} className={toolLink('/modules')}>
          <Puzzle className="size-4 shrink-0" />
          {t('modules.title')}
        </Link>

        {/* Tasks 1.1 — „ადმინი" ერთიანი ბმული აღარაა; ოთხი ცალკე სექციაა */}
        <Link to="/requests" onClick={() => setDrawerOpen(false)} style={toolAccent('requests')} className={toolLink('/requests')}>
          <Inbox className="size-4 shrink-0" />
          <span className="flex-1">{t('admin.requests')}</span>
          {canAdmin('requests') && pending > 0 && (
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs leading-none text-primary-foreground">
              {pending}
            </span>
          )}
        </Link>

        {/* Tasks 1.6 — თითო სექცია ცალკე უფლებაზეა და აღარ ერთ „ადმინზე" */}
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
        {/* Tasks §4.4 — აუდიტ-ლოგი; ცალკე უფლებაა (`admin:audit`) */}
        {canAdmin('audit') && (
          <Link to="/audit" onClick={() => setDrawerOpen(false)} style={toolAccent('audit')} className={toolLink('/audit')}>
            <ScrollText className="size-4 shrink-0" />
            {t('audit.title')}
          </Link>
        )}
        {/* Tasks §22 — ბაზის დამპი. ⚠️ **მხოლოდ super_admin**: დამპი მთელი
            ბაზაა (ყველა ანგარიში, ჰეშირებული პაროლები, პირადი ჩატები), ე.ი.
            სექციის უფლებით არ იხსნება — `admin/purge`-ის იგივე მსჯელობა. */}
        {isAdmin && (
          <Link to="/backups" onClick={() => setDrawerOpen(false)} style={toolAccent('backups')} className={toolLink('/backups')}>
            <DatabaseBackup className="size-4 shrink-0" />
            {t('backups.title')}
          </Link>
        )}
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
                className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted"
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
