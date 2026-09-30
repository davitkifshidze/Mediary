import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { CustomModuleOverview } from '@/api/account'
import { formatBytes } from '@/lib/utils'
import i18n from '@/i18n'

/* ============================================================
   **„მომხმარებლების მოდულები" (Tasks §37.8, Q41).**

   ⚠️ რასაც backend-ის ტესტი ვერ იტყვის: რომ ცხრილი **მხოლოდ აგრეგატებს**
   ხატავს (მფლობელი, რაოდენობა, ადგილი) და მოდულის გვერდზე ბმული არ აქვს
   (შიგთავსი სუპერადმინისთვისაც 404-ია); რომ **გამორთვა** სხვა ადამიანს
   ეხება და დადასტურებას ითხოვს, **ჩართვა** კი — არა; და რომ წაშლის ღილაკი
   საერთოდ არ არსებობს.
   ============================================================ */

const row = (extra: Partial<CustomModuleOverview> = {}): CustomModuleOverview => ({
  id: 40,
  key: 'c2-recipes',
  name_ka: 'რეცეპტები',
  name_en: 'Recipes',
  icon: 'Utensils',
  color: '#22c55e',
  is_active: true,
  owner: { id: 2, username: 'nino', name: 'Nino' },
  records: 12,
  bytes: 2048,
  created_at: '2026-09-30T10:00:00+04:00',
  ...extra,
})

const mocks = vi.hoisted(() => ({
  rows: [] as CustomModuleOverview[],
  toggle: vi.fn(async (id: number, isActive: boolean) => ({ ...mocks.rows.find((r) => r.id === id)!, is_active: isActive })),
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchCustomModulesOverview: async () => mocks.rows,
  setCustomModuleActive: mocks.toggle,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(rows: CustomModuleOverview[]) {
  mocks.rows = rows
  const { CustomModulesOversight } = await import('@/components/CustomModulesOversight')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        null,
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(CustomModulesOversight)))),
      ),
    ),
  )
  await flush()
}

const button = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

describe('CustomModulesOversight', () => {
  it('shows aggregates only — owner, count, space — with no way into the content', async () => {
    await i18n.changeLanguage('en')
    await mount([row()])

    const text = container!.textContent ?? ''
    expect(text).toContain('Recipes')
    expect(text).toContain('@nino')
    expect(text).toContain('12')
    expect(text).toContain(formatBytes(2048))

    // მფლობელის გვერდზე ბმული — კი; მოდულის შიგთავსზე — არა
    const hrefs = [...container!.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/users/2')
    expect(hrefs.some((href) => href?.startsWith('/c/') || href?.startsWith('/modules/'))).toBe(false)

    // ⚠️ წაშლა მხოლოდ მფლობელისაა
    expect(button(i18n.t('actions.delete'))).toBeUndefined()
    expect(button(i18n.t('customModules.delete'))).toBeUndefined()
  })

  it('asks before disabling someone else’s module and names its owner', async () => {
    await i18n.changeLanguage('en')
    await mount([row()])

    await act(async () => (container!.querySelector('button[role="switch"]') as HTMLButtonElement).click())
    await flush()

    expect(document.body.textContent).toContain(i18n.t('customModules.disableHint', { owner: 'Nino' }))
    expect(mocks.toggle).not.toHaveBeenCalled()

    await act(async () => button(i18n.t('customModules.disableConfirm'))!.click())
    await flush()

    expect(mocks.toggle).toHaveBeenCalledWith(40, false)
  })

  it('turns a disabled module back on without asking', async () => {
    await i18n.changeLanguage('en')
    await mount([row({ is_active: false })])

    expect(container!.textContent).toContain(i18n.t('customModules.oversightOff'))

    await act(async () => (container!.querySelector('button[role="switch"]') as HTMLButtonElement).click())
    await flush()

    expect(mocks.toggle).toHaveBeenCalledWith(40, true)
    expect(document.body.textContent).not.toContain(i18n.t('customModules.disableHint', { owner: 'Nino' }))
  })

  it('says so when nobody has created a module', async () => {
    await i18n.changeLanguage('en')
    await mount([])

    expect(container!.textContent).toContain(i18n.t('customModules.oversightEmpty'))
  })
})
