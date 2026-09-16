import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  Film,
  Globe,
  HardDrive,
  ShieldCheck,
  Star,
  Trash2,
  Tv,
  Video as VideoIcon,
  X,
} from 'lucide-react'
import {
  approveRequest,
  deleteUser,
  fetchRoles,
  fetchUserDetail,
  rejectRequest,
  syncUserModules,
  updateUser,
  type UserDetail,
} from '@/api/account'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { storageUrl } from '@/lib/api'
import { requestLabel, roleName } from '@/lib/display'
import { formatBytes } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { StorageBar } from '@/components/StorageBar'
import { StorageLibrary } from '@/components/StorageLibrary'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PageContainer } from '@/components/ui/page'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   მომხმარებლის შიდა გვერდი ადმინისთვის (Tasks K14).
   ერთ ადგილას: უფლებები, მოდულები, შიგთავსი, ადგილი და მოთხოვნების ისტორია.
   ============================================================ */

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

export function UserPage() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { user: me } = useAuth()
  const fmt = useDateFormat()

  const userId = Number(id)
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles })
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

  // 1.3 — მოთხოვნა აქვე მტკიცდება; badge და `/requests` ერთად უნდა განახლდეს
  const review = useMutation({
    mutationFn: ({ id, ok }: { id: number; ok: boolean }) =>
      ok ? approveRequest(id) : rejectRequest(id),
    onSuccess: (_data, { ok }) => {
      done()
      qc.invalidateQueries({ queryKey: ['admin-requests'] })
      qc.invalidateQueries({ queryKey: ['pending-count'] })
      toast({ title: t(ok ? 'admin.approved' : 'admin.rejected'), variant: ok ? 'success' : 'info' })
    },
    onError: fail,
  })

  // 17.1 — კვოტა MB-ებში იმართება; ჩატვირთვისას ბაზის მნიშვნელობით ივსება
  const [quotaMb, setQuotaMb] = useState('')
  const quotaBytes = data?.storage.quota
  useEffect(() => {
    if (quotaBytes != null) setQuotaMb(String(Math.round(quotaBytes / 1024 / 1024)))
  }, [quotaBytes])

  const remove = useMutation({
    mutationFn: () => deleteUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast({ title: t('admin.userDeleted'), variant: 'success' })
      navigate('/users', { replace: true })
    },
    onError: fail,
  })

  if (isLoading || !data) {
    return <PageContainer><p className="text-sm text-muted-foreground">{t('common.loading')}</p></PageContainer>
  }

  const { user, content, storage, files, modules, requests } = data

  const toggleModule = (key: string, on: boolean) => {
    // sync ცვლის მთელ ნაკრებს — აშკარად მინიჭებულებს ვინარჩუნებთ
    const explicit = modules.filter((m) => m.granted && !user.is_super_admin).map((m) => m.key)
    const next = on ? [...new Set([...explicit, key])] : explicit.filter((k) => k !== key)
    setModules.mutate(next)
  }

  return (
    <PageContainer>
      <Link
        to="/users"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('admin.users')}
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
            {user.email} · @{user.username} · {roleName(user, i18n.language)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('admin.registered')}: {fmt.date(user.created_at)} ·{' '}
            {t('admin.lastActivity')}:{' '}
            {data.last_activity ? new Date(data.last_activity).toLocaleString() : t('admin.never')}
          </p>
        </div>
      </div>

      {/* ---------- შიგთავსი ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Film} label={t('nav.movies')} value={content.movies} />
        <Stat icon={Tv} label={t('nav.series')} value={content.series} />
        <Stat icon={VideoIcon} label={t('videos.title')} value={content.videos} />
        <Stat icon={Star} label={t('filter.favorite')} value={content.favorites} />
      </div>

      {/* ---------- საცავი და ლიმიტი (Tasks 1.3 / 17.1) ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <HardDrive className="size-4 text-muted-foreground" />
            {t('admin.storageUsed')}: <strong>{formatBytes(storage.bytes)}</strong>
            <span className="text-xs text-muted-foreground">
              ({t('admin.storageFiles', { count: storage.files })})
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t('admin.storageHint')}</p>
        </div>

        <StorageBar usage={storage} />

        {/* დაქეშილი მრიცხველი დისკს უნდა ემთხვეოდეს — სხვაობა ცხადად ჩანს */}
        {storage.used !== storage.bytes && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
            {t('storage.quotaMismatch', {
              cached: formatBytes(storage.used),
              actual: formatBytes(storage.bytes),
            })}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="min-w-44">
            <Label htmlFor="quota">{t('storage.quota')}</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id="quota"
                type="number"
                min={10}
                step={10}
                value={quotaMb}
                onChange={(e) => setQuotaMb(e.target.value)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">MB</span>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const mb = Number(quotaMb)
              if (!Number.isFinite(mb) || mb < 10) return
              patch.mutate(
                { storage_quota_bytes: Math.round(mb) * 1024 * 1024 },
                { onSuccess: () => toast({ title: t('storage.quotaSaved'), variant: 'success' }) },
              )
            }}
            disabled={patch.isPending || Number(quotaMb) * 1024 * 1024 === storage.quota}
          >
            {t('actions.save')}
          </Button>
          <p className="w-full text-xs text-muted-foreground">{t('storage.quotaHint')}</p>
        </div>
      </section>

      {/* ---------- უფლებები ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tight">{t('admin.permissions')}</h2>

        <div className="flex flex-wrap items-end gap-6">
          {/* Tasks 1.6 — როლი სიიდან აირჩევა; უფლებები `/roles`-ზე იმართება */}
          <div className="min-w-52">
            <Label>{t('admin.colRole')}</Label>
            <Select
              value={user.role_id ? String(user.role_id) : ''}
              onValueChange={(v) => patch.mutate({ role_id: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {i18n.language === 'ka' ? r.name_ka : r.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={user.is_active}
              onCheckedChange={(v) => patch.mutate({ is_active: v })}
            />
            {t('admin.active')}
          </label>

          {/* Tasks 1.3 (🔗 16) — abuse-ის შემთხვევაში პროფილს ადმინი ხურავს.
              ⚠️ ორმხრივია: შემთხვევით დახურულის უკან დაბრუნებაც უნდა შეეძლოს. */}
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={user.profile_visibility === 'public'}
              onCheckedChange={(v) =>
                patch.mutate({ profile_visibility: v ? 'public' : 'private' })
              }
            />
            {t('publicProfile.title')}
          </label>

          {user.profile_visibility === 'public' && user.username && (
            <Link
              to={`/u/${user.username}`}
              className="inline-flex h-10 items-center gap-1.5 text-sm text-primary hover:text-primary/70"
            >
              <Globe className="size-4" />
              /u/{user.username}
            </Link>
          )}

          <Link
            to={user.role_id ? `/roles/${user.role_id}` : '/roles'}
            className="inline-flex h-10 items-center gap-1.5 text-sm text-primary hover:text-primary/70"
          >
            <ShieldCheck className="size-4" />
            {t('roles.openRole')}
          </Link>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t('admin.permissionsHint')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('publicProfile.forcePrivateHint')}
        </p>
      </section>

      {/* ---------- მოდულები ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
          {t('admin.modules')}
          <InfoHint info={t('admin.userModulesHint')} />
        </h2>

        <div className="space-y-2">
          {modules.map((m) => {
            const auto = user.is_super_admin
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

      {/* ---------- ატვირთული ფაილები (1.3) ---------- */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
          {t('admin.filesTitle')}
          <InfoHint info={t('admin.filesHint')} />
        </h2>

        {/* სია საერთო კომპონენტია `/settings`-თან (17.5) — ერთი ხედი, ერთი წყარო.
            ადმინის მხარეს წაშლა განზრახ არ არის: სხვისი ფაილი მას არ ეკუთვნის. */}
        <StorageLibrary files={files} total={storage.files} bytes={storage.bytes} />
      </section>

      {/* ---------- მოთხოვნები (Tasks 1.3 — აქვე დამტკიცება, არა მხოლოდ ისტორია) ---------- */}
      {requests.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
            {t('admin.requests')}
            <InfoHint info={t('admin.userRequestsHint')} />
          </h2>
          <ul className="space-y-2 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-b-0">
                <span>{requestLabel(r, i18n.language, t)}</span>
                {r.created_at && (
                  <span className="text-xs text-muted-foreground">
                    {fmt.date(r.created_at)}
                  </span>
                )}

                {r.status === 'pending' ? (
                  // ლიმიტის მოთხოვნა ზუსტად მოთხოვნილით მტკიცდება; სხვა
                  // რიცხვის მიცემა `/requests`-ზეა, სადაც ველიც არის
                  <span className="ml-auto flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => review.mutate({ id: r.id, ok: true })} disabled={review.isPending}>
                      <Check className="size-4" />
                      {t('admin.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => review.mutate({ id: r.id, ok: false })}
                      disabled={review.isPending}
                    >
                      <X className="size-4" />
                      {t('admin.reject')}
                    </Button>
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t(`requests.status.${r.status}`)}
                    {r.review_note && ` — ${r.review_note}`}
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
    </PageContainer>
  )
}
