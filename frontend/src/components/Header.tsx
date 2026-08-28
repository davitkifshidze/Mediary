import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { ChevronDown, Clapperboard, LogOut, Menu, SlidersHorizontal, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { storageUrl } from '@/lib/api'
import { LanguageDropdown } from './LanguageDropdown'
import { ThemeToggle } from './ThemeToggle'

/* ============================================================
   ზედა ზოლი (Tasks K12 / F3).
   მარჯვნივ — ენა, თემა და მომხმარებლის მენიუ (პროფილი · პარამეტრები · გასვლა).
   მობილურზე მარცხნივ ჰამბურგერიც, რომელიც საიდბარის უჯრას ხსნის.
   ============================================================ */

export function Header({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()

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
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </PopoverPrimitive.Trigger>

          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align="end"
              sideOffset={8}
              className="fb-content z-50 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl focus:outline-none"
            >
              <div className="border-b border-border px-2.5 pb-2 pt-1.5">
                <p className="truncate text-sm font-medium">{user?.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
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
