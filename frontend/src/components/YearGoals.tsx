import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Loader2, Minus, Plus, Target } from 'lucide-react'
import { fetchStatsSummary } from '@/api/stats'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { useSettings } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Switch } from '@/components/ui/switch'
import { ModuleIcon } from '@/components/ModuleIcon'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/**
 * **წლიური მიზნები (FEAT-21 → Tasks §27) — დეშბორდის ზოლი და მოდალი.**
 *
 * შენი სიტყვები: „მიზნის დაყენებაც ბარათების ზემოთ იყოს და დაჭერისას უფრო
 * კარგი UI/UX-ის მოდალი გამოვიდეს".
 *
 * ⚠️ **ზოლი ყოველთვის ჩანს** (Tasks §27.2) — „მიზანი ჯერ არ დაგისახავს"-იც
 * პასუხია. აქამდე ბლოკი მხოლოდ დაყენებული მიზნით ჩნდებოდა, ცარიელზე კი
 * მარჯვენა კუთხეში პატარა ღილაკი რჩებოდა, რომელსაც თვალი ვერ პოულობდა.
 *
 * ⚠️ **„გზაზეა" = ამ ტემპით წლის ბოლომდე მიზანს მიაღწევს**: `done` იყოფა
 * წლის განვლილ ნაწილზე (`paceOf`). ერთი ფორმულა ზოლსაც და მოდალსაც
 * ემსახურება — ორი სხვადასხვა „გზაზე" ერთ ეკრანზე ორ პასუხს მისცემდა.
 *
 * ⚠️ **მიზანი `users.settings.goals`-შია და არა ცალკე ცხრილში**: ის
 * წმინდა ინტერფეისის პარამეტრია, backend-ის არცერთი გადაწყვეტილება მას
 * არ ეყრდნობა — ცალკე მიგრაცია ერთი რიცხვისთვის მექანიზმის გამრავლება
 * იქნებოდა.
 *
 * ⚠️ **პროგრესს სერვერი ითვლის** (`/stats/summary`-ის `done_by_module`) —
 * იმავე აგრეგატიდან, რომელსაც სტატისტიკა კითხულობს; მეორე წყარო ორ
 * განსხვავებულ რიცხვს მოგვცემდა ერთსა და იმავე კითხვაზე.
 *
 * ⚠️ **მიზანი მხოლოდ იმ მოდულს შეიძლება ჰქონდეს, ვისაც „როდის დავასრულე"
 * თარიღი აქვს** (`goal_modules` სერვერიდან); რაც აკლია, მოდალის `i`
 * ასახელებს (`no_goal_modules`, Tasks §12.5).
 */

/** სწრაფი ვარიანტები (Tasks §27.3) — თვეში ერთი · ორი · კვირაში ერთი · ასი */
export const GOAL_PRESETS = [12, 24, 52, 100] as const

/** ახლად ჩართული მიზნის საწყისი მნიშვნელობა */
const GOAL_DEFAULT = 12

const GOAL_MAX = 9999

/**
 * წლის განვლილი ნაწილი (0..1). ⚠️ ქვედა ზღვარი ერთი დღეა — 1 იანვარს
 * ნულზე გაყოფა „უსასრულო ტემპს" მოგვცემდა.
 */
export function yearFraction(year: number, now = new Date()): number {
  const start = new Date(year, 0, 1).getTime()
  const end = new Date(year + 1, 0, 1).getTime()
  const day = 24 * 60 * 60 * 1000

  if (now.getTime() >= end) return 1

  return Math.min(1, Math.max(day / (end - start), (now.getTime() - start) / (end - start)))
}

/** ამ ტემპით წლის ბოლოს — რამდენი იქნება */
export function paceOf(done: number, year: number, now = new Date()): number {
  return Math.round(done / yearFraction(year, now))
}

export function YearGoals() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { settings, set, save } = useSettings()
  const snapshot = useRef(settings.goals)
  const { enabled: modules } = useModules()
  const { toast } = useToast()

  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: fetchStatsSummary,
    staleTime: 5 * 60_000,
  })

  if (!data || data.goal_modules.length === 0) return null

  const year = String(data.year)
  const goals = settings.goals ?? {}
  const missing = (data.no_goal_modules ?? [])
    .map((key) => {
      const mod = modules.find((m) => m.key === key)
      return mod ? moduleName(mod, lang) : key
    })
    .join(', ')

  const all = data.goal_modules.map((key) => ({
    key,
    target: Number(goals[key]?.[year] ?? 0),
    done: data.done_by_module[key] ?? 0,
    mod: modules.find((m) => m.key === key),
  }))
  const rows = all.filter((r) => r.target > 0)
  const onTrack = rows.filter((r) => r.done >= r.target || paceOf(r.done, data.year) >= r.target).length

  const setGoal = (key: string, n: number) => {
    const value = Math.max(0, Math.min(GOAL_MAX, Math.round(n) || 0))
    const next = { ...goals, [key]: { ...(goals[key] ?? {}), [year]: value } }

    // ⚠️ 0 = „მიზანი არ მაქვს": გასაღების დატოვება ზოლს ცარიელი ნიშნით ავსებდა
    if (value === 0) delete next[key][year]

    set('goals', next)
  }

  /* Tasks §4.5 — ⚠️ დიალოგი ცვლილებას საერთო სამუშაო ასლში წერს, ამიტომ
     შეუნახავად დახურვაზე **მხოლოდ მიზნები** უნდა დაბრუნდეს (მთლიანი
     `revert()` სხვა შეუნახავ პარამეტრსაც წაშლიდა). იგივე ობიექტის
     დაბრუნება `dirty`-ს თავისით აქრობს — ის მითითებით ადარებს. */
  const open = () => {
    snapshot.current = settings.goals
    setEditing(true)
  }
  const close = () => {
    set('goals', snapshot.current)
    setEditing(false)
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

  return (
    <>
      {/* ===== ზოლი — ბარათების ზემოთ, ყოველთვის (§27.2) ===== */}
      <button
        type="button"
        onClick={open}
        className="group mb-6 flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Target className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{t('goals.title', { year: data.year })}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {rows.length > 0 ? t('goals.barSummary', { onTrack, total: rows.length }) : t('goals.barEmpty')}
            </span>
          </span>
        </span>

        {rows.length > 0 && (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {rows.map((row) => (
              <span
                key={row.key}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--mod-soft)] px-2 py-1 text-xs tabular-nums"
                style={modAccent(row.mod?.color) ?? MODULE_ACCENT_FALLBACK}
              >
                <ModuleIcon name={row.mod?.icon ?? null} className="size-3.5 text-[var(--mod)]" />
                {row.done}/{row.target}
                {row.done >= row.target && <Check className="size-3.5 text-[var(--icon-ok)]" />}
              </span>
            ))}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          {rows.length > 0 ? t('goals.edit') : t('goals.set')}
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>

      {/* ===== მოდალი (§27.3) ===== */}
      {editing && (
        <ModalShell
          title={t('goals.title', { year: data.year })}
          onClose={close}
          wide
          hint={missing ? `${t('goals.editHint')} ${t('goals.missingHint', { modules: missing })}` : t('goals.editHint')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {all.map((row) => (
              <GoalCard
                key={row.key}
                name={row.mod ? moduleName(row.mod, lang) : row.key}
                icon={row.mod?.icon ?? null}
                color={row.mod?.color ?? null}
                done={row.done}
                target={row.target}
                pace={paceOf(row.done, data.year)}
                onChange={(n) => setGoal(row.key, n)}
              />
            ))}
          </div>

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t('actions.cancel')}
            </Button>
            <Button type="button" onClick={() => void commit()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {busy ? t('actions.saving') : t('actions.save')}
            </Button>
          </ModalFooter>
        </ModalShell>
      )}
    </>
  )
}

/**
 * ერთი მოდულის მიზანი — ხატულა და ფერი, ჩართვა, წლის პროგრესი, ტემპი და
 * სამიზნე (ციფრი + სწრაფი ვარიანტები).
 *
 * ⚠️ **გამორთვა = 0**, ე.ი. გასაღები იშლება (`setGoal`); ხელახლა ჩართვაზე
 * საწყისი მნიშვნელობა `GOAL_DEFAULT`-ია და არა ძველი — ძველი უკვე წაშლილია.
 */
function GoalCard({
  name,
  icon,
  color,
  done,
  target,
  pace,
  onChange,
}: {
  name: string
  icon: string | null
  color: string | null
  done: number
  target: number
  pace: number
  onChange: (target: number) => void
}) {
  const { t } = useTranslation()
  const on = target > 0
  const percent = on ? Math.min(100, Math.round((done / target) * 100)) : 0
  const reached = on && done >= target
  const track = on && (reached || pace >= target)

  return (
    <div
      className={cn('rounded-xl border p-4 transition-colors', on ? 'border-[var(--mod-fill)] bg-card' : 'border-border bg-muted/30')}
      style={modAccent(color) ?? MODULE_ACCENT_FALLBACK}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--mod-soft)]">
          <ModuleIcon name={icon} className="size-4 text-[var(--mod)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block text-xs text-muted-foreground">{t('goals.doneSoFar', { count: done })}</span>
        </span>
        <Switch
          checked={on}
          aria-label={t('goals.toggle', { module: name })}
          onCheckedChange={(checked) => onChange(checked ? GOAL_DEFAULT : 0)}
        />
      </div>

      {on && (
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs tabular-nums">
              <span className="text-muted-foreground">
                {done} / {target}
              </span>
              <span className={track ? 'text-[var(--icon-ok)]' : 'text-[var(--status-undecided)]'}>
                {reached ? t('goals.reached') : t('goals.pace', { count: pace })}
              </span>
            </div>
            {/* ⚠️ ფერი მოდულისაა (`modules.color`) — იგივე წყარო, რაც საიდბარსა
                და ჰედერს; მეორე პალიტრა ერთ მოდულს ორ ფერს მისცემდა */}
            <div className="h-2 overflow-hidden rounded-md bg-secondary">
              <div className="h-full rounded-md bg-[var(--mod)] transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-r-none"
                aria-label={t('goals.less')}
                disabled={target <= 1}
                onClick={() => onChange(target - 1)}
              >
                <Minus className="size-4" />
              </Button>
              <Input
                type="number"
                min={1}
                max={GOAL_MAX}
                aria-label={t('goals.target')}
                className="w-20 rounded-none border-x-0 text-center tabular-nums"
                value={target}
                onChange={(e) => onChange(Number(e.target.value) || 1)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-l-none"
                aria-label={t('goals.more')}
                disabled={target >= GOAL_MAX}
                onClick={() => onChange(target + 1)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-1">
              {GOAL_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(n)}
                  className={cn(
                    'h-8 cursor-pointer rounded-md border px-2.5 text-xs tabular-nums transition-colors',
                    target === n
                      ? 'border-[var(--mod)] bg-[var(--mod-soft)] font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
