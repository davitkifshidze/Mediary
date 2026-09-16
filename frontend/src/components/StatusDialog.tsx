import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createStatus,
  updateStatus,
  type StatusDomain,
  type StatusInput,
} from '@/api/statuses'
import { statusesQueryKey } from '@/lib/statuses'
import type { Status, StatusRole } from '@/api/types'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { ICON_NAMES } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   სტატუსის დამატება/რედაქტირება (Tasks §6.4).

   ⚠️ **`role` აქ ცალკე ველია და არა დეტალი.** სახელი ნებისმიერი შეიძლება
   იყოს („ვნახე", „ჩავაბარე"), მაგრამ სამ ადგილს *მნიშვნელობა* სჭირდება:
   „ორივემ ნანახი", მასობრივი წაშლა და ფრანჩაიზის ბეჯი. ამიტომ ველი
   სავალდებულოა და განმარტებაც აწერია.

   ⚠️ **`key` არ ჩანს და არ იცვლება** — გადარქმევა სახელს ეხება; გასაღები
   აკავშირებს ლექსიკონს ძველ ბმულებთან (`?view=watched`).
   ============================================================ */

const ROLES: StatusRole[] = ['todo', 'doing', 'done']

export function StatusDialog({
  domain,
  status,
  onClose,
  onSaved,
}: {
  domain: StatusDomain
  /** null = ახალი სტატუსი */
  status: Status | null
  onClose: () => void
  onSaved?: (saved: Status) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [form, setForm] = useState<StatusInput>({
    name_ka: status?.name_ka ?? '',
    name_en: status?.name_en ?? '',
    role: status?.role ?? 'todo',
    icon: status?.icon ?? ICON_NAMES[0],
    is_default: status?.is_default ?? false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: StatusInput) =>
      status ? updateStatus(domain, status.id, input) : createStatus(domain, input),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: statusesQueryKey(domain) })
      // ჩანაწერების სიაც — ბეჯი და სექციები იმავე სახელს ხატავს
      qc.invalidateQueries({ queryKey: [domain] })
      toast({ title: t('statuses.saved'), variant: 'success' })
      onSaved?.(saved)
      onClose()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    save.mutate(form)
  }

  return (
    <ModalShell title={t(status ? 'statuses.edit' : 'statuses.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="st-ka">{t('genres.name_ka')}</Label>
            <Input
              id="st-ka"
              autoFocus
              value={form.name_ka}
              onChange={(e) => setForm((f) => ({ ...f, name_ka: e.target.value }))}
            />
            {errors.name_ka && <p className="mt-1 text-xs text-destructive">{errors.name_ka}</p>}
          </div>
          <div>
            <Label htmlFor="st-en">{t('genres.name_en')}</Label>
            <Input
              id="st-en"
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
            />
            {errors.name_en && <p className="mt-1 text-xs text-destructive">{errors.name_en}</p>}
          </div>
        </div>

        {/* მნიშვნელობა — სამი შესაძლებლობა, განმარტებით */}
        <div>
          <Label>{t('statuses.role')}</Label>
          <p className="mb-2 text-xs text-muted-foreground">{t('statuses.roleHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setForm((f) => ({ ...f, role }))}
                aria-pressed={form.role === role}
                className={cn(
                  'cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  form.role === role
                    ? 'border-primary bg-secondary text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(`statuses.roles.${role}`)}
              </button>
            ))}
          </div>
          {errors.role && <p className="mt-1 text-xs text-destructive">{errors.role}</p>}
        </div>

        <div>
          <Label>{t('videoTypes.icon')}</Label>
          <IconPicker
            value={form.icon}
            onChange={(icon) => setForm((f) => ({ ...f, icon }))}
            className="mt-1"
          />
        </div>

        {/* ნაგულისხმევი — ახალი ჩანაწერი სწორედ მას იღებს */}
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <Switch
            id="st-default"
            checked={!!form.is_default}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))}
          />
          <div>
            <Label htmlFor="st-default" className="mb-0 cursor-pointer">
              {t('statuses.isDefault')}
            </Label>
            <p className="text-xs text-muted-foreground">{t('statuses.isDefaultHint')}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
