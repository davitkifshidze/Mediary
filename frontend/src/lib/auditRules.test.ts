import { describe, expect, it } from 'vitest'
import type { AuditRule } from '@/api/audit'
import { cellKey, changes, choose, inherited, isChanged, toDraft, type RuleDraft } from '@/lib/auditRules'

/* ============================================================
   **ჟურნალის წესების უჯრები.**

   ⚠️ რა მოწმდება: დონეების რიგი იგივეა, რაც სერვერზე (მომხმარებელი + მოდული →
   მომხმარებელი → მოდული → გლობალური); „როგორც ზემოთ" საკუთარ წესს არ ითვლის;
   გლობალური „ჩართული" რიგს არ ქმნის; იგზავნება მხოლოდ შეცვლილი უჯრები, ვადა კი
   მხოლოდ გამორთულთან ერთად.
   ============================================================ */

const rule = (kind: string, module: string | null, userId: number | null, enabled: boolean, expires: string | null = null): AuditRule => ({
  kind,
  module,
  user_id: userId,
  enabled,
  expires_at: expires,
})

/** რას აჩვენებს უჯრა: საკუთარი წესი, ან ზედა დონის პასუხი */
const effective = (draft: RuleDraft, kind: string, module: string | null, userId: number | null) =>
  draft[cellKey(kind, module, userId)]?.enabled ?? inherited(draft, kind, module, userId)

describe('inherited', () => {
  const draft = toDraft([
    rule('click', null, null, false),
    rule('click', 'movie', null, true),
    rule('create', null, 7, false),
    rule('create', 'movie', 7, true),
    rule('update', 'book', null, false),
    rule('update', null, 8, true),
  ])

  it('lets the most specific level win', () => {
    // გლობალური გამორთვა, მოდულში ჩართული
    expect(effective(draft, 'click', 'book', 7)).toBe(false)
    expect(effective(draft, 'click', 'movie', 7)).toBe(true)
    // ერთ ანგარიშზე ყველგან გამორთული, ფილმებში ჩართული
    expect(effective(draft, 'create', 'book', 7)).toBe(false)
    expect(effective(draft, 'create', 'movie', 7)).toBe(true)
    expect(effective(draft, 'create', 'book', 8)).toBe(true)
    // მომხმარებლის წესი მოდულისაზე ძლიერია
    expect(effective(draft, 'update', 'book', 7)).toBe(false)
    expect(effective(draft, 'update', 'book', 8)).toBe(true)
    // წესის გარეშე — იწერება
    expect(effective(draft, 'delete', 'movie', 7)).toBe(true)
  })

  it('shows what "as above" would mean without the cell itself', () => {
    expect(inherited(draft, 'click', 'movie', null)).toBe(false)
    expect(inherited(draft, 'click', null, null)).toBe(true)
    expect(inherited(draft, 'create', 'movie', 7)).toBe(false)
    expect(inherited(draft, 'update', 'book', 8)).toBe(true)
    expect(inherited(draft, 'update', null, 8)).toBe(true)
  })
})

describe('choose / changes', () => {
  const saved = toDraft([rule('click', null, null, false), rule('visit', 'movie', 7, false, '2026-11-13T11:15:00+04:00')])

  it('sends nothing while nothing changed', () => {
    expect(changes(saved, { ...saved })).toEqual([])
  })

  it('removes the row for "as above" and for a global "on"', () => {
    let draft = choose(saved, 'click', null, null, { state: 'on' })
    draft = choose(draft, 'visit', 'movie', 7, { state: 'inherit' })

    expect(draft).toEqual({})
    expect(changes(saved, draft)).toEqual([
      { kind: 'click', module: null, user_id: null, state: 'inherit' },
      { kind: 'visit', module: 'movie', user_id: 7, state: 'inherit' },
    ])
  })

  it('keeps an explicit "on" below the global level', () => {
    const draft = choose(saved, 'click', 'movie', null, { state: 'on' })

    expect(draft[cellKey('click', 'movie', null)]).toMatchObject({ enabled: true })
    expect(changes(saved, draft)).toEqual([{ kind: 'click', module: 'movie', user_id: null, state: 'on' }])
  })

  it('carries the deadline only with a switch-off', () => {
    let draft = choose(saved, 'open', null, 7, { state: 'off', until: 'hour' })
    draft = choose(draft, 'refresh', null, null, { state: 'off', until: null })

    expect(changes(saved, draft)).toEqual([
      { kind: 'open', module: null, user_id: 7, state: 'off', until: 'hour' },
      { kind: 'refresh', module: null, user_id: null, state: 'off', until: null },
    ])
  })

  it('treats a re-chosen deadline as a change, an untouched one as none', () => {
    const key = cellKey('visit', 'movie', 7)
    expect(isChanged(saved, saved, key)).toBe(false)

    const draft = choose(saved, 'visit', 'movie', 7, { state: 'off', until: 'week' })
    expect(isChanged(saved, draft, key)).toBe(true)
    expect(changes(saved, draft)).toEqual([{ kind: 'visit', module: 'movie', user_id: 7, state: 'off', until: 'week' }])
  })
})
