import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CastSyncFilters, CastSyncPlan, CastSyncPlanItem } from '@/api/media'
import i18n from '@/i18n'

/* ============================================================
   **მსახიობების ნაკადის გაშვება** (Tasks §39).

   ⚠️ **რიგი გაშვების პასუხიდან ივსება და არა ეკრანზე მდგარი გეგმიდან**:
   სერვერი `start: true`-ზე ჟურნალში ზუსტად იმ რიცხვს წერს, რაც რიგში
   ჩადგება (`/purge`-ის „დათვლილი = გაშვებული"). ეკრანის ძველი გეგმით
   რიგის შევსება ამ ორ რიცხვს ჩუმად დააშორებდა — და ამას ვერც ტიპები
   ხედავს, ვერც backend-ის ტესტი: ორივე ერთსა და იმავე ფორმას იღებს.

   ⚠️ **ველები გადახედვის გასაღებში არ ზის, გაშვებაში კი — ზის**: ჟურნალი
   „რა ველებით" სწორედ მათ წერს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchCastSyncPlan: vi.fn(),
  enqueueCast: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  fetchCastSyncPlan: mocks.fetchCastSyncPlan,
}))

vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => ({ enqueueCast: mocks.enqueueCast, isBusy: false }),
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* ⚠️ jsdom-ს `ResizeObserver` არ აქვს — Radix-ის რადიოს და ჩამრთველს ის სჭირდება */
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const actor = (id: number, title: string): CastSyncPlanItem => ({ type: 'actor', id, title })

function plan(items: CastSyncPlanItem[]): CastSyncPlan {
  return {
    types: ['movie'],
    items,
    count: items.length,
    eta_seconds: 60,
    skipped_without_tmdb: 0,
    pool_total: 10,
    never_synced: items.length,
    cast: [],
    cast_truncated: false,
    tmdb: true,
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(async () => {
  await import('@/components/CastSyncFlow')
}, 60_000)

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

async function mount(onClose = vi.fn()) {
  const { CastSyncFlow } = await import('@/components/CastSyncFlow')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      // ⚠️ Router — „გასაღები არ გაქვს"-ის შეტყობინებაში „მონაცემების" ბმულია (§30.6)
      h(
        MemoryRouter,
        null,
        h(
          QueryClientProvider,
          { client: qc },
          h(TooltipProvider, null, h(CastSyncFlow, { open: true, active: true, types: ['movie'], onClose })),
        ),
      ),
    )
  })
  await flush()
  await flush()

  return { el: container, onClose }
}

function runButton(el: HTMLElement): HTMLButtonElement {
  const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('sync.run')))
  if (!button) throw new Error('run button not found')
  return button as HTMLButtonElement
}

describe('CastSyncFlow', () => {
  it('fills the queue from the start answer and sends the chosen fields', async () => {
    const preview = plan([actor(1, 'Anna'), actor(2, 'Bob')])
    // ⚠️ გაშვებამდე ერთი მსახიობი დაემატა — რიგი **ამას** უნდა ჩაუჯდეს
    const started = plan([actor(1, 'Anna'), actor(2, 'Bob'), actor(3, 'Cleo')])

    mocks.fetchCastSyncPlan.mockImplementation(async (filters: CastSyncFilters) =>
      filters.start ? started : preview,
    )

    const { el, onClose } = await mount()

    // გადახედვა ჟურნალს არ ეხება — `start` მხოლოდ ღილაკზე მიდის
    expect(mocks.fetchCastSyncPlan).toHaveBeenCalled()
    expect(mocks.fetchCastSyncPlan.mock.calls.every(([f]) => !(f as CastSyncFilters).start)).toBe(true)
    expect(el.textContent).toContain(i18n.t('castSync.affected', { count: 2 }))

    await act(async () => {
      runButton(el).click()
    })
    await flush()

    const startCall = mocks.fetchCastSyncPlan.mock.calls.find(([f]) => (f as CastSyncFilters).start)
    expect(startCall?.[0]).toMatchObject({
      start: true,
      scope: 'never',
      types: ['movie'],
      fields: ['details', 'biography', 'links', 'photo'],
    })

    expect(mocks.enqueueCast).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueCast.mock.calls[0][0]).toEqual(started.items)
    expect(mocks.enqueueCast.mock.calls[0][1]).toEqual({
      fields: ['details', 'biography', 'links', 'photo'],
      overwrite_photo: undefined,
    })
    expect(onClose).toHaveBeenCalled()
  })

  /** Tasks §30.6 — „შენი TMDB-ის გასაღები არ გაქვს" + ბმული „მონაცემებზე" */
  it('keeps the run button off and points to Credentials without a TMDB key', async () => {
    mocks.fetchCastSyncPlan.mockResolvedValue({ ...plan([actor(1, 'Anna')]), tmdb: false })

    const { el } = await mount()

    expect(runButton(el).disabled).toBe(true)
    expect(el.textContent).toContain(i18n.t('errors.credential_missing_for', { provider: 'TMDB' }))
    expect(el.querySelector('a[href="/credentials"]')).not.toBeNull()
  })
})
