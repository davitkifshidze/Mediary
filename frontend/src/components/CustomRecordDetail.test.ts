import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ModuleInfo } from '@/api/account'
import type { CustomRecord } from '@/api/customRecords'
import { customRecordItem, isPlayableRecord } from '@/lib/player'
import i18n from '@/i18n'

/* ============================================================
   **პირადი მოდულის ჩანაწერის ფანჯარა (Tasks §37.5).**

   ⚠️ აქ ის მოწმდება, რაც მხოლოდ მონტირებით ჩანს: ფაილები და ჩანიშვნები
   **მოდულის გასაღებით** იკითხება (ერთი ცხრილი ყველა პირად მოდულზე — სხვა
   გასაღები სხვა მოდულის ჩანაწერს წაიკითხავდა), ფოტოების სექცია
   დოკუმენტებზე ადრეა (§26.4), და „დამკვრელში დაკვრა" მხოლოდ დასაკრავ
   ბმულზე ჩნდება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchCustomRecordFiles: vi.fn().mockResolvedValue([]),
  fetchCustomRecordNotes: vi.fn().mockResolvedValue([]),
  modules: { all: [] as unknown[], has: () => true },
}))

vi.mock('@/api/customRecords', async (original) => ({
  ...(await original<typeof import('@/api/customRecords')>()),
  fetchCustomRecordFiles: mocks.fetchCustomRecordFiles,
  fetchCustomRecordNotes: mocks.fetchCustomRecordNotes,
}))
vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchCustomFields: vi.fn().mockResolvedValue([]),
  fetchCustomFieldValues: vi.fn().mockResolvedValue({}),
  fetchModuleFields: vi.fn().mockResolvedValue([]),
}))
// ⚠️ ერთი და იგივე ობიექტი ყოველ გამოძახებაზე (`GalleryDownloadDialog.test`-ის გაკვეთილი)
vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(node: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, node)))),
  )
  await flush()
}

const module = {
  key: 'c5-recipes',
  name_ka: 'რეცეპტები',
  name_en: 'Recipes',
  icon: 'Utensils',
  is_custom: true,
} as unknown as ModuleInfo

const record = (extra: Partial<CustomRecord> = {}): CustomRecord =>
  ({
    id: 7,
    module: 'c5-recipes',
    title: 'Pasta',
    description: null,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    domain: 'youtube.com',
    platform: 'youtube',
    embed_url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    photo_path: null,
    image_url: null,
    image: null,
    category_id: null,
    category: null,
    tags: [],
    status: null,
    is_favorite: false,
    finished_at: null,
    visibility: 'private',
    created_at: null,
    updated_at: null,
    ...extra,
  }) as CustomRecord

describe('CustomRecordDetail', () => {
  it('reads files and notes under the module key, photos first', async () => {
    const { CustomRecordDetail } = await import('@/components/CustomRecordDetail')
    await i18n.changeLanguage('en')

    await mount(h(CustomRecordDetail, { module, record: record(), onClose: () => {}, onEdit: () => {} }))

    expect(mocks.fetchCustomRecordFiles).toHaveBeenCalledWith('c5-recipes', 7, 'image')
    expect(mocks.fetchCustomRecordFiles).toHaveBeenCalledWith('c5-recipes', 7, 'doc')
    expect(mocks.fetchCustomRecordNotes).toHaveBeenCalledWith('c5-recipes', 7)

    const headings = [...document.querySelectorAll('h3')].map((el) => el.textContent?.trim() ?? '')
    const photos = headings.findIndex((x) => x.startsWith('Photos'))
    const docs = headings.findIndex((x) => x.startsWith('Documents'))
    expect(photos).toBeGreaterThanOrEqual(0)
    expect(docs).toBeGreaterThan(photos)
  })

  it('hands a playable link to the player only when it is playable', async () => {
    const { CustomRecordDetail } = await import('@/components/CustomRecordDetail')
    await i18n.changeLanguage('en')
    const onPlay = vi.fn()

    await mount(h(CustomRecordDetail, { module, record: record(), onClose: () => {}, onEdit: () => {}, onPlay }))

    const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Play in the player'))
    expect(button).toBeDefined()
    await act(async () => button!.click())
    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})

describe('custom record playback', () => {
  it('queues a recognised link as a counter-less link entry', () => {
    const item = customRecordItem(record())

    // ⚠️ `link` — პირადი ჩანაწერის id `videos`-ში არ დევს, ე.ი. „ნანახად ჩათვლა" არ არსებობს
    expect(item.kind).toBe('link')
    expect(item.platform).toBe('youtube')
    expect(item.embedUrl).toContain('youtube-nocookie.com')
    expect(item.subtitle).toBe('youtube.com')
  })

  it('treats an unrecognised or missing link as not playable', () => {
    expect(isPlayableRecord(record())).toBe(true)
    expect(isPlayableRecord(record({ platform: null }))).toBe(false)
    expect(isPlayableRecord(record({ url: null, platform: null }))).toBe(false)
    // პირდაპირი ფაილი — `<video>`-ით უკრავს, `embed_url`-ის გარეშეც
    expect(isPlayableRecord(record({ platform: 'file', embed_url: null, url: 'https://a.example/v.mp4' }))).toBe(true)
  })
})
