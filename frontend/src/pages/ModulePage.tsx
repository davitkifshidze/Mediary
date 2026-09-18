import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Loader2, Lock, LockOpen, RotateCcw, SquarePen, Send, Users, X } from 'lucide-react'
import {
  cancelRequest,
  fetchAdminModules,
  fetchModuleFields,
  fetchMyRequests,
  fetchUsers,
  requestModule,
  resetModuleFields,
  saveModuleFields,
  setModuleEnabled,
  syncUserModules,
  updateModule,
  type ModuleField,
  type ModuleFieldPatch,
  type ModuleInfo,
  type User,
} from '@/api/account'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleDescription, moduleName, useModules } from '@/lib/modules'
import { roleName } from '@/lib/display'
import { CustomFieldsEditor } from '@/components/CustomFieldsEditor'
import { ModuleIcon } from '@/components/ModuleIcon'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/ui/modal-shell'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   მოდულის შიდა გვერდი (Tasks 1.4) — მოდალის ჩამნაცვლებელი.

   ერთი გვერდი ორივესთვის:
   · მომხმარებელი — ჩართვა/გამორთვა თავისთვის ან წვდომის მოთხოვნა
   · ადმინი — გლობალური სტატუსი, დეფაულტად ჩართვა და **ვის აქვს ჩართული**
   ============================================================ */

export function ModulePage() {
  const { key = '' } = useParams()
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { isAdmin } = useAuth()
  const { all } = useModules()

  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')
  // §6.4 — მფლობელების სია მოდალშია და აღარ ინლაინ
  const [holdersOpen, setHoldersOpen] = useState(false)

  const { data: adminModules } = useQuery({
    queryKey: ['admin-modules'],
    queryFn: fetchAdminModules,
    enabled: isAdmin,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
    enabled: isAdmin,
  })
  const { data: requests = [] } = useQuery({ queryKey: ['my-requests'], queryFn: fetchMyRequests })

  // ჩემი მდგომარეობა `GET /modules`-იდან, გლობალური — ადმინის სიიდან
  const mine = all.find((m) => m.key === key)
  const admin = adminModules?.find((m) => m.key === key)
  const module: ModuleInfo | undefined = admin ? { ...admin, ...(mine ?? {}) } : mine

  const done = () => {
    qc.invalidateQueries({ queryKey: ['modules'] })
    qc.invalidateQueries({ queryKey: ['admin-modules'] })
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    qc.invalidateQueries({ queryKey: ['my-requests'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const patch = useMutation({
    mutationFn: (input: Partial<ModuleInfo>) => updateModule(module!.id, input),
    onSuccess: done,
    onError: fail,
  })

  // K13 — თვითონ ჩართვა/გამორთვა (უფლება რჩება, ადმინს ხელახლა არ ეკითხები)
  const toggleMine = useMutation({
    mutationFn: (enabled: boolean) => setModuleEnabled(key, enabled),
    onSuccess: (_d, enabled) => {
      done()
      toast({ title: t(enabled ? 'modules.turnedOn' : 'modules.turnedOff'), variant: 'info' })
    },
    onError: fail,
  })

  const ask = useMutation({
    mutationFn: () => requestModule(key, message || undefined),
    onSuccess: () => {
      done()
      setAsking(false)
      setMessage('')
      toast({ title: t('modules.requestSent'), variant: 'success' })
    },
    onError: fail,
  })

  const cancel = useMutation({ mutationFn: cancelRequest, onSuccess: done, onError: fail })

  if (!module) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('modules.notFound')}</p>
      </PageContainer>
    )
  }

  const pending = requests.find(
    (r) => r.type === 'module_access' && r.module?.id === module.id && r.status === 'pending',
  )
  const holders = module.users ?? []
  const enabledCount = users.filter(
    (u) => u.is_super_admin || (u.modules ?? []).includes(key),
  ).length

  return (
    <PageContainer>
      <Link
        to="/modules"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('modules.title')}
      </Link>

      {/* ⚠️ ჰედერი მოდულის **საკუთარ** ფერს იღებს (2026-09-15): ჩამონათვალი
          ფერადი გახდა, შიდა გვერდი კი ნაცრისფერი დარჩებოდა — ე.ი. ერთი
          სექციის ორი სახე. ფერი იმავე `modules.color`-იდან მოდის. */}
      <div
        className="mb-6 flex flex-wrap items-center gap-4"
        style={modAccent(module.color) ?? MODULE_ACCENT_FALLBACK}
      >
        <span className="fb-header-icon grid size-14 shrink-0 place-items-center rounded-xl bg-[var(--mod-soft)]">
          <ModuleIcon name={module.icon} className="size-6 text-[var(--mod)]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {moduleName(module, i18n.language)}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {moduleDescription(module, i18n.language)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <code>{module.key}</code> · {module.route_base}
          </p>
        </div>
      </div>

      {/* ---------- ჩემი წვდომა ---------- */}
      <section className="mb-4 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">
          {t('modules.myAccess')}
        </h2>

        {module.granted ? (
          <label className="mt-3 flex cursor-pointer items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {t(module.enabled ? 'modules.enabled' : 'modules.disabledByMe')}
              </span>
              <span className="block text-xs text-muted-foreground">{t('modules.selfToggleHint')}</span>
            </span>
            <Switch
              checked={!!module.enabled}
              disabled={toggleMine.isPending || !module.is_active}
              onCheckedChange={(v) => toggleMine.mutate(v)}
            />
          </label>
        ) : pending ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              {t('modules.pending')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => cancel.mutate(pending.id)}>
              <X className="size-4" />
              {t('modules.cancelRequest')}
            </Button>
          </div>
        ) : asking ? (
          <div className="mt-3">
            <Textarea
              rows={2}
              autoFocus
              placeholder={t('modules.messagePlaceholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
                {t('actions.cancel')}
              </Button>
              <Button size="sm" disabled={ask.isPending} onClick={() => ask.mutate()}>
                <Send className="size-4" />
                {t('modules.send')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="mb-3 text-sm text-muted-foreground">{t('modules.noAccessHint')}</p>
            <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
              <Send className="size-4" />
              {t('modules.request')}
            </Button>
          </div>
        )}
      </section>

      {/* ---------- ველები (Tasks §6, ფაზა 1) ---------- */}
      <ModuleFields moduleKey={module.key} enabled={!!module.enabled} />
      {/* §6 ფაზა 3 — user-ის საკუთარი ველები */}
      <CustomFieldsEditor moduleKey={module.key} enabled={!!module.enabled} />

      {/* ---------- ადმინის ნაწილი ---------- */}
      {isAdmin && (
        <>
          <section className="mb-4 space-y-3 rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {t('modules.globalState')}
            </h2>

            <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-border pt-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t('admin.active')}</span>
                <span className="block text-xs text-muted-foreground">{t('admin.moduleActiveHint')}</span>
              </span>
              <Switch
                checked={module.is_active}
                onCheckedChange={(v) => patch.mutate({ is_active: v })}
              />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-border pt-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t('admin.byDefault')}</span>
                <span className="block text-xs text-muted-foreground">{t('admin.byDefaultHint')}</span>
              </span>
              <Switch
                checked={module.enabled_by_default}
                onCheckedChange={(v) => patch.mutate({ enabled_by_default: v })}
              />
            </label>

            {/* §2.1/§6.6 — მოდულის ფერი: გვერდის ჰედერის ფონი.
                ⚠️ **გლობალურია** (ყველა ანგარიშზე ერთი), ამიტომ ადმინის
                სექციაშია და არა „ჩემი პარამეტრების" გვერდით. */}
            <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t('admin.moduleColor')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('admin.moduleColorHint')}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <input
                  type="color"
                  aria-label={t('admin.moduleColor')}
                  value={module.color ?? '#6366f1'}
                  onChange={(e) => patch.mutate({ color: e.target.value })}
                  className="size-9 cursor-pointer rounded-md border border-border bg-card p-1"
                />
                {module.color && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => patch.mutate({ color: null })}
                    disabled={patch.isPending}
                  >
                    {t('admin.moduleColorClear')}
                  </Button>
                )}
              </span>
            </div>
          </section>

          {/* ---------- ვის აქვს ჩართული (§6.4) ----------
              ⚠️ სია ინლაინ **აღარაა**: ის მთელ გვერდს აგრძელებდა და ორმოც
              მომხმარებელზე ძებნის/დალაგების გარეშე უსარგებლო იყო. ახლა
              ღილაკი ხსნის მოდალს, შიგნით კი საერთო `DataTable` (ძებნა ·
              დალაგება · გვერდები) — იგივე, რაც `/users`-ს აქვს. */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
              {t('admin.moduleAssign')}
              <InfoHint info={t('admin.userModulesHint')} />
            </h2>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t('admin.moduleHoldersCount', { count: enabledCount, total: users.length })}
              </p>
              <Button variant="outline" size="sm" onClick={() => setHoldersOpen(true)}>
                <Users className="size-4" />
                {t('admin.moduleHoldersOpen')}
              </Button>
            </div>
          </section>

          {holdersOpen && (
            <ModuleHolders
              moduleKey={key}
              isActive={module.is_active}
              users={users}
              holders={holders}
              onClose={() => setHoldersOpen(false)}
              onDone={done}
              onError={fail}
            />
          )}
        </>
      )}
    </PageContainer>
  )
}

/**
 * **„ვის აქვს ჩართული" (§6.4) — ცალკე კომპონენტი (Tasks PERF-07).**
 *
 * ⚠️ `DataTable`-ის ფილტრი/დალაგება `[rows, q, sort, columns, searchOf]`-ზე
 * იმახსოვრებს, ე.ი. **ინლაინ** `columns={[…]}` და `searchOf={(u) => …}` მემოს
 * ყოველ რენდერზე აბათილებს: ძებნის თითო კლავიშზე მთელი სია თავიდან
 * იფილტრება და ისორტება. CLAUDE.md ამას სავალდებულოს უწოდებს.
 *
 * ⚠️ **ბლოკი ცალკე კომპონენტად გამოვიდა და არა `useMemo`-დ ადგილზე**:
 * გვერდს `if (!module) return` ადრეული გამოსვლა აქვს და მის შემდეგ hook-ის
 * დამატება React-ის წესს არღვევს. აქ hook-ები უპირობოა, ცხრილი კი მხოლოდ
 * მოდალის გახსნაზე იდგმება.
 *
 * ⚠️ **მუტაცია აქვეა** და არა მშობელში: `onToggle`-ს პროპად გადმოცემა ყოველ
 * რენდერზე ახალ ფუნქციას ნიშნავდა, ე.ი. `columns`-ის მემო ისევ იბათილებდა
 * თავს. `mutate` react-query-ში სტაბილურია, `onDone`/`onError` კი მუტაციის
 * ოფციებშია — ისინი ყოველ რენდერზე თავიდან იკითხება, ე.ი. მოძველებული
 * closure არ ჩნდება.
 */
function ModuleHolders({
  moduleKey,
  isActive,
  users,
  holders,
  onClose,
  onDone,
  onError,
}: {
  moduleKey: string
  isActive: boolean
  users: User[]
  holders: NonNullable<ModuleInfo['users']>
  onClose: () => void
  onDone: () => void
  onError: (e: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  // ⚠️ `fmt` ობიექტი ყოველ რენდერზე ახალია, `fmt.date` კი `useCallback`-ია —
  // ამიტომ დესტრუქტურიზაცია, თორემ deps ისევ ყოველ რენდერზე იცვლებოდა
  const { date: fmtDate } = useDateFormat()

  const setUserModules = useMutation({
    mutationFn: ({ id, keys }: { id: number; keys: string[] }) => syncUserModules(id, keys),
    onSuccess: onDone,
    onError,
  })
  const { mutate: syncModules, isPending } = setUserModules

  const holderOf = useCallback(
    (id: number) => holders.find((h) => h.id === id),
    [holders],
  )

  const toggleFor = useCallback(
    (u: User, on: boolean) => {
      const current = u.modules ?? []
      syncModules({
        id: u.id,
        keys: on ? [...new Set([...current, moduleKey])] : current.filter((k) => k !== moduleKey),
      })
    },
    [moduleKey, syncModules],
  )

  const searchOf = useCallback(
    (u: User) => [u.display_name, u.first_name, u.last_name, u.email, u.username],
    [],
  )

  const columns = useMemo<DataColumn<User>[]>(
    () => [
      {
        key: 'on',
        label: t('modules.enabled'),
        className: 'w-10',
        // super_admin-ს ყველა მოდული ავტომატურად აქვს
        render: (u) => (
          <Checkbox
            checked={u.is_super_admin || (u.modules ?? []).includes(moduleKey)}
            disabled={u.is_super_admin || !isActive || isPending}
            onCheckedChange={(v) => toggleFor(u, v === true)}
          />
        ),
      },
      {
        key: 'name',
        label: t('admin.colName'),
        value: (u) => (u.display_name ?? '').toLowerCase(),
        render: (u) => (
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar user={u} size="size-7" />
            <Link to={`/users/${u.id}`} className="min-w-0 truncate hover:text-primary">
              {u.display_name}
            </Link>
          </span>
        ),
      },
      {
        key: 'role',
        label: t('admin.colRole'),
        value: (u) => roleName(u, i18n.language).toLowerCase(),
        render: (u) => (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] leading-relaxed">
            {roleName(u, i18n.language)}
          </span>
        ),
      },
      {
        key: 'state',
        label: t('admin.moduleState'),
        value: (u) => holderOf(u.id)?.enabled_at ?? '',
        render: (u) => {
          const h = holderOf(u.id)
          return (
            <span
              className={cn(
                'text-[11px]',
                h?.hidden_by_user ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {h?.hidden_by_user
                ? t('admin.moduleHiddenByUser')
                : h?.implicit
                  ? t('admin.moduleAuto')
                  : h?.enabled_at
                    ? `${t('admin.enabledAt')}: ${fmtDate(h.enabled_at)}`
                    : '—'}
            </span>
          )
        },
      },
    ],
    [t, i18n.language, moduleKey, isActive, isPending, toggleFor, holderOf, fmtDate],
  )

  return (
    <ModalShell title={t('admin.moduleAssign')} onClose={onClose} wide>
      <p className="mt-2 text-xs text-muted-foreground">{t('admin.userModulesHint')}</p>

      <div className="mt-4">
        <DataTable
          rows={users}
          rowKey={(u) => u.id}
          defaultSort={{ key: 'name', dir: 'asc' }}
          searchPlaceholder={t('admin.searchUsers')}
          searchOf={searchOf}
          columns={columns}
        />
      </div>
    </ModalShell>
  )
}

/**
 * **ველების რედაქტორი (Tasks §6 → §6.5).**
 *
 * ⚠️ **სიაში მოდულის *ყველა* ველია და აღარ მხოლოდ „არჩევითები"** (§6.5).
 * ადრე სავალდებულო ველი (ვიდეოს ბმული, ჩანაწერის სახელი) კატალოგში
 * საერთოდ არ იწერებოდა, ე.ი. რედაქტორი „მოდულის ველებს" კი ეწერა, მაგრამ
 * ნაწილს აჩვენებდა. ახლა ისინი **`locked`** დროშით ჩანს: გადამრთველები
 * გამორთულია, ლეიბლი კი ისევ იმართება.
 *
 * ⚠️ **დალაგების ღილაკები მოხსნილია** (§6.5) — რიგი კატალოგისაა და
 * `PUT /modules/{key}/fields` `sort_order`-ს აღარ იღებს.
 *
 * ⚠️ **მორგებული ველები აქ არ ჩანს**: `PUT /modules/{key}/fields` მხოლოდ
 * ჩაშენებულებს იღებს (უცნობ key-ს ჩუმად აგდებს), ე.ი. აქ ნაჩვენები
 * გადამრთველი მორგებულ ველზე არაფერს გააკეთებდა. მათი რედაქტორი ქვემოთაა.
 */
function ModuleFields({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState<string | null>(null)

  const { data: all = [] } = useQuery({
    queryKey: ['module-fields', moduleKey],
    queryFn: () => fetchModuleFields(moduleKey),
    enabled,
  })

  const fields = useMemo(() => all.filter((f) => !f.custom), [all])

  const save = useMutation({
    mutationFn: (change: Record<string, ModuleFieldPatch>) => saveModuleFields(moduleKey, change),
    onSuccess: (next) => qc.setQueryData(['module-fields', moduleKey], next),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const reset = useMutation({
    mutationFn: () => resetModuleFields(moduleKey),
    onSuccess: (next) => {
      qc.setQueryData(['module-fields', moduleKey], next)
      toast({ title: t('fields.resetDone'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /* ⚠️ **ჩაკეტვის მოხსნა `super_admin`-ს რჩება** (შენი პასუხი, 2026-09-16):
     კონფიგი თავისია და ზიანიც თავისივე ფორმებია, მაგრამ ჩაკეტვის მთელი
     ღირებულება შემთხვევითი დაჭერის შეჩერებაა. backend იმავეს ამოწმებს —
     აქაური შემოწმება მხოლოდ ღილაკს მალავს. */
  const unlock = async (field: ModuleField, label: string) => {
    /* ⚠️ **ფილმზე/სერიალზე/ანიმეზე ტექსტი სხვაა**: discover → `from-tmdb`
       ბარე `Request`-ს იღებს და სტატუსს `HasStatus`-ის hook-ი ავსებს, ე.ი.
       დამატება მაინც მუშაობს. ერთი ტექსტი, რომელიც 11-დან 3 მოდულზე
       მცდარია, გაფრთხილებას სანდოობას დაუკარგავდა. */
    const tmdb = ['movie', 'series', 'anime'].includes(moduleKey)

    const ok = await confirm({
      title: t('fields.unlockTitle'),
      description: t(tmdb ? 'fields.unlockWarningTmdb' : 'fields.unlockWarning', { field: label }),
      confirmText: t('fields.unlock'),
      variant: 'destructive',
    })

    if (ok) save.mutate({ [field.key]: { unlocked: true } })
  }

  if (!enabled || !fields.length) return null

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
          {t('fields.title')}
          <InfoHint info={t('fields.hint')} />
        </h2>

        {/* ⚠️ საგარანტიო გასასვლელი (შენი პასუხი): ველის გამორთვა ფორმას
            გატეხილად ტოვებს, და თუმცა უკან ჩართვა იმავე გვერდზეა, ერთი
            ღილაკი, რომელიც ყველაფერს აბრუნებს, ბევრად ნაკლებ ძებნას ითხოვს. */}
        <Button
          variant="ghost"
          size="sm"
          disabled={reset.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: t('fields.resetTitle'),
              description: t('fields.resetHint'),
              confirmText: t('fields.reset'),
            })
            if (ok) reset.mutate()
          }}
        >
          <RotateCcw className="size-3.5" />
          {t('fields.reset')}
        </Button>
      </div>

      {fields.map((field) => {
        /* ⚠️ ნაგულისხმევი ლეიბლი ლოკალიზაციიდან მოდის (`fields.name.*`) — backend
           გადაწერილს `null`-ად აბრუნებს, სანამ user არ შეცვლის. */
        const fallback = t(`fields.name.${moduleKey}.${field.key}`, { defaultValue: field.key })
        const own = i18n.language === 'ka' ? field.label_ka : field.label_en
        const editing = open === field.key

        return (
          <div key={field.key} className="border-t border-border pt-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {own || fallback}
                  {field.required && <span className="text-destructive">*</span>}
                  {own && (
                    <span className="text-xs font-normal text-muted-foreground">({fallback})</span>
                  )}
                  {/* ⚠️ ჩაკეტილ ველზე მიზეზი **ცხადად** წერია, თორემ გამორთული
                      გადამრთველი „გატეხილად" იკითხება */}
                  {field.locked && !field.unlocked && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                      <Lock className="size-3" />
                      {t('fields.locked')}
                    </span>
                  )}
                  {/* ⚠️ `locked` მოხსნის შემდეგაც `true` რჩება — ნიშანი იცვლება
                      და არა ფაქტი, ე.ი. გაფრთხილება არ იკარგება */}
                  {field.unlocked && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-normal text-destructive">
                      <LockOpen className="size-3" />
                      {t('fields.unlocked')}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {field.unlocked
                    ? t('fields.unlockedHint')
                    : field.locked
                      ? t('fields.lockedHint')
                      : t(`fields.desc.${moduleKey}.${field.key}`, { defaultValue: '' })}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setOpen(editing ? null : field.key)}>
                  <SquarePen className="size-3.5" />
                  {t('fields.edit')}
                </Button>
                {field.locked && isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={save.isPending}
                    onClick={() =>
                      field.unlocked
                        ? save.mutate({ [field.key]: { unlocked: false } })
                        : unlock(field, own || fallback)
                    }
                  >
                    {field.unlocked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                    {t(field.unlocked ? 'fields.relock' : 'fields.unlock')}
                  </Button>
                )}
                <Switch
                  checked={field.enabled}
                  disabled={(field.locked && !field.unlocked) || save.isPending}
                  onCheckedChange={(v) => save.mutate({ [field.key]: { enabled: v } })}
                  aria-label={t('fields.enabled')}
                />
              </span>
            </div>

            {editing && (
              <FieldEditor
                field={field}
                fallback={fallback}
                saving={save.isPending}
                onSave={(patch) => save.mutate({ [field.key]: patch })}
              />
            )}
          </div>
        )
      })}
    </section>
  )
}

/**
 * ერთი ველის მორგება.
 *
 * ⚠️ **ცარიელი ველი ლეიბლს არ ცარიელდება — გადახრას შლის** და ნაგულისხმევს
 * აბრუნებს (backend-იც ასე იქცევა). ამიტომ placeholder-ში ნაგულისხმევი
 * ტექსტი წერია: user ხედავს, რას დაუბრუნდება.
 *
 * ⚠️ **„სავალდებულო ველი" გადაერქვა** (§6.5 — „სახელი გაუგებარია"): ახლა
 * ეწერა ის, რასაც ჩამრთველი მართლა აკეთებს — ფორმა ცარიელს არ შეინახავს.
 * ლოგიკა უცვლელია.
 */
function FieldEditor({
  field,
  fallback,
  saving,
  onSave,
}: {
  field: ModuleField
  fallback: string
  saving: boolean
  onSave: (patch: ModuleFieldPatch) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState({
    label_ka: field.label_ka ?? '',
    label_en: field.label_en ?? '',
    placeholder_ka: field.placeholder_ka ?? '',
    placeholder_en: field.placeholder_en ?? '',
  })

  const rows: [keyof typeof draft, string, string][] = [
    ['label_ka', t('fields.labelKa'), fallback],
    ['label_en', t('fields.labelEn'), fallback],
    ['placeholder_ka', t('fields.placeholderKa'), ''],
    ['placeholder_en', t('fields.placeholderEn'), ''],
  ]

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([key, label, hint]) => (
          <div key={key}>
            <Label htmlFor={`f-${field.key}-${key}`}>{label}</Label>
            <Input
              id={`f-${field.key}-${key}`}
              value={draft[key]}
              placeholder={hint}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {/* ⚠️ ჩაკეტილ ველზე ორივე ჩამრთველი გამორთულია: სახელის/ბმულის გარეშე
          ჩანაწერი არ ჩაიწერება და ბარათიც ვერ დაიხატება (§6.5). */}
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox
          checked={field.required}
          disabled={field.locked && !field.unlocked}
          onCheckedChange={(v) => onSave({ required: v === true })}
        />
        <span>
          {t('fields.required')}
          <InfoHint critical={t('fields.requiredWarn')} />
          <span className="block text-xs text-muted-foreground">{t('fields.requiredHint')}</span>
        </span>
      </label>

      {/* §16 — ჩანს თუ არა ველი საჯარო ბარათზე (მფლობელი წყვეტს) */}
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox
          checked={field.public}
          disabled={field.locked && !field.unlocked}
          onCheckedChange={(v) => onSave({ public: v === true })}
        />
        <span>
          {t('fields.public')}
          <InfoHint critical={t('fields.publicWarn')} />
          <span className="block text-xs text-muted-foreground">{t('fields.publicHint')}</span>
        </span>
      </label>

      <div className="flex justify-end">
        <Button size="sm" disabled={saving} onClick={() => onSave(draft)}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t('actions.save')}
        </Button>
      </div>
    </div>
  )
}
