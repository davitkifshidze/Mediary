import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Film, HardDrive, Star, Trash2, Tv, Video as VideoIcon } from 'lucide-react'
import {
  deleteUser,
  fetchUserDetail,
  syncUserModules,
  updateUser,
  type UserDetail,
} from '@/api/account'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { storageUrl } from '@/lib/api'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   მომხმარებლის შიდა გვერდი ადმინისთვის (Tasks K14).
   ერთ ადგილას: უფლებები, მოდულები, შიგთავსი, ადგილი და მოთხოვნების ისტორია.
   ============================================================ */

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function Stat({ icon: Icon, label, value }: { icon: typeof Film; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

export function AdminUserPage() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { user: me } = useAuth()

  const userId = Number(id)
  const { data, isLoading } = useQuery<UserDetail>({
    queryKey: ['admin-user', userId],
    queryFn: () => fetchUserDetail(userId),
    enabled: Number.isFinite(userId),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['admin-user', userId] })
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    qc.invalidateQueries({ queryKey: ['admin-modules'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const patch = useMutation({
    mutationFn: (input: Parameters<typeof updateUser>[1]) => updateUser(userId, input),
    onSuccess: done,
    onError: fail,
  })

  const setModules = useMutation({
    mutationFn: (keys: string[]) => syncUserModules(userId, keys),
    onSuccess: done,
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: () => deleteUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast({ title: t('admin.userDeleted'), variant: 'success' })
      navigate('/admin', { replace: true })
    },
    onError: fail,
  })

  if (isLoading || !data) {
    return <main className="mx-auto max-w-4xl px-5 py-8 text-sm text-muted-foreground">{t('common.loading')}</main>
  }

  const { user, content, storage, modules, requests } = data

  const toggleModule = (key: string, on: boolean) => {
    // sync ცვლის მთელ ნაკრებს — აშკარად მინიჭებულებს ვინარჩუნებთ
    const explicit = modules.filter((m) => m.granted && (m.is_sensitive || !user.is_super_admin)).map((m) => m.key)
    const next = on ? [...new Set([...explicit, key])] : explicit.filter((k) => k !== key)
    setModules.mutate(next)
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <Link
        to="/admin"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('admin.title')}
      </Link>

      {/* ---------- ვინაობა ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
          {user.avatar_path ? (
            <img src={storageUrl(user.avatar_path) ?? ''} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-muted-foreground">
              {user.display_name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{user.display_name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {user.email} · @{user.username} · {t(`roles.${user.role}`)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('admin.registered')}: {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'} ·{' '}
            {t('admin.lastActivity')}:{' '}
            {data.last_activity ? new Date(data.last_activity).toLocaleString() : t('admin.never')}
          </p>
        </div>
      </div>

      {/* ---------- შიგთავსი ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Film} label={t('nav.movies')} value={content.movies} />
        <Stat icon={Tv} label={t('nav.series')} value={content.series} />
        <Stat
          icon={VideoIcon}
          label={t('videos.title')}
          value={content.videos_adult ? `${content.videos} (${content.videos_adult} 18+)` : content.videos}
        />
        <Stat icon={Star} label={t('filter.favorite')} value={content.favorites} />
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <HardDrive className="size-4 text-muted-foreground" />
          {t('admin.storageUsed')}: <strong>{formatBytes(storage.bytes)}</strong>
          <span className="text-xs text-muted-foreground">
            ({t('admin.storageFiles', { count: storage.files })})
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t('admin.storageHint')}</p>
      </div>

      {/* ---------- უფლებები ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tight">{t('admin.permissions')}</h2>

        <div className="flex flex-wrap gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={user.role === 'super_admin'}
              onCheckedChange={(v) => patch.mutate({ role: v ? 'super_admin' : 'user' })}
            />
            {t('roles.super_admin')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={user.is_active}
              onCheckedChange={(v) => patch.mutate({ is_active: v })}
            />
            {t('admin.active')}
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t('admin.permissionsHint')}</p>
      </section>

      {/* ---------- მოდულები ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t('admin.modules')}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t('admin.userModulesHint')}</p>

        <div className="space-y-2">
          {modules.map((m) => {
            const auto = user.is_super_admin && !m.is_sensitive
            return (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <Checkbox
                  checked={m.granted}
                  disabled={auto || !m.is_active}
                  onCheckedChange={(v) => toggleModule(m.key, v === true)}
                />
                <ModuleIcon name={m.icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-sm">
                  {i18n.language === 'ka' ? m.name_ka : m.name_en}
                  {m.is_sensitive && (
                    <span className="ml-2 rounded-[5px] border border-destructive/40 px-1.5 py-0.5 text-[11px] text-destructive">
                      18+
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {!m.is_active
                    ? t('admin.moduleOff')
                    : auto
                      ? t('admin.moduleAuto')
                      : m.hidden_by_user
                        ? t('admin.moduleHiddenByUser')
                        : m.granted
                          ? t('modules.enabled')
                          : ''}
                </span>
              </label>
            )
          })}
        </div>
      </section>

      {/* ---------- მოთხოვნების ისტორია ---------- */}
      {requests.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">{t('admin.requests')}</h2>
          <ul className="space-y-2 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-b-0">
                <span>
                  {r.type === 'module_access'
                    ? (i18n.language === 'ka' ? r.module?.name_ka : r.module?.name_en) ?? '—'
                    : (i18n.language === 'ka' ? r.genre?.name_ka : r.genre?.name_en) ?? '—'}
                </span>
                <span className="text-xs text-muted-foreground">{t(`requests.status.${r.status}`)}</span>
                {r.created_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- საშიში ზონა ---------- */}
      <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight text-destructive">
          {t('admin.dangerZone')}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {t('admin.deleteUserHint', {
              name: user.display_name,
              movies: content.movies,
              series: content.series,
            })}
          </p>
          <Button
            variant="destructive"
            disabled={user.id === me?.id || remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: t('admin.deleteUser'),
                description: t('admin.deleteUserHint', {
                  name: user.display_name,
                  movies: content.movies,
                  series: content.series,
                }),
                variant: 'destructive',
              })
              if (ok) remove.mutate()
            }}
          >
            <Trash2 className="size-4" />
            {t('admin.deleteUser')}
          </Button>
        </div>
      </section>
    </main>
  )
}
