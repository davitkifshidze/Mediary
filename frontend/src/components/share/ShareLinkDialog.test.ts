import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ShareLink } from '@/api/shareLinks'
import '@/i18n'

/* ============================================================
   გაზიარების ბმულის ფანჯარა (Tasks §40.4).

   ⚠️ backend-ის ტესტი ამბობს „ფარგლით ბმული სწორად ჭრის"; **რას აგზავნის
   ფანჯარა** — ის ვერ ამბობს. აქ მოწმდება ორი ბმა: ბიბლიოთეკის „ეს სია
   გაუზიარე" მიმდინარე ფილტრს მართლა გადასცემს, და პირადის გაფრთხილება
   მაშინ ჩანს, როცა სერვერი პირად ჩანაწერებს ითვლის.

   §40.10: ახალ ბმულზე არცერთი სექცია წინასწარ არ ინიშნება; ეტაპი 2-ის
   სექცია მფლობელის ლექსიკონის **id-ებს** აგზავნის და „ჩემი შეფასება"
   ჩანს; გათიშული მოდულის სექცია ცხადად ითქმის და შენახვისას ამოვარდება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  previewShareLink: vi.fn(),
  createShareLink: vi.fn(),
  updateShareLink: vi.fn(),
  fetchGenres: vi.fn(),
  fetchDashboard: vi.fn(),
  fetchStatuses: vi.fn(),
  fetchBookGenres: vi.fn(),
  fetchShareRecords: vi.fn(),
  /* ⚠️ **ერთი და იგივე ობიექტი ყოველ render-ზე** — ახალი მასივი ყოველ
     გამოძახებაზე effect-ის მარყუჟს წარმოშობდა (`GalleryDownloadDialog.test`-ის გაკვეთილი) */
  modules: (() => {
    const movie = { key: 'movie', type: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#7073ff', enabled: true }
    const series = { key: 'series', type: 'series', name_ka: 'სერიალები', name_en: 'Series', icon: 'Tv', color: '#3fae8c', enabled: true }
    const book = { key: 'book', name_ka: 'წიგნები', name_en: 'Books', icon: 'BookOpen', color: '#c47f2c', enabled: true }
    const song = { key: 'song', name_ka: 'სიმღერები', name_en: 'Songs', icon: 'Music', color: '#d6457a', enabled: true }
    // გათიშული — ბმულში დარჩენილი სექციის სახელი აქედან მოდის
    const course = { key: 'course', name_ka: 'კურსები', name_en: 'Courses', icon: 'GraduationCap', color: '#2c8fc4', enabled: false }

    return { all: [movie, series, book, song, course], enabled: [movie, series, book, song], mediaModules: [movie, series] }
  })(),
  auth: { can: () => true },
}))

vi.mock('@/api/shareLinks', async (original) => ({
  ...(await original<typeof import('@/api/shareLinks')>()),
  previewShareLink: mocks.previewShareLink,
  createShareLink: mocks.createShareLink,
  updateShareLink: mocks.updateShareLink,
  fetchShareRecords: mocks.fetchShareRecords,
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  fetchGenres: mocks.fetchGenres,
}))

vi.mock('@/api/dashboard', async (original) => ({
  ...(await original<typeof import('@/api/dashboard')>()),
  fetchDashboard: mocks.fetchDashboard,
}))

vi.mock('@/api/statuses', async (original) => ({
  ...(await original<typeof import('@/api/statuses')>()),
  fetchStatuses: mocks.fetchStatuses,
}))

vi.mock('@/api/books', async (original) => ({
  ...(await original<typeof import('@/api/books')>()),
  fetchBookGenres: mocks.fetchBookGenres,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => mocks.auth,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(async () => {
  await import('@/components/share/ShareLinkDialog')
}, 60_000)

vi.setConfig({ testTimeout: 20_000 })

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

async function mount(props: Record<string, unknown>) {
  const { ShareLinkDialog } = await import('@/components/share/ShareLinkDialog')

  mocks.fetchGenres.mockResolvedValue([])
  mocks.fetchDashboard.mockResolvedValue([])
  mocks.fetchStatuses.mockResolvedValue([
    { id: 1, key: 'watched', role: 'done', name_ka: 'ნანახი', name_en: 'Watched', icon: null, color: null },
  ])
  mocks.fetchBookGenres.mockResolvedValue([
    { id: 3, name_ka: 'პოეზია', name_en: 'Poetry', icon: null, sort_order: 0 },
    { id: 4, name_ka: 'რომანი', name_en: 'Novel', icon: null, sort_order: 1 },
  ])

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(TooltipProvider, null, h(MemoryRouter, null, h(ShareLinkDialog, { onClose: () => {}, ...props }))),
      ),
    )
  })

  for (let i = 0; i < 4; i++) await flush()
}

const button = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined

describe('ShareLinkDialog', () => {
  it('„ეს სია გაუზიარე" მიმდინარე ფილტრს გადასცემს', async () => {
    mocks.previewShareLink.mockResolvedValue({ domains: { movie: { total: 4, private: 0 } }, total: 4, private: 0 })
    mocks.createShareLink.mockResolvedValue({
      id: 1,
      url: `http://localhost/share/${'b'.repeat(48)}`,
    } as ShareLink)

    await mount({ initial: { domain: 'movie', spec: { scope: 'status', statuses: ['watched'] } } })

    // წინასწარი რიცხვი იმავე ფარგლით ითხოვება, რაც შეინახება
    expect(mocks.previewShareLink).toHaveBeenCalledWith(
      { movie: { scope: 'status', statuses: ['watched'], public_only: false } },
      expect.anything(),
    )
    expect(document.body.textContent).toContain('ბმულში მოხვდება 4 ჩანაწერი')

    await act(async () => button('ბმულის შექმნა')!.click())
    await flush()
    await flush()

    expect(mocks.createShareLink).toHaveBeenCalledWith({
      domains: { movie: { scope: 'status', statuses: ['watched'], public_only: false } },
      name: null,
      show_status: true,
      expires_days: 30,
    })
    // შედეგის ეკრანი: ბმული და კოპირება
    expect(document.body.textContent).toContain('ბმული მზადაა')
  })

  it('პირადი ჩანაწერები წითლად ჩანს', async () => {
    mocks.previewShareLink.mockResolvedValue({ domains: { movie: { total: 5, private: 2 } }, total: 5, private: 2 })

    await mount({ initial: { domain: 'movie', spec: { scope: 'all' } } })

    expect(document.body.textContent).toContain('მათ შორის პირადი — 2')
    // ⚠️ კრიტიკული სამკუთხედი სათაურშია — მისი ტექსტი popover-შია, ღილაკი კი ჩანს
    expect(document.querySelector('.lucide-triangle-alert')).toBeTruthy()
  })

  it('ცარიელი არჩევანი ღილაკს თიშავს და სერვერს არ ეკითხება', async () => {
    mocks.previewShareLink.mockResolvedValue({ domains: {}, total: 0, private: 0 })

    await mount({ initial: { domain: 'movie', spec: { scope: 'status', statuses: [] } } })

    expect(button('ბმულის შექმნა')?.disabled).toBe(true)
    expect(mocks.previewShareLink).not.toHaveBeenCalled()
  })

  it('ახალ ბმულზე არცერთი სექცია წინასწარ არ ინიშნება', async () => {
    mocks.previewShareLink.mockResolvedValue({ domains: {}, total: 0, private: 0 })

    await mount({})

    expect(document.body.textContent).toContain('მონიშნე ერთი სექცია მაინც')
    expect(button('ბმულის შექმნა')?.disabled).toBe(true)
    expect(mocks.previewShareLink).not.toHaveBeenCalled()
  })

  it('ეტაპი 2-ის სექცია ლექსიკონის id-ებს აგზავნის და „ჩემი შეფასება" ჩანს', async () => {
    mocks.previewShareLink.mockResolvedValue({ domains: { book: { total: 2, private: 0 } }, total: 2, private: 0 })
    mocks.createShareLink.mockResolvedValue({ id: 2, url: `http://localhost/share/${'c'.repeat(48)}` } as ShareLink)

    await mount({ initial: { domain: 'book', spec: { scope: 'genre', categories: [3] } } })

    expect(mocks.previewShareLink).toHaveBeenCalledWith(
      { book: { scope: 'genre', categories: [3], genre_mode: 'any', public_only: false } },
      expect.anything(),
    )
    // მფლობელის ჟანრები ჩიპებად — წიგნის ჟანრი ერთი სვეტია, ამიტომ „ყველა ერთდროულად" არ ჩანს
    expect(button('პოეზია')?.getAttribute('aria-pressed')).toBe('true')
    expect(button('ყველა ერთდროულად')).toBeUndefined()
    // „ჟანრით" — სექციის სიტყვით, „სტატუსით" — წიგნს enum-სტატუსი აქვს
    expect(document.body.textContent).toContain('სტატუსით')
    expect(document.body.textContent).toContain('ჩემი შეფასება')

    await act(async () => button('რომანი')!.click())
    await flush()
    await act(async () => button('ბმულის შექმნა')!.click())
    await flush()
    await flush()

    expect(mocks.createShareLink).toHaveBeenCalledWith({
      domains: { book: { scope: 'genre', categories: [3, 4], genre_mode: 'any', public_only: false } },
      name: null,
      show_status: true,
      show_rating: true,
      expires_days: 30,
    })
  })

  it('გათიშული მოდულის სექცია ცხადად ითქმის და შენახვისას ამოვარდება', async () => {
    mocks.previewShareLink.mockResolvedValue({ domains: { movie: { total: 1, private: 0 } }, total: 1, private: 0 })
    mocks.updateShareLink.mockResolvedValue({ id: 7 } as ShareLink)

    const link = {
      id: 7,
      name: null,
      url: `http://localhost/share/${'d'.repeat(48)}`,
      readable: true,
      domains: { movie: { scope: 'all' }, course: { scope: 'all' } },
      counts: { movie: 1 },
      unavailable: ['course'],
      show_status: true,
      show_rating: false,
      expires_at: null,
      revoked_at: null,
      state: 'active',
      views: 0,
      imports: 0,
      importers: [],
      last_opened_at: null,
      created_at: null,
    } satisfies ShareLink

    await mount({ link })

    expect(document.body.textContent).toContain('„კურსები“ — ეს მოდული აღარ გაქვს')
    // ფილმს შეფასება TMDB-ისაა — გადამრთველი არ ჩანს და შენახული მნიშვნელობაც არ იგზავნება
    expect(document.body.textContent).not.toContain('ჩემი შეფასება')

    await act(async () => button('შენახვა')!.click())
    await flush()
    await flush()

    expect(mocks.updateShareLink).toHaveBeenCalledWith(7, {
      domains: { movie: { scope: 'all', public_only: false } },
      name: null,
      show_status: true,
    })
  })

  /* §40.13 — პლეილისტს მხოლოდ „ყველა" და „კონკრეტული" აქვს; შიგნით ყველა სიმღერა
     ჩანს, პირადიც — და ეს სექციის სათაურთან წითლად წერია. */
  it('პლეილისტის სექცია: რჩეული და ჟანრი არ ჩანს, სიმღერების გამჟღავნება წითლად წერია', async () => {
    mocks.previewShareLink.mockResolvedValue({ domains: { playlist: { total: 1, private: 0 } }, total: 1, private: 0 })
    mocks.fetchShareRecords.mockResolvedValue([{ id: 5, title_ka: null, title_en: 'Road trip', year: null }])

    await mount({ initial: { domain: 'playlist', spec: { scope: 'ids', ids: [5] } } })

    expect(mocks.previewShareLink).toHaveBeenCalledWith(
      { playlist: { scope: 'ids', ids: [5], public_only: false } },
      expect.anything(),
    )
    expect(mocks.fetchShareRecords).toHaveBeenCalledWith('playlist')

    const text = document.body.textContent ?? ''
    expect(text).toContain('პლეილისტები')
    expect(text).not.toContain('მხოლოდ რჩეულები')
    expect(text).not.toContain('ჟანრით')
    expect(text).not.toContain('სტატუსით')
    expect(document.querySelector('.lucide-triangle-alert')).toBeTruthy()
  })
})
