import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   რეგრესია: **საჯარო პროფილზე პაროლით გახსნილი ფოტო ცარიელ ფილად ჩანდა**
   (Tasks §1).

   შენი სიტყვები: „საიდუმლო ალბომში მქონდა ფოტოები და გავასაჯაროე; მერე
   `/u/davit`-ზე პაროლი რომ შევიყვანე, ფოტოები მაინც არ ჩაიტვირთა".

   ⚠️ **სერვერი მართალი იყო** — გახსნილი ჩაკეტილი ალბომის ფაილი პირად
   დისკზეა (`gallery/locked`), ე.ი. `path` API-ის მარშრუტია
   (`/public/profiles/{u}/gallery-photos/{id}/file`) და `private: true`-ც
   მოდიოდა. ტაბი კი ამ ნიშანს აგდებდა და მარშრუტს `storageUrl()`-ში
   ატარებდა: `/storage/public/profiles/…` — ასეთი ფაილი არსად არ არსებობს.

   ⚠️ **ამას ვერც `tsc` ხედავს და ვერც backend-ის ტესტი**: ტიპს `private`
   ველი საერთოდ არ ჰქონდა (ე.ი. მისი გამოტოვება დარღვევა არ იყო), backend-ის
   ტესტი კი სწორ პასუხს ამოწმებს. მხოლოდ დამაუნთება იჭერს — ამ ტაბს კი
   ფრონტენდის ტესტი აქამდე საერთოდ არ ჰქონდა.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPublicGalleryPhotos: vi.fn(),
  unlockPublicAlbum: vi.fn(),
}))

vi.mock('@/api/publicProfile', async (original) => ({
  ...(await original<typeof import('@/api/publicProfile')>()),
  ...mocks,
}))

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  storageUrl: (path?: string | null) =>
    path ? `http://api.test/storage/${path.replace(/^\/+/, '')}` : null,
}))

/** ⚠️ blob-ის ნაცვლად ცნობადი სტრიქონი — ტესტს ქსელი არ სჭირდება */
vi.mock('@/components/PrivateFile', () => ({
  usePrivateFileUrl: (url: string | null | undefined) => ({
    url: url ? `blob:${url}` : null,
    loading: false,
    failed: false,
  }),
  fetchPrivateObjectUrl: async (url: string) => `blob:${url}`,
  PrivateImage: () => null,
  PrivateFileLink: () => null,
}))

const PRIVATE_PATH = '/public/profiles/alice/gallery-photos/5/file'

/** ზუსტად ის შერეული გვერდი, რაც სერვერს გამოაქვს პაროლის შეყვანის შემდეგ */
const page = {
  data: [
    // გახსნილი ჩაკეტილი ალბომის ფოტო — პირადი დისკი, API-ის მარშრუტი
    { id: 5, width: 800, height: 600, album_id: 3, locked: false, path: PRIVATE_PATH, private: true, category: null },
    // ჩვეულებრივი საჯარო ფოტო — storage-ის გზა
    {
      id: 6, width: 800, height: 450, album_id: null, locked: false,
      path: 'gallery/images/open.jpg', private: false, category: 'backdrop',
    },
    // სხვა, ჯერ ჩაკეტილი ალბომი — ფაილის გარეშე
    { id: 7, width: 800, height: 600, album_id: 9, locked: true },
  ],
  meta: { current_page: 1, last_page: 1, per_page: 24, total: 3 },
}

mocks.fetchPublicGalleryPhotos.mockResolvedValue(page)
mocks.unlockPublicAlbum.mockResolvedValue({ id: 9, unlocked: true })

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

// ⚠️ ლაითბოქსი და კონტექსტური მენიუ მძიმე მოდულებია — DEBT-12-ის გაკვეთილი
beforeAll(async () => {
  await import('@/components/PublicGalleryTab')
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

async function mount() {
  const { PublicGalleryTab } = await import('@/components/PublicGalleryTab')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(PublicGalleryTab, { username: 'alice' }))),
    )
  })

  // ⚠️ ერთი `act` არ კმარა: react-query-ის პასუხი მომდევნო tick-ზე ჯდება
  await flush()
  await flush()

  return container
}

/** გვერდზე (პორტალებიანად) დახატული ყველა `<img src>` */
const sources = () => [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'))

describe('PublicGalleryTab', () => {
  it('პირად ფოტოს API-იდან blob-ად კითხულობს და არასდროს — `/storage`-იდან', async () => {
    await mount()

    const src = sources()

    expect(src).toContain(`blob:${PRIVATE_PATH}`)
    /* ⚠️ სწორედ აქ იბადებოდა ცარიელი ფილა */
    expect(src.some((s) => s?.includes('/storage/public/profiles'))).toBe(false)
    // საჯარო ფოტო კვლავ storage-იდან მოდის — ორი დისკი ერთ ბადეში
    expect(src).toContain('http://api.test/storage/gallery/images/open.jpg')
    // ჩაკეტილი — მხოლოდ ბლარი, ფაილის გარეშე
    expect(src).toContain('/locked-photo.svg')
  })

  /** აქამდე ჩვეულებრივ ფოტოზე დაჭერა არაფერს აკეთებდა */
  it('ფოტოზე დაჭერა ლაითბოქსს ხსნის', async () => {
    const node = await mount()

    const tile = [...node.querySelectorAll('button')].find(
      (b) => b.querySelector('img')?.getAttribute('src') === 'http://api.test/storage/gallery/images/open.jpg',
    )
    expect(tile, 'ფოტოს ღილაკი ვერ მოიძებნა').toBeTruthy()

    await act(async () => tile!.click())
    await flush()

    // ⚠️ ბადის უჯრის გარდა გახსნილ ხედშიც უნდა იდგეს იგივე ფოტო
    expect(sources().filter((s) => s === 'http://api.test/storage/gallery/images/open.jpg').length).toBeGreaterThan(1)
  })

  /**
   * ⚠️ **კითხვის რეჟიმი — მართვის არც ერთი ინსტრუმენტი.** ეს სხვისი
   * პროფილია: მონიშვნა, „ყველას ჩამოტვირთვა" და წაშლა მფლობელის ბადის
   * საქმეა და უცხოს გვერდზე არაფერს ნიშნავს.
   */
  it('მონიშვნისა და ჩამოტვირთვის ღილაკები არ იხატება', async () => {
    const i18n = (await import('@/i18n')).default
    const node = await mount()

    const labels = [...node.querySelectorAll('button')].map((b) => b.textContent?.trim())

    expect(labels).not.toContain(i18n.t('photos.pickOn'))
    expect(labels.some((l) => l?.startsWith(i18n.t('photos.downloadAll', { count: 2 })))).toBe(false)
    expect(node.querySelector('[aria-label="' + i18n.t('actions.more') + '"]')).toBeNull()
  })

  it('ჩაკეტილ ფილაზე პაროლს ითხოვს და გახსნის შემდეგ სიას თავიდან კითხულობს', async () => {
    const i18n = (await import('@/i18n')).default
    const node = await mount()

    expect(mocks.fetchPublicGalleryPhotos).toHaveBeenCalledTimes(1)

    const locked = [...node.querySelectorAll('button')].find(
      (b) => b.querySelector('img')?.getAttribute('src') === '/locked-photo.svg',
    )
    expect(locked, 'ჩაკეტილი ფილა ვერ მოიძებნა').toBeTruthy()

    await act(async () => locked!.click())
    await flush()

    const input = document.getElementById('public-album-password') as HTMLInputElement | null
    expect(input, 'პაროლის ველი არ გამოჩნდა').toBeTruthy()

    // React-ის კონტროლირებად ველს მნიშვნელობა native setter-ით უნდა მიეცეს
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'secret1')
      input!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const submit = [...document.querySelectorAll('button[type="submit"]')].find(
      (b) => b.textContent?.trim() === i18n.t('gallery.albumUnlock'),
    ) as HTMLButtonElement | undefined
    expect(submit, 'გახსნის ღილაკი ვერ მოიძებნა').toBeTruthy()

    await act(async () => submit!.click())
    await flush()
    await flush()

    // ⚠️ ალბომი ფილის `album_id`-ით იხსნება, და არა ფოტოს id-ით
    expect(mocks.unlockPublicAlbum).toHaveBeenCalledWith('alice', 9, 'secret1')
    // გახსნის შემდეგ სია თავიდან მოდის — სწორედ იქ ჩნდება ნამდვილი მისამართი
    expect(mocks.fetchPublicGalleryPhotos.mock.calls.length).toBeGreaterThan(1)
  })
})
