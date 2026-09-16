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

/* ---------- §11 — ასლის ვიუერი და ნაწილობრივი აღდგენა ---------- */

/**
 * ⚠️ **`scope` სამ პასუხს იძლევა და ეს არ არის გაფორმება**: `blocked`
 * ცხრილს ღილაკი საერთოდ არ უნდა ჰქონდეს, `warns` კი უნდა ამბობდეს,
 * რომელი ცხრილები დაზარალდება (კასკადები).
 */
export type RestoreScope = 'safe' | 'warns' | 'blocked'

export interface BackupTable {
  name: string
  scope: RestoreScope
  /** გახსნილ ვიუერში — ნამდვილი `COUNT(*)` */
  rows?: number
  /** გახსნის გარეშე — `INSERT` **განცხადებების** რაოდენობა, არა რიგებისა */
  inserts?: number
  bytes?: number
}

export interface BackupRows {
  columns: string[]
  data: Record<string, unknown>[]
  meta: {
    page: number
    per_page: number
    total: number
    scope: RestoreScope
    /** რომელი ცხრილები დაზარალდება ამის გასუფთავებაზე */
    children: { table: string; column: string; on_delete: string }[]
  }
}

/**
 * **ასლის გახსნა (§11.3).** დამპი **დროებით ბაზაში** იტვირთება.
 *
 * ⚠️ პატიოსანი ფასი: MySQL-ის დისკზე მონაცემის მეორე ასლი ჩნდება,
 * რომელსაც **კვოტა ვერ ხედავს** — ვიუერის დახურვა მას შლის.
 */
export async function inspectBackup(id: number): Promise<{ open: boolean; tables: BackupTable[] }> {
  const { data } = await api.post(`/admin/backups/${id}/inspect`)
  return data
}

export async function closeBackupInspect(id: number): Promise<void> {
  await api.delete(`/admin/backups/${id}/inspect`)
}

/** ⚠️ **გახსნის გარეშეც პასუხობს** — სია დამპის ერთი გავლიდან მოდის (§11.1) */
export async function fetchBackupTables(id: number): Promise<{ open: boolean; data: BackupTable[] }> {
  const { data } = await api.get(`/admin/backups/${id}/tables`)
  return data
}

export async function fetchBackupRows(
  id: number,
  params: { table: string; page?: number; per_page?: number; sort?: string; dir?: 'asc' | 'desc'; q?: string },
): Promise<BackupRows> {
  const { data } = await api.get(`/admin/backups/${id}/rows`, { params })
  return data
}

/**
 * **ერთი ცხრილის აღდგენა (§11.4).**
 *
 * ⚠️ **აკრეფილი სიტყვა ცხრილის საკუთარი სახელია და არა `RESTORE`**:
 * ღილაკიდან გადმოსაწერი სიტყვა ყოველთვის ერთი და იგივეა და თითს
 * ავტომატურად აკრეფინებს.
 */
export async function restoreBackupTable(
  id: number,
  table: string,
  confirm: string,
): Promise<{ deleted: number; inserted: number; safety_backup_id: number }> {
  /* ⚠️ **`confirm` აქ ავტომატურად არ ივსება.** თუ ეს ფუნქცია
     ცხრილის სახელს თვითონ გადამისცემდა, აკრეფა ფიქცია გახდებოდა
     — და backend-ის შემოწმება უაზროდ. აკრეფილი ტექსტი ინტერფეისიდან მოდის. */
  const { data } = await api.post(`/admin/backups/${id}/restore-table`, { table, confirm })
  return data
}

/**
 * **ერთი ჩანაწერის აღდგენა (§11.5).**
 *
 * ⚠️ backend `INSERT … ON DUPLICATE KEY UPDATE`-ს იყენებს და **არასდროს**
 * `REPLACE INTO`-ს: ის `DELETE`+`INSERT`-ია და კასკადებს ისვრის.
 */
export async function restoreBackupRow(
  id: number,
  table: string,
  key: Record<string, unknown>,
): Promise<{ restored: boolean }> {
  const { data } = await api.post(`/admin/backups/${id}/restore-row`, { table, key })
  return data
}
