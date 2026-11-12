import { api } from '@/lib/api'
import type { Page } from '@/lib/paged'

/* ============================================================
   შეტყობინებების ცენტრი.

   ⚠️ **ტექსტი აქ არ მოდის — მხოლოდ `type` და `data`.** ენა ბრაუზერში
   ირჩევა, ე.ი. სერვერზე ჩაწერილი წინადადება მეორე ენაზე გადართვისას
   უცვლელი დარჩებოდა (`status.*`-ის ზუსტი გაკვეთილი).

   ⚠️ **„ნახული" ≠ „წაკითხული".** ზარის რიცხვი უნახავს ითვლის (`unseen`) და
   ზარის გახსნისთანავე ქრება; წერტილი წაუკითხავია (`unread`) და მხოლოდ
   დაჭერით ან ცხადი მონიშვნით ქრება — და უკანაც ინიშნება.
   ============================================================ */

export interface AppNotification {
  id: string
  type: string
  data: Record<string, unknown>
  /** სად მიდის დაჭერისას — **სერვერი წყვეტს** (`NotificationType::route()`) */
  route: string | null
  read_at: string | null
  seen_at: string | null
  created_at: string | null
}

/** ზარის რიცხვი · წერტილები · სულ რამდენია */
export interface NotificationCounts {
  unseen: number
  unread: number
  total: number
}

export interface NotificationPage extends Page<AppNotification>, NotificationCounts {
  /** ტიპი → რამდენია (ფილტრის ვარიანტები — მხოლოდ ის, რაც მართლა მაქვს) */
  types: Record<string, number>
}

export interface NotificationFilters {
  unread?: boolean
  type?: string
  page?: number
  per_page?: number
}

export async function fetchNotifications(filters: NotificationFilters = {}): Promise<NotificationPage> {
  const { unread, ...rest } = filters
  const { data } = await api.get('/notifications', { params: { ...rest, ...(unread ? { unread: 1 } : {}) } })

  return {
    items: data.data ?? [],
    total: data.meta?.total ?? 0,
    lastPage: Math.max(1, data.meta?.last_page ?? 1),
    types: data.types ?? {},
    unseen: data.unseen ?? 0,
    unread: data.unread ?? 0,
  }
}

/** მხოლოდ რიცხვები — ზარის 30-წამიანი პოლინგისთვის */
export async function fetchNotificationCounts(): Promise<NotificationCounts> {
  const { data } = await api.get<NotificationCounts>('/notifications/counts')
  return data
}

/** ზარი გაიხსნა — რაც მოსული იყო, ნახულია */
export async function markNotificationsSeen(): Promise<NotificationCounts> {
  const { data } = await api.patch<NotificationCounts>('/notifications/seen')
  return data
}

/** `id`-ის გარეშე — ყველა */
export async function markNotificationsRead(id?: string): Promise<NotificationCounts> {
  const { data } = await api.patch<NotificationCounts>(id ? `/notifications/${id}/read` : '/notifications/read')
  return data
}

/** ისევ წაუკითხავად — ნახულად რჩება, ზარის რიცხვი არ იზრდება */
export async function markNotificationUnread(id: string): Promise<NotificationCounts> {
  const { data } = await api.patch<NotificationCounts>(`/notifications/${id}/unread`)
  return data
}

export type NotificationBulkAction = 'read' | 'unread' | 'delete'

/** მონიშნულებზე ერთად */
export async function bulkNotifications(action: NotificationBulkAction, ids: string[]): Promise<number> {
  const { data } = await api.post<{ affected: number }>('/notifications/bulk', { action, ids })
  return data.affected
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/${id}`)
}

export async function clearNotifications(): Promise<void> {
  await api.delete('/notifications')
}
