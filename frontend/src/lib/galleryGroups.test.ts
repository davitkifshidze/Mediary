import { describe, expect, it } from 'vitest'
import type { GalleryGroup } from '@/api/gallery'
import type { Status } from '@/api/types'
import { sectionGalleryGroups, sortGalleryGroups } from './galleryGroups'

/* ============================================================
   `lib/galleryGroups.ts` — ჯგუფების დალაგება და სექციებად დაყოფა (ეტაპი 2).

   ⚠️ ორივე წესი **ეკრანზე დაწერილ სახელს** ეყრდნობა, ე.ი. სერვერზე ვერ
   გადავა; სწორედ ამიტომ ცხოვრობს `lib/`-ში და აქვს ტესტი.
   ============================================================ */

function group(over: Partial<GalleryGroup> = {}): GalleryGroup {
  return {
    kind: 'movie',
    id: 1,
    title: 'A',
    title_ka: 'ა',
    poster_path: null,
    photos: 0,
    bytes: 0,
    has_tmdb: true,
    ...over,
  } as GalleryGroup
}

function status(over: Partial<Status> = {}): Status {
  return {
    id: 1,
    key: 'watched',
    module: 'movie',
    name_ka: 'ნანახი',
    name_en: 'Watched',
    role: 'done',
    icon: null,
    color: null,
    is_default: false,
    sort_order: 0,
    ...over,
  } as Status
}

const titleOf = (g: GalleryGroup) => g.title_ka || g.title || ''

describe('sortGalleryGroups', () => {
  it('ნაგულისხმევად ფოტოების რაოდენობით, ბევრიდან', () => {
    const out = sortGalleryGroups([group({ id: 1, photos: 2 }), group({ id: 2, photos: 9 })], 'photos', titleOf)

    expect(out.map((g) => g.id)).toEqual([2, 1])
  })

  it('წლის გარეშე ჩანაწერი ბოლოში რჩება და არა „წელი 0"-ად', () => {
    // ⚠️ სწორედ ეს არის ხაფანგი: `null` რიცხვად შედარებისას 0-ად იკითხება
    // და ახალი, ჯერ შეუვსებელი ჩანაწერი ყველაზე ძველად გამოიყურებოდა
    const out = sortGalleryGroups(
      [group({ id: 1, year: null }), group({ id: 2, year: 1999 }), group({ id: 3, year: 2020 })],
      'year',
      titleOf,
    )

    expect(out.map((g) => g.id)).toEqual([3, 2, 1])
  })

  it('შემოსულ მასივს არ ცვლის', () => {
    const input = [group({ id: 1, photos: 1 }), group({ id: 2, photos: 5 })]
    sortGalleryGroups(input, 'photos', titleOf)

    expect(input.map((g) => g.id)).toEqual([1, 2])
  })
})

describe('sectionGalleryGroups', () => {
  const drama = { slug: 'drama', name_ka: 'დრამა', name_en: 'Drama' }
  const comedy = { slug: 'comedy', name_ka: 'კომედია', name_en: 'Comedy' }

  it('„დაჯგუფების გარეშე" სექციებს საერთოდ არ აწყობს', () => {
    expect(sectionGalleryGroups([group()], 'none', 'ka', '?')).toEqual([])
  })

  it('ჟანრით — ჩანაწერი მხოლოდ **პირველ** ჟანრში ხვდება', () => {
    // ⚠️ `MovieGrid`-ის იგივე წესი: სამჟანრიანი ფილმი სამ სექციაში რომ
    // გამოჩნდეს, სექციების ჯამი სიას აღარ დაემთხვევა
    const sections = sectionGalleryGroups(
      [group({ id: 1, genres: [drama, comedy] }), group({ id: 2, genres: [drama] })],
      'genre',
      'ka',
      'უცნობი',
    )

    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBe('დრამა')
    expect(sections[0].groups.map((g) => g.id)).toEqual([1, 2])
  })

  it('უჟანრო ჩანაწერი ქრება კი არა — „უცნობში" ხვდება', () => {
    const sections = sectionGalleryGroups(
      [group({ id: 1, genres: [drama] }), group({ id: 2, genres: [] })],
      'genre',
      'ka',
      'უცნობი',
    )

    expect(sections.flatMap((s) => s.groups).map((g) => g.id).sort()).toEqual([1, 2])
    expect(sections.map((s) => s.label)).toContain('უცნობი')
  })

  it('წლით — ახლიდან ძველისკენ, უცნობი ბოლოს', () => {
    const sections = sectionGalleryGroups(
      [group({ id: 1, year: 1999 }), group({ id: 2, year: null }), group({ id: 3, year: 2020 })],
      'year',
      'ka',
      'უცნობი',
    )

    expect(sections.map((s) => s.label)).toEqual(['2020', '1999', 'უცნობი'])
  })

  it('სტატუსით — ლექსიკონის რიგით და მფლობელის სახელით', () => {
    const sections = sectionGalleryGroups(
      [
        group({ id: 1, status: status({ key: 'watched', name_ka: 'ნანახი', sort_order: 3 }) }),
        group({ id: 2, status: status({ key: 'to_watch', name_ka: 'სანახავი', sort_order: 1 }) }),
      ],
      'status',
      'ka',
      'უცნობი',
    )

    expect(sections.map((s) => s.label)).toEqual(['სანახავი', 'ნანახი'])
  })
})
