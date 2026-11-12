import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, X } from 'lucide-react'
import { GOAL_PERIODS, createGoal, fetchGoalClassifiers, updateGoal, type Goal, type GoalInput, type GoalPeriod } from '@/api/goals'
import { todayLocal } from '@/lib/dates'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { DatePicker } from '@/components/ui/date-picker'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormGrid } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **მიზნის დამატება და რედაქტირება.**

   მოდული · პერიოდი (წელი / თვე / კვირა / საკუთარი თარიღები) · რიცხვი · სურვილისამებრ
   პირობა (მოდულის კლასიფიკატორის ერთი რიგი) · სახელი.

   ⚠️ **პერიოდის ზუსტ თარიღებს სერვერი ადგენს**: წელზე, თვესა და კვირაზე აქედან იმ
   პერიოდის ერთი დღე მიდის (კვირა ორშაბათით იწყება) — ორი ადგილის ორი კალენდარი
   ერთმანეთს ასცდებოდა.
   ⚠️ მოდულის შეცვლა პირობას ხსნის: კლასიფიკატორი მოდულისაა.
   ============================================================ */

const NONE = 'none'

const pad = (n: number) => String(n).padStart(2, '0')

export function GoalDialog({ goal, modules, onClose }: { goal: Goal | null; modules: string[]; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  const qc = useQueryClient()
  const { all } = useModules()
  const today = todayLocal()

  const [form, setForm] = useState(() => ({
    module: goal?.module ?? modules[0] ?? '',
    name: goal?.name ?? '',
    period: (goal?.period ?? 'year') as GoalPeriod,
    year: goal ? goal.starts_on.slice(0, 4) : today.slice(0, 4),
    month: goal ? String(Number(goal.starts_on.slice(5, 7))) : String(Number(today.slice(5, 7))),
    // კვირის ნებისმიერი დღე · საკუთარი პერიოდის ორი თარიღი
    day: goal?.starts_on ?? today,
    from: goal?.starts_on ?? today,
    to: goal?.ends_on ?? today,
    target: String(goal?.target ?? 12),
    classifier: goal?.classifier_id ? String(goal.classifier_id) : NONE,
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const classifiers = useQuery({
    queryKey: ['goal-classifiers', form.module],
    queryFn: () => fetchGoalClassifiers(form.module),
    enabled: form.module !== '',
  })

  const input = (): GoalInput => {
    const year = form.year.padStart(4, '0')
    const dates =
      form.period === 'year'
        ? { starts_on: `${year}-01-01` }
        : form.period === 'month'
          ? { starts_on: `${year}-${pad(Number(form.month))}-01` }
          : form.period === 'week'
            ? { starts_on: form.day }
            : { starts_on: form.from, ends_on: form.to }

    return {
      module: form.module,
      name: form.name.trim() || null,
      period: form.period,
      ...dates,
      target: Number(form.target),
      classifier_id: form.classifier === NONE ? null : Number(form.classifier),
    }
  }

  const save = useMutation({
    mutationFn: () => (goal ? updateGoal(goal.id, input()) : createGoal(input())),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['goals'] })
      toast({ title: t('goals.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2026, i, 1)),
  }))
  const yearField = (
    <FormField size="half" label={t('goals.year')} htmlFor="goal-year" error={errors.starts_on}>
      <Input id="goal-year" type="number" min={2000} max={2100} value={form.year} onChange={(e) => set({ year: e.target.value })} />
    </FormField>
  )

  return (
    <ModalShell title={t(goal ? 'goals.edit' : 'goals.add')} hint={t('goals.formHint')} onClose={onClose} wide>
      <form
        className="mt-4 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          setErrors({})
          save.mutate()
        }}
        data-testid="goal-form"
      >
        <FormGrid>
          <FormField size="half" label={t('goals.module')} htmlFor="goal-module" required error={errors.module}>
            <Select value={form.module} onValueChange={(module) => set({ module, classifier: NONE })}>
              <SelectTrigger id="goal-module">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modules.map((key) => {
                  const module = all.find((m) => m.key === key)
                  return (
                    <SelectItem key={key} value={key}>
                      <span className="inline-flex items-center gap-1.5">
                        <ModuleIcon name={module?.icon} className="size-3.5" style={{ color: module?.color ?? undefined }} />
                        {module ? moduleName(module, i18n.language) : key}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </FormField>

          <FormField size="half" label={t('goals.target')} htmlFor="goal-target" required hint={t('goals.targetHint')} error={errors.target}>
            <Input id="goal-target" type="number" min={1} max={100000} value={form.target} onChange={(e) => set({ target: e.target.value })} />
          </FormField>
        </FormGrid>

        <div data-testid="goal-periods">
          <CutTabs
            size="sm"
            layout="inline"
            label={t('goals.periodLabel')}
            options={GOAL_PERIODS.map((key) => ({ key, label: t(`goals.period.${key}`) }))}
            value={form.period}
            onChange={(key) => set({ period: key as GoalPeriod })}
          />
        </div>

        <FormGrid>
          {form.period === 'year' && yearField}
          {form.period === 'month' && (
            <>
              <FormField size="half" label={t('goals.month')} htmlFor="goal-month">
                <Select value={form.month} onValueChange={(month) => set({ month })}>
                  <SelectTrigger id="goal-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              {yearField}
            </>
          )}
          {form.period === 'week' && (
            <FormField size="half" label={t('goals.weekDay')} htmlFor="goal-day" hint={t('goals.weekHint')} error={errors.starts_on}>
              <DatePicker id="goal-day" value={form.day} onChange={(day) => set({ day: day ?? today })} />
            </FormField>
          )}
          {form.period === 'custom' && (
            <>
              <FormField size="half" label={t('goals.from')} htmlFor="goal-from" error={errors.starts_on}>
                <DatePicker id="goal-from" value={form.from} onChange={(from) => set({ from: from ?? today })} />
              </FormField>
              <FormField size="half" label={t('goals.to')} htmlFor="goal-to" error={errors.ends_on}>
                <DatePicker id="goal-to" value={form.to} onChange={(to) => set({ to: to ?? today })} />
              </FormField>
            </>
          )}
        </FormGrid>

        <FormGrid>
          {(classifiers.data?.length ?? 0) > 0 && (
            <FormField size="half" label={t('goals.condition')} htmlFor="goal-condition" hint={t('goals.conditionHint')}>
              <Select value={form.classifier} onValueChange={(classifier) => set({ classifier })}>
                <SelectTrigger id="goal-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('goals.conditionNone')}</SelectItem>
                  {classifiers.data?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {(lang === 'ka' ? c.name_ka : c.name_en) || c.name_en || c.name_ka || `#${c.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <FormField size="half" label={t('goals.name')} htmlFor="goal-name" hint={t('goals.nameHint')} error={errors.name}>
            <Input id="goal-name" maxLength={120} value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </FormField>
        </FormGrid>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="size-4" />
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || form.module === ''}>
            <Save className="size-4" />
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}
