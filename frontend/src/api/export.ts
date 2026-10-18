import { isAxiosError } from 'axios'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/dates'

/* ============================================================
   „ჩემი მონაცემები" — მოდულის ჩანაწერების ექსპორტი.

   ⚠️ **ეს ატვირთული ფაილების არქივი არ არის.** `POST /storage/files/download`
   თვითონ **ფაილებს** ალაგებს (პოსტერები, დოკუმენტები, ფოტოები), აქ კი
   **ჩანაწერები** გადის — სათაური, სტატუსი, ჟანრი, ტეგები. ორივე საჭიროა
   და ისინი ერთმანეთს ავსებენ: CSV-ის `poster_path` ზუსტად იმ ფაილს
   უთითებს, რომელიც არქივშია.
   ============================================================ */

/** ერთი მოდული, რომლის ჩამოტვირთვაც შემიძლია */
export interface ExportModule {
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  color: string | null
  /** ჩემი ჩანაწერების რაოდენობა ამ მოდულში */
  count: number
  /** რამდენი სვეტი ექნება ფაილს */
  fields: number
}

export type ExportFormat = 'json' | 'csv'

export async function fetchExportModules(): Promise<{
  data: ExportModule[]
  formats: ExportFormat[]
}> {
  const res = await api.get('/export')
  return res.data
}

/**
 * ფაილის ჩამოტვირთვა.
 *
 * ⚠️ **ბლობად და არა `<a href>`-ით.** `/api/export/*` `auth:sanctum`-ის
 * უკანაა, ე.ი. ჩვეულებრივი ბმული ქუქის გარეშე წავიდოდა და მომხმარებელი
 * ფაილის ნაცვლად 401-ს ჩამოტვირთავდა — ზუსტად ის მიზეზი, რის გამოც
 * `downloadStorageFiles()` და `/backups`-ის ჩამოტვირთვაც ბლობს იყენებს.
 */
export async function downloadExport(module: string, format: ExportFormat): Promise<void> {
  const res = await api.get(`/export/${module}`, { params: { format }, responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  /* ⚠️ `formatDate(…, 'iso')` და არა `toISOString()`: ეს უკანასკნელი
     **UTC-ზე გადადის**, ე.ი. თბილისში 00:00–04:00 ფაილი გუშინდელი თარიღით
     დაინომრებოდა. სახელი backend-შიც იწერება — ეს მხოლოდ fallback-ია. */
  a.download = `mediary-${module.replace(/_/g, '-')}-${formatDate(new Date(), 'iso')}.${format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // ⚠️ ბლობი ხელით უნდა გათავისუფლდეს, თორემ ფაილი მეხსიერებაში რჩება
  URL.revokeObjectURL(url)
}

/**
 * **„ჩემი სრული ექსპორტი"**: ყველა მოდული ერთ ZIP-ში (JSON +
 * ფაილები) — ის, რასაც „იმპორტი" უკან შემოიტანს. `files: false` — მხოლოდ ჩანაწერები.
 *
 * ⚠️ შეცდომის სხეულიც ბლობად მოდის — კოდი (`export_failed`) JSON-ად გადაიკითხება,
 * თორემ `errorMessage()` მას ვერ დაინახავდა (`downloadDatabase()`-ის წესი).
 */
export async function downloadArchive(files: boolean): Promise<void> {
  let blob: Blob
  try {
    const res = await api.post('/export/archive', { files }, { responseType: 'blob' })
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
  a.download = `mediary-all-${formatDate(new Date(), 'iso')}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
