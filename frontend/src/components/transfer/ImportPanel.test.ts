import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ImportPlan, ImportPlanModule } from '@/api/import'
import i18n from '@/i18n'

/* ============================================================
   იმპორტის ჩანართი: ფაილი → გეგმა (სერვერი ამოწმებს, რა დაემატება)
   → რიგი. CSV-ის ორაზროვნებაზე „წაიკითხე, როგორც …" ჩნდება. აწყობის დროს
   ფაილის არჩევა გამორთულია, ხოლო პასუხი, რომელიც ფაილის შეცვლის ან
   გაუქმების შემდეგ მოვიდა, იგდება და მისი დროებითი ასლი სერვერზე იშლება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  planImport: vi.fn(),
  discardImport: vi.fn(),
  fetchImportSources: vi.fn(),
  enqueueImport: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/import', async (original) => ({
  ...(await original<typeof import('@/api/import')>()),
  planImport: mocks.planImport,
  discardImport: mocks.discardImport,
  fetchImportSources: mocks.fetchImportSources,
}))

/* ⚠️ ერთი და იგივე ობიექტები ყოველ გამოძახებაზე */
const stable = vi.hoisted(() => ({
  queue: { enqueueImport: (...args: unknown[]) => mocks.enqueueImport(...args), isBusy: false },
  toast: { toast: (...args: unknown[]) => mocks.toast(...args), dismiss: () => {} },
  modules: {
    all: [
      { key: 'movie', name_ka: 'Movies', name_en: 'Movies', icon: null, color: null },
      { key: 'series', name_ka: 'Series', name_en: 'Series', icon: null, color: null },
      { key: 'anime', name_ka: 'Anime', name_en: 'Anime', icon: null, color: null },
    ],
  },
}))

vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => stable.queue,
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => stable.toast,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => stable.modules,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function apiError(status: number, data: Record<string, unknown>): AxiosError {
  const response = {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response)
}

const planModule = (source: string, over: Partial<ImportPlanModule> = {}): ImportPlanModule => ({
  source,
  module: source,
  reason: null,
  name_ka: null,
  name_en: null,
  total: 3,
  counts: { new: 2, duplicate: 1, invalid: 0 },
  items: [
    { index: 0, title: `${source} one`, year: 2001, state: 'new', reason: null },
    { index: 1, title: `${source} two`, year: null, state: 'duplicate', reason: 'exists' },
    { index: 2, title: `${source} three`, year: 2003, state: 'new', reason: null },
  ],
  ...over,
})

const plan = (token: string, modules: ImportPlanModule[], over: Partial<ImportPlan> = {}): ImportPlan => ({
  token,
  kind: 'json',
  name: 'movies.json',
  files: 0,
  truncated: false,
  max_rows: 5000,
  modules,
  ...over,
})

/** ხელით გასახსნელი პასუხი — „ნელი" სერვერი */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let ImportPanel: typeof import('@/components/transfer/ImportPanel').ImportPanel

beforeAll(async () => {
  ImportPanel = (await import('@/components/transfer/ImportPanel')).ImportPanel
}, 30_000)

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  root = null
  container = null
  vi.clearAllMocks()
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mount() {
  mocks.fetchImportSources.mockResolvedValue({ data: [], max_rows: 5000, limits: { file: 10240, archive: 102400 } })
  mocks.discardImport.mockResolvedValue(undefined)

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(ImportPanel)))),
  )
  await flush()
}

const text = () => container?.textContent ?? ''

const button = (label: string) =>
  [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes(label))

const fileInput = () => container!.querySelector<HTMLInputElement>('input[type="file"]')!

async function choose(name: string, type = 'application/json') {
  const file = new File(['{}'], name, { type })
  const input = fileInput()
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  return file
}

async function click(label: string) {
  await act(async () => button(label)!.click())
  await flush()
}

describe('ImportPanel', () => {
  it('builds a plan for the chosen file and queues only the new rows of the included modules', async () => {
    mocks.planImport.mockResolvedValue(
      plan('tok-1', [
        planModule('movie'),
        planModule('series', { counts: { new: 0, duplicate: 3, invalid: 0 } }),
        planModule('anime', { reason: 'module_disabled' }),
      ]),
    )
    await mount()

    expect(button(i18n.t('import.read'))!.disabled).toBe(true)
    const file = await choose('movies.json')
    expect(text()).toContain('movies.json')

    await click(i18n.t('import.read'))

    expect(mocks.planImport).toHaveBeenCalledWith(file, undefined)
    expect(container!.querySelector('[data-testid="import-modules"]')).not.toBeNull()
    expect(container!.querySelectorAll('[data-module]')).toHaveLength(3)
    // პირველი მზა მოდულის რიგები გახსნილია
    expect(container!.querySelector('[data-testid="import-rows"]')!.textContent).toContain('movie one')
    // მხოლოდ `movie` არის მზა და ახალი — ორი ახალი რიგი
    const run = button(i18n.t('import.run', { count: 2 }))!
    expect(run.disabled).toBe(false)

    await click(i18n.t('import.run', { count: 2 }))

    expect(mocks.enqueueImport).toHaveBeenCalledTimes(1)
    const [token, source, module, items] = mocks.enqueueImport.mock.calls[0]
    expect([token, source, module]).toEqual(['tok-1', 'movie', 'movie'])
    expect((items as { index: number }[]).map((i) => i.index)).toEqual([0, 2])
  })

  it('offers the possible modules when a CSV is ambiguous and reads it as the chosen one', async () => {
    mocks.planImport
      .mockRejectedValueOnce(apiError(422, { message: 'import_module_ambiguous', modules: ['series', 'anime'] }))
      .mockResolvedValueOnce(plan('tok-csv', [planModule('anime')], { kind: 'csv' }))
    await mount()

    const file = await choose('shows.csv', 'text/csv')
    await click(i18n.t('import.read'))

    const box = container!.querySelector('[data-testid="import-ambiguous"]')!
    expect(box).not.toBeNull()
    expect(box.textContent).toContain(i18n.t('errors.import_module_ambiguous'))
    expect(button(i18n.t('import.readAs', { module: 'Series' }))).toBeDefined()
    expect(mocks.toast).not.toHaveBeenCalled()

    await click(i18n.t('import.readAs', { module: 'Anime' }))

    expect(mocks.planImport).toHaveBeenLastCalledWith(file, 'anime')
    expect(container!.querySelector('[data-testid="import-ambiguous"]')).toBeNull()
    expect(container!.querySelector('[data-module="anime"]')).not.toBeNull()
    // CSV ფაილებს არ ატარებს — ეს ცხადად იწერება
    expect(text()).toContain(i18n.t('import.noFiles'))
  })

  it('shows any other planning error as a toast', async () => {
    mocks.planImport.mockRejectedValue(apiError(422, { message: 'The file is not valid JSON.' }))
    await mount()

    await choose('broken.json')
    await click(i18n.t('import.read'))

    expect(mocks.toast).toHaveBeenCalledWith({ title: 'The file is not valid JSON.', variant: 'error' })
    expect(container!.querySelector('[data-testid="import-modules"]')).toBeNull()
  })

  it('disables choosing another file while the plan is being built', async () => {
    const pending = deferred<ImportPlan>()
    mocks.planImport.mockReturnValue(pending.promise)
    await mount()

    await choose('movies.json')
    expect(button(i18n.t('import.choose'))!.disabled).toBe(false)

    await click(i18n.t('import.read'))

    expect(button(i18n.t('import.choose'))!.disabled).toBe(true)
    expect(button(i18n.t('common.loading'))!.disabled).toBe(true)

    await act(async () => pending.resolve(plan('tok-1', [planModule('movie')])))
    await flush()

    expect(button(i18n.t('import.choose'))!.disabled).toBe(false)
    expect(button(i18n.t('import.read'))!.disabled).toBe(false)
  })

  it('drops a plan that arrives after the import was discarded and deletes its temporary copy', async () => {
    mocks.planImport.mockResolvedValueOnce(plan('tok-old', [planModule('movie')]))
    await mount()

    await choose('movies.json')
    await click(i18n.t('import.read'))
    expect(container!.querySelector('[data-module="movie"]')).not.toBeNull()

    // ხელახლა წაკითხვა — პასუხი ჯერ გზაშია
    const pending = deferred<ImportPlan>()
    mocks.planImport.mockReturnValueOnce(pending.promise)
    await click(i18n.t('import.read'))

    await click(i18n.t('import.discard'))
    expect(mocks.discardImport).toHaveBeenCalledWith('tok-old')
    expect(text()).toContain(i18n.t('import.noFile'))
    // გაუქმებამ აწყობის ლოდინიც მოხსნა
    expect(button(i18n.t('import.choose'))!.disabled).toBe(false)

    await act(async () => pending.resolve(plan('tok-late', [planModule('series')])))
    await flush()

    expect(mocks.discardImport).toHaveBeenCalledWith('tok-late')
    expect(container!.querySelector('[data-testid="import-modules"]')).toBeNull()
    expect(container!.querySelector('[data-module="series"]')).toBeNull()
    expect(text()).toContain(i18n.t('import.noFile'))
  })

  it('drops a plan for a file that was replaced while it was building', async () => {
    const pending = deferred<ImportPlan>()
    mocks.planImport.mockReturnValueOnce(pending.promise)
    await mount()

    await choose('first.json')
    await click(i18n.t('import.read'))

    // ღილაკი გამორთულია, მაგრამ ფაილის ველს ცვლილება მაინც შეიძლება მოუვიდეს
    await choose('second.json')
    expect(text()).toContain('second.json')

    await act(async () => pending.resolve(plan('tok-first', [planModule('movie')])))
    await flush()

    expect(mocks.discardImport).toHaveBeenCalledWith('tok-first')
    expect(container!.querySelector('[data-testid="import-modules"]')).toBeNull()
    expect(button(i18n.t('import.read'))!.disabled).toBe(false)
  })

  it('ignores a failure that arrives after the file was replaced', async () => {
    const pending = deferred<ImportPlan>()
    mocks.planImport.mockReturnValueOnce(pending.promise)
    await mount()

    await choose('first.json')
    await click(i18n.t('import.read'))
    await choose('second.json')

    await act(async () => pending.reject(apiError(422, { message: 'import_module_ambiguous', modules: ['series', 'anime'] })))
    await flush()

    expect(mocks.toast).not.toHaveBeenCalled()
    expect(container!.querySelector('[data-testid="import-ambiguous"]')).toBeNull()
    expect(button(i18n.t('import.read'))!.disabled).toBe(false)
  })
})
