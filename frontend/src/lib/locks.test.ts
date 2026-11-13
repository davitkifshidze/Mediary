import { describe, expect, it } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { forgetLockedContent } from '@/lib/locks'

/* ============================================================
   **„ისევ ჩაკეტვის" შემდეგ დახურული ჩანაწერი ქეშშიც აღარ ზის.**

   ⚠️ ადრე მხოლოდ საკუთარი სია ახლდებოდა: ჩანაწერის გვერდის, გალერეის, ძებნისა
   და მთავარი გვერდის ქეშირებული პასუხი იმ გვერდზე დაბრუნებისას მაშინვე
   იხატებოდა. ეკრანს მიღმა ქეში იშლება; ეკრანზე არსებული მოთხოვნა თავიდან
   იკითხება და **არ იშლება** — წაშლა მიმდინარე ჩატვირთვას უხმოდ წყვეტს.
   ============================================================ */

describe('forgetLockedContent', () => {
  it('ეკრანს მიღმა ქეშს შლის, ეკრანზე არსებულს თავიდან კითხულობს, `me`-ს არ ეხება', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let reads = 0

    // ეკრანზე: აქტიური დამკვირვებელი
    const observer = new QueryObserver(qc, {
      queryKey: ['movie', 'list'],
      queryFn: async () => ++reads,
      staleTime: Infinity,
    })
    const stop = observer.subscribe(() => {})
    await qc.refetchQueries({ queryKey: ['movie', 'list'] })
    reads = 1

    // ეკრანს მიღმა: ჩანაწერის გვერდი, გალერეა, ძებნა
    qc.setQueryData(['movie', 'detail', '5'], { title: 'Hidden' })
    qc.setQueryData(['gallery', 'images'], [{ id: 1 }])
    qc.setQueryData(['search', 'hid'], { groups: [] })
    qc.setQueryData(['me'], { id: 1 })

    forgetLockedContent(qc)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(qc.getQueryData(['movie', 'detail', '5'])).toBeUndefined()
    expect(qc.getQueryData(['gallery', 'images'])).toBeUndefined()
    expect(qc.getQueryData(['search', 'hid'])).toBeUndefined()
    // აქტიური მოთხოვნა ადგილზეა და თავიდან წაიკითხა
    expect(qc.getQueryData(['movie', 'list'])).toBe(2)
    expect(qc.getQueryData(['me'])).toEqual({ id: 1 })

    stop()
  })
})
