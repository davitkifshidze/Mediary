import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clock, CornerLeftUp, Lock, X } from 'lucide-react'
import type { AuditRuleModule, AuditRulesData, AuditRuleUntil } from '@/api/audit'
import {
  cellKey,
  inherited,
  isChanged,
  type RuleCell as Cell,
  type RuleChoice,
  type RuleDraft,
} from '@/lib/auditRules'
import { useDateFormat } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'

/* ============================================================
   **ჟურნალის წესების მატრიცა** — მოქმედება × მოდული.

   სტრიქონი მოქმედების სახეობაა, პირველი სვეტი „ყველგან", დანარჩენი —
   მოდულები. `userId`-ის გარეშე მატრიცა ყველას ეხება (გლობალური და მოდულის
   დონე), `userId`-ით — ერთ ანგარიშს (მომხმარებლის და „მომხმარებელი + მოდული"
   დონე; აქ მისი პირადი მოდულებიც ჩანს).

   თითო უჯრა სამმდგომარეობიანია: ჩართული · გამორთული (სურვილისამებრ ვადით) ·
   „როგორც ზემოთ" — მაშინ უჯრა გაფერმკრთალებულად იმას აჩვენებს, რასაც ზედა
   დონე წყვეტს. ⚠️ გლობალურ უჯრას „როგორც ზემოთ" არ აქვს: მის ზემოთ მხოლოდ
   ნაგულისხმევია („იწერება"). ⚠️ დაცული სახეობა (ჩატის წაშლა) უჯრების ნაცვლად
   ბოქლომს აჩვენებს, მოდულის არმქონე სახეობას (შესვლა, გასვლა…) მოდულის
   სვეტებში უჯრა არ აქვს.
   ============================================================ */

export function AuditRulesMatrix({
  data,
  saved,
  draft,
  userId,
  onChoose,
}: {
  data: AuditRulesData
  /** სერვერზე შენახული მდგომარეობა — შეცვლილი უჯრის მოსანიშნად */
  saved: RuleDraft
  draft: RuleDraft
  /** `null` — ყველასთვის; რიცხვი — ერთი ანგარიშის წესები */
  userId: number | null
  onChoose: (kind: string, module: string | null, choice: RuleChoice) => void
}) {
  const { t, i18n } = useTranslation()

  // საბაზისო მოდულები და ფსევდო-ჭრილები ყველგან; პირადი მოდული — მხოლოდ მფლობელის მატრიცაში
  const columns = data.modules.filter((m) => m.owner_id === null || m.owner_id === userId)

  const nameOf = (m: AuditRuleModule) =>
    (i18n.language === 'ka' ? m.name_ka : m.name_en) || t(`audit.modules.${m.key}`, m.key)

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card" data-testid="audit-rules-matrix">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
              {t('audit.rules.columns.kind')}
            </th>
            <th scope="col" className="px-2 py-2 font-semibold text-foreground">
              {t('audit.rules.columns.everywhere')}
            </th>
            {columns.map((m) => (
              <th key={m.key} scope="col" className="px-2 py-2 font-medium">
                <span className="block max-w-24 truncate" title={nameOf(m)}>
                  {nameOf(m)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.kinds.map((kind) => {
            const kindName = t(`audit.rules.kinds.${kind.key}`)

            const cell = (module: string | null, place: string) => {
              const key = cellKey(kind.key, module, userId)

              return (
                <RuleCell
                  testId={`rule-${kind.key}-${module ?? 'all'}`}
                  label={`${kindName} · ${place}`}
                  cell={draft[key]}
                  inheritedOn={inherited(draft, kind.key, module, userId)}
                  global={module === null && userId === null}
                  changed={isChanged(saved, draft, key)}
                  until={data.until}
                  onChoose={(choice) => onChoose(kind.key, module, choice)}
                />
              )
            }

            return (
              <tr key={kind.key} className="border-b border-border last:border-0" data-testid={`rule-row-${kind.key}`}>
                <th scope="row" className="sticky left-0 bg-card px-3 py-1 text-left font-normal whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    {kind.protected && (
                      <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('audit.rules.protected')} />
                    )}
                    {kindName}
                  </span>
                </th>

                {kind.protected ? (
                  <td colSpan={columns.length + 1} className="px-2 py-1 text-xs text-muted-foreground">
                    {t('audit.rules.protected')}
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-1">
                      <span className="grid place-items-center">{cell(null, t('audit.rules.columns.everywhere'))}</span>
                    </td>
                    {columns.map((m) => (
                      <td key={m.key} className="px-2 py-1">
                        <span className="grid place-items-center">
                          {kind.moduleless ? (
                            <span className="text-muted-foreground/50" title={t('audit.rules.moduleless')} aria-hidden>
                              —
                            </span>
                          ) : (
                            cell(m.key, nameOf(m))
                          )}
                        </span>
                      </td>
                    ))}
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * ერთი უჯრა — აიქონი, რომელზე დაჭერაც არჩევანის მენიუს ხსნის.
 *
 * ⚠️ მდგომარეობა წარწერითაც ითქმის (`aria-label` / `title`): ფერი და აიქონი
 * მარტო საკმარისი არაა, „როგორც ზემოთ" კი სწორედ ფერმკრთალობით განსხვავდება.
 */
function RuleCell({
  testId,
  label,
  cell,
  inheritedOn,
  global,
  changed,
  until,
  onChoose,
}: {
  testId: string
  /** „დაჭერა · ფილმები" — რომელი უჯრაა */
  label: string
  /** საკუთარი წესი; მის გარეშე — „როგორც ზემოთ" */
  cell: Cell | undefined
  /** რას წყვეტს ზედა დონე */
  inheritedOn: boolean
  /** გლობალური უჯრა — მის ზემოთ მხოლოდ ნაგულისხმევია */
  global: boolean
  changed: boolean
  until: AuditRuleUntil[]
  onChoose: (choice: RuleChoice) => void
}) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()

  const temporary = !!cell && !cell.enabled && (cell.until != null || (cell.until === undefined && !!cell.expires_at))
  const on = cell ? cell.enabled : inheritedOn

  const state = !cell
    ? global
      ? t('audit.rules.states.on')
      : t(inheritedOn ? 'audit.rules.states.inheritOn' : 'audit.rules.states.inheritOff')
    : cell.enabled
      ? t('audit.rules.states.on')
      : cell.until
        ? t(`audit.rules.menu.off_${cell.until}`)
        : cell.until === undefined && cell.expires_at
          ? t('audit.rules.states.offUntil', { time: dateTime(cell.expires_at) })
          : t('audit.rules.states.off')

  const Icon = temporary ? Clock : on ? Check : X

  const item = (key: string, choice: RuleChoice, icon: ReactNode, text: string) => (
    <ActionMenuClose asChild key={key}>
      <button type="button" className={actionItemClass()} data-testid={`${testId}-${key}`} onClick={() => onChoose(choice)}>
        {icon}
        {text}
      </button>
    </ActionMenuClose>
  )

  return (
    <ActionMenu
      label={`${label}: ${state}`}
      trigger={
        <button
          type="button"
          title={`${label}: ${state}`}
          data-testid={testId}
          data-state-rule={!cell ? 'inherit' : cell.enabled ? 'on' : 'off'}
          className={cn(
            'grid size-8 cursor-pointer place-items-center rounded-md transition-colors',
            changed && 'bg-muted',
            on ? 'text-[var(--icon-ok)]' : 'text-destructive',
            // „როგორც ზემოთ" — იგივე აიქონი, ფერმკრთალად
            !cell && !global && 'opacity-35',
          )}
        >
          <Icon className="size-4" />
        </button>
      }
    >
      {!global &&
        item('inherit', { state: 'inherit' }, <CornerLeftUp className="size-4 text-muted-foreground" />, t('audit.rules.menu.inherit'))}
      {item('on', { state: 'on' }, <Check className="size-4 text-[var(--icon-ok)]" />, t('audit.rules.menu.on'))}
      {item('off', { state: 'off', until: null }, <X className="size-4 text-destructive" />, t('audit.rules.menu.off'))}
      {until.map((span) =>
        item(
          `off_${span}`,
          { state: 'off', until: span },
          <Clock className="size-4 text-destructive" />,
          t(`audit.rules.menu.off_${span}`),
        ),
      )}
    </ActionMenu>
  )
}
