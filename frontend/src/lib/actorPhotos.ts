import type { GalleryAnyImage, GalleryImage } from '@/api/gallery'

/* ============================================================
   მსახიობის ფოტოების **რიგი და დაჯგუფება** — სუფთა წესები, ტესტირებადი.

   ⚠️ ჩაკეტილი ალბომის ფოტოს მხოლოდ `id` და ზომები მოსდევს (ბილიკი, თარიღი, სათაური —
   არა), ამიტომ ის ნებისმიერ რიგში ბოლოშია და დაჯგუფებისას „სხვაში" ხვდება.
   ============================================================ */

/** მსახიობის გვერდის დალაგება */
export const ACTOR_PHOTO_SORTS = ['added', 'manual', 'size', 'opens'] as const
export type ActorPhotoSort = (typeof ACTOR_PHOTO_SORTS)[number]

export function isActorPhotoSort(value: unknown): value is ActorPhotoSort {
  return (ACTOR_PHOTO_SORTS as readonly unknown[]).includes(value)
}

const time = (image: GalleryImage) => (image.created_at ? Date.parse(image.created_at) : 0)

/**
 * ფოტოები არჩეული რიგით:
 *  · `added` — ახალი ზემოთ;
 *  · `manual` — ხელით დალაგებული (`sort_order`, გადათრევით ინახება);
 *  · `size` — დიდი ზემოთ;
 *  · `opens` — ხშირად გახსნილი ზემოთ (ტოლობისას ახალი).
 */
export function sortActorPhotos<T extends GalleryAnyImage>(images: readonly T[], sort: ActorPhotoSort): T[] {
  const open = images.filter((image): image is T & GalleryImage => !image.locked)
  const locked = images.filter((image) => image.locked)

  const compare: Record<ActorPhotoSort, (a: GalleryImage, b: GalleryImage) => number> = {
    added: (a, b) => time(b) - time(a) || b.id - a.id,
    manual: (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id,
    size: (a, b) => b.size - a.size || b.id - a.id,
    opens: (a, b) => (b.opens ?? 0) - (a.opens ?? 0) || time(b) - time(a) || b.id - a.id,
  }

  return [...[...open].sort(compare[sort]), ...locked]
}

/** დასტა მსახიობის გვერდზე — სათაური, „პორტრეტები" ან „სხვა" */
export interface ActorPhotoGroup<T> {
  key: string
  kind: 'title' | 'portraits' | 'other'
  /** სათაურის სახელი (მხოლოდ `title`) */
  title: string | null
  /** `movie` · `tv` (მხოლოდ `title`) */
  type: string | null
  photos: T[]
}

/**
 * **დაჯგუფება სათაურის მიხედვით**: დასტა თითო ფილმზე / სერიალზე (საიდანაც კადრია), ცალკე
 * „პორტრეტები" და „სხვა" — ძველი ფოტოები, რომლებზეც სათაური არ წერია, ხელით ატვირთული,
 * ვებიდან მოტანილი და ჩაკეტილი.
 *
 * ⚠️ გასაღები `type:tmdb_id`-ია და არა სახელი — ერთსახელიანი ფილმი და სერიალი ორი დასტაა.
 * სათაურების რიგი — ფოტოების რაოდენობით; „პორტრეტები" და „სხვა" ბოლოშია.
 */
export function groupActorPhotos<T extends GalleryAnyImage>(images: readonly T[]): ActorPhotoGroup<T>[] {
  const titles = new Map<string, ActorPhotoGroup<T>>()
  const portraits: T[] = []
  const other: T[] = []

  for (const image of images) {
    if (image.locked) {
      other.push(image)
      continue
    }

    const origin = image.origin

    if (origin) {
      const key = `${origin.type}:${origin.tmdb_id}`
      const group = titles.get(key)
      if (group) group.photos.push(image)
      else titles.set(key, { key, kind: 'title', title: origin.title, type: origin.type, photos: [image] })
      continue
    }

    if (image.category === 'actor') portraits.push(image)
    else other.push(image)
  }

  const groups = [...titles.values()].sort(
    (a, b) => b.photos.length - a.photos.length || (a.title ?? '').localeCompare(b.title ?? ''),
  )

  if (portraits.length) groups.push({ key: 'portraits', kind: 'portraits', title: null, type: null, photos: portraits })
  if (other.length) groups.push({ key: 'other', kind: 'other', title: null, type: null, photos: other })

  return groups
}
