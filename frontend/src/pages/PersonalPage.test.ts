import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Person, PersonalMedia } from '@/api/personal'
import type { UploadKindLimit } from '@/api/account'
import { personalPhotoItem } from '@/lib/personal'
import i18n from '@/i18n'

/* ============================================================
   **პირადი გალერეა.**

   მოწმდება: პიროვნებების ბარათები მთვლელებით; ჭრილები ბარათ-ტაბებია რიცხვებით;
   „ფოტო & ვიდეო"-ს დაჯგუფება (ყველა · პიროვნებით · ალბომით · დაუჯგუფებელი,
   თვეების გარეშე) სერვერის ჯგუფებს ითხოვს, ქვე-ფილტრი (ყველა · ფოტოები ·
   ვიდეოები · რჩეული) ერთი რიგია, ძებნა ჯგუფურ ხედშიც ჩანს და „ყველაზე"
   გადადის; „წარწერა" ფილის ღილაკიცაა და ლაითბოქსშიც; ატვირთვა **სათითაოდ**
   მიდის, პიროვნების კონტექსტით, ზედმეტად დიდი კი სერვერამდე არ მიდის; ზონა აღარ
   არის — ერთი „ატვირთვა" ღილაკი, გადათრევისას გადაფარვა, რიგის `h-9` ღილაკები
   ტექსტით; პიროვნების გვერდი — „ყველა" ჩანართი და „ალბომით" დაჯგუფება; ალბომის
   გვერდი — ყველა · ფოტოები · ვიდეოები; ბადის უჯრა — ესკიზი ბადეში, სრული
   ფოტო ლაითბოქსში, ვიდეო პირდაპირი მისამართით.

   ბარათები: სამი `h-9` ღილაკი + ⋯, ჩაკეტვა/ისევ ჩაკეტვა/პაროლი მენიუდან;
   ფოტოს ჩაკეტვა — პირველად „ჩაკეტილი ფოტოების" პაროლი, მერე იგივე ფოტოები.

   ჩაკეტილი პიროვნება ბოქლომიანი ბარათია: დაჭერა პაროლს ითხოვს და არა
   გვერდს ხსნის, გვერდი კი მხოლოდ ბოქლომს ხატავს (ბადე საერთოდ არ ითხოვება).
   საჯარო ალბომის ყდა საჯარო ფაილის მარშრუტიდან მოდის.
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
  fetchPersonalAlbum: vi.fn(),
  lockPersonalMedia: vi.fn(),
  unlockRecord: vi.fn(),
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
  fetchPersonalAlbum: mocks.fetchPersonalAlbum,
  lockPersonalMedia: mocks.lockPersonalMedia,
  uploadPersonalMedia: mocks.uploadPersonalMedia,
}))

vi.mock('@/api/locks', async (original) => ({
  ...(await original<typeof import('@/api/locks')>()),
  unlockRecord: mocks.unlockRecord,
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

  it('shows the three cuts as cards with their counts and opens one', async () => {
    defaults()
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(
      h(
        Routes,
        null,
        h(Route, { path: '/personal', element: h(PersonalPage, { cut: 'people' }) }),
        h(Route, { path: '/personal/albums', element: h('p', { 'data-testid': 'where' }, 'albums') }),
      ),
    )

    const cards = [...container!.querySelectorAll<HTMLButtonElement>('nav button[aria-pressed]')]
    expect(cards.map((b) => b.textContent)).toEqual([
      `${i18n.t('personal.cut.people')}2`,
      `${i18n.t('personal.cut.albums')}0`,
      // ფოტო & ვიდეო = ფოტო + ვიდეო
      `${i18n.t('personal.cut.media')}6`,
    ])
    expect(cards[0].getAttribute('aria-pressed')).toBe('true')
    // ხაზგასმული ბმულები აღარ არის
    expect(container!.querySelector('nav a')).toBeNull()

    await act(async () => cards[1].click())
    expect(container!.querySelector('[data-testid="where"]')).not.toBeNull()
  })
})

describe('PersonalMediaCut', () => {
  const summary = () =>
    mocks.fetchPersonalSummary.mockResolvedValue({
      people: 2, albums: 1, photos: 4, videos: 2, favorites: 1, ungrouped: 3, bytes: 2048,
      storage: { used: 0, quota: 1, remaining: 1, percent: 0, warn_at: 80, critical_at: 95 },
    })
  const cards = (testid: string) =>
    [...container!.querySelectorAll<HTMLButtonElement>(`[data-testid="${testid}"] button[aria-pressed]`)]

  async function type(el: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('groups by person, album or ungrouped — no months — and filters in one row of cards', async () => {
    defaults()
    summary()
    // ⚠️ დიდი სია — „გვერდზე რამდენი" პატარაზე არ იხატება
    mocks.fetchPersonalMedia.mockResolvedValue({ items: [media(1)], total: 40 })
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'media' }), '/personal/media')

    expect(cards('personal-media-groupings').map((b) => b.textContent)).toEqual([
      `${i18n.t('personal.groups.all')}6`,
      `${i18n.t('personal.groups.person')}2`,
      `${i18n.t('personal.groups.album')}1`,
      `${i18n.t('personal.groups.ungrouped')}3`,
    ])
    // რჩეული — მეოთხე ბარათი იმავე რიგში და არა ცალკე ღილაკი
    expect(cards('personal-media-toolbar').map((b) => b.textContent)).toEqual([
      `${i18n.t('personal.kind.all')}6`,
      `${i18n.t('personal.kind.photo')}4`,
      `${i18n.t('personal.kind.video')}2`,
      `${i18n.t('filter.favorite')}1`,
    ])
    // გვერდზე რამდენი — ერთი ამრჩევი
    expect(container!.querySelectorAll('[data-testid="page-size-pick"]')).toHaveLength(1)

    await act(async () => cards('personal-media-groupings')[1].click())
    await flush()
    expect(mocks.fetchPersonalGroups).toHaveBeenLastCalledWith('person', { kind: undefined, favorite: undefined })

    await act(async () => cards('personal-media-toolbar')[3].click())
    await flush()
    expect(mocks.fetchPersonalGroups).toHaveBeenLastCalledWith('person', { kind: undefined, favorite: true })

    // ძებნა ჯგუფურ ხედშიც ჩანს — აკრეფა „ყველაზე" გადადის
    const search = container!.querySelector<HTMLInputElement>(`input[placeholder="${i18n.t('personal.media.search')}"]`)!
    await type(search, 'ზღვა')
    await flush()
    expect(cards('personal-media-groupings')[0].getAttribute('aria-pressed')).toBe('true')
    expect(mocks.fetchPersonalMedia).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ზღვა', favorite: true }))
  })

  it('puts the caption on the tile and in the lightbox', async () => {
    defaults()
    summary()
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'media' }), '/personal/media')

    const bar = container!.querySelector('[data-testid="photo-actions"]')!
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual([
      i18n.t('filter.favorite'),
      i18n.t('personal.media.captionLabel'),
      i18n.t('confirm.delete'),
      '',
    ])

    // ლაითბოქსი: „წარწერა" მას ხურავს და ფანჯარას ხსნის
    await act(async () => container!.querySelector<HTMLButtonElement>('ul > li button[aria-label]')!.click())
    await flush()
    const inLightbox = document.querySelector<HTMLButtonElement>('[data-testid="lightbox-caption"]')!
    expect(inLightbox.textContent).toBe(i18n.t('personal.media.captionLabel'))
    await act(async () => inLightbox.click())
    await flush()
    expect(document.querySelector('[data-testid="lightbox-caption"]')).toBeNull()
    expect(document.querySelector('#personal-caption')).not.toBeNull()
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
    const rows = container!.querySelectorAll<HTMLElement>('[data-testid="personal-upload-row"]')
    expect(rows.length).toBe(3)

    // რიგის ღილაკები — `h-9`, ტექსტით (აიქონ-მხოლოდ `X` აღარ არის)
    const failed = [...rows[2].querySelectorAll('button')]
    expect(failed.map((b) => b.textContent?.trim())).toEqual([i18n.t('personal.upload.retry'), i18n.t('personal.upload.remove')])
    failed.forEach((b) => expect(b.className).toContain('h-9'))
    const clear = [...container!.querySelectorAll<HTMLButtonElement>('[data-testid="personal-upload-queue"] button')].find(
      (b) => b.textContent?.trim() === i18n.t('personal.upload.clearDone'),
    )!
    expect(clear.className).toContain('h-9')
    await act(async () => clear.click())
    expect(container!.querySelectorAll('[data-testid="personal-upload-row"]').length).toBe(1)
  })

  it('has no drop zone — the content is the drop target and shows an overlay while dragging', async () => {
    defaults()
    const { PersonalUploader } = await import('@/components/personal/PersonalUploader')
    await render(h(PersonalUploader, { personId: 5 }, h('p', { 'data-testid': 'inside' }, 'grid')))

    expect(container!.querySelector('[data-testid="personal-dropzone"]')).toBeNull()
    expect(container!.querySelector('[data-testid="personal-upload-queue"]')).toBeNull()
    const target = container!.querySelector<HTMLElement>('[data-testid="personal-drop-target"]')!
    expect(target.querySelector('[data-testid="inside"]')).not.toBeNull()

    const file = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const drag = new Event('dragenter', { bubbles: true })
    Object.defineProperty(drag, 'dataTransfer', {
      value: { types: ['Files'], files: [file], items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => file }] },
    })
    await act(async () => target.dispatchEvent(drag))
    await flush()

    const overlay = container!.querySelector('[data-testid="personal-drop-overlay"]')!
    expect(overlay.textContent).toBe(i18n.t('personal.upload.dropActive'))
  })
})

describe('PersonalPersonPage', () => {
  async function mount(path = '/personal/people/1', setup?: () => void) {
    defaults()
    setup?.()
    mocks.fetchPerson.mockResolvedValue(person(1, { photos: 3, videos: 2, albums: 1 }))
    const { PersonalPersonPage } = await import('@/pages/PersonalPersonPage')
    await render(h(Routes, null, h(Route, { path: '/personal/people/:id', element: h(PersonalPersonPage) })), path)
  }
  const pressed = (selector: string) =>
    [...container!.querySelectorAll<HTMLButtonElement>(`${selector} button[aria-pressed]`)]

  it('opens on "all" with every photo and video of the person, and one upload button', async () => {
    await mount()

    const tabs = pressed('[data-testid="person-tabs"]')
    expect(tabs.map((b) => b.textContent)).toEqual([
      `${i18n.t('personal.tabs.all')}5`,
      `${i18n.t('personal.tabs.photos')}3`,
      `${i18n.t('personal.tabs.videos')}2`,
      `${i18n.t('personal.tabs.albums')}1`,
    ])
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true')
    expect(mocks.fetchPersonalMedia).toHaveBeenLastCalledWith(expect.objectContaining({ person_id: 1, kind: undefined }))

    const uploads = [...container!.querySelectorAll('button')].filter((b) => b.textContent?.trim() === i18n.t('actions.upload'))
    expect(uploads).toHaveLength(1)
    expect(container!.querySelector('[data-testid="personal-dropzone"]')).toBeNull()
    expect(container!.querySelector('[data-testid="personal-drop-target"]')).not.toBeNull()
  })

  it('groups the person by album through the server, with the kind of the tab', async () => {
    await mount('/personal/people/1?tab=photos&group=album', () =>
      mocks.fetchPersonalGroups.mockResolvedValue([
        { key: 'album:4', title: 'ზღვა', subtitle: null, filter: { album_id: 4 }, photos: 2, videos: 0, total: 2, previews: [] },
        { key: 'album:none', title: null, subtitle: null, filter: { no_album: true }, photos: 1, videos: 0, total: 1, previews: [] },
      ]),
    )

    expect(pressed('[data-testid="person-grouping"]').find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent).toBe(
      i18n.t('personal.groups.album'),
    )
    expect(mocks.fetchPersonalGroups).toHaveBeenLastCalledWith('album', { kind: 'photo', favorite: undefined, person_id: 1 })
    const groups = container!.querySelector('[data-testid="personal-groups"]')!
    expect(groups.textContent).toContain('ზღვა')
    expect(groups.textContent).toContain(i18n.t('personal.groups.noAlbum'))
  })
})

describe('card actions and locks', () => {
  /** `⋯` — პუნქტები ბარათის გარეთ, ღილაკებად იხატება */
  async function openMenu(card: HTMLElement) {
    await act(async () => card.querySelector<HTMLButtonElement>(`[aria-label="${i18n.t('actions.more')}"]`)!.click())
    await flush()
    return [...document.body.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !container!.contains(b))
  }
  const cardOf = (name: string) => [...container!.querySelectorAll<HTMLElement>('li')].find((li) => li.textContent?.includes(name))!

  it('draws three h-9 buttons and puts "lock" in the ⋯ menu of a person card', async () => {
    defaults()
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'people' }))

    const card = cardOf('Person 1')
    const row = [...card.querySelectorAll<HTMLButtonElement>('button')].slice(-4)
    expect(row.map((b) => b.textContent?.trim())).toEqual([i18n.t('actions.open'), i18n.t('actions.edit'), i18n.t('confirm.delete'), ''])
    // ⚠️ სიმაღლეს `PhotoStack`-ის ზოლი წყვეტს (`[&>*]:h-9`) — `h-7` გადაფარვა აღარ არის
    row.slice(0, 3).forEach((b) => expect(b.className).toContain('h-9'))
    expect(row[0].parentElement?.className).toContain('[&>*]:h-9')
    expect(card.innerHTML).not.toContain('h-7')

    const items = await openMenu(card)
    const lock = items.find((b) => b.textContent?.trim() === i18n.t('lock.lock'))!
    expect(lock).toBeTruthy()
    await act(async () => lock.click())
    await flush()
    expect(document.getElementById('record-lock-form')).toBeTruthy()
  })

  it('offers "lock again" and "password" on a locked card, and only "password" besides "unlock" on a hidden one', async () => {
    defaults()
    mocks.fetchPeople.mockResolvedValue([
      person(1, { name: 'ღია', locked: true, unlocked: true }),
      person(2, { name: 'დამალული', locked: true, unlocked: false }),
    ])
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'people' }))

    const open = (await openMenu(cardOf('ღია'))).map((b) => b.textContent?.trim())
    expect(open).toContain(i18n.t('lock.relock'))
    expect(open).toContain(i18n.t('lock.password'))
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await flush()

    const hiddenCard = cardOf('დამალული')
    expect([...hiddenCard.querySelectorAll('button')].slice(-2).map((b) => b.textContent?.trim())).toEqual([i18n.t('lock.unlock'), ''])
    const hidden = (await openMenu(hiddenCard)).map((b) => b.textContent?.trim())
    expect(hidden).toContain(i18n.t('lock.password'))
    expect(hidden).not.toContain(i18n.t('lock.relock'))
    expect(hidden).not.toContain(i18n.t('actions.edit'))
  })

  it('locks a photo into "Locked photos", asking for that album\'s password the first time', async () => {
    defaults()
    mocks.lockPersonalMedia
      .mockRejectedValueOnce(
        new AxiosError('conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 409,
          statusText: 'Conflict',
          headers: {},
          config: {} as never,
          data: { message: 'locked_album_password_required' },
        }),
      )
      .mockResolvedValueOnce({ album_id: 9, created: true, locked: 1 })
    const { PersonalMediaGrid } = await import('@/components/personal/PersonalMediaGrid')
    await render(h(PersonalMediaGrid, { filters: {} }))

    const tile = container!.querySelector<HTMLElement>('ul > li')!
    const lock = (await openMenu(tile)).find((b) => b.textContent?.trim() === i18n.t('lock.photo'))!
    await act(async () => lock.click())
    await flush()

    expect(mocks.lockPersonalMedia).toHaveBeenCalledWith([1], undefined)
    expect(document.getElementById('locked-photos-form')).toBeTruthy()

    await act(async () => typeInto(document.getElementById('locked-photos-password') as HTMLInputElement, 'secret1'))
    await act(async () => typeInto(document.getElementById('locked-photos-repeat') as HTMLInputElement, 'secret1'))
    await act(async () => (document.getElementById('locked-photos-form') as HTMLFormElement).requestSubmit())
    await flush()

    expect(mocks.lockPersonalMedia).toHaveBeenLastCalledWith([1], 'secret1')
    expect(document.getElementById('locked-photos-form')).toBeNull()
  })
})

describe('PersonalAlbumPage', () => {
  const album = {
    id: 4, name: 'მოგზაურობა', description: null, person_id: null, person: null, cover_media_id: null, cover: null,
    visibility: 'private', photos: 3, videos: 2, sort_order: 0, created_at: null,
    locked: false, unlocked: true, lock_hint: null, failed_unlocks: 0, unlock_blocked_until: null,
  }

  async function mount(path: string) {
    defaults()
    mocks.fetchPersonalAlbum.mockResolvedValue(album)
    mocks.fetchPersonalMedia.mockResolvedValue({ items: [media(1), media(2)], total: 2 })
    const { PersonalAlbumPage } = await import('@/pages/PersonalAlbumPage')
    await render(h(Routes, null, h(Route, { path: '/personal/albums/:id', element: h(PersonalAlbumPage) })), path)
  }

  it('splits the album into all, photos and videos, and reorders only "all"', async () => {
    await mount('/personal/albums/4')

    const kinds = [...container!.querySelectorAll<HTMLButtonElement>('[data-testid="album-kinds"] button[aria-pressed]')]
    expect(kinds.map((b) => b.textContent)).toEqual([
      `${i18n.t('personal.kind.all')}5`,
      `${i18n.t('personal.kind.photo')}3`,
      `${i18n.t('personal.kind.video')}2`,
    ])
    expect(container!.textContent).toContain(i18n.t('personal.reorder.open'))
    expect(container!.textContent).not.toContain(i18n.t('personal.upload.dragHint'))

    await act(async () => kinds[2].click())
    await flush()
    expect(mocks.fetchPersonalMedia).toHaveBeenLastCalledWith(expect.objectContaining({ album_id: 4, kind: 'video', sort: 'manual' }))
    expect(container!.textContent).not.toContain(i18n.t('personal.reorder.open'))
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

describe('locks', () => {
  const hidden = person(3, { name: 'ანა', locked: true, unlocked: false, lock_hint: 'ზღვა', photos: 5 })

  it('draws a hidden person as a padlock card and asks for the password instead of opening it', async () => {
    defaults()
    mocks.fetchPeople.mockResolvedValue([person(1), hidden])
    mocks.unlockRecord.mockResolvedValue({ ...hidden, unlocked: true })
    const { PersonalPage } = await import('@/pages/PersonalPage')
    await render(h(PersonalPage, { cut: 'people' }))

    const card = [...container!.querySelectorAll('li')].find((li) => li.textContent?.includes('ანა'))!
    expect(card.textContent).toContain(i18n.t('lock.badgeLocked'))
    // რედაქტირება/წაშლა გახსნამდე არ ჩანს — სერვერი მათ 423-ით უარყოფს
    expect(card.textContent).not.toContain(i18n.t('actions.edit'))

    await act(async () => (card.querySelector('button') as HTMLButtonElement).click())
    await flush()

    expect(document.body.textContent).toContain(i18n.t('lock.hintShown', { hint: 'ზღვა' }))

    await act(async () => typeInto(document.getElementById('record-unlock') as HTMLInputElement, 'secret1'))
    await act(async () => (document.getElementById('record-unlock-form') as HTMLFormElement).requestSubmit())
    await flush()

    // ზოგადი ლოკი: ჩანაწერის მისამართი + პაროლი
    expect(mocks.unlockRecord).toHaveBeenCalledWith('/personal/people/3', 'secret1')
  })

  it('shows only the padlock on a hidden person page and never asks for the grid', async () => {
    defaults()
    mocks.fetchPerson.mockResolvedValue(hidden)
    const { PersonalPersonPage } = await import('@/pages/PersonalPersonPage')
    await render(
      h(Routes, null, h(Route, { path: '/personal/people/:id', element: h(PersonalPersonPage) })),
      '/personal/people/3',
    )

    expect(container!.querySelector('[data-testid="record-locked"]')).toBeTruthy()
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
