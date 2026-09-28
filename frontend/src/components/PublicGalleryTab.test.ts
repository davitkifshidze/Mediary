import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PublicProfile } from '@/api/publicProfile'
import '@/i18n'

/* ============================================================
   საჯარო პროფილის გალერეა — **ჭრილები მფლობელის სტრუქტურით** (Tasks §32)
   და §1-ის რეგრესია.

   §1: **პაროლით გახსნილი ფოტო ცარიელ ფილად ჩანდა.** სერვერი მართალი იყო
   (`private: true` + API-ის მარშრუტი), ტაბი კი ამ ნიშანს აგდებდა და
   მარშრუტს `storageUrl()`-ში ატარებდა: `/storage/public/profiles/…` —
   ასეთი ფაილი არსად არ არსებობს. ამას ვერც `tsc` ხედავს და ვერც backend-ის
   ტესტი, მხოლოდ დამაუნთება.

   §32: ტაბი ახლა ოთხი ჭრილია — **ყველა ფოტო · ბიბლიოთეკა · ალბომები ·
   ვიდეოები**. ⚠️ აქ მოწმდება **რას ითხოვს** თითო ჭრილი სერვერისგან
   (`owner`, `parent`, `album`) — ფილტრის არასწორი სახელი backend-ის ტესტში
   არ ჩანს: სერვერი მას 422-ით ან ცარიელი სიით უპასუხებდა და ეკრანზე
   „ფოტო არ არის" დაიწერებოდა.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPublicGalleryPhotos: vi.fn(),
  fetchPublicGallerySummary: vi.fn(),
  fetchPublicGalleryGroups: vi.fn(),
  fetchPublicGalleryVideos: vi.fn(),
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
      owner: { kind: 'movie', id: 12, title: 'Open Film', title_ka: null },
    },
    // სხვა, ჯერ ჩაკეტილი ალბომი — ფაილის გარეშე
    { id: 7, width: 800, height: 600, album_id: 9, locked: true },
  ],
  meta: { current_page: 1, last_page: 1, per_page: 24, total: 3 },
}

const summary = { photos: 3, records: 1, actors: 1, albums: 1, videos: 1, categories: { backdrop: 1 } }

/** პროფილის თავი — ბიბლიოთეკის დომენის ბარათს სახელი და ფერი აქედან მოსდის */
const profile: PublicProfile = {
  profile: { username: 'alice', display_name: 'Alice', avatar_path: null, bio: null, joined_at: null },
  domains: ['movie', 'gallery_album'],
  counts: { movie: 1, gallery_album: 3 },
  modules: {
    movie: { name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#7073ff' },
    gallery: { name_ka: 'გალერეა', name_en: 'Gallery', icon: 'Images', color: '#d4a017' },
  },
  domain_modules: { movie: 'movie', gallery_album: 'gallery' },
}

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

// ⚠️ ლაითბოქსი და კონტექსტური მენიუ მძიმე მოდულებია — DEBT-12-ის გაკვეთილი
beforeAll(async () => {
  await import('@/components/PublicGalleryTab')
}, 60_000)

vi.setConfig({ testTimeout: 20_000 })

beforeEach(() => {
  mocks.fetchPublicGalleryPhotos.mockResolvedValue(page)
  mocks.fetchPublicGallerySummary.mockResolvedValue(summary)
  mocks.fetchPublicGalleryGroups.mockResolvedValue({ by: 'record', groups: [], previews: {} })
  mocks.fetchPublicGalleryVideos.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 24, total: 0 } })
  mocks.unlockPublicAlbum.mockResolvedValue({ id: 9, unlocked: true })
})

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
      h(
        QueryClientProvider,
        { client: qc },
        h(TooltipProvider, null, h(PublicGalleryTab, { username: 'alice', profile })),
      ),
    )
  })

  // ⚠️ ერთი `act` არ კმარა: react-query-ის პასუხი მომდევნო tick-ზე ჯდება
  await flush()
  await flush()

  return container
}

/** გვერდზე (პორტალებიანად) დახატული ყველა `<img src>` */
const sources = () => [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'))

/** ღილაკი, რომლის ტექსტი ამით იწყება — ჭრილის ბარათს რიცხვიც აწერია */
const buttonStarting = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text))

/** დასტის ღილაკი — მის ტექსტს რაოდენობის ნიშანი უსწრებს, ე.ი. „იწყება" არ გამოდგება */
const stackButton = (title: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(title))

async function click(el: Element | undefined | null) {
  expect(el, 'ღილაკი ვერ მოიძებნა').toBeTruthy()
  await act(async () => (el as HTMLElement).click())
  await flush()
  await flush()
}

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

  /* ---------- §32 — ჭრილები ---------- */

  /**
   * **ოთხი ჭრილი, თითოს თავისი რიცხვით — და „მოდულები" არა** (§32.4):
   * მოდულების ფაილები ჩანაწერის ნაწილია, `note` კი პირადია.
   */
  it('ჭრილის ბარათები: ყველა ფოტო · ბიბლიოთეკა · ალბომები · ვიდეოები — „მოდულების" გარეშე', async () => {
    const i18n = (await import('@/i18n')).default
    await mount()

    for (const key of ['all', 'records', 'albums', 'videos']) {
      expect(buttonStarting(i18n.t(`gallery.cut.${key}`)), key).toBeTruthy()
    }
    expect(buttonStarting(i18n.t('gallery.cut.records'))!.textContent).toContain('1')
    expect(buttonStarting(i18n.t('gallery.cut.modules'))).toBeUndefined()
    expect(buttonStarting(i18n.t('gallery.cut.sources'))).toBeUndefined()

    // ბრტყელ ბადეზე — ვისია ფოტო (მხოლოდ საჯარო მშობელი მოდის სერვერიდან)
    expect(document.body.textContent).toContain('Open Film')
  })

  /**
   * **ბიბლიოთეკის ჯგუფი `owner`-ით იხსნება** — მფლობელის გრამატიკით
   * (`movie:12`); სხვა სახელი სერვერისთვის 422 იქნებოდა.
   */
  it('ბიბლიოთეკა: ჯგუფზე დაჭერა მის ფოტოებს `owner: movie:12`-ით ითხოვს', async () => {
    const i18n = (await import('@/i18n')).default
    mocks.fetchPublicGalleryGroups.mockResolvedValue({
      by: 'record',
      groups: [{ kind: 'movie', id: 12, title: 'Open Film', title_ka: null, year: 2020, photos: 2 }],
      facets: { types: { movie: 1, all: 1 } },
      previews: { 'movie:12': ['gallery/images/open.jpg'] },
    })

    await mount()
    await click(buttonStarting(i18n.t('gallery.cut.records')))

    // ⚠️ ერთი საჯარო დომენია — ჭრილი თავისით მასზე დგება (ბარათები ერთზე არ იხატება)
    expect(mocks.fetchPublicGalleryGroups).toHaveBeenCalledWith('alice', 'record', expect.objectContaining({ type: 'movie' }))

    await click(stackButton('Open Film'))

    expect(mocks.fetchPublicGalleryPhotos).toHaveBeenLastCalledWith(
      'alice',
      expect.objectContaining({ owner: 'movie:12', page: 1 }),
    )
  })

  /** „არეული" — იგივე სკოუპი ბრტყლად: `parent: 'record'` და არა მთელი გალერეა */
  it('ბიბლიოთეკის „არეული" ხედი `parent: record`-ით ითხოვს', async () => {
    const i18n = (await import('@/i18n')).default
    await mount()
    await click(buttonStarting(i18n.t('gallery.cut.records')))

    await click(buttonStarting(i18n.t('gallery.layout.mixed')))

    expect(mocks.fetchPublicGalleryPhotos).toHaveBeenLastCalledWith(
      'alice',
      expect.objectContaining({ parent: 'record' }),
    )
  })

  /**
   * **მედია-დომენზე „მსახიობების" ჩანართი** — ჯგუფები `by: actor` და
   * `from: movie`-ით: ვინც ამ დომენის საჯარო ჩანაწერებში თამაშობს.
   */
  it('ფილმების დომენზე „მსახიობები" `by: actor, from: movie`-ს ითხოვს', async () => {
    const i18n = (await import('@/i18n')).default
    await mount()
    await click(buttonStarting(i18n.t('gallery.cut.records')))

    // ერთი დომენია — ბარათი მოდულის სახელითაა („ფილმები") და არა „ჩანაწერებით"
    await click(buttonStarting(i18n.t('gallery.inner.actors')))

    expect(mocks.fetchPublicGalleryGroups).toHaveBeenLastCalledWith(
      'alice',
      'actor',
      expect.objectContaining({ from: 'movie' }),
    )
  })

  /**
   * **ჩაკეტილი ალბომი: დასტა იხსნება, თავში „გახსნა" ღილაკია** — ცარიელ-
   * ბლარიან ალბომზე ფილაზე დაჭერა ერთადერთი გზა ვერ იქნება.
   */
  it('ჩაკეტილ ალბომში „გახსნა" ღილაკი ამ ალბომის პაროლს ითხოვს', async () => {
    const i18n = (await import('@/i18n')).default
    mocks.fetchPublicGalleryGroups.mockResolvedValue({
      by: 'album',
      groups: [{ kind: 'album', id: 3, title: 'Diary', title_ka: 'Diary', photos: 1, locked: true, unlocked: false }],
      previews: {},
    })

    await mount()
    await click(buttonStarting(i18n.t('gallery.cut.albums')))

    mocks.fetchPublicGalleryPhotos.mockResolvedValue({
      data: [{ id: 30, width: 10, height: 10, album_id: 3, locked: true }],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
      album: { id: 3, name: 'Diary', description: null, locked: true, unlocked: false },
    })

    await click(stackButton('Diary'))

    expect(mocks.fetchPublicGalleryPhotos).toHaveBeenLastCalledWith(
      'alice',
      expect.objectContaining({ owner: 'album:3' }),
    )

    await click(buttonStarting(i18n.t('gallery.albumUnlock')))

    expect(document.getElementById('public-album-password'), 'პაროლის ველი არ გამოჩნდა').toBeTruthy()
  })

  /**
   * **ვიდეო ფანჯარაში იკვრება** — საჯარო გვერდს საერთო ფლეერი არ აქვს
   * (`PlayerProvider` `Protected`-ის შიგნითაა), ე.ი. `usePlayer()` აქ
   * არ იარსებებდა.
   */
  it('ვიდეოზე დაჭერა მას allowlist-ის iframe-ში ხსნის', async () => {
    const i18n = (await import('@/i18n')).default
    mocks.fetchPublicGalleryVideos.mockResolvedValue({
      data: [
        {
          id: 1, url: 'https://www.youtube.com/watch?v=abc', platform: 'youtube',
          embed_url: 'https://www.youtube-nocookie.com/embed/abc', title: 'Trailer', channel: 'Studio',
          duration: 90, published_at: null, thumbnail_url: 'https://img.youtube.com/vi/abc/hqdefault.jpg',
          owner: { kind: 'movie', id: 12, title: 'Open Film', title_ka: null },
        },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
    })

    await mount()
    await click(buttonStarting(i18n.t('gallery.cut.videos')))

    expect(document.body.textContent).toContain('Studio · Open Film')

    await click(buttonStarting(i18n.t('publicProfile.gallery.watch')))

    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abc')
  })
})
