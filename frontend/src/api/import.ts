import { api } from '@/lib/api'

/* ============================================================
   გარე სერვისის CSV-ის იმპორტი (FEAT-07).

   ⚠️ **ეს „ლინკების ბოტი" არ არის** (2026-09-05-ს სამუდამოდ მოხსნილი):
   იქ აპი თვითონ დაეძებდა ყურების ბმულებს უცხო საიტებზე; აქ მომხმარებელი
   თავისივე ექსპორტის ფაილს ტვირთავს და აპი მხოლოდ კითხულობს.

   ⚠️ **ორი ბიჯი, ზუსტად `/sync`-ის ფორმით**: გეგმა ერთი ატვირთვით მოდის,
   შესრულება კი თითო რიგზე თითო მოკლე რექვესთია — ე.ი. პროგრესი ჩანს,
   გაჩერება შესაძლებელია და `syncDelayMs`-ის პაუზაც მოქმედებს.
   ============================================================ */

/** ერთი ცნობადი ფორმატი */
export interface ImportSourceInfo {
  key: string
  label: string
  module: string
  /** ჩვენი ველები, რომლებიც ამ წყაროზე ცნობადია — რუკის ფორმას სჭირდება */
  columns: string[]
}

/** გეგმის ერთი რიგი — უკვე ნორმალიზებული, სერვერის მიერ */
export interface ImportPlanItem {
  line: number
  title: string
  year: number | null
  imdb_id: string | null
  isbn: string | null
  author: string | null
  external_id: string | null
  rating: number | null
  status: string | null
  done_at: string | null
  /** `new` — დაემატება · `duplicate` — უკვე მაქვს · `invalid` — ვერ წავიკითხე */
  state: 'new' | 'duplicate' | 'invalid'
}

export interface ImportPlan {
  source: string
  module: string
  headers: string[]
  /** ჩვენი ველი → ფაილის სვეტი */
  mapping: Record<string, string>
  items: ImportPlanItem[]
  counts: { new: number; duplicate: number; invalid: number }
  total: number
  /** ფაილი ჭერს გასცდა — სიაში ყველა რიგი არ არის */
  truncated: boolean
}

export async function fetchImportSources(): Promise<{ data: ImportSourceInfo[]; max_rows: number }> {
  const res = await api.get('/import/sources')
  return res.data
}

/**
 * ფაილი → გეგმა.
 *
 * ⚠️ **ფაილი სერვერზე არ ინახება**, ამიტომ რუკის შეცვლა იმავე ფაილის
 * ხელახალი გაგზავნაა — ის ბრაუზერში ისედაც ხელთაა. სანაცვლოდ არც დროებითი
 * საქაღალდეა, არც კვოტა და არც გასუფთავების ვადა.
 */
export async function planImport(
  file: File,
  source?: string,
  mapping?: Record<string, string>,
): Promise<ImportPlan> {
  const body = new FormData()
  body.append('file', file)
  if (source) body.append('source', source)
  Object.entries(mapping ?? {}).forEach(([field, column]) => {
    if (column) body.append(`mapping[${field}]`, column)
  })

  const res = await api.post('/import/plan', body)
  return res.data
}

export interface ImportItemResult {
  ok: boolean
  skipped: boolean
  error: string | null
  id: number | null
  title: string | null
}

export async function importRow(
  source: string,
  row: ImportPlanItem,
  signal?: AbortSignal,
): Promise<ImportItemResult> {
  const res = await api.post('/import/item', { source, row }, { signal })
  return res.data
}
