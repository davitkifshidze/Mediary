import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   რეგრესია: **პირადი დისკი თითო ფოტოს ფაქტია და არა ბადის**.

   `privateDisk` ბადის დროშაა და ერთგვაროვან ჭრილს ემსახურება
   (`ModulesCut` — `note`-ის ყველა ფაილი პირადია). გალერეა კი **შერეულია**:
   სესიაში გახსნილი ალბომის ფაილები `gallery/locked`-შია, დანარჩენები
   `gallery/images`-ში.

   ⚠️ `GalleryPhotoGrid` ამ დროშას საერთოდ არ გადასცემდა, ე.ი. **ყველა
   ფოტო** `storageUrl()`-ზე გადიოდა და პირადი ფაილის მისამართი
   `/storage/gallery/images/788/file` ხდებოდა — მისამართი, რომელიც არსად
   არსებობს (`/storage/*` პირად დისკს ვერ წვდება, §17.5). სწორედ ეს
   იხატებოდა გატეხილ სურათად.

   ⚠️ **ფაქტი სერვერს უკვე გაგზავნილი ჰქონდა** (`GalleryImageResource.private`) —
   კლიენტი მას უბრალოდ აგდებდა. `tsc` ამას ვერ დაინახავდა: `PhotoItem`-ს
   ასეთი ველი საერთოდ არ ჰქონდა, ე.ი. მისი გამოტოვება ტიპის დარღვევა არ იყო.
   ============================================================ */

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

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function mountGrid(images: { id: number; src: string; private?: boolean }[]) {
  const { PhotoGrid } = await import('@/components/ui/photo-grid')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(h(TooltipProvider, null, h(PhotoGrid, { items: images })))
  })

  return container
}

/** ბადის თითოეული უჯრის `<img src>` */
const sources = (node: ParentNode) =>
  [...node.querySelectorAll('img')].map((img) => img.getAttribute('src'))

describe('PhotoGrid', () => {
  it('შერეულ ბადეში პირად ფოტოს blob-ით ხატავს, საჯაროს — storage-ით', async () => {
    const node = await mountGrid([
      { id: 788, src: '/gallery/images/788/file', private: true },
      { id: 9, src: 'gallery/images/open.jpg' },
    ])

    const src = sources(node)

    /* ⚠️ სწორედ აქ იბადებოდა `/storage/gallery/images/788/file` */
    expect(src).toContain('blob:/gallery/images/788/file')
    expect(src).toContain('http://api.test/storage/gallery/images/open.jpg')
    expect(src.some((s) => s?.includes('/storage/gallery/images/788/file'))).toBe(false)
  })

  it('ბადის დროშა ნაგულისხმევად რჩება (ერთგვაროვანი ჭრილი)', async () => {
    const { PhotoGrid } = await import('@/components/ui/photo-grid')

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(
        h(
          TooltipProvider,
          null,
          /* `note`-ის ჭრილი: ყველა რიგი პირადია და თითოზე დროშა არ მოდის */
          h(PhotoGrid, { items: [{ id: 1, src: "/note-files/1" }], privateDisk: true }),
        ),
      )
    })

    expect(sources(container)).toContain('blob:/note-files/1')
  })
})
