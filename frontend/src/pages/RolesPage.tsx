import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { createRole, deleteRole, fetchRoles, type Role } from '@/api/account'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   როლების სექცია (Tasks 1.6).

   უფლება = **მოდულის შიდა** CRUD (გადაწყდა 19.8) და იმართება როლის შიდა
   გვერდზე (`/roles/{id}`). აქ მხოლოდ სია, დამატება და წაშლაა.
   მოდულზე **წვდომა** ცალკე მექანიზმია (`/modules`).
   ============================================================ */

export function RolesPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { canAdmin } = useAuth()

  const [adding, setAdding] = useState(false)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: fetchRoles,
    enabled: canAdmin('roles'),
  })

  const remove = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      toast({ title: t('roles.deleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  // Tasks 1.6 — წვდომა როლიდანაც შეიძლება მოვიდეს
  if (!canAdmin('roles')) return null

  const name = (r: Role) => (i18n.language === 'ka' ? r.name_ka : r.name_en)

  /** რამდენ მოდულზე აქვს რამე უფლება — სიაში მოკლე შეჯამება */
  const summary = (r: Role) => {
    if (r.permissions === null) return t('roles.fullAccess')
    const modules = Object.keys(r.permissions)
    if (!modules.length) return t('roles.noAccess')
    if (modules.includes('*')) return t('roles.allModules')
    return t('roles.moduleCount', { count: modules.length })
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        actions={
          <>
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              {t('roles.add')}
            </Button>
          </>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      <ul className="space-y-2">
        {roles.map((role) => (
          <li
            key={role.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
              {role.is_system ? <Lock className="size-4" /> : <ShieldCheck className="size-4" />}
            </span>

            <Link to={`/roles/${role.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-medium hover:text-primary hover:underline">
                {name(role)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                <code>{role.key}</code> · {summary(role)} ·{' '}
                {t('admin.usersCount', { count: role.users_count ?? 0 })}
              </span>
            </Link>

            {role.is_system && (
              <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[11px] leading-relaxed">
                {t('roles.system')}
              </span>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-destructive"
              // სისტემური როლი და გამოყენებული როლი არ იშლება (backend-ზეც 422)
              disabled={role.is_system || !!role.users_count || remove.isPending}
              title={role.is_system ? t('roles.system') : undefined}
              onClick={async () => {
                const ok = await confirm({
                  title: t('roles.deleteTitle'),
                  description: t('roles.deleteHint', { name: name(role) }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(role.id)
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>

      {adding && <AddRoleDialog onClose={() => setAdding(false)} />}
    </PageContainer>
  )
}

/** ახალი როლი — მხოლოდ სახელი; უფლებები შიდა გვერდზე ინიშნება */
function AddRoleDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({ name_ka: '', name_en: '' })

  const save = useMutation({
    mutationFn: () => createRole(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      toast({ title: t('roles.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('roles.add')} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        className="mt-4 space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="r-ka">{t('genres.name_ka')}</Label>
            <Input
              id="r-ka"
              autoFocus
              value={form.name_ka}
              onChange={(e) => setForm((f) => ({ ...f, name_ka: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="r-en">{t('genres.name_en')}</Label>
            <Input
              id="r-en"
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t('roles.addHint')}</p>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || !form.name_ka.trim() || !form.name_en.trim()}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
