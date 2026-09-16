import { describe, expect, it } from 'vitest'

import { isEmptyPick, missingPicks, pickErrors } from './requiredPicks'

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
