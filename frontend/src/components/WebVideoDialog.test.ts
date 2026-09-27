import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   Tasks §19.6 — **„ვიდეოებში დამატება" ვებძებნის შედეგიდან.**

   ⚠️ რასაც აქ ვამოწმებთ, ვერც `tsc` დაინახავს და ვერც backend-ის ტესტი:
   backend-მა იცის „POST /videos ტიპის გარეშე 422-ია", მაგრამ ვერ იტყვის,
   **რას აგზავნის ღილაკი** — ტიპი დამახსოვრებული არჩევანიდან მოდის
   (`module_user.settings`), სტატუსი კი ლექსიკონის ნაგულისხმევიდან, და ორივე
   ცდომილება ეკრანზე მხოლოდ წითელ ტოსტად გამოჩნდებოდა.

   ⚠️ ბიბლიოთეკა არ დამატებულა (`GroupsCut.test.ts`-ის წესი): `react-dom/client`
   + `act()`, ფაილი `.ts`-ია და ელემენტები `createElement`-ით იწერება.
   ⚠️ მოქ-ობიექტები `vi.hoisted`-შია და **ერთი და იგივე ობიექტია** ყოველ
   რენდერზე — ახალი ობიექტი ეფექტს ყოველ ჯერზე გაუშვებდა და ტესტი ჩუმად
   გაიჭედებოდა (`GalleryDownloadDialog.test.ts`-ის გაკვეთილი).
   ============================================================ */

const mocks = vi.hoisted(() => ({
  createVideo: vi.fn(),
  searchWebVideos: vi.fn(),
  updateModuleSettings: vi.fn(async () => undefined),
  modules: {
    value: {
      has: (key: string) => key === 'video',
      all: [] as { key: string; user_settings?: Record<string, unknown> }[],
      enabled: [],
      mediaModules: [],
    },
  },
  auth: { can: () => true, canAdmin: () => false },
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules.value,
}))

vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => mocks.auth,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  updateModuleSettings: mocks.updateModuleSettings,
}))

vi.mock('@/api/statuses', async (original) => ({
  ...(await original<typeof import('@/api/statuses')>()),
  fetchStatuses: vi.fn(async () => [
    { id: 1, key: 'to_watch', role: 'todo', name_ka: 'საყურებელი', name_en: 'To watch', icon: null, color: null, is_default: false, sort_order: 1 },
    { id: 2, key: 'undecided', role: 'todo', name_ka: 'გადაუწყვეტელი', name_en: 'Undecided', icon: null, color: null, is_default: true, sort_order: 0 },
  ]),
}))

vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  fetchVideoTypes: vi.fn(async () => [
    { id: 5, key: 'info', name_ka: 'ინფორმაციული', name_en: 'Informative', icon: null, sort_order: 0 },
  ]),
  createVideo: mocks.createVideo,
}))

vi.mock('@/api/web', async (original) => ({
  ...(await original<typeof import('@/api/web')>()),
  webSearchStatus: vi.fn(async () => ({
    configured: true,
    limit: 250,
    used: 0,
    remaining: 250,
    window_start: null,
    account: null,
    sources: {
      images: [],
      videos: [{ key: 'youtube', name: 'YouTube', safe_search: false, free: false, uses_quota: true }],
    },
  })),
  searchWebVideos: mocks.searchWebVideos,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

const NEW_LINK = 'https://www.youtube.com/watch?v=oHg5SJYRHA0'

beforeEach(() => {
  mocks.createVideo.mockReset()
  mocks.createVideo.mockImplementation(async () => ({ id: 77, title: 'Trailer' }))
  mocks.searchWebVideos.mockReset()
  mocks.searchWebVideos.mockImplementation(async () => ({
    items: [
      {
        engine: 'youtube', source: 'serpapi:youtube', title: 'Trailer', link: NEW_LINK, channel: 'Studio',
        duration: 145, views: null, published: '2024-02-15', thumbnail: null, description: 'About it', engines: ['youtube'],
        existing: null,
      },
      {
        engine: 'youtube', source: 'serpapi:youtube', title: 'Old one', link: 'https://youtu.be/dQw4w9WgXcQ',
        channel: null, duration: null, views: null, published: null, thumbnail: null, description: null,
        engines: ['youtube'], existing: { id: 42, title: 'უკვე მაქვს' },
      },
    ],
    sources: [{ engine: 'youtube', ok: true, cached: false, count: 2, dropped: 0, quota_exceeded: false }],
    spent: 1,
    quota: { used: 1, limit: 250, remaining: 249 },
  }))
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

/** @param remembered `module_user.settings.web_type_id` */
async function mount(remembered?: number) {
  mocks.modules.value = {
    ...mocks.modules.value,
    all: [{ key: 'video', user_settings: remembered ? { web_type_id: remembered } : {} }],
  }
  const { WebVideoDialog } = await import('@/components/WebVideoDialog')

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
          MemoryRouter,
          null,
          h(
            TooltipProvider,
            null,
            h(WebVideoDialog, { target: 'movie', id: 1, initialQuery: 'trailer', title: 'ვიდეო', onClose: () => {} }),
          ),
        ),
      ),
    )
  })
  await flush()

  // ძებნა მხოლოდ ღილაკზეა — ზუსტად ისე, როგორც ეკრანზე
  await act(async () => button('ძებნა')!.click())
  await flush()
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** დიალოგი პორტალშია — ვეძებთ მთელ `document`-ში */
function button(text: string) {
  return [...document.body.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text))
}

function links(text: string) {
  return [...document.body.querySelectorAll('a')].filter((a) => (a.textContent ?? '').includes(text))
}

describe('WebVideoDialog — ვიდეოებში დამატება', () => {
  it('დამახსოვრებული ტიპითა და ნაგულისხმევი სტატუსით ქმნის ჩანაწერს', async () => {
    await mount(5)

    const add = button('ვიდეოებში დამატება')
    expect(add, 'ღილაკი უნდა იყოს').toBeTruthy()
    expect(add!.disabled).toBe(false)

    await act(async () => add!.click())
    await flush()

    expect(mocks.createVideo).toHaveBeenCalledTimes(1)
    expect(mocks.createVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        url: NEW_LINK,
        title: 'Trailer',
        type_id: 5,
        // ⚠️ ლექსიკონის ნაგულისხმევი და არა პირველი რიგი
        status: 'undecided',
        duration: 145,
        // Q52 — არხი და გამოქვეყნების დღე შედეგიდან მიდის
        channel: 'Studio',
        published_at: '2024-02-15',
      }),
    )

    // დამატებულზე ღილაკი „უკვე ვიდეოებშია · გახსნა"-დ იქცევა
    const opened = links('უკვე ვიდეოებშია').map((a) => a.getAttribute('href'))
    expect(opened).toContain('/videos?open=77')
  })

  it('ტიპის გარეშე ღილაკი არააქტიურია და მიზეზს ამბობს', async () => {
    await mount()

    expect(button('ვიდეოებში დამატება')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('ჯერ ზედა ზოლში ტიპი აირჩიე')
    expect(mocks.createVideo).not.toHaveBeenCalled()
  })

  it('წაშლილი დამახსოვრებული ტიპი არ ითვლება', async () => {
    // ⚠️ 99 ლექსიკონში აღარ არის — ძველი id-ით გაგზავნა 422 იქნებოდა
    await mount(99)

    expect(button('ვიდეოებში დამატება')!.disabled).toBe(true)
  })

  it('უკვე ვიდეოებში მყოფს დამატების ნაცვლად გახსნას სთავაზობს', async () => {
    await mount(5)

    expect(links('უკვე ვიდეოებშია').map((a) => a.getAttribute('href'))).toEqual(['/videos?open=42'])
    // ორი შედეგიდან დამატება მხოლოდ ახალს აქვს
    const adds = [...document.body.querySelectorAll('button')].filter((b) =>
      (b.textContent ?? '').includes('ვიდეოებში დამატება'),
    )
    expect(adds).toHaveLength(1)
  })
})
