import { api } from '@/lib/api'

/* ============================================================
   იმპორტი — მხოლოდ შენი მონაცემის ფაილებიდან (Tasks §59.6).

   Mediary-ის საკუთარი ექსპორტი: მოდულის JSON/CSV ან „ჩემი სრული ექსპორტის"
   ZIP — **დამატებით** (ახალი ემატება, არსებული გამოტოვდება). ⚠️ Letterboxd/
   IMDb/Goodreads/Steam-ის იმპორტი წაშლილია: ის TMDB-ზე და სხვა საიტებზე ეძებდა.

   ⚠️ **სამი ბიჯი, `/sync`-ის ფორმით**: გეგმა ფაილს ერთხელ ტვირთავს (სერვერი
   დროებით ინახავს — ZIP-ის ფაილებს ერთეულის ბიჯი სჭირდება), შესრულება კი
   თითო ჩანაწერზე თითო მოკლე მოთხოვნაა — პროგრესი ჩანს, გაჩერება შეიძლება.
   ============================================================ */

/**
 * ცნობადი წყაროები — `ImportSource::SOURCES`-ის სარკე (`RegistryConsistencyTest`).
 * ⚠️ Tasks §59.6 — მხოლოდ ერთი: Mediary-ის საკუთარი ექსპორტი.
 */
export const IMPORT_SOURCES = ['mediary'] as const

export interface ImportSourcesInfo {
  data: { key: string; label: string; formats: string[] }[]
  max_rows: number
  /** ზღვარი KB-ში (PHP-ის ჭერით): JSON/CSV და ZIP */
  limits: { file: number; archive: number }
}

/** გეგმის ერთი რიგი — სერვერის მიერ შემოწმებული */
export interface ImportPlanItem {
  /** რიგის ნომერი მოდულის ფაილში (0-დან) — ერთეულის ბიჯი მას აგზავნის */
  index: number
  title: string
  year: number | null
  /** `new` — დაემატება · `duplicate` — უკვე მაქვს / ფაილში ორჯერაა · `invalid` — ვერ ჩაიწერება */
  state: 'new' | 'duplicate' | 'invalid'
  /** `exists` · `in_trash` · `in_file` · `missing_title` · `missing_field` */
  reason: string | null
}

/** ფაილის ერთი მოდული */
export interface ImportPlanModule {
  /** ფაილის გასაღები — ერთეულის ბიჯი მას აგზავნის */
  source: string
  /** ჩემი მოდული (პირადი მოდული სახელით შეიძლება სხვა გასაღებზე დაჯდეს) */
  module: string | null
  /** რატომ ვერ შემოვა: `module_disabled` · `forbidden` · `custom_module_missing` · `module_unknown` */
  reason: string | null
  name_ka: string | null
  name_en: string | null
  total: number
  counts: { new: number; duplicate: number; invalid: number }
  items: ImportPlanItem[]
}

export interface ImportPlan {
  /** დროებითი ასლის გასაღები */
  token: string
  kind: 'json' | 'csv' | 'zip'
  name: string | null
  /** ZIP-ში რამდენი ფაილია */
  files: number
  truncated: boolean
  max_rows: number
  modules: ImportPlanModule[]
}

export async function fetchImportSources(): Promise<ImportSourcesInfo> {
  const res = await api.get('/import/sources')
  return res.data
}

/**
 * ფაილი → გეგმა. `module` — CSV-ის ორაზროვნებაზე (`import_module_ambiguous`:
 * სერიალი · ანიმე) შენი არჩევანი.
 */
export async function planImport(file: File, module?: string): Promise<ImportPlan> {
  const body = new FormData()
  body.append('file', file)
  if (module) body.append('module', module)

  const res = await api.post('/import/plan', body)
  return res.data
}

export interface ImportItemResult {
  ok: boolean
  skipped: boolean
  error: string | null
  id: number | null
  title: string | null
  module: string | null
}

export async function importItem(token: string, module: string, index: number, signal?: AbortSignal): Promise<ImportItemResult> {
  const res = await api.post('/import/item', { token, module, index }, { signal })
  return res.data
}

/** დროებითი ასლის წაშლა — „გაუქმება" */
export async function discardImport(token: string): Promise<void> {
  await api.delete(`/import/${token}`)
}
