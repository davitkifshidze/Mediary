import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'

/* ============================================================
   **რიგის `cast` სახეობა** (Tasks §39.3).

   ⚠️ §39.3 პირდაპირ აფრთხილებს: მსახიობის შტო `syncItem`-ის **ზოგად**
   შტომდე უნდა იდგეს — თორემ ერთეული ჩუმად ჩანაწერის სინქრონად წავა
   (`/media/sync/movie/{მსახიობის id}`) და სხვა ფილმს გადააწერს. ეს
   ტიპებსაც და lint-საც უხილავია: ორივე გზა ერთი და იმავე ფორმის
   `{ ok, error, skipped }`-ს აბრუნებს. მხოლოდ მონტირება ამბობს, **რომელ**
   endpoint-ს დაუძახა რიგმა.

   ⚠️ მეორე შემოწმება — გამოტოვების **მიზეზი** (§39.6): „TMDB-ზე არაფერია"
   და „უცვლელია" ორივე `skipped`-ია, და საერთო „გამოტოვდა" მათ აურევდა.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  syncActor: vi.fn(),
  syncItem: vi.fn(),
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  syncActor: mocks.syncActor,
  syncItem: mocks.syncItem,
}))

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

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

async function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(h(QueryClientProvider, { client: qc }, node))
  })
  await flush()
  await flush()

  return container
}

/** რიგში ერთი მსახიობი — ზუსტად ისე, როგორც სინქრონიზაციის ფანჯარა აკეთებს */
async function runOneActor() {
  const { QueueProvider, useQueue } = await import('@/components/ui/queue')

  function Starter() {
    const { enqueueCast } = useQueue()

    useEffect(() => {
      enqueueCast([{ type: 'actor', id: 7, title: 'Anna' }], { fields: ['biography'] })
    }, [enqueueCast])

    return null
  }

  return render(h(QueueProvider, null, h(Starter)))
}

describe('queue: the cast kind', () => {
  it('sends an actor to the actor endpoint and never to the record sync', async () => {
    mocks.syncActor.mockResolvedValue({ ok: true, skipped: false, result: 'updated', error: null, title: 'Anna' })

    await runOneActor()

    expect(mocks.syncActor).toHaveBeenCalledTimes(1)
    expect(mocks.syncActor).toHaveBeenCalledWith(7, { fields: ['biography'] }, expect.any(AbortSignal))
    expect(mocks.syncItem).not.toHaveBeenCalled()
  })

  it('says why an actor was skipped and sums the run up', async () => {
    mocks.syncActor.mockResolvedValue({ ok: true, skipped: true, result: 'tmdb_empty', error: null, title: 'Anna' })

    const el = await runOneActor()
    const text = el.textContent ?? ''

    // ⚠️ საერთო „ჩანაწერი ვეღარ მოიძებნა" აქ ტყუილი იქნებოდა
    expect(text).toContain(i18n.t('castSync.result.tmdbEmpty'))
    expect(text).not.toContain(i18n.t('queue.itemSkipped'))
    expect(text).toContain(i18n.t('castSync.summary.empty', { count: 1 }))
  })
})
