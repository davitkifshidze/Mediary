import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import type { ShareDomainKey } from '@/api/shareLinks'

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

describe('queue: a missing key (Tasks §30.6)', () => {
  /* A missing personal key is not a fact about one record: every later item of the
     same kind would fail identically, so the queue drops them and names the source. */
  it('stops the same kind and names the source instead of failing every record', async () => {
    const error = Object.assign(new Error('Request failed with status code 409'), {
      isAxiosError: true,
      response: { status: 409, data: { message: 'credential_missing', provider: 'tmdb' } },
    })
    mocks.syncItem.mockRejectedValue(error)

    const { QueueProvider, useQueue } = await import('@/components/ui/queue')

    function Starter() {
      const { enqueueSync } = useQueue()

      useEffect(() => {
        enqueueSync(
          [
            { type: 'movie', id: 1, title: 'First film', year: null },
            { type: 'movie', id: 2, title: 'Second film', year: null },
          ],
          { fields: ['title'] },
        )
      }, [enqueueSync])

      return null
    }

    const el = await render(h(QueueProvider, null, h(Starter)))
    await flush()
    await flush()

    expect(mocks.syncItem).toHaveBeenCalledTimes(1)
    expect(el.textContent).toContain(i18n.t('errors.credential_missing_for', { provider: 'TMDB' }))
    expect(el.textContent).not.toContain('Second film')
  })
})

/**
 * Tasks §40.1ბ — სათაურის სია ხელით იყო ჩამოწერილი და `import` გამორჩა,
 * ე.ი. იმპორტის რიგი „ემატება…"-ს წერდა „იმპორტდება…"-ს ნაცვლად.
 */
describe('queue: the headline kind', () => {
  it('names an import run as an import, not as adding', async () => {
    const { headlineKindOf } = await import('@/components/ui/queue')
    expect(headlineKindOf(['import', 'import'])).toBe('import')
  })

  it('falls back to adding only when nothing more specific runs', async () => {
    const { headlineKindOf } = await import('@/components/ui/queue')
    expect(headlineKindOf(['add'])).toBe('add')
    expect(headlineKindOf([])).toBe('add')
    expect(headlineKindOf(['add', 'sync'])).toBe('sync')
  })
})

/* ============================================================
   **რიგის `share` სახეობა** (Tasks §40.9).

   ⚠️ ერთეულის `itemId` **გამზიარებლის** ჩანაწერია — ზოგად `syncItem`-ზე
   ჩავარდნილი შტო მას ჩემი ბიბლიოთეკის id-ად წაიკითხავდა და სხვა ფილმს
   გადააწერდა (`cast`-ის იგივე საფრთხე). ⚠️ „ურნაშია" ჩავარდნად კი არა,
   ცალკე ითვლება და მწკრივი „აღდგენას" სთავაზობს (40.1).
   ============================================================ */

const shareMocks = vi.hoisted(() => ({ addShareItem: vi.fn(), restoreFromTrash: vi.fn() }))

vi.mock('@/api/shareLinks', async (original) => ({
  ...(await original<typeof import('@/api/shareLinks')>()),
  addShareItem: shareMocks.addShareItem,
}))

vi.mock('@/api/trash', async (original) => ({
  ...(await original<typeof import('@/api/trash')>()),
  restoreFromTrash: shareMocks.restoreFromTrash,
}))

async function runOneShare(domain: ShareDomainKey = 'movie') {
  const { QueueProvider, useQueue } = await import('@/components/ui/queue')

  function Starter() {
    const { enqueueShare } = useQueue()

    useEffect(() => {
      enqueueShare('T'.repeat(48), domain, [{ id: 5, title: 'Ran' }], 'owner')
    }, [enqueueShare])

    return null
  }

  const el = await render(h(QueueProvider, null, h(Starter)))
  await flush()
  await flush()

  return el
}

describe('queue: the share kind', () => {
  it('adds through the share endpoint with the item status mode, never the record sync', async () => {
    shareMocks.addShareItem.mockResolvedValue({ ok: true, result: 'added', id: 40, partial: false, poster_skipped: null })

    const el = await runOneShare()

    expect(shareMocks.addShareItem).toHaveBeenCalledWith('T'.repeat(48), 'movie', 5, 'owner', expect.any(AbortSignal))
    expect(mocks.syncItem).not.toHaveBeenCalled()
    expect(el.textContent).toContain(i18n.t('share.summary.added', { count: 1 }))
  })

  it('counts a record in my trash apart and offers to restore it', async () => {
    shareMocks.addShareItem.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: { status: 409, data: { message: 'record_in_trash', domain: 'movie', id: 77 } },
      }),
    )

    const el = await runOneShare()
    const text = el.textContent ?? ''

    expect(text).toContain(i18n.t('share.summary.trash', { count: 1 }))
    expect(text).not.toContain(i18n.t('share.summary.failed', { count: 1 }))
    expect(text).toContain(i18n.t('queue.restoreFromTrash'))
  })

  /* §40.10 — ⚠️ ერთეულის სექცია ცალკე ველია (`shareDomain`): `mediaType`
     მედია-დომენია და წიგნს `movie`-ად წაიკითხავდა — დამატებაც და ურნიდან
     აღდგენაც სხვა მოდულში წავიდოდა. */
  it('sends a stage-2 section as itself, not as a media type', async () => {
    shareMocks.addShareItem.mockResolvedValue({ ok: true, result: 'added', id: 41, partial: false, poster_skipped: null })

    await runOneShare('book')

    expect(shareMocks.addShareItem).toHaveBeenCalledWith('T'.repeat(48), 'book', 5, 'owner', expect.any(AbortSignal))
  })

  it('restores a stage-2 record from the trash of its own section', async () => {
    shareMocks.addShareItem.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: { status: 409, data: { message: 'record_in_trash', domain: 'book', id: 78 } },
      }),
    )
    shareMocks.restoreFromTrash.mockResolvedValue({ restored: true, with_parent: false, records: 0 })

    const el = await runOneShare('book')
    const restore = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('queue.restoreFromTrash')))
    expect(restore, '„აღდგენა" არ დაიხატა').toBeTruthy()

    await act(async () => restore!.click())
    await flush()

    expect(shareMocks.restoreFromTrash).toHaveBeenCalledWith('book', 78)
  })
})

/* ============================================================
   **სინქრონის ოთხი შედეგი რიგში** (Tasks §31.4/§31.6).

   ⚠️ აქამდე `changed` endpoint-იდან მოდიოდა და რიგი აგდებდა; ცარიელი TMDB-პასუხი
   მწვანე ✓ იყო, განახლებულის იდენტური. მოწმდება: განახლდა — რა შეიცვალა;
   უცვლელი — ტექსტით; ცარიელი — ქარვისფერი და არა წარმატება; ჩავარდა — ითვლება.
   ============================================================ */
async function runOneSync() {
  const { QueueProvider, useQueue } = await import('@/components/ui/queue')

  function Starter() {
    const { enqueueSync } = useQueue()

    useEffect(() => {
      enqueueSync([{ type: 'movie', id: 7, title: 'Dune', year: 2021 }], { fields: ['title'] })
    }, [enqueueSync])

    return null
  }

  return render(h(QueueProvider, null, h(Starter)))
}

describe('queue: the four sync outcomes (Tasks §31.4)', () => {
  it('names what changed on an updated record', async () => {
    mocks.syncItem.mockResolvedValue({ ok: true, skipped: false, changed: ['poster', 'description_ka'], result: 'updated', error: null, title: 'Dune' })

    const text = (await runOneSync()).textContent ?? ''

    expect(text).toContain(i18n.t('sync.changed.poster'))
    expect(text).toContain(i18n.t('sync.changed.description_ka'))
    expect(text).toContain(i18n.t('queue.summary.updated', { count: 1 }))
  })

  it('an unchanged record is grey and says so', async () => {
    mocks.syncItem.mockResolvedValue({ ok: true, skipped: false, changed: [], result: 'unchanged', error: null, title: 'Dune' })

    const text = (await runOneSync()).textContent ?? ''

    expect(text).toContain(i18n.t('queue.result.unchanged'))
    expect(text).toContain(i18n.t('queue.summary.unchanged', { count: 1 }))
    expect(text).not.toContain(i18n.t('queue.summary.updated', { count: 1 }))
  })

  it('an empty answer is amber and is not a success', async () => {
    mocks.syncItem.mockResolvedValue({ ok: true, skipped: false, changed: [], result: 'empty', error: null, title: 'Dune' })

    const el = await runOneSync()
    const text = el.textContent ?? ''

    expect(text).toContain(i18n.t('queue.result.empty'))
    expect(text).toContain(i18n.t('queue.summary.empty', { count: 1 }))
    expect(text).not.toContain(i18n.t('queue.summary.updated', { count: 1 }))
    expect(el.querySelector('.text-status-towatch')).not.toBeNull()
    // §31.3 — „აღარ განაახლო" სტრიქონზევეა
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes(i18n.t('queue.pauseOne')))).toBe(true)
  })

  it('a failure shows its reason and counts as failed', async () => {
    mocks.syncItem.mockResolvedValue({ ok: false, skipped: false, changed: [], result: 'failed', error: 'tmdb_unavailable', title: 'Dune' })

    const text = (await runOneSync()).textContent ?? ''

    expect(text).toContain(i18n.t('queue.summary.failed', { count: 1 }))
    expect(text).toContain(i18n.t('queue.failed', { count: 1 }))
  })
})
