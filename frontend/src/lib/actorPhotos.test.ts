import { describe, expect, it } from 'vitest'
import type { GalleryAnyImage, GalleryImage } from '@/api/gallery'
import { groupActorPhotos, isActorPhotoSort, sortActorPhotos } from '@/lib/actorPhotos'

/* ============================================================
   მსახიობის ფოტოების რიგი და დაჯგუფება.

   ⚠️ მოწმდება: ოთხივე რიგი; ჩაკეტილი ფოტო ყოველთვის ბოლოშია; დაჯგუფება სათაურის
   `type:tmdb_id`-ით ხდება (ერთსახელიანი ფილმი და სერიალი ორი დასტაა), პორტრეტები და
   „სხვა" ცალკეა და ბოლოში.
   ============================================================ */

const photo = (id: number, over: Partial<GalleryImage> = {}): GalleryImage => ({
  id,
  url: `gallery/images/${id}.jpg`,
  original_name: null,
  mime: 'image/jpeg',
  size: 100,
  created_at: `2026-01-${String(id).padStart(2, '0')}T10:00:00+04:00`,
  source: 'tmdb',
  source_url: null,
  is_thumbnail: false,
  category: 'backdrop',
  album_id: null,
  width: 100,
  height: 50,
  sort_order: id,
  opens: 0,
  origin: null,
  ...over,
})

const locked: GalleryAnyImage = { id: 99, album_id: 4, width: 10, height: 10, locked: true }

const ids = (images: GalleryAnyImage[]) => images.map((image) => image.id)

describe('sortActorPhotos', () => {
  const images: GalleryAnyImage[] = [
    photo(1, { size: 300, opens: 2, sort_order: 3 }),
    locked,
    photo(2, { size: 100, opens: 9, sort_order: 1 }),
    photo(3, { size: 200, opens: 2, sort_order: 2 }),
  ]

  it('orders by date, by hand, by size and by opens, with locked photos last', () => {
    expect(ids(sortActorPhotos(images, 'added'))).toEqual([3, 2, 1, 99])
    expect(ids(sortActorPhotos(images, 'manual'))).toEqual([2, 3, 1, 99])
    expect(ids(sortActorPhotos(images, 'size'))).toEqual([1, 3, 2, 99])
    // ტოლი გახსნებისას — ახალი ზემოთ
    expect(ids(sortActorPhotos(images, 'opens'))).toEqual([2, 3, 1, 99])
  })

  it('does not reorder the list it was given', () => {
    sortActorPhotos(images, 'size')
    expect(ids(images)).toEqual([1, 99, 2, 3])
  })

  it('accepts only known sorts from storage', () => {
    expect(isActorPhotoSort('manual')).toBe(true)
    expect(isActorPhotoSort('random')).toBe(false)
    expect(isActorPhotoSort(null)).toBe(false)
  })
})

describe('groupActorPhotos', () => {
  it('stacks stills by the title they came from, then portraits, then the rest', () => {
    const movie = { type: 'movie', tmdb_id: 550, title: 'Fight Club' }
    const series = { type: 'tv', tmdb_id: 550, title: 'Fight Club' }

    const groups = groupActorPhotos([
      photo(1, { origin: series }),
      photo(2, { origin: movie }),
      photo(3, { category: 'actor' }),
      photo(4, { origin: movie }),
      // ძველი კადრი — სათაური არ წერია
      photo(5),
      locked,
    ])

    expect(groups.map((group) => [group.key, group.kind, ids(group.photos)])).toEqual([
      ['movie:550', 'title', [2, 4]],
      // ერთსახელიანი სერიალი ცალკე დასტაა
      ['tv:550', 'title', [1]],
      ['portraits', 'portraits', [3]],
      ['other', 'other', [5, 99]],
    ])
    expect(groups[0].title).toBe('Fight Club')
  })

  it('has no empty stacks', () => {
    expect(groupActorPhotos([photo(1, { category: 'actor' })]).map((group) => group.key)).toEqual(['portraits'])
    expect(groupActorPhotos([])).toEqual([])
  })
})
