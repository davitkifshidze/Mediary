import { api } from '@/lib/api'

/* ============================================================
   დეშბორდი — მთავარი გვერდის ქარდები ერთი მოთხოვნით.
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

/**
 * არჩევითი ბლოკების („ვაგრძელებ", „ბოლოს დამატებული") ვიწრო ბარათი.
 * ⚠️ ცალკე მოთხოვნებია — მთავარი გვერდის ჯამი (`fetchDashboard`) მათ არ ატარებს.
 */
export interface FeedCard {
  module: string
  id: number
  title: string | null
  title_ka: string | null
  /** საჯარო დისკის გზა; პრივატული ფოტო (ჩანიშვნა) აქ არ მოდის */
  photo: string | null
  at: string | null
}

export async function fetchContinuing(): Promise<FeedCard[]> {
  const { data } = await api.get('/dashboard/continuing')
  return data.data
}

export async function fetchRecent(): Promise<FeedCard[]> {
  const { data } = await api.get('/dashboard/recent')
  return data.data
}
