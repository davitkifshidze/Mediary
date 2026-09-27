import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GalleryCastImage, GalleryImage, GalleryLockedImage } from '@/api/gallery'
import '@/i18n'

/* ============================================================
   მსახიობისა და ჩანაწერის გალერეა — **„ალბომში დამატება" (Tasks §17)**.

   შენი სიტყვები: „კონკრეტულ მსახიობზე ფოტოს მარჯვენა კლიკით, კონტექსტური
   მენიუდან, ალბომში დამატება უნდა შეიძლებოდეს".

   ⚠️ **ამ ფაილის მთავარი კითხვა ის არის, რას უგზავნის UI სერვერს.**
   გადატანის ფანჯარას ორი ღერძი აქვს და `/gallery`-ში ის „მშობლის გარეშე"
   არჩეულით იხსნება. მსახიობის გვერდზე იგივე ნაგულისხმევი ერთი დაჭერით
   `target: 'none'`-ს გააგზავნიდა — ფოტო ალბომში ჩავარდებოდა და მსახიობს
   ჩუმად მოსცილდებოდა. ამას ვერც ტიპები ხედავს და ვერც backend-ის ტესტი:
   სერვერისთვის ორივე მოთხოვნა სწორია.

   ⚠️ **ორი ბადე, ერთი ქცევა** (Q34): `GalleryPanel` (ჩანაწერის საკუთარი
   ფოტოებიც და მსახიობის გვერდიც) და `CastPhotoStacks` (ფილმის გვერდზე
   მსახიობების დასტები) — ორივე აქ მოწმდება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchGalleryAlbums: vi.fn(),
  moveGalleryImages: vi.fn(),
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  ...mocks,
}))

const ALBUM = {
  id: 7,
  name: 'ოჯახი',
  description: null,
  sort_order: 1,
  photos: 2,
  locked: false,
  unlocked: false,
  visibility: 'private' as const,
}

mocks.fetchGalleryAlbums.mockResolvedValue([ALBUM])
mocks.moveGalleryImages.mockResolvedValue({ moved: 1 })

const photo = (id: number): GalleryImage => ({
  id,
  url: `gallery/images/${id}.jpg`,
  original_name: `photo-${id}.jpg`,
  mime: 'image/jpeg',
  size: 1024,
  created_at: '2026-09-27T10:00:00+04:00',
  source: 'tmdb',
  source_url: null,
  is_thumbnail: false,
  category: 'actor',
  album_id: null,
  width: 400,
  height: 600,
})

/** ჩაკეტილი ალბომის ფოტო — ბილიკი არ მოსდევს, მხოლოდ ზომები */
const lockedPhoto = (id: number): GalleryLockedImage => ({
  id,
  album_id: 3,
  width: 400,
  height: 600,
  locked: true,
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

// ⚠️ lightbox და context-menu მძიმე მოდულებია — DEBT-12-ის გაკვეთილი
beforeAll(async () => {
  await import('@/components/GalleryPanel')
  await import('@/components/CastPhotoStacks')
}, 60_000)

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
  mocks.fetchGalleryAlbums.mockResolvedValue([ALBUM])
  mocks.moveGalleryImages.mockResolvedValue({ moved: 1 })
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(element: ReturnType<typeof h>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(MemoryRouter, null, h(TooltipProvider, null, element)),
      ),
    )
  })
  await flush()

  return container
}

/** ტექსტის მიხედვით ღილაკი — `@testing-library`-ის გარეშე */
function button(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text))
}

/**
 * მენიუს პუნქტი — **ზუსტი ტექსტით და ბადის გარეთ** (პორტალშია).
 * ⚠️ `includes` ხელსაწყოთა ზოლის „ყველას გადატანას" დაიჭერდა და ტესტი
 * მენიუს გზას საერთოდ ვეღარ შეამოწმებდა — ორივე იგივე `onMove`-ს იძახებს.
 */
function menuItem(text: string) {
  return [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text && !container?.contains(b),
  )
}

/** ხილული მოდალი (დასტის ქვედა ფანჯრები DOM-შია, მაგრამ დამალული) */
function dialog() {
  const all = [...document.querySelectorAll('[role="dialog"]')] as HTMLElement[]
  return all.at(-1) ?? null
}

async function click(element: Element | null | undefined) {
  expect(element, 'ელემენტი ვერ მოიძებნა').toBeTruthy()
  await act(async () => (element as HTMLElement).click())
  await flush()
}

/** ფანჯარაში ალბომის არჩევა და „გადატანა" — ორივე ბადის საერთო ბოლო */
async function moveIntoAlbum(i18n: { t: (key: string) => string }) {
  const shell = dialog()
  expect(shell, 'გადატანის ფანჯარა უნდა გაიხსნას').toBeTruthy()

  /* ⚠️ სწორედ ეს ფიქსირდება: ფანჯარა მშობლის გვერდზე „მშობელი არ
     შეიცვალოს"-ით უნდა გაიხსნას და არა „მშობლის გარეშე"-თი */
  const keep = shell!.querySelector('[role="radio"][value="keep"]')
  expect(keep?.getAttribute('aria-checked'), '„მშობელი არ შეიცვალოს" არჩეული უნდა იყოს').toBe('true')

  const submit = () =>
    [...shell!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === i18n.t('gallery.move'),
    ) as HTMLButtonElement | undefined

  // ალბომის არჩევამდე არაფერი იცვლება — ღილაკი გათიშულია
  expect(submit()?.disabled, 'ალბომის არჩევამდე გადატანა გათიშული უნდა იყოს').toBe(true)

  await click(button(shell!, ALBUM.name))
  expect(submit()?.disabled).toBe(false)

  await click(submit())
}

describe('GalleryPanel — გადატანა ალბომში (§17)', () => {
  it('ფოტოს მენიუდან ალბომში დამატება მსახიობს არ აშორებს', async () => {
    const i18n = (await import('@/i18n')).default
    const { GalleryPanel } = await import('@/components/GalleryPanel')

    const node = await mount(h(GalleryPanel, { images: [photo(11)], onDelete: () => {} }))

    // `⋯` — მარჯვენა კლიკის იგივე სია (`photoActions()`, ერთი სია ორ წარმოდგენაში)
    await click(node.querySelector(`[aria-label="${i18n.t('actions.more')}"]`))
    await click(menuItem(i18n.t('gallery.move')))

    await moveIntoAlbum(i18n)

    expect(mocks.moveGalleryImages).toHaveBeenCalledTimes(1)
    const body = mocks.moveGalleryImages.mock.calls[0][0]
    expect(body).toEqual({ ids: [11], album_id: 7 })
    // ⚠️ `target` საერთოდ არ იგზავნება — მშობლის ღერძი ხელუხლებელია
    expect('target' in body && body.target !== undefined).toBe(false)
  })

  it('ჩაკეტილი ფოტო გადატანაში არ ხვდება', async () => {
    const i18n = (await import('@/i18n')).default
    const { GalleryPanel } = await import('@/components/GalleryPanel')

    const node = await mount(
      h(GalleryPanel, { images: [photo(11), lockedPhoto(12)], onDelete: () => {} }),
    )

    // ხელსაწყოთა ზოლის „ყველას გადატანა" მხოლოდ გახსნილს ითვლის
    await click(button(node, i18n.t('gallery.moveAll').replace(' ({{count}})', '')))
    expect(dialog()?.textContent).toContain(
      i18n.t('gallery.moveTitle').replace('{{count}}', '1'),
    )

    await moveIntoAlbum(i18n)

    expect(mocks.moveGalleryImages).toHaveBeenCalledWith({ ids: [11], album_id: 7 })
  })
})

describe('CastPhotoStacks — იგივე გადატანა ფილმის გვერდზე (Q34)', () => {
  it('მსახიობის დასტის ფოტოც ალბომში მსახიობზე დარჩენით გადადის', async () => {
    const i18n = (await import('@/i18n')).default
    const { CastPhotoStacks } = await import('@/components/CastPhotoStacks')

    const image: GalleryCastImage = {
      ...photo(21),
      actor: { id: 5, name: 'Anna Lee', name_ka: null },
    }

    const node = await mount(
      h(CastPhotoStacks, {
        images: [image],
        cast: [
          {
            id: 5,
            name: 'Anna Lee',
            name_ka: null,
            gender: 1,
            photo_path: null,
            has_tmdb: true,
            photos: 1,
          },
        ],
        onDelete: () => {},
      }),
    )

    // დასტის გახსნა → მსახიობის ბადე → ხელსაწყოთა ზოლის გადატანა
    await click(button(node, 'Anna Lee'))
    await click(button(node, i18n.t('gallery.moveAll').replace(' ({{count}})', '')))

    await moveIntoAlbum(i18n)

    expect(mocks.moveGalleryImages).toHaveBeenCalledWith({ ids: [21], album_id: 7 })
  })
})
