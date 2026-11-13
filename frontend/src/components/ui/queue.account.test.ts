import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'

/* ============================================================
   **რიგი ანგარიშისაა.**

   ⚠️ `QueueProvider` როუტერის ზემოთ დგას და გასვლას, სესიის გაწყვეტას და
   შემდეგ შესვლას გადაურჩებოდა: წინა ანგარიშის ჩანაწერების სათაურები
   `/login`-ზეც ჩანდა, „გაიმეორე" კი მათ ახალ ანგარიშში ქმნიდა. მომხმარებლის
   შეცვლაზე რიგი სუფთავდება და მიმდინარე მოთხოვნა წყდება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  // ⚠️ ტესტი ობიექტს განზრახ ცვლის — ეს სწორედ „სხვა ანგარიშია"; რენდერებს შორის ის უცვლელია
  auth: { user: { id: 1 } as { id: number } | null },
  syncActor: vi.fn(),
  signal: null as AbortSignal | null,
}))

vi.mock('@/lib/auth', () => ({ useAuth: () => mocks.auth }))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  syncActor: mocks.syncActor,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
let rerender: () => void = () => {}
let queue: ReturnType<typeof import('@/components/ui/queue').useQueue>

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.auth = { user: { id: 1 } }
  vi.clearAllMocks()
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mountWithARunningItem() {
  const { QueueProvider, useQueue } = await import('@/components/ui/queue')

  // მოთხოვნა არასდროს სრულდება — ერთეული „მიმდინარეა", სანამ რიგი არ გასუფთავდება
  mocks.syncActor.mockImplementation((_id: number, _opts: unknown, signal: AbortSignal) => {
    mocks.signal = signal
    return new Promise(() => {})
  })

  function Starter() {
    queue = useQueue()
    const { enqueueCast } = queue

    useEffect(() => {
      enqueueCast(
        [
          { type: 'actor', id: 7, title: 'Anna of the first account' },
          { type: 'actor', id: 8, title: 'Second actor' },
        ],
        { fields: ['biography'] },
      )
    }, [enqueueCast])

    return null
  }

  function App() {
    const [, setTick] = useState(0)
    rerender = () => setTick((x) => x + 1)

    return h(QueueProvider, null, h(Starter))
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(App))))
  await flush()
  await flush()
}

async function switchAccount(user: { id: number } | null) {
  mocks.auth = { user }
  await act(async () => rerender())
  await flush()
}

describe('queue: the account', () => {
  it('გასვლაზე რიგი სუფთავდება და მიმდინარე მოთხოვნა წყდება', async () => {
    await mountWithARunningItem()

    expect(queue.active).toBe(2)
    expect(document.body.textContent).toContain('Anna of the first account')
    expect(mocks.signal?.aborted).toBe(false)

    await switchAccount(null)

    expect(queue.active).toBe(0)
    expect(queue.isBusy).toBe(false)
    expect(document.body.textContent).not.toContain('Anna of the first account')
    expect(mocks.signal?.aborted).toBe(true)
  })

  it('სხვა ანგარიშით შესვლა წინა ანგარიშის რიგს არ იღებს', async () => {
    await mountWithARunningItem()

    await switchAccount({ id: 2 })

    expect(queue.active).toBe(0)
    expect(document.body.textContent).not.toContain('Second actor')
    // რიგში დარჩენილი მეორე ერთეული ახალ ანგარიშში აღარ გაეშვა
    expect(mocks.syncActor).toHaveBeenCalledTimes(1)
  })

  it('იგივე ანგარიშის ხელახალი რენდერი რიგს არ ეხება', async () => {
    await mountWithARunningItem()

    mocks.auth = { user: { id: 1 } }
    await act(async () => rerender())
    await flush()

    expect(queue.active).toBe(2)
    expect(mocks.signal?.aborted).toBe(false)
  })
})
