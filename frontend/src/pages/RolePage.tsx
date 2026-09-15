import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, Save, Search, ShieldCheck, Undo2 } from 'lucide-react'
import { fetchRoles, updateRole, type Role } from '@/api/account'
import { actionStyle } from '@/lib/actionStyle'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { ADMIN_PREFIX, ADMIN_RESOURCES, roleIcon, roleScope, roleTone } from '@/lib/roles'
import { TOOL_SECTIONS, type ToolSectionKey } from '@/lib/toolSections'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   როლის შიდა გვერდი (Tasks 1.6 → UI/UX 2026-09-15).

   რას აკეთებს: სახელი + **უფლებების მატრიცა**. მოდულები `GET /modules`-იდან
   მოდის (ე.ი. ახალი მოდული თვითონ ჩნდება), მოქმედებები — backend-იდან.

   **რატომ აღარაა ცხრილი** (შენი მითითება: „სრულიად შემიცვალე და განმიახლე").

   ⚠️ **ცხრილი ოთხივე სვეტს უსახელოდ ტოვებდა**: `min-w-[520px]`-ის გამო
   ტელეფონზე ჰორიზონტალურად ისრიალებდა, ე.ი. მონიშვნისას ხშირად ვერ
   ხედავდი, „წაშლის" სვეტში იდექი თუ „რედაქტირების". ახლა თითო მოდული
   **ბარათია** და თითო უფლება — **დასახელებული და ფერადი ღილაკი**
   (`lib/actionStyle.ts`: წაშლა წითელი ურნით, დამატება მწვანე „+"-ით).

   ⚠️ **სვეტის გადამრთველი დამალული იყო ცხრილის თავში** — `<th>`-ზე დაჭერა
   მთელ სვეტს რთავდა და ამას მხოლოდ `title` ამბობდა. ახლა ის ცალკე,
   **შეკეცილი ზოლია** მოდულების სიის თავზე („ყველა მოდულზე").

   ⚠️ **მასობრივი ბარათი შეკეცილში გადავიდა** (შენი მითითება): ის ეკრანის
   თავში იდგა და ყოველდღიური საქმე — მოდულების სია — მეორე ეკრანზე
   იწყებოდა, თუმცა მასობრივი გადამრთველი იშვიათად სჭირდება.

   ⚠️ **„ყველა მოდულის" ნიღაბი (`"*"`) სულ მოიხსნა** (შენი მითითება:
   „ჩახსნიე ეს ფუნქციონალი"). ის ერთადერთი მექანიზმი იყო, რომლითაც ხვალ
   დამატებული მოდული ავტომატურად იხსნებოდა — ე.ი. ფასი ცნობილია და
   მიღებული: **ახალი მოდული ყველა როლზე ცხადად უნდა მოინიშნოს**. ძველი
   ჩანაწერები მიგრაციამ თითოეულ მოდულად გაშალა (`expand_wildcard_role_permissions`),
   ე.ი. არსებულ როლს უფლება არ დაუკარგავს. „ყველა მოდულზე" **ნიღაბი არაა**:
   ის მხოლოდ დღევანდელ სიას ნიშნავს თითოეულად.

   ⚠️ **ადმინის სექციები ცალკე ჯგუფია და საკუთარ ფერებს იღებს**
   (`lib/toolSections.ts` — იგივე ტონები, რითიც საიდბარი და გვერდის ჰედერი
   ხატავს მათ). ⚠️ ისინი მოდულები **არ** არიან: არც ერთი მოდულის უფლება
   — რამდენიც უნდა იყოს — მათ არ ხსნის.

   ⚠️ **შეჯამება ცოცხალია** — `roleScope()` **სამუშაო ასლს** კითხულობს და
   არა შენახულს, ე.ი. „რამდენ მოდულს ვაძლევ" შენახვამდე ჩანს. იგივე
   ფუნქციას სია კითხულობს, ე.ი. ორი რიცხვი ვერ დაშორდება.
   ============================================================ */

type Matrix = Record<string, string[]>

/** ძებნის ველი მაშინ ჩნდება, როცა სია თვალით აღარ ისკანირება */
const SEARCH_FROM = 8

export function RolePage() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { isAdmin } = useAuth()
  const { all: modules } = useModules()

  const roleId = Number(id)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: fetchRoles,
    enabled: isAdmin,
  })
  const role = roles.find((r) => r.id === roleId)

  const [names, setNames] = useState({ name_ka: '', name_en: '' })
  const [matrix, setMatrix] = useState<Matrix>({})
  const [query, setQuery] = useState('')
  /** მასობრივი გადამრთველები შეკეცილია — ყოველდღიური საქმე მოდულების სიაა */
  const [bulkOpen, setBulkOpen] = useState(false)

  // სერვერიდან მოსული მდგომარეობა → სამუშაო ასლი
  useEffect(() => {
    if (!role) return
    setNames({ name_ka: role.name_ka, name_en: role.name_en })
    setMatrix(role.permissions ?? {})
  }, [role])

  const actions = role?.actions ?? ['view', 'create', 'update', 'delete']

  const save = useMutation({
    mutationFn: () => updateRole(roleId, { ...names, permissions: matrix }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: ['me'] })
      toast({ title: t('roles.saved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const dirty = useMemo(() => {
    if (!role) return false
    return (
      names.name_ka !== role.name_ka ||
      names.name_en !== role.name_en ||
      JSON.stringify(matrix) !== JSON.stringify(role.permissions ?? {})
    )
  }, [role, names, matrix])

  /**
   * ცოცხალი შეჯამება — **სამუშაო ასლზე**, და არა შენახულზე.
   * ⚠️ სუპერ-ადმინზე `permissions` `null`-ია, ე.ი. მატრიცა არ იკითხება.
   */
  const scope = useMemo(
    () =>
      role
        ? roleScope({ ...role, permissions: role.permissions === null ? null : matrix } as Role)
        : null,
    [role, matrix],
  )

  if (!isAdmin) return null
  if (isLoading) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </PageContainer>
    )
  }
  if (!role || !scope) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('roles.notFound')}</p>
      </PageContainer>
    )
  }

  const locked = role.is_super_admin
  const Icon = roleIcon(scope)
  const has = (key: string, action: string) => (matrix[key] ?? []).includes(action)

  const toggle = (key: string, action: string, on: boolean) =>
    setMatrix((m) => {
      const current = m[key] ?? []
      const next = on ? [...new Set([...current, action])] : current.filter((a) => a !== action)
      const out = { ...m }
      if (next.length) out[key] = next
      else delete out[key]
      return out
    })

  /** მთელი რიგი — ერთ გასაღებზე ყველა უფლება ერთად */
  const toggleRow = (key: string, on: boolean) =>
    setMatrix((m) => {
      const out = { ...m }
      if (on) out[key] = [...actions]
      else delete out[key]
      return out
    })

  /** მთელი სვეტი — ერთი მოქმედება **დღეს არსებულ** ყველა მოდულზე */
  const toggleColumn = (action: string, on: boolean) =>
    setMatrix((m) => {
      const out: Matrix = { ...m }
      for (const mod of modules) {
        const current = out[mod.key] ?? []
        const next = on ? [...new Set([...current, action])] : current.filter((a) => a !== action)
        if (next.length) out[mod.key] = next
        else delete out[mod.key]
      }
      return out
    })

  const rowFull = (key: string) => actions.every((a) => has(key, a))
  const columnFull = (action: string) => modules.length > 0 && modules.every((m) => has(m.key, action))

  const term = query.trim().toLowerCase()
  const shown = term
    ? modules.filter(
        (m) =>
          moduleName(m, i18n.language).toLowerCase().includes(term) ||
          m.key.toLowerCase().includes(term),
      )
    : modules

  return (
    <PageContainer>
      <Link
        to="/roles"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('roles.title')}
      </Link>

      {/* ---------- ვინ არის ეს როლი ----------
          ⚠️ ფილა და ტონი `lib/roles.ts`-იდან — იგივე, რაც სიაში; ე.ი.
          ბარათიდან შემოსული იმავე ფერს ხედავს და არ ეკარგება კონტექსტი. */}
      <div
        className="mb-6 flex flex-wrap items-center gap-3"
        style={modAccent(roleTone(scope)) ?? MODULE_ACCENT_FALLBACK}
      >
        <span className="fb-header-icon grid size-11 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
          <Icon className="size-5 text-[var(--mod)]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {i18n.language === 'ka' ? role.name_ka : role.name_en}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <code>{role.key}</code> · {t('admin.usersCount', { count: role.users_count ?? 0 })}
            {role.is_system && ` · ${t('roles.system')}`}
          </p>
        </div>
      </div>

      {/* ---------- სახელი ---------- */}
      <section className="mb-4 rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rn-ka">{t('genres.name_ka')}</Label>
            <Input
              id="rn-ka"
              value={names.name_ka}
              onChange={(e) => setNames((n) => ({ ...n, name_ka: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="rn-en">{t('genres.name_en')}</Label>
            <Input
              id="rn-en"
              value={names.name_en}
              onChange={(e) => setNames((n) => ({ ...n, name_en: e.target.value }))}
            />
          </div>
        </div>
      </section>

      {/* ---------- უფლებები ---------- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {t('roles.permissions')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('roles.permissionsHint')}</p>
          </div>

          {/* ცოცხალი შეჯამება — რა ეწერება სიაში, თუ ახლა შევინახავთ */}
          {!locked && (
            <p className="shrink-0 text-xs text-muted-foreground">
              {t('roles.moduleCount', { count: scope.modules })}
              {scope.admin > 0 && ` · ${t('roles.adminCount', { count: scope.admin })}`}
            </p>
          )}
        </div>

        {locked ? (
          <p className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t('roles.superAdminHint')}
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {/* ---------- მოდულები ---------- */}
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t('roles.modulesTitle')}</p>
                {modules.length >= SEARCH_FROM && (
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('roles.searchModules')}
                      className="h-8 w-48 pl-7 text-xs"
                    />
                  </label>
                )}
              </div>

              {/* ---------- მასობრივი გადამრთველი — ერთი შეკეცილი ზოლი ----------
                  ⚠️ **დიდი ბარათი აქედან მოიხსნა** (შენი მითითება,
                  2026-09-15): ის ეკრანის თავში იდგა და მოდულების სია მეორე
                  ეკრანზე იწყებოდა, თუმცა ყოველდღიური საქმე სწორედ სიაა —
                  მასობრივი გადამრთველი კი იშვიათი.

                  ⚠️ **„ყველა მოდულზე" ნიღაბი არაა**: ის **დღევანდელ** სიას
                  ნიშნავს თითოეულად და არაფერს იმახსოვრებს — ე.ი. ხვალ
                  დამატებულ მოდულს ცხადად მონიშვნა დასჭირდება. სწორედ ეს
                  დარჩა „ყველა მოდულის" (`*`) მოხსნის შემდეგ. */}
              <div className="rounded-md border border-dashed border-border">
                <button
                  type="button"
                  aria-expanded={bulkOpen}
                  onClick={() => setBulkOpen((v) => !v)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{t('roles.everyModule')}</span>
                  <ChevronDown
                    className={cn('size-4 shrink-0 transition-transform', bulkOpen ? '' : '-rotate-90')}
                  />
                </button>

                {bulkOpen && (
                  <div className="border-t border-border p-3">
                    <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                      {t('roles.everyModuleHint')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {actions.map((a) => (
                        <PermToggle
                          key={a}
                          action={a}
                          on={columnFull(a)}
                          onChange={(on) => toggleColumn(a, on)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {shown.map((m) => (
                  <PermCard
                    key={m.key}
                    accent={m.color}
                    icon={<ModuleIcon name={m.icon} className="size-5 text-[var(--mod)]" />}
                    title={moduleName(m, i18n.language)}
                    strike={!m.is_active}
                    actions={actions}
                    isOn={(a) => has(m.key, a)}
                    onToggle={(a, on) => toggle(m.key, a, on)}
                    rowOn={rowFull(m.key)}
                    onRow={(on) => toggleRow(m.key, on)}
                  />
                ))}
              </div>

              {!shown.length && (
                <p className="mt-2 text-sm text-muted-foreground">{t('roles.noModulesFound')}</p>
              )}
            </div>

            {/* ---------- ადმინის სექციები ----------
                ⚠️ მოდულები **არ** არიან და `*`-იც განზრახ არ ეხებათ:
                „ყველა მოდული" ჩვეულებრივ როლს ადმინის პანელს ჩუმად
                გაუხსნიდა. გასაღები `admin:<resource>`-ია (backend-ზეც). */}
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('roles.adminSections')}</p>
              <p className="mb-2 text-[11px] text-muted-foreground">{t('roles.adminSectionsHint')}</p>

              <div className="grid gap-2 lg:grid-cols-2">
                {ADMIN_RESOURCES.map((resource) => {
                  const key = `${ADMIN_PREFIX}${resource}`
                  const section = TOOL_SECTIONS[resource as ToolSectionKey]
                  return (
                    <PermCard
                      key={key}
                      accent={section.color}
                      icon={<section.icon className="size-5 text-[var(--mod)]" />}
                      title={t(`roles.adminResource.${resource}`)}
                      actions={actions}
                      isOn={(a) => has(key, a)}
                      onToggle={(a, on) => toggle(key, a, on)}
                      rowOn={rowFull(key)}
                      onRow={(on) => toggleRow(key, on)}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ---------- შენახვა ---------- */}
      <div className="sticky bottom-4 z-30 mt-6">
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur',
            dirty ? 'border-primary' : 'border-border',
          )}
        >
          <span className="min-w-0 flex-1 text-sm text-muted-foreground">
            {dirty ? t('settings.unsaved') : t('settings.noChanges')}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setNames({ name_ka: role.name_ka, name_en: role.name_en })
              setMatrix(role.permissions ?? {})
            }}
          >
            <Undo2 className="size-4" />
            {t('settings.revert')}
          </Button>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            <Save className="size-4" />
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </div>
    </PageContainer>
  )
}

/**
 * ერთი რიგი მატრიცაში — მოდული, `*` ან ადმინის სექცია.
 *
 * ⚠️ **ერთი კომპონენტი სამივესთვის**: სამი ასლი იმავე კვირაში დაშორდებოდა
 * (ერთგან „მთელი რიგი" იქნებოდა, მეორეგან — არა), ხოლო განსხვავება
 * მხოლოდ ფერსა და მინიშნებაშია.
 */
function PermCard({
  accent,
  icon,
  title,
  hint,
  strike,
  actions,
  isOn,
  onToggle,
  rowOn,
  onRow,
  highlight,
}: {
  accent?: string | null
  icon: ReactNode
  title: string
  hint?: string
  /** გამორთული მოდული — სახელი გადახაზულია, უფლება კი მაინც ინიშნება */
  strike?: boolean
  actions: string[]
  isOn: (action: string) => boolean
  onToggle: (action: string, on: boolean) => void
  rowOn?: boolean
  onRow?: (on: boolean) => void
  /** `*` — ხაზგასმული ჩარჩო */
  highlight?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      style={modAccent(accent) ?? MODULE_ACCENT_FALLBACK}
      className={cn(
        'rounded-md border p-3',
        highlight ? 'border-[var(--mod)] bg-[var(--mod-soft)]' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-medium',
              strike && 'text-muted-foreground line-through',
            )}
          >
            {title}
          </span>
          {hint && <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>}
        </div>

        {/* მთელი რიგი — ღილაკს სახელი აქვს, ე.ი. `title`-ის მიღმა აღარ იმალება */}
        {onRow && (
          <button
            type="button"
            aria-pressed={!!rowOn}
            onClick={() => onRow(!rowOn)}
            className={cn(
              'shrink-0 cursor-pointer rounded-md border px-2 py-1 text-[11px] transition-colors',
              rowOn
                ? 'border-[var(--mod)] bg-[var(--mod-soft)] font-medium text-foreground'
                : 'border-border text-muted-foreground hover:border-[var(--mod)] hover:text-foreground',
            )}
          >
            {t('roles.grantAll')}
          </button>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <PermToggle key={a} action={a} on={isOn(a)} onChange={(on) => onToggle(a, on)} />
        ))}
      </div>
    </div>
  )
}

/**
 * ერთი უფლება — **დასახელებული და ფერადი**, checkbox-ის ნაცვლად.
 *
 * ⚠️ ფერი და ხატულა `lib/actionStyle.ts`-იდან მოდის, ე.ი. „წაშლა" აქაც
 * წითელი ურნაა და აუდიტ-ლოგშიც. ⚠️ ანიმაცია არ იწერება: ღილაკია, ე.ი.
 * `index.css`-ის გლობალური წესი ურნას ისედაც არხევს.
 */
function PermToggle({
  action,
  on,
  onChange,
}: {
  action: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  const { t } = useTranslation()
  const tone = actionStyle(action)

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      style={modAccent(tone.color)}
      className={cn(
        'inline-flex min-w-24 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
        on
          ? 'border-[var(--mod)] bg-[var(--mod-soft)] font-medium text-foreground'
          : 'border-border text-muted-foreground hover:border-[var(--mod)] hover:text-foreground',
      )}
    >
      <tone.icon className="size-3.5 text-[var(--mod)]" />
      {t(`roles.action.${action}`)}
    </button>
  )
}
