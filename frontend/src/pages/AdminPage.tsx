import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ExternalLink, Puzzle, ShieldCheck, Users, X } from 'lucide-react'
import {
  approveRequest,
  fetchAdminModules,
  fetchAdminRequests,
  fetchUsers,
  rejectRequest,
  syncUserModules,
  updateModule,
  updateUser,
  type ApprovalRequestItem,
  type ModuleInfo,
  type User,
} from '@/api/account'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { moduleName } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   სუპერ-ადმინის პანელი (I4): მომხმარებლები · მოთხოვნები · მოდულები
   ============================================================ */

type Tab = 'users' | 'requests' | 'modules'

export function AdminPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('requests')

  const { data: pending = [] } = useQuery({
    queryKey: ['admin-requests', 'pending'],
    queryFn: () => fetchAdminRequests('pending'),
    enabled: !!user?.is_super_admin,
  })

  if (!user?.is_super_admin) return null

  const TABS: { key: Tab; label: string; icon: typeof Users; badge?: number }[] = [
    { key: 'requests', label: t('admin.requests'), icon: ShieldCheck, badge: pending.length },
    { key: 'users', label: t('admin.users'), icon: Users },
    { key: 'modules', label: t('admin.modules'), icon: Puzzle },
  ]

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{t('admin.pageTitle')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t('admin.pageSubtitle')}</p>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
              tab === tb.key
                ? 'border-primary bg-secondary font-medium'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <tb.icon className="size-4" />
            {tb.label}
            {!!tb.badge && (
              <span className="rounded-[5px] bg-primary px-1.5 text-xs text-primary-foreground">
                {tb.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'requests' && <RequestsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'modules' && <ModulesTab />}
    </main>
  )
}

/* ---------- მოთხოვნები ---------- */

function RequestsTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [status, setStatus] = useState('pending')
  const [notes, setNotes] = useState<Record<number, string>>({})

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin-requests', status],
    queryFn: () => fetchAdminRequests(status),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-requests'] })
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    qc.invalidateQueries({ queryKey: ['genres'] })
  }

  const approve = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => approveRequest(id, note),
    onSuccess: () => {
      invalidate()
      toast({ title: t('admin.approved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const reject = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => rejectRequest(id, note),
    onSuccess: () => {
      invalidate()
      toast({ title: t('admin.rejected'), variant: 'info' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const label = (r: ApprovalRequestItem) => {
    if (r.type === 'module_access') {
      const name = (i18n.language === 'ka' ? r.module?.name_ka : r.module?.name_en) ?? '—'
      return t('admin.wantsModule', { name })
    }
    const name = (i18n.language === 'ka' ? r.genre?.name_ka : r.genre?.name_en) ?? '—'
    return t('admin.wantsGenreDelete', { name })
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              'cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors',
              status === s ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t(`requests.status.${s}`)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !items.length && (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          {t('admin.noRequests')}
        </p>
      )}

      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{label(r)}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.user?.display_name} · {r.user?.email}
                  {r.created_at && ` · ${new Date(r.created_at).toLocaleString()}`}
                </p>
                {r.message && <p className="mt-2 text-sm italic">„{r.message}"</p>}

                {/* ჟანრის წაშლა გლობალურია — ადმინს ვაჩვენებთ რამდენ ჩანაწერს შეეხება */}
                {r.type === 'genre_delete' && r.payload && (
                  <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {t('admin.genreDeleteWarning', {
                      movies: (r.payload.movies_count as number) ?? 0,
                      series: (r.payload.series_count as number) ?? 0,
                    })}
                  </p>
                )}
              </div>

              {r.status === 'pending' ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => approve.mutate({ id: r.id, note: notes[r.id] })}
                    disabled={approve.isPending}
                  >
                    <Check className="size-4" />
                    {t('admin.approve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject.mutate({ id: r.id, note: notes[r.id] })}
                    disabled={reject.isPending}
                  >
                    <X className="size-4" />
                    {t('admin.reject')}
                  </Button>
                </div>
              ) : (
                <span
                  className={cn(
                    'shrink-0 text-xs',
                    r.status === 'approved' ? 'text-gold' : 'text-destructive',
                  )}
                >
                  {t(`requests.status.${r.status}`)}
                  {r.reviewer && ` · ${r.reviewer.display_name}`}
                </span>
              )}
            </div>

            {r.status === 'pending' && (
              <Textarea
                className="mt-3"
                rows={1}
                placeholder={t('admin.notePlaceholder')}
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              />
            )}
            {r.status !== 'pending' && r.review_note && (
              <p className="mt-2 text-xs text-muted-foreground">— {r.review_note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- მომხმარებლები ---------- */

function UsersTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: fetchUsers })
  const { data: modules = [] } = useQuery({ queryKey: ['admin-modules'], queryFn: fetchAdminModules })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    qc.invalidateQueries({ queryKey: ['modules'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const patch = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof updateUser>[1] }) =>
      updateUser(id, input),
    onSuccess: done,
    onError: fail,
  })

  const setModules = useMutation({
    mutationFn: ({ id, keys }: { id: number; keys: string[] }) => syncUserModules(id, keys),
    onSuccess: done,
    onError: fail,
  })

  // წაშლა შიდა გვერდზეა (K14) — სიაში მხოლოდ სწრაფი გადამრთველებია
  const toggleModule = (u: User, key: string, on: boolean) => {
    const current = u.modules ?? []
    setModules.mutate({ id: u.id, keys: on ? [...current, key] : current.filter((k) => k !== key) })
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>

  return (
    <div className="space-y-3">
      {users.map((u) => (
        <div key={u.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* შიდა გვერდი — უფლებები, შიგთავსი, ადგილი (K14) */}
                <Link to={`/admin/users/${u.id}`} className="font-medium hover:text-primary hover:underline">
                  {u.display_name}
                </Link>
                <span className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                  {t(`roles.${u.role}`)}
                </span>
                {!u.is_active && (
                  <span className="rounded-[5px] border border-destructive/40 px-1.5 py-0.5 text-[11px] text-destructive">
                    {t('admin.disabled')}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {u.email} · @{u.username} ·{' '}
                {t('admin.counts', { movies: u.movies_count ?? 0, series: u.series_count ?? 0 })}
                {(u.videos_count ?? 0) > 0 && ` · ${t('admin.videosCount', { count: u.videos_count })}`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Switch
                  checked={u.role === 'super_admin'}
                  onCheckedChange={(v) =>
                    patch.mutate({ id: u.id, input: { role: v ? 'super_admin' : 'user' } })
                  }
                />
                {t('roles.super_admin')}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Switch
                  checked={u.is_active}
                  onCheckedChange={(v) => patch.mutate({ id: u.id, input: { is_active: v } })}
                />
                {t('admin.active')}
              </label>
              <Link
                to={`/admin/users/${u.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted"
              >
                <ExternalLink className="size-3.5" />
                {t('admin.openUser')}
              </Link>
            </div>
          </div>

          {/* მოდულები per-user (დეტალები შიდა გვერდზეა) */}
          <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
            {modules.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
                {/* super_admin-ს არა-sensitive მოდულები ავტომატურად აქვს; 18+ — მასაც აშკარად ეთიშება */}
                <Checkbox
                  checked={
                    (u.role === 'super_admin' && !m.is_sensitive) || (u.modules ?? []).includes(m.key)
                  }
                  disabled={u.role === 'super_admin' && !m.is_sensitive}
                  onCheckedChange={(v) => toggleModule(u, m.key, v === true)}
                />
                <ModuleIcon name={m.icon} className="size-4 text-muted-foreground" />
                {moduleName(m, i18n.language)}
              </label>
            ))}
            {u.role === 'super_admin' && (
              <span className="text-xs text-muted-foreground">{t('admin.adminHasAllModules')}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- მოდულები ---------- */

function ModulesTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['admin-modules'],
    queryFn: fetchAdminModules,
  })

  const patch = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<ModuleInfo> }) => updateModule(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-modules'] })
      qc.invalidateQueries({ queryKey: ['modules'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>

  return (
    <div className="space-y-3">
      {modules.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
            <ModuleIcon name={m.icon} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {moduleName(m, i18n.language)}
              {m.is_sensitive && (
                <span className="ml-2 rounded-[5px] border border-destructive/40 px-1.5 py-0.5 text-[11px] text-destructive">
                  18+
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <code>{m.key}</code> · {m.route_base}
            </p>
            {/* ვის აქვს ჩართული — სუპერ-ადმინიც ითვლება (K14) */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {m.users?.length ? (
                m.users.map((u) => (
                  <Link
                    key={u.id}
                    to={`/admin/users/${u.id}`}
                    title={u.implicit ? t('admin.moduleAuto') : undefined}
                    className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px] hover:bg-muted"
                  >
                    {u.display_name}
                    {u.implicit && <span className="ml-1 opacity-60">·</span>}
                  </Link>
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">{t('admin.noUsers')}</span>
              )}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Switch
              checked={m.is_active}
              onCheckedChange={(v) => patch.mutate({ id: m.id, input: { is_active: v } })}
            />
            {t('admin.active')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Switch
              checked={m.enabled_by_default}
              onCheckedChange={(v) => patch.mutate({ id: m.id, input: { enabled_by_default: v } })}
            />
            {t('admin.byDefault')}
          </label>
        </div>
      ))}
    </div>
  )
}
