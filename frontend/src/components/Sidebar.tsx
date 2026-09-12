import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ChevronDown,
  Clapperboard,
  DownloadCloud,
  Inbox,
  Languages,
  LayoutDashboard,
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
import { moduleName, useModules } from '@/lib/modules'
import { fetchChatUnread } from '@/api/chat'
import { useAuth } from '@/lib/auth'
import { useSettings } from '@/lib/settings'
import { fetchPendingCount } from '@/api/account'
import { ModuleIcon } from './ModuleIcon'
// §8.5 — გალერეის ჭრილების ერთადერთი სია (გვერდზეც იგივეა)
import { GALLERY_CUTS } from '@/lib/galleryCuts'
import { cn } from '@/lib/utils'
import { statusName, useStatusMap } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'
import type { Status } from '@/api/types'


/**
 * ვიდეოების სექციები (K7 → Tasks 5.1).
 * „ყველა" ყოველთვის პირველია, შემდეგ **მართვადი ტიპები** (`video_types`),
 * ხოლო „რჩეული" — ყოველთვის ბოლო, რამდენი ტიპიც არ უნდა დაემატოს.
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
  const { mediaModules, pageModules, enabled } = useModules()
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

  const setView = (libraryPath: string, v: string) => {
    const n = new URLSearchParams()
    if (v !== 'all') n.set('view', v)
    navigate({ pathname: libraryPath, search: n.toString() })
    setDrawerOpen(false)
  }

  /**
   * **სექციები აღარ წერია კოდში (Tasks §6.4).** სტატუსი per-user ლექსიკონია,
   * ე.ი. საიდბარის ჭრილებიც მისგან იგება: ყველა → *მისი* სტატუსები → რჩეული.
   * ⚠️ „ყველა" და „რჩეული" სტატუსები **არაა** — ისინი ჩარჩოა და ყოველთვის რჩება.
   */
  const sectionsFor = (statuses: Status[], extra: VideoSection[] = []): VideoSection[] => [
    { id: 'all', label: t('filter.all'), icon: 'LayoutGrid', search: '' },
    ...statuses.map((s) => ({
      id: s.key,
      label: statusName(s, lang),
      icon: s.icon ?? 'Circle',
      search: `view=${s.key}`,
    })),
    ...extra,
    { id: 'favorite', label: t('filter.favorite'), icon: 'Star', search: 'view=favorite' },
  ]

  const link = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

  const nav = (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {/* Tasks 2 — დეშბორდი ყოველთვის პირველია */}
        <Link
          to="/"
          onClick={() => setDrawerOpen(false)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
            location.pathname === '/'
              ? 'text-foreground [&>svg]:text-gold'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <LayoutDashboard className="size-4 shrink-0" />
          {t('dashboard.nav')}
        </Link>

        {mediaModules.map((m) => {
          const d = MEDIA[m.type]
          const isActiveDomain = routeDomain === m.type
          const sectionOpen = !!open[m.type]
          return (
            <div key={m.key}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [m.type]: !o[m.type] }))}
                aria-expanded={sectionOpen}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                  isActiveDomain ? 'text-foreground [&>svg]:text-gold' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <ModuleIcon name={m.icon} className="size-4 shrink-0" />
                <span className="flex-1 text-left">{moduleName(m, i18n.language)}</span>
                <ChevronDown
                  className={cn('size-4 shrink-0 transition-transform', sectionOpen ? '' : '-rotate-90')}
                />
              </button>

              {sectionOpen && (
                <div className="mb-1 ml-2 space-y-0.5 border-l border-border pl-2">
                  {sectionsFor(statusMap[m.type] ?? []).map((sec) => {
                    const active = isActiveDomain && activeView === sec.id
                    return (
                      <button
                        key={sec.id}
                        onClick={() => setView(d.libraryPath, sec.id)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    )
                  })}
                  <Link
                    to={`/dictionaries/${m.type}-statuses`}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                      location.pathname === `/dictionaries/${m.type}-statuses`
                        ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Tags className="size-4 shrink-0" />
                    {t('statuses.manage')}
                  </Link>
                  <Link
                    to={`${d.detailBase}/new`}
                    onClick={() => setDrawerOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
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
              <div key={m.key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, song: !o.song }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                    onSongs || location.pathname.startsWith('/playlists')
                      ? 'text-foreground [&>svg]:text-gold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ModuleIcon name={m.icon} className="size-4 shrink-0" />
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
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          activeSection === sec.id
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
                    {/* პლეილისტები სიმღერების ქვე-სექციაა (2026-09-03) */}
                    <Link
                      to="/playlists"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname.startsWith('/playlists')
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <ListMusic className="size-4 shrink-0" />
                      {t('playlists.title')}
                    </Link>
                    <Link
                      to="/dictionaries/song-genres"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname === '/dictionaries/song-genres'
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Tags className="size-4 shrink-0" />
                      {t('songGenres.manage')}
                    </Link>
                    <Link
                      to={`${m.route_base}?new=1`}
                      onClick={() => setDrawerOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
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
               ლექსიკონი · დამატებაა" — შეგნებული გადახრა საერთო წესიდან,
               user-ის მითითებით. სტატუსით ჭრა ფილტრების პანელში რჩება. */
            const sections: VideoSection[] = [
              { id: 'all', label: t('filter.all'), icon: 'LayoutGrid', search: '' },
              { id: 'favorite', label: t('filter.favorite'), icon: 'Star', search: 'view=favorite' },
            ]

            const activeSection = !onBooks ? null : (params.get('view') ?? 'all')

            return (
              <div key={m.key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, book: !o.book }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                    onBooks || location.pathname === '/dictionaries/book-genres'
                      ? 'text-foreground [&>svg]:text-gold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ModuleIcon name={m.icon} className="size-4 shrink-0" />
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
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          activeSection === sec.id
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
                    <Link
                      to="/dictionaries/book-genres"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname === '/dictionaries/book-genres'
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Tags className="size-4 shrink-0" />
                      {t('bookGenres.manage')}
                    </Link>
                    <Link
                      to={`${m.route_base}?new=1`}
                      onClick={() => setDrawerOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
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
              <div key={m.key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, board_game: !o.board_game }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                    onGames || location.pathname === '/dictionaries/board-game-genres'
                      ? 'text-foreground [&>svg]:text-gold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ModuleIcon name={m.icon} className="size-4 shrink-0" />
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
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          activeSection === sec.id
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
                    <Link
                      to="/dictionaries/board-game-genres"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname === '/dictionaries/board-game-genres'
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Tags className="size-4 shrink-0" />
                      {t('boardGameGenres.manage')}
                    </Link>
                    <Link
                      to={`${m.route_base}?new=1`}
                      onClick={() => setDrawerOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
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
              <div key={m.key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, game: !o.game }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                    onGames || location.pathname === '/dictionaries/game-genres'
                      ? 'text-foreground [&>svg]:text-gold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ModuleIcon name={m.icon} className="size-4 shrink-0" />
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
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          activeSection === sec.id
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
                    <Link
                      to="/dictionaries/game-genres"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname === '/dictionaries/game-genres'
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Tags className="size-4 shrink-0" />
                      {t('gameGenres.manage')}
                    </Link>
                    <Link
                      to={`${m.route_base}?new=1`}
                      onClick={() => setDrawerOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
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
            const sections = sectionsFor(statusMap.note)

            const activeSection = !onNotes ? null : (params.get('view') ?? 'all')

            return (
              <div key={m.key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, note: !o.note }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                    onNotes || location.pathname === '/dictionaries/note-categories'
                      ? 'text-foreground [&>svg]:text-gold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ModuleIcon name={m.icon} className="size-4 shrink-0" />
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
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          activeSection === sec.id
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
                    <Link
                      to="/dictionaries/note-statuses"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname === '/dictionaries/note-statuses'
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Tags className="size-4 shrink-0" />
                      {t('statuses.manage')}
                    </Link>
                    <Link
                      to="/dictionaries/note-categories"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname === '/dictionaries/note-categories'
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Tags className="size-4 shrink-0" />
                      {t('noteCategories.manage')}
                    </Link>
                    <Link
                      to={`${m.route_base}?new=1`}
                      onClick={() => setDrawerOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
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
            const sections = sectionsFor(statusMap.bookmark)

            const activeSection = !onBookmarks ? null : (params.get('view') ?? 'all')

            return (
              <div key={m.key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, bookmark: !o.bookmark }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                    onBookmarks || location.pathname === '/dictionaries/bookmark-categories'
                      ? 'text-foreground [&>svg]:text-gold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ModuleIcon name={m.icon} className="size-4 shrink-0" />
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
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          activeSection === sec.id
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <ModuleIcon name={sec.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{sec.label}</span>
                      </button>
                    ))}
                    <Link
                      to="/dictionaries/bookmark-statuses"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname === '/dictionaries/bookmark-statuses'
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Tags className="size-4 shrink-0" />
                      {t('statuses.manage')}
                    </Link>
                    <Link
                      to="/dictionaries/bookmark-categories"
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        location.pathname === '/dictionaries/bookmark-categories'
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Tags className="size-4 shrink-0" />
                      {t('bookmarkCategories.manage')}
                    </Link>
                    <Link
                      to={`${m.route_base}?new=1`}
                      onClick={() => setDrawerOpen(false)}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
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
              <div key={m.key}>
                <button
                  onClick={() => setOpen((o) => ({ ...o, gallery: !o.gallery }))}
                  aria-expanded={sectionOpen}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                    onGallery ? 'text-foreground [&>svg]:text-gold' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ModuleIcon name={m.icon} className="size-4 shrink-0" />
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
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          // ⚠️ „ყველა" მხოლოდ ზუსტ მისამართზეა აქტიური, თორემ
                          // ყოველ ქვე-გვერდზე ორი პუნქტი აინთებოდა
                          (cut.key === 'all' ? location.pathname === cut.path : location.pathname.startsWith(cut.path))
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <cut.icon className="size-4 shrink-0" />
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
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                  // ქვე-გვერდზეც აქტიური რჩება (მაგ. `/gallery/movie/12` — Tasks 10)
                  location.pathname === m.route_base ||
                    location.pathname.startsWith(`${m.route_base}/`)
                    ? 'text-foreground [&>svg]:text-gold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <ModuleIcon name={m.icon} className="size-4 shrink-0" />
                {moduleName(m, i18n.language)}
              </Link>
            )
          }

          const onVideos = location.pathname === m.route_base
          const sectionOpen = !!open.video

          /* „ყველა" · „რჩეული" (Tasks §2.7 → §5.4).
             ⚠️ **ტიპების სრული სია აქ აღარაა** — ის ლექსიკონია და ფილტრების
             პანელს ეკუთვნის; საიდბარში მხოლოდ „ტიპის მართვა" რჩება. ერთი
             წესი ყველა მოდულზე: ყველა → სტატუსები → რჩეული → მართვა → დამატება. */
          /* §6.4 — ვიდეოსაც სტატუსები აქვს; „ჩამოწერილები" მათ შორის ჯდება.
             §7.1 — ჩამოწერილები **ცალკე სექციაცაა და საერთო სიაშიც რჩება**
             (თასქის პირობა): აქ მხოლოდ ისინი ჩანს, „ყველაში" კი ხატულით
             გამოირჩევა, ე.ი. ერთი შეხედვით ჩანს, რომელია ლოკალური. */
          const sections = sectionsFor(statusMap.video, [
            { id: 'downloaded', label: t('videos.downloadedSection'), icon: 'HardDriveDownload', search: 'view=downloaded' },
          ])

          const activeSection = !onVideos ? null : (params.get('view') ?? 'all')

          return (
            <div key={m.key}>
              <button
                onClick={() => setOpen((o) => ({ ...o, video: !o.video }))}
                aria-expanded={sectionOpen}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                  onVideos ? 'text-foreground [&>svg]:text-gold' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <ModuleIcon name={m.icon} className="size-4 shrink-0" />
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
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                        activeSection === s.id
                          ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <ModuleIcon name={s.icon} className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">{s.label}</span>
                    </button>
                  ))}
                  <Link
                    to="/dictionaries/video-statuses"
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                      location.pathname === '/dictionaries/video-statuses'
                        ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Tags className="size-4 shrink-0" />
                    {t('statuses.manage')}
                  </Link>
                  <Link
                    to="/dictionaries/video-types"
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                      location.pathname === '/dictionaries/video-types'
                        ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Tags className="size-4 shrink-0" />
                    {t('videoTypes.manage')}
                  </Link>
                  <Link
                    to={`${m.route_base}?new=1`}
                    onClick={() => setDrawerOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
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

        {mediaModules.length > 0 && (
          <Link to="/genres" onClick={() => setDrawerOpen(false)} className={link}>
            <Tags className="size-4 shrink-0" />
            {t('genres.manage')}
          </Link>
        )}
        {/* Tasks 4 — მასობრივი ოპერაციები ვიდეოებსაც ეხება (ტიპი/ტეგები),
            ე.ი. მედია-მოდულის გარეშეც სჭირდება ბმული */}
        {(mediaModules.length > 0 || pageModules.some((m) => m.key === 'video')) && (
          <Link to="/status" onClick={() => setDrawerOpen(false)} className={link}>
            <ListChecks className="size-4 shrink-0" />
            {t('bulkStatus.manage')}
          </Link>
        )}
        {/* L2 — სინქრონი პარამეტრებიდან ცალკე გვერდზე გავიდა (queue გლობალურია);
            TMDB მხოლოდ მედია-დომენებს ეხება */}
        {mediaModules.length > 0 && (
          <Link to="/sync" onClick={() => setDrawerOpen(false)} className={link}>
            <DownloadCloud className="size-4 shrink-0" />
            {t('sync.title')}
          </Link>
        )}
        {/* Tasks 7 — თარგმანები. ორენოვანი სქემა მხოლოდ მედია-დომენებს აქვთ
            (ჟანრებიც მათი ლექსიკონია), ე.ი. იმავე პირობაზე ჩანს, რაც სინქრონი. */}
        {mediaModules.length > 0 && (
          <Link to="/translations" onClick={() => setDrawerOpen(false)} className={link}>
            <Languages className="size-4 shrink-0" />
            {t('translate.title')}
          </Link>
        )}
        {/* Tasks §16.2 — „ვისთან ჰგავს ჩემი გემოვნება". მოდულზე დამოკიდებული
            არაა: სოციალური ფენა ბიბლიოთეკის შიგთავსს არ ეკითხება. */}
        <Link to="/people" onClick={() => setDrawerOpen(false)} className={link}>
          <Users className="size-4 shrink-0" />
          {t('people.title')}
        </Link>
        {/* Tasks §16.3 — ჩატი; წაუკითხავის მრიცხველი ჰედერშივე ჩანს */}
        <Link to="/chat" onClick={() => setDrawerOpen(false)} className={link}>
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
        <Link to="/modules" onClick={() => setDrawerOpen(false)} className={link}>
          <Puzzle className="size-4 shrink-0" />
          {t('modules.title')}
        </Link>

        {/* Tasks 1.1 — „ადმინი" ერთიანი ბმული აღარაა; ოთხი ცალკე სექციაა */}
        <Link to="/requests" onClick={() => setDrawerOpen(false)} className={link}>
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
          <Link to="/users" onClick={() => setDrawerOpen(false)} className={link}>
            <Users className="size-4 shrink-0" />
            {t('admin.users')}
          </Link>
        )}
        {canAdmin('roles') && (
          <Link to="/roles" onClick={() => setDrawerOpen(false)} className={link}>
            <ShieldCheck className="size-4 shrink-0" />
            {t('roles.title')}
          </Link>
        )}
        {/* Tasks §4.4 — აუდიტ-ლოგი; ცალკე უფლებაა (`admin:audit`) */}
        {canAdmin('audit') && (
          <Link to="/audit" onClick={() => setDrawerOpen(false)} className={link}>
            <ScrollText className="size-4 shrink-0" />
            {t('audit.title')}
          </Link>
        )}
        {/* ⚠️ მასობრივი წაშლა **მხოლოდ** super_admin-ისაა (სხვისი ბიბლიოთეკის
            წაშლაა) — ის სექციის უფლებით არ იხსნება. დესტრუქციულია, ბოლოშია. */}
        {isAdmin && (
          <Link to="/purge" onClick={() => setDrawerOpen(false)} className={link}>
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
