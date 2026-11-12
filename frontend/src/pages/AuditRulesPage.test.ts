import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { AuditRule, AuditRulesData } from '@/api/audit'
import { toDraft } from '@/lib/auditRules'

/* ============================================================
   **„ჟურნალის წესები"** — მატრიცა და გვერდი.

   ⚠️ მოწმდება: დაცულ სახეობას უჯრა არ აქვს, მოდულის არმქონეს — მხოლოდ „ყველგან";
   პირადი მოდულის სვეტი მხოლოდ მფლობელის მატრიცაში ჩანს; გლობალურ უჯრას „როგორც
   ზემოთ" არ აქვს; წესის გარეშე უჯრა ზედა დონის პასუხს აჩვენებს; უჯრის არჩევანი
   მყისიერად არაფერს აგზავნის — „შენახვა" მხოლოდ შეცვლილ უჯრებს აგზავნის; მთავარი
   ადმინის გარდა გვერდი არავის ეხატება.
   ============================================================ */

const rule = (kind: string, module: string | null, userId: number | null, enabled: boolean, expires: string | null = null): AuditRule => ({
  kind,
  module,
  user_id: userId,
  enabled,
  expires_at: expires,
})

const payload = (rules: AuditRule[] = []): AuditRulesData => ({
  kinds: [
    { key: 'login', protected: false, moduleless: true },
    { key: 'click', protected: false, moduleless: false },
    { key: 'chat_delete', protected: true, moduleless: false },
  ],
  until: ['hour', 'day', 'week'],
  modules: [
    { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', owner_id: null, owner: null },
    { key: 'c7-recipes', name_ka: 'რეცეპტები', name_en: 'Recipes', owner_id: 7, owner: 'alice' },
    { key: 'admin', name_ka: null, name_en: null, owner_id: null, owner: null },
  ],
  users: [{ id: 7, name: 'Alice', username: 'alice' }],
  rules,
})

const mocks = vi.hoisted(() => ({
  fetchAuditRules: vi.fn(),
  saveAuditRules: vi.fn(),
  // ⚠️ ყოველ გამოძახებაზე იგივე ობიექტი — სხვაგვარად ეფექტები უსასრულოდ ეშვება
  auth: { user: { id: 1, is_super_admin: true } as { id: number; is_super_admin: boolean } },
}))

vi.mock('@/api/audit', async (original) => ({
  ...(await original<typeof import('@/api/audit')>()),
  fetchAuditRules: mocks.fetchAuditRules,
  saveAuditRules: mocks.saveAuditRules,
}))

vi.mock('@/lib/auth', () => ({ useAuth: () => mocks.auth }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let page: typeof import('@/pages/AuditRulesPage')
let matrix: typeof import('@/components/audit/AuditRulesMatrix')

beforeAll(async () => {
  page = await import('@/pages/AuditRulesPage')
  matrix = await import('@/components/audit/AuditRulesMatrix')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.auth.user.is_super_admin = true
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(node: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, node))))),
  )
  await flush()
  await flush()
  return container
}

const cell = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="rule-${id}"]`)

/** უჯრის მენიუს გახსნა და ერთი პუნქტის არჩევა */
async function pick(id: string, option: string) {
  act(() => cell(id)!.click())
  await flush()
  act(() => document.querySelector<HTMLButtonElement>(`[data-testid="rule-${id}-${option}"]`)!.click())
  await flush()
}

describe('AuditRulesMatrix', () => {
  it('draws a cell only where a rule can exist', async () => {
    const data = payload()
    await mount(h(matrix.AuditRulesMatrix, { data, saved: {}, draft: {}, userId: null, onChoose: vi.fn() }))

    // დაცული: უჯრა არ აქვს; მოდულის არმქონე: მხოლოდ „ყველგან"
    expect(cell('chat_delete-all')).toBeNull()
    expect(cell('login-all')).not.toBeNull()
    expect(cell('login-movie')).toBeNull()
    expect(cell('click-movie')).not.toBeNull()
    expect(cell('click-admin')).not.toBeNull()
    // პირადი მოდული ყველასთვის მატრიცაში არ ჩანს
    expect(cell('click-c7-recipes')).toBeNull()
  })

  it('shows the owner their private module and what the level above decides', async () => {
    const data = payload([rule('click', null, null, false), rule('click', 'movie', 7, true), rule('click', 'admin', 7, false, '2026-11-13T11:15:00+04:00')])
    const draft = toDraft(data.rules)
    await mount(h(matrix.AuditRulesMatrix, { data, saved: draft, draft, userId: 7, onChoose: vi.fn() }))

    expect(cell('click-c7-recipes')).not.toBeNull()
    // საკუთარი წესის გარეშე — ზედა დონე (გლობალურად გამორთულია)
    expect(cell('click-all')!.dataset.stateRule).toBe('inherit')
    expect(cell('click-all')!.className).toContain('text-destructive')
    expect(cell('click-movie')!.dataset.stateRule).toBe('on')
    expect(cell('click-admin')!.dataset.stateRule).toBe('off')
    expect(cell('login-all')!.className).toContain('icon-ok')
  })

  it('offers "as above" everywhere except on the global cell', async () => {
    const onChoose = vi.fn()
    await mount(h(matrix.AuditRulesMatrix, { data: payload(), saved: {}, draft: {}, userId: null, onChoose }))

    act(() => cell('click-all')!.click())
    await flush()
    expect(document.querySelector('[data-testid="rule-click-all-inherit"]')).toBeNull()
    expect(document.querySelector('[data-testid="rule-click-all-on"]')).not.toBeNull()
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="rule-click-all-off"]')!.click())
    await flush()
    expect(onChoose).toHaveBeenLastCalledWith('click', null, { state: 'off', until: null })

    await pick('click-movie', 'off_hour')
    expect(onChoose).toHaveBeenLastCalledWith('click', 'movie', { state: 'off', until: 'hour' })

    await pick('click-movie', 'inherit')
    expect(onChoose).toHaveBeenLastCalledWith('click', 'movie', { state: 'inherit' })
  })
})

describe('AuditRulesPage', () => {
  const saveButton = () => document.querySelector<HTMLButtonElement>('[data-testid="audit-rules-save"]')!

  it('sends only the changed cells, and only on save', async () => {
    mocks.fetchAuditRules.mockResolvedValue(payload([rule('click', null, null, false)]))
    mocks.saveAuditRules.mockImplementation(async () => payload([rule('click', 'movie', null, true)]))
    await mount(h(page.AuditRulesPage))

    expect(saveButton().disabled).toBe(true)
    expect(cell('click-all')!.dataset.stateRule).toBe('off')

    await pick('click-all', 'on')
    await pick('click-movie', 'on')
    await pick('login-all', 'off_day')

    expect(mocks.saveAuditRules).not.toHaveBeenCalled()
    expect(saveButton().disabled).toBe(false)
    expect(saveButton().querySelector('[data-testid="count-badge"]')!.textContent).toBe('3')

    act(() => saveButton().click())
    await flush()

    expect(mocks.saveAuditRules).toHaveBeenCalledTimes(1)
    expect(mocks.saveAuditRules.mock.calls[0][0]).toEqual([
      { kind: 'click', module: null, user_id: null, state: 'inherit' },
      { kind: 'click', module: 'movie', user_id: null, state: 'on' },
      { kind: 'login', module: null, user_id: null, state: 'off', until: 'day' },
    ])

    // პასუხი ახალი შენახული მდგომარეობაა — მონახაზი მასზე ბრუნდება
    await flush()
    expect(saveButton().disabled).toBe(true)
    expect(cell('click-movie')!.dataset.stateRule).toBe('on')
    expect(cell('login-all')!.dataset.stateRule).toBe('inherit')
  })

  it('asks for a user before drawing the per-user matrix', async () => {
    mocks.fetchAuditRules.mockResolvedValue(payload())
    await mount(h(page.AuditRulesPage))

    expect(document.querySelector('[data-testid="audit-rules-matrix"]')).not.toBeNull()

    act(() => document.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click())
    await flush()

    expect(document.querySelector('[data-testid="audit-rules-matrix"]')).toBeNull()
    expect(document.querySelector('#audit-rules-user')).not.toBeNull()
  })

  it('is drawn for the super admin only', async () => {
    mocks.auth.user.is_super_admin = false
    await mount(h(page.AuditRulesPage))

    expect(mocks.fetchAuditRules).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="audit-rules-matrix"]')).toBeNull()
    expect(document.querySelector('[data-testid="audit-rules-save"]')).toBeNull()
  })
})
