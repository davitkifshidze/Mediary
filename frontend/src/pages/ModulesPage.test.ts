import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { ModuleInfo } from '@/api/account'
import i18n from '@/i18n'

/* ============================================================
   **მოდულების რიგი `/modules`-ზე** (Tasks §36).

   ⚠️ რასაც backend-ის ტესტი ვერ იტყვის: რომ **UI მთელ რიგს ერთი `PUT`-ით
   აგზავნის** (ისრითაც და ჩამოგდებითაც), ბარათი **მაშინვე** ინაცვლებს
   (ოპტიმისტური ქეში — საიდბარიც მას კითხულობს), „ნაგულისხმევი რიგი“ მხოლოდ
   მაშინ ჩანს, როცა ჩემი რიგი საერთოსგან განსხვავდება, და „ყველასთვის
   ნაგულისხმევად“ მხოლოდ სუპერადმინს აქვს და **ეკრანის რიგს** აგზავნის.

   ⚠️ `ModulesProvider` ნამდვილია და `fetchModules` — მოკი: სწორედ ესაა
   გვერდის წყარო, ე.ი. ოპტიმისტური ქეშის შემოწმება მის გარეშე ცარიელი
   იქნებოდა.
   ============================================================ */

const moduleRow = (key: string, sort: number, id: number): ModuleInfo => ({
  id,
  key,
  name_ka: key,
  name_en: key,
  description_ka: null,
  description_en: null,
  icon: 'LayoutGrid',
  color: null,
  route_base: `/${key}`,
  api_base: `/${key}`,
  morph_alias: null,
  is_active: true,
  enabled_by_default: false,
  sort_order: sort,
  enabled: true,
  granted: true,
  user_settings: {},
})

const MOVIE = moduleRow('movie', 10, 1)
const SERIES = moduleRow('series', 20, 2)
const VIDEO = moduleRow('video', 30, 3)

const mocks = vi.hoisted(() => ({
  // „სერვერის“ მდგომარეობა — `saveModuleOrder`-ის მოკი მას ცვლის
  server: { list: [] as ModuleInfo[], admin: [] as ModuleInfo[] },
  auth: { value: {} as Record<string, unknown> },
  saveOrder: vi.fn(),
  resetOrder: vi.fn(),
  saveDefault: vi.fn(),
  // §32 — პირადი მოდულის წაშლა ბარათის მენიუდან
  deleteModule: vi.fn(async () => ({ trashed: true, records: 3, trash_id: 9 })),
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchModules: async () => mocks.server.list,
  fetchAdminModules: async () => mocks.server.admin,
  fetchMyRequests: async () => [],
  // §37.8 — სუპერადმინს „მომხმარებლების მოდულები“-ც ეხატება
  fetchCustomModulesOverview: async () => [],
  saveModuleOrder: mocks.saveOrder,
  resetModuleOrder: mocks.resetOrder,
  saveDefaultModuleOrder: mocks.saveDefault,
  deleteCustomModule: mocks.deleteModule,
  fetchCustomModuleCounts: async () => ({ records: 3, bytes: 2048, keep_days: 30 }),
}))

vi.mock('@/lib/auth', () => ({ useAuth: () => mocks.auth.value }))

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

/** „სერვერი“ რიგს ინახავს — refetch-ზე ზუსტად ის ბრუნდება, რაც ჩაიწერა */
function serve(list: ModuleInfo[], admin: ModuleInfo[] = []) {
  mocks.server.list = list
  mocks.server.admin = admin
  mocks.saveOrder.mockImplementation(async (keys: string[]) => {
    const byKey = new Map(mocks.server.list.map((m) => [m.key, m]))
    mocks.server.list = keys.flatMap((k) => byKey.get(k) ?? [])
    return keys
  })
  mocks.resetOrder.mockImplementation(async () => {
    mocks.server.list = [...mocks.server.list].sort((a, b) => a.sort_order - b.sort_order)
  })
  mocks.saveDefault.mockImplementation(async (keys: string[]) => keys)
}

async function mount(superAdmin = false) {
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე — კონტექსტის ჰუკის მოკის წესი
  mocks.auth.value = { user: { id: 1, is_super_admin: superAdmin }, isAdmin: superAdmin }

  const { ModulesProvider } = await import('@/lib/modules')
  const { ModulesPage } = await import('@/pages/ModulesPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        null,
        h(
          QueryClientProvider,
          { client: qc },
          h(TooltipProvider, null, h(FeedbackProvider, null, h(ModulesProvider, null, h(ModulesPage)))),
        ),
      ),
    ),
  )
  await flush()
  await flush()
}

/** ბარათების რიგი ეკრანზე — ბმულის მისამართებიდან */
const shown = () =>
  [...container!.querySelectorAll('a[href^="/modules/"]')].map((a) => a.getAttribute('href')!.slice('/modules/'.length))


/** ტექსტიანი ღილაკები; „ყველასთვის ნაგულისხმევად“-ის დადასტურება ჰედერის ღილაკის ტექსტს იმეორებს — ის ბოლოა */
const buttons = (text: string) =>
  [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text)

async function click(el: Element) {
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await flush()
}

/** Tasks §11 — jsdom-ს განლაგება არ აქვს: ბარათების მართკუთხედები რიგიდან ითვლება (3 სვეტი),
    რომ dnd-kit-ის კლავიატურის სენსორმა მარცხენა მეზობელი იპოვოს; მაუსთან ასლს იმ ბარათის ზომა აქვს, რომლის ასლიცაა */
function mockGridRects(cols = 3) {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const ids = [...new Set([...document.querySelectorAll<HTMLElement>('[data-sortable-id]')].map((x) => x.dataset.sortableId))]
    const target = (this.closest('[data-sortable-id]') ?? this.querySelector('[data-sortable-id]')) as HTMLElement | null
    const index = target ? ids.indexOf(target.dataset.sortableId) : -1
    const left = index < 0 ? 0 : (index % cols) * 200
    const top = index < 0 ? 0 : Math.floor(index / cols) * 120
    return { x: left, y: top, left, top, width: 180, height: 100, right: left + 180, bottom: top + 100, toJSON: () => ({}) } as DOMRect
  }
}

const card = (key: string) => container!.querySelector(`a[href="/modules/${key}"]`)!.parentElement as HTMLElement

describe('ModulesPage — order', () => {
  it('the keyboard on the handle carries the card two places left, at once, and sends the whole order in one PUT', async () => {
    serve([MOVIE, SERIES, VIDEO])
    // ⚠️ პასუხი არ მოდის — ბარათი მხოლოდ ოპტიმისტურმა ქეშმა შეიძლება გადაწიოს (Tasks §12 — ისრები აღარ არის)
    mocks.saveOrder.mockImplementation(() => new Promise(() => {}))
    await mount()
    expect(shown()).toEqual(['movie', 'series', 'video'])

    const original = Element.prototype.getBoundingClientRect
    mockGridRects()
    try {
      const handle = card('video').querySelector<HTMLElement>('[data-sortable-handle]')!
      expect(handle, 'სახელური ვერ მოიძებნა').toBeTruthy()
      const key = async (code: string) => {
        await act(async () => {
          handle.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }))
        })
        await flush()
      }
      await key('Space')
      await key('ArrowLeft')
      await key('ArrowLeft')
      await key('Space')
    } finally {
      Element.prototype.getBoundingClientRect = original
    }

    expect(mocks.saveOrder).toHaveBeenCalledTimes(1)
    expect(mocks.saveOrder.mock.calls[0][0]).toEqual(['video', 'movie', 'series'])
    expect(shown()).toEqual(['video', 'movie', 'series'])
  })

  it('offers “default order” only when my order differs from the shared one', async () => {
    serve([MOVIE, SERIES, VIDEO])
    await mount()
    expect(buttons(i18n.t('modules.resetOrder'))).toHaveLength(0)
    // ⚠️ ჩვეულებრივ მომხმარებელს საერთო რიგის ღილაკი არასდროს აქვს
    expect(buttons(i18n.t('modules.setDefaultOrder'))).toHaveLength(0)

    act(() => root?.unmount())
    container?.remove()

    serve([SERIES, MOVIE, VIDEO])
    await mount()
    expect(buttons(i18n.t('modules.setDefaultOrder'))).toHaveLength(0)

    await click(buttons(i18n.t('modules.resetOrder'))[0])
    // დადასტურება ცალკე ღილაკია — ჰედერის დაჭერა მარტო არაფერს აგზავნის
    expect(mocks.resetOrder).not.toHaveBeenCalled()
    await click(buttons(i18n.t('modules.resetOrderConfirm'))[0])

    expect(mocks.resetOrder).toHaveBeenCalledTimes(1)
    expect(shown()).toEqual(['movie', 'series', 'video'])
  })

  it('the super admin makes the order on screen the default for everyone', async () => {
    // ადმინის სიაში გამორთული მოდულიც ჩანს — ისიც რიგშია
    const off = { ...moduleRow('anime', 25, 4), is_active: false }
    serve([SERIES, MOVIE, VIDEO], [SERIES, off, MOVIE, VIDEO])
    await mount(true)

    expect(shown()).toEqual(['series', 'anime', 'movie', 'video'])

    await click(buttons(i18n.t('modules.setDefaultOrder'))[0])
    await click(buttons(i18n.t('modules.setDefaultOrder')).at(-1)!)

    expect(mocks.saveDefault).toHaveBeenCalledTimes(1)
    expect(mocks.saveDefault.mock.calls[0][0]).toEqual(['series', 'anime', 'movie', 'video'])
  })
})

/* ============================================================
   **პირადი მოდულის წაშლა ბარათიდან** (Tasks §32.1/§32.4).

   ⚠️ წაშლის პუნქტი **მხოლოდ პირად** მოდულზეა (`c{owner}-{slug}`); ჩაშენებულზე მენიუში
   არ ჩანს (იშლება მხოლოდ გამორთვით). დადასტურება იგივეა, რაც მოდულის გვერდზე —
   რიცხვი, ზომა, ურნის ვადა — და `DELETE /modules/{key}` ზუსტად ერთხელ მიდის.
   ============================================================ */
const WORK = moduleRow('c1-work', 40, 16)

async function openMenu(key: string) {
  await act(async () => {
    card(key).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
  })
  await flush()

  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
}

describe('ModulesPage — delete (§32)', () => {
  it('offers “delete to the trash” only on a personal module and sends one DELETE after the confirmation', async () => {
    serve([MOVIE, WORK])
    await mount()

    // ჩაშენებულზე — არა
    const movieItems = (await openMenu('movie')).map((m) => m.textContent?.trim())
    expect(movieItems).toContain(i18n.t('actions.open'))
    expect(movieItems).not.toContain(i18n.t('customModules.deleteToTrash'))
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await flush()

    // პირადზე — კი, და დადასტურებაში რიცხვი, ზომა და ვადა წერია
    const items = await openMenu('c1-work')
    const del = items.find((m) => m.textContent?.includes(i18n.t('customModules.deleteToTrash')))
    expect(del).toBeDefined()
    await click(del!)
    await flush()

    expect(document.body.textContent).toContain(i18n.t('customModules.deleteTitle', { name: 'c1-work' }))
    expect(document.body.textContent).toContain('2.0 KB')

    await click(buttons(i18n.t('customModules.deleteConfirm'))[0])
    await flush()

    expect(mocks.deleteModule).toHaveBeenCalledTimes(1)
    expect(mocks.deleteModule).toHaveBeenCalledWith('c1-work')
  })
})
