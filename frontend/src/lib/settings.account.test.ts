import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FeedbackProvider } from '@/components/ui/feedback'
import { SettingsProvider, useSettings, type Settings } from '@/lib/settings'
import '@/i18n'

/* ============================================================
   **პარამეტრების ლოკალური ქეში ანგარიშზეა მიბმული.**

   ⚠️ ქეში ბრაუზერისაა. ანგარიშს, რომელსაც სერვერზე პარამეტრები ჯერ არ აქვს
   (ახალი რეგისტრაცია), ის ეტვირთებოდა და მის სახელზე ინახებოდა — ანუ იმავე
   ბრაუზერში წინა ანგარიშის პარამეტრები და მთავარი გვერდის განლაგება.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  saveSettings: vi.fn(async () => {}),
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე — კონტექსტის ჰუკის მოკის წესი
  auth: { user: null as { id: number; settings: Record<string, unknown> } | null },
}))

vi.mock('@/api/account', () => ({ saveSettings: mocks.saveSettings }))
vi.mock('@/lib/auth', () => ({ useAuth: () => mocks.auth }))

const CACHE = 'mediary.settings.v1'
const OWNER = 'mediary.settings.owner'

let root: Root | null = null
let container: HTMLDivElement | null = null
let current: Settings

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
  localStorage.clear()
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mountAs(user: { id: number; settings: Record<string, unknown> }) {
  mocks.auth = { user }

  function Probe() {
    current = useSettings().settings
    return null
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => root!.render(h(FeedbackProvider, null, h(SettingsProvider, null, h(Probe)))))
  await flush()
}

/** კოდის ნაგულისხმევი (`DEFAULT_PER_PAGE`) და მისგან განსხვავებული მნიშვნელობა */
const DEFAULT_PER_PAGE = 20
const other = 100

describe('SettingsProvider: ლოკალური ქეში', () => {
  it('სხვა ანგარიშის ქეში ახალ ანგარიშს არ ეტვირთება და მის სახელზე არ ინახება', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ discoverPerPage: other }))
    localStorage.setItem(OWNER, '1')

    await mountAs({ id: 2, settings: {} })

    expect(current.discoverPerPage).toBe(DEFAULT_PER_PAGE)
    expect(mocks.saveSettings).not.toHaveBeenCalled()
    // ქეში ახლა ამ ანგარიშისაა და ნაგულისხმევს ინახავს
    expect(localStorage.getItem(OWNER)).toBe('2')
    expect(JSON.parse(localStorage.getItem(CACHE) ?? '{}').discoverPerPage).toBe(DEFAULT_PER_PAGE)
  })

  it('მფლობელის გარეშე დარჩენილი ძველი ქეშიც არავის გადაეცემა', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ discoverPerPage: other }))

    await mountAs({ id: 2, settings: {} })

    expect(current.discoverPerPage).toBe(DEFAULT_PER_PAGE)
    expect(mocks.saveSettings).not.toHaveBeenCalled()
  })

  it('საკუთარი ქეში იტვირთება და ერთხელ სერვერზე ადის', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ discoverPerPage: other }))
    localStorage.setItem(OWNER, '2')

    await mountAs({ id: 2, settings: {} })

    expect(current.discoverPerPage).toBe(other)
    expect(mocks.saveSettings).toHaveBeenCalledTimes(1)
  })

  it('სერვერის პარამეტრები ყოველთვის იმარჯვებს და ქეშს ამ ანგარიშზე აბამს', async () => {
    localStorage.setItem(CACHE, JSON.stringify({ discoverPerPage: other }))
    localStorage.setItem(OWNER, '1')

    await mountAs({ id: 2, settings: { discoverPerPage: 40 } })

    expect(current.discoverPerPage).toBe(40)
    expect(localStorage.getItem(OWNER)).toBe('2')
    expect(mocks.saveSettings).not.toHaveBeenCalled()
  })
})
