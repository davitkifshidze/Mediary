import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ModuleInfo } from '@/api/account'
import i18n from '@/i18n'

/* ============================================================
   **მოდულის ქვემენიუ — ერთი ფუნქცია ყველასთვის** (Tasks §25.1).

   ⚠️ კურსი და ადგილი აქამდე ჩვეულებრივი ბმული იყო, ე.ი. „რჩეული" და
   „დამატება" მენიუდან საერთოდ არ იყო. ახლა რვა მოდულის ბლოკი ერთ
   `moduleSection()`-შია — ტესტი იმას ამოწმებს, რომ ხუთივე „ყველა ·
   რჩეული · დამატების" მოდული ერთნაირად იშლება, ხოლო სიმღერა და
   ჩანაწერი თავის დამატებით რიგს (პლეილისტები, შეხსენებები) ინარჩუნებს.
   ============================================================ */

const moduleRow = (key: string, route: string, sort: number): ModuleInfo => ({
  id: sort,
  key,
  name_ka: key,
  name_en: key,
  description_ka: null,
  description_en: null,
  icon: 'LayoutGrid',
  color: null,
  route_base: route,
  api_base: route,
  morph_alias: key,
  is_active: true,
  enabled_by_default: true,
  sort_order: sort,
  enabled: true,
  user_settings: {},
})

const mocks = vi.hoisted(() => ({
  modules: {
    all: [] as unknown[],
    enabled: [] as unknown[],
    mediaModules: [] as unknown[],
    pageModules: [] as unknown[],
    has: () => true,
    loading: false,
  },
  statusMap: {},
  auth: { isAdmin: false, canAdmin: () => false },
  settings: { settings: { defaultView: 'all' } },
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatusMap: () => mocks.statusMap,
}))

vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => mocks.auth,
}))

vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useSettings: () => mocks.settings,
  useContentLang: () => 'ka',
}))

vi.mock('@/api/chat', async (original) => ({
  ...(await original<typeof import('@/api/chat')>()),
  fetchChatUnread: vi.fn().mockResolvedValue(0),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(path = '/') {
  const page = [
    moduleRow('song', '/songs', 1),
    moduleRow('book', '/books', 2),
    moduleRow('board_game', '/board-games', 3),
    moduleRow('game', '/games', 4),
    moduleRow('note', '/notes', 5),
    moduleRow('course', '/courses', 6),
    moduleRow('place', '/places', 7),
  ]
  mocks.modules.all = page
  mocks.modules.enabled = page
  mocks.modules.pageModules = page

  const { Sidebar } = await import('@/components/Sidebar')

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
          h(TooltipProvider, null, h(Sidebar, { drawerOpen: false, onDrawerChange: () => {} })),
        ),
      ),
    ),
  )
  await flush()

  return container
}

/** მოდულის რიგი — სახელით (ფიქსტურაში სახელი = გასაღები) */
const moduleButton = (el: HTMLElement, key: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(
    (b) => b.textContent?.trim() === key,
  )

/** გაშლილი განყოფილების ქვე-პუნქტები — რიგის შემდეგი ძმა-ელემენტიდან */
const subItems = (button: HTMLButtonElement) =>
  [...(button.nextElementSibling?.querySelectorAll('a, button') ?? [])].map((x) => ({
    text: x.textContent?.trim(),
    href: x.getAttribute('href'),
  }))

describe('Sidebar module sections', () => {
  it.each([
    ['course', '/courses'],
    ['place', '/places'],
    ['book', '/books'],
    ['board_game', '/board-games'],
    ['game', '/games'],
  ])('%s opens all · favourite · add', async (key, route) => {
    const el = await mount()
    const button = moduleButton(el, key)!
    expect(button, key).toBeTruthy()

    await act(async () => button.click())

    expect(subItems(button)).toEqual([
      { text: i18n.t('filter.all'), href: null },
      { text: i18n.t('filter.favorite'), href: null },
      { text: i18n.t('actions.addShort'), href: `${route}?new=1` },
    ])
  })

  it('the favourite row navigates to ?view=favorite and lights up there', async () => {
    const el = await mount('/courses?view=favorite')
    // მიმდინარე მარშრუტის განყოფილება თვითონ იშლება
    const button = moduleButton(el, 'course')!
    expect(button.getAttribute('aria-expanded')).toBe('true')

    const favorite = [...button.nextElementSibling!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === i18n.t('filter.favorite'),
    )!
    expect(favorite.className).toContain('font-semibold')
  })

  it('song keeps its playlists row and note its reminders row', async () => {
    const el = await mount()

    const song = moduleButton(el, 'song')!
    await act(async () => song.click())
    expect(subItems(song).map((i) => i.href)).toEqual([null, null, '/playlists', '/songs?new=1'])

    const note = moduleButton(el, 'note')!
    await act(async () => note.click())
    expect(subItems(note).at(-2)?.href).toBe('/notes/reminders')
    expect(subItems(note).at(-1)?.href).toBe('/notes?new=1')
  })
})
