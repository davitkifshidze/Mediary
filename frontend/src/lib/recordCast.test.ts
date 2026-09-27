import { describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'
import type { CastMember } from '@/api/types'
import {
  castActions,
  castOrderPayload,
  reorderCast,
  splitCast,
  type CastActionsInput,
} from './recordCast'

/* ============================================================
   ჩანაწერის მსახიობები (Tasks §16).

   ორი ფაქტი ჩერდება აქ, რომელსაც ტიპები ვერ ხედავს: **რომელი პუნქტი
   იხატება** (დამალულზე „გადაწევა" არ არის, პირველზე — „წინ") და **რა
   სიას ელის სერვერი** (დამალულებიც, ბოლოში — თორემ 422).
   ============================================================ */

const t = ((key: string) => key) as unknown as TFunction

const input = (extra: Partial<CastActionsInput> = {}): CastActionsInput => ({
  t,
  hidden: false,
  onOpen: vi.fn(),
  onEditRole: vi.fn(),
  onEarlier: vi.fn(),
  onLater: vi.fn(),
  onToggleHidden: vi.fn(),
  onDelete: vi.fn(),
  ...extra,
})

const keys = (i: Partial<CastActionsInput> = {}) => castActions(input(i)).map((a) => a.key)

const member = (id: number, hidden = false): CastMember => ({
  id,
  name: `Person ${id}`,
  name_ka: null,
  photo: null,
  is_hidden: hidden,
})

describe('castActions', () => {
  it('სრული ნაკრები ერთ სიაშია და წაშლა ბოლოში, წითლად', () => {
    expect(keys()).toEqual(['open', 'role', 'earlier', 'later', 'hide', 'delete'])
    const last = castActions(input()).at(-1)
    expect(last?.key).toBe('delete')
    expect(last?.danger).toBe(true)
  })

  it('სიის კიდეზე შეუძლებელი გადაწევა საერთოდ არ იხატება', () => {
    expect(keys({ onEarlier: undefined })).not.toContain('earlier')
    expect(keys({ onLater: undefined })).not.toContain('later')
  })

  it('დამალულს „გამოჩენა" აქვს და არა გადაწევა', () => {
    // ⚠️ დამალულის რიგი არ იცვლება — გადაწევა მას ხილულებში ჩაურევდა
    expect(keys({ hidden: true })).toEqual(['open', 'role', 'show', 'delete'])
  })

  it('დამალვა და გამოჩენა ერთსა და იმავე გადამრთველს იძახებს', () => {
    const onToggleHidden = vi.fn()
    castActions(input({ onToggleHidden })).find((a) => a.key === 'hide')?.run()
    castActions(input({ hidden: true, onToggleHidden })).find((a) => a.key === 'show')?.run()
    expect(onToggleHidden).toHaveBeenCalledTimes(2)
  })
})

describe('splitCast / castOrderPayload', () => {
  it('დამალულები ცალკე ჯგუფშია და რიგი შენარჩუნებულია', () => {
    const { visible, hidden } = splitCast([member(1), member(2, true), member(3), member(4, true)])
    expect(visible.map((c) => c.id)).toEqual([1, 3])
    expect(hidden.map((c) => c.id)).toEqual([2, 4])
  })

  it('სერვერს სრული სია მიდის — დამალულები ბოლოში, თავიანთ რიგში', () => {
    // ⚠️ დამალულის გამოტოვება `cast_order_mismatch` (422) იქნებოდა
    expect(castOrderPayload([3, 1], [member(2, true), member(4, true)])).toEqual([3, 1, 2, 4])
  })
})

describe('reorderCast', () => {
  it('ახალი რიგით ალაგებს და არავის კარგავს', () => {
    const cast = [member(1), member(2), member(3)]
    expect(reorderCast(cast, [3, 1, 2]).map((c) => c.id)).toEqual([3, 1, 2])
    // სიაში არმყოფი (მეორე ტაბის ახალი) ბოლოში რჩება — არ ქრება
    expect(reorderCast(cast, [2, 1]).map((c) => c.id)).toEqual([2, 1, 3])
  })
})
