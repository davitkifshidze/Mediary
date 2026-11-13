import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import type { ShareDomainKey } from '@/api/shareLinks'
import type { ShareImportSource } from '@/components/ui/queue'

/* ============================================================
   **რიგის `cast` სახეობა**.

   ⚠️ მთავარი გაფრთხილება: მსახიობის შტო `syncItem`-ის **ზოგად**
   შტომდე უნდა იდგეს — თორემ ერთეული ჩუმად ჩანაწერის სინქრონად წავა
   (`/media/sync/movie/{მსახიობის id}`) და სხვა ფილმს გადააწერს. ეს
   ტიპებსაც და lint-საც უხილავია: ორივე გზა ერთი და იმავე ფორმის
   `{ ok, error, skipped }`-ს აბრუნებს. მხოლოდ მონტირება ამბობს, **რომელ**
   endpoint-ს დაუძახა რიგმა.

   ⚠️ მეორე შემოწმება — გამოტოვების **მიზეზი**: „TMDB-ზე არაფერია"
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
    /* ერთეულს გაშვების გასაღები და დაგეგმილი რიცხვი თან მიჰყვება — სერვერი შედეგს ამით
       წერს სინქრონიზაციის ისტორიაში */
    expect(mocks.syncActor).toHaveBeenCalledWith(
      7,
      { fields: ['biography'], run: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-/), run_total: 1 },
      expect.any(AbortSignal),
    )
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

describe('queue: a missing key', () => {
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
 * სათაურის სია ხელით იყო ჩამოწერილი და `import` გამორჩა,
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
   **რიგის `share` სახეობა**.

   ⚠️ ერთეულის `itemId` **გამზიარებლის** ჩანაწერია — ზოგად `syncItem`-ზე
   ჩავარდნილი შტო მას ჩემი ბიბლიოთეკის id-ად წაიკითხავდა და სხვა ფილმს
   გადააწერდა (`cast`-ის იგივე საფრთხე). ⚠️ „ურნაშია" ჩავარდნად კი არა,
   ცალკე ითვლება და მწკრივი „აღდგენას" სთავაზობს.
   ============================================================ */

const shareMocks = vi.hoisted(() => ({ addShareItem: vi.fn(), addProfileItem: vi.fn(), restoreFromTrash: vi.fn() }))

vi.mock('@/api/shareLinks', async (original) => ({
  ...(await original<typeof import('@/api/shareLinks')>()),
  addShareItem: shareMocks.addShareItem,
}))

vi.mock('@/api/publicProfile', async (original) => ({
  ...(await original<typeof import('@/api/publicProfile')>()),
  addProfileItem: shareMocks.addProfileItem,
}))

vi.mock('@/api/trash', async (original) => ({
  ...(await original<typeof import('@/api/trash')>()),
  restoreFromTrash: shareMocks.restoreFromTrash,
}))

async function runOneShare(
  domain: ShareDomainKey = 'movie',
  source: ShareImportSource = { kind: 'link', token: 'T'.repeat(48), owner: 'alice' },
) {
  const { QueueProvider, useQueue } = await import('@/components/ui/queue')

  function Starter() {
    const { enqueueShare } = useQueue()

    useEffect(() => {
      enqueueShare(source, domain, [{ id: 5, title: 'Ran' }], 'owner')
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

  /* ⚠️ ერთეულის სექცია ცალკე ველია (`shareDomain`): `mediaType`
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

  // ⚠️ პროფილის ერთეული პროფილის კარით მიდის — ბმულის endpoint-ს ტოკენი არ აქვს
  it('adds a profile item through the profile endpoint', async () => {
    shareMocks.addProfileItem.mockResolvedValue({ ok: true, result: 'added', id: 42, partial: false, poster_skipped: null })

    await runOneShare('movie', { kind: 'profile', owner: 'davit' })

    expect(shareMocks.addProfileItem).toHaveBeenCalledWith('davit', 'movie', 5, 'owner', expect.any(AbortSignal))
    expect(shareMocks.addShareItem).not.toHaveBeenCalled()
  })
})

/* ============================================================
   **სინქრონის ოთხი შედეგი რიგში**.

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

describe('queue: the four sync outcomes', () => {
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
    // „აღარ განაახლო" სტრიქონზევეა
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes(i18n.t('queue.pauseOne')))).toBe(true)
  })

  it('a failure shows its reason and counts as failed', async () => {
    mocks.syncItem.mockResolvedValue({ ok: false, skipped: false, changed: [], result: 'failed', error: 'tmdb_unavailable', title: 'Dune' })

    const text = (await runOneSync()).textContent ?? ''

    expect(text).toContain(i18n.t('queue.summary.failed', { count: 1 }))
    expect(text).toContain(i18n.t('queue.failed', { count: 1 }))
  })
})

/* ============================================================
   **გაშვება, რომელიც გაწყვეტის შემდეგ გრძელდება**.

   ⚠️ რიგი გაშვების დასაწყისში სერვერს ეუბნება, რაზე და რით ეშვება (`openSyncRun`) —
   იმავე გასაღებით, რომელიც მერე ყოველ ერთეულს მიჰყვება; „დანარჩენის გაჩერება" გაშვებას
   სერვერზეც აჩერებს (`stopSyncRun`), რომ ისტორიაში მაშინვე „გაწყვეტილი" იყოს; სერვერზე
   გადაცემული დარჩენილი ნაწილი იმავე გაშვებას ავსებს და არა ახალს.
   ============================================================ */

// ⚠️ ნაგულისხმევი პასუხი აქვეა: რიგი ამ ორს ამ ფაილის ყველა ტესტში იძახებს
const runMocks = vi.hoisted(() => ({
  openSyncRun: vi.fn(async (..._args: unknown[]) => undefined),
  stopSyncRun: vi.fn(async (..._args: unknown[]) => undefined),
  startBatch: vi.fn(),
  fetchBatch: vi.fn(),
}))

vi.mock('@/api/syncRuns', async (original) => ({
  ...(await original<typeof import('@/api/syncRuns')>()),
  openSyncRun: runMocks.openSyncRun,
  stopSyncRun: runMocks.stopSyncRun,
}))

vi.mock('@/api/batches', async (original) => ({
  ...(await original<typeof import('@/api/batches')>()),
  startBatch: runMocks.startBatch,
  fetchBatch: runMocks.fetchBatch,
}))

const OPTS = { fields: ['title' as const], overwrite: true }

/** ორი ფილმი რიგში: პირველი „მუშავდება" (პასუხი არ მოდის), მეორე ელოდება */
async function runTwoMovies() {
  const { QueueProvider, useQueue } = await import('@/components/ui/queue')
  mocks.syncItem.mockReturnValue(new Promise(() => {}))

  function Starter() {
    const { enqueueSync } = useQueue()

    useEffect(() => {
      enqueueSync(
        [
          { type: 'movie', id: 1, title: 'First film', year: null },
          { type: 'movie', id: 2, title: 'Second film', year: null },
        ],
        OPTS,
      )
    }, [enqueueSync])

    return null
  }

  return render(h(QueueProvider, null, h(Starter)))
}

const panelButton = (el: Element, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label))

describe('queue: a run that can be continued', () => {
  it('tells the server what the run covers, under the key its items carry', async () => {
    await runTwoMovies()

    expect(runMocks.openSyncRun).toHaveBeenCalledTimes(1)
    const [key, kind, planned, params] = runMocks.openSyncRun.mock.calls[0]
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(kind).toBe('sync')
    // გეგმა მხოლოდ ტიპი და id-ია; პარამეტრები — რითაც ერთეულები ეშვება
    expect(planned).toEqual([
      { type: 'movie', id: 1 },
      { type: 'movie', id: 2 },
    ])
    expect(params).toEqual(OPTS)

    // იგივე გასაღები და იგივე რიცხვი მიჰყვება ერთეულს
    expect(mocks.syncItem).toHaveBeenCalledWith('movie', 1, { ...OPTS, run: key, run_total: 2 }, expect.any(AbortSignal))
  })

  it('stops the run on the server when the rest is cancelled', async () => {
    const el = await runTwoMovies()
    const key = runMocks.openSyncRun.mock.calls[0][0]

    await act(async () => panelButton(el, i18n.t('queue.cancel'))!.click())
    await flush()

    expect(runMocks.stopSyncRun).toHaveBeenCalledTimes(1)
    expect(runMocks.stopSyncRun).toHaveBeenCalledWith(key)
  })

  it('hands the rest to the server as a part of the same run', async () => {
    runMocks.startBatch.mockResolvedValue({ id: 'b-1', finished: false })
    runMocks.fetchBatch.mockResolvedValue({ id: 'b-1', finished: true, items: [] })
    const el = await runTwoMovies()
    const key = runMocks.openSyncRun.mock.calls[0][0]

    await act(async () => panelButton(el, i18n.t('queue.handOff'))!.click())
    await flush()

    // გადაეცემა მხოლოდ ის, რაც ჯერ არ დაწყებულა — იმავე პარამეტრებითა და გაშვების გასაღებით
    expect(runMocks.startBatch).toHaveBeenCalledWith('sync', [{ type: 'movie', id: 2 }], OPTS, key)
  })
})

/* ============================================================
   **თარგმანი ნაწილებად და მსახიობის ერთეული**.

   ⚠️ ერთი ნაწილის გაშვება სხვას არ ეხება — ჩანაწერის მოთხოვნას არჩეული ველები მიჰყვება;
   მსახიობის ერთეული (ქართული სახელი და ბიოგრაფია) თავის endpoint-ზე მიდის და არა ჩანაწერის
   თარგმანზე; გაშვების დასაწყისი სერვერს ორივეს ეუბნება. Gemini-ს დღიური ლიმიტის
   ამოწურვაზე რიგი ჩერდება და გაშვება სერვერზეც „გაწყვეტილი" ხდება — მეორე დღეს იქიდან
   გრძელდება.
   ============================================================ */

const translateMocks = vi.hoisted(() => ({ translateItem: vi.fn(), translateActor: vi.fn() }))

// ერთეულებს შორის პაუზა (თარგმანზე ნაგულისხმევად 4 წამი) ტესტს არ სჭირდება — რიგი მაშინვე გრძელდება
vi.mock('@/lib/settings', async (original) => {
  const actual = await original<typeof import('@/lib/settings')>()
  // ⚠️ კონტექსტის ჰუკი ყოველ გამოძახებაზე ერთსა და იმავე ობიექტს აბრუნებს
  const fast = { settings: { syncDelayMs: 0, translateDelayMs: 0 }, set: () => {}, isDirty: () => false }

  return { ...actual, useSettings: () => fast }
})

vi.mock('@/api/translations', async (original) => ({
  ...(await original<typeof import('@/api/translations')>()),
  translateItem: translateMocks.translateItem,
  translateActor: translateMocks.translateActor,
}))

/** ერთი ჩანაწერი და ორი მსახიობი — ნაწილებად გაშვებული თარგმანი */
async function runTranslation() {
  const { QueueProvider, useQueue } = await import('@/components/ui/queue')

  function Starter() {
    const { enqueueTranslate } = useQueue()

    useEffect(() => {
      enqueueTranslate(
        [{ type: 'movie', id: 1, title: 'The Matrix', year: 1999, missing: ['title_ka'], review: false }],
        false,
        ['gemini'],
        false,
        {
          fields: ['title_ka'],
          cast: [
            { type: 'actor', id: 7, title: 'Keanu Reeves', missing: ['name', 'biography'] },
            { type: 'actor', id: 8, title: 'Carrie-Anne Moss', missing: ['biography'] },
          ],
        },
      )
    }, [enqueueTranslate])

    return null
  }

  return render(h(QueueProvider, null, h(Starter)))
}

describe('queue: translation in parts', () => {
  it('sends the chosen fields with a record and an actor to its own endpoint', async () => {
    translateMocks.translateItem.mockResolvedValue({ ok: true, skipped: false, changed: ['title_ka'], result: 'updated', error: null })
    translateMocks.translateActor.mockResolvedValue({ ok: true, skipped: false, changed: ['biography_ka'], result: 'updated', error: null })

    await runTranslation()
    for (let i = 0; i < 8; i++) await flush()

    // გაშვების დასაწყისი: ჩანაწერიც და მსახიობებიც გეგმაშია, პარამეტრებში — რა ნაწილები გაეშვა
    const [key, kind, planned, params] = runMocks.openSyncRun.mock.calls[0]
    expect(kind).toBe('translate')
    expect(planned).toEqual([
      { type: 'movie', id: 1 },
      { type: 'actor', id: 7 },
      { type: 'actor', id: 8 },
    ])
    expect(params).toEqual({ sources: ['gemini'], review: false, fields: ['title_ka'], cast: ['name', 'biography'] })

    // ჩანაწერს მხოლოდ არჩეული ველი მიჰყვება
    expect(translateMocks.translateItem).toHaveBeenCalledTimes(1)
    expect(translateMocks.translateItem).toHaveBeenCalledWith('movie', 1, ['gemini'], false, expect.any(AbortSignal), { run: key, run_total: 3 }, ['title_ka'])
    // მსახიობი — თავის endpoint-ზე, იმით, რაც მას აკლია
    expect(translateMocks.translateActor.mock.calls.map((call) => [call[0], call[1], call[3]])).toEqual([
      [7, { fields: ['name', 'biography'], sources: ['gemini'] }, { run: key, run_total: 3 }],
      [8, { fields: ['biography'], sources: ['gemini'] }, { run: key, run_total: 3 }],
    ])
  })

  it('stops the run when the daily limit runs out, without trying the rest', async () => {
    translateMocks.translateItem.mockResolvedValue({ ok: true, skipped: false, changed: ['title_ka'], result: 'updated', error: null })
    translateMocks.translateActor.mockResolvedValue({ ok: false, skipped: false, changed: [], result: null, error: 'gemini_quota_exceeded' })

    await runTranslation()
    for (let i = 0; i < 8; i++) await flush()

    // პირველივე მსახიობზე ლიმიტი ამოიწურა — მეორეს რიგი აღარ ცდის
    expect(translateMocks.translateActor).toHaveBeenCalledTimes(1)
    // გაშვება სერვერზეც ჩერდება: ისტორიაში „გაწყვეტილია" და იქიდან გრძელდება
    expect(runMocks.stopSyncRun).toHaveBeenCalledTimes(1)
    expect(runMocks.stopSyncRun).toHaveBeenCalledWith(runMocks.openSyncRun.mock.calls[0][0])
  })
})
