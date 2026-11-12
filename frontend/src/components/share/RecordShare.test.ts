import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { ShareTarget } from '@/components/share/RecordShare'
import i18n from '@/i18n'

/* ============================================================
   **ერთი ჩანაწერის გაზიარება**.

   ⚠️ მოწმდება: „ბმული მხოლოდ ამ ჩანაწერზე" ერთი ჩანაწერის ფარგალს აგზავნის
   (`scope: ids`) და მხოლოდ იმ ბლოკებს აჩვენებს, რომლებიც მოდულს აქვს; მზა ბმული
   პირდაპირ ჩანაწერის შიდა გვერდზე მიდის; „პირადი ბმული" ჯერ სერვერს ეკითხება,
   ჩანს თუ არა ჩანაწერი, დახურულზე ამბობს რა არის დახურული და გასაჯაროებას
   სთავაზობს; მენიუს პუნქტი ფანჯარას ხსნის.
   ============================================================ */

const mocks = vi.hoisted(() => {
  const movie = { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: null, enabled: true, is_public: false }
  const game = { key: 'game', name_ka: 'თამაშები', name_en: 'Games', icon: 'Gamepad2', color: null, enabled: true, is_public: true }

  return {
    createShareLink: vi.fn(),
    fetchGuestRecord: vi.fn(),
    setDomainVisibility: vi.fn(),
    setModulePublic: vi.fn(),
    updateProfile: vi.fn(),
    setUser: vi.fn(),
    // ⚠️ ერთი და იგივე ობიექტი ყოველ render-ზე
    modules: { all: [movie, game], enabled: [movie, game] },
    auth: { user: { username: 'nino', profile_visibility: 'private' } as Record<string, unknown>, setUser: vi.fn() },
  }
})

vi.mock('@/api/shareLinks', async (original) => ({
  ...(await original<typeof import('@/api/shareLinks')>()),
  createShareLink: mocks.createShareLink,
}))

vi.mock('@/api/guestRecord', async (original) => ({
  ...(await original<typeof import('@/api/guestRecord')>()),
  fetchGuestRecord: mocks.fetchGuestRecord,
}))

vi.mock('@/api/publicProfile', async (original) => ({
  ...(await original<typeof import('@/api/publicProfile')>()),
  setDomainVisibility: mocks.setDomainVisibility,
  setModulePublic: mocks.setModulePublic,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  updateProfile: mocks.updateProfile,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => mocks.auth,
}))

// QR ბიბლიოთეკა ზარმაცად იტვირთება — ტესტს მხოლოდ მისამართი აინტერესებს
vi.mock('@/components/share/ShareQr', () => ({
  ShareQr: ({ value }: { value: string }) => h('div', { 'data-testid': 'qr', 'data-value': value }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
  mocks.auth.user = { username: 'nino', profile_visibility: 'private' }
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const MOVIE: ShareTarget = { domain: 'movie', id: 5, title: 'Taken' }

async function render(node: (parts: typeof import('@/components/share/RecordShare')) => ReturnType<typeof h>) {
  const parts = await import('@/components/share/RecordShare')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(TooltipProvider, null, h(FeedbackProvider, null, node(parts))))),
    ),
  )
  await flush()
}

const mount = (target: ShareTarget) => render(({ RecordShareDialog }) => h(RecordShareDialog, { target, onClose: () => {} }))

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

const box = (key: string) => document.querySelector<HTMLButtonElement>(`[data-testid="record-share-${key}"]`)

describe('RecordShareDialog', () => {
  it('creates a link to this one record with the chosen blocks', async () => {
    mocks.createShareLink.mockResolvedValue({ id: 1, url: `http://localhost/share/${'a'.repeat(48)}` })
    await mount(MOVIE)

    // ფილმს ხუთივე გადამრთველი აქვს; შიდა გვერდის ბლოკები დახურულია
    for (const key of ['status', 'rating', 'gallery', 'cast', 'trailer']) expect(box(key)).not.toBeNull()
    expect(box('cast')!.getAttribute('data-state')).toBe('unchecked')

    await act(async () => box('cast')!.click())
    await act(async () => button(i18n.t('share.create'))!.click())
    await flush()

    expect(mocks.createShareLink).toHaveBeenCalledWith({
      domains: { movie: { scope: 'ids', ids: [5] } },
      name: 'Taken',
      show_status: true,
      show_rating: true,
      show_gallery: false,
      show_cast: true,
      show_trailer: false,
      expires_days: 30,
    })

    // მზა ბმული პირდაპირ ჩანაწერის შიდა გვერდზე მიდის
    const url = document.querySelector<HTMLInputElement>('[data-testid="record-share-result"] input')!.value
    expect(url).toBe(`${window.location.origin}/share/${'a'.repeat(48)}/movie/5`)
  })

  it('offers only the blocks the module has', async () => {
    await mount({ domain: 'game', id: 2, title: 'Portal' })

    expect(box('gallery')).not.toBeNull()
    // მსახიობები და თრეილერი მხოლოდ მედიას აქვს
    expect(box('cast')).toBeNull()
    expect(box('trailer')).toBeNull()
  })

  it('gives the personal link when the record is reachable on the public page', async () => {
    mocks.fetchGuestRecord.mockResolvedValue({})
    await mount(MOVIE)

    await act(async () => button(i18n.t('recordShare.profileMode'))!.click())
    await flush()

    expect(mocks.fetchGuestRecord).toHaveBeenCalledWith({ kind: 'profile', username: 'nino' }, 'movie', 5)
    const url = document.querySelector<HTMLInputElement>('[data-testid="record-share-result"] input')!.value
    expect(url).toBe(`${window.location.origin}/u/nino/movie/5`)
  })

  it('says what is closed and opens all three layers on request', async () => {
    mocks.fetchGuestRecord.mockRejectedValueOnce(new Error('404')).mockResolvedValue({})
    mocks.updateProfile.mockResolvedValue({ username: 'nino', profile_visibility: 'public' })
    mocks.setModulePublic.mockResolvedValue(undefined)
    mocks.setDomainVisibility.mockResolvedValue(1)
    await mount(MOVIE)

    await act(async () => button(i18n.t('recordShare.profileMode'))!.click())
    await flush()

    const closed = document.querySelector('[data-testid="record-share-closed"]')!
    expect(closed.textContent).toContain(i18n.t('recordShare.notPublic'))
    // სამივე ფენა დახურულია: პროფილი პირადია, მოდული საჯარო არ არის
    expect(closed.querySelectorAll('li[data-open="false"]')).toHaveLength(3)

    await act(async () => button(i18n.t('recordShare.makePublic'))!.click())
    await flush()
    await flush()

    expect(mocks.updateProfile).toHaveBeenCalledTimes(1)
    expect(mocks.setModulePublic).toHaveBeenCalledWith('movie', true)
    expect(mocks.setDomainVisibility).toHaveBeenCalledWith('movie', 'public', { ids: [5] })
    // გახსნის შემდეგ ბმული ჩანს
    expect(document.querySelector('[data-testid="record-share-result"]')).not.toBeNull()
  })

  it('needs a username for the personal link', async () => {
    mocks.auth.user = { username: null, profile_visibility: 'private' }
    await mount(MOVIE)

    await act(async () => button(i18n.t('recordShare.profileMode'))!.click())
    await flush()

    expect(document.querySelector('[data-testid="record-share-no-username"]')).not.toBeNull()
    expect(mocks.fetchGuestRecord).not.toHaveBeenCalled()
  })
})

describe('useRecordShare', () => {
  it('gives every module the same menu item, which opens the window', async () => {
    await render(({ RecordShareProvider, useRecordShare }) => {
      const Probe = () => {
        const share = useRecordShare()
        const item = share.action(MOVIE)

        return h('button', { type: 'button', 'data-testid': 'probe', onClick: item.run }, item.label)
      }

      return h(RecordShareProvider, null, h(Probe))
    })

    const probe = document.querySelector<HTMLButtonElement>('[data-testid="probe"]')!
    expect(probe.textContent).toBe(i18n.t('recordShare.action'))

    await act(async () => probe.click())
    await flush()

    expect(document.body.textContent).toContain(i18n.t('recordShare.linkMode'))
    expect(document.body.textContent).toContain('Taken')
  })
})
