import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  AlertTriangle,
  ChevronDown,
  Clapperboard,
  Languages,
  LogOut,
  Menu,
  SlidersHorizontal,
  User as UserIcon,
} from 'lucide-react'
import { fetchTranslationSummary } from '@/api/translations'
import { useAuth } from '@/lib/auth'
import { storageUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { LAYER_POPUP } from '@/lib/layers'
import { LanguageDropdown } from './LanguageDropdown'
import { StorageBar, storageLevel } from './StorageBar'
import { ThemeToggle } from './ThemeToggle'

/* ============================================================
   ზედა ზოლი (Tasks K12 / F3).
   მარჯვნივ — სათარგმნების მრიცხველი (Tasks 7), ენა, თემა და მომხმარებლის
   მენიუ (პროფილი · პარამეტრები · გასვლა).
   მობილურზე მარცხნივ ჰამბურგერიც, რომელიც საიდბარის უჯრას ხსნის.
   ============================================================ */

export function Header({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()

  const level = user?.storage ? storageLevel(user.storage) : 'ok'
  const storageWarning = level === 'ok' ? null : level === 'warn' ? 'warn' : 'critical'

  // Tasks 7 — „გაქვს N სათარგმნი". მრიცხველი მსუბუქია, მაგრამ ყოველ ნავიგაციაზე
  // მისი გადათვლა ზედმეტია — ამიტომ 5 წუთი ითვლება ახლად.
  const pendingQ = useQuery({
    queryKey: ['translations', 'summary'],
    queryFn: fetchTranslationSummary,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  })
  const pending = pendingQ.data?.total ?? 0

  const item =
    'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
      <button
        onClick={onMenu}
        aria-label="menu"
        className="grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Link to="/" className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
          <Clapperboard className="size-[18px]" />
        </span>
        <span className="font-display text-[20px] font-semibold leading-none tracking-tight">
          {t('app.title')}
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        {/* Tasks 7 — ღილაკი მხოლოდ მაშინ ჩანს, როცა მართლა არის სათარგმნი */}
        {pending > 0 && (
          <Link
            to="/translations"
            title={t('translate.pending', { count: pending })}
            aria-label={t('translate.pending', { count: pending })}
            className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Languages className="size-5" />
            <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground">
              {pending > 99 ? '99+' : pending}
            </span>
          </Link>
        )}
        <div className="hidden w-36 sm:block">
          <LanguageDropdown />
        </div>
        <ThemeToggle />

        <PopoverPrimitive.Root>
          <PopoverPrimitive.Trigger className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted">
            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
              {user?.avatar_path ? (
                <img src={storageUrl(user.avatar_path) ?? ''} alt="" className="size-full object-cover" />
              ) : (
                <UserIcon className="size-4 text-muted-foreground" />
              )}
            </span>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">
              {user?.display_name}
            </span>
            {/* 17.3 — 80%/95%-ის გაფრთხილება დახურულ მენიუშიც ჩანს */}
            {storageWarning && (
              <AlertTriangle
                className={cn(
                  'size-4 shrink-0',
                  storageWarning === 'warn' ? 'text-amber-500' : 'text-destructive',
                )}
                aria-label={t('storage.warnShort')}
              />
            )}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </PopoverPrimitive.Trigger>

          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align="end"
              sideOffset={8}
              className={cn(
                LAYER_POPUP,
                'fb-content w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl focus:outline-none',
              )}
            >
              <div className="border-b border-border px-2.5 pb-2 pt-1.5">
                <p className="truncate text-sm font-medium">{user?.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                {/* 17.3 — „გამოყენებულია X / Y"; დეტალები `/settings`-ზეა */}
                {user?.storage && <StorageBar usage={user.storage} className="mt-2.5" />}
              </div>

              <div className="mt-1.5 space-y-0.5">
                <PopoverPrimitive.Close asChild>
                  <Link to="/profile" className={item}>
                    <UserIcon className="size-4 shrink-0" />
                    {t('profile.title')}
                  </Link>
                </PopoverPrimitive.Close>
                <PopoverPrimitive.Close asChild>
                  <Link to="/settings" className={item}>
                    <SlidersHorizontal className="size-4 shrink-0" />
                    {t('settings.title')}
                  </Link>
                </PopoverPrimitive.Close>
                <PopoverPrimitive.Close asChild>
                  <button onClick={() => void logout()} className={`${item} text-destructive hover:text-destructive`}>
                    <LogOut className="size-4 shrink-0" />
                    {t('auth.logout')}
                  </button>
                </PopoverPrimitive.Close>
              </div>

              {/* ენა მობილურზე ჰედერში არ ეტევა — მენიუშია */}
              <div className="mt-2 border-t border-border pt-2 sm:hidden">
                <LanguageDropdown />
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      </div>
    </header>
  )
}
