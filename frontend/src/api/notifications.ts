import { api } from '@/lib/api'

/* ============================================================
   შეტყობინებების ცენტრი (FEAT-19).

   ⚠️ **ტექსტი აქ არ მოდის — მხოლოდ `type` და `data`.** ენა ბრაუზერში
   ირჩევა, ე.ი. სერვერზე ჩაწერილი წინადადება მეორე ენაზე გადართვისას
   უცვლელი დარჩებოდა (`status.*`-ის ზუსტი გაკვეთილი §6.4-იდან).
   ============================================================ */

/** backend-ის `App\Support\NotificationType::ALL`-ის სარკე */
export const NOTIFICATION_TYPES = [
  'request_approved',
  'request_rejected',
  'storage_warning',
  'backup_failed',
  'batch_done',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export interface AppNotification {
  id: string
  type: string
  data: Record<string, unknown>
  /** სად მიდის დაჭერისას — **სერვერი წყვეტს** (`NotificationType::route()`) */
  route: string | null
  read_at: string | null
  created_at: string | null
}

export async function fetchNotifications(): Promise<{
  items: AppNotification[]
  unread: number
}> {
  const { data } = await api.get('/notifications')
  return { items: data.data, unread: data.unread }
}

/** მხოლოდ რიცხვი — ბეჯის 30-წამიანი პოლინგისთვის (ჩატის `unread`-ის ფორმა) */
export async function fetchUnreadNotifications(): Promise<number> {
  const { data } = await api.get('/notifications/unread')
  return data.count as number
}

/** `id`-ის გარეშე — ყველა */
export async function markNotificationsRead(id?: string): Promise<number> {
  const { data } = await api.patch(id ? `/notifications/${id}/read` : '/notifications/read')
  return data.count as number
}

export async function clearNotifications(): Promise<void> {
  await api.delete('/notifications')
}
