import { api } from '@/lib/api'

/* ============================================================
   „მალე" (FEAT-10).

   ⚠️ **მომავალი მოვლენა აქამდე არსად ჩანდა**: შემდეგი ეპიზოდის ეთერი,
   თამაშის გამოსვლა და ჩანიშვნის ვადა ისეთი ინფორმაციაა, რომელიც ჩუმად
   კარგავს ღირებულებას — შეხსენება მხოლოდ ხელით იყო შესაძლებელი.

   ⚠️ **წიგნი და ბორდგეიმი აქ ვერ იქნებიან**: მათ მხოლოდ `year` აქვთ და
   არა თარიღი, ხოლო 1 იანვრით ჩასმა გამოგონილი ფაქტი იქნებოდა.
   ============================================================ */

export interface UpcomingEvent {
  module: string
  id: number
  /** `YYYY-MM-DD` — აპლიკაციის ზონაში */
  date: string
  title: string
  /** სერიალი/ანიმე — „S05E03"-ს ინტერფეისი აგებს ორი რიცხვიდან */
  season: number | null
  episode: number | null
}

export async function fetchUpcoming(days?: number): Promise<{ days: number; data: UpcomingEvent[] }> {
  const res = await api.get('/upcoming', { params: days ? { days } : {} })
  return res.data
}
