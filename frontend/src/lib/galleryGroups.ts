import type { GalleryGroup } from '@/api/gallery'
import { statusName } from '@/lib/statuses'

/* ============================================================
   გალერეის ჯგუფების **დალაგება და შიდა დაჯგუფება** (ეტაპი 2).

   შენი სიტყვები: „უნდა შეგეძლოს შიდა დაჯგუფება და ფილტვრაც".

   ⚠️ **რატომ ფრონტზე და არა SQL-ში.** ჯგუფების სია სრულად ბრუნდება
   (გვერდები აქ არ არის) და ორივე მოქმედება **ეკრანზე დაწერილ სახელს**
   ეყრდნობა: დალაგება — `contentLang`-ით არჩეულ სათაურს, დაჯგუფება —
   სტატუსის/ჟანრის სახელს მფლობელის ლექსიკონიდან. სერვერზე გატანა ნიშნავდა,
   რომ ერთი და იგივე წესი ორ ადგილას დაიწერებოდა და ერთ დღეს გაშორდებოდა
   („ჯგუფში 40 წერია, შიგნით 37-ია" — `PurgeService`-ის იგივე წესი).

   ⚠️ **ორივე ფუნქცია სუფთაა და `lib/`-შია** სწორედ იმიტომ, რომ ტესტი
   ჰქონდეს (`galleryGroups.test.ts`): კომპონენტის შიგნით დაწერილი იგივე
   ლოგიკა შემოწმების გარეშე დარჩებოდა.
   ============================================================ */

export const GALLERY_GROUP_SORTS = ['photos', 'photos_asc', 'title', 'year', 'bytes'] as const
export type GalleryGroupSort = (typeof GALLERY_GROUP_SORTS)[number]

export const GALLERY_GROUP_SECTIONS = ['none', 'genre', 'year', 'status'] as const
export type GalleryGroupSection = (typeof GALLERY_GROUP_SECTIONS)[number]

/** ერთი სექცია — სათაური და მისი ჯგუფები */
export interface GalleryGroupSectionBucket {
  key: string
  label: string
  groups: GalleryGroup[]
}

/**
 * დალაგება.
 *
 * ⚠️ **სათაურს გამომძახებელი იძლევა** (`titleOf`) და აქ ხელახლა არ იგება:
 * ზუსტად ის სტრიქონი უნდა დალაგდეს, რომელიც ბარათზე წერია — სხვაგვარად
 * „ა-დან ჰ-მდე" დალაგებული სია ეკრანზე არეულად გამოიყურება.
 *
 * ⚠️ **მხოლოდ ასლი ლაგდება** (`[...groups]`) — `sort()` ადგილზე ალაგებს და
 * React-ის props-ის მუტაცია მოგვიანებით აუხსნელ ხელახალ დახატვას იწვევს.
 */
export function sortGalleryGroups(
  groups: GalleryGroup[],
  sort: GalleryGroupSort,
  titleOf: (group: GalleryGroup) => string,
  lang = 'ka',
): GalleryGroup[] {
  const byTitle = (a: GalleryGroup, b: GalleryGroup) =>
    titleOf(a).localeCompare(titleOf(b), lang === 'ka' ? 'ka' : 'en')

  return [...groups].sort((a, b) => {
    switch (sort) {
      case 'photos_asc':
        return a.photos - b.photos || byTitle(a, b)
      case 'bytes':
        return b.bytes - a.bytes || byTitle(a, b)
      case 'title':
        return byTitle(a, b)
      case 'year':
        /* ⚠️ წლის გარეშე ჩანაწერი **ბოლოში** რჩება და არა „წელი 0"-ად —
           თორემ ახალ, ჯერ შეუვსებელ ჩანაწერს სია ბოლოში ჩამოაგდებდა ისე,
           თითქოს ის ყველაზე ძველი იყოს. */
        if (a.year == null && b.year == null) return byTitle(a, b)
        if (a.year == null) return 1
        if (b.year == null) return -1
        return b.year - a.year || byTitle(a, b)
      default:
        return b.photos - a.photos || byTitle(a, b)
    }
  })
}

/**
 * შიდა დაჯგუფება სექციებად — ჟანრი · წელი · სტატუსი.
 *
 * ⚠️ **ჟანრით დაჯგუფებისას ჩანაწერი მხოლოდ **პირველ** ჟანრში ხვდება** —
 * ზუსტად ის წესი, რაც `MovieGrid`-ის `defaultGrouping`-ს აქვს: სამჟანრიანი
 * ფილმი სამ სექციაში რომ გამოჩნდეს, სექციების ჯამი სიას აღარ დაემთხვევა.
 *
 * ⚠️ **„უცნობი" ცალკე სექციაა და არა გამოტოვებული ჩანაწერი** — უჟანრო
 * ფილმი ჩუმად რომ გაქრეს, ბადეზე ჩანაწერების რაოდენობა შეიცვლებოდა და ეს
 * ფილტრად წაიკითხებოდა.
 */
export function sectionGalleryGroups(
  groups: GalleryGroup[],
  by: GalleryGroupSection,
  lang: string,
  unknownLabel: string,
): GalleryGroupSectionBucket[] {
  if (by === 'none') return []

  const buckets = new Map<string, GalleryGroupSectionBucket & { order: number }>()

  const push = (key: string, label: string, order: number, group: GalleryGroup) => {
    const bucket = buckets.get(key) ?? { key, label, order, groups: [] }
    bucket.groups.push(group)
    buckets.set(key, bucket)
  }

  for (const group of groups) {
    if (by === 'genre') {
      const genre = group.genres?.[0]
      const label = genre ? (lang === 'ka' ? genre.name_ka || genre.name_en : genre.name_en || genre.name_ka) : null

      push(genre?.slug ?? '', label || unknownLabel, genre ? 0 : 1, group)
      continue
    }

    if (by === 'year') {
      push(group.year ? String(group.year) : '', group.year ? String(group.year) : unknownLabel, group.year ?? -1, group)
      continue
    }

    push(
      group.status?.key ?? '',
      group.status ? statusName(group.status, lang) : unknownLabel,
      group.status?.sort_order ?? 9999,
      group,
    )
  }

  const sections = [...buckets.values()]

  sections.sort((a, b) => {
    /* ⚠️ თითო ჭრილს **თავისი ბუნებრივი რიგი** აქვს: წელი ახლიდან ძველისკენ,
       სტატუსი ლექსიკონის რიგით, ჟანრი კი — რომელშიც მეტი ჩანაწერია. ერთი
       საერთო ანბანური რიგი სამივეს ერთნაირად ცუდს ხდიდა. */
    if (by === 'year') return b.order - a.order
    if (by === 'status') return a.order - b.order

    return b.groups.length - a.groups.length || a.label.localeCompare(b.label)
  })

  return sections.map(({ key, label, groups: items }) => ({ key, label, groups: items }))
}
