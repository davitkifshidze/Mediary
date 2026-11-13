import { describe, expect, it } from 'vitest'
import { readRemoved, removalBody } from '@/api/dictionary'

/* ============================================================
   **ლექსიკონის წაშლის ტანი.**

   ⚠️ სერვერი ერთ მოთხოვნაში ორ ურთიერთგამომრიცხავ განზრახვას 422-ით
   აბრუნებს, ხოლო კურსში მცხოვრები ვიდეოების სამიზნე (`lessons_to`) მხოლოდ
   იქ იგზავნება, სადაც მას აზრი აქვს: გადატანისას ისინი `move_to`-ს მიჰყვება.
   ============================================================ */

describe('removalBody', () => {
  it('სამი განზრახვა — სამი ცხადი ტანი', () => {
    expect(removalBody({ moveTo: 7 })).toEqual({ move_to: 7 })
    expect(removalBody({ clearRecords: true })).toEqual({ clear_records: true })
    expect(removalBody({ deleteRecords: true })).toEqual({ delete_records: true })
    // განზრახვის გარეშე — ცარიელად დატოვება, და ეს ცხადი ფლაგია
    expect(removalBody()).toEqual({ clear_records: true })
  })

  it('კურსის ვიდეოების სამიზნე მიდის წაშლასა და ცარიელად დატოვებასთან, გადატანასთან — არა', () => {
    expect(removalBody({ deleteRecords: true, lessonsTo: 4 })).toEqual({ delete_records: true, lessons_to: 4 })
    expect(removalBody({ clearRecords: true, lessonsTo: 4 })).toEqual({ clear_records: true, lessons_to: 4 })
    expect(removalBody({ moveTo: 7, lessonsTo: 4 })).toEqual({ move_to: 7 })
  })
})

describe('readRemoved', () => {
  it('აკლებულ რიცხვს ნულად კითხულობს', () => {
    expect(readRemoved({ moved: 2 })).toEqual({ moved: 2, deleted: 0, lessons: 0 })
    expect(readRemoved({ deleted: 1, lessons: 3 })).toEqual({ moved: 0, deleted: 1, lessons: 3 })
  })
})
