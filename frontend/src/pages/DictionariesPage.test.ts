import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { ModuleInfo } from '@/api/account'
import type { RestoredDefaults } from '@/api/statuses'
import type { Status } from '@/api/types'
import i18n from '@/i18n'

/* ============================================================
   **„ნაგულისხმევი სტატუსების აღდგენა" (2026-10-02 §1).**

   ⚠️ რასაც backend-ის ტესტი ვერ იტყვის: რომ **გვერდის გახსნა არაფერს
   აბრუნებს** (მოთხოვნა მხოლოდ ღილაკზე მიდის — წესი „ავტომატურად არასდროს"
   კლიენტის მხარესაც უნდა იდგეს), რომ პასუხის სია მაშინვე იხატება და
   შეტყობინება **რა მოხდა**-ს ამბობს, და რომ ღილაკი მხოლოდ იქ ჩანს, სადაც
   საწყისი ნაკრები არსებობს — ჟანრის/ტიპის კლასიფიკატორზე და „სტატუსების
   გარეშე" შექმნილ პირად მოდულზე ის „არაფერი აკლია"-ს იტყოდა.
   ============================================================ */

const moduleRow = (over: Partial<ModuleInfo>): ModuleInfo => ({
  id: 1,
  key: 'movie',
  name_ka: 'ფილმები',
  name_en: 'Movies',
  description_ka: null,
  description_en: null,
  icon: 'Film',
  color: '#7073ff',
  route_base: '/movies',
  api_base: '/movies',
  morph_alias: 'movie',
  is_active: true,
  enabled_by_default: true,
  sort_order: 10,
  enabled: true,
  granted: true,
  user_settings: {},
  ...over,
})

const status = (id: number, key: string, name: string, role: Status['role']): Status => ({
  id,
  key,
  module: 'movie',
  name_ka: name,
  name_en: key,
  role,
  icon: null,
  color: null,
  is_default: id === 1,
  sort_order: id,
  records_count: 0,
})

const UNDECIDED = status(1, 'undecided', 'გადაუწყვეტელი', 'todo')
const TO_WATCH = status(5, 'to_watch', 'საყურებელი', 'todo')
const WATCHING = status(2, 'watching', 'ვუყურებ', 'doing')
const WATCHED = status(3, 'watched', 'ნანახი', 'done')

const mocks = vi.hoisted(() => ({
  modules: [] as ModuleInfo[],
  list: vi.fn(async (): Promise<Status[]> => []),
  restore: vi.fn(async (): Promise<RestoredDefaults> => ({ data: [], restored: [], from_trash: [], skipped: [] })),
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე — კონტექსტის ჰუკის მოკის წესი
  auth: { user: { id: 1, is_super_admin: false }, isAdmin: false },
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchModules: async () => mocks.modules,
  fetchModuleFields: async () => [],
}))

vi.mock('@/api/statuses', async (original) => ({
  ...(await original<typeof import('@/api/statuses')>()),
  fetchStatuses: mocks.list,
  restoreDefaultStatuses: mocks.restore,
}))

vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  fetchVideoTypes: async () => [],
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

async function mount(path: string) {
  const { ModulesProvider } = await import('@/lib/modules')
  const { DictionariesPage } = await import('@/pages/DictionariesPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [path] },
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
                  h(Route, { path: '/dictionaries/:key', element: h(DictionariesPage) }),
                  h(Route, { path: '/dictionaries', element: h('p', { id: 'index' }, 'index') }),
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

const restoreButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('dictionaries.restoreDefaults')))

const text = () => document.body.textContent ?? ''

describe('ნაგულისხმევი სტატუსების აღდგენა', () => {
  it('გახსნა არაფერს აბრუნებს; ღილაკი აბრუნებს, სიას ხატავს და ამბობს, რამდენი დაბრუნდა', async () => {
    mocks.modules = [moduleRow({})]
    mocks.list.mockResolvedValue([UNDECIDED, WATCHING, WATCHED])
    mocks.restore.mockResolvedValue({
      data: [UNDECIDED, TO_WATCH, WATCHING, WATCHED],
      restored: ['to_watch'],
      from_trash: [],
      skipped: [],
    })

    await mount('/dictionaries/movie-statuses')

    // ⚠️ „ავტომატურად არასდროს" — სიის გახსნა მოთხოვნას არ აგზავნის
    expect(mocks.restore).not.toHaveBeenCalled()
    expect(text()).not.toContain('საყურებელი')

    const button = restoreButton()
    expect(button).toBeTruthy()

    await act(async () => button!.click())
    await flush()

    expect(mocks.restore).toHaveBeenCalledTimes(1)
    expect(text()).toContain('საყურებელი')
    expect(text()).toContain(i18n.t('dictionaries.defaultsRestored', { count: 1 }))
  })

  it('როცა არაფერი აკლია — ამას ამბობს, თანამოსახელეს კი ასახელებს', async () => {
    mocks.modules = [moduleRow({})]
    mocks.list.mockResolvedValue([UNDECIDED, WATCHING, WATCHED])
    mocks.restore.mockResolvedValue({
      data: [UNDECIDED, WATCHING, WATCHED],
      restored: [],
      from_trash: [],
      skipped: ['to_watch'],
    })

    await mount('/dictionaries/movie-statuses')
    await act(async () => restoreButton()!.click())
    await flush()

    expect(text()).toContain(i18n.t('dictionaries.defaultsComplete'))
    expect(text()).toContain(i18n.t('dictionaries.defaultsSkipped', { count: 1 }))
    expect(text()).not.toContain(i18n.t('dictionaries.defaultsRestored', { count: 0 }))
  })

  it('ჟანრის/ტიპის კლასიფიკატორზე ღილაკი არ არის', async () => {
    mocks.modules = [moduleRow({ id: 4, key: 'video', name_ka: 'ვიდეოები', route_base: '/videos', morph_alias: 'video' })]

    await mount('/dictionaries/video-types')

    expect(text()).toContain(i18n.t('dictionaries.add'))
    expect(restoreButton()).toBeUndefined()
  })

  it('პირად მოდულზე — მხოლოდ თუ საწყისი ნაკრებით შეიქმნა', async () => {
    const custom = (key: string, statuses: 'default' | 'none') =>
      moduleRow({
        id: key === 'c1-recipes' ? 40 : 41,
        key,
        name_ka: key,
        name_en: key,
        route_base: `/c/${key}`,
        api_base: `/custom/${key}`,
        morph_alias: null,
        is_custom: true,
        definition: { classification: null, statuses },
      })
    mocks.modules = [custom('c1-recipes', 'default'), custom('c1-plain', 'none')]

    await mount('/dictionaries/c1-recipes-statuses')
    expect(restoreButton()).toBeTruthy()

    act(() => root?.unmount())
    container?.remove()
    root = null

    await mount('/dictionaries/c1-plain-statuses')
    expect(text()).toContain(i18n.t('dictionaries.add'))
    expect(restoreButton()).toBeUndefined()
  })
})
