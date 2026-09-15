import axios from 'axios'
import i18n from '@/i18n'
import { formatBytes } from '@/lib/utils'

/**
 * backend-ის მანქანური კოდები, რომლებსაც ადამიანური ტექსტი სჭირდება.
 * ⚠️ ახალი კოდის დამატებისას `errors.*` ორივე ენაზე ჩაწერე.
 */
const CODES = [
  'storage_quota_exceeded',
  // 2026-09-14 — **სერვერის** ჭერი ერთ მოთხოვნაზე (`php.ini`), და არა კვოტა:
  // ⚠️ ორი სრულიად სხვადასხვა ზღვარია და ერთ ტექსტში რომ შერეულიყო,
  // „ადგილი აღარ გაქვს" დაეწერებოდა იმას, ვისაც ადგილი ბევრი აქვს
  'upload_too_large',
  // 17.4 — ლიმიტის გაზრდის მოთხოვნის უარყოფის მიზეზები
  'storage_request_pending',
  'storage_request_not_an_increase',
  'storage_request_out_of_range',
  // §17.2 — მოდულის ცალკე ლიმიტი; საერთო კვოტისგან **განზრახ** ცალკეა,
  // რადგან user-ის ქმედება სხვაა (ლიმიტი თვითონ დააყენა)
  'module_quota_exceeded',
  'allocation_exceeds_quota',
  // §14 — BoardGameGeek Cloudflare-ის უკან დგას და შეიძლება არ გაიხსნას
  'bgg_unavailable',
  'openlibrary_unavailable',
  // §11 — RAWG კლავიშს ითხოვს; მისი გარეშე წყარო „მიუწვდომელია"
  'rawg_unavailable',
  // §16.2 — დამთხვევა ორ **საჯარო** პროფილს შორის ითვლება
  'profile_not_public',
  'cannot_match_self',
  // §16.3 — ჩატი
  'chat_blocked',
  'cannot_chat_with_self',
  // §7.6 — SerpApi. ⚠️ **სამი სხვადასხვა მდგომარეობაა და სამივეს თავისი
  // ტექსტი აქვს**: ლიმიტი ამოიწურა (429) · წყარო/გასაღები არ არის (503) ·
  // ვიდეოს მისამართი YouTube-ისა არაა (422). „ვერაფერი ვიპოვე" კი საერთოდ
  // შეცდომა არ არის — ის 200-ია ცარიელი სიით.
  'serpapi_quota_exceeded',
  'serpapi_unavailable',
  /* ეტაპი 1 — მსახიობის ხელით მიბმა. ⚠️ ოთხივე სხვადასხვა მდგომარეობაა
     და ოთხივეს თავისი ტექსტი — „ვერ დაემატა" არცერთს ახსნის. */
  'cast_source_required',
  'cast_already_attached',
  'cast_limit_reached',
  'cast_member_not_found',
  'not_youtube',
  // §7.1 — ვიდეოს ლოკალური ჩამოწერა. ⚠️ **ორი სხვადასხვა ფაქტია**: `yt-dlp`
  // ამ მანქანაზე არ არის (503) და ჩამოწერა უკვე მიმდინარეობს (409).
  'ytdlp_unavailable',
  'download_already_running',
  /* §22 — ბაზის დამპი. ⚠️ **სამი სხვადასხვა მდგომარეობაა**: `mysqldump`
     ამ მანქანაზე არ არის (503) · ფონური პროცესი ვერ გაეშვა (503) ·
     ატვირთული ფაილი `.sql` არაა (422). სამივეზე „ვერ შესრულდა" იმ
     კითხვას ტოვებდა პასუხგაუცემელი, რომელიც მომხმარებელს აქვს. */
  'mysqldump_unavailable',
  'background_unavailable',
  'invalid_backup_file',
] as const

/**
 * backend-მა კონკრეტული მანქანური კოდი დააბრუნა?
 * იმ შემთხვევებისთვის, როცა UI-ს ცალკე მდგომარეობა სჭირდება და არა მხოლოდ toast
 * (მაგ. „წყარო მიუწვდომელია" vs „ვერაფერი მოიძებნა").
 */
export function isApiCode(e: unknown, code: string): boolean {
  return axios.isAxiosError(e) && (e.response?.data as { message?: string } | undefined)?.message === code
}

/** Laravel-ის ვალიდაციის შეცდომები → { field: firstMessage } */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!axios.isAxiosError(e)) return {}
  const errors = e.response?.data?.errors as Record<string, string[]> | undefined
  if (!errors) return {}
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0]]))
}

/** ერთი ადამიანური შეტყობინება (toast-ისთვის) */
export function errorMessage(e: unknown, fallback = 'შეცდომა'): string {
  if (!axios.isAxiosError(e)) return e instanceof Error ? e.message : fallback
  const data = e.response?.data as
    | { message?: string; errors?: Record<string, string[]>; [k: string]: unknown }
    | undefined
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  const message = first ?? data?.message ?? e.message ?? fallback

  // მანქანური კოდი → თარგმანი (17.3-ის კვოტის შეტყობინება ცხადი უნდა იყოს)
  if (!(CODES as readonly string[]).includes(message)) return message

  // ბაიტების ველები წაკითხად ფორმაში — თორემ „დარჩა 8388608" წერია
  const bytes = ['needed', 'remaining', 'quota'] as const
  const params = Object.fromEntries(
    bytes.filter((k) => typeof data?.[k] === 'number').map((k) => [k, formatBytes(data![k] as number)]),
  )

  /* ⚠️ `limit`/`file_limit` **სტრიქონებია** (`php.ini`-ის „256M") და არა
     ბაიტები — ისინი პირდაპირ გადადიან, თორემ `formatBytes` მათ გააფუჭებდა. */
  for (const key of ['limit', 'file_limit'] as const) {
    if (typeof data?.[key] === 'string') params[key] = data[key] as string
  }

  return i18n.t(`errors.${message}`, params)
}
