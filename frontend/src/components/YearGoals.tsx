import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2, SquarePen, Target } from 'lucide-react'
import { fetchStatsSummary } from '@/api/stats'
import { moduleName, useModules } from '@/lib/modules'
import { useSettings } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InfoHint } from '@/components/ui/info-hint'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { ModuleIcon } from '@/components/ModuleIcon'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/**
 * **წლიური მიზნები (FEAT-21) — დეშბორდის ბლოკი.**
 *
 * ⚠️ **მიზანი `users.settings.goals`-შია და არა ცალკე ცხრილში**: ის
 * წმინდა ინტერფეისის პარამეტრია, backend-ის არცერთი გადაწყვეტილება მას
 * არ ეყრდნობა — ცალკე მიგრაცია ერთი რიცხვისთვის მექანიზმის გამრავლება
 * იქნებოდა.
 *
 * ⚠️ **პროგრესს სერვერი ითვლის** (`/stats/summary`-ის `done_by_module`) —
 * იმავე აგრეგატიდან, რომელსაც დეშბორდის რიცხვები კითხულობენ; მეორე
 * წყარო ორ განსხვავებულ რიცხვს მოგვცემდა ერთსა და იმავე კითხვაზე.
 *
 * ⚠️ **მიზანი მხოლოდ იმ მოდულს შეიძლება ჰქონდეს, ვისაც „როდის
 * დავასრულე" თარიღი აქვს** (`goal_modules` სერვერიდან). 2026-09-20-მდე
 * ეს წიგნს, თამაშს, სამაგიდოსა და ჩანაწერს გამორიცხავდა — ე.ი. ტასქის
 * საკუთარი მაგალითი („წელს 24 წიგნი") არ მუშაობდა; ახლა ოთხივეს თავისი
 * სვეტი აქვს და სიაში ყველა ჩანს.
 *
 * ⚠️ **ამიტომ „რატომ აკლია მოდულები" განმარტება წაშლილია** — ის ცარიელ
 * კითხვას პასუხობდა. თუ ოდესმე მოდული დასრულების თარიღის გარეშე გაჩნდა,
 * ის აქ **უხმოდ** ამოვარდება: ახსნა მაშინ უნდა დაბრუნდეს (და სია
 * სერვერიდან მოვიდეს, თორემ „გალერეა" ყოველთვის აკლიად ჩაითვლება).
 *
 * ⚠️ **ბლოკი მხოლოდ მაშინ ჩანს, როცა მიზანი მართლა დგას** — ცარიელი
 * „მიზნები" დეშბორდზე ყოველდღიური ხმაურია (იგივე წესი, რაც „მალე"-ს
 * და სტატისტიკის ბლოკს აქვს). დაყენება რედაქტორის ღილაკიდან ხდება.
 */
export function YearGoals() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { settings, set, save } = useSettings()
  const { enabled: modules } = useModules()
  const { toast } = useToast()

  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: fetchStatsSummary,
    staleTime: 5 * 60_000,
  })

  if (!data) return null

  const year = String(data.year)
  const goals = settings.goals ?? {}
  const available = data.goal_modules

  const rows = available
    .map((key) => ({
      key,
      target: Number(goals[key]?.[year] ?? 0),
      done: data.done_by_module[key] ?? 0,
      mod: modules.find((m) => m.key === key),
    }))
    .filter((r) => r.target > 0)

  const setGoal = (key: string, value: string) => {
    const n = Math.max(0, Math.min(9999, Number(value) || 0))
    const next = { ...goals, [key]: { ...(goals[key] ?? {}), [year]: n } }

    // ⚠️ 0 = „მიზანი არ მაქვს": გასაღების დატოვება ბლოკს ცარიელი ზოლით ავსებდა
    if (n === 0) delete next[key][year]

    set('goals', next)
  }

  const commit = async () => {
    setBusy(true)
    try {
      await save()
      setEditing(false)
      toast({ title: t('goals.saved'), variant: 'success' })
    } finally {
      setBusy(false)
    }
  }

  const editor = editing && (
    <ModalShell title={t('goals.title', { year: data.year })} onClose={() => setEditing(false)}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('goals.editHint')}</p>

        <div className="space-y-3">
          {available.map((key) => {
            const mod = modules.find((m) => m.key === key)

            return (
              <div key={key} className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary">
                  <ModuleIcon name={mod?.icon ?? null} className="size-4" />
                </span>
                <Label htmlFor={`goal-${key}`} className="mb-0 min-w-0 flex-1 truncate">
                  {mod ? moduleName(mod, lang) : key}
                </Label>
                <Input
                  id={`goal-${key}`}
                  type="number"
                  min={0}
                  max={9999}
                  className="w-24"
                  value={goals[key]?.[year] ?? ''}
                  placeholder="0"
                  onChange={(e) => setGoal(key, e.target.value)}
                />
              </div>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={() => void commit()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t('actions.save')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )

  return (
    <>
      {rows.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Target className="size-5 text-muted-foreground" />
              {t('goals.title', { year: data.year })}
              <InfoHint info={t('goals.hint')} />
            </h2>

            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <SquarePen className="size-4" />
              {t('goals.edit')}
            </Button>
          </div>

          <div className="space-y-3">
            {rows.map((row) => {
              const percent = Math.min(100, Math.round((row.done / row.target) * 100))
              const done = row.done >= row.target

              return (
                <div key={row.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <ModuleIcon name={row.mod?.icon ?? null} className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{row.mod ? moduleName(row.mod, lang) : row.key}</span>
                    </span>
                    <span className={cn('shrink-0 tabular-nums', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                      {row.done} / {row.target}
                      {done && <Check className="ml-1 inline size-4" />}
                    </span>
                  </div>
                  {/* ⚠️ ფერი მოდულისაა (`modules.color`) — იგივე წყარო, რაც საიდბარსა
                      და ჰედერს; მეორე პალიტრა ერთ მოდულს ორ ფერს მისცემდა */}
                  <div className="h-2 overflow-hidden rounded-md bg-secondary">
                    <div
                      className="h-full rounded-md transition-[width]"
                      style={{
                        width: `${percent}%`,
                        background: row.mod?.color ?? 'var(--primary)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* მიზნის დაყენება მაშინაც შესაძლებელია, როცა ჯერ არცერთი არ დგას */}
      {rows.length === 0 && available.length > 0 && (
        <div className="mb-6 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Target className="size-4" />
            {t('goals.set')}
          </Button>
        </div>
      )}

      {editor}
    </>
  )
}
