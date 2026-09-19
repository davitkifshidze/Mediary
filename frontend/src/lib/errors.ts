import axios from 'axios'
import i18n from '@/i18n'
import { formatBytes } from '@/lib/utils'

/**
 * backend-ის მანქანური კოდები, რომლებსაც ადამიანური ტექსტი სჭირდება.
 * ⚠️ ახალი კოდის დამატებისას `errors.*` ორივე ენაზე ჩაწერე — `errors.test.ts`
 * ამას ამოწმებს (ექსპორტი მხოლოდ მისთვისაა).
 *
 * ⚠️ **კოდი `'message' => '…'`-ის გარდა სამ ადგილიდანაც მოდის**, და
 * `grep`-ი მათ ვერ ხედავს (Tasks GAP-01): მრავალხაზიანი `abort_unless(…,
 * 422, 'code')`, `ChatService::fail('code')` და `['reason' => 'code']`,
 * რომელსაც კონტროლერი `message`-ად აბრუნებს (`GenreRemover`,
 * `AdminRequestController`). აუდიტის grep-ი 26-ს ითვლდა, რეალურად 39 აკლდა.
 */
export const CODES = [
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
  /* 2026-09-16 — ჩაკეტილი ალბომი. ⚠️ ორი კოდია და ორივე საჭიროა:
     `album_locked` მდგომარეობაა (ინტერფეისმა პაროლი უნდა ჰკითხოს),
     `album_password_wrong` კი მცდელობის შედეგი. */
  'album_locked',
  /* FEAT-04 — ⚠️ `album_locked`-ისგან **განსხვავებული მდგომარეობაა**: იქ
     პაროლი ჭირდება, აქ კი სწორი პაროლიც არ გადის — ცდა დროებით აკრძალულია. */
  'album_temporarily_locked',
  // §7.8 — ალბომის ლოკს ახლა **ანგარიშის** პაროლი ცვლის
  'account_password_wrong',
  'album_password_wrong',
  /* BUG-02 — გახსნილობა სერვერის სესიაშია, ე.ი. სესიის გარეშე ცდას შედეგი
     არ აქვს. ⚠️ ცალკე კოდია და არა `album_password_wrong`: პაროლი შეიძლება
     სწორიც იყოს, პრობლემა კლიენტშია. */
  'session_required',
  /* §9.5 — მასობრივი ცვლილება ადრე **ქართულ წინადადებებს** აბრუნებდა, ე.ი.
     422 ნედლად იხატებოდა და ენას არ მიჰყვებოდა. */
  /* FEAT-07 — ფაილის ფორმატი ვერ ვიცანით. ⚠️ **ცარიელი გეგმა არ გამოდგებოდა**:
     ის ეკრანზე „ფაილი ცარიელია"-დ იკითხება და მომხმარებელი სხვა ფაილს ეძებს
     იმის ნაცვლად, რომ წყარო ხელით აირჩიოს. */
  'import_source_unknown',
  'no_tags_given',
  'scope_required',
  // §10.7 — პინების ლიმიტი საუბარზე
  'pin_limit_reached',
  /* §11 — ასლის ვიუერი და ნაწილობრივი აღდგენა */
  'table_restore_blocked',
  'confirm_table_name',
  'backup_not_inspected',
  'table_not_in_backup',
  'row_not_in_backup',
  'table_has_no_primary_key',
  'row_key_incomplete',
  'safety_backup_failed',
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
  /* SEC-02/SEC-03 — ადმინ-ზონის ესკალაცია. ⚠️ **სამი სხვადასხვა ფაქტია**:
     შენზე მაღლა მდგომ ანგარიშს/როლს ან ადმინ-სექციების შემადგენლობას ეხები
     (403) · საკუთარ ანგარიშს სხვა როლს აძლევ (422) · საკუთარი როლის
     უფლებებს ცვლი (422). */
  'role_escalation',
  'cannot_change_own_role',
  'cannot_edit_own_role',
  /* GAP-01 — ქვემოთ ყველა კოდი toast-ში **snake_case-ად** ჩანდა, რადგან
     `errorMessage()` უცნობ კოდს სიტყვასიტყვით აბრუნებს. */
  // წვდომა და მოდულები. ⚠️ `module_disabled` და `module_not_enabled` ერთი
  // ფაქტია (`hasModule()` false) სხვადასხვა ადგილიდან — ტექსტიც ერთია
  'forbidden',
  'forbidden_permission',
  'module_not_enabled',
  'module_disabled',
  'module_not_granted',
  'module_inactive',
  'module_already_enabled',
  'module_not_shareable',
  'registration_disabled',
  // ადმინ-ზონა: მომხმარებლები, როლები, მოთხოვნები
  'cannot_delete_self',
  'cannot_disable_self',
  'last_super_admin',
  'system_role',
  'role_in_use',
  'already_reviewed',
  'unknown_type',
  'module_missing',
  'user_missing',
  /* ჟანრები. ⚠️ `approval_required` **202-ია და არა შეცდომა** — axios მას
     არასდროს აგდებს; სიაშია, რომ „backend-ის ყველა კოდი ⊆ CODES" წესს
     გამონაკლისი არ ჰქონდეს. */
  'approval_required',
  'genre_in_use',
  'invalid_reassign_target',
  'invalid_target_genre',
  /* GAP-09 — ლექსიკონის ერთეულის წაშლაზე განზრახვა ცხადი უნდა იყოს.
     ⚠️ ორი კოდია და ორივე საჭიროა: „არ თქვი, რა მოუვათ ჩანაწერებს" და
     „თავის თავზე გადატანა" სხვადასხვა შეცდომაა და სხვადასხვა ქმედება სჭირდება. */
  'move_target_required',
  'move_target_is_self',
  // მოთხოვნის ფორმა
  'not_found',
  'invalid_type',
  'nothing_selected',
  'file_not_found',
  // გალერეა
  'nothing_to_move',
  'cannot_move_into_itself',
  'primary_not_supported_for_cast',
  /* BUG-20 — მშობელს მთავარი სურათის სვეტი საერთოდ არ აქვს. ⚠️ მსახიობის
     კოდისგან ცალკეა: იქ მიზეზი გლობალური ლექსიკონია და ტექსტიც სხვაა. */
  'primary_not_supported',
  'too_many_videos',
  'invalid_url',
  /* GAP-02 — სესიის დასასრული. ⚠️ ორივე `bootstrap/app.php`-შია და არა
     `backend/app`-ში (Laravel-ის საკუთარი გამონაკლისების გადაბმა) — ე.ი.
     „ყველა კოდი ⊆ CODES"-ის სკანერი მხოლოდ `app/`-ს ვერ დასჯერდება.
     ⚠️ `unauthenticated` **419-ზე ხშირია**: ვადაგასული სესიის პირველი
     მოთხოვნა, როგორც წესი, ფონური poll-ია, ე.ი. GET — CSRF მას არ ეკითხება. */
  'csrf_token_mismatch',
  'unauthenticated',
  // წყაროები, თარგმანი, ფონური პარტია
  /* SEC-14 — TMDB-ის ცდომილება აღარ ბრუნდება გამონაკლისის ტექსტით:
     Guzzle მას **სრულ URL-ს** უწერს (`?api_key=…`), ე.ი. თითო timeout
     საერთო გასაღებს ნებისმიერ შესულ მომხმარებელს აჩვენებდა. */
  'tmdb_error',
  /* GAP-12 — TMDB-ის დანარჩენი მდგომარეობები. ⚠️ სამივე სხვადასხვაა:
     გასაღები არ არის (503) · საძებნი არაფერი მითხარი (422) · ვერ მოიძებნა (404). */
  'tmdb_not_configured',
  'lookup_query_required',
  'tmdb_not_found',
  /* ორივე `withMessages`-ით მოდის, ე.ი. `fieldErrors()`-საც სჭირდება —
     ველის ქვეით დახატული `account_disabled` ისევე გაუგებარი იქნებოდა. */
  'account_disabled',
  'current_password_wrong',
  'genre_name_required',
  'imdb_already_added',
  'title_required_either',
  /* ვიდეოს ლოკალური ჩამოწერა — `videos.download_error` სვეტში ინახება.
     ⚠️ yt-dlp-ის საკუთარი stderr კოდი არ არის, ამიტომ მას `translateCode()`
     ხელს არ აცდის — დიაგნოსტიკა სწორედ იმ ტექსტშია. */
  'download_timed_out',
  'download_no_file',
  'no_tmdb_id',
  'no_translation_source',
  'worker_unavailable',
  // დანარჩენი
  'custom_field_file_limit',
  'not_the_author',
  'invalid_status',
  'mode_not_supported_for_target',
  'backup_file_missing',
] as const

/**
 * backend-მა კონკრეტული მანქანური კოდი დააბრუნა?
 * იმ შემთხვევებისთვის, როცა UI-ს ცალკე მდგომარეობა სჭირდება და არა მხოლოდ toast
 * (მაგ. „წყარო მიუწვდომელია" vs „ვერაფერი მოიძებნა").
 */
export function isApiCode(e: unknown, code: string): boolean {
  return axios.isAxiosError(e) && (e.response?.data as { message?: string } | undefined)?.message === code
}

/**
 * შენახული ტექსტი, რომელიც მანქანური კოდიც შეიძლება იყოს (Tasks GAP-12).
 *
 * ⚠️ **შერეული სვეტი განზრახვაა**: `videos.download_error`-ში ან ჩვენი
 * კოდი ზის (`download_timed_out`), ან yt-dlp-ის საკუთარი stderr — ის
 * კოდი არ არის და უნდა დარჩეს: დიაგნოსტიკა სწორედ იმ ტექსტშია.
 */
export function translateCode(value?: string | null): string | null {
  if (!value) return null

  return (CODES as readonly string[]).includes(value) ? i18n.t(`errors.${value}`) : value
}

/**
 * Laravel-ის ვალიდაციის შეცდომები → { field: firstMessage }.
 *
 * ⚠️ **მანქანური კოდი ველის ჩანთშიც ითარგმნება** (Tasks GAP-12).
 * `ValidationException::withMessages(['login' => 'account_disabled'])` კოდს
 * **ორ ადგილას** წერს: `message`-ში (სადაც `errorMessage()` ხვდება)
 * და `errors`-ის ჩანთაში, სადაც ფორმა მას ველის გვერდით ხატავს —
 * თარგმნის გარეშე toast ქართულად ეწერებოდა, ველის ქვეით კი `account_disabled`.
 *
 * ⚠️ Laravel-ის საკუთარი ტექსტი (`required`, `max`…) აქ არ იცვლება —
 * ის უკვე ენაზეა გადათარგმნილი (`lang/ka` და `Accept-Language`).
 */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!axios.isAxiosError(e)) return {}
  const errors = e.response?.data?.errors as Record<string, string[]> | undefined
  if (!errors) return {}

  return Object.fromEntries(
    Object.entries(errors).map(([field, messages]) => {
      const first = messages[0]

      return [field, (CODES as readonly string[]).includes(first) ? i18n.t(`errors.${first}`) : first]
    }),
  )
}

/**
 * ერთი ადამიანური შეტყობინება (toast-ისთვის).
 * ⚠️ BUG-01 — fallback-ი **ყოველ გამოძახებაზე** ენიდან იკითხება (default
 * პარამეტრი გამოძახების მომენტში ფასდება), და არა ქართულ literal-ით.
 */
export function errorMessage(e: unknown, fallback: string = i18n.t('toast.error')): string {
  if (!axios.isAxiosError(e)) return e instanceof Error ? e.message : fallback

  /*
   * **პასუხი საერთოდ არ მოსულა** (Tasks GAP-02) — გათიშული ქსელი, ჩამქრალი
   * სერვერი, CORS. `e.message` აქ axios-ის ინგლისური „Network Error"-ია და
   * სიტყვასიტყვით მიდიოდა toast-ში UI-ს ენის მიუხედავად.
   *
   * ⚠️ **გაუქმებული მოთხოვნა ქსელის ჩავარდნა არ არის** და აქ ვერ მოხვდება.
   * `ERR_CANCELED`-საც ცარიელი `response` აქვს, მაგრამ ის მომხმარებლის
   * ქმედებაა: გლობალურ ძებნაში ყოველი აკრეფილი ასო წინა მოთხოვნას წყვეტს
   * (`api/search.ts`-ის `signal`), ხოლო რიგში „გაჩერება" ღილაკია — „შეამოწმე
   * ინტერნეტი" ორივეზე მოტყუება იქნებოდა. `ui/queue.tsx` მას ცალკე უკვე
   * კითხულობს.
   */
  if (!e.response && e.code !== 'ERR_CANCELED') return i18n.t('errors.network')

  const data = e.response?.data as
    | { message?: string; errors?: Record<string, string[]>; [k: string]: unknown }
    | undefined
  /* ⚠️ **ჯერ მანქანური კოდი, მერე ვალიდაციის ტექსტი** (Tasks BUG-14).
     ადრე `first`-ს ჰქონდა უპირატესობა, ე.ი. როცა პასუხს **ორივე** აქვს —
     `errors` ჩანთაც და მანქანური `message`-იც (`ValidationException`-ის
     ქვეკლასები, მაგ. კვოტის 413 ველის შეცდომასთან ერთად) — თარგმნადი კოდი
     იკარგებოდა და მომხმარებელი ლოკალიზებული ტექსტის ნაცვლად ვალიდატორის
     **ინგლისურ წინადადებას** იღებდა.

     ⚠️ ჩვეულებრივ ვალიდაციას ეს არ ეხება: Laravel-ის `ValidationException`
     `message`-ში **პირველივე შეცდომის ტექსტს** წერს, ე.ი. ის `CODES`-ში
     არ არის და ქვემოთა ჯაჭვი ისევ `first`-ს აბრუნებს. */
  const code =
    typeof data?.message === 'string' && (CODES as readonly string[]).includes(data.message)
      ? data.message
      : undefined

  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  const message = code ?? first ?? data?.message ?? e.message ?? fallback

  // მანქანური კოდი → თარგმანი (17.3-ის კვოტის შეტყობინება ცხადი უნდა იყოს)
  if (!code) return message

  // ბაიტების ველები წაკითხად ფორმაში — თორემ „დარჩა 8388608" წერია
  const bytes = ['needed', 'remaining', 'quota'] as const
  const params = Object.fromEntries(
    bytes.filter((k) => typeof data?.[k] === 'number').map((k) => [k, formatBytes(data![k] as number)]),
  )

  /* ⚠️ `limit`/`file_limit` **სტრიქონებია** (`php.ini`-ის „256M") და არა
     ბაიტები — ისინი პირდაპირ გადადიან, თორემ `formatBytes` მათ გააფუჭებდა.
     `permission` (`movie.update`) — GAP-01, `forbidden_permission`-ის ტექსტი. */
  for (const key of ['limit', 'file_limit', 'permission'] as const) {
    if (typeof data?.[key] === 'string') params[key] = data[key] as string
  }

  // ⚠️ რიცხვი, მაგრამ **არა ბაიტები** — `custom_field_file_limit`-ის ფაილების ჭერი
  if (typeof data?.max === 'number') params.max = String(data.max)

  return i18n.t(`errors.${message}`, params)
}
