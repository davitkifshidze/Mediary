import { describe, expect, it } from 'vitest'
import type { CredentialField } from '@/api/credentials'
import {
  CREDENTIAL_BRAND,
  CREDENTIAL_GROUPS,
  CREDENTIAL_PROVIDERS,
  credentialShortName,
  credentialState,
  usagePercent,
} from '@/lib/credentials'

/* ============================================================
   **„მონაცემების" ბარათის მდგომარეობა და ჯგუფები (Tasks §30).**

   ⚠️ ხუთი მდგომარეობა ხუთ სხვადასხვა ქმედებას ითხოვს, და ერთი მათგანის
   არევა ბარათს ატყუებინებდა: გაუშიფრავი რიგი `source`-ით `none`-ია, მაგრამ
   „ჩაწერე" და „ჩაწერე ხელახლა" სხვადასხვა რამეა; გამორთული და
   შეუვსებელი ერთნაირად არ მუშაობს, მაგრამ ერთი ჩამრთველით სწორდება,
   მეორე — ველით.
   ============================================================ */

const field = (name: string, has_own: boolean): CredentialField => ({
  name,
  secret: true,
  required: true,
  has_own,
  value: null,
  masked: has_own ? '••••' : null,
  default: null,
})

describe('credentialState', () => {
  it('is mine when the own key is in force', () => {
    expect(credentialState({ source: 'user', undecryptable: false, is_active: true, fields: [field('key', true)] })).toBe('mine')
  })

  it('is none when nothing was ever written', () => {
    expect(credentialState({ source: 'none', undecryptable: false, is_active: true, fields: [field('key', false)] })).toBe('none')
  })

  it('is partial when a required field is still empty (IGDB, Telegram)', () => {
    expect(
      credentialState({
        source: 'none',
        undecryptable: false,
        is_active: true,
        fields: [field('client_id', true), field('client_secret', false)],
      }),
    ).toBe('partial')
  })

  it('is off when a saved key was switched off', () => {
    expect(credentialState({ source: 'none', undecryptable: false, is_active: false, fields: [field('key', true)] })).toBe('off')
  })

  /* ⚠️ რიგი მნიშვნელოვანია: გაუშიფრავზე `source` `none`-ია და ველიც ცარიელად
     ჩანს — უამისოდ ბარათი „გასაღების დამატებას" ურჩევდა */
  it('says undecryptable before anything else', () => {
    expect(credentialState({ source: 'none', undecryptable: true, is_active: true, fields: [field('key', false)] })).toBe(
      'undecryptable',
    )
  })
})

describe('CREDENTIAL_GROUPS', () => {
  it('puts every provider in exactly one group', () => {
    const grouped = CREDENTIAL_GROUPS.flatMap((g) => [...g.providers])

    expect([...grouped].sort()).toEqual([...CREDENTIAL_PROVIDERS].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })

  it('names every provider', () => {
    for (const p of CREDENTIAL_PROVIDERS) expect(CREDENTIAL_BRAND[p]).toBeTruthy()
  })
})

describe('credentialShortName', () => {
  it('uses the short brand inside a sentence', () => {
    expect(credentialShortName('igdb')).toBe('IGDB')
    expect(credentialShortName('gemini')).toBe('Gemini')
  })

  it('returns an unknown provider unchanged', () => {
    expect(credentialShortName('newsource')).toBe('newsource')
  })
})

describe('usagePercent', () => {
  it('is the share of the limit, capped at 100', () => {
    expect(usagePercent({ used: 30, limit: 250 })).toBe(12)
    expect(usagePercent({ used: 300, limit: 250 })).toBe(100)
  })

  // ⚠️ `0` = ლიმიტი გამორთულია და `null` = არ არის — ორივეზე ზოლი არ იხატება
  it('draws no bar without a limit', () => {
    expect(usagePercent({ used: 30, limit: 0 })).toBeNull()
    expect(usagePercent({ used: 30, limit: null })).toBeNull()
    expect(usagePercent(null)).toBeNull()
  })
})
