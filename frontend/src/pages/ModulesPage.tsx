import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Clock, Lock } from 'lucide-react'
import { fetchAdminModules, fetchMyRequests, type ModuleInfo } from '@/api/account'
import { moduleDescription, moduleName, useModules } from '@/lib/modules'
import { useAuth } from '@/lib/auth'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

/* ============================================================
   მოდულების სექცია (Tasks 1.4) — **ერთი** გვერდი ორის ნაცვლად.

   ადრე ორი იყო: `/modules` (მომხმარებლის სია) და ადმინის „მოდულები" ტაბი
   (ქარდები + მოდალი). ახლა ერთია, ქარდებით, და ქარდზე დაჭერით იხსნება
   **შიდა გვერდი** `/modules/{key}` — მოდალი აღარაა.
   ============================================================ */

export function ModulesPage() {
  const { t, i18n } = useTranslation()
  const { all, loading } = useModules()
  const { isAdmin } = useAuth()

  const { data: requests = [] } = useQuery({ queryKey: ['my-requests'], queryFn: fetchMyRequests })

  /**
   * `GET /modules` მხოლოდ **აქტიურ** მოდულებს აბრუნებს და `users_count`-ს არ იცის.
   * ადმინს ორივე სჭირდება, ამიტომ ადმინის სია ბაზისია და ჩემი მდგომარეობა
   * (`enabled`/`granted`) მასზე ედება.
   */
  const { data: adminModules } = useQuery({
    queryKey: ['admin-modules'],
    queryFn: fetchAdminModules,
    enabled: isAdmin,
  })

  const list = useMemo<ModuleInfo[]>(() => {
    if (!isAdmin || !adminModules) return all
    const mine = new Map(all.map((m) => [m.key, m]))
    return adminModules.map((m) => ({ ...m, ...(mine.get(m.key) ?? {}), ...{ users_count: m.users_count } }))
  }, [isAdmin, adminModules, all])

  const pendingFor = (m: ModuleInfo) =>
    requests.some((r) => r.type === 'module_access' && r.module?.id === m.id && r.status === 'pending')

  /** ჩემი მდგომარეობა ამ მოდულზე — ქარდის მთავარი ინფორმაცია */
  const state = (m: ModuleInfo) => {
    if (m.enabled) return { label: t('modules.enabled'), icon: Check, tone: 'text-gold' }
    if (m.granted) return { label: t('modules.disabledByMe'), icon: Lock, tone: 'text-muted-foreground' }
    if (pendingFor(m)) return { label: t('modules.pending'), icon: Clock, tone: 'text-muted-foreground' }
    return { label: t('modules.noAccess'), icon: Lock, tone: 'text-muted-foreground' }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('modules.title')}
        subtitle={isAdmin ? t('modules.subtitleAdmin') : t('modules.subtitle')}
      />

      {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => {
          const s = state(m)
          return (
            <Link
              key={m.id}
              to={`/modules/${m.key}`}
              className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
                  <ModuleIcon name={m.icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {moduleName(m, i18n.language)}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>

              <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                {moduleDescription(m, i18n.language)}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[11px]">
                <span className={cn('inline-flex items-center gap-1.5', s.tone)}>
                  <s.icon className="size-3.5" />
                  {s.label}
                </span>

                {/* ადმინის ინფო — გლობალური მდგომარეობა */}
                {isAdmin && (
                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    {!m.is_active && (
                      <span className="rounded-md border border-destructive/40 px-2 py-0.5 leading-relaxed text-destructive">
                        {t('admin.moduleOff')}
                      </span>
                    )}
                    {m.enabled_by_default && (
                      <span className="rounded-md bg-secondary px-2 py-0.5 leading-relaxed">
                        {t('admin.byDefault')}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {m.users_count
                        ? t('admin.usersCount', { count: m.users_count })
                        : t('admin.noUsers')}
                    </span>
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </PageContainer>
  )
}
