import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Eye,
  HelpCircle,
  LayoutGrid,
  ListChecks,
  Lock,
  Plus,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Tags,
  X,
} from 'lucide-react'
import { MEDIA, type MediaType } from '@/lib/media'
import { moduleName, useModules } from '@/lib/modules'
import { useAuth } from '@/lib/auth'
import { fetchPendingCount } from '@/api/account'
import { ModuleIcon } from './ModuleIcon'
import { cn } from '@/lib/utils'

const VIEWS = [
  { key: 'all', icon: LayoutGrid },
  { key: 'undecided', icon: HelpCircle },
  { key: 'to_watch', icon: Bookmark },
  { key: 'watching', icon: Eye },
  { key: 'watched', icon: CheckCircle2 },
  { key: 'favorite', icon: Star },
] as const

/** ვიდეოების სექციები (K7). `adult` მხოლოდ `video_adult` მოდულით ჩანს. */
const VIDEO_VIEWS = [
  { key: 'all', icon: LayoutGrid, labelKey: 'filter.all' },
  { key: 'media', icon: Clapperboard, labelKey: 'videos.kindMedia' },
  { key: 'info', icon: BookOpen, labelKey: 'videos.kindInfo' },
  { key: 'adult', icon: Lock, labelKey: 'videos.adultSection' },
  { key: 'favorite', icon: Star, labelKey: 'filter.favorite' },
] as const

/**
 * დომენი მხოლოდ დომენის საკუთარი მარშრუტებისთვის — /genres, /status, /actors
 * არც ერთ დომენს არ ეკუთვნის, ამიტომ null (სექციების ავტო-გადართვა არ უნდა გამოიწვიოს).
 */
function domainFromRoute(pathname: string): MediaType | null {
  if (pathname === '/series' || pathname.startsWith('/series/')) return 'series'
  if (pathname === '/' || pathname.startsWith('/movies/')) return 'movie'
  return null
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
  const { mediaModules, pageModules, has } = useModules()
  const { isAdmin } = useAuth()
  const setDrawerOpen = onDrawerChange
  const hasAdultModule = has('video_adult')
  const videoView = params.get('view') ?? 'all'
  // პირველ შესვლაზე ყველა სექცია ჩაკეცილია
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const routeDomain = domainFromRoute(location.pathname)
  const isLibraryRoute = !!routeDomain && location.pathname === MEDIA[routeDomain].libraryPath
  const viewParam = params.get('view') ?? 'all'

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

  // ადმინის badge — რამდენი მოთხოვნაა რიგში
  const { data: pending = 0 } = useQuery({
    queryKey: ['pending-count'],
    queryFn: fetchPendingCount,
    enabled: isAdmin,
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

  const label = (v: string) =>
    v === 'all' ? t('filter.all') : v === 'favorite' ? t('filter.favorite') : t(`status.${v}`)

  const link = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

  const nav = (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto">
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
                  {VIEWS.map(({ key, icon: Icon }) => {
                    const active = isActiveDomain && activeView === key
                    return (
                      <button
                        key={key}
                        onClick={() => setView(d.libraryPath, key)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {label(key)}
                      </button>
                    )
                  })}
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

        {/* არა-მედია მოდულები — ვიდეოებს თავისი სექციები აქვს (K7) */}
        {pageModules.map((m) => {
          if (m.key !== 'video') {
            return (
              <Link
                key={m.key}
                to={m.route_base}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                  location.pathname === m.route_base
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
          const views = VIDEO_VIEWS.filter((v) => v.key !== 'adult' || hasAdultModule)

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
                  {views.map(({ key, icon: Icon, labelKey }) => {
                    const active = onVideos && videoView === key
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          const n = new URLSearchParams()
                          if (key !== 'all') n.set('view', key)
                          navigate({ pathname: m.route_base, search: n.toString() })
                          setDrawerOpen(false)
                        }}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-secondary font-medium text-foreground [&>svg]:text-gold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {t(labelKey)}
                      </button>
                    )
                  })}
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
          <>
            <Link to="/genres" onClick={() => setDrawerOpen(false)} className={link}>
              <Tags className="size-4 shrink-0" />
              {t('genres.manage')}
            </Link>
            <Link to="/status" onClick={() => setDrawerOpen(false)} className={link}>
              <ListChecks className="size-4 shrink-0" />
              {t('bulkStatus.manage')}
            </Link>
          </>
        )}
        <Link to="/modules" onClick={() => setDrawerOpen(false)} className={link}>
          <Puzzle className="size-4 shrink-0" />
          {t('modules.title')}
        </Link>
        <Link to="/settings" onClick={() => setDrawerOpen(false)} className={link}>
          <SlidersHorizontal className="size-4 shrink-0" />
          {t('settings.title')}
        </Link>
        {isAdmin && (
          <Link to="/admin" onClick={() => setDrawerOpen(false)} className={link}>
            <ShieldCheck className="size-4 shrink-0" />
            <span className="flex-1">{t('admin.title')}</span>
            {pending > 0 && (
              <span className="rounded-[5px] bg-primary px-1.5 text-xs text-primary-foreground">
                {pending}
              </span>
            )}
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
