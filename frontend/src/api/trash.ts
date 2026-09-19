import { api } from '@/lib/api'

/* ============================================================
   კალათა (FEAT-11).

   ⚠️ **ერთი მოთხოვნა ყველა დომენზე** — გვერდი ისედაც ყველას ერთად ხატავს,
   ათი ცალკე კი `throttle:api`-ს ერთ გახსნაზე ათით ხარჯავდა.
   ============================================================ */

export interface TrashItem {
  id: number
  title: string
  trashed_at: string | null
  /** რამდენი დღე რჩება საბოლოო წაშლამდე — **სერვერი ითვლის** */
  expires_in_days: number
}

export interface TrashGroup {
  domain: string
  name_ka: string
  name_en: string
  icon: string | null
  color: string | null
  total: number
  items: TrashItem[]
}

export interface TrashPayload {
  keep_days: number
  data: TrashGroup[]
}

export async function fetchTrash(): Promise<TrashPayload> {
  const res = await api.get('/trash')
  return res.data
}

export async function restoreFromTrash(domain: string, id: number): Promise<void> {
  await api.post(`/trash/${domain}/${id}/restore`)
}

export async function deleteFromTrash(domain: string, id: number): Promise<void> {
  await api.delete(`/trash/${domain}/${id}`)
}

/**
 * კალათის დაცლა.
 *
 * ⚠️ **`confirm` არგუმენტია და არა აქ ჩაწერილი.** სერვერი აკრეფილ `DELETE`-ს
 * ითხოვს; ავტომატურად გაგზავნა იმ გარანტიას გააუქმებდა, რომლისთვისაც ის
 * არსებობს — ზუსტად ის წესი, რაც ასლის ცხრილის აღდგენას აქვს.
 */
export async function emptyTrash(confirm: string, domain?: string): Promise<{ deleted: number }> {
  const res = await api.delete('/trash', { data: { confirm, ...(domain ? { domain } : {}) } })
  return res.data
}
