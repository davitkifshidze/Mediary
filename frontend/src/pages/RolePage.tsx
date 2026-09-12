import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Lock, Save, ShieldCheck, Undo2 } from 'lucide-react'
import { fetchRoles, updateRole } from '@/api/account'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   როლის შიდა გვერდი (Tasks 1.6) — სახელი + უფლებების მატრიცა.

   მატრიცა: რიგები = მოდულები (`GET /modules`-იდან, ე.ი. ახალი მოდული
   თვითონ ჩნდება), სვეტები = **ნახვა · დამატება · რედაქტირება · წაშლა**.
   „ყველა მოდული" (`*`) ცალკე რიგია: მისი მონიშვნა ხვალ დამატებულ მოდულზეც
   იმუშავებს, ე.ი. ახალი მოდული ავტომატურად აკრძალული არ აღმოჩნდება.
   ============================================================ */

/** ყველა მოდულის „ნიღაბი" — იგივე მუდმივი backend-ზე (`Role::ANY_MODULE`) */
const ANY = '*'

/**
 * ადმინის სექციები (Tasks 1.6) — სარკეა backend-ის
 * `Role::ADMIN_RESOURCES` / `Role::ADMIN_PREFIX`-ისა.
 * ⚠️ მოდულები არ არიან, ამიტომ `*` მათზე **არ** ვრცელდება.
 */
const ADMIN_RESOURCES = ['users', 'roles', 'requests', 'audit'] as const
const ADMIN_PREFIX = 'admin:'

type Matrix = Record<string, string[]>

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

  // სერვერიდან მოსული მდგომარეობა → სამუშაო ასლი
  useEffect(() => {
    if (!role) return
    setNames({ name_ka: role.name_ka, name_en: role.name_en })
    setMatrix(role.permissions ?? {})
  }, [role])

  const actions = role?.actions ?? ['view', 'create', 'update', 'delete']

  const save = useMutation({
    mutationFn: () =>
      updateRole(roleId, { ...names, permissions: matrix }),
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

  if (!isAdmin) return null
  if (isLoading) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </PageContainer>
    )
  }
  if (!role) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('roles.notFound')}</p>
      </PageContainer>
    )
  }

  const locked = role.is_super_admin
  const has = (module: string, action: string) => (matrix[module] ?? []).includes(action)

  const toggle = (module: string, action: string, on: boolean) =>
    setMatrix((m) => {
      const current = m[module] ?? []
      const next = on ? [...new Set([...current, action])] : current.filter((a) => a !== action)
      const out = { ...m }
      if (next.length) out[module] = next
      else delete out[module]
      return out
    })

  /** მთელი რიგი — მოდულზე ყველა უფლება ერთად */
  const toggleRow = (module: string, on: boolean) =>
    setMatrix((m) => {
      const out = { ...m }
      if (on) out[module] = [...actions]
      else delete out[module]
      return out
    })

  /** მთელი სვეტი — ერთი მოქმედება ყველა მოდულზე */
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

  const rowFull = (module: string) => actions.every((a) => has(module, a))
  const columnFull = (action: string) => modules.length > 0 && modules.every((m) => has(m.key, action))

  return (
    <PageContainer>
      <Link
        to="/roles"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('roles.title')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-muted">
          <Lock className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {i18n.language === 'ka' ? role.name_ka : role.name_en}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <code>{role.key}</code> · {t('admin.usersCount', { count: role.users_count ?? 0 })}
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

      {/* ---------- უფლებების მატრიცა ---------- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t('roles.permissions')}</h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">{t('roles.permissionsHint')}</p>

        {locked ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t('roles.superAdminHint')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2.5 text-left font-medium">{t('roles.module')}</th>
                  {actions.map((a) => (
                    <th key={a} className="px-2 py-2.5 text-center font-medium">
                      <button
                        onClick={() => toggleColumn(a, !columnFull(a))}
                        className="cursor-pointer transition-colors hover:text-foreground"
                        title={t('roles.toggleColumn')}
                      >
                        {t(`roles.action.${a}`)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* „ყველა მოდული" — ხვალ დამატებულზეც იმუშავებს */}
                <tr className="border-b border-border bg-muted/30">
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => toggleRow(ANY, !rowFull(ANY))}
                      className="cursor-pointer font-medium hover:text-primary"
                      title={t('roles.toggleRow')}
                    >
                      {t('roles.anyModule')}
                    </button>
                    <p className="text-[11px] text-muted-foreground">{t('roles.anyModuleHint')}</p>
                  </td>
                  {actions.map((a) => (
                    <td key={a} className="px-2 py-2.5 text-center">
                      <Checkbox
                        checked={has(ANY, a)}
                        onCheckedChange={(v) => toggle(ANY, a, v === true)}
                      />
                    </td>
                  ))}
                </tr>

                {modules.map((m) => (
                  <tr key={m.key} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-2.5">
                      <button
                        onClick={() => toggleRow(m.key, !rowFull(m.key))}
                        className="inline-flex cursor-pointer items-center gap-2 hover:text-primary"
                        title={t('roles.toggleRow')}
                      >
                        <ModuleIcon name={m.icon} className="size-4 text-muted-foreground" />
                        <span className={cn(!m.is_active && 'text-muted-foreground line-through')}>
                          {moduleName(m, i18n.language)}
                        </span>
                      </button>
                    </td>
                    {actions.map((a) => (
                      <td key={a} className="px-2 py-2.5 text-center">
                        <Checkbox
                          // `*`-ით ნაგულისხმევად მიცემული უფლება ჩართულად ჩანს
                          checked={has(m.key, a) || has(ANY, a)}
                          disabled={has(ANY, a)}
                          onCheckedChange={(v) => toggle(m.key, a, v === true)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* ---------- Tasks 1.6 — ადმინის სექციები ----------
                    ⚠️ ესენი მოდულები **არ არიან** და `*`-იც განზრახ არ ეხებათ:
                    „ყველა მოდული" ჩვეულებრივ როლს ადმინის პანელს ჩუმად
                    გაუხსნიდა. გასაღები `admin:<resource>`-ია (backend-ზეც). */}
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={actions.length + 1} className="px-2 pb-1 pt-3">
                    <p className="text-xs font-medium">{t('roles.adminSections')}</p>
                    <p className="text-[11px] text-muted-foreground">{t('roles.adminSectionsHint')}</p>
                  </td>
                </tr>
                {ADMIN_RESOURCES.map((resource) => {
                  const key = `${ADMIN_PREFIX}${resource}`
                  return (
                    <tr key={key} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => toggleRow(key, !rowFull(key))}
                          className="inline-flex cursor-pointer items-center gap-2 hover:text-primary"
                          title={t('roles.toggleRow')}
                        >
                          <ShieldCheck className="size-4 text-muted-foreground" />
                          {t(`roles.adminResource.${resource}`)}
                        </button>
                      </td>
                      {actions.map((a) => (
                        <td key={a} className="px-2 py-2.5 text-center">
                          <Checkbox
                            checked={has(key, a)}
                            onCheckedChange={(v) => toggle(key, a, v === true)}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
