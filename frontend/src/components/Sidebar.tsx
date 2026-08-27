import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Eye,
  Film,
  HelpCircle,
  LayoutGrid,
  ListChecks,
  Menu,
  Plus,
  Star,
  Tags,
  Tv,
  X,
} from 'lucide-react'
import { mediaFromPath, type MediaType } from '@/lib/media'
import { LanguageDropdown } from './LanguageDropdown'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'

const VIEWS = [
  { key: 'all', icon: LayoutGrid },
  { key: 'undecided', icon: HelpCircle },
  { key: 'to_watch', icon: Bookmark },
  { key: 'watching', icon: Eye },
  { key: 'watched', icon: CheckCircle2 },
  { key: 'favorite', icon: Star },
] as const

const DOMAINS: {
  type: MediaType
  icon: typeof Film
  labelKey: string
  libraryPath: string
  addPath: string
  addKey: string
}[] = [
  { type: 'movie', icon: Film, labelKey: 'nav.movies', libraryPath: '/', addPath: '/movies/new', addKey: 'actions.add' },
  { type: 'series', icon: Tv, labelKey: 'nav.series', libraryPath: '/series', addPath: '/series/new', addKey: 'actions.addSeries' },
]

export function Sidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [open, setOpen] = useState<Record<MediaType, boolean>>({ movie: true, series: true })

  const activeDomain = mediaFromPath(location.pathname)
  const view = params.get('view') ?? 'all'

  const setView = (libraryPath: string, v: string) => {
    const n = new URLSearchParams()
    if (v !== 'all') n.set('view', v)
    navigate({ pathname: libraryPath, search: n.toString() })
    setDrawerOpen(false)
  }

  const label = (v: string) =>
    v === 'all' ? t('filter.all') : v === 'favorite' ? t('filter.favorite') : t(`status.${v}`)

  const nav = (
    <>
      <nav className="flex-1 space-y-1">
        {DOMAINS.map((d) => {
          const isActiveDomain = activeDomain === d.type
          const sectionOpen = open[d.type]
          return (
            <div key={d.type}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [d.type]: !o[d.type] }))}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors',
                  isActiveDomain ? 'text-foreground [&>svg]:text-gold' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <d.icon className="size-4 shrink-0" />
                <span className="flex-1 text-left">{t(d.labelKey)}</span>
                <ChevronDown
                  className={cn('size-4 shrink-0 transition-transform', sectionOpen ? '' : '-rotate-90')}
                />
              </button>

              {sectionOpen && (
                <div className="mb-1 ml-2 space-y-0.5 border-l border-border pl-2">
                  {VIEWS.map(({ key, icon: Icon }) => {
                    const active = isActiveDomain && view === key
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
                    to={d.addPath}
                    onClick={() => setDrawerOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-primary transition-colors hover:bg-muted"
                  >
                    <Plus className="size-4 shrink-0" />
                    {t(d.addKey)}
                  </Link>
                </div>
              )}
            </div>
          )
        })}

        <div className="my-2 border-t border-border" />
        <Link
          to="/genres"
          onClick={() => setDrawerOpen(false)}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Tags className="size-4 shrink-0" />
          {t('genres.manage')}
        </Link>
        <Link
          to="/status"
          onClick={() => setDrawerOpen(false)}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ListChecks className="size-4 shrink-0" />
          {t('bulkStatus.manage')}
        </Link>
      </nav>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
        <div className="min-w-0 flex-1">
          <LanguageDropdown />
        </div>
        <ThemeToggle />
      </div>
    </>
  )

  return (
    <>
      {/* ===== Mobile top bar ===== */}
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="menu"
          className="grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu className="size-5" />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Clapperboard className="size-4" />
          </span>
          <span className="font-display text-lg font-semibold leading-none tracking-tight">
            {t('app.title')}
          </span>
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {/* ===== Desktop sidebar ===== */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-5 lg:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Clapperboard className="size-[18px]" />
          </span>
          <span className="font-display text-[22px] font-semibold leading-none tracking-tight">
            {t('app.title')}
          </span>
        </Link>
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
