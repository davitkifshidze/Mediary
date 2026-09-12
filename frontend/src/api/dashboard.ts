import { api } from '@/lib/api'

/* ============================================================
   დეშბორდი (Tasks 2) — მთავარი გვერდის ქარდები ერთი მოთხოვნით.
   ============================================================ */

export interface DashboardCard {
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  route_base: string
  /** `null` = მოდულს ჯერ მთვლელი არ აქვს (მოდელი არ არსებობს) */
  count: number | null
}

export async function fetchDashboard(): Promise<DashboardCard[]> {
  const { data } = await api.get('/dashboard')
  return data.data
}
