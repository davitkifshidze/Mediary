import { describe, expect, it } from 'vitest'
import { galleryDownloadUrl } from '@/api/gallery'

/* ============================================================
   **ფოტოს კომპიუტერში შენახვა — ერთი მისამართი ყველა გალერეის ბადეში.**

   ⚠️ ფაილის საჯარო მისამართზე (`/storage/…`) ბრაუზერი `<a download>`-ს
   უგულებელყოფს — აპი და ფაილი სხვადასხვა პორტზეა — და ფოტოს უბრალოდ ხსნის.
   ამიტომ ყოველი გალერეის ფოტო ბადეს სერვერის `attachment`-მისამართს აძლევს
   (`downloadUrl`); ერთ-ერთი ბადე რომ ამოვარდეს, იქ „შენახვა" ისევ გახსნად იქცევა.
   ============================================================ */

const GRIDS = import.meta.glob<string>(
  // ⚠️ ჩანაწერის პანელი და მსახიობის დასტის ფანჯარა უჯრას ერთი ფუნქციით აწყობს — `gallery/photoItem.ts`
  ['../components/gallery/GalleryPhotoGrid.tsx', '../components/gallery/photoItem.ts', '../components/CastPhotoStacks.tsx'],
  { query: '?raw', import: 'default', eager: true },
)

describe('galleryDownloadUrl', () => {
  it('points at the photo file route with the download flag', () => {
    expect(galleryDownloadUrl(42)).toMatch(/\/api\/gallery\/images\/42\/file\?download=1$/)
  })
})

describe('every gallery grid saves through the server', () => {
  it.each(Object.keys(GRIDS))('%s gives its photos a download address', (file) => {
    expect(GRIDS[file]).toContain('downloadUrl: galleryDownloadUrl(image.id)')
  })

  it('covers the album and record grid, the record gallery and the cast photos', () => {
    expect(Object.keys(GRIDS)).toHaveLength(3)
  })
})
