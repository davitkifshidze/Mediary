import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { ModuleInfo } from '@/api/account'
import { formatBytes } from '@/lib/utils'
import i18n from '@/i18n'

/* ============================================================
   **პირადი მოდულის წაშლა `/modules/{key}`-ზე (Tasks §37.7, Q31).**

   ⚠️ რასაც backend-ის ტესტი ვერ იტყვის: რომ დადასტურება **რიცხვს ასახელებს**
   („მოდული და მისი N ჩანაწერი ურნაში გადავა" — Q31-ის პირობა), რიცხვი
   **წაშლამდე** იკითხება (`/details` — ჩანაწერების სია ადმინის მიერ გამორთულ
   მოდულზე 403-ია), წაშლის მოთხოვნა **მხოლოდ დადასტურების შემდეგ** მიდის,
   და მერე გვერდი `/modules`-ზე ბრუნდება — წაშლილი მოდულის გვერდზე დარჩენა
   „ვერ მოიძებნა"-ს დახატავდა.
   ============================================================ */

const RECIPES: ModuleInfo = {
  id: 40,
  key: 'c1-recipes',
  name_ka: 'რეცეპტები',
  name_en: 'Recipes',
  description_ka: null,
  description_en: null,
  icon: 'Utensils',
  color: '#22c55e',
  route_base: '/c/c1-recipes',
  api_base: '/custom/c1-recipes',
  morph_alias: null,
  is_active: true,
  enabled_by_default: false,
  sort_order: 60,
  enabled: true,
  granted: true,
  user_settings: {},
  is_custom: true,
}

const mocks = vi.hoisted(() => ({
  counts: vi.fn(async () => ({ records: 3, bytes: 4096, keep_days: 30 })),
  remove: vi.fn(async () => ({ trashed: true, records: 3, trash_id: 9 })),
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე — კონტექსტის ჰუკის მოკის წესი
  auth: { user: { id: 1, is_super_admin: false }, isAdmin: false },
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchModules: async () => [RECIPES],
  fetchMyRequests: async () => [],
  fetchModuleFields: async () => [],
  fetchCustomFields: async () => [],
  fetchCustomModuleCounts: mocks.counts,
  deleteCustomModule: mocks.remove,
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

async function mount() {
  const { ModulesProvider } = await import('@/lib/modules')
  const { ModulePage } = await import('@/pages/ModulePage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: ['/modules/c1-recipes'] },
        h(
          QueryClientProvider,
          { client: qc },
          h(
            TooltipProvider,
            null,
            h(
              FeedbackProvider,
              null,
              h(
                ModulesProvider,
                null,
                h(
                  Routes,
                  null,
                  h(Route, { path: '/modules/:key', element: h(ModulePage) }),
                  h(Route, { path: '/modules', element: h('p', { id: 'modules-list' }, 'modules list') }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  )
  await flush()
  await flush()
}

const button = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

describe('ModulePage — deleting a private module', () => {
  it('names the record count before anything is deleted, then moves the module to the trash', async () => {
    await i18n.changeLanguage('en')
    await mount()

    const del = button(i18n.t('customModules.deleteToTrash'))
    expect(del).toBeDefined()

    await act(async () => del!.click())
    await flush()

    // რიცხვი წაშლამდე იკითხება და ტექსტშია — Q31-ის პირობა
    expect(mocks.counts).toHaveBeenCalledWith('c1-recipes')
    expect(document.body.textContent).toContain(
      i18n.t('customModules.deleteHint', { count: 3, size: formatBytes(4096), days: 30 }),
    )
    // ⚠️ დადასტურებამდე არაფერი იშლება
    expect(mocks.remove).not.toHaveBeenCalled()

    await act(async () => button(i18n.t('customModules.deleteConfirm'))!.click())
    await flush()
    await flush()

    expect(mocks.remove).toHaveBeenCalledTimes(1)
    expect(mocks.remove).toHaveBeenCalledWith('c1-recipes')
    expect(document.getElementById('modules-list')).not.toBeNull()
  })

  it('does nothing when the confirmation is cancelled', async () => {
    await i18n.changeLanguage('en')
    await mount()

    await act(async () => button(i18n.t('customModules.deleteToTrash'))!.click())
    await flush()
    await act(async () => button(i18n.t('actions.cancel'))!.click())
    await flush()

    expect(mocks.remove).not.toHaveBeenCalled()
    expect(document.getElementById('modules-list')).toBeNull()
  })
})
