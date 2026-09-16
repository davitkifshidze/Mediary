import { describe, expect, it } from 'vitest'

import { catalogueKey, hiddenPicks, isEmptyPick, missingPicks, pickErrors } from './requiredPicks'

describe('isEmptyPick', () => {
  it('სამივე „ცარიელს" ერთნაირად კითხულობს', () => {
    expect(isEmptyPick('')).toBe(true)
    expect(isEmptyPick(null)).toBe(true)
    expect(isEmptyPick(undefined)).toBe(true)
    expect(isEmptyPick([])).toBe(true)
  })

  it('მხოლოდ ჰარეები ცარიელია — `Select`-ის მნიშვნელობა სტრინგია', () => {
    expect(isEmptyPick('   ')).toBe(true)
  })

  it('შევსებული მნიშვნელობა ცარიელი არ არის', () => {
    expect(isEmptyPick('watched')).toBe(false)
    expect(isEmptyPick([3])).toBe(false)
    // ⚠️ `0` ნამდვილი id-ია ზოგიერთ ლექსიკონში — falsy შემოწმება აქ შეცდომა იქნებოდა
    expect(isEmptyPick(0)).toBe(false)
  })
})

describe('missingPicks', () => {
  it('მხოლოდ შეუვსებელ ველებს აბრუნებს, თავისივე სახელით', () => {
    expect(missingPicks({ status: '', genre_ids: [4], category_id: null })).toEqual([
      'status',
      'category_id',
    ])
  })

  it('ყველაფერი შევსებულია → ცარიელი სია', () => {
    expect(missingPicks({ status: 'read', genre_id: '2' })).toEqual([])
  })
})

describe('pickErrors', () => {
  it('მზა `errors` ობიექტს აწყობს ერთი შეტყობინებით', () => {
    expect(pickErrors({ status: '', genres: [] }, 'აირჩიე')).toEqual({
      status: 'აირჩიე',
      genres: 'აირჩიე',
    })
  })
})

describe('catalogueKey', () => {
  it('translates a column name into the catalogue name', () => {
    /* ⚠️ ორი სახელია და ეს შემთხვევითი არაა: backend შეცდომას **სვეტის**
       სახელით აბრუნებს (`genre_id`), კატალოგი კი ველს `genre`-ს ეძახის. */
    expect(catalogueKey('genre_id')).toBe('genre')
    expect(catalogueKey('genre_ids')).toBe('genres')
    expect(catalogueKey('category_id')).toBe('category')
  })

  it('leaves a name that is already the catalogue key', () => {
    expect(catalogueKey('status')).toBe('status')
    expect(catalogueKey('type_id')).toBe('type_id')
  })
})

describe('hiddenPicks', () => {
  it('keeps only what the form does not draw', () => {
    /* ⚠️ ეს ცოცხალი ხარვეზია (Tasks §4.1): დამალული ველის შეცდომა
       `hidden` ელემენტზე იხატება, ე.ი. ღილაკი „შენახვა" ვიზუალურად
       არაფერს აკეთებს — ერთადერთი პასუხი ველის სახელით თქმაა. */
    const shows = (key: string) => key !== 'status'

    expect(hiddenPicks(['status', 'type_id'], shows)).toEqual(['status'])
  })

  it('asks about the catalogue key, not the column', () => {
    // `genre_id` კატალოგში `genre`-ია — არასწორი გასაღები ჩუმად ვერაფერს იპოვიდა
    const shows = (key: string) => key !== 'genre'

    expect(hiddenPicks(['genre_id'], shows)).toEqual(['genre'])
  })

  it('is empty when everything is on screen', () => {
    expect(hiddenPicks(['status', 'genre_id'], () => true)).toEqual([])
  })
})
