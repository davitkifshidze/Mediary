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
   ============================================================ */

const mocks = vi.hoisted(() => ({
  previewShareLink: vi.fn(),
  createShareLink: vi.fn(),
  updateShareLink: vi.fn(),
  fetchGenres: vi.fn(),
  fetchDashboard: vi.fn(),
  fetchStatuses: vi.fn(),
  /* ⚠️ **ერთი და იგივე ობიექტი ყოველ render-ზე** — ახალი მასივი ყოველ
     გამოძახებაზე effect-ის მარყუჟს წარმოშობდა (`GalleryDownloadDialog.test`-ის გაკვეთილი) */
  modules: {
    mediaModules: [
      { key: 'movie', type: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#7073ff' },
      { key: 'series', type: 'series', name_ka: 'სერიალები', name_en: 'Series', icon: 'Tv', color: '#3fae8c' },
    ],
  },
}))

vi.mock('@/api/shareLinks', async (original) => ({
  ...(await original<typeof import('@/api/shareLinks')>()),
  previewShareLink: mocks.previewShareLink,
  createShareLink: mocks.createShareLink,
  updateShareLink: mocks.updateShareLink,
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

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
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
})
