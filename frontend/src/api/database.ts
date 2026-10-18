import { isAxiosError } from 'axios'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/dates'

/* ============================================================
   **„ბაზა" — ცხრილების რუკა და ექსპორტი** (სუპერადმინი).

   ⚠️ ჩამოტვირთვა `blob`-ია, ე.ი. შეცდომის სხეულიც ბლობად მოდის — მანქანური
   კოდი (`unknown_table`, `mysqldump_unavailable`) JSON-ად გადაიკითხება, თორემ
   `errorMessage()` მას ვერ დაინახავდა და „დაფიქსირდა შეცდომა" დარჩებოდა.
   ============================================================ */

export interface DatabaseTable {
  table: string
  /** მოდულის გასაღები · `shared:<ჯგუფი>` · `system` */
  owner: string
  rows: number
  bytes: number | null
  /** პაროლის ჰეშები, გასაღებები, სესიები */
  sensitive: boolean
  /** „ამასთან ერთად საჭიროა" (`ModuleTables::requires()`, თავის გარეშე) */
  requires: string[]
}

export interface DatabaseTables {
  data: DatabaseTable[]
  /** მოდულების რიგი (`ModuleTables::MODULES`) — ჯგუფების დალაგებისთვის */
  modules: string[]
  sql_available: boolean
}

export type DatabaseFormat = 'json' | 'sql'

export async function fetchDatabaseTables(): Promise<DatabaseTables> {
  const { data } = await api.get('/admin/database/tables')
  return data
}

export async function downloadDatabase(tables: string[], format: DatabaseFormat): Promise<void> {
  let blob: Blob
  try {
    const res = await api.post('/admin/database/export', { tables, format }, { responseType: 'blob' })
    blob = res.data as Blob
  } catch (e) {
    if (isAxiosError(e) && e.response?.data instanceof Blob) {
      try {
        e.response.data = JSON.parse(await e.response.data.text())
      } catch {
        // სხეული JSON არ იყო — შეცდომა ისე რჩება
      }
    }
    throw e
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mediary-database-${formatDate(new Date(), 'iso')}.${format === 'sql' ? 'sql.gz' : 'zip'}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ---------- JSON-ის ZIP-ით ცხრილების ჩანაცვლება ---------- */

/** არქივის ერთი ცხრილი */
export interface DatabaseImportTable {
  table: string
  /** რიგები არქივში (`manifest.json`) */
  rows: number
  /** ბაზაში ასეთი ცხრილი არის? */
  exists: boolean
  /** `users` და ინფრასტრუქტურა — ჩანაცვლება აკრძალულია */
  blocked: boolean
  owner: string
  /** „ამასთან ერთად საჭიროა" — მხოლოდ ისინი, რაც არქივშია */
  requires: string[]
  /** არქივის სვეტები, რომლებიც ბაზაში აღარ არის (ჩაწერისას იკარგება) */
  dropped_columns: string[]
  /** ბაზის სვეტები, რომლებიც არქივში არ არის (ნაგულისხმევით ივსება) */
  missing_columns: string[]
}

export interface DatabaseImportInspect {
  token: string
  created_at: string | null
  driver: string | null
  tables: DatabaseImportTable[]
}

export interface DatabaseReplaceResult {
  data: Record<string, { deleted: number; inserted: number; dropped_columns: string[] }>
  safety_backup_id: number
}

export async function inspectDatabaseImport(file: File): Promise<DatabaseImportInspect> {
  const body = new FormData()
  body.append('file', file)
  const { data } = await api.post('/admin/database/import', body)
  return data
}

/** ⚠️ აკრეფილი `REPLACE` — სერვერი სხვა სიტყვას 422-ით აბრუნებს (`RESTORE`-ის წესი) */
export async function replaceDatabaseTables(token: string, tables: string[], confirm: string): Promise<DatabaseReplaceResult> {
  const { data } = await api.post(`/admin/database/import/${token}`, { tables, confirm })
  return data
}

export async function discardDatabaseImport(token: string): Promise<void> {
  await api.delete(`/admin/database/import/${token}`)
}
