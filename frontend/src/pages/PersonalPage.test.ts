import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Person, PersonalMedia } from '@/api/personal'
import type { UploadKindLimit } from '@/api/account'
import { personalPhotoItem } from '@/lib/personal'
import i18n from '@/i18n'

/* ============================================================
   **პირადი გალერეა (Tasks §33.5/§33.6).**

   მოწმდება: ადამიანების ბარათები მთვლელებით; „ფოტო & ვიდეო"-ს დაჯგუფება
   სერვერის ჯგუფებს ითხოვს და თვის სახელს ხატავს; ატვირთვა **სათითაოდ** მიდის,
   ადამიანის კონტექსტით, ზედმეტად დიდი კი სერვერამდე არ მიდის; ბადის უჯრა —
   ესკიზი ბადეში, სრული ფოტო ლაითბოქსში, ვიდეო პირდაპირი მისამართით.

   §33.7 — ჩაკეტილი ადამიანი ბოქლომიანი ბარათია: დაჭერა პაროლს ითხოვს და არა
   გვერდს ხსნის, გვერდი კი მხოლოდ ბოქლომს ხატავს (ბადე საერთოდ არ ითხოვება).
   Q7 — საჯარო ალბომის ყდა საჯარო ფაილის მარშრუტიდან მოდის.
   ============================================================ */

function person(id: number, over: Partial<Person> = {}): Person {
  return {
    id,
    name: `Person ${id}`,
    birthday: null,
    note: null,
    cover_media_id: null,
    cover: null,
    photos: 2,
    videos: 1,
    albums: 0,
    sort_order: id,
    created_at: null,
    locked: false,
    unlocked: true,
    lock_hint: null,
    failed_unlocks: 0,
    unlock_blocked_until: null,
    ...over,
  }
}

function media(id: number, over: Partial<PersonalMedia> = {}): PersonalMedia {
  return {
    id,
    kind: 'photo',
    url: `/personal/media/${id}/file`,
    thumb: `/personal/media/${id}/thumb?v=abc`,
    private: true,
    mime: 'image/jpeg',
    size: 1000,
    original_name: `m${id}.jpg`,
    width: 1200,
    height: 800,
    duration: null,
    taken_at: '2024-07-10T10:00:00+04:00',
    caption: null,
    is_favorite: false,
    person_id: null,
    album_id: null,
    sort_order: 0,
    created_at: null,
    ...over,
  }
}

function limit(kind: 'personal_photo' | 'personal_video', maxBytes: number): UploadKindLimit {
  const formats = kind === 'personal_photo' ? ['jpg', 'png'] : ['mp4']

  return {
    kind,
    max_kb: maxBytes / 1024,
    max_bytes: maxBytes,
    capped_by_server: false,
    mimes: formats,
    extensions: formats,
    locked: false,
    selectable: formats,
    installation: { max_kb: maxBytes / 1024, formats },
    personal: null,
    default: { max_kb: maxBytes / 1024, formats },
  } as unknown as UploadKindLimit
}

const mocks = vi.hoisted(() => ({
  fetchPeople: vi.fn(),
  fetchPersonalSummary: vi.fn(),
  fetchPersonalMedia: vi.fn(),
  fetchPersonalGroups: vi.fn(),
  fetchPersonalAlbums: vi.fn(),
  fetchPerson: vi.fn(),
  unlockPersonal: vi.fn(),
  uploadPersonalMedia: vi.fn(),
  fetchUploadLimits: vi.fn(),
}))

vi.mock('@/api/personal', async (original) => ({
  ...(await original<typeof import('@/api/personal')>()),
  fetchPeople: mocks.fetchPeople,
  fetchPersonalSummary: mocks.fetchPersonalSummary,
  fetchPersonalMedia: mocks.fetchPersonalMedia,
  fetchPersonalGroups: mocks.fetchPersonalGroups,
  fetchPersonalAlbums: mocks.fetchPersonalAlbums,
  fetchPerson: mocks.fetchPerson,
  unlockPersonal: mocks.unlockPersonal,
  uploadPersonalMedia: mocks.uploadPersonalMedia,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchUploadLimits: mocks.fetchUploadLimits,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (!('IntersectionObserver' in globalThis)) {
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

beforeAll(async () => {
  await import('@/pages/PersonalPage')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function defaults() {
  mocks.fetchPersonalSummary.mockResolvedValue({
    people: 2, albums: 0, photos: 4, videos: 2, favorites: 0, ungrouped: 0, bytes: 2048,
    storage: { used: 0, quota: 1, remaining: 1, percent: 0, warn_at: 80, critical_at: 95 },
  })
  mocks.fetchPeople.mockResolvedValue([person(1), person(2, { photos: 0, videos: 0 })])
  mocks.fetchPersonalMedia.mockResolvedValue({ items: [media(1)], total: 1 })
  mocks.fetchPersonalGroups.mockResolvedValue([])
  mocks.fetchPersonalAlbums.mockResolvedValue([])
  mocks.fetchUploadLimits.mockResolvedValue({
    kinds: [limit('personal_photo', 15 * 1024 * 1024), limit('personal_video', 300 * 1024 * 1024)],
    catalog: {},
    max_files: 20,
    min_kb: 1024,
    ceiling_kb: 4194304,
    server: { upload_max_filesize: '128M', post_max_size: '256M', max_bytes: 128 * 1024 * 1024 },
  })
}

async function render(node: ReturnType<typeof h>, path = '/personal') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, node))),
      ),
    ),
  )
  await flush()
}

describe('PersonalPage', () => {
  it('shows people with their counts', async () => {
    defaults()
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'people' }))

    const text = container!.textContent ?? ''
    expect(text).toContain('Person 1')
    expect(text).toContain('Person 2')
    expect(text).toContain(i18n.t('personal.photos', { count: 2 }))
    // ცარიელი ადამიანი „ცარიელია"-ს წერს და არა „0 ფოტო"
    expect(text).toContain(i18n.t('personal.emptyCount'))
  })

  it('offers to add a person when there is nobody yet', async () => {
    defaults()
    mocks.fetchPeople.mockResolvedValue([])
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'people' }))

    expect(container!.textContent).toContain(i18n.t('personal.people.empty'))
  })

  it('groups photos by month through the server and names the month', async () => {
    defaults()
    mocks.fetchPersonalGroups.mockResolvedValue([
      {
        key: 'month:2024-07', title: '2024-07', subtitle: null, filter: { month: '2024-07' },
        photos: 3, videos: 0, total: 3, previews: [],
      },
      {
        key: 'month:undated', title: null, subtitle: null, filter: { month: 'undated' },
        photos: 1, videos: 0, total: 1, previews: [],
      },
    ])
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'media' }), '/personal/media')

    expect(mocks.fetchPersonalMedia).toHaveBeenCalled()

    const byMonth = [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('personal.groups.month')))
    expect(byMonth).toBeTruthy()
    await act(async () => byMonth!.click())
    await flush()

    expect(mocks.fetchPersonalGroups).toHaveBeenCalledWith('month', expect.anything())
    const text = container!.textContent ?? ''
    expect(text).toContain('2024')
    expect(text).toContain(i18n.t('personal.groups.undated'))
  })
})

describe('PersonalUploader', () => {
  it('uploads one file at a time with the person, and stops a too large file in the browser', async () => {
    defaults()
    let release: (() => void) | null = null
    mocks.uploadPersonalMedia.mockImplementation(
      () => new Promise<PersonalMedia>((resolve) => {
        release = () => resolve(media(9))
      }),
    )

    const { PersonalUploader } = await import('@/components/personal/PersonalUploader')
    await render(h(PersonalUploader, { personId: 5 }))

    const input = container!.querySelector('[data-testid="personal-upload-input"]') as HTMLInputElement
    const a = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const b = new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    const huge = new File(['x'], 'huge.mp4', { type: 'video/mp4' })
    Object.defineProperty(huge, 'size', { value: 400 * 1024 * 1024 })

    Object.defineProperty(input, 'files', { value: [a, b, huge], configurable: true })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()

    // ⚠️ ერთდროულად ერთი
    expect(mocks.uploadPersonalMedia).toHaveBeenCalledTimes(1)
    expect(mocks.uploadPersonalMedia.mock.calls[0][0]).toBe(a)
    expect(mocks.uploadPersonalMedia.mock.calls[0][1]).toMatchObject({ person_id: 5 })

    await act(async () => release!())
    await flush()

    expect(mocks.uploadPersonalMedia).toHaveBeenCalledTimes(2)
    expect(mocks.uploadPersonalMedia.mock.calls[1][0]).toBe(b)

    await act(async () => release!())
    await flush()

    // ზედმეტად დიდი სერვერამდე არ მიდის და მიზეზს წერს
    expect(mocks.uploadPersonalMedia).toHaveBeenCalledTimes(2)
    expect(container!.textContent).toContain('huge.mp4')
    expect(container!.querySelectorAll('[data-testid="personal-upload-row"]').length).toBe(3)
  })
})

describe('personalPhotoItem', () => {
  const t = i18n.t.bind(i18n)
  const date = (iso: string) => iso.slice(0, 10)

  it('shows the thumbnail in the grid and the full photo in the lightbox', () => {
    const item = personalPhotoItem(media(3, { caption: 'ზღვა' }), t, date)

    expect(item.src).toBe('/personal/media/3/thumb?v=abc')
    expect(item.private).toBe(true)
    expect(item.full).toMatch(/\/api\/personal\/media\/3\/file$/)
    expect(item.downloadUrl).toMatch(/\/api\/personal\/media\/3\/file\?download=1$/)
    expect(item.video).toBeUndefined()
    expect(item.title).toBe('ზღვა')
  })

  it('plays a video from its direct address', () => {
    const item = personalPhotoItem(media(4, { kind: 'video', mime: 'video/mp4', duration: 42, thumb: null }), t, date)

    expect(item.src).toBe('')
    expect(item.full).toBeUndefined()
    expect(item.video).toMatchObject({ mime: 'video/mp4', duration: 42 })
    expect(item.video!.src).toMatch(/\/api\/personal\/media\/4\/file$/)
  })
})

/** React-ის კონტროლირებად ველში აკრეფა — `value`-ს მშობლიური setter + `input` */
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('locks (§33.7)', () => {
  const hidden = person(3, { name: 'ანა', locked: true, unlocked: false, lock_hint: 'ზღვა', photos: 5 })

  it('draws a hidden person as a padlock card and asks for the password instead of opening it', async () => {
    defaults()
    mocks.fetchPeople.mockResolvedValue([person(1), hidden])
    mocks.unlockPersonal.mockResolvedValue({ ...hidden, unlocked: true })
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'people' }))

    const card = [...container!.querySelectorAll('li')].find((li) => li.textContent?.includes('ანა'))!
    expect(card.textContent).toContain(i18n.t('personal.lock.badgeLocked'))
    // რედაქტირება/წაშლა გახსნამდე არ ჩანს — სერვერი მათ 423-ით უარყოფს
    expect(card.textContent).not.toContain(i18n.t('actions.edit'))

    await act(async () => (card.querySelector('button') as HTMLButtonElement).click())
    await flush()

    expect(document.body.textContent).toContain(i18n.t('personal.lock.hintShown', { hint: 'ზღვა' }))

    await act(async () => typeInto(document.getElementById('personal-unlock') as HTMLInputElement, 'secret1'))
    await act(async () => (document.getElementById('personal-unlock-form') as HTMLFormElement).requestSubmit())
    await flush()

    expect(mocks.unlockPersonal).toHaveBeenCalledWith('people', 3, 'secret1')
  })

  it('shows only the padlock on a hidden person page and never asks for the grid', async () => {
    defaults()
    mocks.fetchPerson.mockResolvedValue(hidden)
    const { PersonalPersonPage } = await import('@/pages/PersonalPersonPage')
    await render(
      h(Routes, null, h(Route, { path: '/personal/people/:id', element: h(PersonalPersonPage) })),
      '/personal/people/3',
    )

    expect(container!.querySelector('[data-testid="personal-locked"]')).toBeTruthy()
    expect(container!.textContent).toContain(i18n.t('personal.photos', { count: 5 }))
    expect(mocks.fetchPersonalMedia).not.toHaveBeenCalled()
    expect(container!.textContent).not.toContain(i18n.t('actions.upload'))
  })
})

describe('PublicPersonalAlbumTile', () => {
  it('takes the cover from the public file route', async () => {
    const { PublicPersonalAlbumTile } = await import('@/components/public-gallery/PublicPersonalAlbum')
    await render(
      h(PublicPersonalAlbumTile, {
        username: 'nino',
        card: { id: 7, domain: 'personal_album', title_en: 'ზღვა', photos: 3, videos: 1, cover_id: 12 },
        onOpen: () => {},
      }),
    )

    const img = container!.querySelector('img')!
    expect(img.getAttribute('src')).toMatch(/\/api\/public\/profiles\/nino\/personal-media\/12\/thumb$/)
    expect(container!.textContent).toContain('ზღვა')
    expect(container!.textContent).toContain(i18n.t('personal.photos', { count: 3 }))
  })
})
