import type { AuditRule, AuditRuleChange, AuditRuleUntil } from '@/api/audit'

/* ============================================================
   **ჟურნალის წესები — უჯრების გამოთვლა ბრაუზერში.**

   სერვერზე გადაწყვეტის ერთი ადგილია (`AuditRules::decide()`); აქაური ფუნქციები
   მხოლოდ გვერდს ემსახურება: რას აჩვენებს უჯრა, სანამ შენახვამდე ცვლი, და რა
   უნდა გაიგზავნოს. დონეების რიგი იგივეა — უფრო კონკრეტული იმარჯვებს:

     მომხმარებელი + მოდული → მომხმარებელი → მოდული → გლობალური

   ⚠️ გლობალურ დონეზე „ჩართული" ნაგულისხმევია და რიგად არ ინახება — ამიტომ
   იქ ჩართვა უჯრას უბრალოდ შლის.
   ============================================================ */

/** ერთი უჯრა: სახეობა · მოდული (`null` — ყველგან) · მომხმარებელი (`null` — ყველა) */
export interface RuleCell {
  kind: string
  module: string | null
  user_id: number | null
  enabled: boolean
  /** შენახული ვადა (სერვერიდან) */
  expires_at: string | null
  /** ახლახან არჩეული ვადა — ჯერ არ შენახულა; `null` — ხელით ჩართვამდე */
  until?: AuditRuleUntil | null
}

export type RuleDraft = Record<string, RuleCell>

/** უჯრის ახალი მდგომარეობა მენიუდან */
export type RuleChoice =
  | { state: 'inherit' }
  | { state: 'on' }
  | { state: 'off'; until: AuditRuleUntil | null }

export function cellKey(kind: string, module: string | null, userId: number | null): string {
  return `${kind}|${module ?? ''}|${userId ?? 0}`
}

export function toDraft(rules: AuditRule[]): RuleDraft {
  const draft: RuleDraft = {}
  for (const rule of rules) draft[cellKey(rule.kind, rule.module, rule.user_id)] = { ...rule }
  return draft
}

/** დონეები უჯრიდან ზემოთ — პირველი თვითონ უჯრაა */
function levels(module: string | null, userId: number | null): [string | null, number | null][] {
  const all: [string | null, number | null][] = [
    [module, userId],
    [null, userId],
    [module, null],
    [null, null],
  ]

  return all.filter(([m, u], i) => all.findIndex(([m2, u2]) => m2 === m && u2 === u) === i)
}

/**
 * რას ნიშნავს ამ უჯრაზე „როგორც ზემოთ" — ზედა დონეების პასუხი, უჯრის საკუთარი
 * წესის გარეშე (საკუთარი წესის მქონე უჯრა თავის მდგომარეობას აჩვენებს).
 */
export function inherited(draft: RuleDraft, kind: string, module: string | null, userId: number | null): boolean {
  for (const [m, u] of levels(module, userId).slice(1)) {
    const cell = draft[cellKey(kind, m, u)]
    if (cell) return cell.enabled
  }

  return true
}

/** უჯრის შეცვლა — ახალი მონახაზი (ძველი ხელუხლებელია) */
export function choose(
  draft: RuleDraft,
  kind: string,
  module: string | null,
  userId: number | null,
  choice: RuleChoice,
): RuleDraft {
  const key = cellKey(kind, module, userId)
  const next = { ...draft }
  const global = module === null && userId === null

  if (choice.state === 'inherit' || (choice.state === 'on' && global)) {
    delete next[key]
    return next
  }

  next[key] =
    choice.state === 'on'
      ? { kind, module, user_id: userId, enabled: true, expires_at: null }
      : { kind, module, user_id: userId, enabled: false, expires_at: null, until: choice.until }

  return next
}

/** უჯრა შეიცვალა შენახულთან შედარებით? */
export function isChanged(saved: RuleDraft, draft: RuleDraft, key: string): boolean {
  const was = saved[key]
  const now = draft[key]

  if (!was || !now) return was !== now
  // `until` მხოლოდ ახლახან არჩეულ უჯრას აქვს — იგივე ვადის ხელახლა არჩევაც ცვლილებაა (ვადა თავიდან ითვლება)
  return was.enabled !== now.enabled || now.until !== undefined
}

/** რა იგზავნება — მხოლოდ შეცვლილი უჯრები */
export function changes(saved: RuleDraft, draft: RuleDraft): AuditRuleChange[] {
  const out: AuditRuleChange[] = []

  for (const key of new Set([...Object.keys(saved), ...Object.keys(draft)])) {
    if (!isChanged(saved, draft, key)) continue

    const now = draft[key]
    const cell = now ?? saved[key]

    out.push({
      kind: cell.kind,
      module: cell.module,
      user_id: cell.user_id,
      state: !now ? 'inherit' : now.enabled ? 'on' : 'off',
      ...(now && !now.enabled ? { until: now.until ?? null } : {}),
    })
  }

  return out
}
