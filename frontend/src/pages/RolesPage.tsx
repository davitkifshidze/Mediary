import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { createRole, deleteRole, fetchRoles, type Role } from '@/api/account'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { roleIcon, roleScope, roleTone } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   როლების სექცია (Tasks 1.6 → UI/UX 2026-09-15).

   უფლება = **მოდულის შიდა** CRUD (გადაწყდა 19.8) და იმართება როლის შიდა
   გვერდზე (`/roles/{id}`). აქ სია, დამატება და წაშლაა.
   მოდულზე **წვდომა** ცალკე მექანიზმია (`/modules`).

   **რა შეიცვალა და რატომ** (შენი მითითება: „სრულიად შემიცვალე და
   განმიახლე როლების UI/UX").

   ⚠️ **სია ბარათებად გადავიდა, რადგან მთავარი ინფორმაცია ტექსტში იყო
   ჩამარხული**: ერთი ნაცრისფერი სტრიქონი წერდა „`editor` · 3 მოდული ·
   2 მომხმარებელი", ე.ი. „რომელი როლი რამდენად ძლიერია" მხოლოდ კითხვით
   ირჩეოდა. ახლა ამას **ფერი და ხატულა** პასუხობს (`lib/roles.ts`) — იგივე
   ენა, რომლითაც აპი მოდულებზე ლაპარაკობს.

   ⚠️ **„ადმინის სექციები" ცალკე ფაქტად გამოვიდა.** სიაში ის საერთოდ არ
   ჩანდა: `admin:users` უბრალოდ ერთ გასაღებად ითვლებოდა `moduleCount`-ში,
   ე.ი. როლი, რომელსაც სხვისი ანგარიშები და აუდიტ-ლოგი უხსნია, გარეგნულად
   არაფრით განსხვავდებოდა იმისგან, ვისაც სამი ფილმის უფლება აქვს.

   ⚠️ **შეჯამება ცარიელ გასაღებებს აღარ ითვლის** (`roleScope()`): ძველი
   `Object.keys(r.permissions).length` ცარიელმასივიანსაც („მოდული, სადაც
   ყველა მონიშვნა მოხსნილია") მოდულად თვლიდა, ე.ი. სიაში „1 მოდული"
   ეწერა იქ, სადაც სინამდვილეში არცერთი უფლება არ იყო.

   ⚠️ **ბარათი მთლიანად ბმული არ არის.** წაშლის ღილაკი მის შიგნითაა,
   ღილაკი `<a>`-ში კი არასწორი HTML-ია — ამიტომ სახელი იჭიმება
   `after:inset-0`-ით და წაშლა `relative`-ით მის ზემოთ დგება.
   ============================================================ */

/** ბარათის შემოსვლის საფეხური და ჭერი (იხ. `index.css`-ის `fb-card`) */
const STAGGER_MS = 40
const STAGGER_MAX_MS = 240

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

  return (
    <PageContainer>
      <PageHeader
        tool="roles"
        title={t('roles.title')}
        hint={<InfoHint info={t('roles.subtitle')} />}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            {t('roles.add')}
          </Button>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {!isLoading && !roles.length && (
        <EmptyState
          icon={<ShieldCheck className="size-6" />}
          title={t('roles.emptyTitle')}
          hint={t('roles.emptyHint')}
          actions={
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              {t('roles.add')}
            </Button>
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((role, i) => {
          const scope = roleScope(role)
          const Icon = roleIcon(scope)
          // სისტემური როლი და გამოყენებული როლი არ იშლება (backend-ზეც 422)
          const deletable = !role.is_system && !role.users_count

          return (
            <div
              key={role.id}
              style={{
                ...(modAccent(roleTone(scope)) ?? MODULE_ACCENT_FALLBACK),
                animationDelay: `${Math.min(i * STAGGER_MS, STAGGER_MAX_MS)}ms`,
              }}
              className="fb-card relative flex flex-col rounded-2xl border border-border bg-card p-5 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[var(--mod)]"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
                  <Icon className="size-5 text-[var(--mod)]" />
                </span>

                <div className="min-w-0 flex-1">
                  {/* ⚠️ სახელი იჭიმება მთელ ბარათზე (`after:inset-0`) — მთელი
                      ბარათი `<a>`-დ ვერ გახდება, რადგან შიგნით ღილაკია */}
                  <Link
                    to={`/roles/${role.id}`}
                    className="block truncate font-medium after:absolute after:inset-0 hover:text-primary"
                  >
                    {name(role)}
                  </Link>
                  <code className="block truncate text-xs text-muted-foreground">{role.key}</code>
                </div>

                {role.is_system && (
                  <span className="relative inline-flex shrink-0 items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] leading-relaxed">
                    <Lock className="size-3" />
                    {t('roles.system')}
                  </span>
                )}
              </div>

              {/* ---------- რა შეუძლია ----------
                  ⚠️ მოდულები და ადმინის სექციები **ორი სხვადასხვა
                  ძალაუფლებაა** და ცალკე ითვლება — ერთ სტრიქონში შეკრული
                  ისინი აქამდე განურჩეველი იყო. */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
                {scope.full ? (
                  <Tag tone="mod">{t('roles.fullAccess')}</Tag>
                ) : (
                  <>
                    {scope.modules > 0 && <Tag>{t('roles.moduleCount', { count: scope.modules })}</Tag>}
                    {scope.admin > 0 && <Tag tone="mod">{t('roles.adminCount', { count: scope.admin })}</Tag>}
                    {!scope.modules && !scope.admin && <Tag tone="muted">{t('roles.noAccess')}</Tag>}
                  </>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                <span className="flex-1">{t('admin.usersCount', { count: role.users_count ?? 0 })}</span>

                {/* ⚠️ წაშლა **იმალება** და არა გამორთულად იხატება: სისტემურ
                    როლზე ის არასოდეს გააქტიურდება, ე.ი. მკრთალი ურნა
                    მხოლოდ ცრუ იმედს იძლეოდა (backend-ზეც 422-ია) */}
                {deletable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="relative -my-1 text-destructive"
                    disabled={remove.isPending}
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
                )}
              </div>
            </div>
          )
        })}
      </div>

      {adding && <AddRoleDialog onClose={() => setAdding(false)} />}
    </PageContainer>
  )
}

/** პატარა ნიშანი ბარათზე — ტონი როლის აქცენტიდან მოდის, ე.ი. მეორე პალიტრა არ იბადება */
function Tag({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'mod' | 'muted'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 leading-relaxed',
        tone === 'mod' && 'bg-[var(--mod-soft)] text-foreground',
        tone === 'plain' && 'bg-secondary',
        tone === 'muted' && 'border border-dashed border-border text-muted-foreground',
      )}
    >
      {children}
    </span>
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
