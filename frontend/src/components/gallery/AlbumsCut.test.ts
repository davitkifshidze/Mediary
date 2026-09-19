import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   რეგრესია: **ჩაკეტილ ალბომში შესვლა ბლარიან ბადეს უნდა აჩვენებდეს**.

   შენი სიტყვები (2026-09-20): „პრაივეით ალბომები არ ჩანს — ფოტოები
   ბლარი უნდა ედებოდეს და თუ დააჭერ და პაროლს შეიყვან, მერე ჩანდეს".

   ⚠️ **ხარვეზი ის იყო, რომ ბლარიან ბადემდე მისასვლელი გზა გადაკეტილი
   იყო.** `lockedPhotos()` (backend, §7.15), `GroupPhotos`-ის `locked`
   შტო და `LockedPhotos` სამივე დაწერილი და გამართული იყო — მაგრამ
   ბარათის `onClick` ჩაკეტილზე პირდაპირ პაროლის ფანჯარას ხსნიდა და
   ჯგუფში საერთოდ არ შეგიშვებდა. ის კოდი §7.15-ს უსწრებდა, როცა
   სერვერი მართლა **423**-ს აბრუნებდა და ცარიელი ბადე „ფოტო არ არის"-ად
   იკითხებოდა; მას შემდეგ პასუხი შეიცვალა, დაჭერა კი — არა.

   ⚠️ **ამას ვერც `tsc` ხედავს, ვერც lint და ვერც სუფთა ფუნქციის ტესტი**:
   ორივე გზა სინტაქსურად სწორია და ორივე რაღაცას ხსნის. ერთადერთი, რაც
   განასხვავებს, არის რა დაიხატა ეკრანზე — ამიტომ არსებობს ეს ფაილი
   (`GroupsCut.test.ts`-ის ზუსტი მიზეზი).
   ============================================================ */

const album = {
  id: 3,
  name: 'პირადი',
  description: null,
  visibility: 'private' as const,
  sort_order: 1,
  photos: 4,
  bytes: 2048,
  locked: true,
  unlocked: false,
}

const group = { id: 3, title: 'პირადი', photos: 4, bytes: 2048, locked: true, unlocked: false }

/** ჩაკეტილი ალბომის პასუხი — `path` არასდროს მოდის, მხოლოდ ზომები */
const lockedPage = {
  locked: true as const,
  album: { id: 3, name: 'პირადი' },
  data: [
    { id: 11, width: 800, height: 600, locked: true as const },
    { id: 12, width: 600, height: 800, locked: true as const },
  ],
  meta: { page: 1, per_page: 24, total: 4, last_page: 1 },
}

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  fetchGalleryAlbums: vi.fn(async () => [album]),
  // ⚠️ ჩაკეტილ ალბომს ესკიზი არ აქვს — ერთი `path`-იც კი ფოტოს გაამხელდა
  fetchGalleryGroups: vi.fn(async () => ({ groups: [group], previews: {} })),
  fetchGalleryPhotos: vi.fn(async () => lockedPage),
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
})

/** ქსელური პასუხების ჩამოჯდომა — ერთი `act` არ კმარა */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mountAlbumsCut() {
  const { AlbumsCut } = await import('@/components/gallery/AlbumsCut')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(MemoryRouter, null, h(TooltipProvider, null, h(AlbumsCut, {}))),
      ),
    )
  })

  await flush()

  return container
}

function button(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text))
}

describe('AlbumsCut', () => {
  it('ჩაკეტილ ალბომში შესვლა ბლარიან ფილებს ხატავს და პაროლს იქვე ითხოვს', async () => {
    const node = await mountAlbumsCut()

    const card = button(node, 'პირადი')
    expect(card, 'ალბომის ბარათი უნდა დაიხატოს').toBeTruthy()

    await act(async () => card!.click())
    await flush()

    /* ⚠️ სწორედ აქ ჩერდებოდა: ბარათი პაროლის ფანჯარას ხსნიდა და ჯგუფში
       არ შეგიშვებდა, ე.ი. ბლარიან ბადეს ვერასდროს ნახავდი. */
    const tiles = node.querySelectorAll('img[src="/locked-photo.svg"]')
    expect(tiles.length, 'ყველა ჩაკეტილ ფოტოს ბლარის ფილა უნდა ედოს').toBe(2)

    expect(button(node, 'გახსნა'), 'პაროლის ღილაკი ბადესთან ერთად უნდა იყოს').toBeTruthy()
  })

  it('ბლარიან ბადეში ნამდვილი ფაილის მისამართი არ არსებობს', async () => {
    const node = await mountAlbumsCut()

    await act(async () => button(node, 'პირადი')!.click())
    await flush()

    /* ⚠️ ეს ლოკის მთელი აზრია: `path` პასუხში არ მოსულა, ე.ი.
       ინსპექტორში მოსაძებნი არაფერია (§7.11). */
    const sources = [...node.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources.every((src) => src === '/locked-photo.svg')).toBe(true)
  })
})
