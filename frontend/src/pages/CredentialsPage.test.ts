import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Credential, CredentialField } from '@/api/credentials'
import i18n from '@/i18n'

/* ============================================================
   **„მონაცემები" — ბარათები და რედაქტირების მოდალი (Tasks §30).**

   ⚠️ მოწმდება ის, რასაც ტიპი ვერ ხედავს: წყაროები ჯგუფებშია, ყოველ
   ბარათს თავისი მდგომარეობა აქვს (ჩემი · შეუვსებელი · გამორთული · არ არის ·
   ვერ იშიფრება), ბარათზე დაჭერა მოდალს ხსნის და **შენახვა მხოლოდ
   შეცვლილ ველს აგზავნის** — ცარიელი საიდუმლო backend-ზე „წაშლას"
   ნიშნავს, ე.ი. მისი გაგზავნა ჩუმად წაშლიდა ჩაწერილ გასაღებს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  save: vi.fn(async () => ({})),
  test: vi.fn(async () => ({ ok: true, error: null, data: {} })),
  installation: [] as { key: string; value: string | null }[],
}))

const secret = (name: string, has_own: boolean): CredentialField => ({
  name,
  secret: true,
  required: true,
  has_own,
  value: null,
  masked: has_own ? '••••••••••••a1b2' : null,
  default: null,
})

function credential(provider: string, over: Partial<Credential> = {}): Credential {
  return {
    provider,
    source: 'none',
    undecryptable: false,
    configured: false,
    is_active: true,
    verified_at: null,
    last_error: null,
    docs: null,
    modules: [],
    test_costs_credit: false,
    fields: [secret('key', false)],
    limits: [],
    usage: null,
    ...over,
  }
}

const data: Credential[] = [
  credential('tmdb', { source: 'user', configured: true, verified_at: '2026-09-27T10:00:00+04:00', fields: [secret('key', true)] }),
  credential('gemini', {
    source: 'user',
    configured: true,
    fields: [secret('key', true), { ...secret('model', false), secret: false, required: false, default: 'gemini-3.5-flash' }],
    limits: [{ name: 'daily', own: null, default: 1500, effective: 1500 }],
    usage: { used: 30, limit: 1500, remaining: 1470, period: 'day' },
  }),
  credential('rawg'),
  credential('igdb', {
    fields: [{ ...secret('client_id', true), secret: false }, secret('client_secret', false)],
  }),
  credential('serpapi'),
  credential('serper', { source: 'user', configured: true, test_costs_credit: true, fields: [secret('key', true)] }),
  credential('youtube', { undecryptable: true }),
  credential('telegram', { is_active: false, fields: [secret('bot_token', true), { ...secret('chat_id', true), secret: false }] }),
]

vi.mock('@/api/credentials', async (original) => ({
  ...(await original<typeof import('@/api/credentials')>()),
  fetchCredentials: vi.fn(async () => ({ data, installation: mocks.installation })),
  saveCredential: mocks.save,
  testCredential: mocks.test,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* ⚠️ jsdom-ს `ResizeObserver` არ აქვს — Radix-ის ჩამრთველს ის სჭირდება */
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
  root = null
  container = null
  mocks.installation = []
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  const { CredentialsPage } = await import('@/pages/CredentialsPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        null,
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(CredentialsPage)))),
      ),
    ),
  )
  await flush()
}

/** ბარათი ბრენდის სახელით */
const tile = (brand: string) =>
  [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === i18n.t('credentials.editTitle', { name: brand })) as
    | HTMLButtonElement
    | undefined

const buttonByText = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('CredentialsPage', () => {
  it('groups the sources and gives every card its own state', async () => {
    await mount()

    const headings = [...document.querySelectorAll('h2')].map((el) => el.textContent)
    for (const group of ['media', 'translation', 'web', 'notify']) {
      expect(headings).toContain(i18n.t(`credentials.group.${group}`))
    }

    expect(tile('TMDB')?.textContent).toContain(i18n.t('credentials.state.mine'))
    expect(tile('RAWG.io')?.textContent).toContain(i18n.t('credentials.state.none'))
    expect(tile('RAWG.io')?.textContent).toContain(i18n.t('credentials.cta.none'))
    expect(tile('IGDB (Twitch)')?.textContent).toContain(i18n.t('credentials.state.partial'))
    expect(tile('YouTube Data API')?.textContent).toContain(i18n.t('credentials.state.undecryptable'))
    expect(tile('Telegram')?.textContent).toContain(i18n.t('credentials.state.off'))

    // ცოცხალი ფაქტი — რამდენი წყაროა დაკავშირებული
    expect(document.body.textContent).toContain(i18n.t('credentials.connected', { count: 3, total: 8 }))
  })

  it('draws the usage bar only on a source that has a quota', async () => {
    await mount()

    expect(tile('Google Gemini')?.textContent).toContain('30 / 1500')
    expect(tile('TMDB')?.textContent).not.toContain(i18n.t('credentials.usageDay'))
  })

  it('opens the editor from the card', async () => {
    await mount()

    await act(async () => tile('RAWG.io')!.click())
    await flush()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('RAWG.io')
    expect(dialog?.textContent).toContain(i18n.t('credentials.field.key'))
  })

  /* ⚠️ **ცარიელი საიდუმლო backend-ზე „წაშლაა"** — ამიტომ მხოლოდ შეცვლილი ველი
     მიდის: მოდელის შეცვლამ ჩაწერილი (და ფორმაში ცარიელი) გასაღები არ უნდა გაგზავნოს */
  it('saves only the field that was changed', async () => {
    await mount()

    await act(async () => tile('Google Gemini')!.click())
    await flush()

    const model = document.querySelector('[role="dialog"] input[placeholder="gemini-3.5-flash"]') as HTMLInputElement
    await act(async () => typeInto(model, 'gemini-x'))

    await act(async () => buttonByText(i18n.t('actions.save'))!.click())
    await flush()

    expect(mocks.save).toHaveBeenCalledWith('gemini', { fields: { model: 'gemini-x' }, limits: {} })
  })

  it('sends a newly typed key for a source that had none', async () => {
    await mount()

    await act(async () => tile('RAWG.io')!.click())
    await flush()

    const input = document.querySelector('[role="dialog"] input') as HTMLInputElement
    await act(async () => typeInto(input, 'rawg-secret'))

    await act(async () => buttonByText(i18n.t('actions.save'))!.click())
    await flush()

    expect(mocks.save).toHaveBeenCalledWith('rawg', { fields: { key: 'rawg-secret' }, limits: {} })
  })

  /* ⚠️ Serper-ის შემოწმება კრედიტს ხარჯავს — სერვერი დასტურს ითხოვს */
  it('checks a paid source with an explicit confirmation', async () => {
    await mount()

    await act(async () => tile('Serper.dev')!.click())
    await flush()

    await act(async () => buttonByText(i18n.t('credentials.testPaid'))!.click())
    await flush()

    expect(mocks.test).toHaveBeenCalledWith('serper', true)
  })

  it('shows the installation block only when the server sends it', async () => {
    await mount()
    expect(document.body.textContent).not.toContain(i18n.t('credentials.installation'))

    act(() => root?.unmount())
    container?.remove()

    mocks.installation = [{ key: 'YTDLP_BINARY', value: 'C:/yt-dlp.exe' }]
    await mount()

    expect(document.body.textContent).toContain(i18n.t('credentials.installation'))
    expect(document.body.textContent).toContain('YTDLP_BINARY')
  })
})
