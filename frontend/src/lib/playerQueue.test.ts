import { describe, expect, it } from 'vitest'
import { removeEntry, reorderEntries } from './playerQueue'

/* ============================================================
   დამკვრელის რიგი (Tasks §35.2) — ამოღება და გადალაგება.

   ⚠️ აქ მოწმდება ის, რასაც ტიპი ვერ ხედავს: **ამოღების შემდეგ ვინ უკრავს**.
   არასწორი პასუხი ეკრანზე ასე გამოჩნდებოდა — ამოიღე სხვა სიმღერა და
   მიმდინარე შეწყდა, ან ბოლო ამოიღე და წინა თავიდან დაიწყო.
   ============================================================ */

const queue = [{ uid: 1 }, { uid: 2 }, { uid: 3 }]

describe('removeEntry', () => {
  it('სხვის ამოღებაზე მიმდინარე უცვლელია და თავიდან არ ირთვება', () => {
    const out = removeEntry(queue, 3, 2)
    expect(out.queue.map((e) => e.uid)).toEqual([1, 2])
    expect(out.current).toBe(2)
    expect(out.restart).toBe(false)
  })

  it('მიმდინარის ამოღებაზე მის ადგილს შემდეგი იკავებს და ირთვება', () => {
    const out = removeEntry(queue, 2, 2)
    expect(out.queue.map((e) => e.uid)).toEqual([1, 3])
    expect(out.current).toBe(3)
    expect(out.restart).toBe(true)
  })

  it('ბოლო მიმდინარის ამოღებაზე რიგი მთავრდება — წინაზე ვჩერდებით, არ ვუკრავთ', () => {
    const out = removeEntry(queue, 3, 3)
    expect(out.current).toBe(2)
    expect(out.restart).toBe(false)
  })

  it('ერთადერთის ამოღება რიგს აცარიელებს', () => {
    const out = removeEntry([{ uid: 7 }], 7, 7)
    expect(out.queue).toEqual([])
    expect(out.current).toBeNull()
  })

  it('უცნობი uid არაფერს ცვლის', () => {
    const out = removeEntry(queue, 99, 1)
    expect(out.queue).toBe(queue)
    expect(out.current).toBe(1)
  })
})

describe('reorderEntries', () => {
  it('სრულ სიას ახალი თანმიმდევრობით აწყობს', () => {
    expect(reorderEntries(queue, [3, 1, 2])?.map((e) => e.uid)).toEqual([3, 1, 2])
  })

  it('სხვა შემადგენლობა (გამოტოვებული, ზედმეტი, გამეორებული) უარყოფილია', () => {
    expect(reorderEntries(queue, [1, 2])).toBeNull()
    expect(reorderEntries(queue, [1, 2, 3, 4])).toBeNull()
    expect(reorderEntries(queue, [1, 1, 2])).toBeNull()
    expect(reorderEntries(queue, [1, 2, 9])).toBeNull()
  })
})
