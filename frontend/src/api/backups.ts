import { api } from '@/lib/api'

/* ============================================================
   **ბაზის დამპი და აღდგენა (Tasks §22).**

   ⚠️ ყველა მისამართი `/admin/*`-შია და `super_admin`-ზეა: დამპი მთელი
   ბაზაა (ყველა ანგარიში, ჰეშირებული პაროლები, პირადი ჩატები).
   ============================================================ */

export type BackupStatus = 'running' | 'ready' | 'failed'

export interface Backup {
  id: number
  name: string | null
  size: number
  status: BackupStatus
  /** ⚠️ „მიმდინარეობს" და „პროცესი მოკვდა" სხვადასხვა ღილაკს ითხოვს */
  stale: boolean
  error: string | null
  driver: string | null
  tables: number | null
  note: string | null
  source: 'dump' | 'upload'
  user: { id: number; name: string; username: string | null } | null
  created_at: string | null
  finished_at: string | null
}

export interface BackupMeta {
  available: boolean
  restore_available: boolean
  driver: string
  database: string
  max_upload_kb: number
}

export async function fetchBackups(): Promise<{ data: Backup[]; meta: BackupMeta }> {
  const { data } = await api.get('/admin/backups')
  return data
}

export async function fetchBackup(id: number): Promise<Backup> {
  const { data } = await api.get<{ data: Backup }>(`/admin/backups/${id}`)
  return data.data
}

export async function createBackup(body: { note?: string; compress?: boolean } = {}): Promise<Backup> {
  const { data } = await api.post<{ data: Backup }>('/admin/backups', body)
  return data.data
}

export async function importBackup(file: File, note?: string): Promise<Backup> {
  const form = new FormData()
  form.append('file', file)
  if (note) form.append('note', note)
  const { data } = await api.post<{ data: Backup }>('/admin/backups/import', form)
  return data.data
}

/** ⚠️ დესტრუქციულია — `confirm` აკრეფილი სიტყვაა და ნაგულისხმევი არ აქვს */
export async function restoreBackup(id: number): Promise<Backup> {
  const { data } = await api.post<{ data: Backup }>(`/admin/backups/${id}/restore`, { confirm: 'RESTORE' })
  return data.data
}

export async function deleteBackup(id: number): Promise<void> {
  await api.delete(`/admin/backups/${id}`)
}

/**
 * ⚠️ **ჩამოტვირთვა blob-ით და არა `<a href>`-ით.** ფაილი **პრივატულ
 * დისკზეა**, ე.ი. `/storage/*` მას ვერ ხედავს — ერთადერთი გზა API-ის
 * მისამართია, რომელსაც სესიის ქუქი სჭირდება (`FileViewer`-ის იგივე წესი).
 */
export async function downloadBackup(backup: Backup): Promise<void> {
  const res = await api.get(`/admin/backups/${backup.id}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backup.name ?? `backup-${backup.id}.sql`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
