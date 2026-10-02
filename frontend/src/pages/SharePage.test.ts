import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PublicShare, ShareItems, SharePlan } from '@/api/shareLinks'
import '@/i18n'

/* ============================================================
   გაზიარების ბმულის გვერდი — `/share/:token` (Tasks §40.6, §40.8).

   აქ მოწმდება ის, რასაც ვერც `tsc` ხედავს და ვერც backend-ის ტესტი:
   · ანონიმის „შესვლა" **ისევ ბმულზე აბრუნებს** (`state.from`);
   · შესულ უცხოს „უკვე გაქვს ✓" / „შენს ურნაშია" ეწერება ბარათზე;
   · მონიშნული ბარათი გეგმას **თავისი id-ით** ითხოვს და რიგში მხოლოდ ის მიდის,
     რაც არ გაქვს (ურნაში მყოფიც — რიგის მწკრივი „აღდგენას" სთავაზობს);
   · მოდულის უქონელს მოთხოვნის ღილაკი უჩანს და არა ცარიელი „დამატება";
   · 410 „ვადა გაუვიდა"-ს ამბობს და არა „ასეთი ბმული არ არსებობს"-ს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPublicShare: vi.fn(),
  fetchPublicShareItems: vi.fn(),
  fetchSharePlaylist: vi.fn(),
  planShareImport: vi.fn(),
  requestModule: vi.fn(),
  enqueueShare: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/shareLinks', async (original) => ({
  ...(await original<typeof import('@/api/shareLinks')>()),
  fetchPublicShare: mocks.fetchPublicShare,
  fetchPublicShareItems: mocks.fetchPublicShareItems,
  fetchSharePlaylist: mocks.fetchSharePlaylist,
  planShareImport: mocks.planShareImport,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  requestModule: mocks.requestModule,
}))

vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => ({ enqueueShare: mocks.enqueueShare }),
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = 'A'.repeat(48)

const head = (viewer: Partial<PublicShare['viewer']>): PublicShare => ({
  owner: { username: 'nino', display_name: 'Nino', avatar_path: null },
  link: { expires_at: null, show_status: true },
  sections: [{ domain: 'movie', count: 3 }],
  modules: { movie: { name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#7073ff' } },
  viewer: { signed_in: false, own: false, sections: {}, ...viewer },
})

const items: ShareItems = {
  data: [
    { id: 1, domain: 'movie', title_en: 'Alien', year: 1979, in_library: { id: 9, trashed: false } },
    { id: 2, domain: 'movie', title_en: 'Heat', year: 1995, in_library: { id: 10, trashed: true } },
    { id: 3, domain: 'movie', title_en: 'Ran', year: 1985, in_library: null },
  ],
  meta: { current_page: 1, last_page: 1, per_page: 30, total: 3 },
  genres: [],
}

const canAdd = { movie: { enabled: true, can_create: true, requested: false } }

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(async () => {
  await import('@/pages/SharePage')
}, 60_000)

vi.setConfig({ testTimeout: 20_000 })

beforeEach(() => {
  mocks.fetchPublicShareItems.mockResolvedValue(items)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** შესვლის გვერდის ნაცვლად — რას გადასცა ბმულმა `state.from`-ად */
function LoginProbe() {
  const location = useLocation()
  return h('p', { 'data-testid': 'login-from' }, (location.state as { from?: string } | null)?.from ?? 'none')
}

async function mount() {
  const { SharePage } = await import('@/pages/SharePage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(
          TooltipProvider,
          null,
          h(
            MemoryRouter,
            { initialEntries: [`/share/${TOKEN}`] },
            h(
              Routes,
              null,
              h(Route, { path: '/share/:token', element: h(SharePage) }),
              h(Route, { path: '/login', element: h(LoginProbe) }),
            ),
          ),
        ),
      ),
    )
  })

  for (let i = 0; i < 4; i++) await flush()
}

const button = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined

describe('SharePage — ნახვა', () => {
  it('ანონიმის „შესვლა" ისევ ბმულზე აბრუნებს', async () => {
    mocks.fetchPublicShare.mockResolvedValue(head({ signed_in: false }))
    await mount()

    expect(document.body.textContent).toContain('Nino')
    const login = [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/login')
    expect(login, '„შესვლის" ბმული არ დაიხატა').toBeTruthy()

    await act(async () => login!.click())
    await flush()

    expect(document.querySelector('[data-testid="login-from"]')?.textContent).toBe(`/share/${TOKEN}`)
  })

  it('შესულ უცხოს ბარათზე „უკვე გაქვს" და „შენს ურნაშია" ეწერება', async () => {
    mocks.fetchPublicShare.mockResolvedValue(head({ signed_in: true, sections: canAdd }))
    await mount()

    const cards = [...document.querySelectorAll('[data-testid="share-card"]')]
    const textOf = (title: string) => cards.find((c) => c.textContent?.includes(title))?.textContent ?? ''

    expect(cards).toHaveLength(3)
    expect(textOf('Alien')).toContain('უკვე გაქვს')
    expect(textOf('Heat')).toContain('შენს ურნაშია')
    expect(textOf('Ran')).not.toContain('უკვე გაქვს')
    expect(mocks.fetchPublicShareItems).toHaveBeenCalledWith(TOKEN, 'movie', { page: 1, q: undefined, genre: undefined })
  })

  it('410 „ვადა გაუვიდა"-ს ამბობს და არა „არ არსებობს"-ს', async () => {
    const response = {
      status: 410,
      statusText: 'Gone',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { message: 'share_expired' },
    }
    mocks.fetchPublicShare.mockRejectedValue(new AxiosError('gone', 'ERR_BAD_REQUEST', undefined, undefined, response))
    await mount()

    expect(document.body.textContent).toContain('ბმულს ვადა გაუვიდა')
    expect(document.body.textContent).not.toContain('ასეთი ბმული არ არსებობს')
  })
})

describe('SharePage — ბიბლიოთეკაში დამატება', () => {
  it('მონიშნული ბარათი თავისი id-ით ითხოვს გეგმას და რიგში მხოლოდ ახალი მიდის', async () => {
    mocks.fetchPublicShare.mockResolvedValue(head({ signed_in: true, sections: canAdd }))
    const plan: SharePlan = {
      domain: 'movie',
      module: canAdd.movie,
      items: [{ id: 3, title_ka: null, title_en: 'Ran', year: 1985, state: 'new', mine_id: null }],
      counts: { new: 1, have: 0, trash: 0 },
      status_modes: ['default', 'owner'],
    }
    mocks.planShareImport.mockResolvedValue(plan)
    await mount()

    // „უკვე გაქვს" ბარათს მონიშვნა არ აქვს — მხოლოდ ახალს
    const boxes = [...document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')]
    expect(boxes).toHaveLength(1)

    await act(async () => boxes[0].click())
    await act(async () => button('მონიშნულის დამატება (1)')!.click())
    await flush()

    expect(mocks.planShareImport).toHaveBeenCalledWith(TOKEN, 'movie', [3])
    expect(mocks.enqueueShare).toHaveBeenCalledWith(TOKEN, 'movie', [{ id: 3, title: 'Ran (1985)' }], 'default')
  })

  it('„ყველა ახალი" მთელ სექციას ითხოვს; ურნაში მყოფი რიგში მიდის, „გაქვს" — არა', async () => {
    mocks.fetchPublicShare.mockResolvedValue(head({ signed_in: true, sections: canAdd }))
    mocks.planShareImport.mockResolvedValue({
      domain: 'movie',
      module: canAdd.movie,
      items: [
        { id: 1, title_ka: null, title_en: 'Alien', year: null, state: 'have', mine_id: 9 },
        { id: 2, title_ka: null, title_en: 'Heat', year: null, state: 'trash', mine_id: 10 },
        { id: 3, title_ka: null, title_en: 'Ran', year: null, state: 'new', mine_id: null },
      ],
      counts: { new: 1, have: 1, trash: 1 },
      status_modes: ['default', 'owner'],
    } satisfies SharePlan)
    await mount()

    await act(async () => button('ყველა ახლის დამატება')!.click())
    await flush()

    expect(mocks.planShareImport).toHaveBeenCalledWith(TOKEN, 'movie', undefined)
    expect(mocks.enqueueShare).toHaveBeenCalledWith(
      TOKEN,
      'movie',
      [
        { id: 2, title: 'Heat' },
        { id: 3, title: 'Ran' },
      ],
      'default',
    )
  })

  it('მოდულის უქონელს მოთხოვნის ღილაკი უჩანს და არა „დამატება"', async () => {
    mocks.fetchPublicShare.mockResolvedValue(
      head({ signed_in: true, sections: { movie: { enabled: false, can_create: false, requested: false } } }),
    )
    mocks.requestModule.mockResolvedValue({})
    await mount()

    expect(button('ყველა ახლის დამატება')).toBeUndefined()
    expect(document.querySelectorAll('[role="checkbox"]')).toHaveLength(0)

    await act(async () => button('მოდულის მოთხოვნა')!.click())
    await flush()

    expect(mocks.requestModule).toHaveBeenCalledWith('movie')
  })
})

describe('SharePage — ეტაპი 2-ის სექციები (§40.10)', () => {
  const stage2 = (): PublicShare => ({
    owner: { username: 'nino', display_name: 'Nino', avatar_path: null },
    link: { expires_at: null, show_status: true },
    sections: [
      { domain: 'book', count: 1 },
      { domain: 'song', count: 1 },
    ],
    modules: {
      book: { name_ka: 'წიგნები', name_en: 'Books', icon: 'BookOpen', color: '#c47f2c' },
      song: { name_ka: 'სიმღერები', name_en: 'Songs', icon: 'Music', color: '#d6457a' },
    },
    viewer: {
      signed_in: true,
      own: false,
      sections: {
        book: { enabled: true, can_create: true, requested: false },
        song: { enabled: true, can_create: true, requested: false },
      },
    },
  })

  beforeEach(() => {
    mocks.fetchPublicShareItems.mockImplementation((_token: string, domain: string) =>
      Promise.resolve(
        domain === 'book'
          ? {
              data: [
                {
                  id: 5,
                  domain: 'book',
                  title_ka: 'ვეფხისტყაოსანი',
                  title_en: null,
                  subtitle: 'შოთა რუსთაველი',
                  status: 'read',
                  in_library: null,
                },
              ],
              meta: { current_page: 1, last_page: 1, per_page: 30, total: 1 },
              genres: [{ value: '3', name_ka: 'პოეზია', name_en: 'Poetry', count: 1 }],
            }
          : {
              data: [
                {
                  id: 8,
                  domain: 'song',
                  title_en: 'Suliko',
                  subtitle: 'Varinka',
                  url: 'https://www.youtube.com/watch?v=abc',
                  in_library: null,
                },
              ],
              meta: { current_page: 1, last_page: 1, per_page: 30, total: 1 },
              genres: [],
            },
      ),
    )
  })

  it('an enum status is translated, the subtitle shows and the status choice exists only where statuses do', async () => {
    mocks.fetchPublicShare.mockResolvedValue(stage2())
    await mount()

    const card = document.querySelector('[data-testid="share-card"]')
    expect(card?.textContent).toContain('ვეფხისტყაოსანი')
    expect(card?.textContent).toContain('შოთა რუსთაველი')
    // ⚠️ enum-ის გასაღები i18n-ით ითარგმნება — ნედლი `read` ეკრანზე არ უნდა ჩანდეს
    expect(card?.textContent).toContain('წაკითხული')
    expect(document.querySelector('[aria-label="რა სტატუსით დაემატოს"]')).toBeTruthy()

    // სიმღერას სტატუსი არ აქვს — არჩევანი, რომელიც არაფერს ცვლის, არ იხატება
    await act(async () => button('სიმღერები')!.click())
    await flush()
    await flush()

    expect(mocks.fetchPublicShareItems).toHaveBeenLastCalledWith(TOKEN, 'song', { page: 1, q: undefined, genre: undefined })
    expect(document.querySelector('[aria-label="რა სტატუსით დაემატოს"]')).toBeNull()

    const source = document.querySelector<HTMLAnchorElement>('[data-testid="share-card"] a[aria-label="წყაროზე გახსნა"]')
    expect(source?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc')
  })
})

describe('SharePage — პლეილისტები (§40.13)', () => {
  const playlistShare = (): PublicShare => ({
    owner: { username: 'nino', display_name: 'Nino', avatar_path: null },
    link: { expires_at: null, show_status: true },
    sections: [{ domain: 'playlist', count: 1 }],
    // ⚠️ პლეილისტის მოდული `song`-ია — სერვერი მეტამონაცემს მოდულის გასაღებით აბრუნებს
    modules: { song: { name_ka: 'სიმღერები', name_en: 'Songs', icon: 'Music', color: '#d6457a' } },
    viewer: { signed_in: true, own: false, sections: { playlist: { enabled: true, can_create: true, requested: false } } },
  })

  beforeEach(() => {
    mocks.fetchPublicShareItems.mockResolvedValue({
      data: [{ id: 3, domain: 'playlist', title_en: 'Road trip', songs_count: 2, in_library: null }],
      meta: { current_page: 1, last_page: 1, per_page: 30, total: 1 },
      genres: [],
    })
    mocks.fetchSharePlaylist.mockResolvedValue({
      playlist: { id: 3, domain: 'playlist', title_en: 'Road trip', songs_count: 2 },
      data: [
        { id: 11, domain: 'song', title_en: 'Suliko', url: 'https://www.youtube.com/watch?v=abc', in_library: null },
        { id: 12, domain: 'song', title_en: 'Tbiliso', url: 'https://www.youtube.com/watch?v=def', in_library: { id: 90, trashed: false } },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 100, total: 2 },
    })
  })

  it('a playlist card opens its songs in order, with "you have it" marks', async () => {
    mocks.fetchPublicShare.mockResolvedValue(playlistShare())
    await mount()

    // სექციის სახელი და ხატულა თავისია, ფერი კი `song`-ის მეტამონაცემიდან მოდის
    const tab = button('პლეილისტები')
    expect(tab?.querySelector('.lucide-list-music')).toBeTruthy()
    expect(tab?.getAttribute('style')?.toLowerCase()).toContain('#d6457a')
    const card = document.querySelector('[data-testid="share-card"]')
    expect(card?.textContent).toContain('Road trip')
    expect(card?.textContent).toContain('2 სიმღერა')
    // სტატუსის რეჟიმი პლეილისტს არ აქვს
    expect(document.querySelector('[aria-label="რა სტატუსით დაემატოს"]')).toBeNull()

    // ⚠️ კადრი ღილაკია თავისი სახელით (`aria-label`) — ტექსტად მასზე მხოლოდ რიცხვი წერია
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="„Road trip“ — გახსნა"]')!.click())
    await flush()
    await flush()

    expect(mocks.fetchSharePlaylist).toHaveBeenCalledWith(TOKEN, 3, 1)
    const text = document.body.textContent ?? ''
    expect(text.indexOf('Suliko')).toBeGreaterThan(-1)
    expect(text.indexOf('Suliko')).toBeLessThan(text.indexOf('Tbiliso'))
    expect(text).toContain('უკვე გაქვს')
  })

  it('adding a playlist plans and queues it as a playlist', async () => {
    mocks.fetchPublicShare.mockResolvedValue(playlistShare())
    mocks.planShareImport.mockResolvedValue({
      domain: 'playlist',
      module: { enabled: true, can_create: true, requested: false },
      items: [{ id: 3, title_ka: null, title_en: 'Road trip', year: null, state: 'new', mine_id: null }],
      counts: { new: 1, have: 0, trash: 0 },
      status_modes: [],
    } satisfies SharePlan)
    await mount()

    await act(async () => document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click())
    await act(async () => button('მონიშნულის დამატება (1)')!.click())
    await flush()

    expect(mocks.planShareImport).toHaveBeenCalledWith(TOKEN, 'playlist', [3])
    expect(mocks.enqueueShare).toHaveBeenCalledWith(TOKEN, 'playlist', [{ id: 3, title: 'Road trip' }], 'default')
  })
})
